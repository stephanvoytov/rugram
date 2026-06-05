import os
import logging
from datetime import datetime

from flask import render_template, flash, redirect, url_for, Blueprint, request, jsonify, abort, current_app, Response, send_from_directory
from flask_login import login_required, current_user, logout_user
from sqlalchemy.orm import joinedload, load_only

from app.translations import _
from app.forms import ProfileForm, SettingsForm
from app.models import User, Post, Like, Comment, Follow, Notification, PushSubscription, Chat, ChatParticipant, Message, SavedPost, Repost, Tag, PostTag, utcnow
from app.crypto import encrypt, decrypt
from app.limiter import limiter
from app.push import send_message_push, send_notification_push
from extensions import db
from app.routes.helpers import logger, process_avatar, process_chat_image, is_allowed_image, _create_notification_and_push, _require_chat_participant

main_bp = Blueprint('main', __name__, template_folder='../templates')


@main_bp.route('/')
@main_bp.route('/index')
def index() -> Response:
    from sqlalchemy import case, desc as sql_desc
    search_query = request.args.get('q', '').strip().lower()
    tag_filter = request.args.get('tag', '').strip().lower()
    sort_by = request.args.get('sort', 'new').strip().lower()
    page = request.args.get('page', 1, type=int)
    per_page = current_app.config.get('POSTS_PER_PAGE', 15)
    followed_only = request.args.get('followed') == '1'

    base_query = Post.query.options(joinedload(Post.author)).filter(Post.is_deleted == False)

    if followed_only and current_user.is_authenticated:
        followed_sub = db.session.query(Follow.followed_id).filter(
            Follow.follower_id == current_user.id
        ).scalar_subquery()
        base_query = base_query.filter(
            (Post.author_id.in_(followed_sub)) | (Post.author_id == current_user.id)
        )

    if tag_filter:
        base_query = base_query.join(PostTag).join(Tag).filter(Tag.name == tag_filter)

    # Сортировка
    if sort_by == 'hot':
        # hot = вовлечённость: лайки + комменты×2 + репосты×3
        order = sql_desc(
            Post.likes_count + Post.comments_count * 2 + Post.reposts_count * 3
        )
    elif sort_by == 'top':
        order = sql_desc(Post.likes_count + Post.comments_count + Post.reposts_count)
    else:
        order = Post.created_date.desc()
        sort_by = 'new'

    if search_query:
        search_filter = Post.text.ilike(f'%{search_query}%')
        pagination = base_query.filter(search_filter) \
            .order_by(order) \
            .paginate(page=page, per_page=per_page)
    else:
        pagination = base_query.order_by(order) \
            .paginate(page=page, per_page=per_page)

    # Trending tags for sidebar
    trending_tags = Tag.query.filter(Tag.post_count > 0) \
        .order_by(Tag.post_count.desc()).limit(10).all()

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
        followed_only=followed_only,
        tag_filter=tag_filter,
        sort_by=sort_by,
        trending_tags=trending_tags
    )


@main_bp.route('/profile/<user_id_or_username>')
def profile(user_id_or_username: str) -> Response:
    # Try ID first, fall back to username (to handle digit-only usernames like "12345")
    try:
        user = User.query.get(int(user_id_or_username))
    except (ValueError, TypeError):
        user = None
    if not user:
        user = User.query.filter(User.username == user_id_or_username).first()
    if user:
        is_following = user.is_followed_by(current_user) if current_user.is_authenticated else False
        return render_template('main/profile.html', user=user, is_following=is_following)
    return abort(404, description='Такого пользователя не существует')


@main_bp.route('/edit_profile', methods=['GET', 'POST'])
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

            db.session.commit()
            flash(_('Profile updated!'), 'success')
            return redirect(url_for('main.profile', user_id_or_username=current_user.username))

        except Exception as e:
            db.session.rollback()
            flash(_('Error updating profile'), 'danger')

    elif request.method == 'GET':
        form.description.data = current_user.description

    return render_template('main/edit_profile.html', form=form)


