"""Tests for social features: follow/unfollow, profile edit, notifications."""

import json

from flask import Flask
from flask.testing import FlaskClient

from app.models import Follow, Notification, User
from extensions import db
from tests.conftest import register_user_via_db

# ── Helpers ──


def _login(client: FlaskClient, username: str = "testuser", password: str = "secret123") -> None:
    register_user_via_db(username, password)
    client.post(
        "/login",
        data={
            "email_or_username": username,
            "password": password,
        },
    )


# ── Follow / Unfollow ──


class TestFollow:
    def test_follow_user(self, client: FlaskClient, app: Flask) -> None:
        """Logged-in user can follow another user."""
        # Create target user
        with app.app_context():
            target = User(username="target", email="target@test.com")
            target.set_password("pass123")
            db.session.add(target)
            db.session.commit()
            target_id = target.id  # capture before session expires

        _login(client, username="follower")
        r = client.post("/follow/target", headers={"Content-Type": "application/json"})
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data.get("status") == "followed"
        with app.app_context():
            follower = User.query.filter_by(username="follower").first()
            f = Follow.query.filter_by(
                follower_id=follower.id,
                followed_id=target_id,
            ).first()
            assert f is not None

    def test_unfollow_user(self, client: FlaskClient, app: Flask) -> None:
        """Second follow request toggles to unfollow."""
        with app.app_context():
            target = User(username="untarget", email="untarget@test.com")
            target.set_password("pass123")
            db.session.add(target)
            db.session.commit()

        _login(client, username="unfollower")
        # Follow
        client.post("/follow/untarget", headers={"Content-Type": "application/json"})
        # Unfollow
        r = client.post("/follow/untarget", headers={"Content-Type": "application/json"})
        data = json.loads(r.data)
        assert data.get("status") == "unfollowed"

    def test_follow_self_fails(self, client: FlaskClient) -> None:
        """User cannot follow themselves."""
        _login(client, username="narcissist")
        r = client.post("/follow/narcissist", headers={"Content-Type": "application/json"})
        # Should return an error
        data = json.loads(r.data)
        assert data.get("error") is not None

    def test_follow_nonexistent_user_404(self, client: FlaskClient) -> None:
        """Follow a non-existent user returns error."""
        _login(client)
        r = client.post("/follow/nobody", headers={"Content-Type": "application/json"})
        assert r.status_code in (400, 404)

    def test_follow_redirects_when_anonymous(self, client: FlaskClient) -> None:
        """Anonymous user cannot follow."""
        r = client.post("/follow/someone", headers={"Content-Type": "application/json"})
        assert r.status_code in (302, 401)


class TestFollowersPage:
    def test_followers_page_loads(self, client: FlaskClient, app: Flask) -> None:
        """GET /followers/<username> returns 200."""
        _login(client, username="mainuser")
        r = client.get("/followers/mainuser")
        assert r.status_code == 200

    def test_following_page_loads(self, client: FlaskClient, app: Flask) -> None:
        """GET /following/<username> returns 200."""
        _login(client, username="mainuser2")
        r = client.get("/following/mainuser2")
        assert r.status_code == 200


# ── Profile ──


class TestEditProfile:
    def test_edit_profile_page_loads(self, client: FlaskClient) -> None:
        """GET /edit_profile requires auth."""
        r = client.get("/edit_profile")
        assert r.status_code == 302
        assert "/login" in r.location

    def test_edit_profile_logged_in(self, client: FlaskClient, app: Flask) -> None:
        """Logged-in user can edit profile."""
        _login(client, username="profi")
        r = client.post(
            "/edit_profile",
            data={
                "description": "my new bio",
            },
            follow_redirects=True,
        )
        assert r.status_code == 200
        with app.app_context():
            u = User.query.filter_by(username="profi").first()
            assert u.description == "my new bio"


# ── Notifications ──


class TestNotifications:
    def test_notifications_page_requires_auth(self, client: FlaskClient) -> None:
        """GET /notifications without login redirects."""
        r = client.get("/notifications")
        assert r.status_code == 302

    def test_notifications_page_loads(self, client: FlaskClient) -> None:
        """GET /notifications when logged in returns 200."""
        _login(client, username="notifuser")
        r = client.get("/notifications")
        assert r.status_code == 200

    def test_unread_count(self, client: FlaskClient, app: Flask) -> None:
        """GET /api/notifications/unread-count returns count."""
        _login(client, username="countuser")
        with app.app_context():
            u = User.query.filter_by(username="countuser").first()
            # Create a notification for this user
            actor = User(username="actor", email="actor@test.com")
            actor.set_password("pass")
            db.session.add(actor)
            db.session.flush()
            n = Notification(user_id=u.id, actor_id=actor.id, type="follow")
            db.session.add(n)
            db.session.commit()

        r = client.get("/api/notifications/unread-count")
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data.get("count", 0) >= 1

    def test_mark_all_read(self, client: FlaskClient, app: Flask) -> None:
        """POST /notifications/mark-all-read marks all as read."""
        _login(client, username="readuser")
        with app.app_context():
            u = User.query.filter_by(username="readuser").first()
            actor = User(username="actor2", email="actor2@test.com")
            actor.set_password("pass")
            db.session.add(actor)
            db.session.flush()
            n = Notification(user_id=u.id, actor_id=actor.id, type="follow")
            db.session.add(n)
            db.session.commit()

        r = client.post("/notifications/mark-all-read")
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data.get("status") == "success"
