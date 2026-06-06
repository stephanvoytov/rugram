"""Event repository — data access for SystemEvent (admin audit log)."""

from __future__ import annotations

from typing import Optional

from app.models import SystemEvent
from app.repositories.base import BaseRepository


class EventRepository(BaseRepository):
    """Data access for SystemEvent model."""

    model = SystemEvent

    @classmethod
    def log_event(cls, level: str, category: str, message: str,
                  details: Optional[str] = None) -> SystemEvent:
        event = SystemEvent(
            level=level, category=category,
            message=message, details=details,
        )
        cls.add(event)
        cls.commit()
        return event

    @classmethod
    def get_counts(cls) -> dict[str, int]:
        return {
            'total': cls.model.query.count(),
            'unread': cls.model.query.filter(cls.model.is_read == False).count(),
            'critical': cls.model.query.filter(cls.model.level == 'critical').count(),
            'errors': cls.model.query.filter(cls.model.level == 'error').count(),
        }

    @classmethod
    def get_all_paginated(cls, page: int = 1, per_page: int = 20):
        return cls.model.query.order_by(cls.model.id.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )

    @classmethod
    def mark_read(cls, event_id: int) -> SystemEvent | None:
        event = cls.get(event_id)
        if event:
            event.is_read = True
            cls.commit()
        return event

    @classmethod
    def mark_all_read(cls) -> int:
        result = cls.model.query.filter(
            cls.model.is_read == False
        ).update({'is_read': True})
        cls.commit()
        return result

    @classmethod
    def get_tag_count(cls) -> int:
        from app.models import Tag
        return Tag.query.count()

    @classmethod
    def get_all_tags_paginated(cls, page: int = 1, per_page: int = 50, search: str = ''):
        from app.models import Tag
        query = Tag.query
        if search:
            query = query.filter(Tag.name.ilike(f'%{search}%'))
        return query.order_by(Tag.post_count.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )

    @classmethod
    def get_tag(cls, tag_id: int):
        from app.models import Tag
        return db.session.get(Tag, tag_id)

    @classmethod
    def delete_tag_hard(cls, tag_id: int) -> None:
        from app.models import Tag
        tag = db.session.get(Tag, tag_id)
        if tag:
            cls.delete(tag)
            cls.commit()

    @classmethod
    def get_top_tags(cls, limit: int = 10):
        from app.models import Tag
        return Tag.query.filter(Tag.post_count > 0) \
            .order_by(Tag.post_count.desc()).limit(limit).all()