@main_bp.route('/follow/<username>', methods=['POST'])
@login_required
@limiter.limit("20/minute")
def follow_toggle(username: str) -> Response:
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
        notification = _create_notification_and_push(user_id=target.id, actor_id=current_user.id, type_='follow')

        db.session.commit()

        # Push-уведомление
        try:
            send_notification_push(target.id, current_user.username, 'follow')
        except Exception:
            logger.warning('push notification failed')
        return jsonify({'status': 'followed', 'followers_count': target.followers_count})


@main_bp.route('/followers/<username>')
def followers_page(username: str) -> Response:
    user = User.query.filter(User.username == username).first()
    if not user:
        return abort(404)
    follows = Follow.query.filter_by(followed_id=user.id)\
        .options(joinedload(Follow.follower))\
        .order_by(Follow.created_date.desc()).all()
    return render_template('main/followers.html', user=user, follows=follows)


@main_bp.route('/following/<username>')
def following_page(username: str) -> Response:
    user = User.query.filter(User.username == username).first()
    if not user:
        return abort(404)
    follows = Follow.query.filter_by(follower_id=user.id)\
        .options(joinedload(Follow.followed))\
        .order_by(Follow.created_date.desc()).all()
    return render_template('main/following.html', user=user, follows=follows)


@main_bp.route('/saved')
@login_required
def saved_posts() -> Response:
    page = request.args.get('page', 1, type=int)
    saved = SavedPost.query.filter_by(user_id=current_user.id)\
        .order_by(SavedPost.created_date.desc())\
        .paginate(page=page, per_page=current_app.config.get('POSTS_PER_PAGE', 15))
    return render_template('main/saved.html', saved=saved)


@main_bp.route('/chat')
@login_required
def chat() -> Response:
    return render_template('main/chat.html')


# API endpoints for notifications
@main_bp.route('/api/notifications/unread-count')
@login_required
def notifications_unread_count() -> Response:
    count = Notification.query.filter_by(user_id=current_user.id, is_read=False).count()
    return jsonify({'count': count})


@main_bp.route('/api/notifications')
@login_required
def notifications_list() -> Response:
    page = request.args.get('page', 1, type=int)
    per_page = current_app.config.get('NOTIFICATIONS_PER_PAGE', 10)

    notifications = Notification.query.filter_by(user_id=current_user.id)\
        .options(joinedload(Notification.actor))\
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
            'text': n.text,
            'is_read': n.is_read,
            'created_date': n.created_date.isoformat()
        } for n in notifications.items],
        'total': notifications.total,
        'pages': notifications.pages,
        'current_page': notifications.page
    })


# API endpoint for saved posts (JSON, for terminal inline)
@main_bp.route('/api/saved')
@login_required
def api_saved_posts() -> Response:
    page = request.args.get('page', 1, type=int)
    saved = SavedPost.query.filter_by(user_id=current_user.id)\
        .options(joinedload(SavedPost.post).joinedload(Post.author))\
        .order_by(SavedPost.created_date.desc())\
        .paginate(page=page, per_page=current_app.config.get('POSTS_PER_PAGE', 15))
    return jsonify({
        'posts': [{
            'id': s.post.id,
            'text': s.post.text,
            'image': s.post.image,
            'author': s.post.author.username,
            'author_id': s.post.author_id,
            'likes': s.post.likes_count,
            'comments': s.post.comments_count,
            'reposts': s.post.reposts_count,
            'is_liked': s.post.is_liked_by(current_user) if current_user.is_authenticated else False,
            'is_saved': True,
            'time': s.post.created_date.isoformat(),
            'saved_date': s.created_date.isoformat()
        } for s in saved.items],
        'page': saved.page,
        'pages': saved.pages,
        'total': saved.total
    })


# API endpoint for feed (JSON, for terminal inline — independent from GUI DOM)
@main_bp.route('/api/feed')
def api_feed() -> Response:
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int) or 20, 100)
    pagination = Post.query.filter(Post.is_deleted == False)\
        .options(joinedload(Post.author))\
        .order_by(Post.id.desc())\
        .paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        'posts': [{
            'id': p.id,
            'text': p.text,
            'image': p.image,
            'author': p.author.username,
            'author_id': p.author_id,
            'author_image': p.author.profile_image,
            'likes': p.likes_count,
            'comments': p.comments_count,
            'reposts': p.reposts_count,
            'is_liked': p.is_liked_by(current_user) if current_user.is_authenticated else False,
            'is_saved': p.is_saved_by(current_user) if current_user.is_authenticated else False,
            'time': p.created_date.isoformat()
        } for p in pagination.items],
        'page': pagination.page,
        'pages': pagination.pages,
        'total': pagination.total,
        'has_next': pagination.has_next
    })


