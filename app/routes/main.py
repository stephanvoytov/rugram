import os
from datetime import datetime

from flask import render_template, flash, redirect, url_for, Blueprint, request, jsonify, abort, current_app, Response, send_from_directory, session
from flask_login import login_required, current_user, logout_user

from app.translations import _
from app.forms import ProfileForm, SettingsForm
from app.limiter import limiter
from app.logger import log
from app.routes.helpers import process_avatar, process_chat_image, is_allowed_image, _require_chat_participant
from app.push import send_notification_push
from app.repositories.user_repository import UserRepository
from app.repositories.push_repository import PushRepository
from app.services import PostService, FeedService, ChatService, NotificationService, SocialService
from app.services.base import ServiceError, NotFoundError, ForbiddenError

main_bp = Blueprint('main', __name__, template_folder='../templates')


@main_bp.route('/')
@main_bp.route('/index')
def index() -> Response:
    search_query = request.args.get('q', '').strip().lower()
    tag_filter = request.args.get('tag', '').strip().lower()
    sort_by = request.args.get('sort', 'new').strip().lower()
    page = request.args.get('page', 1, type=int)
    per_page = current_app.config.get('POSTS_PER_PAGE', 15)
    followed_only = request.args.get('followed') == '1'

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
    try:
        try:
            user = SocialService.get_user(int(user_id_or_username))
        except (ValueError, TypeError):
            user = SocialService.get_user_by_username(user_id_or_username)
    except NotFoundError:
        abort(404, description='Такого пользователя не существует')
    is_following = user.is_followed_by(current_user) if current_user.is_authenticated else False
    return render_template('main/profile.html', user=user, is_following=is_following)


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

            UserRepository.commit()
            flash(_('Profile updated!'), 'success')
            return redirect(url_for('main.profile', user_id_or_username=current_user.username))

        except Exception:
            UserRepository.rollback()
            flash(_('Error updating profile'), 'danger')

    elif request.method == 'GET':
        form.description.data = current_user.description

    return render_template('main/edit_profile.html', form=form)


@main_bp.route('/follow/<username>', methods=['POST'])
@login_required
@limiter.limit("20/minute")
def follow_toggle(username: str) -> Response:
    try:
        # Look up target first for push notification and followers_count
        target = SocialService.get_user_by_username(username)
        result = SocialService.toggle_follow(current_user.id, username)
        followed = result['followed']

        # Send push notification for new follows
        if followed:
            try:
                send_notification_push(target.id, current_user.username, 'follow')
            except Exception:
                log.warning('push notification failed')

        return jsonify({
            'status': 'followed' if followed else 'unfollowed',
            'followers_count': target.followers_count
        })
    except NotFoundError:
        return jsonify({'error': 'Пользователь не найден'}), 404
    except ServiceError as e:
        return jsonify({'error': e.message}), e.status_code


@main_bp.route('/followers/<username>')
def followers_page(username: str) -> Response:
    try:
        user = SocialService.get_user_by_username(username)
    except NotFoundError:
        abort(404)
    follows = UserRepository.get_followers(user.id)
    return render_template('main/followers.html', user=user, follows=follows)


@main_bp.route('/following/<username>')
def following_page(username: str) -> Response:
    try:
        user = SocialService.get_user_by_username(username)
    except NotFoundError:
        abort(404)
    follows = UserRepository.get_following(user.id)
    return render_template('main/following.html', user=user, follows=follows)


@main_bp.route('/saved')
@login_required
def saved_posts() -> Response:
    from app.repositories.post_repository import PostRepository
    page = request.args.get('page', 1, type=int)
    saved = PostRepository.get_saved_posts_query(current_user.id) \
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
    count = NotificationService.unread_count(current_user.id)
    return jsonify({'count': count})


