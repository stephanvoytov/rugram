import json
import os
import threading

from flask import (
    Blueprint,
    Response,
    abort,
    current_app,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)
from flask_login import current_user, login_required, logout_user

from app.forms import ProfileForm
from app.limiter import limiter
from app.logger import log
from app.push import send_notification_push
from app.repositories.push_repository import PushRepository
from app.repositories.user_repository import UserRepository
from app.routes.helpers import (
    _require_chat_participant,
    is_allowed_image,
    process_avatar,
    process_chat_image,
)
from app.services import ChatService, FeedService, NotificationService, PostService, SocialService
from app.services.base import ForbiddenError, NotFoundError, ServiceError
from app.services.widget_service import (
    fetch_widget,
    get_config_schema,
    needs_refresh,
    validate_widget_config,
)
from app.translations import _

main_bp = Blueprint("main", __name__, template_folder="../templates")


@main_bp.route("/")
@main_bp.route("/index")
def index() -> Response:
    search_query = request.args.get("q", "").strip().lower()
    tag_filter = request.args.get("tag", "").strip().lower()
    sort_by = request.args.get("sort", "new").strip().lower()
    page = request.args.get("page", 1, type=int)
    per_page = current_app.config.get("POSTS_PER_PAGE", 15)
    followed_only = request.args.get("followed") == "1"

    pagination = FeedService.get_feed_page(
        user_id=current_user.id if current_user.is_authenticated else None,
        followed_only=followed_only,
        tag_filter=tag_filter,
        search_query=search_query,
        sort_by=sort_by,
        page=page,
        per_page=per_page,
    )

    # Trending tags for sidebar
    trending_tags = FeedService.get_trending_tags()

    if (
        request.headers.get("X-Requested-With") == "XMLHttpRequest"
        and request.args.get("ajax") == "1"
    ):
        return render_template("main/_posts.html", posts=pagination.items)

    return render_template(
        "main/index.html",
        posts=pagination.items,
        pagination=pagination,
        search_query=search_query,
        followed_only=followed_only,
        tag_filter=tag_filter,
        sort_by=sort_by,
        trending_tags=trending_tags,
    )


@main_bp.route("/profile/<user_id_or_username>")
def profile(user_id_or_username: str) -> Response:
    try:
        try:
            user = SocialService.get_user(int(user_id_or_username))
        except (ValueError, TypeError):
            user = SocialService.get_user_by_username(user_id_or_username)
    except NotFoundError:
        abort(404, description="Такого пользователя не существует")
    is_following = user.is_followed_by(current_user) if current_user.is_authenticated else False
    return render_template("main/profile.html", user=user, is_following=is_following)


@main_bp.route("/edit_profile", methods=["GET", "POST"])
@login_required
def edit_profile() -> Response:
    form = ProfileForm()

    if form.validate_on_submit():
        try:
            # Обновление описания
            current_user.description = form.description.data

            # Обработка аватара
            if form.profile_image.data:
                filename = process_avatar(form.profile_image.data)
                if filename:
                    current_user.profile_image = filename

            UserRepository.commit()
            flash(_("Profile updated!"), "success")
            return redirect(url_for("main.profile", user_id_or_username=current_user.username))

        except Exception:
            UserRepository.rollback()
            flash(_("Error updating profile"), "danger")

    elif request.method == "GET":
        form.description.data = current_user.description

    return render_template("main/edit_profile.html", form=form)


@main_bp.route("/follow/<username>", methods=["POST"])
@login_required
@limiter.limit("20/minute")
def follow_toggle(username: str) -> Response:
    try:
        # Look up target first for push notification and followers_count
        target = SocialService.get_user_by_username(username)
        result = SocialService.toggle_follow(current_user.id, username)
        followed = result["followed"]

        if followed:
            threading.Thread(
                target=send_notification_push,
                args=(target.id, current_user.id, "follow"),
                daemon=True,
            ).start()

        return jsonify(
            {
                "status": "followed" if followed else "unfollowed",
                "followers_count": target.followers_count,
            }
        )
    except NotFoundError:
        return jsonify({"error": "Пользователь не найден"}), 404
    except ServiceError as e:
        return jsonify({"error": e.message}), e.status_code


