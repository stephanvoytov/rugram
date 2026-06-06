"""Notification service — create, list, mark read, count unread.

Uses repositories for all data access — no direct db.session or Model.query calls.
"""

from app.models import Notification
from app.repositories.notification_repository import NotificationRepository
from app.services.base import NotFoundError, ServiceError, cursor_paginate


class NotificationService:
    """Business logic for user notifications."""

    @staticmethod
    def get_notifications(
        user_id: int,
        cursor: int | None = None,
        limit: int = 20,
        unread_only: bool = False,
    ) -> tuple:
        """Return (notifications, next_cursor, has_more) with actor info."""
        query = NotificationRepository.get_user_notifications_query(
            user_id, unread_only=unread_only
        )
        items, next_cursor, has_more = cursor_paginate(query, cursor, limit)

        # Eager load actor info
        if items:
            actor_map = NotificationRepository.load_actors(items)
            for n in items:
                n._actor = actor_map.get(n.actor_id)

        return items, next_cursor, has_more

    @staticmethod
    def mark_read(notification_id: int, user_id: int) -> Notification:
        notification = NotificationRepository.mark_read(notification_id, user_id)
        if not notification:
            raise NotFoundError("Notification not found")
        return notification

    @staticmethod
    def mark_all_read(user_id: int) -> int:
        """Mark all as read. Returns count of affected rows."""
        return NotificationRepository.mark_all_read(user_id)

    @staticmethod
    def unread_count(user_id: int) -> int:
        return NotificationRepository.get_unread_count(user_id)

    @staticmethod
    def create_notification(
        user_id: int,
        actor_id: int | None,
        type_: str,
        post_id: int | None = None,
    ) -> Notification:
        """Create a notification. Skips if user == actor (self-action)."""
        if actor_id and user_id == actor_id:
            raise ServiceError("Cannot notify yourself")
        return NotificationRepository.create_notification(
            user_id=user_id,
            actor_id=actor_id,
            type_=type_,
            post_id=post_id,
        )