@main_bp.route('/api/notifications')
@login_required
def notifications_list() -> Response:
    """Get notifications for the current user (cursor-based pagination)."""
    cursor = request.args.get('cursor', None, type=int)
    limit = min(request.args.get('limit', 10, type=int) or 10, 50)

    notifications, next_cursor, has_more = NotificationService.get_notifications(
        current_user.id, cursor=cursor, limit=limit
    )

    return jsonify({
        'notifications': [{
            'id': n.id,
            'type': n.type,
            'actor': {
                'id': n._actor.id,
                'username': n._actor.username,
                'profile_image': n._actor.profile_image
            } if getattr(n, '_actor', None) else None,
            'post_id': n.post_id,
            'text': n.text,
            'is_read': n.is_read,
            'created_date': n.created_date.isoformat()
        } for n in notifications],
        'cursor': next_cursor,
        'has_more': has_more,
        'limit': limit,
    })


# API endpoint for saved posts (JSON, for terminal inline)
@main_bp.route('/api/saved')
@login_required
def api_saved_posts() -> Response:
    """Get saved posts for the current user."""
    cursor = request.args.get('cursor', None, type=int)
    limit = min(request.args.get('limit', 15, type=int) or 15, 50)

    saved, next_cursor, has_more = PostService.get_saved_posts(
        current_user.id, cursor=cursor, limit=limit
    )

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
        } for s in saved],
        'cursor': next_cursor,
        'has_more': has_more,
        'limit': limit,
    })


# API endpoint for feed (JSON, for terminal inline — independent from GUI DOM)
@main_bp.route('/api/feed')
def api_feed() -> Response:
    """Public feed — list non-deleted posts (cursor-based pagination)."""
    cursor = request.args.get('cursor', None, type=int)
    limit = min(request.args.get('limit', 20, type=int) or 20, 100)

    posts, next_cursor, has_more = FeedService.get_feed(
        user_id=current_user.id if current_user.is_authenticated else None,
        cursor=cursor,
        limit=limit,
    )

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
        } for p in posts],
        'cursor': next_cursor,
        'has_more': has_more,
        'limit': limit,
    })


# API endpoint for followers list (JSON, for terminal inline)
@main_bp.route('/api/followers/<username>')
@login_required
def api_followers(username: str) -> Response:
    user = UserRepository.get_by_username(username)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    follows = UserRepository.get_followers(user.id)
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
    user = UserRepository.get_by_username(username)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    follows = UserRepository.get_following(user.id)
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
    NotificationService.mark_all_read(current_user.id)
    return jsonify({'status': 'success'})


@main_bp.route('/notifications/<int:notification_id>/mark-read', methods=['POST'])
@login_required
def notification_mark_read(notification_id: int) -> Response:
    try:
        NotificationService.mark_read(notification_id, current_user.id)
        return jsonify({'status': 'success'})
    except NotFoundError:
        abort(404)


@main_bp.route('/notifications')
@login_required
def notifications_page() -> Response:
    return render_template('main/notifications.html')


# Push-уведомления API
@main_bp.route('/api/push/subscribe', methods=['POST'])
@login_required
def push_subscribe() -> Response:
    """Сохранить подписку на push-уведомления."""
    from app.repositories.push_repository import PushRepository

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

        PushRepository.upsert(current_user.id, endpoint, p256dh, auth)
        return jsonify({'status': 'subscribed'})

    except Exception as e:
        PushRepository.rollback()
        return jsonify({'error': str(e)}), 500


@main_bp.route('/api/push/unsubscribe', methods=['POST'])
@login_required
def push_unsubscribe() -> Response:
    """Удалить подписку на push-уведомления."""
    from app.repositories.push_repository import PushRepository

    try:
        data = request.get_json()
        endpoint = data.get('endpoint') if data else None

        if endpoint:
            PushRepository.delete_by_endpoint(current_user.id, endpoint)
        else:
            PushRepository.delete_all_user(current_user.id)

        return jsonify({'status': 'unsubscribed'})

    except Exception as e:
        PushRepository.rollback()
        return jsonify({'error': str(e)}), 500


# Chat routes
@main_bp.route('/chat/start/<username>', methods=['POST'])
@login_required
def chat_start(username: str) -> Response:
    try:
        result = ChatService.start_or_get_chat(current_user.id, username)
        return jsonify(result)
    except NotFoundError as e:
        return jsonify({'error': e.message}), 404
    except ServiceError as e:
        return jsonify({'error': e.message}), e.status_code
    except Exception:
        log.exception('chat_start failed')
        return jsonify({'error': 'Internal server error'}), 500