@main_bp.route("/followers/<username>")
def followers_page(username: str) -> Response:
    try:
        user = SocialService.get_user_by_username(username)
    except NotFoundError:
        abort(404)
    follows = UserRepository.get_followers(user.id)
    return render_template("main/followers.html", user=user, follows=follows)


@main_bp.route("/following/<username>")
def following_page(username: str) -> Response:
    try:
        user = SocialService.get_user_by_username(username)
    except NotFoundError:
        abort(404)
    follows = UserRepository.get_following(user.id)
    return render_template("main/following.html", user=user, follows=follows)


@main_bp.route("/saved")
@login_required
def saved_posts() -> Response:
    from app.repositories.post_repository import PostRepository

    page = request.args.get("page", 1, type=int)
    saved = PostRepository.get_saved_posts_query(current_user.id).paginate(
        page=page, per_page=current_app.config.get("POSTS_PER_PAGE", 15)
    )
    return render_template("main/saved.html", saved=saved)


@main_bp.route("/chat")
@login_required
def chat() -> Response:
    return render_template("main/chat.html")


# API endpoints for notifications
@main_bp.route("/api/v1/notifications/unread-count")
@login_required
def notifications_unread_count() -> Response:
    count = NotificationService.unread_count(current_user.id)
    return jsonify({"count": count})


@main_bp.route("/api/v1/notifications")
@login_required
def notifications_list() -> Response:
    """Get notifications for the current user (cursor-based pagination)."""
    cursor = request.args.get("cursor", None, type=int)
    limit = min(request.args.get("limit", 10, type=int) or 10, 50)

    notifications, next_cursor, has_more = NotificationService.get_notifications(
        current_user.id, cursor=cursor, limit=limit
    )

    return jsonify(
        {
            "notifications": [
                {
                    "id": n.id,
                    "type": n.type,
                    "actor": {
                        "id": n._actor.id,
                        "username": n._actor.username,
                        "profile_image": n._actor.profile_image,
                    }
                    if getattr(n, "_actor", None)
                    else None,
                    "post_id": n.post_id,
                    "text": n.text,
                    "is_read": n.is_read,
                    "created_date": n.created_date.isoformat(),
                }
                for n in notifications
            ],
            "cursor": next_cursor,
            "has_more": has_more,
            "limit": limit,
        }
    )


# API endpoint for saved posts (JSON, for terminal inline)
@main_bp.route("/api/v1/saved")
@login_required
def api_saved_posts() -> Response:
    """Get saved posts for the current user."""
    cursor = request.args.get("cursor", None, type=int)
    limit = min(request.args.get("limit", 15, type=int) or 15, 50)

    saved, next_cursor, has_more = PostService.get_saved_posts(
        current_user.id, cursor=cursor, limit=limit
    )

    return jsonify(
        {
            "posts": [
                {
                    "id": s.post.id,
                    "text": s.post.text,
                    "image": s.post.image,
                    "author": s.post.author.username,
                    "author_id": s.post.author_id,
                    "likes": s.post.likes_count,
                    "comments": s.post.comments_count,
                    "reposts": s.post.reposts_count,
                    "is_liked": s.post.is_liked_by(current_user)
                    if current_user.is_authenticated
                    else False,
                    "is_saved": True,
                    "time": s.post.created_date.isoformat(),
                    "saved_date": s.created_date.isoformat(),
                }
                for s in saved
            ],
            "cursor": next_cursor,
            "has_more": has_more,
            "limit": limit,
        }
    )


