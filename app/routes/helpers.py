import os
import re
import uuid
import logging
from typing import Optional

from PIL import Image

from flask import jsonify, current_app
from flask_login import current_user
from werkzeug.datastructures import FileStorage

logger = logging.getLogger(__name__)

from config import Config
from app.translations import _
from app.models import Notification, ChatParticipant, Tag, PostTag, SystemEvent, utcnow
from extensions import db


def _create_notification_and_push(user_id: int, actor_id: int, type_: str, post_id: Optional[int] = None) -> Notification:
    """Create a notification and send push. Returns the Notification object."""
    notification = Notification(
        user_id=user_id,
        actor_id=actor_id,
        type=type_,
        post_id=post_id
    )
    db.session.add(notification)
    return notification


def _require_chat_participant(chat_id: int) -> tuple:
    """Check if current user is a chat participant. Returns (participant, error_response).
    error_response is None if the user is a valid participant."""
    participant = ChatParticipant.query.filter_by(
        chat_id=chat_id,
        user_id=current_user.id
    ).first()
    if not participant:
        return None, (jsonify({'error': _('Access denied')}), 403)
    return participant, None


def process_avatar(image_file: FileStorage) -> Optional[str]:
    """Обрезает и сохраняет аватар (500×500, JPEG)."""
    try:
        img = Image.open(image_file)

        if img.mode == 'RGBA':
            img = img.convert('RGB')

        min_size = min(img.size)

        img = img.crop((
            (img.width - min_size) // 2,
            (img.height - min_size) // 2,
            (img.width + min_size) // 2,
            (img.height + min_size) // 2
        ))

        img = img.resize((500, 500), Image.Resampling.LANCZOS)

        filename = f"avatar_{current_user.id}.jpg"
        save_dir = os.path.join(Config.UPLOAD_FOLDER, 'profile_images')
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, filename)
        img.save(save_path, "JPEG", quality=85, optimize=True)
        return filename
    except Exception:
        logger.exception('process_avatar failed')
        log_system_event('error', 'upload', f'Avatar processing failed for user {current_user.id}')
        return None


def process_post_image(image_file: FileStorage, filename: str) -> Optional[str]:
    """Сохраняет две версии изображения поста:
    - {filename} — ресайз до 1200px по ширине (для детальной страницы)
    - thumb_{filename} — ресайз до 400px (для ленты)
    Возвращает filename при успехе или None.
    """
    try:
        img = Image.open(image_file)
        if img.mode == 'RGBA':
            img = img.convert('RGB')

        # Полный размер: максимум 1200px по ширине
        img_full = img.copy()
        if img_full.width > 1200:
            ratio = 1200 / img_full.width
            img_full = img_full.resize((1200, int(img_full.height * ratio)), Image.Resampling.LANCZOS)

        save_path = os.path.join(Config.UPLOAD_FOLDER, 'posts', filename)
        img_full.save(save_path, 'JPEG', quality=85, optimize=True)

        # Превью: максимум 400px по ширине
        img_thumb = img.copy()
        if img_thumb.width > 400:
            ratio = 400 / img_thumb.width
            img_thumb = img_thumb.resize((400, int(img_thumb.height * ratio)), Image.Resampling.LANCZOS)

        thumb_filename = f'thumb_{filename}'
        thumb_path = os.path.join(Config.UPLOAD_FOLDER, 'posts', thumb_filename)
        img_thumb.save(thumb_path, 'JPEG', quality=80, optimize=True)

        return filename
    except Exception:
        logger.exception('process_post_image failed')
        log_system_event('error', 'upload', f'Post image processing failed: {filename}')
        return None


def process_chat_image(image_file: FileStorage) -> Optional[str]:
    """Ресайзит изображение для чата (макс. 800px по ширине) и сохраняет в uploads/chat/.

    Возвращает имя файла или None при ошибке.
    """
    try:
        img = Image.open(image_file)
        if img.mode == 'RGBA':
            img = img.convert('RGB')

        # Максимум 800px по ширине (хорошо вписывается в чат)
        if img.width > 800:
            ratio = 800 / img.width
            img = img.resize((800, int(img.height * ratio)), Image.Resampling.LANCZOS)

        filename = f'chat_{uuid.uuid4().hex}.jpg'
        save_dir = Config.CHAT_UPLOAD_FOLDER
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, filename)
        img.save(save_path, 'JPEG', quality=85, optimize=True)
        return filename
    except Exception:
        logger.exception('process_chat_image failed')
        log_system_event('error', 'upload', 'Chat image processing failed')
        return None


ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}


def is_allowed_image(filename: str) -> bool:
    """Проверяет расширение файла."""
    if not filename or '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()
    return ext in ALLOWED_IMAGE_EXTENSIONS


def extract_tags(text: str | None) -> list[str]:
    """Извлекает уникальные хештеги из текста (без #, lowercase, до 32 символов)."""
    if not text:
        return []
    tags = re.findall(r'(?<!\w)#(\w{1,32})', text)
    seen = set()
    result = []
    for tag in tags:
        t = tag.lower()
        if t not in seen:
            seen.add(t)
            result.append(t)
    return result


def sync_post_tags(post_id: int, tag_names: list[str]) -> None:
    """Синхронизирует теги поста: удаляет старые связи, создаёт новые."""
    # Удаляем старые PostTag для этого поста
    PostTag.query.filter(PostTag.post_id == post_id).delete()

    for name in tag_names:
        tag = Tag.query.filter(Tag.name == name).first()
        if not tag:
            tag = Tag(name=name)
            db.session.add(tag)
            db.session.flush()
        # Создаём связь
        db.session.add(PostTag(post_id=post_id, tag_id=tag.id))

    # Пересчитываем post_count для всех затронутых тегов
    db.session.flush()
    from sqlalchemy import func
    counts = db.session.query(
        PostTag.tag_id, func.count(PostTag.id)
    ).group_by(PostTag.tag_id).all()
    for tag_id, cnt in counts:
        Tag.query.filter(Tag.id == tag_id).update({'post_count': cnt})
    # Сбрасываем счётчик для тегов без постов
    active_ids = [t[0] for t in counts]
    if active_ids:
        Tag.query.filter(~Tag.id.in_(active_ids)).update({'post_count': 0})
    else:
        Tag.query.update({'post_count': 0})


def log_system_event(level, category, message, details=None):
    """Записать системное событие в БД (для панели администратора).

    Args:
        level: 'critical' | 'error' | 'warning' | 'info'
        category: 'push' | 'db' | 'auth' | 'chat' | 'upload' | 'system'
        message: Краткое описание
        details: Опциональный JSON с деталями (stack trace и т.д.)
    """
    try:
        event = SystemEvent(level=level, category=category, message=message, details=details)
        db.session.add(event)
        db.session.commit()
    except Exception:
        logger.exception('Failed to log system event')
