"""Repository layer — data access for all models.

Repositories encapsulate SQLAlchemy queries. Services call repositories,
never db.session or Model.query directly.
"""

from app.repositories.base import BaseRepository
from app.repositories.post_repository import PostRepository
from app.repositories.user_repository import UserRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.chat_repository import ChatRepository
from app.repositories.event_repository import EventRepository
from app.repositories.push_repository import PushRepository

__all__ = [
    'BaseRepository',
    'PostRepository',
    'UserRepository',
    'NotificationRepository',
    'ChatRepository',
    'EventRepository',
    'PushRepository',
]