# API endpoint for feed (JSON, for terminal inline — independent from GUI DOM)
@main_bp.route("/api/v1/feed")
def api_feed() -> Response:
    """Public feed — list non-deleted posts (cursor-based pagination)."""
    cursor = request.args.get("cursor", None, type=int)
    limit = min(request.args.get("limit", 20, type=int) or 20, 100)

    posts, next_cursor, has_more = FeedService.get_feed(
        user_id=current_user.id if current_user.is_authenticated else None,
        cursor=cursor,
        limit=limit,
    )

    return jsonify(
        {
            "posts": [
                {
                    "id": p.id,
                    "text": p.text,
                    "image": p.image,
                    "author": p.author.username,
                    "author_id": p.author_id,
                    "author_image": p.author.profile_image,
                    "likes": p.likes_count,
                    "comments": p.comments_count,
                    "reposts": p.reposts_count,
                    "is_liked": p.is_liked_by(current_user)
                    if current_user.is_authenticated
                    else False,
                    "is_saved": p.is_saved_by(current_user)
                    if current_user.is_authenticated
                    else False,
                    "time": p.created_date.isoformat(),
                }
                for p in posts
            ],
            "cursor": next_cursor,
            "has_more": has_more,
            "limit": limit,
        }
    )


# API endpoint for followers list (JSON, for terminal inline)
@main_bp.route("/api/v1/followers/<username>")
@login_required
def api_followers(username: str) -> Response:
    user = UserRepository.get_by_username(username)
    if not user:
        return jsonify({"error": "User not found"}), 404
    follows = UserRepository.get_followers(user.id)
    return jsonify(
        {
            "users": [
                {
                    "id": f.follower.id,
                    "username": f.follower.username,
                    "profile_image": f.follower.profile_image,
                    "description": f.follower.description,
                    "is_online": f.follower.is_online,
                    "followed_at": f.created_date.isoformat(),
                }
                for f in follows
            ],
            "total": len(follows),
        }
    )


# API endpoint for following list (JSON, for terminal inline)
@main_bp.route("/api/v1/following/<username>")
@login_required
def api_following(username: str) -> Response:
    user = UserRepository.get_by_username(username)
    if not user:
        return jsonify({"error": "User not found"}), 404
    follows = UserRepository.get_following(user.id)
    return jsonify(
        {
            "users": [
                {
                    "id": f.followed.id,
                    "username": f.followed.username,
                    "profile_image": f.followed.profile_image,
                    "description": f.followed.description,
                    "is_online": f.followed.is_online,
                    "followed_at": f.created_date.isoformat(),
                }
                for f in follows
            ],
            "total": len(follows),
        }
    )


@main_bp.route("/notifications/mark-all-read", methods=["POST"])
@login_required
def notifications_mark_all_read() -> Response:
    NotificationService.mark_all_read(current_user.id)
    return jsonify({"status": "success"})


@main_bp.route("/notifications/<int:notification_id>/mark-read", methods=["POST"])
@login_required
def notification_mark_read(notification_id: int) -> Response:
    try:
        NotificationService.mark_read(notification_id, current_user.id)
        return jsonify({"status": "success"})
    except NotFoundError:
        abort(404)


@main_bp.route("/notifications")
@login_required
def notifications_page() -> Response:
    return render_template("main/notifications.html")


# Push-уведомления API
@main_bp.route("/api/v1/push/subscribe", methods=["POST"])
@login_required
def push_subscribe() -> Response:
    """Сохранить подписку на push-уведомления."""
    from app.repositories.push_repository import PushRepository

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON"}), 400

        subscription = data.get("subscription")
        if not subscription:
            return jsonify({"error": "Missing subscription"}), 400

        endpoint = subscription.get("endpoint")
        keys = subscription.get("keys", {})
        p256dh = keys.get("p256dh")
        auth = keys.get("auth")

        if not endpoint or not p256dh or not auth:
            return jsonify({"error": "Incomplete subscription"}), 400

        PushRepository.upsert(current_user.id, endpoint, p256dh, auth)
        return jsonify({"status": "subscribed"})

    except Exception as e:
        PushRepository.rollback()
        return jsonify({"error": str(e)}), 500