# API endpoint for followers list (JSON, for terminal inline)
@main_bp.route('/api/followers/<username>')
@login_required
def api_followers(username: str) -> Response:
    user = User.query.filter(User.username == username).first()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    follows = Follow.query.filter_by(followed_id=user.id)\
        .options(joinedload(Follow.follower))\
        .order_by(Follow.created_date.desc()).all()
    return jsonify({
        'users': [{
            'id': f.follower.id,
            'username': f.follower.username,
            'profile_image': f.follower.profile_image,
            'description': f.follower.description,
            'is_online': f.follower.is_online,
            'followed_at': f.created_date.isoformat()
        } for f in follows],
        'total': len(follows)
    })


# API endpoint for following list (JSON, for terminal inline)
@main_bp.route('/api/following/<username>')
@login_required
def api_following(username: str) -> Response:
    user = User.query.filter(User.username == username).first()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    follows = Follow.query.filter_by(follower_id=user.id)\
        .options(joinedload(Follow.followed))\
        .order_by(Follow.created_date.desc()).all()
    return jsonify({
        'users': [{
            'id': f.followed.id,
            'username': f.followed.username,
            'profile_image': f.followed.profile_image,
            'description': f.followed.description,
            'is_online': f.followed.is_online,
            'followed_at': f.created_date.isoformat()
        } for f in follows],
        'total': len(follows)
    })


@main_bp.route('/notifications/mark-all-read', methods=['POST'])
@login_required
def notifications_mark_all_read() -> Response:
    Notification.query.filter_by(user_id=current_user.id, is_read=False).update({'is_read': True})
    db.session.commit()
    return jsonify({'status': 'success'})


@main_bp.route('/notifications/<int:notification_id>/mark-read', methods=['POST'])
@login_required
def notification_mark_read(notification_id: int) -> Response:
    notification = Notification.query.filter_by(
        id=notification_id,
        user_id=current_user.id
    ).first_or_404()

    notification.is_read = True
    db.session.commit()

    return jsonify({'status': 'success'})


@main_bp.route('/notifications')
@login_required
def notifications_page() -> Response:
    return render_template('main/notifications.html')


# Push-уведомления API
@main_bp.route('/api/push/subscribe', methods=['POST'])
@login_required
def push_subscribe() -> Response:
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
def push_unsubscribe() -> Response:
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
def chat_start(username: str) -> Response:
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
        logger.exception('chat_start failed')
        return jsonify({'error': 'Internal server error'}), 500


@main_bp.route('/chat/<int:chat_id>/messages')
@login_required
def chat_messages(chat_id: int) -> Response:
    chat = Chat.query.get_or_404(chat_id)

    participant, err = _require_chat_participant(chat_id)
    if err:
        return err

    after = request.args.get('after', 0, type=int)
    before = request.args.get('before', 0, type=int)
    ts = request.args.get('ts', '', type=str)
    limit = min(request.args.get('limit', 50, type=int) or 50, 200)

    # Отмечаем чужие непрочитанные сообщения как прочитанные (только первая загрузка, не пагинация)
    if not before and not after:
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

    # ── Updates: edits/deletes to already-known messages ──
    updates = []
    if ts and after:
        try:
            ts_dt = datetime.fromisoformat(ts)
            if ts_dt.tzinfo:
                ts_dt = ts_dt.replace(tzinfo=None)
            updates = Message.query.filter(
                Message.chat_id == chat_id,
                Message.id <= after,
                Message.updated_at > ts_dt
            ).order_by(Message.created_date.asc()).all()
        except ValueError:
            pass

    # Обновляем время последнего чтения и онлайн-статус (только при загрузке первых сообщений)
    # last_seen обновляется не чаще 30 секунд — write throttle
    if not before and not after:
        participant.last_read_at = utcnow()
        now = utcnow()
        if not current_user.last_seen or (now - current_user.last_seen).total_seconds() > 30:
            current_user.last_seen = now
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
            'author_id': msg.author.id,
            'text': decrypt(msg.text) if msg.text else '',
            'image': msg.image,
            'image_url': url_for('main.chat_image', chat_id=chat_id, filename=msg.image) if msg.image else None,
            'created_date': msg.created_date.isoformat(),
            'edited_at': msg.edited_at.isoformat() if msg.edited_at else None,
            'is_read': msg.is_read,
            'is_deleted': msg.text == '' and msg.image is None,
            'author': {
                'id': msg.author.id,
                'username': msg.author.username,
                'profile_image': msg.author.profile_image
            }
        } for msg in messages],
        'updates': [{
            'id': msg.id,
            'author_id': msg.author.id,
            'text': decrypt(msg.text) if msg.text else '',
            'image': msg.image,
            'image_url': url_for('main.chat_image', chat_id=chat_id, filename=msg.image) if msg.image else None,
            'created_date': msg.created_date.isoformat(),
            'edited_at': msg.edited_at.isoformat() if msg.edited_at else None,
            'is_read': msg.is_read,
            'is_deleted': msg.text == '' and msg.image is None,
            'author': {
                'id': msg.author.id,
                'username': msg.author.username,
                'profile_image': msg.author.profile_image
            }
        } for msg in updates],
        'other_user': other_user_info,
        'is_typing': is_other_typing,
        'has_more': has_more
    })


