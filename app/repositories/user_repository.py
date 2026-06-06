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
    def get_user_counts_by_day(cls, since):
        from sqlalchemy import func
        from app.models import User as UserModel
        return db.session.query(
            func.date(UserModel.created_date).label('day'),
            func.count(UserModel.id)
        ).filter(UserModel.created_date >= since).group_by('day').all()

    @classmethod
    def search_users_by_keyword(cls, keyword: str):
        """Search users by username, email or name (for admin panel)."""
        like = f'%{keyword}%'
        from app.models import User as UserModel
        from extensions import db
        return UserModel.query.filter(
            db.or_(
                UserModel.username.ilike(like),
                UserModel.email.ilike(like),
                UserModel.name.ilike(like),
            )
        )

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
    def get_by_login(cls, login_or_email: str) -> User | None:
        """Find user by username or email."""
        return User.query.filter(
            (User.email == login_or_email) | (User.username == login_or_email)
        ).first()

    @classmethod
    def username_exists(cls, username: str) -> bool:
        return User.query.filter(User.username == username).first() is not None

    @classmethod
    def email_exists(cls, email: str) -> bool:
        return User.query.filter(User.email == email).first() is not None

    @classmethod
    def get_users_with_posts(cls):
        """Return distinct users who have at least one non-deleted post."""
        from app.models import Post
        return cls.model.query \
            .join(Post, Post.author_id == cls.model.id) \
            .filter(Post.is_deleted == False) \
            .distinct().all()

    @classmethod
    def get_followers(cls, user_id: int):
        """Return Follow records for followers of user_id, with follower loaded."""
        from sqlalchemy.orm import joinedload
        return Follow.query.filter_by(followed_id=user_id) \
            .options(joinedload(Follow.follower)) \
            .order_by(Follow.created_date.desc()).all()

    @classmethod
    def get_following(cls, user_id: int):
        """Return Follow records for users followed by user_id, with followed loaded."""
        from sqlalchemy.orm import joinedload
        return Follow.query.filter_by(follower_id=user_id) \
            .options(joinedload(Follow.followed)) \
            .order_by(Follow.created_date.desc()).all()

    @classmethod
    def create_user(cls, username: str, email: str) -> User:
        """Create a User instance (does NOT commit). Caller must set_password."""
        user = User(username=username, email=email)
        cls.add(user)
        return user

    @classmethod
    def delete_user_hard(cls, user: User) -> None:
        cls.delete(user)

    @classmethod
    def get_follows_count(cls) -> int:
        return Follow.query.count()

    @classmethod
    def get_admin_count(cls) -> int:
        return User.query.filter(User.is_admin == True).count()

    @classmethod
    def get_users_today(cls) -> int:
        from app.models import utcnow
        from datetime import timedelta
        today = utcnow().date()
        return User.query.filter(
            User.created_date >= today
        ).count()

    @classmethod
    def delete_user_cascade(cls, user: User) -> None:
        """Delete user and all related records. Handles SQLite cascade limitations."""
        uid = user.id
        from app.models import Like, Comment, Follow, Notification, ChatParticipant, Message, Repost, SavedPost, PushSubscription, Post
        Like.query.filter(Like.user_id == uid).delete()
        Comment.query.filter(Comment.author_id == uid).delete()
        Follow.query.filter((Follow.follower_id == uid) | (Follow.followed_id == uid)).delete()
        Notification.query.filter((Notification.user_id == uid) | (Notification.actor_id == uid)).delete()
        ChatParticipant.query.filter(ChatParticipant.user_id == uid).delete()
        Message.query.filter(Message.author_id == uid).delete()
        Repost.query.filter(Repost.user_id == uid).delete()
        SavedPost.query.filter(SavedPost.user_id == uid).delete()
        PushSubscription.query.filter(PushSubscription.user_id == uid).delete()
        for post in list(user.posts):
            cls.delete(post)
        cls.delete(user)
        cls.commit()

    @classmethod
    def get_all_paginated(cls, page: int = 1, per_page: int = 20):
        return User.query.order_by(User.id.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )

    @classmethod
    def update_profile_image(cls, user: User, filename: str) -> None:
        user.profile_image = filename
        cls.commit()
