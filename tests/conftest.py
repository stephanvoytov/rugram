"""Pytest fixtures for Rugram tests.

Sets up a Flask test client with an isolated in-memory SQLite database
and all required app configuration overrides.
"""

import os

# Must be set BEFORE importing any app modules that read SECRET_KEY
os.environ.setdefault('SECRET_KEY', 'test-secret-key-please-change')

from collections.abc import Generator
from pathlib import Path

import pytest
from flask import Flask
from flask.testing import FlaskClient
from flask_sqlalchemy import SQLAlchemy

from app import create_app
from config import Config as BaseConfig
from extensions import db as _db


class TestConfig(BaseConfig):
    """Configuration overrides for testing."""
    TESTING = True
    SECRET_KEY = 'test-secret-key-please-change'
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    WTF_CSRF_ENABLED = False
    UPLOAD_FOLDER = str(Path(__file__).parent / 'test_uploads')


@pytest.fixture(scope='session')
def app() -> Flask:
    """Create the Flask application with test configuration."""
    # Override Config class attrs BEFORE create_app() is called
    from config import Config as _Cfg
    _Cfg.CHAT_UPLOAD_FOLDER = str(Path(__file__).parent / 'test_chat_uploads')

    app = create_app()

    # Replace config with test values
    app.config.update({
        'TESTING': True,
        'SECRET_KEY': 'test-secret-key-please-change',
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'WTF_CSRF_ENABLED': False,
        'UPLOAD_FOLDER': TestConfig.UPLOAD_FOLDER,
    })

    # Ensure upload directories exist
    Path(TestConfig.UPLOAD_FOLDER).mkdir(parents=True, exist_ok=True)
    Path(_Cfg.CHAT_UPLOAD_FOLDER).mkdir(parents=True, exist_ok=True)

    return app


@pytest.fixture(scope='function')
def client(app: Flask) -> Generator[FlaskClient, None, None]:
    """Provide a Flask test client.

    Each test gets a clean database — tables are dropped and recreated.
    """
    with app.app_context():
        _db.create_all()
        yield app.test_client()
        _db.drop_all()


@pytest.fixture(scope='function')
def db(app: Flask) -> Generator[SQLAlchemy, None, None]:
    """Provide a clean database session for direct model access."""
    with app.app_context():
        _db.create_all()
        yield _db
        _db.drop_all()
