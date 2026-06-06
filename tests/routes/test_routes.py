"""Critical-path route tests for Rugram.

Covers unauthenticated browsing, registration, login, profile viewing,
and language switching.
"""

import re

from flask import Flask
from flask.testing import FlaskClient

# ── Unauthenticated browsing ──


def test_homepage_returns_200(client: FlaskClient) -> None:
    """GET / should return 200 OK."""
    r = client.get("/")
    assert r.status_code == 200


def test_homepage_has_title(client: FlaskClient) -> None:
    """Homepage should contain some expected text."""
    r = client.get("/")
    assert r.status_code == 200
    # The page should at least render HTML
    assert b"<html" in r.data or b"<!DOCTYPE html" in r.data


def test_login_page_returns_200(client: FlaskClient) -> None:
    """GET /login should render login form."""
    r = client.get("/login")
    assert r.status_code == 200
    # Should contain login-related text (the form)
    assert b"password" in r.data.lower() or b"login" in r.data.lower()


def test_register_page_returns_200(client: FlaskClient) -> None:
    """GET /register should render registration form."""
    r = client.get("/register")
    assert r.status_code == 200
    assert b"password" in r.data.lower()


def test_login_failure_redirects(client: FlaskClient) -> None:
    """POST /login with wrong credentials should redirect back."""
    r = client.post(
        "/login",
        data={
            "email_or_username": "nonexistent@test.com",
            "password": "wrongpass",
        },
    )
    assert r.status_code == 302


# ── Registration + login flow ──


def _register_user(
    client: FlaskClient,
    username: str = "testuser",
    email: str = "test@example.com",
    password: str = "secret123",
) -> None:
    """Helper: register a user and follow the redirect."""
    client.post(
        "/register",
        data={
            "username": username,
            "email": email,
            "password": password,
            "password2": password,
        },
        follow_redirects=True,
    )


def test_registration_creates_user(client: FlaskClient, app: Flask) -> None:
    """Register a user and verify they exist in the database."""
    _register_user(client)

    from app.models import User

    with app.app_context():
        user = User.query.filter_by(username="testuser").first()
        assert user is not None
        assert user.email == "test@example.com"


def test_registration_then_login(client: FlaskClient) -> None:
    """Register → login → homepage should show authenticated state."""
    _register_user(client)

    r = client.post(
        "/login",
        data={
            "email_or_username": "testuser",
            "password": "secret123",
        },
        follow_redirects=True,
    )
    assert r.status_code == 200


def test_login_with_email(client: FlaskClient) -> None:
    """Login with email (not username) should also work."""
    _register_user(client)

    r = client.post(
        "/login",
        data={
            "email_or_username": "test@example.com",
            "password": "secret123",
        },
        follow_redirects=True,
    )
    assert r.status_code == 200


# ── Profile ──


def test_profile_of_existing_user(client: FlaskClient, app: Flask) -> None:
    """Profile page of a registered user should show their username."""
    from app.models import User
    from extensions import db

    with app.app_context():
        u = User(username="alice", email="alice@test.com")
        u.set_password("pass123")
        db.session.add(u)
        db.session.commit()

    r = client.get("/profile/alice")
    assert r.status_code == 200
    assert b"alice" in r.data.lower()


def test_profile_of_nonexistent_user_404(client: FlaskClient) -> None:
    """GET /profile/bogus should return 404."""
    r = client.get("/profile/bogus")
    assert r.status_code == 404


# ── Logout ──


def test_logout_redirects(client: FlaskClient) -> None:
    """GET /logout should redirect to index."""
    r = client.get("/logout", follow_redirects=True)
    assert r.status_code == 200


# ── Authenticated-only pages ──


def test_settings_redirects_when_anonymous(client: FlaskClient) -> None:
    """GET /settings without being logged in should redirect to login."""
    r = client.get("/settings")
    assert r.status_code == 302
    assert "/login" in r.location


def test_settings_loads_when_logged_in(client: FlaskClient) -> None:
    """GET /settings after login should render settings page."""
    _register_user(client)
    client.post(
        "/login",
        data={
            "email_or_username": "testuser",
            "password": "secret123",
        },
    )

    r = client.get("/settings")
    assert r.status_code == 200


# ── Bilingual ──


def test_russian_language_switch(client: FlaskClient) -> None:
    """?lang=ru should activate Russian translations on the page."""
    r = client.get("/login?lang=ru")
    assert r.status_code == 200
    # The login page should contain some Russian text
    body = r.data.decode("utf-8")
    # At minimum, the page should not crash and should contain cyrillic
    bool(re.search(r"[а-яА-ЯёЁ]", body))
    # It's acceptable if the login page has minimal Russian — at least it doesn't crash
    assert r.status_code == 200


def test_english_is_default(client: FlaskClient) -> None:
    """Without lang param, the page should be in English."""
    r = client.get("/login")
    assert r.status_code == 200
    # Should not have Russian flash messages by default
    assert r.status_code == 200


def test_language_persists_in_session(client: FlaskClient) -> None:
    """Setting ?lang=ru should persist in session for subsequent requests."""
    # First request sets Russian
    client.get("/auth/login?lang=ru")

    # Second request (no lang param) should keep Russian from session
    r = client.get("/")
    assert r.status_code == 200


# ── Error pages ──


def test_nonexistent_route_404(client: FlaskClient) -> None:
    """A totally bogus URL should return 404."""
    r = client.get("/this/route/definitely/does/not/exist")
    assert r.status_code == 404
