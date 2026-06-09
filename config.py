import os

from dotenv import load_dotenv

_basedir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_basedir, ".env"))


class Config:
    # Для генерации ключа: python -c "import secrets; print(f'SECRET_KEY={secrets.token_hex(32)}')" > .env
    SECRET_KEY = os.environ.get("SECRET_KEY")
    if not SECRET_KEY:
        raise RuntimeError(
            "SECRET_KEY is not set. Generate one with:\n"
            "  python -c \"import secrets; print(f'SECRET_KEY={secrets.token_hex(32)}')\" > .env"
        )

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL") or (
        "sqlite:///" + os.path.join(os.path.dirname(__file__), "instance", "app.sqlite")
    )

    UPLOAD_FOLDER = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "app", "static", "uploads"
    )
    CHAT_UPLOAD_FOLDER = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "instance", "uploads", "chat"
    )
    OLD_CHAT_UPLOAD_FOLDER = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "app", "static", "uploads", "chat"
    )
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024

    # Auto-reload templates on every request + no static cache (local dev only)
    _debug = os.environ.get("FLASK_DEBUG", "").lower() in ("1", "true")
    TEMPLATES_AUTO_RELOAD = _debug
    SEND_FILE_MAX_AGE_DEFAULT = 0 if _debug else None

    # Rate limiting
    RATELIMIT_ENABLED = os.environ.get("RATELIMIT_ENABLED", "true").lower() in ("1", "true")
    RATELIMIT_STORAGE_URI = "memory://"
    RATELIMIT_STRATEGY = "moving-window"
    RATELIMIT_DEFAULT = "60/minute"
    RATELIMIT_HEADERS_ENABLED = True

    # Pagination defaults
    POSTS_PER_PAGE = 15
    NOTIFICATIONS_PER_PAGE = 10
    CHAT_MESSAGE_LIMIT = 50

    # Legacy keys for Fernet decryption (key rotation via MultiFernet)
    # Add old SECRET_KEY values here if you ever change SECRET_KEY,
    # so old chat messages remain decryptable:
    #   SECRET_KEY_V1=<prev_secret_key>
    #   SECRET_KEY_V2=<older_secret_key>
    SECRET_KEY_V1 = os.environ.get("SECRET_KEY_V1")
    SECRET_KEY_V2 = os.environ.get("SECRET_KEY_V2")

    # VAPID keys for Web Push (Push API)
    # Автогенерация при первом вызове push.py, не здесь (лениво)
    VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY")
    VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY")
    VAPID_CLAIMS = {"sub": "mailto:admin@rugram.app"}

    # Sentry error tracking (optional — no error if unset)
    SENTRY_DSN = os.environ.get("SENTRY_DSN")

    # Widget API keys (optional — missing = widget type unavailable)
    LASTFM_API_KEY = os.environ.get("LASTFM_API_KEY")
    STEAM_API_KEY = os.environ.get("STEAM_API_KEY")
