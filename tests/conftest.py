"""Pytest fixtures for Rugram tests.

Sets up a Flask test client with an isolated SQLite database
and all required app configuration overrides.

Supports pytest-xdist parallelism: each worker gets its own DB file
(test_db_gw0.sqlite, test_db_gw1.sqlite, ...).

Uses session-scoped schema creation + per-test raw DELETE for cleanup
(faster than per-test drop_all+create_all).
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
from sqlalchemy import text

from app import create_app
from config import Config as BaseConfig
from extensions import db as _db


# ── worker-aware test DB path ────────────────────────────────────────────────
# Each xdist worker (gw0, gw1, ...) gets its own DB file so they don't clash.
# Without xdist the suffix is empty → test_db.sqlite as before.
_WORKER_ID = os.environ.get('PYTEST_XDIST_WORKER', '')
_DB_SUFFIX = f'_{_WORKER_ID}' if _WORKER_ID else ''
_TEST_DIR = Path(__file__).parent
_TEST_DB_PATH = _TEST_DIR / f'test_db{_DB_SUFFIX}.sqlite'


class TestConfig(BaseConfig):
    """Configuration overrides for testing."""
    TESTING = True
    SECRET_KEY = 'test-secret-key-please-change'
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{_TEST_DB_PATH}'
    WTF_CSRF_ENABLED = False
    RATELIMIT_ENABLED = False
    UPLOAD_FOLDER = str(_TEST_DIR / f'test_uploads{_DB_SUFFIX}')
    CHAT_UPLOAD_FOLDER = str(_TEST_DIR / f'test_chat_uploads{_DB_SUFFIX}')


def _wipe_test_db() -> None:
    """Remove the test database file (and journal/WAL) so each test session
    starts fresh and stale WAL state doesn't bleed between tests."""
    for suffix in ('', '-journal', '-wal', '-shm'):
        p = _TEST_DIR / f'test_db{_DB_SUFFIX}{suffix}.sqlite'
        if p.exists():
            try:
                p.unlink()
            except PermissionError:
                pass


def _delete_all_data() -> None:
    """Delete all rows from all tables using raw SQL (faster than ORM).

    Foreign keys are temporarily disabled to avoid ordering constraints.
    Uses a single connection round-trip via exec_driver_sql.
    """
    conn = _db.session.connection()
    conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
    for table in reversed(_db.metadata.sorted_tables):
        conn.exec_driver_sql(f"DELETE FROM {table.name}")
    conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    _db.session.commit()


@pytest.fixture(scope='session')
def app() -> Flask:
    """Create the Flask application with test configuration.

    Creates the database schema once for the whole session.
    Per-test data cleanup is done via _delete_all_data().
    """

    # Override Config class attrs BEFORE create_app() is called
    from config import Config as _Cfg
    _Cfg.CHAT_UPLOAD_FOLDER = TestConfig.CHAT_UPLOAD_FOLDER
    _Cfg.SQLALCHEMY_DATABASE_URI = TestConfig.SQLALCHEMY_DATABASE_URI
    _Cfg.RATELIMIT_ENABLED = False

    app = create_app()

    app.config.update({
        'TESTING': TestConfig.TESTING,
        'SECRET_KEY': TestConfig.SECRET_KEY,
        'SQLALCHEMY_DATABASE_URI': TestConfig.SQLALCHEMY_DATABASE_URI,
        'WTF_CSRF_ENABLED': TestConfig.WTF_CSRF_ENABLED,
        'RATELIMIT_ENABLED': TestConfig.RATELIMIT_ENABLED,
        'UPLOAD_FOLDER': TestConfig.UPLOAD_FOLDER,
    })

    # Ensure upload directories exist
    Path(TestConfig.UPLOAD_FOLDER).mkdir(parents=True, exist_ok=True)
    Path(TestConfig.CHAT_UPLOAD_FOLDER).mkdir(parents=True, exist_ok=True)

    # Wipe stale DB file and create schema once
    _wipe_test_db()
    with app.app_context():
        _db.create_all()

    return app


@pytest.fixture(scope='function', autouse=True)
def _clean_db(app: Flask) -> Generator[None, None, None]:
    """Clean all data between tests without dropping/recreating schema.

    Uses raw SQL DELETE via exec_driver_sql (≈2× faster than ORM delete()).
    """
    yield
    with app.app_context():
        _delete_all_data()


@pytest.fixture(scope='function')
def client(app: Flask) -> Generator[FlaskClient, None, None]:
    """Provide a Flask test client."""
    with app.app_context():
        yield app.test_client()


@pytest.fixture(scope='function')
def db(app: Flask) -> Generator[SQLAlchemy, None, None]:
    """Provide a clean database session for direct model access."""
    with app.app_context():
        yield _db
