import os
import time
import datetime
import json

from PIL import Image

from flask import render_template, flash, redirect, url_for, Blueprint, request, jsonify, abort
from flask_login import login_user, login_required, logout_user, current_user
from werkzeug.utils import secure_filename

from config import Config
from app.forms import LoginForm, RegistrationForm, PostForm, ProfileForm, SettingsForm
from app.models import User, Post, Like, Comment, Follow, Notification, PushSubscription, Chat, ChatParticipant, Message, SavedPost, Repost, PushSubscription, utcnow
from app.crypto import encrypt, decrypt
from app.push import send_message_push, send_notification_push
from extensions import db

main_bp = Blueprint('main', __name__, template_folder='../templates')
auth_bp = Blueprint('auth', __name__, template_folder='../templates')
posts_bp = Blueprint('posts', __name__, template_folder='../templates')


def process_avatar(image_file):
    # Создаем квадратное изображение
    img = Image.open(image_file)

    if img.mode == 'RGBA':
        img = img.convert('RGB')

    # Определяем минимальную сторону
    min_size = min(img.size)

    # Обрезаем до квадрата (центрированно)
    img = img.crop((
        (img.width - min_size) // 2,
        (img.height - min_size) // 2,
        (img.width + min_size) // 2,
        (img.height + min_size) // 2
    ))

    # Приводим к нужному размеру
    img = img.resize((500, 500), Image.Resampling.LANCZOS)

    # Сохраняем
    filename = f"avatar_{current_user.id}.jpg"
    save_dir = os.path.join(Config.UPLOAD_FOLDER, 'profile_images')
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, filename)
    img.save(save_path, "JPEG", quality=85, optimize=True)

    return filename


def process_post_image(image_file, filename):
    """Сохраняет две версии изображения поста:
    - {filename} — ресайз до 1200px по ширине (для детальной страницы)
    - thumb_{filename} — ресайз до 400px (для ленты)
    """
    img = Image.open(image_file)
    if img.mode == 'RGBA':
        img = img.convert('RGB')

    # Полный размер: максимум 1200px по ширине
    img_full = img.copy()
    if img_full.width > 1200:
        ratio = 1200 / img_full.width
        img_full = img_full.resize((1200, int(img_full.height * ratio)), Image.Resampling.LANCZOS)

    save_path = os.path.join(Config.UPLOAD_FOLDER, 'posts', filename)
    img_full.save(save_path, 'JPEG', quality=85, optimize=True)

    # Превью: максимум 400px по ширине
    img_thumb = img.copy()
    if img_thumb.width > 400:
        ratio = 400 / img_thumb.width
        img_thumb = img_thumb.resize((400, int(img_thumb.height * ratio)), Image.Resampling.LANCZOS)

    thumb_filename = f'thumb_{filename}'
    thumb_path = os.path.join(Config.UPLOAD_FOLDER, 'posts', thumb_filename)
    img_thumb.save(thumb_path, 'JPEG', quality=80, optimize=True)

    return filename


@main_bp.route('/')
@main_bp.route('/index')
def index():
    search_query = request.args.get('q', '').strip().lower()
    page = request.args.get('page', 1, type=int)
    per_page = 15
    followed_only = request.args.get('followed') == '1'

    base_query = Post.query.filter(Post.is_deleted == False)

    if followed_only and current_user.is_authenticated:
        followed_ids = [f.followed_id for f in Follow.query.filter_by(follower_id=current_user.id).all()]
        followed_ids.append(current_user.id)
        base_query = base_query.filter(Post.author_id.in_(followed_ids))

    if search_query:
        search_filter = Post.text.like(f'%{search_query}%')
        pagination = base_query.filter(search_filter) \
            .order_by(Post.created_date.desc()) \
            .paginate(page=page, per_page=per_page)
    else:
        pagination = base_query.order_by(Post.created_date.desc()) \
            .paginate(page=page, per_page=per_page)

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest' and request.args.get('ajax') == '1':
        return render_template(
            'main/_posts.html',
            posts=pagination.items
        )

    return render_template(
        'main/index.html',
        posts=pagination.items,
        pagination=pagination,
        search_query=search_query,
        followed_only=followed_only
    )


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter(
            (User.email == form.email_or_username.data) |
            (User.username == form.email_or_username.data)
        ).first()
        if not user or not user.check_password(form.password.data):
            flash('Неверная почта/логин или пароль', 'danger')
            return redirect(url_for('auth.login'))

        login_user(user, remember=form.remember.data)
        return redirect(url_for('main.index'))

    return render_template('auth/login.html', form=form)


