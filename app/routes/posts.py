import os
import time
import logging

from flask import render_template, flash, redirect, url_for, Blueprint, request, jsonify, abort, current_app, Response
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename

from config import Config
from app.translations import _
from app.forms import PostForm
from app.models import User, Post, Like, Comment, Follow, Notification, SavedPost, Repost, utcnow
from app.push import send_notification_push
from extensions import db, csrf
from app.routes.helpers import logger, process_post_image, _create_notification_and_push

posts_bp = Blueprint('posts', __name__, template_folder='../templates')


@posts_bp.route('/create', methods=['GET', 'POST'])
@login_required
def create_post() -> Response:
    form = PostForm()
    if form.validate_on_submit():
        post = Post(
            text=form.text.data,
            author_id=current_user.id
        )

        if form.image.data:
            image = form.image.data
            filename = secure_filename(image.filename)
            unique_filename = f'{current_user.id}_{int(time.time())}_{filename}'

            os.makedirs(os.path.join(Config.UPLOAD_FOLDER, 'posts'), exist_ok=True)
            if process_post_image(image, unique_filename):
                post.image = unique_filename

        db.session.add(post)
        db.session.commit()

        flash(_('Post published!'), 'success')
        return redirect(url_for('posts.get_post', post_id=post.id))

    return render_template('posts/create_post.html', form=form, header='Создать публикацию')


@posts_bp.route('/edit_post/<int:post_id>', methods=["GET", "POST"])
@login_required
def edit_post(post_id: int) -> Response:
    post = Post.query.filter(Post.id == post_id, Post.author == current_user).first_or_404()
    form = PostForm(obj=post)

    if form.validate_on_submit():
        try:
            post.text = form.text.data

            if form.image.data:
                if post.image:
                    # Удаляем старые файлы (полный + превью)
                    for fname in [post.image, f'thumb_{post.image}']:
                        old_path = os.path.join(Config.UPLOAD_FOLDER, 'posts', fname)
                        if os.path.exists(old_path):
                            os.remove(old_path)

                image = form.image.data
                if image.filename:
                    filename = secure_filename(image.filename)
                    unique_filename = f'{current_user.id}_{int(time.time())}_{filename}'

                    os.makedirs(os.path.join(Config.UPLOAD_FOLDER, 'posts'), exist_ok=True)
                    process_post_image(image, unique_filename)
                    post.image = unique_filename

            db.session.commit()
            flash(_('Post updated!'), 'success')
            return redirect(url_for('posts.get_post', post_id=post.id))

        except Exception as e:
            db.session.rollback()
            flash(_('Error updating post'), 'danger')

    return render_template('posts/create_post.html', form=form, post=post, header='Редактировать публикацию')


@posts_bp.route('/post/<int:post_id>')
def get_post(post_id: int) -> Response:
    post = Post.query.filter(Post.id == post_id, Post.is_deleted == False).first()
    if post:
        return render_template('posts/post.html', post=post)
    return abort(404, description='Пост не найден')


@posts_bp.route('/post/<int:post_id>/like', methods=['POST'])
@csrf.exempt
@login_required
def like_post(post_id: int) -> Response:
    if not request.is_json:
        return jsonify({'error': 'Request must be JSON'}), 400

    post = Post.query.filter(Post.id == post_id, Post.is_deleted == False).first()
    if not post:
        return jsonify({'error': 'Post not found'}), 404
    existing_like = Like.query.filter_by(
        user_id=current_user.id,
        post_id=post_id
    ).first()

    if existing_like:
        db.session.delete(existing_like)
        db.session.query(Post).filter_by(id=post_id).update(
            {'likes_count': Post.likes_count - 1},
            synchronize_session=False
        )
        db.session.commit()
        db.session.refresh(post)
        return jsonify({
            'status': 'unliked',
            'likes_count': post.likes_count
        })

    new_like = Like(
        user_id=current_user.id,
        post_id=post_id
    )
    db.session.add(new_like)
    db.session.query(Post).filter_by(id=post_id).update(
        {'likes_count': Post.likes_count + 1},
        synchronize_session=False
    )

    # Создаем уведомление для автора поста
    if post.author_id != current_user.id:
        _create_notification_and_push(user_id=post.author_id, actor_id=current_user.id, type_='like', post_id=post_id)

    db.session.commit()
    db.session.refresh(post)

    # Push-уведомление (после коммита)
    if post.author_id != current_user.id:
        try:
            send_notification_push(post.author_id, current_user.username, 'like', post_id)
        except Exception:
            logger.warning('push notification failed')

    return jsonify({
        'status': 'liked',
        'likes_count': post.likes_count
    })


