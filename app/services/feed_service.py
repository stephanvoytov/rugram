"""Feed service — feed queries, search, trending tags, cursor pagination."""

from typing import Optional

from sqlalchemy import desc as sql_desc
from sqlalchemy.orm import joinedload

from app.models import Post, Tag, PostTag, Follow, db
from app.services.base import cursor_paginate


class FeedService:
    """Feed queries, search, trending tags."""

    @staticmethod
    def get_feed(
        user_id: Optional[int] = None,
        followed_only: bool = False,
        tag_filter: Optional[str] = None,
        search_query: Optional[str] = None,
        sort_by: str = 'new',
        cursor: Optional[int] = None,
        limit: int = 15,
    ) -> tuple:
        """Return (posts, next_cursor, has_more) for the main feed.

        Args:
            user_id: Current user (for followed-only filter).
            followed_only: Only show posts from followed users.
            tag_filter: Filter by hashtag (exact match).
            search_query: Full-text search on post text.
            sort_by: 'new' | 'hot' | 'top'
            cursor: Last post ID for cursor pagination.
            limit: Items per page.
        """
        base = Post.query.options(joinedload(Post.author)) \
            .filter(Post.is_deleted == False)

        # Followed-only filter
        if followed_only and user_id:
            followed_sub = db.session.query(Follow.followed_id).filter(
                Follow.follower_id == user_id
            ).scalar_subquery()
            base = base.filter(
                (Post.author_id.in_(followed_sub)) | (Post.author_id == user_id)
            )

        # Tag filter
        if tag_filter:
            base = base.join(PostTag).join(Tag).filter(Tag.name == tag_filter)

        # Search
        if search_query:
            base = base.filter(Post.text.ilike(f'%{search_query}%'))

        # Sorting
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

        query = base.order_by(order)
        return cursor_paginate(query, cursor, limit)

    @staticmethod
    def get_trending_tags(limit: int = 10) -> list[Tag]:
        """Return most-used tags."""
        return Tag.query.filter(Tag.post_count > 0) \
            .order_by(Tag.post_count.desc()).limit(limit).all()

    @staticmethod
    def search_tags(query_str: str, limit: int = 10) -> list[Tag]:
        """Search tags by prefix."""
        if not query_str:
            return []
        return Tag.query.filter(
            Tag.name.ilike(f'{query_str}%')
        ).order_by(Tag.post_count.desc()).limit(limit).all()

    @staticmethod
    def get_posts_by_tag(tag_name: str, cursor: Optional[int] = None,
                         limit: int = 15) -> tuple:
        """Get posts filtered by exact tag."""
        query = Post.query.options(joinedload(Post.author)) \
            .filter(Post.is_deleted == False) \
            .join(PostTag).join(Tag).filter(Tag.name == tag_name) \
            .order_by(Post.id.desc())
        return cursor_paginate(query, cursor, limit)