@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Вы вышли из системы', 'info')
    return redirect(url_for('main.index'))


@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    form = RegistrationForm()
    if form.validate_on_submit():
        username_exists = User.query.filter(User.username == form.username.data).first()
        email_exists = User.query.filter(User.email == form.email.data).first()

        if username_exists or email_exists:
            if username_exists:
                flash('Этот логин уже занят', 'danger')
            if email_exists:
                flash('Эта почта уже зарегистрирована', 'danger')
            return render_template('auth/register.html', form=form)

        user = User()
        user.username = form.username.data
        user.email = form.email.data
        user.set_password(form.password.data)
        try:
            db.session.add(user)
            db.session.commit()
            flash('Регистрация прошла успешно! Теперь вы можете войти.', 'success')
            return redirect(url_for('auth.login'))
        except Exception:
            db.session.rollback()
            flash('Ошибка при регистрации. Попробуйте снова.', 'danger')
    return render_template('auth/register.html', form=form)


@posts_bp.route('/create', methods=['GET', 'POST'])
@login_required
def create_post():
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
            process_post_image(image, unique_filename)

            post.image = unique_filename

        db.session.add(post)
        db.session.commit()

        flash('Пост успешно создан!', 'success')
        return redirect(url_for('posts.get_post', post_id=post.id))

    return render_template('posts/create_post.html', form=form, header='Создать публикацию')


@posts_bp.route('/edit_post/<int:post_id>', methods=["GET", "POST"])
@login_required
def edit_post(post_id):
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
            flash('Пост успешно обновлен!', 'success')
            return redirect(url_for('posts.get_post', post_id=post.id))

        except Exception as e:
            db.session.rollback()
            flash(f'Ошибка при обновлении поста: {str(e)}', 'danger')

    return render_template('posts/create_post.html', form=form, post=post, header='Редактировать публикацию')


@posts_bp.route('/post/<int:post_id>')
def get_post(post_id):
    post = Post.query.filter(Post.id == post_id, Post.is_deleted == False).first()
    if post:
        return render_template('posts/post.html', post=post)
    return abort(404, description='Такого пользователя не существует')


@main_bp.route('/profile/<user_id_or_username>')
def profile(user_id_or_username):
    if user_id_or_username.isdigit():
        user = User.query.filter(User.id == int(user_id_or_username)).first()
    else:
        user = User.query.filter(User.username == user_id_or_username).first()
    if user:
        is_following = user.is_followed_by(current_user) if current_user.is_authenticated else False
        return render_template('main/profile.html', user=user, is_following=is_following)
    return abort(404, description='Такого пользователя не существует')


@main_bp.route('/edit_profile', methods=['GET', 'POST'])
@login_required
def edit_profile():
    form = ProfileForm()

    if form.validate_on_submit():
        try:
            # Обновление базовых данных
            current_user.username = form.username.data
            current_user.description = form.description.data

            # Обработка аватара
            if form.profile_image.data:
                try:
                    filename = process_avatar(form.profile_image.data)
                    current_user.profile_image = filename
                except Exception as e:
                    flash(f'Ошибка при обработке аватара: {str(e)}', 'error')
                    return redirect(url_for('main.edit_profile'))

            # Смена пароля (если указан)
            if form.password.data:
                current_user.set_password(form.password.data)

            db.session.commit()
            flash('Профиль успешно обновлен!', 'success')
            return redirect(url_for('main.profile', user_id_or_username=current_user.username))

        except Exception as e:
            db.session.rollback()
            flash(f'Ошибка при обновлении профиля: {str(e)}', 'danger')

    elif request.method == 'GET':
        # Заполняем форму текущими данными
        form.username.data = current_user.username
        form.description.data = current_user.description

    return render_template('main/edit_profile.html', form=form)


