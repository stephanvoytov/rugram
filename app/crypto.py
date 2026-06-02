"""Шифрование сообщений чата в БД (Fernet)."""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

_KEY_CACHE = None


def _get_key():
    """Генерирует 32-байтный Fernet-ключ из SECRET_KEY приложения (кеш)."""
    global _KEY_CACHE
    if _KEY_CACHE is not None:
        return _KEY_CACHE
    from config import Config
    digest = hashlib.sha256(Config.SECRET_KEY.encode()).digest()
    _KEY_CACHE = base64.urlsafe_b64encode(digest)
    return _KEY_CACHE


def encrypt(plaintext: str) -> str:
    """Шифрует строку. Возвращает строку (base64)."""
    f = Fernet(_get_key())
    return f.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Дешифрует строку. Если не получается — логирует и возвращает заглушку."""
    f = Fernet(_get_key())
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except Exception as e:
        logger.warning('decrypt() failed: %s', e)
        return '[encrypted]'
