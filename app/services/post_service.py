"""Post service — CRUD, likes, comments, reposts, saves, tags."""

from typing import Optional

from sqlalchemy.orm import joinedload

from app.logger import log
from app.models import (
    Post, Like, Comment, Repost, SavedPost, PostTag, Tag, Notification, utcnow,
)
from app.services.base import ServiceError, NotFoundError, ForbiddenError, cursor_paginate
from extensions import db


class PostService:
    """Business logic for posts, likes, comments, reposts, saves, tags."""

    # ── CRUD ──────────────────────────────────────────────────────────

    @staticmethod
    def create_post(author_id: int, text: str, image: Optional[str] = None,
                    tag_names: Optional[list[str]] = None) -> Post:
        if not text or not text.strip():
            raise ServiceError('Post text cannot be empty')
        post = Post(text=text.strip(), image=image, author_id=author_id)
        db.session.add(post)
        db.session.flush()

        # Sync tags
        if tag_names:
            PostService._sync_tags(post.id, tag_names)

        db.session.commit()
        log.info('post_created', post_id=post.id, author_id=author_id)
        return post

    @staticmethod
    def get_post(post_id: int) -> Post:
        post = db.session.get(Post, post_id)
        if not post:
            raise NotFoundError('Post not found')
        return post

    @staticmethod
    def get_post_detail(post_id: int) -> Post:
        """Get post with author eagerly loaded."""
        post = Post.query.options(joinedload(Post.author)).filter(Post.id == post_id).first()
        if not post:
            raise NotFoundError('Post not found')
        return post

    @staticmethod
    def edit_post(post_id: int, user_id: int, text: str,
                  tag_names: Optional[list[str]] = None) -> Post:
        post = PostService.get_post(post_id)
        if post.author_id != user_id:
            raise ForbiddenError('You can only edit your own posts')
        if not text or not text.strip():
            raise ServiceError('Post text cannot be empty')
        post.text = text.strip()
        if tag_names is not None:
            PostService._sync_tags(post.id, tag_names)
        db.session.commit()
        log.info('post_edited', post_id=post_id, author_id=user_id)
        return post

    @staticmethod
    def delete_post(post_id: int, user_id: int) -> None:
        """Soft-delete a post (sets is_deleted = True)."""
        post = PostService.get_post(post_id)
        if post.author_id != user_id:
            raise ForbiddenError('You can only delete your own posts')
        post.is_deleted = True
        db.session.commit()
        log.info('post_deleted', post_id=post_id, author_id=user_id)

    @staticmethod
    def admin_delete_post(post_id: int) -> None:
        post = PostService.get_post(post_id)
        post.is_deleted = True
        db.session.commit()
        log.info('post_admin_deleted', post_id=post_id)

    @staticmethod
    def admin_restore_post(post_id: int) -> None:
        post = PostService.get_post(post_id)
        if not post.is_deleted:
            raise ServiceError('Post is not deleted')
        post.is_deleted = False
        db.session.commit()
        log.info('post_admin_restored', post_id=post_id)

    # ── Likes ─────────────────────────────────────────────────────────

    @staticmethod
    def toggle_like(post_id: int, user_id: int) -> dict:
        post = PostService.get_post(post_id)
        existing = Like.query.filter_by(user_id=user_id, post_id=post_id).first()

        if existing:
            db.session.delete(existing)
            db.session.commit()
            return {'liked': False, 'likes_count': post.likes_count}

        like = Like(user_id=user_id, post_id=post_id)
        db.session.add(like)

        # Notify post author (except self-likes)
        if post.author_id != user_id:
            notification = Notification(
                user_id=post.author_id, actor_id=user_id,
                type='like', post_id=post_id,
            )
            db.session.add(notification)

        db.session.commit()
        return {'liked': True, 'likes_count': post.likes_count}

    # ── Comments ──────────────────────────────────────────────────────

    @staticmethod
    def add_comment(post_id: int, user_id: int, text: str) -> Comment:
        post = PostService.get_post(post_id)
        if not text or not text.strip():
            raise ServiceError('Comment cannot be empty')

        comment = Comment(text=text.strip(), author_id=user_id, post_id=post_id)
        db.session.add(comment)

        # Notify post author
        if post.author_id != user_id:
            notification = Notification(
                user_id=post.author_id, actor_id=user_id,
                type='comment', post_id=post_id,
            )
            db.session.add(notification)

        db.session.commit()
        return comment

    @staticmethod
    def delete_comment(comment_id: int, user_id: int) -> None:
        comment = db.session.get(Comment, comment_id)
        if not comment:
            raise NotFoundError('Comment not found')
        if comment.author_id != user_id:
            raise ForbiddenError('You can only delete your own comments')
        db.session.delete(comment)
        db.session.commit()

    # ── Reposts ───────────────────────────────────────────────────────

    @staticmethod
    def toggle_repost(post_id: int, user_id: int) -> dict:
        PostService.get_post(post_id)  # ensure exists
        existing = Repost.query.filter_by(user_id=user_id, post_id=post_id).first()
        if existing:
            db.session.delete(existing)
            db.session.commit()
            return {'reposted': False}
        db.session.add(Repost(user_id=user_id, post_id=post_id))
        db.session.commit()
        return {'reposted': True}

    # ── Saves ─────────────────────────────────────────────────────────

    @staticmethod
    def toggle_save(post_id: int, user_id: int) -> dict:
        PostService.get_post(post_id)  # ensure exists
        existing = SavedPost.query.filter_by(user_id=user_id, post_id=post_id).first()
        if existing:
            db.session.delete(existing)
            db.session.commit()
            return {'saved': False}
        db.session.add(SavedPost(user_id=user_id, post_id=post_id))
        db.session.commit()
        return {'saved': True}

    @staticmethod
    def get_saved_posts(user_id: int, cursor: Optional[int] = None,
                        limit: int = 15) -> tuple:
        query = SavedPost.query.filter_by(user_id=user_id) \
            .options(joinedload(SavedPost.post).joinedload(Post.author)) \
            .order_by(SavedPost.id.desc())
        return cursor_paginate(query, cursor, limit)

    # ── Tags ──────────────────────────────────────────────────────────

    @staticmethod
    def _sync_tags(post_id: int, tag_names: list[str]) -> None:
        """Sync PostTag relationships — delete old, create new."""
        PostTag.query.filter(PostTag.post_id == post_id).delete()
        for name in tag_names:
            tag = Tag.query.filter(Tag.name == name).first()
            if not tag:
                tag = Tag(name=name)
                db.session.add(tag)
                db.session.flush()
            db.session.add(PostTag(post_id=post_id, tag_id=tag.id))
        db.session.flush()
        PostService._recalc_tag_counts()

    @staticmethod
    def _recalc_tag_counts() -> None:
        from sqlalchemy import func
        counts = db.session.query(
            PostTag.tag_id, func.count(PostTag.id)
        ).group_by(PostTag.tag_id).all()
        active_ids = [t[0] for t in counts]
        for tag_id, cnt in counts:
            Tag.query.filter(Tag.id == tag_id).update({'post_count': cnt})
        if active_ids:
            Tag.query.filter(~Tag.id.in_(active_ids)).update({'post_count': 0})
        else:
            Tag.query.update({'post_count': 0})