@main_bp.route("/api/v1/push/unsubscribe", methods=["POST"])
@login_required
def push_unsubscribe() -> Response:
    """Удалить подписку на push-уведомления."""
    from app.repositories.push_repository import PushRepository

    try:
        data = request.get_json()
        endpoint = data.get("endpoint") if data else None

        if endpoint:
            PushRepository.delete_by_endpoint(current_user.id, endpoint)
        else:
            PushRepository.delete_all_user(current_user.id)

        return jsonify({"status": "unsubscribed"})

    except Exception as e:
        PushRepository.rollback()
        return jsonify({"error": str(e)}), 500


# Chat routes
@main_bp.route("/chat/start/<username>", methods=["POST"])
@login_required
def chat_start(username: str) -> Response:
    try:
        result = ChatService.start_or_get_chat(current_user.id, username)
        return jsonify(result)
    except NotFoundError as e:
        return jsonify({"error": e.message}), 404
    except ServiceError as e:
        return jsonify({"error": e.message}), e.status_code
    except Exception:
        log.exception("chat_start failed")
        return jsonify({"error": "Internal server error"}), 500


@main_bp.route("/chat/<int:chat_id>/messages")
@login_required
def chat_messages(chat_id: int) -> Response:
    try:
        after = request.args.get("after", 0, type=int)
        before = request.args.get("before", 0, type=int)
        ts = request.args.get("ts", "", type=str)
        limit = min(request.args.get("limit", 50, type=int) or 50, 200)

        result = ChatService.get_messages(
            chat_id=chat_id,
            user_id=current_user.id,
            after=after,
            before=before,
            ts=ts,
            limit=limit,
        )

        # Enrich messages with author info (who is not available from service)
        other_user_info = result.get("other_user")
        for msg_list_key in ("messages", "updates"):
            for msg in result[msg_list_key]:
                if msg["author_id"] == current_user.id:
                    msg["author"] = {
                        "id": current_user.id,
                        "username": current_user.username,
                        "profile_image": current_user.profile_image,
                    }
                elif other_user_info:
                    msg["author"] = {
                        "id": other_user_info["id"],
                        "username": other_user_info["username"],
                        "profile_image": other_user_info["profile_image"],
                    }
                if msg.get("image"):
                    msg["image_url"] = url_for(
                        "main.chat_image", chat_id=chat_id, filename=msg["image"]
                    )

        return jsonify(result)

    except ForbiddenError:
        return jsonify({"error": "Access denied"}), 403


@main_bp.route("/chat/<int:chat_id>/send", methods=["POST"])
@login_required
@limiter.limit("60/minute")
def chat_send(chat_id: int) -> Response:
    try:
        text = None
        image_filename = None

        if request.content_type and "multipart/form-data" in request.content_type:
            # Multipart: может быть текст + файл
            text = request.form.get("text", "").strip()
            image_file = request.files.get("image")
            if image_file and image_file.filename:
                if not is_allowed_image(image_file.filename):
                    return jsonify({"error": _("Invalid file type")}), 400
                image_filename = process_chat_image(image_file)
                if not image_filename:
                    return jsonify({"error": _("Failed to process image")}), 400
        else:
            # JSON: только текст
            data = request.get_json(silent=True)
            if data:
                text = data.get("text", "").strip()

        if not text and not image_filename:
            return jsonify({"error": _("Message cannot be empty")}), 400

        msg = ChatService.send_message(
            chat_id, current_user.id, text=text, image_filename=image_filename
        )

        return jsonify(
            {
                "message": {
                    "id": msg.id,
                    "text": text or "",
                    "image": image_filename,
                    "image_url": url_for(
                        "main.chat_image", chat_id=chat_id, filename=image_filename
                    )
                    if image_filename
                    else None,
                    "created_date": msg.created_date.isoformat(),
                    "is_read": msg.is_read,
                    "edited_at": None,
                    "is_deleted": False,
                    "author": {
                        "id": current_user.id,
                        "username": current_user.username,
                        "profile_image": current_user.profile_image,
                    },
                }
            }
        )

    except ForbiddenError:
        return jsonify({"error": _("Access denied")}), 403
    except NotFoundError:
        abort(404)
    except ServiceError as e:
        return jsonify({"error": e.message}), e.status_code


