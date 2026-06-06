"""Admin panel blueprint."""

import datetime
from functools import wraps

from flask import (
    Blueprint,
    abort,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    url_for,
)
from flask_login import current_user, login_required

from app.models import Post, User, utcnow
from app.repositories.event_repository import EventRepository
from app.repositories.post_repository import PostRepository
from app.repositories.user_repository import UserRepository
from app.services import FeedService, PostService, SocialService
from app.services.base import NotFoundError, ServiceError

admin_bp = Blueprint("admin", __name__, template_folder="../templates", url_prefix="/admin")


def admin_required(f):
    """Decorator: требует прав администратора (полный доступ)."""

    @wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        if not current_user.is_admin:
            if request.headers.get("X-Requested-With") == "XMLHttpRequest":
                return jsonify({"error": "Forbidden"}), 403
            abort(403)
        return f(*args, **kwargs)

    return decorated


def mod_or_admin_required(f):
    """Decorator: требует прав модератора или администратора."""

    @wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        if not (current_user.is_admin or current_user.is_moderator):
            if request.headers.get("X-Requested-With") == "XMLHttpRequest":
                return jsonify({"error": "Forbidden"}), 403
            abort(403)
        return f(*args, **kwargs)

    return decorated


# ── Dashboard ──


@admin_bp.route("/")
@mod_or_admin_required
def dashboard():
    stats = {
        "users_total": UserRepository.count(),
        "users_today": UserRepository.get_users_today(),
        "posts_total": PostRepository.get_active_posts_count(),
        "likes_total": PostRepository.get_likes_count(),
        "comments_total": PostRepository.get_comments_count(),
        "follows_total": UserRepository.get_follows_count(),
        "tags_total": EventRepository.get_tag_count(),
    }

    # ── Данные для графиков ──
    today = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    days = [today - datetime.timedelta(days=i) for i in range(6, -1, -1)]
    day_labels = [d.strftime("%a") for d in days]
    day_strs = [d.strftime("%Y-%m-%d") for d in days]

    # Посты по дням
    posts_raw = PostService.get_post_counts_by_day(days[0])
    posts_by_day = dict(posts_raw)
    posts_chart = [posts_by_day.get(d, 0) for d in day_strs]

    # Пользователи по дням
    users_raw = SocialService.get_user_counts_by_day(days[0])
    users_by_day = dict(users_raw)
    users_chart = [users_by_day.get(d, 0) for d in day_strs]

    # Топ-10 тегов
    top_tags = FeedService.get_trending_tags(10)
    tags_labels = ["#" + t.name for t in top_tags][::-1]
    tags_data = [t.post_count for t in top_tags][::-1]

    chart_data = {
        "days": day_labels,
        "posts": posts_chart,
        "users": users_chart,
        "tags_labels": tags_labels,
        "tags_data": tags_data,
    }
    return render_template("admin/dashboard.html", stats=stats, chart=chart_data)


# ── Users ──


@admin_bp.route("/users")
@admin_required
def users():
    page = request.args.get("page", 1, type=int)
    q = request.args.get("q", "").strip()
    per_page = 30

    if q:
        query = UserRepository.search_users_by_keyword(q)
        pagination = query.order_by(User.created_date.desc()).paginate(page=page, per_page=per_page)
    else:
        pagination = UserRepository.get_all_paginated(page, per_page)

    return render_template("admin/users.html", users=pagination.items, pagination=pagination, q=q)


@admin_bp.route("/users/<int:user_id>/toggle-admin", methods=["POST"])
@admin_required
def toggle_admin(user_id):
    user = UserRepository.get(user_id)
    if not user:
        flash("User not found", "error")
        return redirect(url_for("admin.users"))
    if user.id == current_user.id:
        flash("Cannot change your own admin status", "error")
        return redirect(url_for("admin.users"))
    if user.is_admin and UserRepository.get_admin_count() <= 1:
        flash("Cannot revoke — at least one admin must remain", "error")
        return redirect(url_for("admin.users"))
    user.is_admin = not user.is_admin
    UserRepository.commit()
    flash(f"Admin {'granted' if user.is_admin else 'revoked'} for {user.username}", "success")
    return redirect(url_for("admin.users", page=request.args.get("page", 1)))


@admin_bp.route("/users/<int:user_id>/toggle-mod", methods=["POST"])
@admin_required
def toggle_moderator(user_id):
    user = UserRepository.get(user_id)
    if not user:
        flash("User not found", "error")
        return redirect(url_for("admin.users"))
    if user.id == current_user.id and user.is_moderator:
        flash("Cannot remove your own moderator status", "error")
        return redirect(url_for("admin.users"))
    user.is_moderator = not user.is_moderator
    UserRepository.commit()
    username = user.username
    flash(f"Moderator {'granted' if user.is_moderator else 'revoked'} for @{username}", "success")
    return redirect(url_for("admin.users", page=request.args.get("page", 1)))


