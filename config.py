import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY')

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(os.path.dirname(__file__), 'instance', 'app.sqlite')

    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app', 'static', 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024