@main_bp.route("/chat/<int:chat_id>/image/<filename>")
@login_required
def chat_image(chat_id: int, filename: str) -> Response:
    """Serve a chat image — requires login + chat participation.

    Tries new location (instance/uploads/chat/) first, then falls back
    to old location (uploads/chat/) for pre-migration images.
    """
    from config import Config as _Cfg

    _participant, err = _require_chat_participant(chat_id)
    if err:
        return err
    new_path = os.path.join(_Cfg.CHAT_UPLOAD_FOLDER, filename)
    if os.path.exists(new_path):
        return send_from_directory(_Cfg.CHAT_UPLOAD_FOLDER, filename)
    # Fallback to old location for pre-migration images
    old_path = os.path.join(_Cfg.OLD_CHAT_UPLOAD_FOLDER, filename)
    if os.path.exists(old_path):
        return send_from_directory(os.path.dirname(old_path), filename)
    abort(404)


@main_bp.route("/chat/<int:chat_id>/messages/<int:message_id>", methods=["PATCH"])
@login_required
def chat_edit_message(chat_id: int, message_id: int) -> Response:
    """Edit a message text (author only)."""
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": _("Invalid request")}), 400
        text = data.get("text", "").strip()
        if not text:
            return jsonify({"error": _("Message cannot be empty")}), 400

        msg = ChatService.edit_message(chat_id, message_id, current_user.id, text)

        return jsonify(
            {
                "message": {
                    "id": msg.id,
                    "text": text,
                    "image": msg.image,
                    "image_url": url_for("main.chat_image", chat_id=chat_id, filename=msg.image)
                    if msg.image
                    else None,
                    "created_date": msg.created_date.isoformat(),
                    "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
                    "is_read": msg.is_read,
                    "author": {
                        "id": current_user.id,
                        "username": current_user.username,
                        "profile_image": current_user.profile_image,
                    },
                }
            }
        )

    except ForbiddenError:
        return jsonify({"error": _("Access denied")}), 403
    except NotFoundError:
        abort(404)
    except ServiceError as e:
        return jsonify({"error": e.message}), e.status_code


@main_bp.route("/chat/<int:chat_id>/messages/<int:message_id>", methods=["DELETE"])
@login_required
def chat_delete_message(chat_id: int, message_id: int) -> Response:
    """Delete a message (author only)."""
    try:
        ChatService.delete_message(chat_id, message_id, current_user.id)
        return jsonify({"status": "deleted"})
    except ForbiddenError:
        return jsonify({"error": _("Access denied")}), 403
    except NotFoundError:
        abort(404)


@main_bp.route("/chat/<int:chat_id>/typing", methods=["POST"])
@login_required
def chat_typing(chat_id: int) -> Response:
    try:
        ChatService.set_typing(chat_id, current_user.id)
        return jsonify({"status": "ok"})
    except ForbiddenError:
        return jsonify({"error": "Access denied"}), 403


@main_bp.route("/api/v1/chat/list")
@login_required
def chat_list() -> Response:
    try:
        chats = ChatService.get_chat_list(current_user.id)
        return jsonify({"chats": chats})
    except Exception:
        log.exception("chat_list failed")
        return jsonify({"error": "Internal server error"}), 500


@main_bp.route("/api/v1/users/search")
def search_users() -> Response:
    query = request.args.get("q", "").strip().lower()
    if not query:
        return jsonify({"users": []})

    users = SocialService.search_users(query, limit=10)

    return jsonify(
        {
            "users": [
                {
                    "id": user.id,
                    "username": user.username,
                    "profile_image": user.profile_image,
                    "is_online": user.is_online,
                }
                for user in users
            ]
        }
    )


