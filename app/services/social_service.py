"""Social service — follow/unfollow, user search, profile queries."""

from typing import Optional

from sqlalchemy.orm import joinedload

from app.logger import log
from app.models import User, Follow, Notification, utcnow
from app.services.base import ServiceError, NotFoundError, cursor_paginate
from extensions import db


class SocialService:
    """Business logic for follows, user search, profile."""

    @staticmethod
    def get_user(user_id: int) -> User:
        user = db.session.get(User, user_id)
        if not user:
            raise NotFoundError('User not found')
        return user

    @staticmethod
    def get_user_by_username(username: str) -> User:
        user = User.query.filter_by(username=username).first()
        if not user:
            raise NotFoundError('User not found')
        return user

    @staticmethod
    def get_profile(user_id: int, current_user_id: Optional[int] = None) -> dict:
        """Return profile info with follow status."""
        user = SocialService.get_user(user_id)

        followers = Follow.query.filter_by(followed_id=user_id).count()
        following = Follow.query.filter_by(follower_id=user_id).count()
        is_followed = False
        if current_user_id and current_user_id != user_id:
            is_followed = Follow.query.filter_by(
                follower_id=current_user_id, followed_id=user_id
            ).first() is not None

        return {
            'user': user,
            'followers_count': followers,
            'following_count': following,
            'is_followed': is_followed,
        }

    @staticmethod
    def search_users(query_str: str, limit: int = 20) -> list[User]:
        if not query_str:
            return []
        return User.query.filter(
            User.username.ilike(f'%{query_str}%')
        ).order_by(User.id.asc()).limit(limit).all()

    @staticmethod
    def toggle_follow(follower_id: int, target_username: str) -> dict:
        target = User.query.filter(User.username == target_username).first()
        if not target:
            raise NotFoundError('User not found')
        if target.id == follower_id:
            raise ServiceError('Cannot follow yourself')

        existing = Follow.query.filter_by(
            follower_id=follower_id, followed_id=target.id
        ).first()

        if existing:
            db.session.delete(existing)
            db.session.commit()
            log.info('unfollow', follower_id=follower_id, followed_id=target.id)
            return {'followed': False}

        follow = Follow(follower_id=follower_id, followed_id=target.id)
        db.session.add(follow)

        # Create notification for the followed user
        notification = Notification(
            user_id=target.id, actor_id=follower_id,
            type='follow',
        )
        db.session.add(notification)
        db.session.commit()
        log.info('follow', follower_id=follower_id, followed_id=target.id)
        return {'followed': True}

    @staticmethod
    def get_followers(user_id: int, cursor: Optional[int] = None,
                      limit: int = 20) -> tuple:
        query = Follow.query.filter_by(followed_id=user_id) \
            .options(joinedload(Follow.follower)) \
            .order_by(Follow.id.desc())
        items, next_cursor, has_more = cursor_paginate(query, cursor, limit)
        users = [f.follower for f in items]
        return users, next_cursor, has_more

    @staticmethod
    def get_following(user_id: int, cursor: Optional[int] = None,
                      limit: int = 20) -> tuple:
        query = Follow.query.filter_by(follower_id=user_id) \
            .options(joinedload(Follow.followed)) \
            .order_by(Follow.id.desc())
        items, next_cursor, has_more = cursor_paginate(query, cursor, limit)
        users = [f.followed for f in items]
        return users, next_cursor, has_more

    @staticmethod
    def get_user_posts(user_id: int, cursor: Optional[int] = None,
                       limit: int = 15) -> tuple:
        """Get posts by a specific user with cursor pagination."""
        from app.models import Post
        query = Post.query.filter_by(author_id=user_id, is_deleted=False) \
            .options(joinedload(Post.author)) \
            .order_by(Post.id.desc())
        return cursor_paginate(query, cursor, limit)
