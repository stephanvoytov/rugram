"""Шифрование сообщений чата в БД (Fernet с поддержкой key rotation через MultiFernet).

Как добавить старый ключ (если SECRET_KEY менялся):
1. Добавить SECRET_KEY_V1=... в .env (старый ключ)
2. MultiFernet сам пробует все ключи при расшифровке
3. Новые сообщения всегда шифруются текущим SECRET_KEY

См. https://cryptography.io/en/latest/fernet/#multi-fernet
"""

import base64
import hashlib

from cryptography.fernet import Fernet, MultiFernet

from app.logger import log

_MULTI_FERNET_CACHE = None


def reset_crypto_cache() -> None:
    """Сбрасывает кеш MultiFerNet — нужно вызвать после изменения SECRET_KEY* в рантайме."""
    global _MULTI_FERNET_CACHE
    _MULTI_FERNET_CACHE = None


def _to_fernet_key(raw: str) -> bytes:
    """Превращает произвольную строку в 32-байтный Fernet-ключ через SHA256."""
    digest = hashlib.sha256(raw.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def _get_multi_fernet() -> MultiFernet:
    """Собирает MultiFernet из текущего + legacy ключей. Кешируется."""
    global _MULTI_FERNET_CACHE
    if _MULTI_FERNET_CACHE is not None:
        return _MULTI_FERNET_CACHE
    from config import Config

    ferns = [Fernet(_to_fernet_key(Config.SECRET_KEY))]
    if Config.SECRET_KEY_V1:
        ferns.append(Fernet(_to_fernet_key(Config.SECRET_KEY_V1)))
    if Config.SECRET_KEY_V2:
        ferns.append(Fernet(_to_fernet_key(Config.SECRET_KEY_V2)))
    _MULTI_FERNET_CACHE = MultiFernet(ferns)
    return _MULTI_FERNET_CACHE


def encrypt(plaintext: str) -> str:
    """Шифрует строку текущим (первым) ключом."""
    return _get_multi_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    """Дешифрует строку — пробует все ключи по очереди.

    Если строка не похожа на Fernet-токен (не начинается с gAAAAA),
    считается plaintext'ом и возвращается как есть (обратная совместимость
    с сообщениями, сохранёнными до включения шифрования).
    """
    if not ciphertext or not ciphertext.startswith("gAAAAA"):
        return ciphertext
    try:
        return _get_multi_fernet().decrypt(ciphertext.encode()).decode()
    except Exception as e:
        log.warning("decrypt() failed", error=str(e))
        return "[encrypted]"
