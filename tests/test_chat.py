"""Tests for chat: create conversation, send message, list chats, read status."""

import json

from flask.testing import FlaskClient
from flask import Flask

from app.models import Message
from tests.conftest import register_user_via_db


def _login(client: FlaskClient, username: str = 'testuser',
           password: str = 'secret123') -> None:
    register_user_via_db(username, password)
    client.post('/login', data={
        'email_or_username': username, 'password': password,
    })


def _start_chat(client: FlaskClient, username: str) -> int:
    """Start a chat with another user (must be logged in). Returns chat_id."""
    r = client.post(f'/chat/start/{username}')
    assert r.status_code == 200
    return r.get_json()['chat_id']


# ── Chat access (all return JSON, not HTML) ──

class TestChatAccess:
    """Basic access control for chat pages."""

    def test_chat_index_requires_auth(self, client: FlaskClient) -> None:
        """GET /chat without login redirects."""
        r = client.get('/chat')
        assert r.status_code == 302

    def test_chat_index_loads(self, client: FlaskClient) -> None:
        """GET /chat when logged in returns 200."""
        _login(client, username='chatter')
        r = client.get('/chat')
        assert r.status_code == 200

    def test_chat_api_list_requires_auth(self, client: FlaskClient) -> None:
        """GET /api/chat/list without login redirects."""
        r = client.get('/api/chat/list')
        assert r.status_code == 302


class TestCreateChat:
    """Creating new conversations — POST /chat/start/<username>."""

    def test_create_chat(self, client: FlaskClient) -> None:
        """Start chat with another user returns JSON with chat_id."""
        register_user_via_db('friend')
        _login(client, username='starter')
        r = client.post('/chat/start/friend')
        assert r.status_code == 200
        data = r.get_json()
        assert 'chat_id' in data

    def test_create_chat_reuses_existing(self, client: FlaskClient,
                                          app: Flask) -> None:
        """Starting chat with same user returns existing chat_id."""
        register_user_via_db('pal')
        _login(client, username='reuser')
        r1 = client.post('/chat/start/pal')
        chat_id1 = r1.get_json()['chat_id']
        r2 = client.post('/chat/start/pal')
        chat_id2 = r2.get_json()['chat_id']
        assert chat_id1 == chat_id2

    def test_create_chat_self_fails(self, client: FlaskClient) -> None:
        """Cannot start a chat with yourself."""
        _login(client, username='lonely')
        r = client.post('/chat/start/lonely')
        assert r.status_code in (400, 500)

    def test_chat_nonexistent_user(self, client: FlaskClient) -> None:
        """Start chat with non-existent user returns 404."""
        _login(client, username='searcher')
        r = client.post('/chat/start/doesnotexist')
        assert r.status_code == 404

    def test_create_chat_anonymous(self, client: FlaskClient) -> None:
        """Anonymous user cannot start chat."""
        r = client.post('/chat/start/someone')
        assert r.status_code == 302


class TestSendMessage:
    """Sending messages — POST /chat/<chat_id>/send."""

    def test_send_message(self, client: FlaskClient, app: Flask) -> None:
        """Send a message via JSON returns success with message data."""
        register_user_via_db('buddy')
        _login(client, username='sender')
        chat_id = _start_chat(client, 'buddy')

        r = client.post(f'/chat/{chat_id}/send', json={'text': 'hello!'})
        assert r.status_code == 200
        data = r.get_json()
        assert 'message' in data
        assert data['message']['text'] == 'hello!'

    def test_send_empty_message_fails(self, client: FlaskClient,
                                       app: Flask) -> None:
        """Empty message returns 400."""
        register_user_via_db('buddy2')
        _login(client, username='sender2')
        chat_id = _start_chat(client, 'buddy2')
        r = client.post(f'/chat/{chat_id}/send', json={'text': ''})
        assert r.status_code == 400

    def test_send_to_nonexistent_chat(self, client: FlaskClient) -> None:
        """Send to non-existent chat returns 403 (not participant)."""
        _login(client, username='stranger')
        r = client.post('/chat/99999/send', json={'text': 'hi'})
        assert r.status_code == 403

    def test_send_not_participant(self, client: FlaskClient,
                                   app: Flask) -> None:
        """User not in the chat cannot send messages."""
        # Create users A and B, start a chat
        register_user_via_db('user_a')
        register_user_via_db('user_b')
        _login(client, username='user_a')
        chat_id = _start_chat(client, 'user_b')

        # Login as user C (not in the chat)
        register_user_via_db('user_c')
        _login(client, username='user_c')
        r = client.post(f'/chat/{chat_id}/send', json={'text': 'hack'})
        assert r.status_code in (403, 404, 400)