@main_bp.route('/chat/<int:chat_id>/send', methods=['POST'])
@login_required
@limiter.limit("60/minute")
def chat_send(chat_id: int) -> Response:
    chat = Chat.query.get_or_404(chat_id)

    participant, err = _require_chat_participant(chat_id)
    if err:
        return err

    text = None
    image_filename = None

    if request.content_type and 'multipart/form-data' in request.content_type:
        # Multipart: может быть текст + файл
        text = request.form.get('text', '').strip()
        image_file = request.files.get('image')
        if image_file and image_file.filename:
            if not is_allowed_image(image_file.filename):
                return jsonify({'error': _('Invalid file type')}), 400
            image_filename = process_chat_image(image_file)
            if not image_filename:
                return jsonify({'error': _('Failed to process image')}), 400
    else:
        # JSON: только текст
        data = request.get_json(silent=True)
        if data:
            text = data.get('text', '').strip()

    if not text and not image_filename:
        return jsonify({'error': _('Message cannot be empty')}), 400

    encrypted_text = encrypt(text) if text else ''

    new_message = Message(
        chat_id=chat_id,
        author_id=current_user.id,
        text=encrypted_text,
        image=image_filename
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
            preview = text or '[image]'
            send_message_push(
                chat_id=chat_id,
                recipient_id=other_participant.user_id,
                sender_username=current_user.username,
                message_preview=preview
            )
    except Exception as e:
        logger.warning('Push notification failed in chat_send: %s', e)

    return jsonify({
        'message': {
            'id': new_message.id,
            'text': text or '',
            'image': image_filename,
            'image_url': url_for('main.chat_image', chat_id=chat_id, filename=image_filename) if image_filename else None,
            'created_date': new_message.created_date.isoformat(),
            'is_read': new_message.is_read,
            'edited_at': None,
            'is_deleted': False,
            'author': {
                'id': current_user.id,
                'username': current_user.username,
                'profile_image': current_user.profile_image
            }
        }
    })


@main_bp.route('/chat/<int:chat_id>/image/<filename>')
@login_required
def chat_image(chat_id: int, filename: str) -> Response:
    """Serve a chat image — requires login + chat participation.

    Tries new location (instance/uploads/chat/) first, then falls back
    to old location (uploads/chat/) for pre-migration images.
    """
    from config import Config as _Cfg
    participant, err = _require_chat_participant(chat_id)
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


@main_bp.route('/chat/<int:chat_id>/messages/<int:message_id>', methods=['PATCH'])
@login_required
def chat_edit_message(chat_id: int, message_id: int) -> Response:
    """Edit a message text (author only)."""
    participant, err = _require_chat_participant(chat_id)
    if err:
        return err
    msg = Message.query.filter_by(id=message_id, chat_id=chat_id).first_or_404()
    if msg.author_id != current_user.id:
        return jsonify({'error': _('Access denied')}), 403
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': _('Invalid request')}), 400
    text = data.get('text', '').strip()
    if not text:
        return jsonify({'error': _('Message cannot be empty')}), 400
    msg.text = encrypt(text)
    msg.edited_at = utcnow()
    msg.updated_at = utcnow()
    db.session.commit()
    return jsonify({
        'message': {
            'id': msg.id,
            'text': text,
            'image': msg.image,
            'image_url': url_for('main.chat_image', chat_id=chat_id, filename=msg.image) if msg.image else None,
            'created_date': msg.created_date.isoformat(),
            'edited_at': msg.edited_at.isoformat() if msg.edited_at else None,
            'is_read': msg.is_read,
            'author': {
                'id': current_user.id,
                'username': current_user.username,
                'profile_image': current_user.profile_image
            }
        }
    })


@main_bp.route('/chat/<int:chat_id>/messages/<int:message_id>', methods=['DELETE'])
@login_required
def chat_delete_message(chat_id: int, message_id: int) -> Response:
    """Delete a message (author only)."""
    participant, err = _require_chat_participant(chat_id)
    if err:
        return err
    msg = Message.query.filter_by(id=message_id, chat_id=chat_id).first_or_404()
    if msg.author_id != current_user.id:
        return jsonify({'error': _('Access denied')}), 403
    msg.text = ''
    msg.image = None
    msg.updated_at = utcnow()
    db.session.commit()
    return jsonify({'status': 'deleted'})

@main_bp.route('/chat/<int:chat_id>/typing', methods=['POST'])
@login_required
def chat_typing(chat_id: int) -> Response:
    participant, err = _require_chat_participant(chat_id)
    if err:
        return err

    participant.last_typing_at = utcnow()
    db.session.commit()

    return jsonify({'status': 'ok'})


@main_bp.route('/api/chat/list')
@login_required
def chat_list() -> Response:
    try:
        # Собираем ID чатов одним запросом
        participations = ChatParticipant.query.filter_by(user_id=current_user.id)\
            .options(joinedload(ChatParticipant.user)).all()
        chat_ids = [p.chat_id for p in participations]

        # Загружаем всех других участников одним запросом
        other_by_chat = {}
        if chat_ids:
            other_participations = ChatParticipant.query.filter(
                ChatParticipant.chat_id.in_(chat_ids),
                ChatParticipant.user_id != current_user.id
            ).options(joinedload(ChatParticipant.user)).all()
            other_by_chat = {p.chat_id: p for p in other_participations}

        # Загружаем последние сообщения для всех чатов одним подзапросом
        from sqlalchemy import func
        latest_by_chat = {}
        if chat_ids:
            latest_sub = db.session.query(
                func.max(Message.id).label('max_id')
            ).filter(Message.chat_id.in_(chat_ids))\
             .group_by(Message.chat_id).subquery()
            latest_msgs = Message.query.filter(
                Message.id.in_(db.session.query(latest_sub.c.max_id))
            ).all()
            latest_by_chat = {m.chat_id: m for m in latest_msgs}

        # Загружаем количество непрочитанных для всех чатов одним запросом
        unread_counts = {}
        if chat_ids:
            unread_rows = db.session.query(
                Message.chat_id,
                func.count(Message.id).label('cnt')
            ).filter(
                Message.chat_id.in_(chat_ids),
                Message.author_id != current_user.id,
                Message.is_read == False
            ).group_by(Message.chat_id).all()
            unread_counts = {r.chat_id: r.cnt for r in unread_rows}

        chats = []
        for participation in participations:
            other_p = other_by_chat.get(participation.chat_id)
            if not other_p or not other_p.user:
                continue

            other_user = other_p.user
            last_message = latest_by_chat.get(participation.chat_id)
            unread_count = unread_counts.get(participation.chat_id, 0)

            chats.append({
                'chat_id': participation.chat_id,
                'other_user': {
                    'id': other_user.id,
                    'username': other_user.username,
                    'profile_image': other_user.profile_image,
                    'is_online': other_user.is_online,
                    'last_seen': other_user.last_seen_str()
                },
                'last_message': (
                    decrypt(last_message.text) if last_message and last_message.text
                    else '[image]' if last_message and last_message.image
                    else None
                ),
                'last_message_date': last_message.created_date.isoformat() if last_message else None,
                'unread_count': unread_count
            })

        # Сортируем по последнему сообщению
        chats.sort(key=lambda x: x['last_message_date'] or '1970-01-01', reverse=True)

        return jsonify({'chats': chats})
    except Exception:
        logger.exception('chat_list failed')
        return jsonify({'error': 'Internal server error'}), 500


@main_bp.route('/api/users/search')
def search_users() -> Response:
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
            'profile_image': user.profile_image,
            'is_online': user.is_online
        } for user in users]
    })


