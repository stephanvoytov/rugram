"""Unit tests for all service classes.

Repository calls are mocked — only business logic is tested:
ownership guards, validation, exception types, side-effect rules.
"""

# ── imports ──────────────────────────────────────────────────────────────────

from unittest.mock import MagicMock, patch

import pytest

from app.services.base import (
    ForbiddenError,
    NotFoundError,
    ServiceError,
    cursor_paginate,
)
from app.services.post_service import PostService

# =============================================================================
# cursor_paginate
# =============================================================================


class TestCursorPaginate:
    """Direct unit tests for the cursor_paginate helper."""

    # ── helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def _make_query(items: list, id_col=None):
        """Build a minimal mock query that behaves enough for paginate."""
        q = MagicMock()
        q.limit.return_value.all.return_value = items
        q.filter.return_value = q
        q.offset.return_value = q
        if id_col is None:
            fake_col = MagicMock()
            fake_col.__name__ = "id"
            q.column_descriptions = [{"expr": type("M", (), {"id": fake_col})()}]
        else:
            q.column_descriptions = [{"expr": type("M", (), {"id": id_col})()}]
        return q

    # ── tests ────────────────────────────────────────────────────────────

    def test_first_page(self):
        items = [MagicMock(id=i) for i in range(5, 0, -1)]  # 5 4 3 2 1
        q = self._make_query([*items, MagicMock(id=0)])  # +1 for has_more check
        result, cursor, has_more = cursor_paginate(q, None, limit=5)
        assert len(result) == 5
        assert cursor == 1
        assert has_more is True

    def test_exact_fit(self):
        items = [MagicMock(id=i) for i in range(3, 0, -1)]
        q = self._make_query(items)  # no extra item → no more
        result, cursor, has_more = cursor_paginate(q, None, limit=3)
        assert len(result) == 3
        assert cursor == 1
        assert has_more is False

    def test_with_cursor(self):
        id_col = MagicMock()
        id_col.__lt__ = lambda self, other: True  # pragma: no cover — mock
        items = [MagicMock(id=i) for i in range(5, 1, -1)]  # 4 items: 5,4,3,2
        q = self._make_query([*items, MagicMock(id=0)], id_col=id_col)
        _result, _cursor, has_more = cursor_paginate(q, 5, limit=3, id_col=id_col)
        q.filter.assert_called_once()
        assert has_more is True

    def test_empty_result(self):
        q = self._make_query([])
        result, cursor, has_more = cursor_paginate(q, None, limit=10)
        assert result == []
        assert cursor is None
        assert has_more is False

    def test_max_limit_clamp(self):
        items = [MagicMock(id=i) for i in range(200, 0, -1)]
        q = self._make_query(items[:101])
        result, _cursor, has_more = cursor_paginate(q, None, limit=999)
        assert len(result) <= 100
        assert has_more is True

    def test_single_item(self):
        items = [MagicMock(id=42)]
        q = self._make_query(items)
        result, cursor, has_more = cursor_paginate(q, None, limit=5)
        assert len(result) == 1
        assert cursor == 42
        assert has_more is False


# =============================================================================
# Exceptions
# =============================================================================


class TestServiceException:
    """ServiceError / NotFoundError / ForbiddenError — status code contract."""

    def test_service_error_default_code(self):
        e = ServiceError("bad request")
        assert e.status_code == 400
        assert str(e) == "bad request"

    def test_service_error_custom_code(self):
        e = ServiceError("gone", status_code=410)
        assert e.status_code == 410

    def test_not_found_default_code(self):
        e = NotFoundError()
        assert e.status_code == 404
        assert str(e) == "Resource not found"

    def test_not_found_custom_message(self):
        e = NotFoundError("Post not found")
        assert str(e) == "Post not found"

    def test_forbidden_default_code(self):
        e = ForbiddenError()
        assert e.status_code == 403
        assert str(e) == "Access denied"


# =============================================================================
# PostService
# =============================================================================