@main_bp.route("/api/v1/tags/search")
def tags_search() -> Response:
    """Автодополнение тегов (начинается с)."""
    query = request.args.get("q", "").strip().lower()
    tags = FeedService.search_tags(query, limit=10)
    return jsonify({"tags": [{"name": t.name, "post_count": t.post_count} for t in tags]})


@main_bp.route("/api/v1/tags/trending")
def tags_trending() -> Response:
    """Топ-10 популярных тегов."""
    tags = FeedService.get_trending_tags(limit=10)
    return jsonify({"tags": [{"name": t.name, "post_count": t.post_count} for t in tags]})


# ── Settings API ──────────────────────────────────────────────────────────────


@main_bp.route("/api/v1/settings/account", methods=["PATCH"])
@login_required
def settings_account() -> Response:
    """Update username, email, language. Requires current_password if changing login/email."""
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip().lower()
    email = data.get("email", "").strip()
    language = data.get("language", "")
    password = data.get("current_password", "")

    has_login_changes = (username and username != current_user.username) or (
        email and email != current_user.email
    )

    # Password required for login/email changes
    if has_login_changes and (not password or not current_user.check_password(password)):
        return jsonify({"error": _("Current password is incorrect")}), 401

    if username and username != current_user.username:
        if len(username) < 3 or len(username) > 20:
            return jsonify({"error": _("Username must be 3-20 characters")}), 400
        if not all(c.isascii() and (c.islower() or c.isdigit() or c == "_") for c in username):
            return jsonify({"error": _("Only a-z, 0-9, underscore")}), 400
        if UserRepository.username_exists(username):
            return jsonify({"error": _("This username is already taken")}), 409
        current_user.username = username

    if email and email != current_user.email:
        if UserRepository.email_exists(email):
            return jsonify({"error": _("This email is already registered")}), 409
        current_user.email = email

    if language in ("en", "ru"):
        session["lang"] = language

    UserRepository.commit()
    return jsonify({"ok": True})


@main_bp.route("/api/v1/settings/password", methods=["POST"])
@login_required
def settings_password() -> Response:
    """Change password. Requires current_password + new_password."""
    data = request.get_json(silent=True) or {}
    current_pw = data.get("current_password", "")
    new_pw = data.get("new_password", "")
    confirm_pw = data.get("confirm_password", "")

    if not current_pw or not current_user.check_password(current_pw):
        return jsonify({"error": _("Current password is incorrect")}), 401

    if not new_pw or len(new_pw) < 6:
        return jsonify({"error": _("Password must be at least 6 characters")}), 400

    if new_pw != confirm_pw:
        return jsonify({"error": _("Passwords do not match")}), 400

    current_user.set_password(new_pw)
    UserRepository.commit()
    return jsonify({"ok": True})


@main_bp.route("/api/v1/settings/notifications", methods=["PATCH"])
@login_required
def settings_notifications() -> Response:
    """Update notification preferences (push toggle + types)."""
    data = request.get_json(silent=True) or {}

    notif_enabled = data.get("notifications_enabled")
    if notif_enabled is not None:
        old_value = current_user.notifications_enabled
        current_user.notifications_enabled = bool(notif_enabled)
        if not current_user.notifications_enabled and old_value:
            PushRepository.delete_all_user(current_user.id)

    for field in ("notify_on_like", "notify_on_comment", "notify_on_follow", "notify_on_message"):
        val = data.get(field)
        if val is not None:
            setattr(current_user, field, bool(val))

    UserRepository.commit()
    return jsonify({"ok": True})


@main_bp.route("/api/v1/settings/delete-account", methods=["POST"])
@login_required
def settings_delete_account() -> Response:
    """Delete account. Requires password confirmation."""
    data = request.get_json(silent=True) or {}
    password = data.get("password", "")

    if not password or not current_user.check_password(password):
        return jsonify({"error": _("Password is incorrect")}), 401

    SocialService.delete_user_account(current_user.id)
    logout_user()
    return jsonify({"ok": True})


@main_bp.route("/settings")
@login_required
def settings() -> Response:
    """Render settings page (mutation via API endpoints above)."""
    return render_template("main/settings.html")


