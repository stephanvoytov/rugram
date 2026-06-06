"""Post service — CRUD, likes, comments, reposts, saves, tags.

Uses repositories for all data access — no direct db.session or Model.query calls.
"""

import contextlib

from app.logger import log
from app.models import Comment, Post
from app.repositories.notification_repository import NotificationRepository
from app.repositories.post_repository import PostRepository
from app.services.base import ForbiddenError, NotFoundError, ServiceError, cursor_paginate


class PostService:
    """Business logic for posts, likes, comments, reposts, saves, tags."""

    # ── CRUD ──────────────────────────────────────────────────────────

    @staticmethod
    def create_post(
        author_id: int, text: str, image: str | None = None, tag_names: list[str] | None = None
    ) -> Post:
        if not text or not text.strip():
            raise ServiceError("Post text cannot be empty")
        post = PostRepository.create_post(author_id, text.strip(), image)

        if tag_names:
            PostRepository.sync_tags(post.id, tag_names)

        PostRepository.commit()
        log.info("post_created", post_id=post.id, author_id=author_id)
        return post

    @staticmethod
    def get_post(post_id: int) -> Post:
        post = PostRepository.get(post_id)
        if not post:
            raise NotFoundError("Post not found")
        return post

    @staticmethod
    def get_post_detail(post_id: int) -> Post:
        """Get post with author eagerly loaded."""
        post = PostRepository.get_with_author(post_id)
        if not post:
            raise NotFoundError("Post not found")
        return post

    @staticmethod
    def edit_post(
        post_id: int, user_id: int, text: str, tag_names: list[str] | None = None
    ) -> Post:
        post = PostService.get_post(post_id)
        if post.author_id != user_id:
            raise ForbiddenError("You can only edit your own posts")
        if not text or not text.strip():
            raise ServiceError("Post text cannot be empty")
        post.text = text.strip()
        if tag_names is not None:
            PostRepository.sync_tags(post.id, tag_names)
        PostRepository.commit()
        log.info("post_edited", post_id=post_id, author_id=user_id)
        return post

    @staticmethod
    def delete_post(post_id: int, user_id: int) -> None:
        """Soft-delete a post (sets is_deleted = True)."""
        post = PostService.get_post(post_id)
        if post.author_id != user_id:
            raise ForbiddenError("You can only delete your own posts")
        post.is_deleted = True
        PostRepository.commit()
        log.info("post_deleted", post_id=post_id, author_id=user_id)

    @staticmethod
    def admin_delete_post(post_id: int) -> None:
        post = PostService.get_post(post_id)
        post.is_deleted = True
        PostRepository.commit()
        log.info("post_admin_deleted", post_id=post_id)

    @staticmethod
    def admin_restore_post(post_id: int) -> None:
        post = PostService.get_post(post_id)
        if not post.is_deleted:
            raise ServiceError("Post is not deleted")
        post.is_deleted = False
        PostRepository.commit()
        log.info("post_admin_restored", post_id=post_id)

    # ── Likes ─────────────────────────────────────────────────────────

    @staticmethod
    def toggle_like(post_id: int, user_id: int) -> dict:
        post = PostService.get_post(post_id)
        existing = PostRepository.get_like(user_id, post_id)

        if existing:
            PostRepository.delete_like(existing)
            PostRepository.commit()
            return {"liked": False, "likes_count": post.likes_count}

        PostRepository.add_like(user_id, post_id)

        # Notify post author (except self-likes)
        if post.author_id != user_id:
            with contextlib.suppress(ServiceError):
                NotificationRepository.create_notification(
                    user_id=post.author_id,
                    actor_id=user_id,
                    type_="like",
                    post_id=post_id,
                )

        PostRepository.commit()
        return {"liked": True, "likes_count": post.likes_count}

    # ── Comments ──────────────────────────────────────────────────────

    @staticmethod
    def add_comment(post_id: int, user_id: int, text: str) -> Comment:
        post = PostService.get_post(post_id)
        if not text or not text.strip():
            raise ServiceError("Comment cannot be empty")

        comment = PostRepository.add_comment(post_id, user_id, text.strip())

        # Notify post author
        if post.author_id != user_id:
            with contextlib.suppress(ServiceError):
                NotificationRepository.create_notification(
                    user_id=post.author_id,
                    actor_id=user_id,
                    type_="comment",
                    post_id=post_id,
                )

        PostRepository.commit()
        return comment

    @staticmethod
    def edit_comment(comment_id: int, user_id: int, text: str) -> Comment:
        comment = PostRepository.get_comment(comment_id)
        if not comment:
            raise NotFoundError("Comment not found")
        if comment.author_id != user_id:
            raise ForbiddenError("You can only edit your own comments")
        if not text or not text.strip():
            raise ServiceError("Comment cannot be empty")
        comment.text = text.strip()
        PostRepository.commit()
        return comment

    @staticmethod
    def delete_comment(comment_id: int, user_id: int) -> tuple[int, int]:
        """Delete a comment. Returns (post_id, comments_count)."""
        comment = PostRepository.get_comment(comment_id)
        if not comment:
            raise NotFoundError("Comment not found")
        if comment.author_id != user_id:
            raise ForbiddenError("You can only delete your own comments")
        post_id = comment.post_id
        PostRepository.delete_comment_hard(comment)
        PostRepository.commit()
        post = PostRepository.get(post_id)
        comments_count = post.comments_count if post else 0
        return post_id, comments_count

    # ── Reposts ───────────────────────────────────────────────────────

    @staticmethod
    def toggle_repost(post_id: int, user_id: int) -> dict:
        PostService.get_post(post_id)  # ensure exists
        existing = PostRepository.get_repost(user_id, post_id)
        if existing:
            PostRepository.delete_repost(existing)
            PostRepository.commit()
            return {"reposted": False}
        PostRepository.add_repost(user_id, post_id)
        PostRepository.commit()
        return {"reposted": True}

    # ── Saves ─────────────────────────────────────────────────────────

    @staticmethod
    def toggle_save(post_id: int, user_id: int) -> dict:
        PostService.get_post(post_id)  # ensure exists
        existing = PostRepository.get_save(user_id, post_id)
        if existing:
            PostRepository.delete_save(existing)
            PostRepository.commit()
            return {"saved": False}
        PostRepository.add_save(user_id, post_id)
        PostRepository.commit()
        return {"saved": True}

    @staticmethod
    def get_saved_posts(user_id: int, cursor: int | None = None, limit: int = 15) -> tuple:
        query = PostRepository.get_saved_posts_query(user_id)
        return cursor_paginate(query, cursor, limit)

    @staticmethod
    def get_post_counts_by_day(since):
        """Get post creation counts grouped by day (for admin chart)."""
        return PostRepository.get_post_counts_by_day(since)
