"""Base class and utilities for the service layer."""


class ServiceError(Exception):
    """Raised by service methods for expected business-logic failures.
    Routes translate these into HTTP responses."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundError(ServiceError):
    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(message, status_code=404)


class ForbiddenError(ServiceError):
    def __init__(self, message: str = "Access denied") -> None:
        super().__init__(message, status_code=403)


def cursor_paginate(query, cursor_id: int | None, limit: int = 20, id_col=None):
    """Cursor-based pagination (faster than OFFSET for large datasets).

    Args:
        query: SQLAlchemy query ordered by id DESC.
        cursor_id: Last seen ID (None = first page).
        limit: Items per page (max 100).
        id_col: ID column to filter on (default: model's 'id').

    Returns:
        (items, next_cursor, has_more)
    """
    max_limit = 100
    limit = min(limit, max_limit)

    if id_col is None:
        model = query.column_descriptions[0]["expr"]
        id_col = model.id

    if cursor_id:
        query = query.filter(id_col < cursor_id)

    raw = query.limit(limit + 1).all()
    has_more = len(raw) > limit
    items = raw[:limit]
    next_cursor = items[-1].id if items else None

    return items, next_cursor, has_more
