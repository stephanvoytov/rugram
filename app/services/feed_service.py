"""Feed service — feed queries, search, trending tags, cursor pagination.

Uses repositories for all data access — no direct db.session or Model.query calls.
"""

from app.repositories.post_repository import PostRepository
from app.services.base import cursor_paginate


class FeedService:
    """Feed queries, search, trending tags."""

    @staticmethod
    def get_feed_page(
        user_id: int | None = None,
        followed_only: bool = False,
        tag_filter: str | None = None,
        search_query: str | None = None,
        sort_by: str = "new",
        page: int = 1,
        per_page: int = 15,
    ):
        """Return a Flask-SQLAlchemy Pagination object for page-based feed."""
        query = PostRepository.get_feed_query(
            user_id=user_id,
            followed_only=followed_only,
            tag_filter=tag_filter,
            search_query=search_query,
            sort_by=sort_by,
        )
        return query.paginate(page=page, per_page=per_page, error_out=False)

    @staticmethod
    def get_feed(
        user_id: int | None = None,
        followed_only: bool = False,
        tag_filter: str | None = None,
        search_query: str | None = None,
        sort_by: str = "new",
        cursor: int | None = None,
        limit: int = 15,
    ) -> tuple:
        """Return (posts, next_cursor, has_more) for the main feed."""
        query = PostRepository.get_feed_query(
            user_id=user_id,
            followed_only=followed_only,
            tag_filter=tag_filter,
            search_query=search_query,
            sort_by=sort_by,
        )
        return cursor_paginate(query, cursor, limit)

    @staticmethod
    def get_trending_tags(limit: int = 10) -> list:
        """Return most-used tags."""
        return PostRepository.get_trending_tags(limit)

    @staticmethod
    def search_tags(query_str: str, limit: int = 10) -> list:
        """Search tags by prefix."""
        return PostRepository.search_tags(query_str, limit)

    @staticmethod
    def get_posts_by_tag(tag_name: str, cursor: int | None = None, limit: int = 15) -> tuple:
        """Get posts filtered by exact tag."""
        query = PostRepository.get_posts_by_tag_query(tag_name)
        return cursor_paginate(query, cursor, limit)
