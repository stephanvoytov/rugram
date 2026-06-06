"""Admin service — business logic for admin panel routes.

Extracted from app/routes/admin.py. Does NOT import Flask.
Uses repositories for all data access, raises ServiceError / NotFoundError / ForbiddenError.
"""

from app.logger import log
from app.models import User
from app.repositories.event_repository import EventRepository
from app.repositories.post_repository import PostRepository
from app.repositories.user_repository import UserRepository
from app.services.base import NotFoundError, ServiceError


class AdminService:
    """Business logic for admin panel — stats, user management, moderation."""

    # ── Dashboard ──────────────────────────────────────────────────────────

    @staticmethod
    def dashboard_stats() -> dict:
        """Aggregate dashboard statistics from all repositories."""
        return {
            "users_total": UserRepository.count(),
            "users_today": UserRepository.get_users_today(),
            "posts_total": PostRepository.get_active_posts_count(),
            "likes_total": PostRepository.get_likes_count(),
            "comments_total": PostRepository.get_comments_count(),
            "follows_total": UserRepository.get_follows_count(),
            "tags_total": EventRepository.get_tag_count(),
        }

    # ── User management ────────────────────────────────────────────────────

    @staticmethod
    def toggle_admin(actor_id: int, target_id: int) -> None:
        """Toggle admin status for a user.

        Raises:
            NotFoundError: target user not found.
            ServiceError: actor is targetting themselves, or last admin guard.
        """
        user = UserRepository.get(target_id)
        if not user:
            raise NotFoundError("User not found")

        if user.id == actor_id:
            raise ServiceError("Cannot change your own admin status")

        if user.is_admin and UserRepository.get_admin_count() <= 1:
            raise ServiceError("Cannot revoke — at least one admin must remain")

        user.is_admin = not user.is_admin
        UserRepository.commit()
        log.info(
            "admin_toggle_admin",
            actor_id=actor_id,
            target_id=target_id,
            new_value=user.is_admin,
        )

    @staticmethod
    def toggle_moderator(actor_id: int, target_id: int) -> None:
        """Toggle moderator status for a user.

        Raises:
            NotFoundError: target user not found.
            ServiceError: actor is trying to remove own mod status.
        """
        user = UserRepository.get(target_id)
        if not user:
            raise NotFoundError("User not found")

        if user.id == actor_id and user.is_moderator:
            raise ServiceError("Cannot remove your own moderator status")

        user.is_moderator = not user.is_moderator
        UserRepository.commit()
        log.info(
            "admin_toggle_moderator",
            actor_id=actor_id,
            target_id=target_id,
            new_value=user.is_moderator,
        )

    @staticmethod
    def delete_user(actor_id: int, target_id: int) -> None:
        """Delete a user account.

        Raises:
            NotFoundError: target user not found.
            ServiceError: actor targeting themselves, or last admin guard.
        """
        user = UserRepository.get(target_id)
        if not user:
            raise NotFoundError("User not found")

        if user.id == actor_id:
            raise ServiceError("Cannot delete your own account")

        if user.is_admin and UserRepository.get_admin_count() <= 1:
            raise ServiceError("Cannot delete — at least one admin must remain")

        username = user.username
        UserRepository.delete_user_cascade(user)
        log.info("admin_delete_user", actor_id=actor_id, target_id=target_id, username=username)

    # ── User listing ───────────────────────────────────────────────────────

    @staticmethod
    def get_user(user_id: int) -> User:
        """Fetch a user or raise NotFoundError."""
        user = UserRepository.get(user_id)
        if not user:
            raise NotFoundError("User not found")
        return user

    @staticmethod
    def search_users(keyword: str):
        """Return a query object for admin user search."""
        return UserRepository.search_users_by_keyword(keyword)

    @staticmethod
    def get_users_paginated(page: int, per_page: int = 30):
        """Return paginated list of all users."""
        return UserRepository.get_all_paginated(page, per_page)

    # ── Post listing (admin) ───────────────────────────────────────────────

    @staticmethod
    def search_posts(keyword: str):
        """Return a query object for admin post search."""
        from app.models import Post

        return PostRepository.filter(Post.text.ilike(f"%{keyword}%"))

    @staticmethod
    def get_posts_paginated(page: int, per_page: int = 30):
        """Return paginated list of all posts."""
        return PostRepository.get_posts_paginated(page, per_page)

    # ── Tags (admin) ───────────────────────────────────────────────────────

    @staticmethod
    def get_tags_paginated(page: int, per_page: int = 50, search: str = ""):
        """Return paginated list of tags."""
        return EventRepository.get_all_tags_paginated(page, per_page, search=search)

    @staticmethod
    def get_tag(tag_id: int):
        """Fetch a tag by id or raise NotFoundError."""
        tag = EventRepository.get_tag(tag_id)
        if not tag:
            raise NotFoundError("Tag not found")
        return tag

    @staticmethod
    def delete_tag(tag_id: int) -> None:
        """Hard delete a tag."""
        tag = AdminService.get_tag(tag_id)
        name = tag.name
        EventRepository.delete_tag_hard(tag_id)
        log.info("admin_delete_tag", tag_id=tag_id, tag_name=name)

    # ── System Events (admin) ──────────────────────────────────────────────

    @staticmethod
    def get_events_page(page: int, per_page: int = 50, level: str = "", category: str = ""):
        """Return paginated system events with optional filters."""
        filters = {}
        if level:
            filters["level"] = level
        if category:
            filters["category"] = category
        pagination = EventRepository.paginate(page=page, per_page=per_page, **filters)
        counts = EventRepository.get_counts()
        return pagination, counts

    @staticmethod
    def mark_event_read(event_id: int) -> None:
        """Mark a single event as read."""
        event = EventRepository.mark_read(event_id)
        if not event:
            raise NotFoundError("Event not found")

    @staticmethod
    def mark_all_events_read() -> None:
        """Mark all events as read."""
        EventRepository.mark_all_read()
