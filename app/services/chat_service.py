"""Chat service — messaging with Fernet encryption, typing, push."""

from typing import Optional
from datetime import datetime as dt

from sqlalchemy.orm import joinedload
from sqlalchemy import func

from app.logger import log
from app.models import (
    Chat, ChatParticipant, Message, User, utcnow,
)
from app.crypto import encrypt, decrypt
from app.push import send_message_push
from app.services.base import ServiceError, NotFoundError, ForbiddenError
from extensions import db


class ChatService:
    """Business logic for DMs — chat CRUD, messages, encryption, typing."""

    # ── Chat management ───────────────────────────────────────────────

    @staticmethod
    def start_or_get_chat(user_id: int, target_username: str) -> dict:
        """Find existing chat or create a new one. Returns {'chat_id': ...}."""
        target = User.query.filter(User.username == target_username).first()
        if not target:
            raise NotFoundError('User not found')
        if target.id == user_id:
            raise ServiceError('Cannot chat with yourself')

        # Check existing chat
        my_chat_ids = [cp.chat_id for cp in
                       ChatParticipant.query.filter_by(user_id=user_id).all()]
        if my_chat_ids:
            common = ChatParticipant.query.filter(
                ChatParticipant.chat_id.in_(my_chat_ids),
                ChatParticipant.user_id == target.id
            ).first()
            if common:
                return {'chat_id': common.chat_id}

        # Create new chat
        chat = Chat()
        db.session.add(chat)
        db.session.flush()
        db.session.add(ChatParticipant(chat_id=chat.id, user_id=user_id))
        db.session.add(ChatParticipant(chat_id=chat.id, user_id=target.id))
        db.session.commit()
        log.info('chat_created', chat_id=chat.id, user_id=user_id, with_user=target.id)
        return {'chat_id': chat.id}

    @staticmethod
    def _require_participant(chat_id: int, user_id: int) -> ChatParticipant:
        """Ensure user is a chat participant. Raises ForbiddenError otherwise."""
        participant = ChatParticipant.query.filter_by(
            chat_id=chat_id, user_id=user_id
        ).first()
        if not participant:
            raise ForbiddenError('Access denied')
        return participant

    @staticmethod
    def get_chat_list(user_id: int) -> list[dict]:
        """Return list of chats with last message, unread count, other user info."""
        participations = ChatParticipant.query.filter_by(user_id=user_id) \
            .options(joinedload(ChatParticipant.user)).all()
        chat_ids = [p.chat_id for p in participations]
        if not chat_ids:
            return []

        # Other participants
        other_parts = ChatParticipant.query.filter(
            ChatParticipant.chat_id.in_(chat_ids),
            ChatParticipant.user_id != user_id
        ).options(joinedload(ChatParticipant.user)).all()
        other_by_chat = {p.chat_id: p for p in other_parts}

        # Latest messages
        latest_sub = db.session.query(
            func.max(Message.id).label('max_id')
        ).filter(Message.chat_id.in_(chat_ids)) \
         .group_by(Message.chat_id).subquery()
        latest_msgs = Message.query.filter(
            Message.id.in_(db.session.query(latest_sub.c.max_id))
        ).all()
        latest_by_chat = {m.chat_id: m for m in latest_msgs}

        # Unread counts
        unread_rows = db.session.query(
            Message.chat_id, func.count(Message.id).label('cnt')
        ).filter(
            Message.chat_id.in_(chat_ids),
            Message.author_id != user_id,
            Message.is_read == False
        ).group_by(Message.chat_id).all()
        unread_counts = {r.chat_id: r.cnt for r in unread_rows}

        result = []
        for p in participations:
            other_p = other_by_chat.get(p.chat_id)
            if not other_p or not other_p.user:
                continue
            other_user = other_p.user
            last_msg = latest_by_chat.get(p.chat_id)
            result.append({
                'chat_id': p.chat_id,
                'other_user': {
                    'id': other_user.id,
                    'username': other_user.username,
                    'profile_image': other_user.profile_image,
                    'is_online': other_user.is_online,
                    'last_seen': other_user.last_seen_str(),
                },
                'last_message': (
                    decrypt(last_msg.text) if last_msg and last_msg.text
                    else '[image]' if last_msg and last_msg.image
                    else None
                ),
                'last_message_date': last_msg.created_date.isoformat() if last_msg else None,
                'unread_count': unread_counts.get(p.chat_id, 0),
            })
        result.sort(key=lambda x: x['last_message_date'] or '1970-01-01', reverse=True)
        return result

    # ── Messages ──────────────────────────────────────────────────────

    @staticmethod
    def send_message(chat_id: int, user_id: int, text: Optional[str] = None,
                     image_filename: Optional[str] = None) -> Message:
        participant = ChatService._require_participant(chat_id, user_id)

        if not text and not image_filename:
            raise ServiceError('Message cannot be empty')

        encrypted_text = encrypt(text) if text else ''
        msg = Message(
            chat_id=chat_id, author_id=user_id,
            text=encrypted_text, image=image_filename,
        )
        db.session.add(msg)

        # Update last_seen and participant read time
        user = db.session.get(User, user_id)
        if user:
            user.last_seen = utcnow()
        participant.last_read_at = utcnow()
        db.session.commit()

        # Push notification to other participant
        try:
            other = ChatParticipant.query.filter(
                ChatParticipant.chat_id == chat_id,
                ChatParticipant.user_id != user_id
            ).first()
            if other:
                preview = text or '[image]'
                send_message_push(chat_id, other.user_id,
                                  user.username if user else str(user_id),
                                  preview)
        except Exception as e:
            log.warning('push_failed', chat_id=chat_id, error=str(e))

        return msg

    @staticmethod
    def get_messages(
        chat_id: int, user_id: int,
        after: int = 0, before: int = 0, ts: str = '',
        limit: int = 50,
    ) -> dict:
        """Return messages, updates, and other_user info.

        Returns dict with keys: messages, updates, other_user, is_typing, has_more.
        """
        ChatService._require_participant(chat_id, user_id)

        # Mark unread as read on first load
        if not before and not after:
            now = utcnow()
            Message.query.filter(
                Message.chat_id == chat_id,
                Message.author_id != user_id,
                Message.is_read == False
            ).update({'is_read': True, 'read_at': now})
            db.session.commit()

        query = Message.query.filter(Message.chat_id == chat_id)
        max_limit = min(limit, 200)

        if before:
            query = query.filter(Message.id < before) \
                .order_by(Message.created_date.desc())
        elif after:
            query = query.filter(Message.id > after) \
                .order_by(Message.created_date.asc())
        else:
            query = query.order_by(Message.created_date.desc())

        raw = query.limit(max_limit + 1).all()
        has_more = len(raw) > max_limit
        messages = raw[:max_limit]

        if before:
            messages.reverse()
        elif not after and not before:
            messages.reverse()

        # Updates (edits/deletes since timestamp)
        updates = []
        if ts and after:
            try:
                ts_dt = dt.fromisoformat(ts)
                if ts_dt.tzinfo:
                    ts_dt = ts_dt.replace(tzinfo=None)
                updates = Message.query.filter(
                    Message.chat_id == chat_id,
                    Message.id <= after,
                    Message.updated_at > ts_dt
                ).order_by(Message.created_date.asc()).all()
            except ValueError:
                pass

        # Update participant last_read
        if not before and not after:
            participant = ChatParticipant.query.filter_by(
                chat_id=chat_id, user_id=user_id
            ).first()
            if participant:
                participant.last_read_at = utcnow()
                now = utcnow()
                user = db.session.get(User, user_id)
                if user and (not user.last_seen or
                             (now - user.last_seen).total_seconds() > 30):
                    user.last_seen = now
                db.session.commit()

        # Other participant info
        other_participant = ChatParticipant.query.filter(
            ChatParticipant.chat_id == chat_id,
            ChatParticipant.user_id != user_id
        ).first()
        other_user_info = None
        is_other_typing = False
        if other_participant:
            other = other_participant.user
            other_user_info = {
                'id': other.id,
                'username': other.username,
                'profile_image': other.profile_image,
                'is_online': other.is_online,
                'last_seen': other.last_seen_str(),
            }
            if other_participant.last_typing_at:
                typing_delta = utcnow() - other_participant.last_typing_at
                is_other_typing = typing_delta.total_seconds() < 4

        def msg_dict(m):
            return {
                'id': m.id,
                'author_id': m.author_id,
                'text': decrypt(m.text) if m.text else '',
                'image': m.image,
                'created_date': m.created_date.isoformat(),
                'edited_at': m.edited_at.isoformat() if m.edited_at else None,
                'is_read': m.is_read,
                'is_deleted': m.text == '' and m.image is None,
            }

        return {
            'messages': [msg_dict(m) for m in messages],
            'updates': [msg_dict(m) for m in updates],
            'other_user': other_user_info,
            'is_typing': is_other_typing,
            'has_more': has_more,
        }

    @staticmethod
    def edit_message(chat_id: int, message_id: int, user_id: int,
                     new_text: str) -> Message:
        ChatService._require_participant(chat_id, user_id)
        msg = Message.query.filter_by(id=message_id, chat_id=chat_id).first()
        if not msg:
            raise NotFoundError('Message not found')
        if msg.author_id != user_id:
            raise ForbiddenError('Access denied')
        if not new_text:
            raise ServiceError('Message cannot be empty')
        msg.text = encrypt(new_text)
        msg.edited_at = utcnow()
        msg.updated_at = utcnow()
        db.session.commit()
        return msg

    @staticmethod
    def delete_message(chat_id: int, message_id: int, user_id: int) -> None:
        ChatService._require_participant(chat_id, user_id)
        msg = Message.query.filter_by(id=message_id, chat_id=chat_id).first()
        if not msg:
            raise NotFoundError('Message not found')
        if msg.author_id != user_id:
            raise ForbiddenError('Access denied')
        msg.text = ''
        msg.image = None
        msg.updated_at = utcnow()
        db.session.commit()

    # ── Typing ────────────────────────────────────────────────────────

    @staticmethod
    def set_typing(chat_id: int, user_id: int) -> None:
        participant = ChatService._require_participant(chat_id, user_id)
        participant.last_typing_at = utcnow()
        db.session.commit()