class TestPostService:
    """PostService — CRUD, likes, comments, reposts, saves, tags."""

    # ── create_post ────────────────────────────────────────────────────

    @patch("app.services.post_service.PostRepository")
    def test_create_post_success(self, mock_repo):
        mock_post = MagicMock(id=10, author_id=1)
        mock_repo.create_post.return_value = mock_post

        result = PostService.create_post(1, "Hello world")

        mock_repo.create_post.assert_called_once_with(1, "Hello world", None)
        mock_repo.commit.assert_called_once()
        assert result.id == 10

    @patch("app.services.post_service.PostRepository")
    def test_create_post_with_image_and_tags(self, mock_repo):
        mock_post = MagicMock(id=11, author_id=1)
        mock_repo.create_post.return_value = mock_post

        PostService.create_post(1, "Text", image="img.jpg", tag_names=["test", "rugram"])

        mock_repo.create_post.assert_called_once_with(1, "Text", "img.jpg")
        mock_repo.sync_tags.assert_called_once_with(11, ["test", "rugram"])

    @patch("app.services.post_service.PostRepository")
    def test_create_post_empty_text_raises(self, mock_repo):
        with pytest.raises(ServiceError, match="cannot be empty"):
            PostService.create_post(1, "")
        mock_repo.create_post.assert_not_called()

    @patch("app.services.post_service.PostRepository")
    def test_create_post_whitespace_only_raises(self, mock_repo):
        with pytest.raises(ServiceError):
            PostService.create_post(1, "   ")
        mock_repo.create_post.assert_not_called()

    # ── get_post ────────────────────────────────────────────────────────

    @patch("app.services.post_service.PostRepository")
    def test_get_post_found(self, mock_repo):
        mock_post = MagicMock(id=5)
        mock_repo.get.return_value = mock_post

        result = PostService.get_post(5)
        assert result.id == 5

    @patch("app.services.post_service.PostRepository")
    def test_get_post_not_found(self, mock_repo):
        mock_repo.get.return_value = None
        with pytest.raises(NotFoundError, match="not found"):
            PostService.get_post(999)

    # ── get_post_detail ────────────────────────────────────────────────

    @patch("app.services.post_service.PostRepository")
    def test_get_post_detail_found(self, mock_repo):
        mock_post = MagicMock(id=5, author=MagicMock(id=1))
        mock_repo.get_with_author.return_value = mock_post

        result = PostService.get_post_detail(5)
        assert result.author.id == 1

    @patch("app.services.post_service.PostRepository")
    def test_get_post_detail_not_found(self, mock_repo):
        mock_repo.get_with_author.return_value = None
        with pytest.raises(NotFoundError):
            PostService.get_post_detail(999)

    # ── edit_post ──────────────────────────────────────────────────────

    @patch("app.services.post_service.PostRepository")
    def test_edit_post_success(self, mock_repo):
        mock_post = MagicMock(id=1, author_id=1)
        mock_repo.get.return_value = mock_post

        result = PostService.edit_post(1, 1, "Updated text")

        assert result.text == "Updated text"
        mock_repo.commit.assert_called_once()
        mock_repo.sync_tags.assert_not_called()

    @patch("app.services.post_service.PostRepository")
    def test_edit_post_sync_tags(self, mock_repo):
        mock_post = MagicMock(id=1, author_id=1)
        mock_repo.get.return_value = mock_post

        PostService.edit_post(1, 1, "Updated", tag_names=["newtag"])

        mock_repo.sync_tags.assert_called_once_with(1, ["newtag"])

    @patch("app.services.post_service.PostRepository")
    def test_edit_post_wrong_owner(self, mock_repo):
        mock_post = MagicMock(id=1, author_id=2)  # author != user
        mock_repo.get.return_value = mock_post

        with pytest.raises(ForbiddenError, match="own posts"):
            PostService.edit_post(1, 1, "text")
        mock_repo.commit.assert_not_called()

    @patch("app.services.post_service.PostRepository")
    def test_edit_post_empty_text(self, mock_repo):
        mock_post = MagicMock(id=1, author_id=1)
        mock_repo.get.return_value = mock_post

        with pytest.raises(ServiceError, match="cannot be empty"):
            PostService.edit_post(1, 1, "")

    @patch("app.services.post_service.PostRepository")
    def test_edit_post_not_found(self, mock_repo):
        mock_repo.get.return_value = None
        with pytest.raises(NotFoundError):
            PostService.edit_post(999, 1, "text")

    # ── delete_post ────────────────────────────────────────────────────

    @patch("app.services.post_service.PostRepository")
    def test_delete_post_success(self, mock_repo):
        mock_post = MagicMock(id=1, author_id=1, is_deleted=False)
        mock_repo.get.return_value = mock_post

        PostService.delete_post(1, 1)

        assert mock_post.is_deleted is True
        mock_repo.commit.assert_called_once()

    @patch("app.services.post_service.PostRepository")
    def test_delete_post_wrong_owner(self, mock_repo):
        mock_post = MagicMock(id=1, author_id=2)
        mock_repo.get.return_value = mock_post

        with pytest.raises(ForbiddenError):
            PostService.delete_post(1, 1)

    # ── admin operations ──────────────────────────────────────────────

    @patch("app.services.post_service.PostRepository")
    def test_admin_delete_post(self, mock_repo):
        mock_post = MagicMock(id=1, author_id=2, is_deleted=False)
        mock_repo.get.return_value = mock_post

        PostService.admin_delete_post(1)  # no ownership check

        assert mock_post.is_deleted is True

    @patch("app.services.post_service.PostRepository")
    def test_admin_restore_post(self, mock_repo):
        mock_post = MagicMock(id=1, author_id=2, is_deleted=True)
        mock_repo.get.return_value = mock_post

        PostService.admin_restore_post(1)

        assert mock_post.is_deleted is False

    @patch("app.services.post_service.PostRepository")
    def test_admin_restore_not_deleted(self, mock_repo):
        mock_post = MagicMock(id=1, is_deleted=False)
        mock_repo.get.return_value = mock_post

        with pytest.raises(ServiceError, match="not deleted"):
            PostService.admin_restore_post(1)

    # ── toggle_like ──────────────────────────────────────────────────────

    @patch("app.services.post_service.PostRepository")
    @patch("app.services.post_service.NotificationRepository")
    def test_toggle_like_fresh(self, mock_notif, mock_repo):
        mock_post = MagicMock(id=5, author_id=2, likes_count=3)
        mock_repo.get.return_value = mock_post
        mock_repo.get_like.return_value = None  # not liked yet

        result = PostService.toggle_like(5, 1)

        assert result == {"liked": True, "likes_count": 3}
        mock_repo.add_like.assert_called_once_with(1, 5)
        mock_notif.create_notification.assert_called_once_with(
            user_id=2,
            actor_id=1,
            type_="like",
            post_id=5,
        )

    @patch("app.services.post_service.PostRepository")
    @patch("app.services.post_service.NotificationRepository")
    def test_toggle_unlike(self, mock_notif, mock_repo):
        mock_post = MagicMock(id=5, author_id=2, likes_count=2)
        mock_like = MagicMock(id=99)
        mock_repo.get.return_value = mock_post
        mock_repo.get_like.return_value = mock_like

        result = PostService.toggle_like(5, 1)

        assert result == {"liked": False, "likes_count": 2}
        mock_repo.delete_like.assert_called_once_with(mock_like)
        mock_notif.create_notification.assert_not_called()

    @patch("app.services.post_service.PostRepository")
    @patch("app.services.post_service.NotificationRepository")
    def test_toggle_self_like_no_notification(self, mock_notif, mock_repo):
        """Self-like should not create a notification."""
        mock_post = MagicMock(id=5, author_id=1)  # author == liker
        mock_repo.get.return_value = mock_post
        mock_repo.get_like.return_value = None

        PostService.toggle_like(5, 1)

        mock_notif.create_notification.assert_not_called()

    @patch("app.services.post_service.PostRepository")
    def test_toggle_like_post_not_found(self, mock_repo):
        mock_repo.get.return_value = None
        with pytest.raises(NotFoundError):
            PostService.toggle_like(999, 1)

    # ── add_comment ────────────────────────────────────────────────────

    @patch("app.services.post_service.PostRepository")
    @patch("app.services.post_service.NotificationRepository")
    def test_add_comment_success(self, mock_notif, mock_repo):
        mock_post = MagicMock(id=10, author_id=2)
        mock_comment = MagicMock(id=1, post_id=10, author_id=1)
        mock_repo.get.return_value = mock_post
        mock_repo.add_comment.return_value = mock_comment

        result = PostService.add_comment(10, 1, "Nice post!")

        assert result.id == 1
        mock_repo.add_comment.assert_called_once_with(10, 1, "Nice post!")
        mock_notif.create_notification.assert_called_once_with(
            user_id=2,
            actor_id=1,
            type_="comment",
            post_id=10,
        )

    @patch("app.services.post_service.PostRepository")
    @patch("app.services.post_service.NotificationRepository")
    def test_add_comment_self_no_notification(self, mock_notif, mock_repo):
        mock_post = MagicMock(id=10, author_id=1)  # author == commenter
        mock_repo.get.return_value = mock_post

        PostService.add_comment(10, 1, "My own post!")

        mock_notif.create_notification.assert_not_called()

    @patch("app.services.post_service.PostRepository")
    def test_add_comment_empty(self, mock_repo):
        mock_post = MagicMock(id=10, author_id=2)
        mock_repo.get.return_value = mock_post

        with pytest.raises(ServiceError, match="cannot be empty"):
            PostService.add_comment(10, 1, "")

    # ── edit_comment ──────────────────────────────────────────────────

    @patch("app.services.post_service.PostRepository")
    def test_edit_comment_success(self, mock_repo):
        mock_comment = MagicMock(id=5, author_id=1)
        mock_repo.get_comment.return_value = mock_comment

        result = PostService.edit_comment(5, 1, "Updated comment")

        assert result.text == "Updated comment"
        mock_repo.commit.assert_called_once()

    @patch("app.services.post_service.PostRepository")
    def test_edit_comment_not_found(self, mock_repo):
        mock_repo.get_comment.return_value = None
        with pytest.raises(NotFoundError):
            PostService.edit_comment(999, 1, "text")

    @patch("app.services.post_service.PostRepository")
    def test_edit_comment_wrong_owner(self, mock_repo):
        mock_comment = MagicMock(id=5, author_id=2)
        mock_repo.get_comment.return_value = mock_comment
        with pytest.raises(ForbiddenError):
            PostService.edit_comment(5, 1, "text")

    @patch("app.services.post_service.PostRepository")
    def test_edit_comment_empty(self, mock_repo):
        mock_comment = MagicMock(id=5, author_id=1)
        mock_repo.get_comment.return_value = mock_comment
        with pytest.raises(ServiceError, match="cannot be empty"):
            PostService.edit_comment(5, 1, "")

    # ── delete_comment ────────────────────────────────────────────────

    @patch("app.services.post_service.PostRepository")
    def test_delete_comment_success(self, mock_repo):
        mock_comment = MagicMock(id=5, author_id=1, post_id=10)
        mock_post = MagicMock(id=10, comments_count=3)
        mock_repo.get_comment.return_value = mock_comment
        mock_repo.get.return_value = mock_post  # for post count refresh

        post_id, count = PostService.delete_comment(5, 1)

        assert post_id == 10
        assert count == 3
        mock_repo.delete_comment_hard.assert_called_once_with(mock_comment)

    @patch("app.services.post_service.PostRepository")
    def test_delete_comment_not_found(self, mock_repo):
        mock_repo.get_comment.return_value = None
        with pytest.raises(NotFoundError):
            PostService.delete_comment(999, 1)

    @patch("app.services.post_service.PostRepository")
    def test_delete_comment_wrong_owner(self, mock_repo):
        mock_comment = MagicMock(id=5, author_id=2)
        mock_repo.get_comment.return_value = mock_comment
        with pytest.raises(ForbiddenError):
            PostService.delete_comment(5, 1)

    # ── toggle_repost ─────────────────────────────────────────────────

    @patch("app.services.post_service.PostRepository")
    def test_repost_fresh(self, mock_repo):
        mock_post = MagicMock(id=5)
        mock_repo.get.return_value = mock_post
        mock_repo.get_repost.return_value = None

        result = PostService.toggle_repost(5, 1)

        assert result == {"reposted": True}
        mock_repo.add_repost.assert_called_once_with(1, 5)

    @patch("app.services.post_service.PostRepository")
    def test_unrepost(self, mock_repo):
        mock_post = MagicMock(id=5)
        mock_repost = MagicMock(id=99)
        mock_repo.get.return_value = mock_post
        mock_repo.get_repost.return_value = mock_repost

        result = PostService.toggle_repost(5, 1)

        assert result == {"reposted": False}
        mock_repo.delete_repost.assert_called_once_with(mock_repost)

    # ── toggle_save ───────────────────────────────────────────────────

    @patch("app.services.post_service.PostRepository")
    def test_save_fresh(self, mock_repo):
        mock_post = MagicMock(id=5)
        mock_repo.get.return_value = mock_post
        mock_repo.get_save.return_value = None

        result = PostService.toggle_save(5, 1)

        assert result == {"saved": True}
        mock_repo.add_save.assert_called_once_with(1, 5)

    @patch("app.services.post_service.PostRepository")
    def test_unsave(self, mock_repo):
        mock_post = MagicMock(id=5)
        mock_save = MagicMock(id=99)
        mock_repo.get.return_value = mock_post
        mock_repo.get_save.return_value = mock_save

        result = PostService.toggle_save(5, 1)

        assert result == {"saved": False}
        mock_repo.delete_save.assert_called_once_with(mock_save)

    # ── get_saved_posts ───────────────────────────────────────────────

    @patch("app.services.post_service.PostRepository")
    def test_get_saved_posts(self, mock_repo):
        mock_repo.get_saved_posts_query.return_value = MagicMock()

        results = PostService.get_saved_posts(1, cursor=None, limit=15)

        mock_repo.get_saved_posts_query.assert_called_once_with(1)
        # cursor_paginate is called — the mock query returns empty pagination
        assert len(results) == 3  # (items, cursor, has_more)


