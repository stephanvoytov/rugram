"""Feed service — feed queries, search, trending tags, cursor pagination.

Uses repositories for all data access — no direct db.session or Model.query calls.
"""

import time

from app.repositories.post_repository import PostRepository
from app.services.base import cursor_paginate


class FeedService:
    """Feed queries, search, trending tags."""

    _feed_cache: dict = {}  # noqa: RUF012
    _CACHE_TTL = 30  # seconds

    @classmethod
    def _cache_get(cls, key: tuple):
        """Get cached value if fresh."""
        if key not in cls._feed_cache:
            return None
        value, ts = cls._feed_cache[key]
        if time.monotonic() - ts > cls._CACHE_TTL:
            del cls._feed_cache[key]
            return None
        return value

    @classmethod
    def _cache_set(cls, key: tuple, value):
        """Store in cache."""
        cls._feed_cache[key] = (value, time.monotonic())
        # Evict oldest if cache grows too large (simple safeguard)
        if len(cls._feed_cache) > 500:
            oldest = min(cls._feed_cache.keys(), key=lambda k: cls._feed_cache[k][1])
            del cls._feed_cache[oldest]

    @classmethod
    def invalidate_feed_cache(cls):
        """Clear the feed cache (call when a new post is created)."""
        cls._feed_cache.clear()

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

    @classmethod
    def get_feed(
        cls,
        user_id: int | None = None,
        followed_only: bool = False,
        tag_filter: str | None = None,
        search_query: str | None = None,
        sort_by: str = "new",
        cursor: int | None = None,
        limit: int = 15,
    ) -> tuple:
        """Return (posts, next_cursor, has_more) for the main feed.

        Results are cached in-memory for up to 30 seconds.
        Cache is invalidated when a new post is created/liked/commented.
        """
        cache_key = (user_id, followed_only, tag_filter, search_query, sort_by, cursor, limit)
        cached = cls._cache_get(cache_key)
        if cached is not None:
            return cached
        query = PostRepository.get_feed_query(
            user_id=user_id,
            followed_only=followed_only,
            tag_filter=tag_filter,
            search_query=search_query,
            sort_by=sort_by,
        )
        result = cursor_paginate(query, cursor, limit)
        cls._cache_set(cache_key, result)
        return result

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
