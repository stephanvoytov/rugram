"""Social service — follow/unfollow, user search, profile queries.

Uses repositories for all data access — no direct db.session or Model.query calls.
"""

from typing import Optional

from app.logger import log
from app.models import User, Notification, utcnow
from app.services.base import ServiceError, NotFoundError, cursor_paginate
from app.repositories.user_repository import UserRepository
from app.repositories.notification_repository import NotificationRepository


class SocialService:
    """Business logic for follows, user search, profile."""

    @staticmethod
    def get_user(user_id: int) -> User:
        user = UserRepository.get(user_id)
        if not user:
            raise NotFoundError('User not found')
        return user

    @staticmethod
    def get_user_by_username(username: str) -> User:
        user = UserRepository.get_by_username(username)
        if not user:
            raise NotFoundError('User not found')
        return user

    @staticmethod
    def get_profile(user_id: int, current_user_id: Optional[int] = None) -> dict:
        """Return profile info with follow status."""
        user = SocialService.get_user(user_id)

        followers = UserRepository.get_follower_count(user_id)
        following = UserRepository.get_following_count(user_id)
        is_followed = False
        if current_user_id and current_user_id != user_id:
            is_followed = UserRepository.is_following(current_user_id, user_id)

        return {
            'user': user,
            'followers_count': followers,
            'following_count': following,
            'is_followed': is_followed,
        }

    @staticmethod
    def search_users(query_str: str, limit: int = 20) -> list[User]:
        return UserRepository.search(query_str, limit)

    @staticmethod
    def toggle_follow(follower_id: int, target_username: str) -> dict:
        target = UserRepository.get_by_username(target_username)
        if not target:
            raise NotFoundError('User not found')
        if target.id == follower_id:
            raise ServiceError('Cannot follow yourself')

        existing = UserRepository.get_follow(follower_id, target.id)

        if existing:
            UserRepository.delete_follow(existing)
            UserRepository.commit()
            log.info('unfollow', follower_id=follower_id, followed_id=target.id)
            return {'followed': False}

        UserRepository.add_follow(follower_id, target.id)

        # Create notification for the followed user
        try:
            NotificationRepository.create_notification(
                user_id=target.id, actor_id=follower_id, type_='follow',
            )
        except ServiceError:
            pass  # self-notification not possible here, but safe

        UserRepository.commit()
        log.info('follow', follower_id=follower_id, followed_id=target.id)
        return {'followed': True}

    @staticmethod
    def get_followers(user_id: int, cursor: Optional[int] = None,
                      limit: int = 20) -> tuple:
        query = UserRepository.get_followers_query(user_id)
        items, next_cursor, has_more = cursor_paginate(query, cursor, limit)
        users = [f.follower for f in items]
        return users, next_cursor, has_more

    @staticmethod
    def get_following(user_id: int, cursor: Optional[int] = None,
                      limit: int = 20) -> tuple:
        query = UserRepository.get_following_query(user_id)
        items, next_cursor, has_more = cursor_paginate(query, cursor, limit)
        users = [f.followed for f in items]
        return users, next_cursor, has_more

    @staticmethod
    def get_user_posts(user_id: int, cursor: Optional[int] = None,
                       limit: int = 15) -> tuple:
        """Get posts by a specific user with cursor pagination."""
        from app.repositories.post_repository import PostRepository
        query = PostRepository.get_user_posts_query(user_id)
        return cursor_paginate(query, cursor, limit)
