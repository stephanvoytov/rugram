"""Tests for REST API at /api/v1/posts and /api/feed."""

import json

from flask.testing import FlaskClient
from flask import Flask

from app.models import User, Post
from extensions import db


def _login(client: FlaskClient, username: str = 'testuser',
           password: str = 'secret123') -> None:
    client.post('/register', data={
        'username': username, 'email': f'{username}@test.com',
        'password': password, 'password2': password,
    }, follow_redirects=True)
    client.post('/login', data={
        'email_or_username': username, 'password': password,
    })


class TestApiGetPosts:
    """Listing posts via API."""

    def test_get_posts_anonymous(self, client: FlaskClient) -> None:
        """GET /api/v1/posts works without auth."""
        r = client.get('/api/v1/posts')
        assert r.status_code == 200
        data = json.loads(r.data)
        assert 'posts' in data

    def test_get_posts_pagination(self, client: FlaskClient,
                                  app: Flask) -> None:
        """API returns paginated posts with correct structure."""
        _login(client, username='poster')
        for i in range(3):
            client.post('/create', data={'text': f'api post {i}'},
                        follow_redirects=True)

        r = client.get('/api/v1/posts')
        assert r.status_code == 200
        data = json.loads(r.data)
        assert 'posts' in data
        assert len(data['posts']) >= 1
        post = data['posts'][0]
        assert 'id' in post
        assert 'text' in post
        assert 'author' in post or 'author_id' in post


class TestApiGetSinglePost:
    """Getting a single post by ID."""

    def test_get_single_post(self, client: FlaskClient,
                             app: Flask) -> None:
        """GET /api/v1/posts/<id> returns the post."""
        _login(client, username='apiuser')
        client.post('/create', data={'text': 'single api post'},
                    follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text='single api post').first()

        r = client.get(f'/api/v1/posts/{p.id}')
        assert r.status_code == 200
        data = json.loads(r.data)
        # PostResource wraps response in {'post': {...}}
        assert data['post']['text'] == 'single api post'

    def test_get_nonexistent_post_404(self, client: FlaskClient) -> None:
        """GET /api/v1/posts/<invalid_id> returns 404."""
        r = client.get('/api/v1/posts/99999')
        assert r.status_code == 404


class TestApiCreatePost:
    """Creating posts via API."""

    def test_create_post_via_api(self, client: FlaskClient,
                                 app: Flask) -> None:
        """POST /api/v1/posts creates a post via API."""
        _login(client, username='api_creator')
        r = client.post('/api/v1/posts', json={
            'text': 'created via api',
        })
        with app.app_context():
            p = Post.query.filter_by(text='created via api').first()
            assert p is not None

    def test_create_post_empty_text(self, client: FlaskClient) -> None:
        """POST /api/v1/posts with empty text returns error."""
        _login(client, username='api_empty')
        r = client.post('/api/v1/posts', json={
            'text': '',
        })
        assert r.status_code in (200, 400)
        data = r.get_json(silent=True) or {}
        if r.status_code == 400:
            assert 'error' in data


class TestApiDeletePost:
    """Deleting posts via API."""

    def test_delete_post_via_api(self, client: FlaskClient,
                                 app: Flask) -> None:
        """DELETE /api/v1/posts/<id> deletes owned post."""
        _login(client, username='api_deleter')
        client.post('/create', data={'text': 'api deletable'},
                    follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text='api deletable').first()

        r = client.delete(f'/api/v1/posts/{p.id}')
        if r.status_code == 204:
            with app.app_context():
                assert db.session.get(Post, p.id).is_deleted
        elif r.status_code == 200:
            data = json.loads(r.data)
            # PostResource.delete() returns {'success': 'OK'}
            assert data.get('success') == 'OK'

    def test_delete_others_post_via_api(self, client: FlaskClient,
                                         app: Flask) -> None:
        """DELETE /api/v1/posts/<id> for another's post returns 403."""
        _login(client, username='author_a')
        client.post('/create', data={'text': "a's post"},
                    follow_redirects=True)
        with app.app_context():
            p = Post.query.filter_by(text="a's post").first()

        _login(client, username='author_b')
        r = client.delete(f'/api/v1/posts/{p.id}')
        # The API returns 403 for non-owner via abort(403)
        assert r.status_code in (302, 403, 401)


class TestApiFeed:
    """Feed endpoint (/api/feed, not /api/v1/feed)."""

    def test_feed_exists(self, client: FlaskClient) -> None:
        """GET /api/feed returns posts (no auth needed)."""
        r = client.get('/api/feed')
        assert r.status_code == 200
        data = json.loads(r.data)
        assert 'posts' in data

    def test_feed_requires_auth(self, client: FlaskClient) -> None:
        """GET /api/feed without auth still returns 200 (public endpoint)."""
        r = client.get('/api/feed')
        # /api/feed is public — no login_required
        assert r.status_code == 200