# ── Widgets API ─────────────────────────────────────────────────────────────


@main_bp.route("/api/v1/profile/widgets", methods=["GET"])
@login_required
def get_widgets() -> Response:
    """List user's widgets with fresh data (auto-refresh if cache is stale)."""
    from extensions import db

    widgets = current_user.widgets
    out = []
    for w in widgets:
        if w.enabled and needs_refresh(w):
            fetch_widget(w)
    db.session.commit()

    for w in widgets:
        data = json.loads(w.cached_data) if w.cached_data else None
        out.append(
            {
                "id": w.id,
                "type": w.widget_type,
                "config": json.loads(w.config) if w.config else {},
                "position": w.position,
                "enabled": w.enabled,
                "data": data,
                "cached_at": w.cached_at.isoformat() if w.cached_at else None,
            }
        )
    return jsonify(out)


@main_bp.route("/api/v1/profile/widgets", methods=["POST"])
@login_required
def add_widget() -> Response:
    """Add a new widget."""
    from app.models import ProfileWidget
    from extensions import db

    data = request.get_json(silent=True) or {}
    widget_type = data.get("type", "").strip()
    if widget_type not in ("lastfm", "weather", "steam"):
        return jsonify({"error": _("Invalid widget type")}), 400

    # Limits: max 1 per type, max 10 total
    if len(current_user.widgets) >= 10:
        return jsonify({"error": _("Maximum 10 widgets allowed")}), 400
    if any(w.widget_type == widget_type for w in current_user.widgets):
        return jsonify({"error": _("Widget type already added")}), 400

    config = data.get("config", {})
    schema = get_config_schema()
    required = [f["key"] for f in schema.get(widget_type, [])]
    for key in required:
        if not config.get(key, "").strip():
            return jsonify({"error": _("Missing required field: %(field)s", field=key)}), 400

    error = validate_widget_config(widget_type, config)
    if error is not None:
        return jsonify({"error": error}), 400

    max_pos = max((w.position for w in current_user.widgets), default=-1)

    widget = ProfileWidget(
        user_id=current_user.id,
        widget_type=widget_type,
        config=json.dumps(config),
        position=max_pos + 1,
    )
    db.session.add(widget)
    db.session.commit()

    fetch_widget(widget)
    db.session.commit()

    return jsonify({"ok": True, "id": widget.id}), 201


@main_bp.route("/api/v1/profile/widgets/<int:widget_id>", methods=["PATCH"])
@login_required
def update_widget(widget_id: int) -> Response:
    """Update widget config, position, or enabled state."""
    from extensions import db

    widget = next((w for w in current_user.widgets if w.id == widget_id), None)
    if not widget:
        return jsonify({"error": _("Widget not found")}), 404

    data = request.get_json(silent=True) or {}
    config = data.get("config")
    if config is not None:
        widget.config = json.dumps(config)
        fetch_widget(widget)

    position = data.get("position")
    if position is not None:
        widget.position = int(position)

    enabled = data.get("enabled")
    if enabled is not None:
        widget.enabled = bool(enabled)

    db.session.commit()
    return jsonify({"ok": True})


@main_bp.route("/api/v1/profile/widgets/<int:widget_id>", methods=["DELETE"])
@login_required
def delete_widget(widget_id: int) -> Response:
    """Remove a widget."""
    from extensions import db

    widget = next((w for w in current_user.widgets if w.id == widget_id), None)
    if not widget:
        return jsonify({"error": _("Widget not found")}), 404

    db.session.delete(widget)
    db.session.commit()
    return jsonify({"ok": True})


@main_bp.route("/api/v1/profile/widgets/refresh", methods=["POST"])
@login_required
def refresh_widgets() -> Response:
    """Force-refresh all enabled widgets."""
    from extensions import db

    for w in current_user.widgets:
        if w.enabled:
            fetch_widget(w)
    db.session.commit()
    return jsonify({"ok": True})


