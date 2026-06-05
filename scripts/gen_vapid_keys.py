"""Сгенерировать VAPID-ключи для Web Push уведомлений.

Usage:
    python scripts/gen_vapid_keys.py

Ключи записываются в .env в корне проекта (если есть).
Можно также скопировать вывод вручную:

    VAPID_PUBLIC_KEY=<base64url>
    VAPID_PRIVATE_KEY=<base64url>
"""

import os
import sys
from base64 import urlsafe_b64encode

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def generate_vapid_keys() -> tuple[str, str]:
    """Сгенерировать VAPID-ключи. Вернёт (public_key_b64, private_key_b64)."""
    key = ec.generate_private_key(ec.SECP256R1())

    # Публичный ключ: X9.62 uncompressed point → base64url (без padding)
    public_bytes = key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    public_b64 = urlsafe_b64encode(public_bytes).rstrip(b'=').decode()

    # Приватный ключ: DER PKCS8 → base64url (без padding)
    private_bytes = key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    private_b64 = urlsafe_b64encode(private_bytes).rstrip(b'=').decode()

    return public_b64, private_b64


def write_to_env(public_b64: str, private_b64: str) -> None:
    """Дописать ключи в .env, если их там ещё нет."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
    env_path = os.path.normpath(env_path)

    if not os.path.isfile(env_path):
        print(f'[!] .env не найден: {env_path}')
        print('[!] Скопируйте ключи вручную.')
        return

    with open(env_path, 'r', encoding='utf-8') as f:
        content = f.read()

    has_public = 'VAPID_PUBLIC_KEY' in content
    has_private = 'VAPID_PRIVATE_KEY' in content

    if has_public and has_private:
        print('[i] VAPID ключи уже есть в .env.')
        return

    with open(env_path, 'a', encoding='utf-8') as f:
        f.write(f'\n# VAPID keys for Web Push (сгенерировано {__file__})\n')
        if not has_public:
            f.write(f'VAPID_PUBLIC_KEY={public_b64}\n')
        if not has_private:
            f.write(f'VAPID_PRIVATE_KEY={private_b64}\n')

    print(f'[OK] Ключи записаны в {env_path}')


def main() -> None:
    print('[*] Генерация VAPID ключей...')
    pub, priv = generate_vapid_keys()

    print()
    print(f'    VAPID_PUBLIC_KEY={pub}')
    print(f'    VAPID_PRIVATE_KEY={priv}')
    print()

    write_to_env(pub, priv)


if __name__ == '__main__':
    main()