class TestChatList:
    """Listing conversations — GET /api/chat/list."""

    def test_chat_list_empty(self, client: FlaskClient) -> None:
        """Chat list is empty for a user with no conversations."""
        _login(client, username='loner')
        r = client.get('/api/chat/list')
        assert r.status_code == 200
        data = r.get_json()
        assert 'chats' in data
        assert len(data['chats']) == 0

    def test_chat_list_with_conversation(self, client: FlaskClient,
                                          app: Flask) -> None:
        """Chat list shows conversation after starting one."""
        register_user_via_db('other')
        _login(client, username='mainuser')
        _start_chat(client, 'other')
        r = client.get('/api/chat/list')
        data = r.get_json()
        assert len(data['chats']) == 1
        assert data['chats'][0]['other_user']['username'] == 'other'


class TestChatMessages:
    """Retrieving messages — GET /chat/<chat_id>/messages."""

    def test_get_messages(self, client: FlaskClient, app: Flask) -> None:
        """GET /chat/<id>/messages returns message list."""
        register_user_via_db('responder')
        _login(client, username='asker')
        chat_id = _start_chat(client, 'responder')
        client.post(f'/chat/{chat_id}/send', json={'text': 'test msg'})
        r = client.get(f'/chat/{chat_id}/messages')
        assert r.status_code == 200
        data = r.get_json()
        assert 'messages' in data
        assert len(data['messages']) >= 1

    def test_get_messages_not_participant(self, client: FlaskClient,
                                           app: Flask) -> None:
        """Non-participant cannot get messages."""
        register_user_via_db('a')
        register_user_via_db('b')
        _login(client, username='a')
        chat_id = _start_chat(client, 'b')

        register_user_via_db('eavesdropper')
        _login(client, username='eavesdropper')
        r = client.get(f'/chat/{chat_id}/messages')
        assert r.status_code in (403, 404)


class TestMessagePersistence:
    """Messages are stored and read status works."""

    def test_message_is_stored(self, client: FlaskClient,
                                app: Flask) -> None:
        """Sent message persists in DB."""
        register_user_via_db('buddy_p')
        _login(client, username='persister')
        chat_id = _start_chat(client, 'buddy_p')
        client.post(f'/chat/{chat_id}/send', json={'text': 'persist me'})
        with app.app_context():
            msgs = Message.query.filter_by(chat_id=chat_id).all()
            assert len(msgs) == 1
            # Message text is encrypted via Fernet, not plaintext
            assert msgs[0].text != ''

    def test_edit_message(self, client: FlaskClient, app: Flask) -> None:
        """Author can edit their message via PATCH."""
        register_user_via_db('buddy_e')
        _login(client, username='editor')
        chat_id = _start_chat(client, 'buddy_e')
        r = client.post(f'/chat/{chat_id}/send', json={'text': 'original'})
        msg_id = r.get_json()['message']['id']

        r = client.patch(f'/chat/{chat_id}/messages/{msg_id}',
                         json={'text': 'edited'})
        assert r.status_code == 200
        data = r.get_json()
        assert data['message']['text'] == 'edited'

    def test_delete_message(self, client: FlaskClient, app: Flask) -> None:
        """Author can delete their message via DELETE."""
        register_user_via_db('buddy_d')
        _login(client, username='deleter')
        chat_id = _start_chat(client, 'buddy_d')
        r = client.post(f'/chat/{chat_id}/send', json={'text': 'delete me'})
        msg_id = r.get_json()['message']['id']

        r = client.delete(f'/chat/{chat_id}/messages/{msg_id}')
        assert r.status_code == 200
        data = r.get_json()
        assert data['status'] == 'deleted'