# =============================================================================
# ChatService
# =============================================================================

from app.services.chat_service import ChatService


class TestChatService:
    """ChatService — DMs, messages, encryption, typing."""

    # ── start_or_get_chat ─────────────────────────────────────────────

    @patch("app.services.chat_service.UserRepository")
    @patch("app.services.chat_service.ChatRepository")
    def test_start_new_chat(self, mock_chat, mock_user):
        mock_target = MagicMock(id=2, username="bob")
        mock_user.get_by_username.return_value = mock_target
        mock_chat.get_my_chat_ids.return_value = [1, 2]
        mock_chat.find_common_chat.return_value = None
        mock_chat.create_chat.return_value = MagicMock(id=10)

        result = ChatService.start_or_get_chat(1, "bob")

        assert result == {"chat_id": 10}
        mock_chat.add_participant.assert_any_call(10, 1)
        mock_chat.add_participant.assert_any_call(10, 2)

    @patch("app.services.chat_service.UserRepository")
    @patch("app.services.chat_service.ChatRepository")
    def test_start_existing_chat(self, mock_chat, mock_user):
        mock_target = MagicMock(id=2, username="bob")
        mock_user.get_by_username.return_value = mock_target
        mock_chat.get_my_chat_ids.return_value = [1, 2]
        mock_chat.find_common_chat.return_value = MagicMock(chat_id=7)

        result = ChatService.start_or_get_chat(1, "bob")

        assert result == {"chat_id": 7}
        mock_chat.create_chat.assert_not_called()

    @patch("app.services.chat_service.UserRepository")
    def test_start_user_not_found(self, mock_user):
        mock_user.get_by_username.return_value = None
        with pytest.raises(NotFoundError):
            ChatService.start_or_get_chat(1, "unknown")

    @patch("app.services.chat_service.UserRepository")
    def test_start_self_chat(self, mock_user):
        mock_target = MagicMock(id=1, username="alice")
        mock_user.get_by_username.return_value = mock_target
        with pytest.raises(ServiceError, match="yourself"):
            ChatService.start_or_get_chat(1, "alice")

    # ── _require_participant ──────────────────────────────────────────

    @patch("app.services.chat_service.ChatRepository")
    def test_require_participant_ok(self, mock_chat):
        mock_chat.get_participant.return_value = MagicMock(id=10)
        ChatService._require_participant(5, 1)  # no exception

    @patch("app.services.chat_service.ChatRepository")
    def test_require_participant_denied(self, mock_chat):
        mock_chat.get_participant.return_value = None
        with pytest.raises(ForbiddenError, match="Access denied"):
            ChatService._require_participant(5, 1)

    # ── send_message ──────────────────────────────────────────────────

    @patch("app.services.chat_service.UserRepository")
    @patch("app.services.chat_service.ChatRepository")
    def test_send_text_message(self, mock_chat, mock_user):
        mock_chat.get_participant.return_value = MagicMock()
        mock_user.get.return_value = MagicMock(id=1)
        mock_chat.add_message.return_value = MagicMock(id=100)

        msg = ChatService.send_message(5, 1, text="Hello!")

        assert msg.id == 100
        mock_chat.add_message.assert_called_once()
        # text should be encrypted (we can't easily check the value)
        call_text = mock_chat.add_message.call_args[0][2]
        assert isinstance(call_text, str) and len(call_text) > 0
        mock_chat.commit.assert_called_once()

    @patch("app.services.chat_service.ChatRepository")
    def test_send_message_not_participant(self, mock_chat):
        mock_chat.get_participant.return_value = None
        with pytest.raises(ForbiddenError):
            ChatService.send_message(5, 1, text="hi")

    @patch("app.services.chat_service.UserRepository")
    @patch("app.services.chat_service.ChatRepository")
    def test_send_message_empty(self, mock_chat, mock_user):
        mock_chat.get_participant.return_value = MagicMock()
        with pytest.raises(ServiceError, match="cannot be empty"):
            ChatService.send_message(5, 1, text="")

    @patch("app.services.chat_service.UserRepository")
    @patch("app.services.chat_service.ChatRepository")
    def test_send_image_without_text(self, mock_chat, mock_user):
        mock_chat.get_participant.return_value = MagicMock()
        mock_user.get.return_value = MagicMock(id=1)
        mock_chat.add_message.return_value = MagicMock(id=101)

        msg = ChatService.send_message(5, 1, image_filename="chat_abc.jpg")

        assert msg.id == 101
        mock_chat.add_message.assert_called_once()
        # text should be '' for image-only
        assert mock_chat.add_message.call_args[0][2] == ""

    @patch("app.services.chat_service.UserRepository")
    @patch("app.services.chat_service.ChatRepository")
    def test_send_message_updates_last_seen(self, mock_chat, mock_user):
        mock_chat.get_participant.return_value = MagicMock()
        mock_user_obj = MagicMock(id=1, last_seen=None)
        mock_user.get.return_value = mock_user_obj
        mock_chat.add_message.return_value = MagicMock(id=102)

        ChatService.send_message(5, 1, text="Hello!")

        assert mock_user_obj.last_seen is not None

    # ── get_messages ───────────────────────────────────────────────────

    @patch("app.services.chat_service.UserRepository")
    @patch("app.services.chat_service.ChatRepository")
    def test_get_messages_first_load(self, mock_chat, mock_user):
        mock_chat.get_participant.side_effect = [
            MagicMock(),  # first _require_participant
            MagicMock(last_read_at=None),  # second for last_read update
        ]
        mock_chat.get_messages_query.return_value = MagicMock()
        mock_chat.get_messages_query.return_value.order_by.return_value = (
            mock_chat.get_messages_query.return_value
        )
        mock_chat.get_messages_query.return_value.limit.return_value.all.return_value = []
        mock_chat.get_other_participant.return_value = MagicMock(
            user=MagicMock(
                id=2,
                username="bob",
                profile_image=None,
                is_online=False,
                last_seen_str=lambda: "never",
                last_seen=None,
                spec=["id", "username", "profile_image", "is_online", "last_seen", "last_seen_str"],
            ),
            last_typing_at=None,
        )
        # Ensure user mock has last_seen = None and supports subtraction
        mock_user_obj = MagicMock(spec=["id", "last_seen", "username"])
        mock_user_obj.id = 1
        mock_user_obj.last_seen = None
        mock_user_obj.username = "alice"
        mock_user.get.return_value = mock_user_obj

        result = ChatService.get_messages(5, 1)

        assert result["messages"] == []
        assert result["has_more"] is False
        mock_chat.mark_messages_read.assert_called_once_with(5, 1)

    @patch("app.services.chat_service.UserRepository")
    @patch("app.services.chat_service.ChatRepository")
    def test_get_messages_paginated(self, mock_chat, mock_user):
        mock_chat.get_participant.return_value = MagicMock()
        q = MagicMock()
        mock_chat.get_messages_query.return_value = q
        q.filter.return_value = q
        q.order_by.return_value = q
        q.limit.return_value.all.return_value = []
        mock_chat.get_other_participant.return_value = None
        mock_user.get.return_value = MagicMock(id=1)

        result = ChatService.get_messages(5, 1, before=100)

        assert result["messages"] == []
        # should NOT mark read when paginating
        mock_chat.mark_messages_read.assert_not_called()

    @patch("app.services.chat_service.ChatRepository")
    def test_get_messages_not_participant(self, mock_chat):
        mock_chat.get_participant.return_value = None
        with pytest.raises(ForbiddenError):
            ChatService.get_messages(5, 1)

    # ── edit_message ──────────────────────────────────────────────────

    @patch("app.services.chat_service.ChatRepository")
    def test_edit_message_success(self, mock_chat):
        mock_chat.get_participant.return_value = MagicMock()
        mock_msg = MagicMock(id=50, author_id=1, text="old", edited_at=None)
        mock_chat.get_message.return_value = mock_msg

        msg = ChatService.edit_message(5, 50, 1, "Updated!")

        assert msg.text != "old"  # should be re-encrypted
        assert msg.edited_at is not None

    @patch("app.services.chat_service.ChatRepository")
    def test_edit_message_not_found(self, mock_chat):
        mock_chat.get_participant.return_value = MagicMock()
        mock_chat.get_message.return_value = None
        with pytest.raises(NotFoundError):
            ChatService.edit_message(5, 999, 1, "text")

    @patch("app.services.chat_service.ChatRepository")
    def test_edit_message_wrong_author(self, mock_chat):
        mock_chat.get_participant.return_value = MagicMock()
        mock_chat.get_message.return_value = MagicMock(id=50, author_id=2)
        with pytest.raises(ForbiddenError):
            ChatService.edit_message(5, 50, 1, "text")

    @patch("app.services.chat_service.ChatRepository")
    def test_edit_message_empty(self, mock_chat):
        mock_chat.get_participant.return_value = MagicMock()
        mock_chat.get_message.return_value = MagicMock(id=50, author_id=1)
        with pytest.raises(ServiceError, match="cannot be empty"):
            ChatService.edit_message(5, 50, 1, "")

    # ── delete_message ────────────────────────────────────────────────

    @patch("app.services.chat_service.ChatRepository")
    def test_delete_message_success(self, mock_chat):
        mock_chat.get_participant.return_value = MagicMock()
        mock_msg = MagicMock(id=50, author_id=1, text="secret", image="img.jpg")
        mock_chat.get_message.return_value = mock_msg

        ChatService.delete_message(5, 50, 1)

        assert mock_msg.text == ""
        assert mock_msg.image is None

    @patch("app.services.chat_service.ChatRepository")
    def test_delete_message_wrong_author(self, mock_chat):
        mock_chat.get_participant.return_value = MagicMock()
        mock_chat.get_message.return_value = MagicMock(id=50, author_id=2)
        with pytest.raises(ForbiddenError):
            ChatService.delete_message(5, 50, 1)

    # ── set_typing ────────────────────────────────────────────────────

    @patch("app.services.chat_service.ChatRepository")
    def test_set_typing_ok(self, mock_chat):
        mock_chat.get_participant.return_value = MagicMock(id=10)
        ChatService.set_typing(5, 1)
        mock_chat.update_typing.assert_called_once()
        mock_chat.commit.assert_called_once()

    @patch("app.services.chat_service.ChatRepository")
    def test_set_typing_not_participant(self, mock_chat):
        mock_chat.get_participant.return_value = None
        with pytest.raises(ForbiddenError):
            ChatService.set_typing(5, 1)