@posts_bp.route('/post/<int:post_id>/repost', methods=['POST'])
@csrf.exempt
@login_required
def toggle_repost(post_id: int) -> Response:
    post = Post.query.filter(Post.id == post_id, Post.is_deleted == False).first()
    if not post:
        return jsonify({'error': 'Post not found'}), 404
    existing = Repost.query.filter_by(
        user_id=current_user.id,
        post_id=post_id
    ).first()

    if existing:
        db.session.delete(existing)
        db.session.query(Post).filter_by(id=post_id).update(
            {'reposts_count': Post.reposts_count - 1},
            synchronize_session=False
        )
        is_reposted = False
    else:
        repost = Repost(user_id=current_user.id, post_id=post_id)
        db.session.add(repost)
        db.session.query(Post).filter_by(id=post_id).update(
            {'reposts_count': Post.reposts_count + 1},
            synchronize_session=False
        )
        is_reposted = True

        # Уведомление автору поста
        if post.author_id != current_user.id:
            _create_notification_and_push(user_id=post.author_id, actor_id=current_user.id, type_='repost', post_id=post_id)

    db.session.commit()
    db.session.refresh(post)

    # Push-уведомление
    if is_reposted and post.author_id != current_user.id:
        try:
            send_notification_push(post.author_id, current_user.username, 'repost', post_id)
        except Exception:
            logger.warning('push notification failed')

    return jsonify({
        'status': 'reposted' if is_reposted else 'unreposted',
        'is_reposted': is_reposted,
        'reposts_count': post.reposts_count
    })


@posts_bp.route('/post/<int:post_id>/save', methods=['POST'])
@csrf.exempt
@login_required
def toggle_save(post_id: int) -> Response:
    post = Post.query.filter(Post.id == post_id, Post.is_deleted == False).first()
    if not post:
        return jsonify({'error': 'Post not found'}), 404
    existing = SavedPost.query.filter_by(
        user_id=current_user.id,
        post_id=post_id
    ).first()

    if existing:
        db.session.delete(existing)
        is_saved = False
    else:
        saved = SavedPost(user_id=current_user.id, post_id=post_id)
        db.session.add(saved)
        is_saved = True

    db.session.commit()
    return jsonify({'status': 'saved' if is_saved else 'unsaved', 'is_saved': is_saved})


@posts_bp.route('/post/<int:post_id>/comment', methods=['POST'])
@csrf.exempt
@login_required
def add_comment(post_id: int) -> Response:
    post = Post.query.filter(Post.id == post_id, Post.is_deleted == False).first()
    if not post:
        return jsonify({'error': 'Post not found'}), 404

    # Проверяем, это AJAX-запрос или обычная форма
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        # Для AJAX-запросов
        data = request.get_json() if request.is_json else request.form
        text = data.get('text', '').strip()
    else:
        # Для обычных форм
        text = request.form.get('text', '').strip()

    if not text:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'error': 'Текст комментария не может быть пустым'}), 400
        flash(_('Comment text cannot be empty'), 'danger')
        return redirect(url_for('posts.get_post', post_id=post_id))

    new_comment = Comment(
        author_id=current_user.id,
        post_id=post_id,
        text=text
    )

    db.session.add(new_comment)
    db.session.query(Post).filter_by(id=post_id).update(
        {'comments_count': Post.comments_count + 1},
        synchronize_session=False
    )

    # Создаем уведомление для автора поста
    if post.author_id != current_user.id:
        _create_notification_and_push(user_id=post.author_id, actor_id=current_user.id, type_='comment', post_id=post_id)

    db.session.commit()
    db.session.refresh(post)

    # Push-уведомление (после коммита)
    if post.author_id != current_user.id:
        try:
            send_notification_push(post.author_id, current_user.username, 'comment', post_id)
        except Exception:
            logger.warning('push notification failed')

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({
            'status': 'success',
            'comment': {
                'id': new_comment.id,
                'text': new_comment.text,
                'created_date': new_comment.created_date.isoformat(),
                'author': {
                    'id': current_user.id,
                    'username': current_user.username,
                    'profile_image': current_user.profile_image
                }
            },
            'comments_count': post.comments_count
        })

    flash(_('Comment added'), 'success')
    return redirect(url_for('posts.get_post', post_id=post_id))


@posts_bp.route('/comment/<int:comment_id>', methods=['DELETE'])
@csrf.exempt
@login_required
def delete_comment(comment_id: int) -> Response:
    comment = Comment.query.get_or_404(comment_id)
    if comment.author_id != current_user.id:
        return jsonify({'error': 'Недостаточно прав'}), 403
    post = comment.post
    db.session.delete(comment)
    post.comments_count = max(0, post.comments_count - 1)
    db.session.commit()
    return jsonify({'status': 'deleted', 'comments_count': post.comments_count})


@posts_bp.route('/comment/<int:comment_id>/edit', methods=['POST'])
@csrf.exempt
@login_required
def edit_comment(comment_id: int) -> Response:
    comment = Comment.query.get_or_404(comment_id)
    if comment.author_id != current_user.id:
        return jsonify({'error': 'Недостаточно прав'}), 403

    data = request.get_json()
    text = data.get('text', '').strip()

    if not text:
        return jsonify({'error': 'Комментарий не может быть пустым'}), 400

    comment.text = text
    db.session.commit()

    return jsonify({
        'status': 'success',
        'comment': {
            'id': comment.id,
            'text': comment.text
        }
    })


@posts_bp.route('/delete/<int:post_id>', methods=['DELETE'])
@csrf.exempt
@login_required
def delete_post(post_id: int) -> Response:
    post = Post.query.get_or_404(post_id)

    if post.author_id != current_user.id:
        return jsonify({'error': 'Недостаточно прав'}), 403

    post.is_deleted = True
    db.session.commit()

    return jsonify({'success': True})
