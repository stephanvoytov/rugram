"""Tests for post CRUD and interactions (like, comment, repost, save)."""

import json

from flask import Flask
from flask.testing import FlaskClient

from app.models import Comment, Like, Post, Repost, SavedPost
from extensions import db
from tests.conftest import register_user_via_db

# ── Helpers ──


def _login(client: FlaskClient, username: str = "testuser", password: str = "secret123") -> None:
    """Login a test user (created via DB, just logs in via HTTP)."""
    register_user_via_db(username, password)
    client.post(
        "/login",
        data={
            "email_or_username": username,
            "password": password,
        },
    )


def _create_post(client: FlaskClient, text: str = "hello world") -> dict:
    """Create a post and return the redirect location."""
    r = client.post("/create", data={"text": text, "image": ""}, follow_redirects=False)
    assert r.status_code == 302
    return {"location": r.location}


# ── Post CRUD ──


class TestCreatePost:
    def test_create_post_requires_auth(self, client: FlaskClient) -> None:
        """POST /create without login should redirect to login."""
        r = client.post("/create", data={"text": "test"})
        assert r.status_code == 302
        assert "/login" in r.location

    def test_create_post_success(self, client: FlaskClient, app: Flask) -> None:
        """Logged-in user can create a post."""
        _login(client)
        r = client.post("/create", data={"text": "my first post"}, follow_redirects=True)
        assert r.status_code == 200
        with app.app_context():
            p = Post.query.filter_by(text="my first post").first()
            assert p is not None
            assert p.is_deleted is False

    def test_create_post_with_tags(self, client: FlaskClient, app: Flask) -> None:
        """Post text with #hashtags extracts tags."""
        _login(client)
        client.post("/create", data={"text": "hello #world #flask"}, follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="hello #world #flask").first()
            assert p is not None
            tags = [pt.tag.name for pt in p.post_tags]
            assert "world" in tags
            assert "flask" in tags

    def test_create_post_empty_text_fails(self, client: FlaskClient) -> None:
        """Creating a post with empty text should fail."""
        _login(client)
        r = client.post("/create", data={"text": ""}, follow_redirects=True)
        assert r.status_code == 200
        # Should show error (form validation)
        assert b"error" in r.data.lower() or b"required" in r.data.lower()


class TestViewPost:
    def test_view_post(self, client: FlaskClient, app: Flask) -> None:
        """GET /post/<id> shows the post."""
        _login(client)
        client.post("/create", data={"text": "viewable post"}, follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="viewable post").first()
        r = client.get(f"/post/{p.id}")
        assert r.status_code == 200
        assert b"viewable post" in r.data

    def test_view_deleted_post_404(self, client: FlaskClient, app: Flask) -> None:
        """GET /post/<id> on deleted post returns 404."""
        _login(client)
        client.post("/create", data={"text": "will be deleted"}, follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="will be deleted").first()
            post_id = p.id  # capture ID before session ends
            p.is_deleted = True
            db.session.commit()
        r = client.get(f"/post/{post_id}")
        assert r.status_code == 404


class TestEditPost:
    def test_edit_own_post(self, client: FlaskClient, app: Flask) -> None:
        """Author can edit their post."""
        _login(client, username="editor")
        client.post("/create", data={"text": "original text"}, follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="original text").first()
        r = client.post(f"/edit_post/{p.id}", data={"text": "edited text"}, follow_redirects=True)
        assert r.status_code == 200
        with app.app_context():
            updated = db.session.get(Post, p.id)
            assert updated.text == "edited text"

    def test_edit_others_post_403(self, client: FlaskClient, app: Flask) -> None:
        """Non-author cannot edit a post."""
        _login(client, username="author1")
        client.post("/create", data={"text": "author1's post"}, follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="author1's post").first()
        # Login as different user
        _login(client, username="author2")
        r = client.get(f"/edit_post/{p.id}")
        # edit_post filters by author == current_user → first_or_404
        assert r.status_code == 404