# =============================================================================
# SocialService
# =============================================================================

from app.services.social_service import SocialService


class TestSocialService:
    """SocialService — follow/unfollow, user search, profile."""

    # ── get_user / get_user_by_username ──────────────────────────────

    @patch("app.services.social_service.UserRepository")
    def test_get_user_found(self, mock_repo):
        mock_repo.get.return_value = MagicMock(id=1)
        assert SocialService.get_user(1).id == 1

    @patch("app.services.social_service.UserRepository")
    def test_get_user_not_found(self, mock_repo):
        mock_repo.get.return_value = None
        with pytest.raises(NotFoundError):
            SocialService.get_user(999)

    @patch("app.services.social_service.UserRepository")
    def test_get_by_username_found(self, mock_repo):
        mock_repo.get_by_username.return_value = MagicMock(id=1, username="alice")
        u = SocialService.get_user_by_username("alice")
        assert u.username == "alice"

    @patch("app.services.social_service.UserRepository")
    def test_get_by_username_not_found(self, mock_repo):
        mock_repo.get_by_username.return_value = None
        with pytest.raises(NotFoundError):
            SocialService.get_user_by_username("nobody")

    # ── get_profile ──────────────────────────────────────────────────

    @patch("app.services.social_service.UserRepository")
    def test_get_profile_own(self, mock_repo):
        mock_user = MagicMock(id=1, username="alice")
        mock_repo.get.return_value = mock_user
        mock_repo.get_follower_count.return_value = 5
        mock_repo.get_following_count.return_value = 3

        profile = SocialService.get_profile(1, current_user_id=1)

        assert profile["followers_count"] == 5
        assert profile["following_count"] == 3
        assert profile["is_followed"] is False  # own profile
        mock_repo.is_following.assert_not_called()

    @patch("app.services.social_service.UserRepository")
    def test_get_profile_other_followed(self, mock_repo):
        mock_user = MagicMock(id=2, username="bob")
        mock_repo.get.return_value = mock_user
        mock_repo.get_follower_count.return_value = 10
        mock_repo.get_following_count.return_value = 7
        mock_repo.is_following.return_value = True

        profile = SocialService.get_profile(2, current_user_id=1)

        assert profile["is_followed"] is True
        mock_repo.is_following.assert_called_once_with(1, 2)

    # ── toggle_follow ────────────────────────────────────────────────

    @patch("app.services.social_service.UserRepository")
    @patch("app.services.social_service.NotificationRepository")
    def test_follow_success(self, mock_notif, mock_repo):
        mock_repo.get_by_username.return_value = MagicMock(id=2)
        mock_repo.get_follow.return_value = None

        result = SocialService.toggle_follow(1, "bob")

        assert result == {"followed": True}
        mock_repo.add_follow.assert_called_once_with(1, 2)
        mock_notif.create_notification.assert_called_once_with(
            user_id=2,
            actor_id=1,
            type_="follow",
        )

    @patch("app.services.social_service.UserRepository")
    def test_unfollow(self, mock_repo):
        mock_repo.get_by_username.return_value = MagicMock(id=2)
        mock_repo.get_follow.return_value = MagicMock(id=99)

        result = SocialService.toggle_follow(1, "bob")

        assert result == {"followed": False}
        mock_repo.delete_follow.assert_called_once()

    @patch("app.services.social_service.UserRepository")
    def test_follow_self(self, mock_repo):
        mock_repo.get_by_username.return_value = MagicMock(id=1)
        with pytest.raises(ServiceError, match="yourself"):
            SocialService.toggle_follow(1, "alice")

    @patch("app.services.social_service.UserRepository")
    def test_follow_user_not_found(self, mock_repo):
        mock_repo.get_by_username.return_value = None
        with pytest.raises(NotFoundError):
            SocialService.toggle_follow(1, "nobody")

    # ── get_followers / get_following ────────────────────────────────

    @patch("app.services.social_service.UserRepository")
    def test_get_followers(self, mock_repo):
        mock_follows = [MagicMock(follower=MagicMock(id=i)) for i in (3, 2, 1)]
        mock_repo.get_followers_query.return_value = MagicMock()
        mock_repo.get_followers_query.return_value.limit.return_value.all.return_value = [
            *mock_follows,
            MagicMock(),
        ]  # has_more

        users, _cursor, has_more = SocialService.get_followers(1, limit=3)

        assert len(users) == 3
        assert has_more is True

    @patch("app.services.social_service.UserRepository")
    def test_get_following(self, mock_repo):
        mock_follows = [MagicMock(followed=MagicMock(id=i)) for i in (3, 2)]
        mock_repo.get_following_query.return_value = MagicMock()
        mock_repo.get_following_query.return_value.limit.return_value.all.return_value = (
            mock_follows
        )

        users, _cursor, has_more = SocialService.get_following(1)

        assert len(users) == 2
        assert has_more is False

    # ── delete_user_account ──────────────────────────────────────────

    @patch("app.services.social_service.UserRepository")
    def test_delete_user_account(self, mock_repo):
        mock_user = MagicMock(id=1)
        mock_repo.get.return_value = mock_user

        SocialService.delete_user_account(1)

        mock_repo.delete_user_cascade.assert_called_once_with(mock_user)

    # ── get_user_posts ───────────────────────────────────────────────

    @patch("app.repositories.post_repository.PostRepository")
    @patch("app.services.social_service.UserRepository")
    def test_get_user_posts(self, mock_user_repo, mock_post_repo):
        """PostRepository is lazily imported inside get_user_posts — patch source."""
        mock_post_repo.get_user_posts_query.return_value = MagicMock()
        mock_post_repo.get_user_posts_query.return_value.limit.return_value.all.return_value = []

        SocialService.get_user_posts(1)

        mock_post_repo.get_user_posts_query.assert_called_once_with(1)


