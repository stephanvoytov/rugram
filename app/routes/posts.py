import os
import re
import time

from flask import render_template, flash, redirect, url_for, Blueprint, request, jsonify, abort, current_app, Response
from flask_login import login_required, current_user

from werkzeug.utils import secure_filename

from config import Config
from app.translations import _
from app.forms import PostForm
from app.services import PostService, NotificationService
from app.services.base import ServiceError, NotFoundError, ForbiddenError
from app.limiter import limiter
from app.routes.helpers import process_post_image
from extensions import csrf


posts_bp = Blueprint('posts', __name__, template_folder='../templates')


# ── Helpers ──

def _extract_tags(text: str | None) -> list[str]:
    """Extract unique hashtags from text (lowercase, deduplicated)."""
    if not text:
        return []
    tags = re.findall(r'(?<!\w)#(\w{1,32})', text)
    seen: set[str] = set()
    result: list[str] = []
    for tag in tags:
        t = tag.lower()
        if t not in seen:
            seen.add(t)
            result.append(t)
    return result


# ── CRUD ──

@posts_bp.route('/create', methods=['GET', 'POST'])
@login_required
@limiter.limit("10/minute", methods=["POST"])
def create_post() -> Response:
    form = PostForm()
    if form.validate_on_submit():
        image_filename = None
        if form.image.data:
            image = form.image.data
            filename = secure_filename(image.filename)
            unique_filename = f'{current_user.id}_{int(time.time())}_{filename}'

            os.makedirs(os.path.join(Config.UPLOAD_FOLDER, 'posts'), exist_ok=True)
            if process_post_image(image, unique_filename):
                image_filename = unique_filename

        tags = _extract_tags(form.text.data)
        try:
            post = PostService.create_post(
                author_id=current_user.id,
                text=form.text.data,
                image=image_filename,
                tag_names=tags,
            )
        except ServiceError as e:
            flash(e.message, 'danger')
            return render_template('posts/create_post.html', form=form, header='Создать публикацию')

        flash(_('Post published!'), 'success')
        return redirect(url_for('posts.get_post', post_id=post.id))

    return render_template('posts/create_post.html', form=form, header='Создать публикацию')


@posts_bp.route('/edit_post/<int:post_id>', methods=["GET", "POST"])
@login_required
def edit_post(post_id: int) -> Response:
    try:
        post = PostService.get_post(post_id)
    except NotFoundError:
        abort(404)

    if post.author_id != current_user.id:
        abort(404)

    form = PostForm(obj=post)

    if form.validate_on_submit():
        try:
            # Handle image upload (file processing, not business logic)
            if form.image.data:
                if post.image:
                    for fname in [post.image, f'thumb_{post.image}']:
                        old_path = os.path.join(Config.UPLOAD_FOLDER, 'posts', fname)
                        if os.path.exists(old_path):
                            os.remove(old_path)

                image = form.image.data
                if image.filename:
                    filename = secure_filename(image.filename)
                    unique_filename = f'{current_user.id}_{int(time.time())}_{filename}'

                    os.makedirs(os.path.join(Config.UPLOAD_FOLDER, 'posts'), exist_ok=True)
                    if process_post_image(image, unique_filename):
                        post.image = unique_filename

            tags = _extract_tags(form.text.data)
            PostService.edit_post(post_id, current_user.id, form.text.data, tags)
            flash(_('Post updated!'), 'success')
            return redirect(url_for('posts.get_post', post_id=post_id))

        except ServiceError as e:
            flash(e.message, 'danger')

    return render_template('posts/create_post.html', form=form, post=post, header='Редактировать публикацию')


@posts_bp.route('/post/<int:post_id>')
def get_post(post_id: int) -> Response:
    try:
        post = PostService.get_post_detail(post_id)
    except NotFoundError:
        abort(404)

    if post.is_deleted:
        abort(404)

    return render_template('posts/post.html', post=post)


# ── Likes ──

@posts_bp.route('/post/<int:post_id>/like', methods=['POST'])
@login_required
@limiter.limit("20/minute")
def like_post(post_id: int) -> Response:
    if not request.is_json:
        return jsonify({'error': 'Request must be JSON'}), 400

    try:
        result = PostService.toggle_like(post_id, current_user.id)
        return jsonify({
            'status': 'liked' if result['liked'] else 'unliked',
            'likes_count': result['likes_count'],
        })
    except NotFoundError as e:
        return jsonify({'error': e.message}), 404
    except ServiceError as e:
        return jsonify({'error': e.message}), e.status_code


