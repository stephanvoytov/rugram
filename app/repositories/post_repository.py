"""Post repository — data access for posts, comments, likes, saves, reposts, tags."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import func, desc as sql_desc
from sqlalchemy.orm import joinedload

from app.models import (
    Post, Comment, Like, Repost, SavedPost, PostTag, Tag, db,
)
from app.repositories.base import BaseRepository


class PostRepository(BaseRepository):
    """Data access for Post and related models."""

    model = Post

    # ── Post CRUD ──────────────────────────────────────────────────

    @classmethod
    def get_with_author(cls, post_id: int) -> Post | None:
        return Post.query.options(joinedload(Post.author)).filter(
            Post.id == post_id
        ).first()

    @classmethod
    def create_post(cls, author_id: int, text: str,
                    image: Optional[str] = None) -> Post:
        post = Post(text=text, image=image, author_id=author_id)
        cls.add(post)
        cls.flush()
        return post

    @classmethod
    def delete_post_hard(cls, post: Post) -> None:
        """Hard delete (used only for tests)."""
        cls.delete(post)
        cls.commit()

    # ── Feed queries ───────────────────────────────────────────────

    @classmethod
    def get_feed_query(
        cls,
        user_id: Optional[int] = None,
        followed_only: bool = False,
        tag_filter: Optional[str] = None,
        search_query: Optional[str] = None,
        sort_by: str = 'new',
    ):
        """Build the base feed query with all filters applied. Returns query."""
        base = Post.query.options(joinedload(Post.author)).filter(
            Post.is_deleted == False
        )

        if followed_only and user_id:
            from app.models import Follow
            followed_sub = db.session.query(Follow.followed_id).filter(
                Follow.follower_id == user_id
            ).scalar_subquery()
            base = base.filter(
                (Post.author_id.in_(followed_sub)) | (Post.author_id == user_id)
            )

        if tag_filter:
            base = base.join(PostTag).join(Tag).filter(Tag.name == tag_filter)

        if search_query:
            base = base.filter(Post.text.ilike(f'%{search_query}%'))

        if sort_by == 'hot':
            order = sql_desc(
                Post.likes_count + Post.comments_count * 2 + Post.reposts_count * 3
            )
        elif sort_by == 'top':
            order = sql_desc(
                Post.likes_count + Post.comments_count + Post.reposts_count
            )
        else:
            order = Post.id.desc()

        return base.order_by(order)

    @classmethod
    def get_user_posts_query(cls, user_id: int):
        return Post.query.filter_by(author_id=user_id, is_deleted=False) \
            .options(joinedload(Post.author)).order_by(Post.id.desc())

    # ── Likes ──────────────────────────────────────────────────────

    @classmethod
    def get_like(cls, user_id: int, post_id: int) -> Like | None:
        return Like.query.filter_by(user_id=user_id, post_id=post_id).first()

    @classmethod
    def add_like(cls, user_id: int, post_id: int) -> Like:
        like = Like(user_id=user_id, post_id=post_id)
        cls.add(like)
        return like

    @classmethod
    def delete_like(cls, like: Like) -> None:
        cls.delete(like)

    # ── Comments ───────────────────────────────────────────────────

    @classmethod
    def get_comment(cls, comment_id: int) -> Comment | None:
        return db.session.get(Comment, comment_id)

    @classmethod
    def add_comment(cls, post_id: int, user_id: int, text: str) -> Comment:
        comment = Comment(text=text, author_id=user_id, post_id=post_id)
        cls.add(comment)
        return comment

    @classmethod
    def delete_comment_hard(cls, comment: Comment) -> None:
        cls.delete(comment)

    # ── Reposts ────────────────────────────────────────────────────

    @classmethod
    def get_repost(cls, user_id: int, post_id: int) -> Repost | None:
        return Repost.query.filter_by(user_id=user_id, post_id=post_id).first()

    @classmethod
    def add_repost(cls, user_id: int, post_id: int) -> Repost:
        repost = Repost(user_id=user_id, post_id=post_id)
        cls.add(repost)
        return repost

    @classmethod
    def delete_repost(cls, repost: Repost) -> None:
        cls.delete(repost)

    # ── Saves ──────────────────────────────────────────────────────

    @classmethod
    def get_save(cls, user_id: int, post_id: int) -> SavedPost | None:
        return SavedPost.query.filter_by(user_id=user_id, post_id=post_id).first()

    @classmethod
    def add_save(cls, user_id: int, post_id: int) -> SavedPost:
        save = SavedPost(user_id=user_id, post_id=post_id)
        cls.add(save)
        return save

    @classmethod
    def delete_save(cls, save: SavedPost) -> None:
        cls.delete(save)

    @classmethod
    def get_saved_posts_query(cls, user_id: int):
        return SavedPost.query.filter_by(user_id=user_id) \
            .options(joinedload(SavedPost.post).joinedload(Post.author)) \
            .order_by(SavedPost.id.desc())

    # ── Tags ───────────────────────────────────────────────────────

    @classmethod
    def search_tags(cls, query_str: str, limit: int = 10) -> list[Tag]:
        if not query_str:
            return []
        return Tag.query.filter(
            Tag.name.ilike(f'{query_str}%')
        ).order_by(Tag.post_count.desc()).limit(limit).all()

    @classmethod
    def get_trending_tags(cls, limit: int = 10) -> list[Tag]:
        return Tag.query.filter(Tag.post_count > 0) \
            .order_by(Tag.post_count.desc()).limit(limit).all()

    @classmethod
    def get_tag_by_name(cls, name: str) -> Tag | None:
        return Tag.query.filter(Tag.name == name).first()

    @classmethod
    def get_or_create_tag(cls, name: str) -> Tag:
        tag = cls.get_tag_by_name(name)
        if not tag:
            tag = Tag(name=name)
            cls.add(tag)
            cls.flush()
        return tag

    @classmethod
    def sync_tags(cls, post_id: int, tag_names: list[str]) -> None:
        """Delete old PostTags and create new ones for a post."""
        PostTag.query.filter(PostTag.post_id == post_id).delete()
        for name in tag_names:
            tag = cls.get_or_create_tag(name)
            cls.add(PostTag(post_id=post_id, tag_id=tag.id))
        cls.flush()
        cls._recalc_tag_counts()

    @classmethod
    def _recalc_tag_counts(cls) -> None:
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

    @classmethod
    def get_posts_by_tag_query(cls, tag_name: str):
        return Post.query.options(joinedload(Post.author)) \
            .filter(Post.is_deleted == False) \
            .join(PostTag).join(Tag).filter(Tag.name == tag_name) \
            .order_by(Post.id.desc())

    # ── Comment repository methods (for PostRepository access) ─────

    # Comment is handled via generic get/delete from BaseRepository
    # since we already have get_comment, add_comment, delete_comment_hard