@posts_bp.route('/post/<int:post_id>/like', methods=['POST'])
@login_required
def like_post(post_id):
    if not request.is_json:
        return jsonify({'error': 'Request must be JSON'}), 400

    post = Post.query.get_or_404(post_id)
    existing_like = Like.query.filter_by(
        user_id=current_user.id,
        post_id=post_id
    ).first()

    if existing_like:
        db.session.delete(existing_like)
        post.likes_count -= 1
        db.session.commit()
        return jsonify({
            'status': 'unliked',
            'likes_count': post.likes_count
        })

    new_like = Like(
        user_id=current_user.id,
        post_id=post_id
    )
    db.session.add(new_like)
    post.likes_count += 1
    
    # Создаем уведомление для автора поста
    if post.author_id != current_user.id:
        notification = Notification(
            user_id=post.author_id,
            actor_id=current_user.id,
            type='like',
            post_id=post_id
        )
        db.session.add(notification)

    db.session.commit()

    # Push-уведомление
    if post.author_id != current_user.id:
        try:
            send_notification_push(post.author_id, current_user.username, 'like', post_id)
        except Exception:
            pass
    
    db.session.commit()

    return jsonify({
        'status': 'liked',
        'likes_count': post.likes_count
    })


@posts_bp.route('/post/<int:post_id>/repost', methods=['POST'])
@login_required
def toggle_repost(post_id):
    post = Post.query.get_or_404(post_id)
    existing = Repost.query.filter_by(
        user_id=current_user.id,
        post_id=post_id
    ).first()
    
    if existing:
        db.session.delete(existing)
        post.reposts_count -= 1
        is_reposted = False
    else:
        repost = Repost(user_id=current_user.id, post_id=post_id)
        db.session.add(repost)
        post.reposts_count += 1
        is_reposted = True
    
    db.session.commit()
    return jsonify({
        'status': 'reposted' if is_reposted else 'unreposted',
        'is_reposted': is_reposted,
        'reposts_count': post.reposts_count
    })


@posts_bp.route('/post/<int:post_id>/save', methods=['POST'])
@login_required
def toggle_save(post_id):
    post = Post.query.get_or_404(post_id)
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
@login_required
def add_comment(post_id):
    post = Post.query.get_or_404(post_id)

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
        flash('Текст комментария не может быть пустым', 'danger')
        return redirect(url_for('posts.get_post', post_id=post_id))

    new_comment = Comment(
        author_id=current_user.id,
        post_id=post_id,
        text=text
    )

    db.session.add(new_comment)
    post.comments_count += 1
    
    # Создаем уведомление для автора поста
    if post.author_id != current_user.id:
        notification = Notification(
            user_id=post.author_id,
            actor_id=current_user.id,
            type='comment',
            post_id=post_id
        )
        db.session.add(notification)

    db.session.commit()

    # Push-уведомление
    if post.author_id != current_user.id:
        try:
            send_notification_push(post.author_id, current_user.username, 'comment', post_id)
        except Exception:
            pass
    
    db.session.commit()

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

    flash('Комментарий успешно добавлен', 'success')
    return redirect(url_for('posts.get_post', post_id=post_id))


@posts_bp.route('/comment/<int:comment_id>', methods=['DELETE'])
@login_required
def delete_comment(comment_id):
    comment = Comment.query.get_or_404(comment_id)
    if comment.author_id != current_user.id:
        return jsonify({'error': 'Недостаточно прав'}), 403
    post = comment.post
    db.session.delete(comment)
    post.comments_count = max(0, post.comments_count - 1)
    db.session.commit()
    return jsonify({'status': 'deleted', 'comments_count': post.comments_count})


