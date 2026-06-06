"""Feed service — feed queries, search, trending tags, cursor pagination.

Uses repositories for all data access — no direct db.session or Model.query calls.
Feed results are cached via Redis (optional — falls back to no cache).
"""

from app.cache import cache_get, cache_set, feed_cache_clear, feed_cache_key
from app.models import Post
from app.repositories.post_repository import PostRepository
from app.services.base import cursor_paginate


class FeedService:
    """Feed queries, search, trending tags."""

    _CACHE_TTL = 30  # seconds

    @classmethod
    def invalidate_feed_cache(cls):
        """Clear the feed cache (call when a new post is created/edited/deleted).

        Bumps the version counter — all existing cache keys become stale
        and will be replaced on next request.
        """
        feed_cache_clear()

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

        Results are cached in Redis for up to 30 seconds (if configured).
        Cache is invalidated when a new post is created/liked/commented.
        Falls back to no cache if Redis is unavailable.
        """
        cache_key = feed_cache_key(
            user_id=user_id,
            followed_only=followed_only,
            tag_filter=tag_filter,
            search_query=search_query,
            sort_by=sort_by,
            cursor=cursor,
            limit=limit,
        )
        cached = cache_get(cache_key)
        if cached is not None:
            # Cache stores post IDs — re-hydrate from DB on hit
            post_ids = cached["ids"]
            next_cursor = cached["nc"]
            has_more = cached["hm"]
            if post_ids:
                posts = PostRepository.filter(Post.id.in_(post_ids))
                # Preserve cursor order
                order = {pid: i for i, pid in enumerate(post_ids)}
                posts.sort(key=lambda p: order.get(p.id, 0))
            else:
                posts = []
            return posts, next_cursor, has_more

        query = PostRepository.get_feed_query(
            user_id=user_id,
            followed_only=followed_only,
            tag_filter=tag_filter,
            search_query=search_query,
            sort_by=sort_by,
        )
        result = cursor_paginate(query, cursor, limit)
        posts, next_cursor, has_more = result
        # Cache only post IDs + cursor (lightweight, no serialization issues)
        cache_set(
            cache_key,
            {"ids": [p.id for p in posts], "nc": next_cursor, "hm": has_more},
            ttl=cls._CACHE_TTL,
        )
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