@main_bp.route('/api/tags/search')
def tags_search() -> Response:
    """Автодополнение тегов (начинается с)."""
    query = request.args.get('q', '').strip().lower()
    if not query:
        return jsonify({'tags': []})
    tags = Tag.query.filter(
        Tag.name.ilike(f'{query}%')
    ).order_by(Tag.post_count.desc()).limit(10).all()
    return jsonify({
        'tags': [{'name': t.name, 'post_count': t.post_count} for t in tags]
    })


@main_bp.route('/api/tags/trending')
def tags_trending() -> Response:
    """Топ-10 популярных тегов."""
    tags = Tag.query.filter(Tag.post_count > 0) \
        .order_by(Tag.post_count.desc()).limit(10).all()
    return jsonify({
        'tags': [{'name': t.name, 'post_count': t.post_count} for t in tags]
    })


@main_bp.route('/settings', methods=['GET', 'POST'])
@login_required
def settings() -> Response:
    form = SettingsForm()

    # Pre-populate form with current user data
    form.new_username.data = current_user.username
    form.notifications_enabled.data = current_user.notifications_enabled

    if form.validate_on_submit():
        try:
            # Проверка текущего пароля
            if not current_user.check_password(form.current_password.data):
                flash(_('Current password is incorrect'), 'danger')
                return render_template('main/settings.html', form=form)

            # Обновление логина
            if form.new_username.data and form.new_username.data != current_user.username:
                existing_user = User.query.filter(User.username == form.new_username.data).first()
                if existing_user:
                    flash(_('This username is already taken'), 'danger')
                    return render_template('main/settings.html', form=form)

                current_user.username = form.new_username.data.lower()
                flash(_('Username changed'), 'success')

            # Обновление email
            if form.new_email.data and form.new_email.data != current_user.email:
                existing_user = User.query.filter(User.email == form.new_email.data).first()
                if existing_user:
                    flash(_('This email is already registered'), 'danger')
                    return render_template('main/settings.html', form=form)

                current_user.email = form.new_email.data
                flash(_('Email updated'), 'success')

            # Обновление пароля
            if form.new_password.data:
                current_user.set_password(form.new_password.data)
                flash(_('Password changed'), 'success')

            # Обновление настроек уведомлений
            new_value = form.notifications_enabled.data
            old_value = current_user.notifications_enabled
            current_user.notifications_enabled = new_value

            if new_value != old_value:
                if new_value:
                    flash(_('Notifications enabled'), 'success')
                else:
                    # Отключаем уведомления — удаляем все push-подписки пользователя
                    PushSubscription.query.filter_by(user_id=current_user.id).delete()
                    flash(_('Notifications disabled'), 'info')

            db.session.commit()

            flash(_('Settings saved'), 'success')

            # Удаление аккаунта
            if form.delete_account.data:
                uid = current_user.id
                # Bulk-delete связанных записей перед удалением пользователя.
                # Все FK имеют ondelete='CASCADE' в БД + PRAGMA foreign_keys=ON,
                # но bulk .delete() эффективнее ORM-каскадов (не загружает объекты в память).
                Like.query.filter(Like.user_id == uid).delete()
                Comment.query.filter(Comment.author_id == uid).delete()
                Follow.query.filter((Follow.follower_id == uid) | (Follow.followed_id == uid)).delete()
                Notification.query.filter((Notification.user_id == uid) | (Notification.actor_id == uid)).delete()
                ChatParticipant.query.filter(ChatParticipant.user_id == uid).delete()
                Message.query.filter(Message.author_id == uid).delete()
                Repost.query.filter(Repost.user_id == uid).delete()
                SavedPost.query.filter(SavedPost.user_id == uid).delete()
                PushSubscription.query.filter(PushSubscription.user_id == uid).delete()
                for post in current_user.posts:
                    db.session.delete(post)
                db.session.delete(current_user)
                db.session.commit()
                logout_user()
                flash(_('Account deleted'), 'success')
                return redirect(url_for('auth.login'))

            return redirect(url_for('main.settings'))

        except Exception:
            db.session.rollback()
            flash(_('Error updating settings'), 'danger')

    return render_template('main/settings.html', form=form)