@main_bp.route('/chat/<int:chat_id>/messages')
@login_required
def chat_messages(chat_id: int) -> Response:
    try:
        after = request.args.get('after', 0, type=int)
        before = request.args.get('before', 0, type=int)
        ts = request.args.get('ts', '', type=str)
        limit = min(request.args.get('limit', 50, type=int) or 50, 200)

        result = ChatService.get_messages(
            chat_id=chat_id,
            user_id=current_user.id,
            after=after,
            before=before,
            ts=ts,
            limit=limit,
        )

        # Enrich messages with author info (who is not available from service)
        other_user_info = result.get('other_user')
        for msg_list_key in ('messages', 'updates'):
            for msg in result[msg_list_key]:
                if msg['author_id'] == current_user.id:
                    msg['author'] = {
                        'id': current_user.id,
                        'username': current_user.username,
                        'profile_image': current_user.profile_image,
                    }
                elif other_user_info:
                    msg['author'] = {
                        'id': other_user_info['id'],
                        'username': other_user_info['username'],
                        'profile_image': other_user_info['profile_image'],
                    }
                if msg.get('image'):
                    msg['image_url'] = url_for(
                        'main.chat_image', chat_id=chat_id, filename=msg['image']
                    )

        return jsonify(result)

    except ForbiddenError:
        return jsonify({'error': 'Access denied'}), 403


@main_bp.route('/chat/<int:chat_id>/send', methods=['POST'])
@login_required
@limiter.limit("60/minute")
def chat_send(chat_id: int) -> Response:
    try:
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

        msg = ChatService.send_message(
            chat_id, current_user.id, text=text, image_filename=image_filename
        )

        return jsonify({
            'message': {
                'id': msg.id,
                'text': text or '',
                'image': image_filename,
                'image_url': url_for('main.chat_image', chat_id=chat_id, filename=image_filename) if image_filename else None,
                'created_date': msg.created_date.isoformat(),
                'is_read': msg.is_read,
                'edited_at': None,
                'is_deleted': False,
                'author': {
                    'id': current_user.id,
                    'username': current_user.username,
                    'profile_image': current_user.profile_image,
                }
            }
        })

    except ForbiddenError:
        return jsonify({'error': _('Access denied')}), 403
    except NotFoundError:
        abort(404)
    except ServiceError as e:
        return jsonify({'error': e.message}), e.status_code


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
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'error': _('Invalid request')}), 400
        text = data.get('text', '').strip()
        if not text:
            return jsonify({'error': _('Message cannot be empty')}), 400

        msg = ChatService.edit_message(chat_id, message_id, current_user.id, text)

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
                    'profile_image': current_user.profile_image,
                }
            }
        })

    except ForbiddenError:
        return jsonify({'error': _('Access denied')}), 403
    except NotFoundError:
        abort(404)
    except ServiceError as e:
        return jsonify({'error': e.message}), e.status_code


@main_bp.route('/chat/<int:chat_id>/messages/<int:message_id>', methods=['DELETE'])
@login_required
def chat_delete_message(chat_id: int, message_id: int) -> Response:
    """Delete a message (author only)."""
    try:
        ChatService.delete_message(chat_id, message_id, current_user.id)
        return jsonify({'status': 'deleted'})
    except ForbiddenError:
        return jsonify({'error': _('Access denied')}), 403
    except NotFoundError:
        abort(404)


@main_bp.route('/chat/<int:chat_id>/typing', methods=['POST'])
@login_required
def chat_typing(chat_id: int) -> Response:
    try:
        ChatService.set_typing(chat_id, current_user.id)
        return jsonify({'status': 'ok'})
    except ForbiddenError:
        return jsonify({'error': 'Access denied'}), 403


@main_bp.route('/api/chat/list')
@login_required
def chat_list() -> Response:
    try:
        chats = ChatService.get_chat_list(current_user.id)
        return jsonify({'chats': chats})
    except Exception:
        log.exception('chat_list failed')
        return jsonify({'error': 'Internal server error'}), 500


