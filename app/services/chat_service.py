"""Chat service — messaging with Fernet encryption, typing, push.

Uses repositories for all data access — no direct db.session or Model.query calls.
"""

from datetime import datetime as dt

from app.crypto import decrypt, encrypt
from app.logger import log
from app.models import Message, utcnow
from app.push import send_message_push
from app.repositories.chat_repository import ChatRepository
from app.repositories.user_repository import UserRepository
from app.services.base import ForbiddenError, NotFoundError, ServiceError


class ChatService:
    """Business logic for DMs — chat CRUD, messages, encryption, typing."""

    # ── Chat management ───────────────────────────────────────────────

    @staticmethod
    def start_or_get_chat(user_id: int, target_username: str) -> dict:
        """Find existing chat or create a new one. Returns {'chat_id': ...}."""
        target = UserRepository.get_by_username(target_username)
        if not target:
            raise NotFoundError("User not found")
        if target.id == user_id:
            raise ServiceError("Cannot chat with yourself")

        # Check existing chat
        my_chat_ids = ChatRepository.get_my_chat_ids(user_id)
        common = ChatRepository.find_common_chat(my_chat_ids, target.id)
        if common:
            return {"chat_id": common.chat_id}

        # Create new chat
        chat = ChatRepository.create_chat()
        ChatRepository.add_participant(chat.id, user_id)
        ChatRepository.add_participant(chat.id, target.id)
        ChatRepository.commit()
        log.info("chat_created", chat_id=chat.id, user_id=user_id, with_user=target.id)
        return {"chat_id": chat.id}

    @staticmethod
    def _require_participant(chat_id: int, user_id: int) -> None:
        """Ensure user is a chat participant. Raises ForbiddenError otherwise."""
        participant = ChatRepository.get_participant(chat_id, user_id)
        if not participant:
            raise ForbiddenError("Access denied")

    @staticmethod
    def get_chat_list(user_id: int) -> list[dict]:
        """Return list of chats with last message, unread count, other user info."""
        participations = ChatRepository.get_participations(user_id)
        chat_ids = [p.chat_id for p in participations]
        if not chat_ids:
            return []

        other_parts = ChatRepository.get_other_participants(chat_ids, user_id)
        other_by_chat = {p.chat_id: p for p in other_parts}
        latest_by_chat = ChatRepository.get_latest_messages_by_chat(chat_ids)
        unread_counts = ChatRepository.get_unread_counts(chat_ids, user_id)

        result = []
        for p in participations:
            other_p = other_by_chat.get(p.chat_id)
            if not other_p or not other_p.user:
                continue
            other_user = other_p.user
            last_msg = latest_by_chat.get(p.chat_id)
            result.append(
                {
                    "chat_id": p.chat_id,
                    "other_user": {
                        "id": other_user.id,
                        "username": other_user.username,
                        "profile_image": other_user.profile_image,
                        "is_online": other_user.is_online,
                        "last_seen": other_user.last_seen_str(),
                    },
                    "last_message": (
                        decrypt(last_msg.text)
                        if last_msg and last_msg.text
                        else "[image]"
                        if last_msg and last_msg.image
                        else None
                    ),
                    "last_message_date": last_msg.created_date.isoformat() if last_msg else None,
                    "last_message_sender_id": last_msg.user_id if last_msg else None,
                    "unread_count": unread_counts.get(p.chat_id, 0),
                }
            )
        result.sort(key=lambda x: x["last_message_date"] or "1970-01-01", reverse=True)
        return result

    # ── Messages ──────────────────────────────────────────────────────

    @staticmethod
    def send_message(
        chat_id: int, user_id: int, text: str | None = None, image_filename: str | None = None
    ) -> Message:
        ChatService._require_participant(chat_id, user_id)

        if not text and not image_filename:
            raise ServiceError("Message cannot be empty")

        encrypted_text = encrypt(text) if text else ""
        msg = ChatRepository.add_message(chat_id, user_id, encrypted_text, image_filename)

        # Update last_seen and participant read time
        user = UserRepository.get(user_id)
        if user:
            user.last_seen = utcnow()
        participant = ChatRepository.get_participant(chat_id, user_id)
        if participant:
            participant.last_read_at = utcnow()
        ChatRepository.commit()

        # Push notification to other participant
        try:
            other = ChatRepository.get_other_participant(chat_id, user_id)
            if other:
                preview = text or "[image]"
                send_message_push(
                    chat_id, other.user_id, user.username if user else str(user_id), preview
                )
        except Exception as e:
            log.warning("push_failed", chat_id=chat_id, error=str(e))

        return msg

    @staticmethod
    def get_messages(
        chat_id: int,
        user_id: int,
        after: int = 0,
        before: int = 0,
        ts: str = "",
        limit: int = 50,
    ) -> dict:
        """Return messages, updates, and other_user info."""
        ChatService._require_participant(chat_id, user_id)

        # Mark unread as read on first load
        if not before and not after:
            ChatRepository.mark_messages_read(chat_id, user_id)

        query = ChatRepository.get_messages_query(chat_id)
        max_limit = min(limit, 200)

        if before:
            query = query.filter(Message.id < before).order_by(Message.created_date.desc())
        elif after:
            query = query.filter(Message.id > after).order_by(Message.created_date.asc())
        else:
            query = query.order_by(Message.created_date.desc())

        raw = query.limit(max_limit + 1).all()
        has_more = len(raw) > max_limit
        messages = raw[:max_limit]

        if before or (not after and not before):
            messages.reverse()

        # Updates (edits/deletes since timestamp)
        updates = []
        if ts and after:
            try:
                ts_dt = dt.fromisoformat(ts)
                if ts_dt.tzinfo:
                    ts_dt = ts_dt.replace(tzinfo=None)
                updates = ChatRepository.get_message_updates(chat_id, after, ts_dt)
            except ValueError:
                pass

        # Update participant last_read
        if not before and not after:
            participant = ChatRepository.get_participant(chat_id, user_id)
            if participant:
                participant.last_read_at = utcnow()
                now = utcnow()
                user = UserRepository.get(user_id)
                if user and (not user.last_seen or (now - user.last_seen).total_seconds() > 30):
                    user.last_seen = now

        # Other participant info
        other_participant = ChatRepository.get_other_participant(chat_id, user_id)
        other_user_info = None
        is_other_typing = False
        if other_participant:
            other = other_participant.user
            other_user_info = {
                "id": other.id,
                "username": other.username,
                "profile_image": other.profile_image,
                "is_online": other.is_online,
                "last_seen": other.last_seen_str(),
            }
            if other_participant.last_typing_at:
                typing_delta = utcnow() - other_participant.last_typing_at
                is_other_typing = typing_delta.total_seconds() < 4

        ChatRepository.commit()

        def msg_dict(m):
            return {
                "id": m.id,
                "author_id": m.author_id,
                "text": decrypt(m.text) if m.text else "",
                "image": m.image,
                "created_date": m.created_date.isoformat(),
                "edited_at": m.edited_at.isoformat() if m.edited_at else None,
                "is_read": m.is_read,
                "is_deleted": m.text == "" and m.image is None,
            }

        return {
            "messages": [msg_dict(m) for m in messages],
            "updates": [msg_dict(m) for m in updates],
            "other_user": other_user_info,
            "is_typing": is_other_typing,
            "has_more": has_more,
        }

    @staticmethod
    def edit_message(chat_id: int, message_id: int, user_id: int, new_text: str) -> Message:
        ChatService._require_participant(chat_id, user_id)
        msg = ChatRepository.get_message(message_id, chat_id)
        if not msg:
            raise NotFoundError("Message not found")
        if msg.author_id != user_id:
            raise ForbiddenError("Access denied")
        if not new_text:
            raise ServiceError("Message cannot be empty")
        msg.text = encrypt(new_text)
        msg.edited_at = utcnow()
        msg.updated_at = utcnow()
        ChatRepository.commit()
        return msg

    @staticmethod
    def delete_message(chat_id: int, message_id: int, user_id: int) -> None:
        ChatService._require_participant(chat_id, user_id)
        msg = ChatRepository.get_message(message_id, chat_id)
        if not msg:
            raise NotFoundError("Message not found")
        if msg.author_id != user_id:
            raise ForbiddenError("Access denied")
        msg.text = ""
        msg.image = None
        msg.updated_at = utcnow()
        ChatRepository.commit()

    # ── Typing ────────────────────────────────────────────────────────

    @staticmethod
    def set_typing(chat_id: int, user_id: int) -> None:
        ChatService._require_participant(chat_id, user_id)
        participant = ChatRepository.get_participant(chat_id, user_id)
        if participant:
            ChatRepository.update_typing(participant)
            ChatRepository.commit()
