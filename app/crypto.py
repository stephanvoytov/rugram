"""Шифрование сообщений чата в БД (Fernet)."""

import base64
import hashlib

from cryptography.fernet import Fernet


def _get_key():
    """Генерирует 32-байтный Fernet-ключ из SECRET_KEY приложения."""
    from config import Config
    digest = hashlib.sha256(Config.SECRET_KEY.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt(plaintext: str) -> str:
    """Шифрует строку. Возвращает строку (base64)."""
    f = Fernet(_get_key())
    return f.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Дешифрует строку. Если не получается — возвращает как есть."""
    f = Fernet(_get_key())
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except Exception:
        return ciphertext