@admin_bp.route("/users/<int:user_id>/delete", methods=["POST"])
@admin_required
def delete_user(user_id):
    user = UserRepository.get(user_id)
    if not user:
        flash("User not found", "error")
        return redirect(url_for("admin.users"))
    if user.id == current_user.id:
        flash("Cannot delete your own account", "error")
        return redirect(url_for("admin.users"))
    if user.is_admin and UserRepository.get_admin_count() <= 1:
        flash("Cannot delete — at least one admin must remain", "error")
        return redirect(url_for("admin.users"))
    username = user.username
    UserRepository.delete(user)
    UserRepository.commit()
    flash(f"User {username} deleted", "success")
    return redirect(url_for("admin.users", page=request.args.get("page", 1)))


# ── Posts ──


@admin_bp.route("/posts")
@mod_or_admin_required
def posts():
    page = request.args.get("page", 1, type=int)
    q = request.args.get("q", "").strip()
    per_page = 30

    if q:
        query = PostRepository.filter(Post.text.ilike(f"%{q}%"))
        pagination = query.order_by(Post.created_date.desc()).paginate(page=page, per_page=per_page)
    else:
        pagination = PostRepository.get_posts_paginated(page, per_page)

    return render_template("admin/posts.html", posts=pagination.items, pagination=pagination, q=q)


@admin_bp.route("/posts/<int:post_id>/delete", methods=["POST"])
@mod_or_admin_required
def delete_post(post_id):
    try:
        PostService.admin_delete_post(post_id)
        flash(f"Post #{post_id} deleted", "success")
    except NotFoundError:
        flash("Post not found", "error")
    return redirect(url_for("admin.posts", page=request.args.get("page", 1)))


@admin_bp.route("/posts/<int:post_id>/restore", methods=["POST"])
@mod_or_admin_required
def restore_post(post_id):
    try:
        PostService.admin_restore_post(post_id)
        flash(f"Post #{post_id} restored", "success")
    except NotFoundError:
        flash("Post not found", "error")
    except ServiceError as e:
        flash(e.message, "error")
    return redirect(url_for("admin.posts", page=request.args.get("page", 1)))


# ── Tags ──


@admin_bp.route("/tags")
@mod_or_admin_required
def tags():
    page = request.args.get("page", 1, type=int)
    q = request.args.get("q", "").strip()
    per_page = 50

    pagination = EventRepository.get_all_tags_paginated(page, per_page, search=q)
    return render_template("admin/tags.html", tags=pagination.items, pagination=pagination, q=q)


@admin_bp.route("/tags/<int:tag_id>/delete", methods=["POST"])
@mod_or_admin_required
def delete_tag(tag_id):
    tag = EventRepository.get_tag(tag_id)
    if not tag:
        flash("Tag not found", "error")
        return redirect(url_for("admin.tags"))
    name = tag.name
    EventRepository.delete_tag_hard(tag_id)
    flash(f"Tag #{name} deleted", "success")
    return redirect(url_for("admin.tags", page=request.args.get("page", 1)))


# ── System Events ──


@admin_bp.route("/events")
@admin_required
def events():
    page = request.args.get("page", 1, type=int)
    level = request.args.get("level", "")
    category = request.args.get("category", "")
    per_page = 50

    filters = {}
    if level:
        filters["level"] = level
    if category:
        filters["category"] = category
    pagination = EventRepository.paginate(page=page, per_page=per_page, **filters)

    counts = EventRepository.get_counts()

    return render_template(
        "admin/events.html",
        events=pagination.items,
        pagination=pagination,
        level=level,
        category=category,
        total=counts["total"],
        unread=counts["unread"],
        critical=counts["critical"],
        errors=counts["errors"],
    )


@admin_bp.route("/events/<int:event_id>/read", methods=["POST"])
@admin_required
def mark_event_read(event_id):
    event = EventRepository.mark_read(event_id)
    if not event:
        abort(404)
    return jsonify({"status": "ok"})


@admin_bp.route("/events/read-all", methods=["POST"])
@admin_required
def mark_all_events_read():
    EventRepository.mark_all_read()
    flash("All events marked as read", "success")
    return redirect(url_for("admin.events"))


# ── Structured logs (from file) ──


@admin_bp.route("/logs")
@admin_required
def logs_view():
    """Display recent structlog entries from the JSON log file."""
    import json as _json

    from app.logger import LOG_FILE

    entries = []
    if LOG_FILE.exists():
        with open(LOG_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        entries.append(_json.loads(line))
                    except _json.JSONDecodeError:
                        entries.append({"event": line, "level": "info"})

    # Show last 200 entries (newest first)
    entries.reverse()
    entries = entries[:200]

    level_filter = request.args.get("level", "").lower()
    q = request.args.get("q", "").lower().strip()

    if level_filter:
        entries = [e for e in entries if e.get("level", "").lower() == level_filter]
    if q:
        entries = [e for e in entries if q in _json.dumps(e).lower()]

    # Prettify timestamps
    for e in entries:
        ts = e.get("timestamp", "")
        if ts:
            try:
                e["_time"] = ts[11:19] if "T" in ts else ts
            except Exception:
                e["_time"] = ts

    return render_template("admin/logs.html", entries=entries, level=level_filter, q=q)
