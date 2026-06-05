"""Admin panel blueprint — управление пользователями, постами, тегами."""

import logging
import datetime
from functools import wraps
from collections import defaultdict

from flask import render_template, flash, redirect, url_for, Blueprint, request, jsonify, Response, abort
from flask_login import login_required, current_user
from sqlalchemy import func

from app.translations import _
from app.models import User, Post, Tag, Like, Comment, Follow, SystemEvent, utcnow
from app.routes.helpers import log_system_event
from extensions import db

logger = logging.getLogger(__name__)

admin_bp = Blueprint('admin', __name__, template_folder='../templates', url_prefix='/admin')


def admin_required(f):
    """Decorator: требует прав администратора (полный доступ)."""
    @wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        if not current_user.is_admin:
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'error': 'Forbidden'}), 403
            abort(403)
        return f(*args, **kwargs)
    return decorated


def mod_or_admin_required(f):
    """Decorator: требует прав модератора или администратора."""
    @wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        if not (current_user.is_admin or current_user.is_moderator):
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'error': 'Forbidden'}), 403
            abort(403)
        return f(*args, **kwargs)
    return decorated


# ── Dashboard ──

@admin_bp.route('/')
@mod_or_admin_required
def dashboard():
    stats = {
        'users_total': User.query.count(),
        'users_today': User.query.filter(
            User.created_date >= utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        ).count(),
        'posts_total': Post.query.filter(Post.is_deleted == False).count(),
        'likes_total': Like.query.count(),
        'comments_total': Comment.query.count(),
        'follows_total': Follow.query.count(),
        'tags_total': Tag.query.count(),
    }

    # ── Данные для графиков ──
    today = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    days = [today - datetime.timedelta(days=i) for i in range(6, -1, -1)]
    day_labels = [d.strftime('%a') for d in days]
    day_strs = [d.strftime('%Y-%m-%d') for d in days]

    # Посты по дням
    posts_raw = db.session.query(
        func.date(Post.created_date).label('day'),
        func.count(Post.id)
    ).filter(Post.created_date >= days[0]).group_by('day').all()
    posts_by_day = dict(posts_raw)
    posts_chart = [posts_by_day.get(d, 0) for d in day_strs]

    # Пользователи по дням
    users_raw = db.session.query(
        func.date(User.created_date).label('day'),
        func.count(User.id)
    ).filter(User.created_date >= days[0]).group_by('day').all()
    users_by_day = dict(users_raw)
    users_chart = [users_by_day.get(d, 0) for d in day_strs]

    # Топ-10 тегов
    top_tags = Tag.query.filter(Tag.post_count > 0) \
        .order_by(Tag.post_count.desc()).limit(10).all()
    tags_labels = ['#' + t.name for t in top_tags][::-1]
    tags_data = [t.post_count for t in top_tags][::-1]

    chart_data = {
        'days': day_labels,
        'posts': posts_chart,
        'users': users_chart,
        'tags_labels': tags_labels,
        'tags_data': tags_data,
    }
    return render_template('admin/dashboard.html', stats=stats, chart=chart_data)


# ── Users ──

@admin_bp.route('/users')
@admin_required
def users():
    page = request.args.get('page', 1, type=int)
    q = request.args.get('q', '').strip()
    per_page = 30

    query = User.query
    if q:
        like = f'%{q}%'
        query = query.filter(
            db.or_(User.username.ilike(like), User.email.ilike(like), User.name.ilike(like))
        )
    pagination = query.order_by(User.created_date.desc()).paginate(page=page, per_page=per_page)

    return render_template('admin/users.html', users=pagination.items, pagination=pagination, q=q)


@admin_bp.route('/users/<int:user_id>/toggle-admin', methods=['POST'])
@admin_required
def toggle_admin(user_id):
    user = db.session.get(User, user_id)
    if not user:
        flash('User not found', 'error')
        return redirect(url_for('admin.users'))
    if user.id == current_user.id:
        flash('Cannot change your own admin status', 'error')
        return redirect(url_for('admin.users'))
    # Нельзя снять админку с последнего админа
    if user.is_admin and User.query.filter(User.is_admin == True).count() <= 1:
        flash('Cannot revoke — at least one admin must remain', 'error')
        return redirect(url_for('admin.users'))
    user.is_admin = not user.is_admin
    db.session.commit()
    flash(f'Admin {"granted" if user.is_admin else "revoked"} for {user.username}', 'success')
    return redirect(url_for('admin.users', page=request.args.get('page', 1)))


@admin_bp.route('/users/<int:user_id>/toggle-mod', methods=['POST'])
@admin_required
def toggle_moderator(user_id):
    user = db.session.get(User, user_id)
    if not user:
        flash('User not found', 'error')
        return redirect(url_for('admin.users'))
    if user.id == current_user.id and user.is_moderator:
        flash('Cannot remove your own moderator status', 'error')
        return redirect(url_for('admin.users'))
    user.is_moderator = not user.is_moderator
    db.session.commit()
    username = user.username
    flash(f'Moderator {"granted" if user.is_moderator else "revoked"} for @{username}', 'success')
    return redirect(url_for('admin.users', page=request.args.get('page', 1)))


