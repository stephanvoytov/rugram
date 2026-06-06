"""User repository — data access for users, follows, profiles."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import joinedload

from app.models import User, Follow
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository):
    """Data access for User and Follow models."""

    model = User

    # ── User lookups ───────────────────────────────────────────────

    @classmethod
    def get_by_username(cls, username: str) -> User | None:
        return User.query.filter_by(username=username).first()

    @classmethod
    def get_by_email(cls, email: str) -> User | None:
        return User.query.filter_by(email=email).first()

    @classmethod
    def search(cls, query_str: str, limit: int = 20) -> list[User]:
        if not query_str:
            return []
        return User.query.filter(
            User.username.ilike(f'%{query_str}%')
        ).order_by(User.id.asc()).limit(limit).all()

    # ── Follows ────────────────────────────────────────────────────

    @classmethod
    def get_follow(cls, follower_id: int, followed_id: int) -> Follow | None:
        return Follow.query.filter_by(
            follower_id=follower_id, followed_id=followed_id
        ).first()

    @classmethod
    def add_follow(cls, follower_id: int, followed_id: int) -> Follow:
        follow = Follow(follower_id=follower_id, followed_id=followed_id)
        cls.add(follow)
        return follow

    @classmethod
    def delete_follow(cls, follow: Follow) -> None:
        cls.delete(follow)

    @classmethod
    def is_following(cls, follower_id: int, followed_id: int) -> bool:
        return cls.get_follow(follower_id, followed_id) is not None

    @classmethod
    def get_followers_query(cls, user_id: int):
        return Follow.query.filter_by(followed_id=user_id) \
            .options(joinedload(Follow.follower)) \
            .order_by(Follow.id.desc())

    @classmethod
    def get_following_query(cls, user_id: int):
        return Follow.query.filter_by(follower_id=user_id) \
            .options(joinedload(Follow.followed)) \
            .order_by(Follow.id.desc())

    @classmethod
    def get_follower_count(cls, user_id: int) -> int:
        return Follow.query.filter_by(followed_id=user_id).count()

    @classmethod
    def get_following_count(cls, user_id: int) -> int:
        return Follow.query.filter_by(follower_id=user_id).count()

    @classmethod
    def get_following_ids(cls, user_id: int) -> list[int]:
        rows = Follow.query.filter_by(follower_id=user_id).all()
        return [r.followed_id for r in rows]

    # ── Profile ────────────────────────────────────────────────────

    @classmethod
    def update_profile_image(cls, user: User, filename: str) -> None:
        user.profile_image = filename
        cls.commit()