@posts_bp.route('/comment/<int:comment_id>/edit', methods=['POST'])
@login_required
def edit_comment(comment_id):
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
@login_required
def delete_post(post_id):
    post = Post.query.get_or_404(post_id)

    if post.author_id != current_user.id:
        return jsonify({'error': 'Недостаточно прав'}), 403

    post.is_deleted = True
    db.session.commit()

    return jsonify({'success': True})


@main_bp.route('/follow/<username>', methods=['POST'])
@login_required
def follow_toggle(username):
    target = User.query.filter(User.username == username).first()
    if not target:
        return jsonify({'error': 'Пользователь не найден'}), 404
    if target == current_user:
        return jsonify({'error': 'Нельзя подписаться на себя'}), 400

    existing = Follow.query.filter_by(
        follower_id=current_user.id,
        followed_id=target.id
    ).first()

    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({'status': 'unfollowed', 'followers_count': target.followers_count})
    else:
        follow = Follow(follower_id=current_user.id, followed_id=target.id)
        db.session.add(follow)
        
        # Создаем уведомление для пользователя, на которого подписались
        notification = Notification(
            user_id=target.id,
            actor_id=current_user.id,
            type='follow'
        )
        db.session.add(notification)

        db.session.commit()

        # Push-уведомление
        try:
            send_notification_push(target.id, current_user.username, 'follow')
        except Exception:
            pass
        return jsonify({'status': 'followed', 'followers_count': target.followers_count})


@main_bp.route('/followers/<username>')
def followers_page(username):
    user = User.query.filter(User.username == username).first()
    if not user:
        return abort(404)
    follows = Follow.query.filter_by(followed_id=user.id).order_by(Follow.created_date.desc()).all()
    return render_template('main/followers.html', user=user, follows=follows)


@main_bp.route('/following/<username>')
def following_page(username):
    user = User.query.filter(User.username == username).first()
    if not user:
        return abort(404)
    follows = Follow.query.filter_by(follower_id=user.id).order_by(Follow.created_date.desc()).all()
    return render_template('main/following.html', user=user, follows=follows)


@main_bp.route('/saved')
@login_required
def saved_posts():
    page = request.args.get('page', 1, type=int)
    saved = SavedPost.query.filter_by(user_id=current_user.id)\
        .order_by(SavedPost.created_date.desc())\
        .paginate(page=page, per_page=12)
    return render_template('main/saved.html', saved=saved)


@main_bp.route('/chat')
@login_required
def chat():
    return render_template('main/chat.html')


# API endpoints for notifications
@main_bp.route('/api/notifications/unread-count')
@login_required
def notifications_unread_count():
    count = Notification.query.filter_by(user_id=current_user.id, is_read=False).count()
    return jsonify({'count': count})


@main_bp.route('/api/notifications')
@login_required
def notifications_list():
    page = request.args.get('page', 1, type=int)
    per_page = 10
    
    notifications = Notification.query.filter_by(user_id=current_user.id)\
        .order_by(Notification.created_date.desc())\
        .paginate(page=page, per_page=per_page)
    
    return jsonify({
        'notifications': [{
            'id': n.id,
            'type': n.type,
            'actor': {
                'id': n.actor.id,
                'username': n.actor.username,
                'profile_image': n.actor.profile_image
            },
            'post_id': n.post_id,
            'is_read': n.is_read,
            'created_date': n.created_date.isoformat()
        } for n in notifications.items],
        'total': notifications.total,
        'pages': notifications.pages,
        'current_page': notifications.page
    })


@main_bp.route('/notifications/mark-all-read', methods=['POST'])
@login_required
def notifications_mark_all_read():
    Notification.query.filter_by(user_id=current_user.id, is_read=False).update({'is_read': True})
    db.session.commit()
    return jsonify({'status': 'success'})


@main_bp.route('/notifications/<int:notification_id>/mark-read', methods=['POST'])
@login_required
def notification_mark_read(notification_id):
    notification = Notification.query.filter_by(
        id=notification_id,
        user_id=current_user.id
    ).first_or_404()
    
    notification.is_read = True
    db.session.commit()
    
    return jsonify({'status': 'success'})


@main_bp.route('/notifications')
@login_required
def notifications_page():
    return render_template('main/notifications.html')