# =============================================================================
# FeedService
# =============================================================================

from app.services.feed_service import FeedService


class TestFeedService:
    """FeedService — feed queries, search, trending tags."""

    @patch("app.services.feed_service.PostRepository")
    def test_get_feed_page(self, mock_repo):
        mock_repo.get_feed_query.return_value = MagicMock()
        mock_repo.get_feed_query.return_value.paginate.return_value = "pagination"

        result = FeedService.get_feed_page(user_id=1, sort_by="new")
        assert result == "pagination"
        mock_repo.get_feed_query.assert_called_once_with(
            user_id=1,
            followed_only=False,
            tag_filter=None,
            search_query=None,
            sort_by="new",
        )

    @patch("app.services.feed_service.PostRepository")
    def test_get_feed_with_filters(self, mock_repo):
        mock_repo.get_feed_query.return_value = MagicMock()
        mock_repo.get_feed_query.return_value.limit.return_value.all.return_value = []

        FeedService.get_feed(
            user_id=1,
            followed_only=True,
            tag_filter="cat",
            search_query="hello",
            sort_by="hot",
        )

        mock_repo.get_feed_query.assert_called_once_with(
            user_id=1,
            followed_only=True,
            tag_filter="cat",
            search_query="hello",
            sort_by="hot",
        )

    @patch("app.services.feed_service.PostRepository")
    def test_get_trending_tags(self, mock_repo):
        mock_repo.get_trending_tags.return_value = ["tag1", "tag2"]
        assert FeedService.get_trending_tags(5) == ["tag1", "tag2"]
        mock_repo.get_trending_tags.assert_called_once_with(5)

    @patch("app.services.feed_service.PostRepository")
    def test_search_tags(self, mock_repo):
        mock_repo.search_tags.return_value = ["tag1"]
        assert FeedService.search_tags("cat", 5) == ["tag1"]
        mock_repo.search_tags.assert_called_once_with("cat", 5)

    @patch("app.services.feed_service.PostRepository")
    def test_get_posts_by_tag(self, mock_repo):
        mock_repo.get_posts_by_tag_query.return_value = MagicMock()
        mock_repo.get_posts_by_tag_query.return_value.limit.return_value.all.return_value = []

        FeedService.get_posts_by_tag("cat")

        mock_repo.get_posts_by_tag_query.assert_called_once_with("cat")


