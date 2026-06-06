"""Notification repository — data access for user notifications."""

from __future__ import annotations

from app.models import Notification, User
from app.repositories.base import BaseRepository


class NotificationRepository(BaseRepository):
    """Data access for Notification model."""

    model = Notification

    @classmethod
    def get_user_notifications_query(cls, user_id: int, unread_only: bool = False):
        """Return base query for user notifications, ordered by id desc."""
        query = Notification.query.filter_by(user_id=user_id).order_by(Notification.id.desc())
        if unread_only:
            query = query.filter(Notification.is_read == False)  # noqa: E712
        return query

    @classmethod
    def load_actors(cls, notifications: list[Notification]) -> dict[int, User]:
        """Eager-load actor users for a list of notifications.
        Returns {actor_id: User} dict.
        """
        actor_ids = {n.actor_id for n in notifications if n.actor_id}
        if not actor_ids:
            return {}
        actors = User.query.filter(User.id.in_(actor_ids)).all()
        return {u.id: u for u in actors}

    @classmethod
    def get_unread_count(cls, user_id: int) -> int:
        return Notification.query.filter_by(user_id=user_id, is_read=False).count()

    @classmethod
    def create_notification(
        cls, user_id: int, actor_id: int | None, type_: str, post_id: int | None = None
    ) -> Notification:
        notif = Notification(
            user_id=user_id,
            actor_id=actor_id,
            type=type_,
            post_id=post_id,
        )
        cls.add(notif)
        cls.commit()
        return notif

    @classmethod
    def mark_read(cls, notification_id: int, user_id: int) -> Notification | None:
        notification = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
        if not notification:
            return None
        notification.is_read = True
        cls.commit()
        return notification

    @classmethod
    def mark_all_read(cls, user_id: int) -> int:
        result = Notification.query.filter_by(user_id=user_id, is_read=False).update(
            {"is_read": True}
        )
        cls.commit()
        return result