# Push-уведомления API
@main_bp.route('/api/push/subscribe', methods=['POST'])
@login_required
def push_subscribe():
    """Сохранить подписку на push-уведомления."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON'}), 400

        subscription = data.get('subscription')
        if not subscription:
            return jsonify({'error': 'Missing subscription'}), 400

        endpoint = subscription.get('endpoint')
        keys = subscription.get('keys', {})
        p256dh = keys.get('p256dh')
        auth = keys.get('auth')

        if not endpoint or not p256dh or not auth:
            return jsonify({'error': 'Incomplete subscription'}), 400

        # Ищем существующую подписку с таким endpoint
        existing = PushSubscription.query.filter_by(
            user_id=current_user.id,
            endpoint=endpoint
        ).first()

        if existing:
            # Обновляем ключи
            existing.p256dh_key = p256dh
            existing.auth_key = auth
        else:
            sub = PushSubscription(
                user_id=current_user.id,
                endpoint=endpoint,
                p256dh_key=p256dh,
                auth_key=auth
            )
            db.session.add(sub)

        db.session.commit()
        return jsonify({'status': 'subscribed'})

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@main_bp.route('/api/push/unsubscribe', methods=['POST'])
@login_required
def push_unsubscribe():
    """Удалить подписку на push-уведомления."""
    try:
        data = request.get_json()
        endpoint = data.get('endpoint') if data else None

        if endpoint:
            PushSubscription.query.filter_by(
                user_id=current_user.id,
                endpoint=endpoint
            ).delete()
        else:
            PushSubscription.query.filter_by(
                user_id=current_user.id
            ).delete()

        db.session.commit()
        return jsonify({'status': 'unsubscribed'})

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# Chat routes
@main_bp.route('/chat/start/<username>', methods=['POST'])
@login_required
def chat_start(username):
    try:
        target = User.query.filter(User.username == username).first()
        if not target:
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        # Ищем существующий чат между двумя пользователями
        my_chat_ids = [cp.chat_id for cp in ChatParticipant.query.filter_by(user_id=current_user.id).all()]
        if my_chat_ids:
            common = ChatParticipant.query.filter(
                ChatParticipant.chat_id.in_(my_chat_ids),
                ChatParticipant.user_id == target.id
            ).first()
            if common:
                return jsonify({'chat_id': common.chat_id})
        
        # Создаем новый чат
        chat = Chat()
        db.session.add(chat)
        db.session.flush()
        
        participant1 = ChatParticipant(chat_id=chat.id, user_id=current_user.id)
        participant2 = ChatParticipant(chat_id=chat.id, user_id=target.id)
        
        db.session.add(participant1)
        db.session.add(participant2)
        
        db.session.commit()
        
        return jsonify({'chat_id': chat.id})
    except Exception as e:
        db.session.rollback()
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500


@main_bp.route('/chat/<int:chat_id>/messages')
@login_required
def chat_messages(chat_id):
    chat = Chat.query.get_or_404(chat_id)
    
    # Проверяем, что пользователь участник чата
    participant = ChatParticipant.query.filter_by(
        chat_id=chat_id,
        user_id=current_user.id
    ).first()
    if not participant:
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    after = request.args.get('after', 0, type=int)
    before = request.args.get('before', 0, type=int)
    limit = request.args.get('limit', 50, type=int)

    # Отмечаем чужие непрочитанные сообщения как прочитанные (кроме пагинации вверх)
    if not before:
        now = utcnow()
        unread = Message.query.filter(
            Message.chat_id == chat_id,
            Message.author_id != current_user.id,
            Message.is_read == False
        ).update({'is_read': True, 'read_at': now})
        if unread:
            db.session.commit()

    query = Message.query.filter(Message.chat_id == chat_id)
    
    if before:
        # Старые сообщения (пагинация вверх)
        query = query.filter(Message.id < before)
        query = query.order_by(Message.created_date.desc())
    elif after:
        # Новые сообщения (polling)
        query = query.filter(Message.id > after)
        query = query.order_by(Message.created_date.asc())
    else:
        # Первая загрузка — с конца
        query = query.order_by(Message.created_date.desc())
    
    # Запрашиваем limit+1 чтобы точно знать, есть ли ещё
    messages = query.limit(limit + 1).all()
    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]
    
    # Если грузили старые — переворачиваем в хронологическом порядке
    if before:
        messages.reverse()
    elif not after and not before:
        messages.reverse()
    
    # Обновляем время последнего чтения и онлайн-статус
    participant.last_read_at = utcnow()
    current_user.last_seen = utcnow()
    db.session.commit()
    
    # Информация о собеседнике
    other_participant = ChatParticipant.query.filter(
        ChatParticipant.chat_id == chat_id,
        ChatParticipant.user_id != current_user.id
    ).first()
    other_user_info = None
    is_other_typing = False
    if other_participant:
        other = other_participant.user
        other_user_info = {
            'id': other.id,
            'username': other.username,
            'profile_image': other.profile_image,
            'is_online': other.is_online,
            'last_seen': other.last_seen_str()
        }
        # Проверяем, печатает ли собеседник
        if other_participant.last_typing_at:
            typing_delta = utcnow() - other_participant.last_typing_at
            is_other_typing = typing_delta.total_seconds() < 4

    return jsonify({
        'messages': [{
            'id': msg.id,
            'text': decrypt(msg.text),
            'created_date': msg.created_date.isoformat(),
            'is_read': msg.is_read,
            'author': {
                'id': msg.author.id,
                'username': msg.author.username,
                'profile_image': msg.author.profile_image
            }
        } for msg in messages],
        'other_user': other_user_info,
        'is_typing': is_other_typing,
        'has_more': has_more
    })


@main_bp.route('/chat/<int:chat_id>/send', methods=['POST'])
@login_required
def chat_send(chat_id):
    chat = Chat.query.get_or_404(chat_id)
    
    # Проверяем, что пользователь участник чата
    participant = ChatParticipant.query.filter_by(
        chat_id=chat_id,
        user_id=current_user.id
    ).first()
    if not participant:
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    data = request.get_json()
    text = data.get('text', '').strip()
    
    if not text:
        return jsonify({'error': 'Сообщение не может быть пустым'}), 400
    
    new_message = Message(
        chat_id=chat_id,
        author_id=current_user.id,
        text=encrypt(text)
    )
    
    current_user.last_seen = utcnow()
    db.session.add(new_message)
    db.session.commit()

    # Отправляем push-уведомление получателю
    try:
        other_participant = ChatParticipant.query.filter(
            ChatParticipant.chat_id == chat_id,
            ChatParticipant.user_id != current_user.id
        ).first()
        if other_participant:
            send_message_push(
                chat_id=chat_id,
                recipient_id=other_participant.user_id,
                sender_username=current_user.username,
                message_preview=text
            )
    except Exception as e:
        # Push-уведомления не должны ломать отправку сообщения
        pass
    
    return jsonify({
        'message': {
            'id': new_message.id,
            'text': text,  # исходный (незашифрованный) текст
            'created_date': new_message.created_date.isoformat(),
            'is_read': new_message.is_read,
            'author': {
                'id': current_user.id,
                'username': current_user.username,
                'profile_image': current_user.profile_image
            }
        }
    })


@main_bp.route('/chat/<int:chat_id>/typing', methods=['POST'])
@login_required
def chat_typing(chat_id):
    participant = ChatParticipant.query.filter_by(
        chat_id=chat_id,
        user_id=current_user.id
    ).first()
    if not participant:
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    participant.last_typing_at = utcnow()
    db.session.commit()
    
    return jsonify({'status': 'ok'})


@main_bp.route('/api/chat/list')
@login_required
def chat_list():
    try:
        # Получаем все чаты, где пользователь является участником
        participations = ChatParticipant.query.filter_by(user_id=current_user.id).all()
        
        chats = []
        for participation in participations:
            # Находим другого участника чата
            other_participation = ChatParticipant.query.filter(
                ChatParticipant.chat_id == participation.chat_id,
                ChatParticipant.user_id != current_user.id
            ).first()
            
            if other_participation:
                other_user = other_participation.user
                # Если пользователь был удалён — пропускаем чат
                if not other_user:
                    continue
                last_message = Message.query.filter_by(
                    chat_id=participation.chat_id
                ).order_by(Message.created_date.desc()).first()
                
                # Проверяем, есть ли непрочитанные сообщения
                unread_query = Message.query.filter(
                    Message.chat_id == participation.chat_id,
                    Message.author_id != current_user.id
                )
                if participation.last_read_at:
                    unread_query = unread_query.filter(Message.created_date > participation.last_read_at)
                unread_count = unread_query.count()
                
                chats.append({
                    'chat_id': participation.chat_id,
                    'other_user': {
                        'id': other_user.id,
                        'username': other_user.username,
                        'profile_image': other_user.profile_image,
                        'is_online': other_user.is_online,
                        'last_seen': other_user.last_seen_str()
                    },
                    'last_message': decrypt(last_message.text) if last_message else None,
                    'last_message_date': last_message.created_date.isoformat() if last_message else None,
                    'unread_count': unread_count
                })
        
        # Сортируем по последнему сообщению
        chats.sort(key=lambda x: x['last_message_date'] or '1970-01-01', reverse=True)
        
        return jsonify({'chats': chats})
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500


@main_bp.route('/api/users/search')
@login_required
def search_users():
    query = request.args.get('q', '').strip().lower()
    
    if not query:
        return jsonify({'users': []})
    
    users = User.query.filter(
        User.username.ilike(f'%{query}%')
    ).limit(10).all()
    
    return jsonify({
        'users': [{
            'id': user.id,
            'username': user.username,
            'profile_image': user.profile_image
        } for user in users]
    })


@main_bp.route('/settings', methods=['GET', 'POST'])
@login_required
def settings():
    form = SettingsForm()
    
    # Pre-populate form with current user data
    form.notifications_enabled.data = current_user.notifications_enabled
    if form.new_email.errors:
        pass  # keep submitted data
    
    if form.validate_on_submit():
        try:
            # Проверка текущего пароля
            if not current_user.check_password(form.current_password.data):
                flash('Неверный текущий пароль', 'danger')
                return render_template('main/settings.html', form=form)
            
            # Обновление email
            if form.new_email.data and form.new_email.data != current_user.email:
                existing_user = User.query.filter(User.email == form.new_email.data).first()
                if existing_user:
                    flash('Этот email уже используется', 'danger')
                    return render_template('main/settings.html', form=form)
                
                current_user.email = form.new_email.data
                flash('Email успешно обновлен', 'success')
            
            # Обновление пароля
            if form.new_password.data:
                current_user.set_password(form.new_password.data)
                flash('Пароль успешно изменен', 'success')
            
            # Обновление настроек уведомлений
            new_value = form.notifications_enabled.data
            old_value = current_user.notifications_enabled
            current_user.notifications_enabled = new_value
            
            if new_value != old_value:
                if new_value:
                    flash('Уведомления включены', 'success')
                else:
                    # Отключаем уведомления — удаляем все push-подписки пользователя
                    PushSubscription.query.filter_by(user_id=current_user.id).delete()
                    flash('Уведомления отключены', 'info')
            
            db.session.commit()
            
            # Удаление аккаунта
            if form.delete_account.data:
                if confirm_delete_account():
                    # Удаляем пользователя и все связанные данные
                    User.query.filter_by(id=current_user.id).delete()
                    db.session.commit()
                    logout_user()
                    flash('Аккаунт успешно удален', 'success')
                    return redirect(url_for('auth.login'))
                else:
                    flash('Удаление аккаунта отменено', 'info')
            
            return redirect(url_for('main.settings'))
            
        except Exception as e:
            db.session.rollback()
            flash(f'Ошибка при обновлении настроек: {str(e)}', 'danger')
    
    return render_template('main/settings.html', form=form)


def confirm_delete_account():
    """Подтверждение удаления аккаунта"""
    # В реальном приложении здесь может быть дополнительная логика проверки
    return True
