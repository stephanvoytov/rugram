"""Base repository — common CRUD operations for all repositories.

Repositories encapsulate all SQLAlchemy data-access logic.
Services call repositories, never db.session or Model.query directly.
"""

from __future__ import annotations

from typing import Any, TypeVar

from sqlalchemy import func
from sqlalchemy.orm import DeclarativeBase

from extensions import db

ModelT = TypeVar("ModelT", bound=DeclarativeBase)


class BaseRepository:
    """Common database operations shared by all repositories.

    Usage: subclass and set `model = <SQLAlchemy model class>`.
    """

    model: type[DeclarativeBase]

    # ── Single-record lookups ───────────────────────────────────────

    @classmethod
    def get(cls, id_: int):
        """Fetch by primary key (db.session.get)."""
        return db.session.get(cls.model, id_)

    @classmethod
    def get_by(cls, **kwargs):
        """Fetch first record matching filter_by criteria."""
        return cls.model.query.filter_by(**kwargs).first()

    @classmethod
    def get_or_none(cls, **kwargs):
        """Fetch first record or None (alias for get_by)."""
        return cls.get_by(**kwargs)

    # ── Multi-record lookups ────────────────────────────────────────

    @classmethod
    def filter_by(cls, **kwargs) -> list:
        """Return all records matching filter_by criteria, ordered by id desc."""
        return cls.model.query.filter_by(**kwargs).order_by(cls.model.id.desc()).all()

    @classmethod
    def filter(cls, *args, **kwargs) -> Any:
        """Return a query object for further chaining (order_by, limit, etc.)."""
        return cls.model.query.filter(*args, **kwargs)

    @classmethod
    def all(cls) -> list:
        """Return all records ordered by id desc."""
        return cls.model.query.order_by(cls.model.id.desc()).all()

    @classmethod
    def exists(cls, **kwargs) -> bool:
        """Check if a record matching criteria exists."""
        return cls.model.query.filter_by(**kwargs).first() is not None

    @classmethod
    def count(cls, **kwargs) -> int:
        """Count records matching filter_by criteria."""
        return cls.model.query.filter_by(**kwargs).count()

    # ── Write operations ────────────────────────────────────────────

    @classmethod
    def add(cls, obj) -> None:
        """Add a new record (does NOT commit)."""
        db.session.add(obj)

    @classmethod
    def delete(cls, obj) -> None:
        """Delete a record (does NOT commit)."""
        db.session.delete(obj)

    @classmethod
    def add_and_commit(cls, obj):
        """Add a record and commit. Returns the object."""
        db.session.add(obj)
        db.session.commit()
        return obj

    @classmethod
    def delete_and_commit(cls, obj) -> None:
        """Delete a record and commit."""
        db.session.delete(obj)
        db.session.commit()

    @classmethod
    def update(cls, filter_kwargs: dict, update_kwargs: dict) -> int:
        """Bulk update records matching filter criteria. Returns affected count."""
        result = cls.model.query.filter_by(**filter_kwargs).update(update_kwargs)
        db.session.commit()
        return result

    @classmethod
    def update_one(cls, id_: int, **kwargs) -> bool:
        """Update a single record by id. Returns True if updated."""
        obj = cls.get(id_)
        if not obj:
            return False
        for key, value in kwargs.items():
            setattr(obj, key, value)
        db.session.commit()
        return True

    # ── Session helpers ─────────────────────────────────────────────

    @classmethod
    def commit(cls) -> None:
        """Commit the current session."""
        db.session.commit()

    @classmethod
    def rollback(cls) -> None:
        """Rollback the current session."""
        db.session.rollback()

    @classmethod
    def flush(cls) -> None:
        """Flush the current session (sends pending ops to DB without commit)."""
        db.session.flush()

    # ── Aggregates ──────────────────────────────────────────────────

    @classmethod
    def max_id(cls) -> int | None:
        """Return the maximum id value, or None if table is empty."""
        return db.session.query(func.max(cls.model.id)).scalar()

    @classmethod
    def paginate(cls, page: int = 1, per_page: int = 20, **filters):
        """Flask-SQLAlchemy paginate helper (for HTML views)."""
        query = cls.model.query.filter_by(**filters).order_by(cls.model.id.desc())
        return query.paginate(page=page, per_page=per_page, error_out=False)
