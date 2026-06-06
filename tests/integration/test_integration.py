"""Integration tests — full-stack flows through Flask test client.

Tests complete user journeys: registration → login → action → verify.
Each flow spans multiple endpoints to catch regressions in the interaction
between routes, services, repositories, and the database.
"""

import json

from flask.testing import FlaskClient


def _register_user(
    client: FlaskClient,
    username: str = "alice",
    email: str = "alice@example.com",
    password: str = "secret123",
) -> None:
    """Register user via DB (no HTTP). User is NOT logged in."""
    from tests.conftest import register_user_via_db

    register_user_via_db(username, password, email)


def _login(
    client: FlaskClient, username_or_email: str = "alice", password: str = "secret123"
) -> None:
    """Log in with follow_redirects. User must already exist."""
    client.post(
        "/login",
        data={
            "email_or_username": username_or_email,
            "password": password,
        },
        follow_redirects=True,
    )


# =============================================================================
# Flow 1 — Registration → Login → Profile
# =============================================================================


class TestRegistrationLoginFlow:
    """Complete user lifecycle: register, see profile, edit settings."""

    def test_full_auth_flow(self, client: FlaskClient):
        # Register
        r = client.post(
            "/register",
            data={
                "username": "newuser",
                "email": "new@example.com",
                "password": "Pass123!",
                "password2": "Pass123!",
            },
            follow_redirects=True,
        )
        assert r.status_code == 200

        # Logout
        r = client.get("/logout", follow_redirects=True)
        assert r.status_code == 200

        # Login with username
        r = client.post(
            "/login",
            data={
                "email_or_username": "newuser",
                "password": "Pass123!",
            },
            follow_redirects=True,
        )
        assert r.status_code == 200

        # Profile page works
        r = client.get("/profile/newuser")
        assert r.status_code == 200

        # Settings page loads
        r = client.get("/settings")
        assert r.status_code == 200

    def test_login_with_email(self, client: FlaskClient):
        _register_user(client, "bob", "bob@example.com", "bobpass")
        _login(client, "bob@example.com", "bobpass")
        r = client.get("/settings")
        assert r.status_code == 200

    def test_profile_of_nonexistent_user_404(self, client: FlaskClient):
        r = client.get("/profile/nobody123xyz")
        assert r.status_code == 404


# =============================================================================
# Flow 2 — Post CRUD with reactions
# =============================================================================


class TestPostLifecycle:
    """Create, read, like, comment, delete a post."""

    def test_create_and_view_post(self, client: FlaskClient):
        _register_user(client)
        _login(client)

        r = client.post("/create", data={"text": "Integration test post!"}, follow_redirects=True)
        assert r.status_code == 200
        assert b"Integration test post!" in r.data

    def test_like_then_unlike(self, client: FlaskClient):
        _register_user(client)
        _login(client)
        client.post("/create", data={"text": "Like me!"}, follow_redirects=True)

        # Like via /post/1/like (requires Content-Type: application/json)
        r = client.post("/post/1/like", content_type="application/json", data="{}")
        assert r.status_code == 200
        data = r.get_json()
        assert data is not None
        assert data.get("status") == "liked"

        # Unlike
        r = client.post("/post/1/like", content_type="application/json", data="{}")
        assert r.status_code == 200
        data = r.get_json()
        assert data is not None
        assert data.get("status") == "unliked"

    def test_comment_on_post(self, client: FlaskClient):
        _register_user(client)
        _login(client)
        client.post("/create", data={"text": "Comment please!"})

        # Comment via /post/1/comment
        r = client.post("/post/1/comment", data={"text": "Nice post!"}, follow_redirects=True)
        assert r.status_code == 200
        assert b"Nice post!" in r.data

    def test_delete_own_post(self, client: FlaskClient):
        _register_user(client)
        _login(client)
        client.post("/create", data={"text": "Will be deleted"})

        # Delete via DELETE /delete/1
        r = client.delete("/delete/1")
        assert r.status_code == 200

        # Should be gone
        r = client.get("/post/1")
        assert r.status_code == 404

    def test_edit_own_post(self, client: FlaskClient):
        _register_user(client)
        _login(client)
        client.post("/create", data={"text": "Original text"})

        # Edit via /edit_post/1
        r = client.post("/edit_post/1", data={"text": "Updated text"}, follow_redirects=True)
        assert r.status_code == 200

        # View post
        r = client.get("/post/1")
        assert r.status_code == 200
        assert b"Updated text" in r.data


# =============================================================================
# Flow 3 — Social (follow/unfollow)
# =============================================================================


class TestSocialFlow:
    """Follow → see in list → unfollow."""

    def test_follow_then_unfollow(self, client: FlaskClient):
        """Alice follows bob, sees in following list, then unfollows."""
        _register_user(client, "alice", "alice@x.com", "secret123")
        _login(client, "alice", "secret123")

        # Confirm alice is logged in
        client.get("/logout", follow_redirects=True)

        # Register bob (password >= 6 chars)
        _register_user(client, "bob", "bob@x.com", "bobspass")
        client.get("/logout", follow_redirects=True)

        # Alice follows bob
        _login(client, "alice", "secret123")
        r = client.post("/follow/bob", follow_redirects=True)
        assert r.status_code == 200

        # Check following page (uses username, not id)
        r = client.get("/following/alice")
        assert r.status_code == 200
        assert b"bob" in r.data

        # Unfollow
        r = client.post("/follow/bob", follow_redirects=True)
        assert r.status_code == 200

    def test_follow_self_fails(self, client: FlaskClient):
        _register_user(client, "alice", "alice@x.com", "secret123")
        _login(client, "alice", "secret123")
        # Check user is actually logged in
        r = client.get("/settings")
        assert r.status_code == 200
        r = client.post("/follow/alice", follow_redirects=True)
        # Should return error — cannot follow yourself
        assert r.status_code in (200, 400)
        if r.status_code == 200:
            assert b"yourself" in r.data.lower() or b"cannot" in r.data.lower()