# =============================================================================
# NotificationService
# =============================================================================

from app.services.notification_service import NotificationService


class TestNotificationService:
    """NotificationService — create, list, mark read."""

    @patch("app.services.notification_service.NotificationRepository")
    def test_get_notifications(self, mock_repo):
        mock_repo.get_user_notifications_query.return_value = MagicMock()
        mock_repo.get_user_notifications_query.return_value.limit.return_value.all.return_value = []
        mock_repo.load_actors.return_value = {}

        items, _cursor, _has_more = NotificationService.get_notifications(1)

        assert items == []
        mock_repo.get_user_notifications_query.assert_called_once_with(1, unread_only=False)

    @patch("app.services.notification_service.NotificationRepository")
    def test_get_notifications_unread_only(self, mock_repo):
        mock_repo.get_user_notifications_query.return_value = MagicMock()
        mock_repo.get_user_notifications_query.return_value.limit.return_value.all.return_value = []

        NotificationService.get_notifications(1, unread_only=True)

        mock_repo.get_user_notifications_query.assert_called_once_with(1, unread_only=True)

    @patch("app.services.notification_service.NotificationRepository")
    def test_mark_read_success(self, mock_repo):
        mock_repo.mark_read.return_value = MagicMock(id=5)
        result = NotificationService.mark_read(5, 1)
        assert result.id == 5

    @patch("app.services.notification_service.NotificationRepository")
    def test_mark_read_not_found(self, mock_repo):
        mock_repo.mark_read.return_value = None
        with pytest.raises(NotFoundError):
            NotificationService.mark_read(999, 1)

    @patch("app.services.notification_service.NotificationRepository")
    def test_mark_all_read(self, mock_repo):
        mock_repo.mark_all_read.return_value = 3
        assert NotificationService.mark_all_read(1) == 3

    @patch("app.services.notification_service.NotificationRepository")
    def test_unread_count(self, mock_repo):
        mock_repo.get_unread_count.return_value = 5
        assert NotificationService.unread_count(1) == 5

    @patch("app.services.notification_service.NotificationRepository")
    def test_create_notification_success(self, mock_repo):
        mock_repo.create_notification.return_value = MagicMock(id=1)
        n = NotificationService.create_notification(2, 1, "like", post_id=10)
        assert n.id == 1
        mock_repo.create_notification.assert_called_once_with(
            user_id=2,
            actor_id=1,
            type_="like",
            post_id=10,
        )

    @patch("app.services.notification_service.NotificationRepository")
    def test_create_notification_self_error(self, mock_repo):
        with pytest.raises(ServiceError, match="notify yourself"):
            NotificationService.create_notification(1, 1, "like")
        mock_repo.create_notification.assert_not_called()


