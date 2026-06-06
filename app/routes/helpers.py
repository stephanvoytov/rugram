import os
import re
import threading
import uuid

from flask import jsonify
from flask_login import current_user
from PIL import Image
from werkzeug.datastructures import FileStorage

from app.logger import log
from app.repositories.chat_repository import ChatRepository
from app.repositories.event_repository import EventRepository
from app.translations import _
from config import Config


def _create_notification_and_push(
    user_id: int, actor_id: int, type_: str, post_id: int | None = None
):
    """Create a notification and send push. Returns the Notification object."""
    from app.push import send_notification_push
    from app.repositories.notification_repository import NotificationRepository

    notification = NotificationRepository.create_notification(
        user_id=user_id,
        actor_id=actor_id,
        type_=type_,
        post_id=post_id,
    )
    threading.Thread(
        target=send_notification_push,
        args=(user_id, actor_id, type_),
        daemon=True,
    ).start()
    return notification


def _require_chat_participant(chat_id: int) -> tuple:
    """Check if current user is a chat participant. Returns (participant, error_response)."""
    participant = ChatRepository.get_participant(chat_id, current_user.id)
    if not participant:
        return None, (jsonify({"error": _("Access denied")}), 403)
    return participant, None


def process_avatar(image_file: FileStorage) -> str | None:
    """Обрезает и сохраняет аватар (500×500, JPEG)."""
    try:
        img = Image.open(image_file)

        if img.mode == "RGBA":
            img = img.convert("RGB")

        min_size = min(img.size)

        img = img.crop(
            (
                (img.width - min_size) // 2,
                (img.height - min_size) // 2,
                (img.width + min_size) // 2,
                (img.height + min_size) // 2,
            )
        )

        img = img.resize((500, 500), Image.Resampling.LANCZOS)

        filename = f"avatar_{current_user.id}.jpg"
        save_dir = os.path.join(Config.UPLOAD_FOLDER, "profile_images")
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, filename)
        img.save(save_path, "JPEG", quality=85, optimize=True)
        return filename
    except Exception:
        log.exception("process_avatar failed")
        log.system_event("error", "upload", f"Avatar processing failed for user {current_user.id}")
        return None


def process_post_image(image_file: FileStorage, filename: str) -> str | None:
    """Сохраняет две версии изображения поста:
    - {filename} — ресайз до 1200px по ширине (для детальной страницы)
    - thumb_{filename} — ресайз до 400px (для ленты)
    Возвращает filename при успехе или None.
    """
    try:
        img = Image.open(image_file)
        if img.mode == "RGBA":
            img = img.convert("RGB")

        # Полный размер: максимум 1200px по ширине
        img_full = img.copy()
        if img_full.width > 1200:
            ratio = 1200 / img_full.width
            img_full = img_full.resize(
                (1200, int(img_full.height * ratio)), Image.Resampling.LANCZOS
            )

        save_path = os.path.join(Config.UPLOAD_FOLDER, "posts", filename)
        img_full.save(save_path, "JPEG", quality=85, optimize=True)

        # Превью: максимум 400px по ширине
        img_thumb = img.copy()
        if img_thumb.width > 400:
            ratio = 400 / img_thumb.width
            img_thumb = img_thumb.resize(
                (400, int(img_thumb.height * ratio)), Image.Resampling.LANCZOS
            )

        thumb_filename = f"thumb_{filename}"
        thumb_path = os.path.join(Config.UPLOAD_FOLDER, "posts", thumb_filename)
        img_thumb.save(thumb_path, "JPEG", quality=80, optimize=True)

        return filename
    except Exception:
        log.exception("process_post_image failed")
        log.system_event("error", "upload", f"Post image processing failed: {filename}")
        return None


def process_chat_image(image_file: FileStorage) -> str | None:
    """Ресайзит изображение для чата (макс. 800px по ширине) и сохраняет в uploads/chat/.

    Возвращает имя файла или None при ошибке.
    """
    try:
        img = Image.open(image_file)
        if img.mode == "RGBA":
            img = img.convert("RGB")

        # Максимум 800px по ширине (хорошо вписывается в чат)
        if img.width > 800:
            ratio = 800 / img.width
            img = img.resize((800, int(img.height * ratio)), Image.Resampling.LANCZOS)

        filename = f"chat_{uuid.uuid4().hex}.jpg"
        save_dir = Config.CHAT_UPLOAD_FOLDER
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, filename)
        img.save(save_path, "JPEG", quality=85, optimize=True)
        return filename
    except Exception:
        log.exception("process_chat_image failed")
        log.system_event("error", "upload", "Chat image processing failed")
        return None


ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}


def is_allowed_image(filename: str) -> bool:
    """Проверяет расширение файла."""
    if not filename or "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    return ext in ALLOWED_IMAGE_EXTENSIONS


def extract_tags(text: str | None) -> list[str]:
    """Извлекает уникальные хештеги из текста (без #, lowercase, до 32 символов)."""
    if not text:
        return []
    tags = re.findall(r"(?<!\w)#(\w{1,32})", text)
    seen = set()
    result = []
    for tag in tags:
        t = tag.lower()
        if t not in seen:
            seen.add(t)
            result.append(t)
    return result


def sync_post_tags(post_id: int, tag_names: list[str]) -> None:
    """Синхронизирует теги поста через PostRepository."""
    from app.repositories.post_repository import PostRepository

    PostRepository.sync_tags(post_id, tag_names)


def log_system_event(level, category, message, details=None):
    """Записать системное событие в EventRepository."""
    try:
        EventRepository.log_event(level, category, message, details)
    except Exception:
        log.exception("Failed to log system event")