class TestDeletePost:
    def test_delete_own_post(self, client: FlaskClient, app: Flask) -> None:
        """Author can soft-delete their post."""
        _login(client, username="deleter")
        client.post("/create", data={"text": "post to delete"}, follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="post to delete").first()
        r = client.delete(f"/delete/{p.id}", headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data.get("success") is True
        with app.app_context():
            updated = db.session.get(Post, p.id)
            assert updated.is_deleted is True

    def test_delete_others_post_403(self, client: FlaskClient, app: Flask) -> None:
        """Non-author cannot delete a post."""
        _login(client, username="author_a")
        client.post("/create", data={"text": "author_a's post"}, follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="author_a's post").first()
        _login(client, username="author_b")
        r = client.delete(f"/delete/{p.id}", headers={"X-Requested-With": "XMLHttpRequest"})
        assert r.status_code in (302, 403, 401)


# ── Post interactions ──


class TestLike:
    def test_like_post(self, client: FlaskClient, app: Flask) -> None:
        """Like a post toggles like count."""
        _login(client, username="liker")
        client.post("/create", data={"text": "likable post"}, follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="likable post").first()
        r = client.post(f"/post/{p.id}/like", headers={"Content-Type": "application/json"})
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data.get("status") == "liked"
        with app.app_context():
            assert Like.query.filter_by(user_id=p.author_id, post_id=p.id).first() is not None

    def test_unlike_post(self, client: FlaskClient, app: Flask) -> None:
        """Second like request toggles to unlike."""
        _login(client, username="unliker")
        client.post("/create", data={"text": "unlikable post"}, follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="unlikable post").first()
        # Like
        client.post(f"/post/{p.id}/like", headers={"Content-Type": "application/json"})
        # Unlike
        r = client.post(f"/post/{p.id}/like", headers={"Content-Type": "application/json"})
        data = json.loads(r.data)
        assert data.get("status") == "unliked"
        with app.app_context():
            assert Like.query.filter_by(user_id=p.author_id, post_id=p.id).first() is None

    def test_like_requires_auth(self, client: FlaskClient, app: Flask) -> None:
        """Anonymous user cannot like a post."""
        _login(client, username="poster")
        client.post("/create", data={"text": "lonely post"}, follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="lonely post").first()
        client.get("/logout")
        r = client.post(f"/post/{p.id}/like", headers={"Content-Type": "application/json"})
        assert r.status_code in (302, 401)

    def test_like_nonexistent_post_404(self, client: FlaskClient) -> None:
        """Like on a non-existent post returns error."""
        _login(client)
        r = client.post("/post/99999/like", headers={"Content-Type": "application/json"})
        assert r.status_code in (400, 404)


class TestComment:
    def test_add_comment(self, client: FlaskClient, app: Flask) -> None:
        """Logged-in user can comment on a post."""
        _login(client, username="commenter")
        client.post("/create", data={"text": "commentable post"}, follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="commentable post").first()
        r = client.post(f"/post/{p.id}/comment", data={"text": "nice post!"}, follow_redirects=True)
        assert r.status_code == 200
        with app.app_context():
            c = Comment.query.filter_by(post_id=p.id).first()
            assert c is not None
            assert c.text == "nice post!"

    def test_comment_json_response(self, client: FlaskClient, app: Flask) -> None:
        """Comment with AJAX header returns JSON."""
        _login(client, username="ajaxer")
        client.post("/create", data={"text": "ajax post"}, follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="ajax post").first()
        r = client.post(
            f"/post/{p.id}/comment",
            data={"text": "ajax comment"},
            headers={"X-Requested-With": "XMLHttpRequest"},
        )
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data.get("status") == "success"

    def test_delete_own_comment(self, client: FlaskClient, app: Flask) -> None:
        """Author can delete their comment."""
        _login(client, username="deleter")
        client.post("/create", data={"text": "post with comment"}, follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="post with comment").first()
        # Add comment
        client.post(f"/post/{p.id}/comment", data={"text": "my comment"}, follow_redirects=True)
        with app.app_context():
            c = Comment.query.filter_by(post_id=p.id).first()
        # Delete comment
        r = client.delete(f"/comment/{c.id}")
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data.get("status") == "deleted"


class TestRepost:
    def test_repost_toggle(self, client: FlaskClient, app: Flask) -> None:
        """Repost toggles repost status."""
        _login(client, username="reposter")
        client.post("/create", data={"text": "repostable post"}, follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="repostable post").first()
        # Repost
        r = client.post(f"/post/{p.id}/repost", headers={"Content-Type": "application/json"})
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data.get("status") == "reposted"
        with app.app_context():
            assert Repost.query.filter_by(user_id=p.author_id, post_id=p.id).first() is not None


class TestSave:
    def test_save_toggle(self, client: FlaskClient, app: Flask) -> None:
        """Save/bookmark toggles saved status."""
        _login(client, username="saver")
        client.post("/create", data={"text": "saveable post"}, follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="saveable post").first()
        # Save
        r = client.post(f"/post/{p.id}/save", headers={"Content-Type": "application/json"})
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data.get("status") == "saved"
        with app.app_context():
            assert SavedPost.query.filter_by(user_id=p.author_id, post_id=p.id).first() is not None
        # Unsave
        r = client.post(f"/post/{p.id}/save", headers={"Content-Type": "application/json"})
        data = json.loads(r.data)
        assert data.get("status") == "unsaved"