# =============================================================================
# AdminService
# =============================================================================


class TestAdminService:
    """AdminService — dashboard stats, user management."""

    @patch("app.services.admin_service.UserRepository")
    @patch("app.services.admin_service.PostRepository")
    @patch("app.services.admin_service.EventRepository")
    def test_dashboard_stats(self, mock_event, mock_post, mock_user):
        mock_user.count.return_value = 10
        mock_user.get_users_today.return_value = 2
        mock_post.get_active_posts_count.return_value = 100
        mock_post.get_likes_count.return_value = 500
        mock_post.get_comments_count.return_value = 200
        mock_user.get_follows_count.return_value = 50
        mock_event.get_tag_count.return_value = 25

        from app.services.admin_service import AdminService

        stats = AdminService.dashboard_stats()

        assert stats["users_total"] == 10
        assert stats["users_today"] == 2
        assert stats["posts_total"] == 100
        assert stats["likes_total"] == 500
        assert stats["comments_total"] == 200
        assert stats["follows_total"] == 50
        assert stats["tags_total"] == 25

    @patch("app.services.admin_service.UserRepository")
    def test_toggle_admin_success(self, mock_user):
        mock_user.get.return_value = MagicMock(id=2, is_admin=False)
        mock_user.get_admin_count.return_value = 3

        from app.services.admin_service import AdminService

        AdminService.toggle_admin(actor_id=1, target_id=2)
        mock_user.commit.assert_called_once()

    @patch("app.services.admin_service.UserRepository")
    def test_toggle_admin_self(self, mock_user):
        mock_user.get.return_value = MagicMock(id=1, is_admin=False)

        from app.services.admin_service import AdminService

        with pytest.raises(ServiceError, match="Cannot change your own admin status"):
            AdminService.toggle_admin(actor_id=1, target_id=1)

    @patch("app.services.admin_service.UserRepository")
    def test_toggle_admin_last_admin(self, mock_user):
        mock_user.get.return_value = MagicMock(id=2, is_admin=True)
        mock_user.get_admin_count.return_value = 1

        from app.services.admin_service import AdminService

        with pytest.raises(ServiceError, match="at least one admin must remain"):
            AdminService.toggle_admin(actor_id=1, target_id=2)

    @patch("app.services.admin_service.UserRepository")
    def test_toggle_admin_not_found(self, mock_user):
        mock_user.get.return_value = None

        from app.services.admin_service import AdminService

        with pytest.raises(NotFoundError):
            AdminService.toggle_admin(actor_id=1, target_id=999)

    @patch("app.services.admin_service.UserRepository")
    def test_toggle_moderator_success(self, mock_user):
        user = MagicMock(id=2, is_moderator=False)
        mock_user.get.return_value = user

        from app.services.admin_service import AdminService

        AdminService.toggle_moderator(actor_id=1, target_id=2)
        mock_user.commit.assert_called_once()

    @patch("app.services.admin_service.UserRepository")
    def test_toggle_moderator_self_removal_raises(self, mock_user):
        mock_user.get.return_value = MagicMock(id=1, is_moderator=True)

        from app.services.admin_service import AdminService

        with pytest.raises(ServiceError, match="Cannot remove your own moderator status"):
            AdminService.toggle_moderator(actor_id=1, target_id=1)

    @patch("app.services.admin_service.UserRepository")
    def test_delete_user_success(self, mock_user):
        mock_user.get.return_value = MagicMock(id=2, is_admin=False)

        from app.services.admin_service import AdminService

        AdminService.delete_user(actor_id=1, target_id=2)
        mock_user.delete_user_cascade.assert_called_once()

    @patch("app.services.admin_service.UserRepository")
    def test_delete_user_self_raises(self, mock_user):
        mock_user.get.return_value = MagicMock(id=1, is_admin=False)

        from app.services.admin_service import AdminService

        with pytest.raises(ServiceError, match="Cannot delete your own account"):
            AdminService.delete_user(actor_id=1, target_id=1)

    @patch("app.services.admin_service.UserRepository")
    def test_delete_user_last_admin_raises(self, mock_user):
        mock_user.get.return_value = MagicMock(id=2, is_admin=True)
        mock_user.get_admin_count.return_value = 1

        from app.services.admin_service import AdminService

        with pytest.raises(ServiceError, match="at least one admin must remain"):
            AdminService.delete_user(actor_id=1, target_id=2)


