"""Redis cache wrapper — optional Redis with graceful fallback.

If REDIS_URL is not set, all operations are no-ops.
The app continues to work with zero changes — just slower (no cache).
"""

from __future__ import annotations

import json
import os
from typing import Any

# Lazy import — allow app to start without redis installed
_redis = None

_client = None
_feed_version = 0


def _get_client():
    """Lazy Redis client — returns None if REDIS_URL is not configured."""
    global _client
    if _client is not None:
        return _client
    url = os.environ.get("REDIS_URL")
    if not url:
        return None
    try:
        import redis as _redis_mod

        _client = _redis_mod.from_url(url, decode_responses=True)
        return _client
    except Exception:
        return None


def cache_get(key: str) -> Any | None:
    """Get a JSON value from cache, or None if missing / Redis unavailable."""
    r = _get_client()
    if r is None:
        return None
    val = r.get(key)
    return json.loads(val) if val else None


def cache_set(key: str, value: Any, ttl: int = 30) -> None:
    """Store a JSON value in cache with TTL. No-op if Redis unavailable."""
    r = _get_client()
    if r is None:
        return
    r.setex(key, ttl, json.dumps(value, default=str))


def cache_delete_prefix(prefix: str) -> None:
    """Delete all keys starting with prefix. No-op if Redis unavailable."""
    r = _get_client()
    if r is None:
        return
    cursor = 0
    while True:
        cursor, keys = r.scan(cursor=cursor, match=f"{prefix}*", count=500)
        if keys:
            r.delete(*keys)
        if cursor == 0:
            break


def feed_cache_key(
    user_id: int | None = None,
    followed_only: bool = False,
    tag_filter: str | None = None,
    search_query: str | None = None,
    sort_by: str = "new",
    cursor: int | None = None,
    limit: int = 15,
) -> str:
    """Generate a deterministic cache key for feed queries.

    Includes a version counter so invalidate_feed() busts ALL feed keys
    with a single increment — no SCAN/DELETE needed.
    """
    parts = [
        "feed",
        str(_feed_version),
        str(user_id) if user_id is not None else "",
        "1" if followed_only else "0",
        tag_filter or "",
        search_query or "",
        sort_by,
        str(cursor) if cursor is not None else "",
        str(limit),
    ]
    return ":".join(parts)


def feed_cache_clear() -> None:
    """Bump the feed version — all existing cache keys become stale."""
    global _feed_version
    _feed_version += 1
