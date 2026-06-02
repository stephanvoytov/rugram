import os

from dotenv import load_dotenv

_basedir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_basedir, '.env'))


class Config:
    # Для генерации ключа: python -c "import secrets; print(f'SECRET_KEY={secrets.token_hex(32)}')" > .env
    SECRET_KEY = os.environ.get('SECRET_KEY')
    if not SECRET_KEY:
        raise RuntimeError(
            'SECRET_KEY is not set. Generate one with:\n'
            '  python -c "import secrets; print(f\'SECRET_KEY={secrets.token_hex(32)}\')" > .env'
        )

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(os.path.dirname(__file__), 'instance', 'app.sqlite')

    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app', 'static', 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024

    # Pagination defaults
    POSTS_PER_PAGE = 15
    NOTIFICATIONS_PER_PAGE = 10
    CHAT_MESSAGE_LIMIT = 50

    # VAPID keys for Web Push (Push API) — optional, push disabled if not set
    VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY')
    VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY')
    VAPID_CLAIMS = {'sub': 'mailto:admin@rugram.app'}