@main_bp.route("/api/v1/profile/widgets/schema", methods=["GET"])
def widget_schema() -> Response:
    """Return widget type config schema (no auth needed — only type definitions)."""
    return jsonify(get_config_schema())


@main_bp.route("/health")
def health() -> Response:
    """Лёгкий healthcheck для Docker — не грузит БД, возвращает 200."""
    return jsonify({"status": "ok"}), 200


@main_bp.route("/robots.txt")
def robots_txt() -> Response:
    """Serve robots.txt for SEO."""
    lines = [
        "User-agent: *",
        "Disallow: /api/v1/",
        "Disallow: /chat",
        "Disallow: /login",
        "Disallow: /register",
        "Disallow: /settings",
        "Disallow: /edit_profile",
        "Disallow: /notifications",
        "Disallow: /saved",
        "",
        f"Sitemap: {request.url_root}sitemap.xml",
    ]
    return Response("\n".join(lines), mimetype="text/plain")


@main_bp.route("/sitemap.xml")
def sitemap_xml() -> Response:
    """Generate dynamic sitemap.xml with posts and profiles."""
    from xml.dom import minidom
    from xml.etree.ElementTree import Element, SubElement, tostring

    from app.repositories.post_repository import PostRepository
    from app.repositories.user_repository import UserRepository

    base_url = request.url_root.rstrip("/")

    urlset = Element("urlset")
    urlset.set("xmlns", "http://www.sitemaps.org/schemas/sitemap/0.9")

    def add_url(loc, lastmod=None, priority="0.5", changefreq="weekly"):
        url_el = SubElement(urlset, "url")
        loc_el = SubElement(url_el, "loc")
        loc_el.text = loc
        if lastmod:
            lm_el = SubElement(url_el, "lastmod")
            lm_el.text = (
                lastmod.strftime("%Y-%m-%d") if hasattr(lastmod, "strftime") else str(lastmod)[:10]
            )
        pr_el = SubElement(url_el, "priority")
        pr_el.text = priority
        cf_el = SubElement(url_el, "changefreq")
        cf_el.text = changefreq

    # Main pages
    add_url(f"{base_url}/", priority="1.0", changefreq="daily")
    add_url(f"{base_url}/help", priority="0.6", changefreq="monthly")

    # Public profiles (users with at least one non-deleted post)
    users_with_posts = UserRepository.get_users_with_posts()
    for user in users_with_posts:
        posts = PostRepository.get_user_posts_query(user.id)
        last_post = posts.first()
        lastmod = last_post.created_date if last_post else None
        add_url(
            f"{base_url}/profile/{user.username}",
            lastmod=lastmod,
            priority="0.8",
            changefreq="weekly",
        )

    # All non-deleted posts
    posts = PostRepository.get_all_active_posts()
    for post in posts:
        add_url(
            f"{base_url}/post/{post.id}",
            lastmod=post.created_date,
            priority="0.9",
            changefreq="monthly",
        )

    # Pretty-print XML
    rough_string = tostring(urlset, encoding="unicode")
    dom = minidom.parseString(rough_string.encode("utf-8"))
    pretty_xml = dom.toprettyxml(indent="  ", encoding="utf-8")

    return Response(pretty_xml, mimetype="application/xml")


@main_bp.route("/tty/help")
def tty_help() -> Response:
    """Redirect to unified help page."""
    return redirect(url_for("main.help", _anchor="commands"))


@main_bp.route("/tty/vfs")
def tty_vfs() -> Response:
    """Redirect to unified help page."""
    return redirect(url_for("main.help", _anchor="filesystem"))


@main_bp.route("/about")
def about() -> Response:
    """Redirect to unified help page."""
    return redirect(url_for("main.help", _anchor="about"))


@main_bp.route("/help")
def help() -> Response:
    """Unified help page: about + commands + filesystem."""
    return render_template("main/help.html")


@main_bp.route("/terminal")
def terminal() -> Response:
    """Full-page terminal mode — no GUI overlay, separate URL."""
    return render_template("main/terminal.html")