# ── Reposts ──

@posts_bp.route('/post/<int:post_id>/repost', methods=['POST'])
@login_required
def toggle_repost(post_id: int) -> Response:
    try:
        result = PostService.toggle_repost(post_id, current_user.id)
        post = PostService.get_post(post_id)
        return jsonify({
            'status': 'reposted' if result['reposted'] else 'unreposted',
            'is_reposted': result['reposted'],
            'reposts_count': post.reposts_count,
        })
    except NotFoundError as e:
        return jsonify({'error': e.message}), 404
    except ServiceError as e:
        return jsonify({'error': e.message}), e.status_code


# ── Saves ──

@posts_bp.route('/post/<int:post_id>/save', methods=['POST'])
@login_required
def toggle_save(post_id: int) -> Response:
    try:
        result = PostService.toggle_save(post_id, current_user.id)
        return jsonify({
            'status': 'saved' if result['saved'] else 'unsaved',
            'is_saved': result['saved'],
        })
    except NotFoundError as e:
        return jsonify({'error': e.message}), 404
    except ServiceError as e:
        return jsonify({'error': e.message}), e.status_code


# ── Comments ──

@posts_bp.route('/post/<int:post_id>/comment', methods=['POST'])
@login_required
@limiter.limit("10/minute")
def add_comment(post_id: int) -> Response:
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'

    # Determine whether this is AJAX or form submission
    if is_ajax:
        data = request.get_json() if request.is_json else request.form
        text = data.get('text', '').strip()
    else:
        text = request.form.get('text', '').strip()

    if not text:
        if is_ajax:
            return jsonify({'error': 'Текст комментария не может быть пустым'}), 400
        flash(_('Comment text cannot be empty'), 'danger')
        return redirect(url_for('posts.get_post', post_id=post_id))

    try:
        comment = PostService.add_comment(post_id, current_user.id, text)
    except NotFoundError:
        if is_ajax:
            return jsonify({'error': 'Post not found'}), 404
        abort(404)
    except ServiceError as e:
        if is_ajax:
            return jsonify({'error': e.message}), e.status_code
        flash(e.message, 'danger')
        return redirect(url_for('posts.get_post', post_id=post_id))

    if is_ajax:
        return jsonify({
            'status': 'success',
            'comment': {
                'id': comment.id,
                'text': comment.text,
                'created_date': comment.created_date.isoformat(),
                'author': {
                    'id': current_user.id,
                    'username': current_user.username,
                    'profile_image': current_user.profile_image,
                },
            },
            'comments_count': comment.post.comments_count,
        })

    flash(_('Comment added'), 'success')
    return redirect(url_for('posts.get_post', post_id=post_id))


@posts_bp.route('/comment/<int:comment_id>', methods=['DELETE'])
@login_required
def delete_comment(comment_id: int) -> Response:
    try:
        _, comments_count = PostService.delete_comment(comment_id, current_user.id)
    except NotFoundError:
        return jsonify({'error': 'Comment not found'}), 404
    except ForbiddenError:
        return jsonify({'error': 'Недостаточно прав'}), 403

    return jsonify({'status': 'deleted', 'comments_count': comments_count})


@posts_bp.route('/comment/<int:comment_id>/edit', methods=['POST'])
@login_required
def edit_comment(comment_id: int) -> Response:
    data = request.get_json()
    text = data.get('text', '')

    try:
        comment = PostService.edit_comment(comment_id, current_user.id, text)
    except NotFoundError:
        return jsonify({'error': 'Comment not found'}), 404
    except ForbiddenError:
        return jsonify({'error': 'Недостаточно прав'}), 403
    except ServiceError:
        return jsonify({'error': 'Комментарий не может быть пустым'}), 400

    return jsonify({
        'status': 'success',
        'comment': {
            'id': comment.id,
            'text': comment.text,
        },
    })


# ── Post deletion ──

@posts_bp.route('/delete/<int:post_id>', methods=['DELETE'])
@login_required
def delete_post(post_id: int) -> Response:
    try:
        PostService.delete_post(post_id, current_user.id)
        return jsonify({'success': True})
    except NotFoundError:
        return jsonify({'error': 'Post not found'}), 404
    except ForbiddenError:
        return jsonify({'error': 'Недостаточно прав'}), 403