@admin_bp.route('/users/<int:user_id>/delete', methods=['POST'])
@admin_required
def delete_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        flash('User not found', 'error')
        return redirect(url_for('admin.users'))
    if user.id == current_user.id:
        flash('Cannot delete your own account', 'error')
        return redirect(url_for('admin.users'))
    # Нельзя удалить последнего админа
    if user.is_admin and User.query.filter(User.is_admin == True).count() <= 1:
        flash('Cannot delete — at least one admin must remain', 'error')
        return redirect(url_for('admin.users'))
    username = user.username
    db.session.delete(user)
    db.session.commit()
    flash(f'User {username} deleted', 'success')
    return redirect(url_for('admin.users', page=request.args.get('page', 1)))


# ── Posts ──

@admin_bp.route('/posts')
@mod_or_admin_required
def posts():
    page = request.args.get('page', 1, type=int)
    q = request.args.get('q', '').strip()
    per_page = 30

    query = Post.query
    if q:
        query = query.filter(Post.text.ilike(f'%{q}%'))
    pagination = query.order_by(Post.created_date.desc()).paginate(page=page, per_page=per_page)

    return render_template('admin/posts.html', posts=pagination.items, pagination=pagination, q=q)


@admin_bp.route('/posts/<int:post_id>/delete', methods=['POST'])
@mod_or_admin_required
def delete_post(post_id):
    post = db.session.get(Post, post_id)
    if not post:
        flash('Post not found', 'error')
        return redirect(url_for('admin.posts'))
    post.is_deleted = True
    db.session.commit()
    flash(f'Post #{post_id} deleted', 'success')
    return redirect(url_for('admin.posts', page=request.args.get('page', 1)))


@admin_bp.route('/posts/<int:post_id>/restore', methods=['POST'])
@mod_or_admin_required
def restore_post(post_id):
    post = db.session.get(Post, post_id)
    if not post:
        flash('Post not found', 'error')
        return redirect(url_for('admin.posts'))
    if not post.is_deleted:
        flash('Post is not deleted', 'error')
        return redirect(url_for('admin.posts'))
    post.is_deleted = False
    db.session.commit()
    flash(f'Post #{post_id} restored', 'success')
    return redirect(url_for('admin.posts', page=request.args.get('page', 1)))


# ── Tags ──

@admin_bp.route('/tags')
@mod_or_admin_required
def tags():
    page = request.args.get('page', 1, type=int)
    q = request.args.get('q', '').strip()
    per_page = 50

    query = Tag.query
    if q:
        query = query.filter(Tag.name.ilike(f'%{q}%'))
    pagination = query.order_by(Tag.post_count.desc()).paginate(page=page, per_page=per_page)

    return render_template('admin/tags.html', tags=pagination.items, pagination=pagination, q=q)


@admin_bp.route('/tags/<int:tag_id>/delete', methods=['POST'])
@mod_or_admin_required
def delete_tag(tag_id):
    tag = db.session.get(Tag, tag_id)
    if not tag:
        flash('Tag not found', 'error')
        return redirect(url_for('admin.tags'))
    name = tag.name
    db.session.delete(tag)
    db.session.commit()
    flash(f'Tag #{name} deleted', 'success')
    return redirect(url_for('admin.tags', page=request.args.get('page', 1)))


# ── System Events ──

@admin_bp.route('/events')
@admin_required
def events():
    page = request.args.get('page', 1, type=int)
    level = request.args.get('level', '')
    category = request.args.get('category', '')
    per_page = 50

    query = SystemEvent.query
    if level:
        query = query.filter(SystemEvent.level == level)
    if category:
        query = query.filter(SystemEvent.category == category)
    pagination = query.order_by(SystemEvent.created_date.desc()).paginate(page=page, per_page=per_page)

    # Counts for filter badges
    total = SystemEvent.query.count()
    unread = SystemEvent.query.filter(SystemEvent.is_read == False).count()
    critical = SystemEvent.query.filter(SystemEvent.level == 'critical').count()
    errors = SystemEvent.query.filter(SystemEvent.level == 'error').count()

    return render_template('admin/events.html',
                           events=pagination.items, pagination=pagination,
                           level=level, category=category,
                           total=total, unread=unread, critical=critical, errors=errors)


@admin_bp.route('/events/<int:event_id>/read', methods=['POST'])
@admin_required
def mark_event_read(event_id):
    event = db.session.get(SystemEvent, event_id)
    if not event:
        abort(404)
    event.is_read = True
    db.session.commit()
    return jsonify({'status': 'ok'})


@admin_bp.route('/events/read-all', methods=['POST'])
@admin_required
def mark_all_events_read():
    SystemEvent.query.filter(SystemEvent.is_read == False).update({'is_read': True})
    db.session.commit()
    flash('All events marked as read', 'success')
    return redirect(url_for('admin.events'))
