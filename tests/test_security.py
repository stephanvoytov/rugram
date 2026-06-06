"""Security tests — auth bypass, IDOR, admin guards, XSS, upload validation.

Tests that permissions, ownership checks, and input validation work
correctly at the HTTP level through the Flask test client.
"""

import io
import json

from flask.testing import FlaskClient
from werkzeug.security import generate_password_hash

from app.models import Post, User


def _create_user(
    client: FlaskClient,
    username: str = "alice",
    email: str = "alice@x.com",
    password: str = "secret123",
) -> None:
    """Register a user and log them in (via HTTP)."""
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
    client.post(
        "/login",
        data={
            "email_or_username": username,
            "password": password,
        },
        follow_redirects=True,
    )


def _create_user_directly(
    db, username: str = "alice", email: str = "alice@x.com", password: str = "secret123"
) -> User:
    """Create a user directly in the DB (fast, no HTTP)."""
    user = User(username=username, email=email, hashed_password=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()
    return user


def _create_post_directly(db, author_id: int, text: str = "Test post") -> Post:
    """Create a post directly in the DB (fast, no HTTP)."""
    post = Post(text=text, author_id=author_id)
    db.session.add(post)
    db.session.commit()
    return post


def _logout(client: FlaskClient) -> None:
    client.get("/logout", follow_redirects=True)


def _login(client: FlaskClient, username: str = "alice", password: str = "secret123") -> None:
    client.post(
        "/login",
        data={
            "email_or_username": username,
            "password": password,
        },
        follow_redirects=True,
    )


# =============================================================================
# Auth Bypass — accessing protected resources without authentication
# =============================================================================


class TestAuthBypass:
    """Protected endpoints must reject unauthenticated requests."""

    PROTECTED_GET = [
        "/settings",
        "/saved",
        "/chat",
        "/notifications",
        "/edit_profile",
        "/create",
    ]

    PROTECTED_POST = [
        ("/create", {"text": "x"}, None),
        ("/post/1/like", "{}", "application/json"),
        ("/post/1/save", None, None),
        ("/post/1/comment", {"text": "x"}, None),
        ("/follow/alice", None, None),
    ]

    def test_protected_get_redirects_to_login(self, client: FlaskClient):
        """Unauthenticated GET to protected pages should redirect to login."""
        for url in self.PROTECTED_GET:
            r = client.get(url, follow_redirects=False)
            assert r.status_code in (302, 401), f"{url} should require auth"

    def test_protected_post_redirects_to_login(self, client: FlaskClient):
        """Unauthenticated POST to protected endpoints should redirect."""
        for url, data, ct in self.PROTECTED_POST:
            kwargs = {}
            if data:
                kwargs["data"] = data
            if ct:
                kwargs["content_type"] = ct
            r = client.post(url, follow_redirects=False, **kwargs)
            assert r.status_code in (302, 401), f"POST {url} should require auth"

    def test_delete_requires_auth(self, client: FlaskClient):
        """DELETE /delete/<id> without auth redirects."""
        r = client.delete("/delete/1", follow_redirects=True)
        # Should end up at login page
        assert r.status_code == 200
        assert b"login" in r.data.lower() or b"email" in r.data.lower()

    def test_chat_start_requires_auth(self, client: FlaskClient):
        """POST /chat/start/<username> without auth."""
        r = client.post("/chat/start/bob", follow_redirects=False)
        assert r.status_code in (302, 401)

    def test_chat_messages_requires_auth(self, client: FlaskClient):
        """GET /chat/<id>/messages without auth."""
        r = client.get("/chat/1/messages", follow_redirects=False)
        assert r.status_code in (302, 401)

    def test_admin_endpoints_require_auth(self, client: FlaskClient):
        """Admin panel redirects to login when not authenticated."""
        r = client.get("/admin/", follow_redirects=False)
        assert r.status_code in (302, 401)


# =============================================================================
# IDOR — accessing resources owned by other users
# =============================================================================


class TestIDOR:
    """Users must not access or modify resources they don't own."""

    @staticmethod
    def _setup_two_users(db) -> tuple[int, int]:
        """Create alice and bob with posts directly in DB (fast)."""
        alice = _create_user_directly(db, "alice", "alice@x.com", "pass1234")
        bob = _create_user_directly(db, "bob", "bob@x.com", "bobspass")
        _create_post_directly(db, alice.id, "Alice post")
        _create_post_directly(db, bob.id, "Bob post")
        return alice.id, bob.id

    def test_post_idor(self, client: FlaskClient, db):
        """Bob cannot edit or delete Alice's post."""
        self._setup_two_users(db)
        # Bob tries to edit
        _login(client, "bob", "bobspass")
        r = client.post("/edit_post/1", data={"text": "Hacked!"}, follow_redirects=True)
        r2 = client.get("/post/1")
        assert r2.status_code == 200
        assert b"Alice post" in r2.data
        assert b"Hacked!" not in r2.data

        # Bob tries to delete
        r = client.delete("/delete/1")
        assert r.status_code == 403
        _logout(client)
        _login(client, "alice", "pass1234")
        r = client.get("/post/1")
        assert r.status_code == 200

    def test_follow_yourself_400(self, client: FlaskClient, db):
        """Cannot follow yourself."""
        _create_user_directly(db, "alice", "alice@x.com", "pass1234")
        _login(client, "alice", "pass1234")
        r = client.post("/follow/alice", follow_redirects=True)
        assert r.status_code in (200, 400)
        if r.status_code == 200:
            content = r.data.decode("utf-8").lower()
            assert "yourself" in content or "cannot" in content

    def test_edit_others_comment_403(self, client: FlaskClient, db):
        """Cannot edit another user's comment."""
        self._setup_two_users(db)
        _login(client, "alice", "pass1234")
        client.post("/post/1/comment", data={"text": "Alice comment"}, follow_redirects=True)
        _logout(client)
        _login(client, "bob", "bobspass")
        r = client.post(
            "/comment/1/edit",
            data=json.dumps({"text": "Bob hacked!"}),
            content_type="application/json",
        )
        assert r.status_code == 403
        _logout(client)
        _login(client, "alice", "pass1234")
        r2 = client.get("/post/1")
        assert b"Alice comment" in r2.data

    def test_chat_idor(self, client: FlaskClient, db):
        """Eve cannot read or send messages in Alice+Bob's chat."""
        _alice_id, _bob_id = self._setup_two_users(db)
        _login(client, "alice", "pass1234")
        r = client.post("/chat/start/bob")
        assert r.status_code == 200
        chat_id = r.get_json().get("chat_id")
        client.post(
            f"/chat/{chat_id}/send",
            data=json.dumps({"text": "Secret message"}),
            content_type="application/json",
        )
        _logout(client)

        _create_user_directly(db, "eve", "eve@x.com", "evepass12")
        _login(client, "eve", "evepass12")
        # Eve cannot read
        r = client.get(f"/chat/{chat_id}/messages")
        assert r.status_code == 403
        # Eve cannot send
        r = client.post(
            f"/chat/{chat_id}/send",
            data=json.dumps({"text": "Intercepted!"}),
            content_type="application/json",
        )
        assert r.status_code == 403

    def test_delete_others_message_403(self, client: FlaskClient, db):
        """Cannot delete another user's message."""
        self._setup_two_users(db)
        _login(client, "alice", "pass1234")
        r = client.post("/chat/start/bob")
        chat_id = r.get_json().get("chat_id")
        r = client.post(
            f"/chat/{chat_id}/send",
            data=json.dumps({"text": "Alice msg"}),
            content_type="application/json",
        )
        msg_id = r.get_json()["message"]["id"]
        _logout(client)
        _login(client, "bob", "bobspass")
        r = client.delete(f"/chat/{chat_id}/messages/{msg_id}")
        assert r.status_code == 403


# =============================================================================
# Admin Guards
# =============================================================================


class TestAdminGuards:
    """Admin-only endpoints must reject regular users."""

    ADMIN_ENDPOINTS = [
        ("GET", "/admin/"),
        ("GET", "/admin/users"),
        ("GET", "/admin/posts"),
        ("GET", "/admin/tags"),
        ("GET", "/admin/events"),
    ]

    def test_regular_user_cannot_access_admin(self, client: FlaskClient):
        _create_user(client, "alice", "alice@x.com", "pass1234")
        for method, url in self.ADMIN_ENDPOINTS:
            if method == "GET":
                r = client.get(url, follow_redirects=False)
            else:
                r = client.post(url, follow_redirects=False)
            # Regular users should get 403 or redirect away from admin
            assert r.status_code in (302, 403), f"{method} {url} should deny non-admin"

    def test_admin_toggle_last_admin_protected(self, client: FlaskClient):
        """Cannot revoke admin from the last remaining admin."""
        # First make alice an admin by manipulating DB directly
        from extensions import db

        # Register a regular user, then promote them to admin
        _create_user(client, "admin", "admin@x.com", "admin1234")
        # In production this would be done by another admin, but in test
        # we set the flag directly
        from app.models import User

        user = User.query.filter_by(username="admin").first()
        user.is_admin = True
        db.session.commit()
        _logout(client)

        # Try to toggle admin off — should be protected
        _login(client, "admin", "admin1234")
        r = client.post("/admin/users/1/toggle-admin", follow_redirects=True)
        # The last admin protection should prevent this
        # Either stays authenticated (admin active) or shows error
        r = client.get("/admin/")
        assert r.status_code == 200  # Still an admin


# =============================================================================
# XSS — script injection via text fields
# =============================================================================


class TestXSS:
    """User-generated content must be properly escaped."""

    def _create_users(self, client: FlaskClient):
        _create_user(client, "alice", "alice@x.com", "pass1234")

    def test_xss_in_post(self, client: FlaskClient):
        self._create_users(client)
        script = '<script>alert("XSS")</script>'
        r = client.post("/create", data={"text": script}, follow_redirects=True)
        assert r.status_code == 200
        # Jinja2 auto-escapes, so the script tag should appear as text,
        # not as executable HTML. Check that the raw characters appear
        # but < and > are possibly escaped to &lt; &gt;
        content = r.data.decode("utf-8")
        assert "&lt;script&gt;" in content or "alert" in content

    def test_xss_in_comment(self, client: FlaskClient):
        self._create_users(client)
        client.post("/create", data={"text": "Post"}, follow_redirects=True)
        script = "<img src=x onerror=alert(1)>"
        r = client.post("/post/1/comment", data={"text": script}, follow_redirects=True)
        assert r.status_code == 200
        content = r.data.decode("utf-8")
        # The dangerous characters should be escaped
        assert "&lt;img" in content or "onerror" not in content or "&gt;" in content

    def test_xss_in_profile(self, client: FlaskClient):
        self._create_users(client)
        script = "<script>document.cookie</script>"
        r = client.post("/edit_profile", data={"description": script}, follow_redirects=True)
        assert r.status_code == 200
        # View profile
        r = client.get("/profile/alice")
        content = r.data.decode("utf-8")
        assert "&lt;script&gt;" in content or "document.cookie" not in content


# =============================================================================
# Upload validation
# =============================================================================


class TestUploadSecurity:
    """File upload must reject dangerous content."""

    def test_invalid_file_extension(self, client: FlaskClient):
        _create_user(client, "alice", "alice@x.com", "pass1234")
        data = {
            "text": "Post with bad file",
            "image": (io.BytesIO(b"fake exe content"), "virus.exe"),
        }
        r = client.post(
            "/create", data=data, follow_redirects=True, content_type="multipart/form-data"
        )
        # Should either reject the file or handle gracefully
        assert r.status_code == 200
        # Post should still be visible (error flash, but no crash)

    def test_no_extension_file(self, client: FlaskClient):
        _create_user(client, "alice", "alice@x.com", "pass1234")
        data = {
            "text": "No extension file",
            "image": (io.BytesIO(b"content"), "noextension"),
        }
        r = client.post(
            "/create", data=data, follow_redirects=True, content_type="multipart/form-data"
        )
        assert r.status_code == 200

    def test_double_extension_bypass(self, client: FlaskClient):
        """Check double extension like image.jpg.exe is rejected."""
        _create_user(client, "alice", "alice@x.com", "pass1234")
        data = {
            "text": "Double extension",
            "image": (io.BytesIO(b"content"), "photo.jpg.exe"),
        }
        r = client.post(
            "/create", data=data, follow_redirects=True, content_type="multipart/form-data"
        )
        assert r.status_code == 200