@main_bp.route('/api/users/search')
def search_users() -> Response:
    query = request.args.get('q', '').strip().lower()
    if not query:
        return jsonify({'users': []})

    users = SocialService.search_users(query, limit=10)

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
    tags = FeedService.search_tags(query, limit=10)
    return jsonify({
        'tags': [{'name': t.name, 'post_count': t.post_count} for t in tags]
    })


@main_bp.route('/api/tags/trending')
def tags_trending() -> Response:
    """Топ-10 популярных тегов."""
    tags = FeedService.get_trending_tags(limit=10)
    return jsonify({
        'tags': [{'name': t.name, 'post_count': t.post_count} for t in tags]
    })


@main_bp.route('/settings', methods=['GET', 'POST'])
@login_required
def settings() -> Response:
    form = SettingsForm()

    # Pre-populate form with current user data
    form.new_username.data = current_user.username
    form.new_email.data = current_user.email
    form.language.data = session.get('lang', 'en')
    form.notifications_enabled.data = current_user.notifications_enabled
    form.notify_on_like.data = current_user.notify_on_like
    form.notify_on_comment.data = current_user.notify_on_comment
    form.notify_on_follow.data = current_user.notify_on_follow
    form.notify_on_message.data = current_user.notify_on_message

    if form.validate_on_submit():
        try:
            # Lowercase username before any checks so validator doesn't reject current value
            if form.new_username.data:
                form.new_username.data = form.new_username.data.lower()

            # Проверка текущего пароля
            if not current_user.check_password(form.current_password.data):
                flash(_('Current password is incorrect'), 'danger')
                return render_template('main/settings.html', form=form)

            # Обновление логина
            if form.new_username.data and form.new_username.data != current_user.username:
                if UserRepository.username_exists(form.new_username.data):
                    flash(_('This username is already taken'), 'danger')
                    return render_template('main/settings.html', form=form)

                current_user.username = form.new_username.data.lower()
                flash(_('Username changed'), 'success')

            # Обновление email
            if form.new_email.data and form.new_email.data != current_user.email:
                if UserRepository.email_exists(form.new_email.data):
                    flash(_('This email is already registered'), 'danger')
                    return render_template('main/settings.html', form=form)

                current_user.email = form.new_email.data
                flash(_('Email updated'), 'success')

            # Обновление пароля
            if form.new_password.data:
                current_user.set_password(form.new_password.data)
                flash(_('Password changed'), 'success')

            # Обновление языка
            lang = form.language.data
            if lang in ('en', 'ru'):
                session['lang'] = lang

            # Обновление настроек уведомлений
            new_value = form.notifications_enabled.data
            old_value = current_user.notifications_enabled
            current_user.notifications_enabled = new_value

            if new_value != old_value:
                if new_value:
                    flash(_('Notifications enabled'), 'success')
                else:
                    PushRepository.delete_all_user(current_user.id)
                    flash(_('Notifications disabled'), 'info')

            # Обновление типов уведомлений
            current_user.notify_on_like = form.notify_on_like.data
            current_user.notify_on_comment = form.notify_on_comment.data
            current_user.notify_on_follow = form.notify_on_follow.data
            current_user.notify_on_message = form.notify_on_message.data

            UserRepository.commit()

            flash(_('Settings saved'), 'success')

            # Удаление аккаунта
            if form.delete_account.data:
                SocialService.delete_user_account(current_user.id)
                logout_user()
                flash(_('Account deleted'), 'success')
                return redirect(url_for('auth.login'))

            # Preserve active tab across redirect
            active_tab = request.form.get('active_tab', 'account')
            return redirect(url_for('main.settings', saved='1', tab=active_tab))

        except Exception:
            UserRepository.rollback()
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
    from app.repositories.post_repository import PostRepository
    from app.repositories.user_repository import UserRepository

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
    users_with_posts = UserRepository.get_users_with_posts()
    for user in users_with_posts:
        posts = PostRepository.get_user_posts_query(user.id)
        last_post = posts.first()
        lastmod = last_post.created_date if last_post else None
        add_url(f'{base_url}/profile/{user.username}', lastmod=lastmod, priority='0.8', changefreq='weekly')

    # All non-deleted posts
    posts = PostRepository.get_all_active_posts()
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
