"""Push-уведомления: отправка через Web Push Protocol."""

import json
import logging

from flask import current_app
from py_vapid import Vapid
from pywebpush import webpush, WebPushException

from app.models import PushSubscription, User, utcnow
from extensions import db

logger = logging.getLogger(__name__)

# Кешируем Vapid Instance — создаётся один раз
_vapid_instance: Vapid | None = None


def _get_vapid() -> Vapid | None:
    """Вернуть Vapid instance из приватного ключа в конфиге."""
    global _vapid_instance
    if _vapid_instance is not None:
        return _vapid_instance
    key = current_app.config.get('VAPID_PRIVATE_KEY')
    if not key:
        return None
    try:
        _vapid_instance = Vapid.from_string(key)
        return _vapid_instance
    except Exception as e:
        logger.error(f'Failed to create Vapid instance: {e}')
        return None


def get_vapid_claims():
    """VAPID claims for push subscription."""
    return current_app.config.get('VAPID_CLAIMS', {'sub': 'mailto:admin@rugram.app'})


def send_push_to_user(user_id, title, body, url='/', tag=None, chat_id=None, notification_id=None):
    """Отправить push-уведомление всем подпискам пользователя."""
    # Проверяем, включены ли уведомления у пользователя
    user = User.query.get(user_id)
    if user and not user.notifications_enabled:
        logger.debug(f'Push notifications disabled for user {user_id}')
        return False

    subscriptions = PushSubscription.query.filter_by(user_id=user_id).all()
    if not subscriptions:
        logger.debug(f'No push subscriptions for user {user_id}')
        return False

    payload = {
        'title': title,
        'body': body,
        'tag': tag or 'rugram-default',
        'url': url,
        'chatId': chat_id,
        'notificationId': notification_id,
    }
    payload_bytes = json.dumps(payload).encode('utf-8')

    vapid = _get_vapid()
    if not vapid:
        logger.debug(f'VAPID not configured, skipping push to user {user_id}')
        return False

    sent_any = False
    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    'endpoint': sub.endpoint,
                    'keys': {
                        'p256dh': sub.p256dh_key,
                        'auth': sub.auth_key,
                    }
                },
                data=payload_bytes,
                vapid_private_key=vapid,
                vapid_claims=get_vapid_claims(),
                content_encoding='aes128gcm',
            )
            sent_any = True
        except WebPushException as e:
            # If subscription expired or invalid — remove it
            if e.response and e.response.status_code in (404, 410):
                logger.info(f'Removing expired push subscription for user {user_id}')
                db.session.delete(sub)
                db.session.commit()
            else:
                logger.warning(f'Push send failed for user {user_id}: {e}')
        except Exception as e:
            logger.error(f'Unexpected push error for user {user_id}: {e}')

    return sent_any


def send_message_push(chat_id, recipient_id, sender_username, message_preview):
    """Отправить push при новом сообщении."""
    url = '/chat'
    send_push_to_user(
        user_id=recipient_id,
        title=sender_username,
        body=message_preview[:120],
        url=url,
        tag=f'chat-{chat_id}',
        chat_id=chat_id,
    )


def send_notification_push(user_id, actor_username, notification_type, post_id=None):
    """Отправить push при новом уведомлении (лайк, комментарий, подписка)."""
    type_labels = {
        'like': 'поставил(а) лайк',
        'comment': 'оставил(а) комментарий',
        'follow': 'подписался(ась) на вас',
    }
    label = type_labels.get(notification_type, notification_type)
    body = f'{actor_username} {label}'
    url = f'/notifications'

    send_push_to_user(
        user_id=user_id,
        title='Rugram',
        body=body,
        url=url,
        tag=f'notification-{notification_type}',
    )