# =============================================================================
# AuthService
# =============================================================================


class TestAuthService:
    """AuthService — authenticate and register."""

    @patch("app.services.auth_service.UserRepository")
    def test_authenticate_success(self, mock_user):
        user = MagicMock(username="alice")
        user.check_password.return_value = True
        mock_user.get_by_login.return_value = user

        from app.services.auth_service import AuthService

        result = AuthService.authenticate("alice", "pass123")
        assert result.username == "alice"
        mock_user.get_by_login.assert_called_once_with("alice")

    @patch("app.services.auth_service.UserRepository")
    def test_authenticate_user_not_found(self, mock_user):
        mock_user.get_by_login.return_value = None

        from app.services.auth_service import AuthService

        with pytest.raises(ServiceError, match="Invalid email/username or password"):
            AuthService.authenticate("nonexistent", "pass123")

    @patch("app.services.auth_service.UserRepository")
    def test_authenticate_wrong_password(self, mock_user):
        user = MagicMock()
        user.check_password.return_value = False
        mock_user.get_by_login.return_value = user

        from app.services.auth_service import AuthService

        with pytest.raises(ServiceError, match="Invalid email/username or password"):
            AuthService.authenticate("alice", "wrongpass")

    @patch("app.services.auth_service.UserRepository")
    def test_register_user_success(self, mock_user):
        user = MagicMock(id=1, username="newuser")
        mock_user.username_exists.return_value = False
        mock_user.email_exists.return_value = False
        mock_user.create_user.return_value = user

        from app.services.auth_service import AuthService

        result = AuthService.register_user("newuser", "new@x.com", "strongpass1")
        assert result.username == "newuser"
        mock_user.create_user.assert_called_once_with("newuser", "new@x.com")
        user.set_password.assert_called_once_with("strongpass1")
        mock_user.commit.assert_called_once()

    @patch("app.services.auth_service.UserRepository")
    def test_register_user_duplicate_username(self, mock_user):
        mock_user.username_exists.return_value = True

        from app.services.auth_service import AuthService

        with pytest.raises(ServiceError, match="This username is already taken"):
            AuthService.register_user("existing", "new@x.com", "strongpass1")

    @patch("app.services.auth_service.UserRepository")
    def test_register_user_short_username(self, mock_user):
        from app.services.auth_service import AuthService

        with pytest.raises(ServiceError, match="Username must be 3-20 characters"):
            AuthService.register_user("ab", "new@x.com", "strongpass1")

    @patch("app.services.auth_service.UserRepository")
    def test_register_user_invalid_chars(self, mock_user):
        from app.services.auth_service import AuthService

        with pytest.raises(ServiceError, match="Username can only contain"):
            AuthService.register_user("user name!", "new@x.com", "strongpass1")

    @patch("app.services.auth_service.UserRepository")
    def test_register_user_short_password(self, mock_user):
        from app.services.auth_service import AuthService

        with pytest.raises(ServiceError, match="Password must be at least 6 characters"):
            AuthService.register_user("newuser", "new@x.com", "ab")

    @patch("app.services.auth_service.UserRepository")
    def test_register_user_commit_failure(self, mock_user):
        user = MagicMock(id=1, username="newuser")
        mock_user.username_exists.return_value = False
        mock_user.email_exists.return_value = False
        mock_user.create_user.return_value = user
        mock_user.commit.side_effect = Exception("DB error")

        from app.services.auth_service import AuthService

        with pytest.raises(ServiceError, match="Registration failed"):
            AuthService.register_user("newuser", "new@x.com", "strongpass1")
        mock_user.rollback.assert_called_once()
