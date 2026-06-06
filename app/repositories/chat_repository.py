"""Chat repository — data access for chats, messages, participants."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import joinedload

from app.models import Chat, ChatParticipant, Message, User, db, utcnow
from app.repositories.base import BaseRepository


class ChatRepository(BaseRepository):
    """Data access for Chat, ChatParticipant, Message models."""

    model = Chat

    # ── Participants ───────────────────────────────────────────────

    @classmethod
    def get_participant(cls, chat_id: int, user_id: int) -> ChatParticipant | None:
        return ChatParticipant.query.filter_by(chat_id=chat_id, user_id=user_id).first()

    @classmethod
    def get_participations(cls, user_id: int) -> list[ChatParticipant]:
        return (
            ChatParticipant.query.filter_by(user_id=user_id)
            .options(joinedload(ChatParticipant.user))
            .all()
        )

    @classmethod
    def get_other_participants(cls, chat_ids: list[int], user_id: int) -> list[ChatParticipant]:
        return (
            ChatParticipant.query.filter(
                ChatParticipant.chat_id.in_(chat_ids), ChatParticipant.user_id != user_id
            )
            .options(joinedload(ChatParticipant.user))
            .all()
        )

    @classmethod
    def get_other_participant(cls, chat_id: int, user_id: int) -> ChatParticipant | None:
        return ChatParticipant.query.filter(
            ChatParticipant.chat_id == chat_id, ChatParticipant.user_id != user_id
        ).first()

    @classmethod
    def get_my_chat_ids(cls, user_id: int) -> list[int]:
        return [cp.chat_id for cp in ChatParticipant.query.filter_by(user_id=user_id).all()]

    @classmethod
    def find_common_chat(
        cls, my_chat_ids: list[int], target_user_id: int
    ) -> ChatParticipant | None:
        if not my_chat_ids:
            return None
        return ChatParticipant.query.filter(
            ChatParticipant.chat_id.in_(my_chat_ids), ChatParticipant.user_id == target_user_id
        ).first()

    @classmethod
    def add_participant(cls, chat_id: int, user_id: int) -> ChatParticipant:
        cp = ChatParticipant(chat_id=chat_id, user_id=user_id)
        cls.add(cp)
        return cp

    @classmethod
    def create_chat(cls) -> Chat:
        chat = Chat()
        cls.add(chat)
        cls.flush()
        return chat

    # ── Messages ───────────────────────────────────────────────────

    @classmethod
    def get_message(cls, message_id: int, chat_id: int) -> Message | None:
        return Message.query.filter_by(id=message_id, chat_id=chat_id).first()

    @classmethod
    def add_message(
        cls, chat_id: int, author_id: int, text: str = "", image: str | None = None
    ) -> Message:
        msg = Message(
            chat_id=chat_id,
            author_id=author_id,
            text=text,
            image=image,
        )
        cls.add(msg)
        return msg

    @classmethod
    def get_messages_query(cls, chat_id: int):
        return Message.query.filter(Message.chat_id == chat_id)

    @classmethod
    def get_latest_messages_by_chat(cls, chat_ids: list[int]) -> dict[int, Message]:
        if not chat_ids:
            return {}
        latest_sub = (
            db.session.query(func.max(Message.id).label("max_id"))
            .filter(Message.chat_id.in_(chat_ids))
            .group_by(Message.chat_id)
            .subquery()
        )
        latest_msgs = Message.query.filter(
            Message.id.in_(db.session.query(latest_sub.c.max_id))
        ).all()
        return {m.chat_id: m for m in latest_msgs}

    @classmethod
    def get_unread_counts(cls, chat_ids: list[int], user_id: int) -> dict[int, int]:
        if not chat_ids:
            return {}
        rows = (
            db.session.query(Message.chat_id, func.count(Message.id).label("cnt"))
            .filter(
                Message.chat_id.in_(chat_ids),
                Message.author_id != user_id,
                Message.is_read == False,  # noqa: E712
            )
            .group_by(Message.chat_id)
            .all()
        )
        return {r.chat_id: r.cnt for r in rows}

    @classmethod
    def mark_messages_read(cls, chat_id: int, user_id: int) -> None:
        now = utcnow()
        Message.query.filter(
            Message.chat_id == chat_id,
            Message.author_id != user_id,
            Message.is_read == False,  # noqa: E712
        ).update({"is_read": True, "read_at": now})

    @classmethod
    def get_message_updates(cls, chat_id: int, after_id: int, since_dt) -> list[Message]:
        return (
            Message.query.filter(
                Message.chat_id == chat_id, Message.id <= after_id, Message.updated_at > since_dt
            )
            .order_by(Message.created_date.asc())
            .all()
        )

    # ── User online ────────────────────────────────────────────────

    @classmethod
    def update_last_seen(cls, user_id: int) -> User | None:
        user = UserRepository.get(user_id)
        if user:
            user.last_seen = utcnow()
        return user

    # ── Typing ──────────────────────────────────────────────────────

    @classmethod
    def update_typing(cls, participant: ChatParticipant) -> None:
        participant.last_typing_at = utcnow()


# Import at bottom to avoid circular issues with repos
from app.repositories.user_repository import UserRepository