# =============================================================================
# Flow 4 — Chat lifecycle
# =============================================================================


class TestChatFlow:
    """Create chat → send → read → edit → delete."""

    def test_chat_lifecycle(self, client: FlaskClient):
        _register_user(client, "alice", "alice@x.com", "secret123")
        _login(client, "alice", "secret123")
        client.get("/logout", follow_redirects=True)

        _register_user(client, "bob", "bob@x.com", "bobspass")
        client.get("/logout", follow_redirects=True)

        # Alice creates chat with bob
        _login(client, "alice", "secret123")
        r = client.post("/chat/start/bob")
        assert r.status_code == 200
        data = r.get_json()
        assert data is not None
        chat_id = data.get("chat_id")
        assert chat_id is not None

        # Send message
        r = client.post(
            f"/chat/{chat_id}/send",
            data=json.dumps({"text": "Hello Bob!"}),
            content_type="application/json",
        )
        assert r.status_code == 200
        data = r.get_json()
        assert data is not None
        assert data["message"]["text"] == "Hello Bob!"
        msg_id = data["message"]["id"]

        # Read messages
        r = client.get(f"/chat/{chat_id}/messages")
        assert r.status_code == 200
        msgs = r.get_json()
        assert msgs is not None
        assert len(msgs["messages"]) > 0

        # Edit message
        r = client.patch(
            f"/chat/{chat_id}/messages/{msg_id}",
            data=json.dumps({"text": "Edited!"}),
            content_type="application/json",
        )
        assert r.status_code == 200
        data = r.get_json()
        assert data is not None
        assert data["message"]["text"] == "Edited!"

        # Delete message
        r = client.delete(f"/chat/{chat_id}/messages/{msg_id}")
        assert r.status_code == 200
        assert r.get_json()["status"] == "deleted"


# =============================================================================
# Flow 5 — Settings: password change
# =============================================================================


class TestSettingsFlow:
    """Change password → logout → login with new password."""

    def test_change_password_and_login(self, client: FlaskClient):
        _register_user(client, "alice", "alice@x.com", "oldpass")
        _login(client, "alice", "oldpass")

        r = client.post(
            "/settings",
            data={
                "current_password": "oldpass",
                "new_password": "newpass123",
                "confirm_password": "newpass123",
                "language": "en",
                "active_tab": "account",
            },
            follow_redirects=True,
        )
        assert r.status_code == 200

        client.get("/logout", follow_redirects=True)

        r = client.post(
            "/login",
            data={
                "email_or_username": "alice",
                "password": "newpass123",
            },
            follow_redirects=True,
        )
        assert r.status_code == 200

        r = client.get("/settings")
        assert r.status_code == 200


# =============================================================================
# Flow 6 — Save/unsave posts
# =============================================================================


class TestSaveFlow:
    """Save post → see in saved → unsave."""

    def test_save_lifecycle(self, client: FlaskClient):
        _register_user(client, "alice", "alice@x.com", "secret123")
        _login(client, "alice", "secret123")

        client.post("/create", data={"text": "Save me!"})

        # Save via /post/1/save
        r = client.post("/post/1/save")
        assert r.status_code == 200
        data = r.get_json()
        assert data is not None
        assert data.get("is_saved") is True
        assert data.get("status") == "saved"

        # Check saved page
        r = client.get("/saved")
        assert r.status_code == 200
        assert b"Save me!" in r.data

        # Unsave
        r = client.post("/post/1/save")
        assert r.status_code == 200
        data = r.get_json()
        assert data is not None
        assert data.get("is_saved") is False
        assert data.get("status") == "unsaved"


# =============================================================================
# Flow 7 — Language switch
# =============================================================================


class TestLanguageFlow:
    """Switch languages and verify content changes."""

    def test_switch_to_russian(self, client: FlaskClient):
        _register_user(client)
        _login(client)

        # Switch to RU
        r = client.get("/?lang=ru", follow_redirects=True)
        assert r.status_code == 200
        # Page should have lang="ru" on the html tag
        assert b'lang="ru"' in r.data

    def test_switch_back_to_english(self, client: FlaskClient):
        _register_user(client)
        _login(client)

        client.get("/?lang=ru", follow_redirects=True)
        r = client.get("/?lang=en", follow_redirects=True)
        assert r.status_code == 200
        assert b'lang="en"' in r.data


# =============================================================================
# Flow 8 — Feed / Sitemap / Health
# =============================================================================


class TestFeedAndMisc:
    """Feed renders, sitemap and health endpoints work."""

    def test_feed_loads(self, client: FlaskClient):
        r = client.get("/")
        assert r.status_code == 200

    def test_sitemap_returns_xml(self, client: FlaskClient):
        r = client.get("/sitemap.xml")
        assert r.status_code == 200
        assert b"<?xml" in r.data or b"urlset" in r.data

    def test_health_returns_ok(self, client: FlaskClient):
        r = client.get("/health")
        assert r.status_code == 200
        data = r.get_json()
        assert data is not None
        assert data.get("status") == "ok"
