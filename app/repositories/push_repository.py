"""Push subscription repository — data access for PushSubscription model."""

from __future__ import annotations

from app.models import PushSubscription
from app.repositories.base import BaseRepository


class PushRepository(BaseRepository):
    """Data access for PushSubscription."""

    model = PushSubscription

    @classmethod
    def get_by_user_and_endpoint(cls, user_id: int, endpoint: str) -> PushSubscription | None:
        return cls.model.query.filter_by(user_id=user_id, endpoint=endpoint).first()

    @classmethod
    def upsert(cls, user_id: int, endpoint: str, p256dh: str, auth: str) -> PushSubscription:
        """Find existing or create new subscription."""
        sub = cls.get_by_user_and_endpoint(user_id, endpoint)
        if sub:
            sub.p256dh_key = p256dh
            sub.auth_key = auth
        else:
            sub = PushSubscription(
                user_id=user_id,
                endpoint=endpoint,
                p256dh_key=p256dh,
                auth_key=auth,
            )
            cls.add(sub)
        cls.commit()
        return sub

    @classmethod
    def delete_by_endpoint(cls, user_id: int, endpoint: str) -> None:
        cls.model.query.filter_by(user_id=user_id, endpoint=endpoint).delete()
        cls.commit()

    @classmethod
    def delete_all_user(cls, user_id: int) -> None:
        cls.model.query.filter_by(user_id=user_id).delete()
        cls.commit()

    @classmethod
    def delete_all_for_user_session(cls, user_id: int) -> None:
        cls.model.query.filter_by(user_id=user_id).delete()
        cls.commit()

    @classmethod
    def get_by_user(cls, user_id: int) -> list[PushSubscription]:
        return cls.model.query.filter_by(user_id=user_id).all()
