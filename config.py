import os

from dotenv import load_dotenv

_basedir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_basedir, '.env'))


class Config:
    # Для генерации ключа: python -c "import secrets; print(f'SECRET_KEY={secrets.token_hex(32)}')" > .env
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(os.path.dirname(__file__), 'instance', 'app.sqlite')

    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app', 'static', 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024

    # VAPID keys for Web Push (Push API)
    VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY') or 'BOC975oopRRQxYM2f19F6AF5zxBDhZXhP1rHsezfw6el58QHhJgZhelAV4fLaPKvxMV1mMfg-c9AS2oPV4wCCDQ'
    VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY') or 'zvbuqVF1Yi558qkLBpqCESwj5C1TLEnq2cp1LGxXsnk'
    VAPID_CLAIMS = {'sub': 'mailto:admin@rugram.app'}
