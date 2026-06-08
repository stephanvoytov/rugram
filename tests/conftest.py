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
os.environ.setdefault("SECRET_KEY", "test-secret-key-please-change")

from collections.abc import Generator
from pathlib import Path

import pytest
from flask import Flask
from flask.testing import FlaskClient
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.pool import StaticPool

from app import create_app
from config import Config as BaseConfig
from extensions import db as _db

# ── in-memory SQLite (≈5× faster than file-based) ───────────────────────────
# Each xdist worker is a separate process with its own memory, so no clashes.
_TEST_DIR = Path(__file__).parent


class TestConfig(BaseConfig):
    """Configuration overrides for testing."""

    TESTING = True
    SECRET_KEY = "test-secret-key-please-change"
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_ENGINE_OPTIONS = {
        "poolclass": StaticPool,
        "connect_args": {"check_same_thread": False},
    }
    WTF_CSRF_ENABLED = False
    RATELIMIT_ENABLED = False
    SENTRY_DSN = ""  # Disable Sentry in tests
    UPLOAD_FOLDER = str(_TEST_DIR / "test_uploads")
    CHAT_UPLOAD_FOLDER = str(_TEST_DIR / "test_chat_uploads")


def register_user_via_db(
    username: str, password: str = "secret123", email: str | None = None
) -> int:
    """Create a user directly in the test database (no HTTP roundtrip).

    Idempotent — skips if user already exists.
    Use this in test setup instead of HTTP registration to speed up tests.
    Returns the user id.
    """
    from app.models import User

    existing = User.query.filter_by(username=username).first()
    if existing:
        return existing.id
    from werkzeug.security import generate_password_hash

    user = User(
        username=username,
        email=email or f"{username}@test.com",
        hashed_password=generate_password_hash(password),
    )
    _db.session.add(user)
    _db.session.commit()
    return user.id


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


@pytest.fixture(scope="session")
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
    _Cfg.SENTRY_DSN = ""  # Disable Sentry in tests

    app = create_app()

    app.config.update(
        {
            "TESTING": TestConfig.TESTING,
            "SECRET_KEY": TestConfig.SECRET_KEY,
            "SQLALCHEMY_DATABASE_URI": TestConfig.SQLALCHEMY_DATABASE_URI,
            "SQLALCHEMY_ENGINE_OPTIONS": TestConfig.SQLALCHEMY_ENGINE_OPTIONS,
            "WTF_CSRF_ENABLED": TestConfig.WTF_CSRF_ENABLED,
            "RATELIMIT_ENABLED": TestConfig.RATELIMIT_ENABLED,
            "UPLOAD_FOLDER": TestConfig.UPLOAD_FOLDER,
        }
    )

    # Ensure upload directories exist
    Path(TestConfig.UPLOAD_FOLDER).mkdir(parents=True, exist_ok=True)
    Path(TestConfig.CHAT_UPLOAD_FOLDER).mkdir(parents=True, exist_ok=True)

    # Create schema once in the in-memory database
    with app.app_context():
        _db.create_all()

    return app


@pytest.fixture(scope="function", autouse=True)
def _clean_db(app: Flask) -> Generator[None, None, None]:
    """Clean all data between tests without dropping/recreating schema.

    Uses raw SQL DELETE via exec_driver_sql (≈2× faster than ORM delete()).
    """
    yield
    with app.app_context():
        _delete_all_data()


@pytest.fixture(scope="function")
def client(app: Flask) -> Generator[FlaskClient, None, None]:
    """Provide a Flask test client."""
    with app.app_context():
        yield app.test_client()


@pytest.fixture(scope="function")
def db(app: Flask) -> Generator[SQLAlchemy, None, None]:
    """Provide a clean database session for direct model access."""
    with app.app_context():
        yield _db