@main_bp.route('/health')
def health() -> Response:
    """Лёгкий healthcheck для Docker — не грузит БД, возвращает 200."""
    return jsonify({'status': 'ok'}), 200


@main_bp.route('/robots.txt')
def robots_txt() -> Response:
    """Serve robots.txt for SEO."""
    lines = [
        'User-agent: *',
        'Disallow: /api/',
        'Disallow: /chat',
        'Disallow: /login',
        'Disallow: /register',
        'Disallow: /settings',
        'Disallow: /edit_profile',
        'Disallow: /notifications',
        'Disallow: /saved',
        '',
        f'Sitemap: {request.url_root}sitemap.xml',
    ]
    return Response('\n'.join(lines), mimetype='text/plain')


@main_bp.route('/sitemap.xml')
def sitemap_xml() -> Response:
    """Generate dynamic sitemap.xml with posts and profiles."""
    from xml.etree.ElementTree import Element, SubElement, tostring
    from xml.dom import minidom

    base_url = request.url_root.rstrip('/')

    urlset = Element('urlset')
    urlset.set('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9')

    def add_url(loc, lastmod=None, priority='0.5', changefreq='weekly'):
        url_el = SubElement(urlset, 'url')
        loc_el = SubElement(url_el, 'loc')
        loc_el.text = loc
        if lastmod:
            lm_el = SubElement(url_el, 'lastmod')
            lm_el.text = lastmod.strftime('%Y-%m-%d') if hasattr(lastmod, 'strftime') else str(lastmod)[:10]
        pr_el = SubElement(url_el, 'priority')
        pr_el.text = priority
        cf_el = SubElement(url_el, 'changefreq')
        cf_el.text = changefreq

    # Main pages
    add_url(f'{base_url}/', priority='1.0', changefreq='daily')
    add_url(f'{base_url}/help', priority='0.6', changefreq='monthly')

    # Public profiles (users with at least one non-deleted post)
    users_with_posts = (
        db.session.query(User)
        .join(Post, Post.author_id == User.id)
        .filter(Post.is_deleted == False)
        .distinct()
        .all()
    )
    for user in users_with_posts:
        last_post = (
            Post.query
            .filter(Post.author_id == user.id, Post.is_deleted == False)
            .order_by(Post.created_date.desc())
            .first()
        )
        lastmod = last_post.created_date if last_post else None
        add_url(f'{base_url}/profile/{user.username}', lastmod=lastmod, priority='0.8', changefreq='weekly')

    # All non-deleted posts
    posts = Post.query.filter(Post.is_deleted == False).order_by(Post.created_date.desc()).all()
    for post in posts:
        add_url(f'{base_url}/post/{post.id}', lastmod=post.created_date, priority='0.9', changefreq='monthly')

    # Pretty-print XML
    rough_string = tostring(urlset, encoding='unicode')
    dom = minidom.parseString(rough_string.encode('utf-8'))
    pretty_xml = dom.toprettyxml(indent='  ', encoding='utf-8')

    return Response(pretty_xml, mimetype='application/xml')


@main_bp.route('/tty/help')
def tty_help() -> Response:
    """Redirect to unified help page."""
    return redirect(url_for('main.help', _anchor='commands'))


@main_bp.route('/tty/vfs')
def tty_vfs() -> Response:
    """Redirect to unified help page."""
    return redirect(url_for('main.help', _anchor='filesystem'))


@main_bp.route('/about')
def about() -> Response:
    """Redirect to unified help page."""
    return redirect(url_for('main.help', _anchor='about'))


@main_bp.route('/help')
def help() -> Response:
    """Unified help page: about + commands + filesystem."""
    return render_template('main/help.html')


@main_bp.route('/terminal')
def terminal() -> Response:
    """Full-page terminal mode — no GUI overlay, separate URL."""
    return render_template('main/terminal.html')
