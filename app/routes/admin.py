"""Admin panel blueprint — управление пользователями, постами, тегами."""

import logging
from functools import wraps

from flask import render_template, flash, redirect, url_for, Blueprint, request, jsonify, Response, abort
from flask_login import login_required, current_user

from app.translations import _
from app.models import User, Post, Tag, Like, Comment, Follow, utcnow
from extensions import db

logger = logging.getLogger(__name__)

admin_bp = Blueprint('admin', __name__, template_folder='../templates', url_prefix='/admin')


def admin_required(f):
    """Decorator: требует прав администратора."""
    @wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        if not current_user.is_admin:
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'error': 'Forbidden'}), 403
            abort(403)
        return f(*args, **kwargs)
    return decorated


# ── Dashboard ──

@admin_bp.route('/')
@admin_required
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
    return render_template('admin/dashboard.html', stats=stats)


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
    user.is_admin = not user.is_admin
    db.session.commit()
    flash(f'Admin {"granted" if user.is_admin else "revoked"} for {user.username}', 'success')
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
    username = user.username
    db.session.delete(user)
    db.session.commit()
    flash(f'User {username} deleted', 'success')
    return redirect(url_for('admin.users', page=request.args.get('page', 1)))


# ── Posts ──

@admin_bp.route('/posts')
@admin_required
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
@admin_required
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
@admin_required
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
@admin_required
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
@admin_required
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
