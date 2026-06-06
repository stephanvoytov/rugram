"""Notification service — create, list, mark read, count unread."""

from typing import Optional

from app.models import Notification, User, utcnow
from app.services.base import ServiceError, NotFoundError, cursor_paginate
from extensions import db


class NotificationService:
    """Business logic for user notifications."""

    @staticmethod
    def get_notifications(
        user_id: int,
        cursor: Optional[int] = None,
        limit: int = 20,
        unread_only: bool = False,
    ) -> tuple:
        """Return (notifications, next_cursor, has_more) with actor info."""
        query = Notification.query.filter_by(user_id=user_id) \
            .order_by(Notification.id.desc())

        if unread_only:
            query = query.filter(Notification.is_read == False)

        items, next_cursor, has_more = cursor_paginate(query, cursor, limit)

        # Eager load actor info
        if items:
            actor_ids = {n.actor_id for n in items if n.actor_id}
            actors = User.query.filter(User.id.in_(actor_ids)).all()
            actor_map = {u.id: u for u in actors}
            for n in items:
                n._actor = actor_map.get(n.actor_id)

        return items, next_cursor, has_more

    @staticmethod
    def mark_read(notification_id: int, user_id: int) -> Notification:
        notification = Notification.query.filter_by(
            id=notification_id, user_id=user_id
        ).first()
        if not notification:
            raise NotFoundError('Notification not found')
        notification.is_read = True
        notification.read_at = utcnow()
        db.session.commit()
        return notification

    @staticmethod
    def mark_all_read(user_id: int) -> int:
        """Mark all as read. Returns count of affected rows."""
        result = Notification.query.filter_by(
            user_id=user_id, is_read=False
        ).update({'is_read': True})
        db.session.commit()
        return result

    @staticmethod
    def unread_count(user_id: int) -> int:
        return Notification.query.filter_by(
            user_id=user_id, is_read=False
        ).count()

    @staticmethod
    def create_notification(
        user_id: int, actor_id: Optional[int],
        type_: str, post_id: Optional[int] = None,
        comment_id: Optional[int] = None,
    ) -> Notification:
        """Create a notification. Skips if user == actor (self-action)."""
        if actor_id and user_id == actor_id:
            raise ServiceError('Cannot notify yourself')
        notif = Notification(
            user_id=user_id, actor_id=actor_id,
            type=type_, post_id=post_id, comment_id=comment_id,
        )
        db.session.add(notif)
        db.session.commit()
        return notif
