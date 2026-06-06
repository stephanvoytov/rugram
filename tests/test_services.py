"""Comprehensive unit tests for the service layer.

Tests each service directly (no Flask test client) using pytest fixtures.
All tests follow Arrange-Act-Assert (AAA) pattern.

Coverage:
  - PostService:   CRUD, likes, comments, reposts, saves, admin ops
  - SocialService: user lookup, follow/unfollow, search
  - ChatService:   chat creation, messaging, typing
  - FeedService:   feed queries, search, tag filter, trending
  - NotificationService: list, mark read, unread count
"""

import pytest
from flask import Flask
from datetime import datetime, timezone

from app.models import (
    User, Post, Like, Comment, Notification, Follow,
    Chat, ChatParticipant, Message, Repost, SavedPost, Tag, PostTag,
)
from app.services.base import ServiceError, NotFoundError, ForbiddenError
from app.services.post_service import PostService
from app.services.social_service import SocialService
from app.services.chat_service import ChatService
from app.services.feed_service import FeedService
from app.services.notification_service import NotificationService
from extensions import db


# ── Helper factories (must be called inside app_context) ──────────

def _user(username='testuser', **kwargs):
    """Create and flush a test User. Returns the user."""
    user = User(username=username, email=f'{username}@test.com', **kwargs)
    user.set_password('pass123')
    db.session.add(user)
    db.session.flush()
    return user


def _post(author_id, text='test post', **kwargs):
    """Create a post via PostService. Returns the Post."""
    return PostService.create_post(author_id=author_id, text=text, **kwargs)


def _utcnow():
    """UTC datetime without tzinfo (matching models.utcnow)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ══════════════════════════════════════════════════════════════════
# PostService — CRUD
# ══════════════════════════════════════════════════════════════════

class TestPostServiceCRUD:
    """Post creation, retrieval, editing, deletion."""

    def test_create_post_success(self, app: Flask) -> None:
        """Happy path: create_post returns persisted Post with correct fields."""
        with app.app_context():
            author = _user('alice')
            post = PostService.create_post(author_id=author.id, text='Hello world')
            assert post.text == 'Hello world'
            assert post.author_id == author.id
            assert post.is_deleted is False
            assert post.id is not None
            # Verify it's actually in the database
            fetched = db.session.get(Post, post.id)
            assert fetched is not None
            assert fetched.text == 'Hello world'

    def test_create_post_empty_text_raises_error(self, app: Flask) -> None:
        """Edge case: empty or whitespace-only text raises ServiceError."""
        with app.app_context():
            author = _user('bob')
            with pytest.raises(ServiceError, match='Post text cannot be empty'):
                PostService.create_post(author_id=author.id, text='')
            with pytest.raises(ServiceError, match='Post text cannot be empty'):
                PostService.create_post(author_id=author.id, text='   ')

    def test_create_post_with_tags(self, app: Flask) -> None:
        """Happy path: tag_names creates PostTag and Tag records."""
        with app.app_context():
            author = _user('charlie')
            post = PostService.create_post(
                author_id=author.id, text='tagged post',
                tag_names=['python', 'flask'],
            )
            assert len(post.post_tags) == 2
            tag_names = {pt.tag.name for pt in post.post_tags}
            assert 'python' in tag_names
            assert 'flask' in tag_names

    def test_create_post_reuses_existing_tags(self, app: Flask) -> None:
        """When a tag already exists, it's reused not duplicated."""
        with app.app_context():
            tag = Tag(name='python')
            db.session.add(tag)
            db.session.flush()
            author = _user('tagger')
            post = PostService.create_post(
                author_id=author.id, text='python post',
                tag_names=['python'],
            )
            assert len(post.post_tags) == 1
            # Only one Tag row exists
            assert Tag.query.filter_by(name='python').count() == 1

    def test_get_post_success(self, app: Flask) -> None:
        """Happy path: get_post returns the correct Post."""
        with app.app_context():
            author = _user('dave')
            post = _post(author.id, 'find me')
            fetched = PostService.get_post(post.id)
            assert fetched.id == post.id
            assert fetched.text == 'find me'

    def test_get_post_not_found_raises_error(self, app: Flask) -> None:
        """Error case: non-existent post raises NotFoundError with 404."""
        with app.app_context():
            with pytest.raises(NotFoundError) as exc:
                PostService.get_post(99999)
            assert exc.value.status_code == 404

    def test_get_post_detail_loads_author(self, app: Flask) -> None:
        """Happy path: get_post_detail eager-loads the author relationship."""
        with app.app_context():
            author = _user('eve')
            post = _post(author.id, 'detail post')
            detail = PostService.get_post_detail(post.id)
            assert detail.id == post.id
            assert detail.author is not None
            assert detail.author.username == 'eve'

    def test_get_post_detail_not_found(self, app: Flask) -> None:
        """Error case: non-existent post in detail view raises NotFoundError."""
        with app.app_context():
            with pytest.raises(NotFoundError):
                PostService.get_post_detail(99999)

    def test_edit_post_success(self, app: Flask) -> None:
        """Happy path: owner edits post text."""
        with app.app_context():
            author = _user('frank')
            post = _post(author.id, 'original text')
            updated = PostService.edit_post(post.id, author.id, 'edited text')
            assert updated.text == 'edited text'
            # Verify persistence
            fetched = db.session.get(Post, post.id)
            assert fetched.text == 'edited text'

    def test_edit_post_with_tags(self, app: Flask) -> None:
        """Happy path: editing also replaces tags."""
        with app.app_context():
            author = _user('grace')
            post = _post(author.id, 'original', tag_names=['oldtag'])
            PostService.edit_post(post.id, author.id, 'updated', tag_names=['newtag'])
            refreshed = db.session.get(Post, post.id)
            current_tags = {pt.tag.name for pt in refreshed.post_tags}
            assert current_tags == {'newtag'}

    def test_edit_post_forbidden(self, app: Flask) -> None:
        """Error case: non-owner cannot edit post — ForbiddenError."""
        with app.app_context():
            author = _user('author')
            intruder = _user('intruder')
            post = _post(author.id, 'my post')
            with pytest.raises(ForbiddenError, match='only edit your own'):
                PostService.edit_post(post.id, intruder.id, 'hacked')

    def test_edit_post_empty_text_raises_error(self, app: Flask) -> None:
        """Edge case: editing to empty text raises ServiceError."""
        with app.app_context():
            author = _user('heidi')
            post = _post(author.id, 'valid text')
            with pytest.raises(ServiceError, match='Post text cannot be empty'):
                PostService.edit_post(post.id, author.id, '')

    def test_edit_post_nonexistent_raises_error(self, app: Flask) -> None:
        """Error case: editing non-existent post raises NotFoundError."""
        with app.app_context():
            author = _user('ivan')
            with pytest.raises(NotFoundError):
                PostService.edit_post(99999, author.id, 'text')

    def test_delete_post_soft_delete(self, app: Flask) -> None:
        """Happy path: owner soft-deletes a post (is_deleted=True)."""
        with app.app_context():
            author = _user('judy')
            post = _post(author.id, 'to delete')
            PostService.delete_post(post.id, author.id)
            fetched = db.session.get(Post, post.id)
            assert fetched.is_deleted is True

    def test_delete_post_forbidden(self, app: Flask) -> None:
        """Error case: non-owner cannot delete — ForbiddenError."""
        with app.app_context():
            owner = _user('owner')
            thief = _user('thief')
            post = _post(owner.id, 'protected')
            with pytest.raises(ForbiddenError, match='only delete your own'):
                PostService.delete_post(post.id, thief.id)

    def test_delete_post_nonexistent_raises_error(self, app: Flask) -> None:
        """Error case: deleting non-existent post raises NotFoundError."""
        with app.app_context():
            user = _user('kevin')
            with pytest.raises(NotFoundError):
                PostService.delete_post(99999, user.id)


# ══════════════════════════════════════════════════════════════════
# PostService — Admin operations
# ══════════════════════════════════════════════════════════════════

class TestPostServiceAdmin:
    """Admin delete / restore (bypasses ownership check)."""

    def test_admin_delete_post(self, app: Flask) -> None:
        """Happy path: admin_delete_post soft-deletes any post."""
        with app.app_context():
            author = _user('author_ad')
            post = _post(author.id, 'admin delete')
            PostService.admin_delete_post(post.id)
            fetched = db.session.get(Post, post.id)
            assert fetched.is_deleted is True

    def test_admin_restore_post(self, app: Flask) -> None:
        """Happy path: admin_restore_post restores a soft-deleted post."""
        with app.app_context():
            author = _user('author_ar')
            post = _post(author.id, 'to restore')
            PostService.admin_delete_post(post.id)
            PostService.admin_restore_post(post.id)
            fetched = db.session.get(Post, post.id)
            assert fetched.is_deleted is False

    def test_admin_restore_not_deleted_raises_error(self, app: Flask) -> None:
        """Edge case: restoring an active post raises ServiceError."""
        with app.app_context():
            author = _user('author_nd')
            post = _post(author.id, 'not deleted')
            with pytest.raises(ServiceError, match='not deleted'):
                PostService.admin_restore_post(post.id)

    def test_admin_delete_nonexistent_raises_error(self, app: Flask) -> None:
        """Error case: admin deleting non-existent post raises NotFoundError."""
        with app.app_context():
            with pytest.raises(NotFoundError):
                PostService.admin_delete_post(99999)

    def test_admin_delete_twice_is_idempotent(self, app: Flask) -> None:
        """Edge case: deleting an already deleted post doesn't raise."""
        with app.app_context():
            author = _user('author_tw')
            post = _post(author.id, 'delete twice')
            PostService.admin_delete_post(post.id)
            # Second delete should not raise (already deleted)
            PostService.admin_delete_post(post.id)
            fetched = db.session.get(Post, post.id)
            assert fetched.is_deleted is True


# ══════════════════════════════════════════════════════════════════
# PostService — Likes
# ══════════════════════════════════════════════════════════════════

class TestPostServiceLikes:
    """Like/unlike toggle behavior and notifications."""

    def test_toggle_like_like(self, app: Flask) -> None:
        """Happy path: first toggle creates a Like and returns liked=True."""
        with app.app_context():
            author = _user('author_l')
            liker = _user('liker')
            post = _post(author.id, 'likable')
            result = PostService.toggle_like(post.id, liker.id)
            assert result['liked'] is True
            assert isinstance(result['likes_count'], int)
            # Verify Like record
            assert Like.query.filter_by(post_id=post.id, user_id=liker.id).first() is not None

    def test_toggle_like_unlike(self, app: Flask) -> None:
        """Happy path: second toggle removes the Like and returns liked=False."""
        with app.app_context():
            author = _user('author_u')
            liker = _user('unliker')
            post = _post(author.id, 'unlikable')
            PostService.toggle_like(post.id, liker.id)   # like
            result = PostService.toggle_like(post.id, liker.id)  # unlike
            assert result['liked'] is False
            assert Like.query.filter_by(post_id=post.id, user_id=liker.id).first() is None

    def test_toggle_like_self_no_notification(self, app: Flask) -> None:
        """Edge case: self-like does NOT create a notification."""
        with app.app_context():
            author = _user('self_liker')
            post = _post(author.id, 'self love')
            PostService.toggle_like(post.id, author.id)
            notifs = Notification.query.filter_by(user_id=author.id, type='like').all()
            assert len(notifs) == 0

    def test_toggle_like_creates_notification(self, app: Flask) -> None:
        """Happy path: liking someone else's post creates a 'like' notification."""
        with app.app_context():
            author = _user('author_n')
            liker = _user('liker_n')
            post = _post(author.id, 'notify like')
            PostService.toggle_like(post.id, liker.id)
            notif = Notification.query.filter_by(
                user_id=author.id, actor_id=liker.id, type='like'
            ).first()
            assert notif is not None

    def test_toggle_like_nonexistent_post(self, app: Flask) -> None:
        """Error case: liking a non-existent post raises NotFoundError."""
        with app.app_context():
            liker = _user('lonely')
            with pytest.raises(NotFoundError):
                PostService.toggle_like(99999, liker.id)


# ══════════════════════════════════════════════════════════════════
# PostService — Comments
# ══════════════════════════════════════════════════════════════════

class TestPostServiceComments:
    """Comment CRUD and notifications."""

    def test_add_comment_success(self, app: Flask) -> None:
        """Happy path: add_comment creates and returns a Comment."""
        with app.app_context():
            author = _user('author_c')
            commenter = _user('commenter')
            post = _post(author.id, 'commentable')
            comment = PostService.add_comment(post.id, commenter.id, 'nice post!')
            assert comment.text == 'nice post!'
            assert comment.author_id == commenter.id
            assert comment.post_id == post.id
            assert db.session.get(Comment, comment.id) is not None

    def test_add_comment_empty_text_raises_error(self, app: Flask) -> None:
        """Edge case: empty/whitespace comment text raises ServiceError."""
        with app.app_context():
            author = _user('author_d')
            commenter = _user('commenter2')
            post = _post(author.id, 'test')
            with pytest.raises(ServiceError, match='Comment cannot be empty'):
                PostService.add_comment(post.id, commenter.id, '')
            with pytest.raises(ServiceError, match='Comment cannot be empty'):
                PostService.add_comment(post.id, commenter.id, '   ')

    def test_add_comment_creates_notification(self, app: Flask) -> None:
        """Happy path: comment on someone else's post creates 'comment' notification."""
        with app.app_context():
            author = _user('author_nc')
            commenter = _user('commenter_nc')
            post = _post(author.id, 'notify comment')
            PostService.add_comment(post.id, commenter.id, 'great!')
            notif = Notification.query.filter_by(
                user_id=author.id, actor_id=commenter.id, type='comment'
            ).first()
            assert notif is not None

    def test_add_comment_self_no_notification(self, app: Flask) -> None:
        """Edge case: self-comment does NOT create a notification."""
        with app.app_context():
            author = _user('self_c')
            post = _post(author.id, 'self comment')
            PostService.add_comment(post.id, author.id, 'myself')
            notifs = Notification.query.filter_by(user_id=author.id, type='comment').all()
            assert len(notifs) == 0

    def test_add_comment_nonexistent_post(self, app: Flask) -> None:
        """Error case: commenting on non-existent post raises NotFoundError."""
        with app.app_context():
            user = _user('ghost_c')
            with pytest.raises(NotFoundError):
                PostService.add_comment(99999, user.id, 'hello')

    def test_delete_comment_success(self, app: Flask) -> None:
        """Happy path: owner deletes their comment."""
        with app.app_context():
            author = _user('author_e')
            post = _post(author.id, 'test')
            comment = PostService.add_comment(post.id, author.id, 'delete me')
            PostService.delete_comment(comment.id, author.id)
            assert db.session.get(Comment, comment.id) is None

    def test_delete_comment_not_found(self, app: Flask) -> None:
        """Error case: deleting non-existent comment raises NotFoundError."""
        with app.app_context():
            with pytest.raises(NotFoundError, match='Comment not found'):
                PostService.delete_comment(99999, 1)

    def test_delete_comment_forbidden(self, app: Flask) -> None:
        """Error case: non-author cannot delete comment — ForbiddenError."""
        with app.app_context():
            author = _user('author_f')
            intruder = _user('intruder')
            post = _post(author.id, 'test')
            comment = PostService.add_comment(post.id, author.id, 'mine')
            with pytest.raises(ForbiddenError, match='only delete your own'):
                PostService.delete_comment(comment.id, intruder.id)


    # ── edit_comment ──────────────────────────────────────────────

    def test_edit_comment_success(self, app: Flask) -> None:
        """Happy path: owner edits their comment."""
        with app.app_context():
            author = _user('editor_a')
            post = _post(author.id, 'test')
            comment = PostService.add_comment(post.id, author.id, 'original')
            updated = PostService.edit_comment(comment.id, author.id, 'edited')
            assert updated.id == comment.id
            assert updated.text == 'edited'

    def test_edit_comment_not_found(self, app: Flask) -> None:
        """Error case: editing non-existent comment raises NotFoundError."""
        with app.app_context():
            with pytest.raises(NotFoundError, match='Comment not found'):
                PostService.edit_comment(99999, 1, 'text')

    def test_edit_comment_forbidden(self, app: Flask) -> None:
        """Error case: non-author cannot edit — ForbiddenError."""
        with app.app_context():
            author = _user('editor_b')
            intruder = _user('editor_c')
            post = _post(author.id, 'test')
            comment = PostService.add_comment(post.id, author.id, 'mine')
            with pytest.raises(ForbiddenError, match='only edit your own'):
                PostService.edit_comment(comment.id, intruder.id, 'hacked')

    def test_edit_comment_empty_text_raises_error(self, app: Flask) -> None:
        """Error case: empty text raises ServiceError."""
        with app.app_context():
            author = _user('editor_d')
            post = _post(author.id, 'test')
            comment = PostService.add_comment(post.id, author.id, 'text')
            with pytest.raises(ServiceError, match='Comment cannot be empty'):
                PostService.edit_comment(comment.id, author.id, '')
            with pytest.raises(ServiceError, match='Comment cannot be empty'):
                PostService.edit_comment(comment.id, author.id, '   ')

    def test_edit_comment_persists(self, app: Flask) -> None:
        """Verify edit is actually persisted in DB."""
        with app.app_context():
            author = _user('editor_e')
            post = _post(author.id, 'test')
            comment = PostService.add_comment(post.id, author.id, 'original')
            PostService.edit_comment(comment.id, author.id, 'new text')
            # Re-fetch from DB to ensure persistence
            fresh = db.session.get(Comment, comment.id)
            assert fresh is not None
            assert fresh.text == 'new text'


# ══════════════════════════════════════════════════════════════════
# PostService — Reposts & Saves
# ══════════════════════════════════════════════════════════════════

class TestPostServiceRepostSave:
    """Repost and save/bookmark toggle behavior."""

    def test_toggle_repost_repost(self, app: Flask) -> None:
        """Happy path: first toggle creates a Repost."""
        with app.app_context():
            author = _user('author_r')
            reposter = _user('reposter')
            post = _post(author.id, 'repostable')
            result = PostService.toggle_repost(post.id, reposter.id)
            assert result['reposted'] is True
            assert Repost.query.filter_by(post_id=post.id, user_id=reposter.id).first() is not None

    def test_toggle_repost_unrepost(self, app: Flask) -> None:
        """Happy path: second toggle removes the Repost."""
        with app.app_context():
            author = _user('author_r2')
            reposter = _user('reposter2')
            post = _post(author.id, 'unrepostable')
            PostService.toggle_repost(post.id, reposter.id)
            result = PostService.toggle_repost(post.id, reposter.id)
            assert result['reposted'] is False
            assert Repost.query.filter_by(post_id=post.id, user_id=reposter.id).first() is None

    def test_toggle_repost_nonexistent_post(self, app: Flask) -> None:
        """Error case: reposting non-existent post raises NotFoundError."""
        with app.app_context():
            user = _user('ghost_r')
            with pytest.raises(NotFoundError):
                PostService.toggle_repost(99999, user.id)

    def test_toggle_save_save(self, app: Flask) -> None:
        """Happy path: first toggle saves the post."""
        with app.app_context():
            author = _user('author_s')
            saver = _user('saver')
            post = _post(author.id, 'saveable')
            result = PostService.toggle_save(post.id, saver.id)
            assert result['saved'] is True
            assert SavedPost.query.filter_by(post_id=post.id, user_id=saver.id).first() is not None

    def test_toggle_save_unsave(self, app: Flask) -> None:
        """Happy path: second toggle unsaves the post."""
        with app.app_context():
            author = _user('author_s2')
            saver = _user('saver2')
            post = _post(author.id, 'unsaveable')
            PostService.toggle_save(post.id, saver.id)
            result = PostService.toggle_save(post.id, saver.id)
            assert result['saved'] is False
            assert SavedPost.query.filter_by(post_id=post.id, user_id=saver.id).first() is None

    def test_toggle_save_nonexistent_post(self, app: Flask) -> None:
        """Error case: saving non-existent post raises NotFoundError."""
        with app.app_context():
            user = _user('ghost_s')
            with pytest.raises(NotFoundError):
                PostService.toggle_save(99999, user.id)


# ══════════════════════════════════════════════════════════════════
# SocialService
# ══════════════════════════════════════════════════════════════════

class TestSocialService:
    """User lookup, follow/unfollow, user search."""

    def test_get_user_success(self, app: Flask) -> None:
        """Happy path: get_user returns the correct User."""
        with app.app_context():
            user = _user('social_user')
            fetched = SocialService.get_user(user.id)
            assert fetched.id == user.id
            assert fetched.username == 'social_user'

    def test_get_user_not_found(self, app: Flask) -> None:
        """Error case: non-existent user raises NotFoundError."""
        with app.app_context():
            with pytest.raises(NotFoundError, match='User not found'):
                SocialService.get_user(99999)

    def test_get_user_by_username_success(self, app: Flask) -> None:
        """Happy path: get_user_by_username finds user."""
        with app.app_context():
            user = _user('unique_user')
            fetched = SocialService.get_user_by_username('unique_user')
            assert fetched.id == user.id

    def test_get_user_by_username_not_found(self, app: Flask) -> None:
        """Error case: unknown username raises NotFoundError."""
        with app.app_context():
            with pytest.raises(NotFoundError, match='User not found'):
                SocialService.get_user_by_username('nonexistent')

    def test_toggle_follow_follow(self, app: Flask) -> None:
        """Happy path: follow creates Follow record + notification."""
        with app.app_context():
            follower = _user('follower')
            target = _user('target')
            result = SocialService.toggle_follow(follower.id, 'target')
            assert result['followed'] is True
            # Follow record exists
            rel = Follow.query.filter_by(
                follower_id=follower.id, followed_id=target.id
            ).first()
            assert rel is not None
            # Notification was created
            notif = Notification.query.filter_by(
                user_id=target.id, actor_id=follower.id, type='follow'
            ).first()
            assert notif is not None

    def test_toggle_follow_unfollow(self, app: Flask) -> None:
        """Happy path: second toggle removes Follow record."""
        with app.app_context():
            follower = _user('follower2')
            target = _user('target2')
            SocialService.toggle_follow(follower.id, 'target2')
            result = SocialService.toggle_follow(follower.id, 'target2')
            assert result['followed'] is False
            assert Follow.query.filter_by(
                follower_id=follower.id, followed_id=target.id
            ).first() is None

    def test_toggle_follow_self_raises_error(self, app: Flask) -> None:
        """Edge case: self-follow raises ServiceError."""
        with app.app_context():
            user = _user('narcissist')
            with pytest.raises(ServiceError, match='Cannot follow yourself'):
                SocialService.toggle_follow(user.id, 'narcissist')

    def test_toggle_follow_nonexistent_raises_error(self, app: Flask) -> None:
        """Error case: following non-existent user raises NotFoundError."""
        with app.app_context():
            follower = _user('confused')
            with pytest.raises(NotFoundError, match='User not found'):
                SocialService.toggle_follow(follower.id, 'ghost_user')

    def test_search_users_finds_matches(self, app: Flask) -> None:
        """Happy path: search_users finds users by substring (case-insensitive)."""
        with app.app_context():
            _user('alice')
            _user('bob')
            _user('alicia')
            results = SocialService.search_users('ali')
            usernames = {u.username for u in results}
            assert 'alice' in usernames
            assert 'alicia' in usernames
            assert 'bob' not in usernames

    def test_search_users_case_insensitive(self, app: Flask) -> None:
        """Happy path: search is case-insensitive."""
        with app.app_context():
            _user('Alice')
            results = SocialService.search_users('alice')
            assert len(results) == 1
            results = SocialService.search_users('ALICE')
            assert len(results) == 1

    def test_search_users_empty_query(self, app: Flask) -> None:
        """Edge case: empty query returns empty list."""
        with app.app_context():
            _user('someone')
            results = SocialService.search_users('')
            assert results == []
            results = SocialService.search_users(None)
            assert results == []

    def test_search_users_limit(self, app: Flask) -> None:
        """Edge case: limit parameter caps results."""
        with app.app_context():
            for i in range(5):
                _user(f'user{i}')
            results = SocialService.search_users('user', limit=3)
            assert len(results) == 3

    def test_get_profile(self, app: Flask) -> None:
        """Happy path: get_profile returns user info with counts."""
        with app.app_context():
            user = _user('profile_user')
            follower = _user('follower_p')
            # Add a follower
            db.session.add(Follow(follower_id=follower.id, followed_id=user.id))
            db.session.commit()
            profile = SocialService.get_profile(user.id)
            assert profile['user'].id == user.id
            assert profile['followers_count'] >= 1
            assert profile['following_count'] == 0

    def test_get_profile_with_follow_status(self, app: Flask) -> None:
        """Happy path: get_profile shows is_followed when current_user_id is provided."""
        with app.app_context():
            user = _user('profile_target')
            viewer = _user('viewer')
            profile = SocialService.get_profile(user.id, current_user_id=viewer.id)
            assert profile['is_followed'] is False
            # Follow then check again
            SocialService.toggle_follow(viewer.id, 'profile_target')
            profile = SocialService.get_profile(user.id, current_user_id=viewer.id)
            assert profile['is_followed'] is True

    def test_get_followers(self, app: Flask) -> None:
        """Happy path: get_followers returns users who follow the given user."""
        with app.app_context():
            user = _user('popular')
            f1 = _user('f1')
            f2 = _user('f2')
            db.session.add_all([
                Follow(follower_id=f1.id, followed_id=user.id),
                Follow(follower_id=f2.id, followed_id=user.id),
            ])
            db.session.commit()
            followers, cursor, has_more = SocialService.get_followers(user.id)
            assert len(followers) == 2
            follower_ids = {u.id for u in followers}
            assert f1.id in follower_ids
            assert f2.id in follower_ids

    def test_get_following(self, app: Flask) -> None:
        """Happy path: get_following returns users the given user follows."""
        with app.app_context():
            user = _user('stalker')
            t1 = _user('target1')
            t2 = _user('target2')
            db.session.add_all([
                Follow(follower_id=user.id, followed_id=t1.id),
                Follow(follower_id=user.id, followed_id=t2.id),
            ])
            db.session.commit()
            following, cursor, has_more = SocialService.get_following(user.id)
            assert len(following) == 2
            following_ids = {u.id for u in following}
            assert t1.id in following_ids
            assert t2.id in following_ids

    def test_get_user_posts(self, app: Flask) -> None:
        """Happy path: get_user_posts returns non-deleted posts by user."""
        with app.app_context():
            user = _user('poster_gup')
            p1 = _post(user.id, 'visible')
            p2 = _post(user.id, 'hidden')
            p2.is_deleted = True
            db.session.commit()
            posts, cursor, has_more = SocialService.get_user_posts(user.id)
            assert len(posts) == 1
            assert posts[0].id == p1.id


# ══════════════════════════════════════════════════════════════════
# ChatService
# ══════════════════════════════════════════════════════════════════

class TestChatService:
    """Chat creation, messaging, typing."""

    def test_start_or_get_chat_new(self, app: Flask) -> None:
        """Happy path: start_or_get_chat creates a new chat between two users."""
        with app.app_context():
            user_a = _user('chatter_a')
            user_b = _user('chatter_b')
            result = ChatService.start_or_get_chat(user_a.id, 'chatter_b')
            assert 'chat_id' in result
            chat_id = result['chat_id']
            # Both participants exist
            participants = ChatParticipant.query.filter_by(chat_id=chat_id).all()
            assert len(participants) == 2
            participant_ids = {p.user_id for p in participants}
            assert user_a.id in participant_ids
            assert user_b.id in participant_ids

    def test_start_or_get_chat_existing(self, app: Flask) -> None:
        """Happy path: existing chat is returned instead of creating a new one."""
        with app.app_context():
            user_a = _user('chatter_c')
            user_b = _user('chatter_d')
            first = ChatService.start_or_get_chat(user_a.id, 'chatter_d')
            second = ChatService.start_or_get_chat(user_a.id, 'chatter_d')
            assert first['chat_id'] == second['chat_id']
            # Only one chat between them
            assert Chat.query.count() == 1

    def test_start_or_get_chat_self_raises_error(self, app: Flask) -> None:
        """Edge case: chatting with yourself raises ServiceError."""
        with app.app_context():
            user = _user('lonely_chatter')
            with pytest.raises(ServiceError, match='Cannot chat with yourself'):
                ChatService.start_or_get_chat(user.id, 'lonely_chatter')

    def test_start_or_get_chat_nonexistent_raises_error(self, app: Flask) -> None:
        """Error case: target username not found raises NotFoundError."""
        with app.app_context():
            user = _user('real_user')
            with pytest.raises(NotFoundError, match='User not found'):
                ChatService.start_or_get_chat(user.id, 'ghost_user')

    def test_send_message_text(self, app: Flask) -> None:
        """Happy path: send_message creates an encrypted message."""
        with app.app_context():
            user_a = _user('sender')
            user_b = _user('receiver')
            chat_info = ChatService.start_or_get_chat(user_a.id, 'receiver')
            chat_id = chat_info['chat_id']
            msg = ChatService.send_message(chat_id, user_a.id, text='Hello!')
            assert msg.author_id == user_a.id
            assert msg.chat_id == chat_id
            # Text is encrypted in DB
            assert msg.text != 'Hello!'
            assert msg.text != ''

    def test_send_message_empty_raises_error(self, app: Flask) -> None:
        """Edge case: message with no text and no image raises ServiceError."""
        with app.app_context():
            user_a = _user('sender_e')
            user_b = _user('receiver_e')
            chat_info = ChatService.start_or_get_chat(user_a.id, 'receiver_e')
            with pytest.raises(ServiceError, match='Message cannot be empty'):
                ChatService.send_message(chat_info['chat_id'], user_a.id)

    def test_send_message_not_participant_raises_error(self, app: Flask) -> None:
        """Error case: non-participant sending message raises ForbiddenError."""
        with app.app_context():
            user_a = _user('member')
            user_b = _user('outsider')
            user_c = _user('other')
            chat_info = ChatService.start_or_get_chat(user_a.id, 'other')
            with pytest.raises(ForbiddenError, match='Access denied'):
                ChatService.send_message(chat_info['chat_id'], user_b.id, text='spam')

    def test_get_messages_success(self, app: Flask) -> None:
        """Happy path: get_messages returns chat messages and metadata."""
        with app.test_request_context():
            user_a = _user('chat_a')
            user_b = _user('chat_b')
            # Fully commit users so they're visible across session boundaries
            db.session.commit()
            chat_info = ChatService.start_or_get_chat(user_a.id, 'chat_b')
            chat_id = chat_info['chat_id']
            ChatService.send_message(chat_id, user_a.id, text='First')
            ChatService.send_message(chat_id, user_b.id, text='Second')
            result = ChatService.get_messages(chat_id, user_a.id)
            assert 'messages' in result
            assert 'other_user' in result
            assert 'is_typing' in result
            assert 'has_more' in result
            texts = [m['text'] for m in result['messages']]
            assert 'First' in texts
            assert 'Second' in texts
            # other_user should be user_b (the other participant)
            assert result['other_user']['username'] == 'chat_b'

    def test_get_messages_not_participant(self, app: Flask) -> None:
        """Error case: non-participant reading messages raises ForbiddenError."""
        with app.app_context():
            user_a = _user('member_g')
            user_b = _user('member2_g')
            intruder = _user('intruder_g')
            chat_info = ChatService.start_or_get_chat(user_a.id, 'member2_g')
            with pytest.raises(ForbiddenError, match='Access denied'):
                ChatService.get_messages(chat_info['chat_id'], intruder.id)

    def test_set_typing(self, app: Flask) -> None:
        """Happy path: set_typing updates the participant's last_typing_at."""
        with app.app_context():
            user_a = _user('typer_a')
            user_b = _user('typer_b')
            chat_info = ChatService.start_or_get_chat(user_a.id, 'typer_b')
            chat_id = chat_info['chat_id']
            before = _utcnow()
            ChatService.set_typing(chat_id, user_a.id)
            cp = ChatParticipant.query.filter_by(
                chat_id=chat_id, user_id=user_a.id
            ).first()
            assert cp is not None
            assert cp.last_typing_at is not None
            assert cp.last_typing_at >= before

    def test_set_typing_not_participant(self, app: Flask) -> None:
        """Error case: non-participant setting typing raises ForbiddenError."""
        with app.app_context():
            user_a = _user('member_t')
            user_b = _user('member2_t')
            intruder = _user('intruder_t')
            chat_info = ChatService.start_or_get_chat(user_a.id, 'member2_t')
            with pytest.raises(ForbiddenError, match='Access denied'):
                ChatService.set_typing(chat_info['chat_id'], intruder.id)

    def test_edit_message_success(self, app: Flask) -> None:
        """Happy path: edit_message updates encrypted text."""
        with app.test_request_context():
            user_a = _user('editor_a')
            user_b = _user('editor_b')
            db.session.commit()
            chat_info = ChatService.start_or_get_chat(user_a.id, 'editor_b')
            chat_id = chat_info['chat_id']
            msg = ChatService.send_message(chat_id, user_a.id, text='original')
            original_encrypted = msg.text  # save before edit (identity map returns same obj)
            updated = ChatService.edit_message(chat_id, msg.id, user_a.id, 'edited')
            assert updated.edited_at is not None
            # Text should be re-encrypted (different from original encrypted)
            assert updated.text != original_encrypted

    def test_edit_message_not_found(self, app: Flask) -> None:
        """Error case: editing non-existent message raises NotFoundError."""
        with app.app_context():
            user_a = _user('editor_c')
            user_b = _user('editor_d')
            chat_info = ChatService.start_or_get_chat(user_a.id, 'editor_d')
            chat_id = chat_info['chat_id']
            with pytest.raises(NotFoundError):
                ChatService.edit_message(chat_id, 99999, user_a.id, 'text')

    def test_edit_message_forbidden(self, app: Flask) -> None:
        """Error case: editing another user's message raises ForbiddenError."""
        with app.app_context():
            user_a = _user('editor_e')
            user_b = _user('editor_f')
            chat_info = ChatService.start_or_get_chat(user_a.id, 'editor_f')
            chat_id = chat_info['chat_id']
            msg = ChatService.send_message(chat_id, user_a.id, text='by a')
            with pytest.raises(ForbiddenError, match='Access denied'):
                ChatService.edit_message(chat_id, msg.id, user_b.id, 'hacked')

    def test_delete_message_success(self, app: Flask) -> None:
        """Happy path: delete_message clears text and image (soft-delete)."""
        with app.app_context():
            user_a = _user('del_a')
            user_b = _user('del_b')
            chat_info = ChatService.start_or_get_chat(user_a.id, 'del_b')
            chat_id = chat_info['chat_id']
            msg = ChatService.send_message(chat_id, user_a.id, text='delete me')
            ChatService.delete_message(chat_id, msg.id, user_a.id)
            db.session.refresh(msg)
            assert msg.text == ''
            assert msg.image is None

    def test_delete_message_not_found(self, app: Flask) -> None:
        """Error case: deleting non-existent message raises NotFoundError."""
        with app.app_context():
            user_a = _user('del_c')
            user_b = _user('del_d')
            chat_info = ChatService.start_or_get_chat(user_a.id, 'del_d')
            chat_id = chat_info['chat_id']
            with pytest.raises(NotFoundError):
                ChatService.delete_message(chat_id, 99999, user_a.id)

    def test_delete_message_forbidden(self, app: Flask) -> None:
        """Error case: deleting another user's message raises ForbiddenError."""
        with app.app_context():
            user_a = _user('del_e')
            user_b = _user('del_f')
            chat_info = ChatService.start_or_get_chat(user_a.id, 'del_f')
            chat_id = chat_info['chat_id']
            msg = ChatService.send_message(chat_id, user_a.id, text='by a')
            with pytest.raises(ForbiddenError, match='Access denied'):
                ChatService.delete_message(chat_id, msg.id, user_b.id)

    def test_get_messages_pagination(self, app: Flask) -> None:
        """Happy path: get_messages with before parameter paginates."""
        with app.test_request_context():
            user_a = _user('page_a')
            user_b = _user('page_b')
            db.session.commit()
            chat_info = ChatService.start_or_get_chat(user_a.id, 'page_b')
            chat_id = chat_info['chat_id']
            ids = []
            for i in range(5):
                msg = ChatService.send_message(chat_id, user_a.id, text=f'msg {i}')
                ids.append(msg.id)
            # Get messages before the last one
            result = ChatService.get_messages(chat_id, user_a.id, before=ids[-1])
            assert len(result['messages']) >= 1
            # All returned messages should have id < ids[-1]
            for m in result['messages']:
                assert m['id'] < ids[-1]


# ══════════════════════════════════════════════════════════════════
# FeedService
# ══════════════════════════════════════════════════════════════════

class TestFeedService:
    """Feed queries, search, filtering, trending tags."""

    def test_get_feed_empty(self, app: Flask) -> None:
        """Edge case: feed with no posts returns empty."""
        with app.app_context():
            posts, cursor, has_more = FeedService.get_feed()
            assert posts == []
            assert cursor is None
            assert has_more is False

    def test_get_feed_returns_posts(self, app: Flask) -> None:
        """Happy path: get_feed returns non-deleted posts."""
        with app.app_context():
            author = _user('feed_author')
            p1 = _post(author.id, 'post one')
            p2 = _post(author.id, 'post two')
            posts, cursor, has_more = FeedService.get_feed()
            post_ids = {p.id for p in posts}
            assert p1.id in post_ids
            assert p2.id in post_ids
            # Posts are ordered newest first
            assert posts[0].id >= posts[-1].id

    def test_get_feed_excludes_deleted_posts(self, app: Flask) -> None:
        """Edge case: deleted posts are excluded from feed."""
        with app.app_context():
            author = _user('feed_author2')
            p1 = _post(author.id, 'visible')
            p2 = _post(author.id, 'hidden')
            p2.is_deleted = True
            db.session.commit()
            posts, _, _ = FeedService.get_feed()
            post_ids = {p.id for p in posts}
            assert p1.id in post_ids
            assert p2.id not in post_ids

    def test_get_feed_search(self, app: Flask) -> None:
        """Happy path: search_query filters posts by text content."""
        with app.app_context():
            author = _user('search_author')
            _post(author.id, 'Python programming')
            _post(author.id, 'Flask web development')
            _post(author.id, 'Today is sunny')
            posts, _, _ = FeedService.get_feed(search_query='python')
            assert len(posts) == 1
            assert 'Python' in posts[0].text

    def test_get_feed_search_case_insensitive(self, app: Flask) -> None:
        """Happy path: search is case-insensitive (ILIKE)."""
        with app.app_context():
            author = _user('search_author2')
            _post(author.id, 'Hello World')
            posts, _, _ = FeedService.get_feed(search_query='world')
            assert len(posts) == 1

    def test_get_feed_tag_filter(self, app: Flask) -> None:
        """Happy path: tag_filter returns only posts with that tag."""
        with app.app_context():
            author = _user('tag_author')
            p1 = _post(author.id, 'python post', tag_names=['python'])
            _post(author.id, 'flask post', tag_names=['flask'])
            posts, _, _ = FeedService.get_feed(tag_filter='python')
            assert len(posts) == 1
            assert posts[0].id == p1.id

    def test_get_feed_tag_filter_no_match(self, app: Flask) -> None:
        """Edge case: tag_filter with no matches returns empty."""
        with app.app_context():
            author = _user('tag_author2')
            _post(author.id, 'post', tag_names=['python'])
            posts, _, _ = FeedService.get_feed(tag_filter='nonexistent')
            assert posts == []

    def test_get_feed_followed_only(self, app: Flask) -> None:
        """Happy path: followed_only shows posts from followed users + self."""
        with app.app_context():
            user = _user('feed_user')
            friend = _user('friend')
            stranger = _user('stranger')
            # Follow friend
            db.session.add(Follow(follower_id=user.id, followed_id=friend.id))
            db.session.commit()
            p_friend = _post(friend.id, 'friend post')
            p_self = _post(user.id, 'my post')
            _post(stranger.id, 'stranger post')
            posts, _, _ = FeedService.get_feed(
                user_id=user.id, followed_only=True
            )
            post_ids = {p.id for p in posts}
            assert p_friend.id in post_ids
            assert p_self.id in post_ids
            # Stranger's post should NOT appear
            stranger_posts = [p for p in posts if p.author_id == stranger.id]
            assert len(stranger_posts) == 0

    def test_get_feed_sort_hot(self, app: Flask) -> None:
        """Happy path: sort_by='hot' uses engagement-based ordering."""
        with app.app_context():
            author = _user('hot_author')
            p1 = _post(author.id, 'popular')
            p2 = _post(author.id, 'less popular')
            # Give p1 more likes
            p1.likes_count = 10
            p2.likes_count = 1
            db.session.commit()
            posts, _, _ = FeedService.get_feed(sort_by='hot')
            assert posts[0].id == p1.id  # most popular first

    def test_get_feed_sort_top(self, app: Flask) -> None:
        """Happy path: sort_by='top' uses total engagement."""
        with app.app_context():
            author = _user('top_author')
            p1 = _post(author.id, 'top post')
            p2 = _post(author.id, 'mid post')
            p1.likes_count = 5
            p1.comments_count = 3
            p2.likes_count = 2
            db.session.commit()
            posts, _, _ = FeedService.get_feed(sort_by='top')
            assert posts[0].id == p1.id

    def test_get_feed_cursor_pagination(self, app: Flask) -> None:
        """Happy path: cursor parameter enables pagination."""
        with app.app_context():
            author = _user('page_author')
            ids = []
            for i in range(5):
                p = _post(author.id, f'post {i}')
                ids.append(p.id)
            # First page (limit=2)
            posts1, cursor1, has_more1 = FeedService.get_feed(limit=2)
            assert len(posts1) == 2
            assert has_more1 is True
            assert cursor1 is not None
            # Second page
            posts2, cursor2, has_more2 = FeedService.get_feed(cursor=cursor1, limit=2)
            assert len(posts2) == 2
            # No overlapping posts
            ids1 = {p.id for p in posts1}
            ids2 = {p.id for p in posts2}
            assert ids1.isdisjoint(ids2)

    def test_get_trending_tags(self, app: Flask) -> None:
        """Happy path: get_trending_tags returns tags sorted by post_count."""
        with app.app_context():
            author = _user('tag_author_t')
            # Create tags via posts
            _post(author.id, 'a', tag_names=['python'])
            _post(author.id, 'b', tag_names=['python'])
            _post(author.id, 'c', tag_names=['flask'])
            trending = FeedService.get_trending_tags(limit=5)
            assert len(trending) >= 2
            assert trending[0].name == 'python'  # 2 posts
            assert trending[0].post_count >= 2
            assert trending[1].name == 'flask'   # 1 post

    def test_get_trending_tags_empty(self, app: Flask) -> None:
        """Edge case: no tags returns empty list."""
        with app.app_context():
            trending = FeedService.get_trending_tags()
            assert trending == []

    def test_search_tags(self, app: Flask) -> None:
        """Happy path: search_tags finds tags by prefix."""
        with app.app_context():
            author = _user('tag_s_author')
            _post(author.id, 'x', tag_names=['python'])
            _post(author.id, 'y', tag_names=['pydantic'])
            _post(author.id, 'z', tag_names=['flask'])
            results = FeedService.search_tags('py')
            names = {t.name for t in results}
            assert 'python' in names
            assert 'pydantic' in names
            assert 'flask' not in names

    def test_search_tags_empty_query(self, app: Flask) -> None:
        """Edge case: empty search returns empty list."""
        with app.app_context():
            results = FeedService.search_tags('')
            assert results == []
            results = FeedService.search_tags(None)
            assert results == []

    def test_search_tags_no_match(self, app: Flask) -> None:
        """Edge case: no matching tags returns empty list."""
        with app.app_context():
            results = FeedService.search_tags('zzzzz')
            assert results == []


# ══════════════════════════════════════════════════════════════════
# NotificationService
# ══════════════════════════════════════════════════════════════════

class TestNotificationService:
    """Notification listing, mark read, unread count."""

    def test_unread_count_zero(self, app: Flask) -> None:
        """Edge case: user with no notifications has 0 unread."""
        with app.app_context():
            user = _user('quiet_user')
            count = NotificationService.unread_count(user.id)
            assert count == 0

    def test_unread_count(self, app: Flask) -> None:
        """Happy path: unread_count returns correct count."""
        with app.app_context():
            user = _user('notif_user')
            actor = _user('actor')
            # Create 3 notifications
            for i in range(3):
                n = Notification(user_id=user.id, actor_id=actor.id, type='follow')
                db.session.add(n)
            db.session.commit()
            count = NotificationService.unread_count(user.id)
            assert count == 3

    def test_unread_count_ignores_read(self, app: Flask) -> None:
        """Happy path: read notifications are excluded from count."""
        with app.app_context():
            user = _user('notif_user2')
            actor = _user('actor2')
            n1 = Notification(user_id=user.id, actor_id=actor.id, type='follow', is_read=True)
            n2 = Notification(user_id=user.id, actor_id=actor.id, type='like')
            db.session.add_all([n1, n2])
            db.session.commit()
            count = NotificationService.unread_count(user.id)
            assert count == 1

    def test_mark_read_success(self, app: Flask) -> None:
        """Happy path: mark_read sets is_read=True and returns notification."""
        with app.app_context():
            user = _user('mark_user')
            actor = _user('actor3')
            n = Notification(user_id=user.id, actor_id=actor.id, type='follow')
            db.session.add(n)
            db.session.commit()
            result = NotificationService.mark_read(n.id, user.id)
            assert result.is_read is True
            # Verify persistence
            fetched = db.session.get(Notification, n.id)
            assert fetched.is_read is True

    def test_mark_read_not_found(self, app: Flask) -> None:
        """Error case: mark_read on non-existent notification raises NotFoundError."""
        with app.app_context():
            user = _user('mark_user2')
            with pytest.raises(NotFoundError, match='Notification not found'):
                NotificationService.mark_read(99999, user.id)

    def test_mark_read_wrong_user(self, app: Flask) -> None:
        """Error case: marking another user's notification as read raises NotFoundError."""
        with app.app_context():
            owner = _user('owner')
            intruder = _user('intruder_n')
            actor = _user('actor4')
            n = Notification(user_id=owner.id, actor_id=actor.id, type='follow')
            db.session.add(n)
            db.session.commit()
            with pytest.raises(NotFoundError):
                NotificationService.mark_read(n.id, intruder.id)

    def test_mark_all_read(self, app: Flask) -> None:
        """Happy path: mark_all_read sets all unread to read, returns count."""
        with app.app_context():
            user = _user('mark_all_user')
            actor = _user('actor5')
            for i in range(3):
                db.session.add(Notification(user_id=user.id, actor_id=actor.id, type='follow'))
            db.session.commit()
            count = NotificationService.mark_all_read(user.id)
            assert count == 3
            # All should be read now
            unread = NotificationService.unread_count(user.id)
            assert unread == 0

    def test_mark_all_read_no_unread(self, app: Flask) -> None:
        """Edge case: mark_all_read with no unread returns 0."""
        with app.app_context():
            user = _user('no_notif_user')
            count = NotificationService.mark_all_read(user.id)
            assert count == 0

    def test_get_notifications(self, app: Flask) -> None:
        """Happy path: get_notifications returns paginated notifications."""
        with app.app_context():
            user = _user('list_user')
            actor = _user('actor6')
            for i in range(3):
                db.session.add(
                    Notification(user_id=user.id, actor_id=actor.id, type='like')
                )
            db.session.commit()
            items, cursor, has_more = NotificationService.get_notifications(user.id)
            assert len(items) == 3
            assert all(n.user_id == user.id for n in items)

    def test_get_notifications_unread_only(self, app: Flask) -> None:
        """Happy path: unread_only filter returns only unread notifications."""
        with app.app_context():
            user = _user('filter_user')
            actor = _user('actor7')
            db.session.add(Notification(user_id=user.id, actor_id=actor.id, type='follow', is_read=True))
            db.session.add(Notification(user_id=user.id, actor_id=actor.id, type='like'))
            db.session.commit()
            items, _, _ = NotificationService.get_notifications(
                user.id, unread_only=True
            )
            assert len(items) == 1
            assert items[0].is_read is False

    def test_get_notifications_cursor_pagination(self, app: Flask) -> None:
        """Happy path: cursor pagination works for notifications."""
        with app.app_context():
            user = _user('page_user')
            actor = _user('actor8')
            for i in range(5):
                db.session.add(
                    Notification(user_id=user.id, actor_id=actor.id, type='follow')
                )
            db.session.commit()
            page1, cursor1, has_more1 = NotificationService.get_notifications(
                user.id, limit=2
            )
            assert len(page1) == 2
            assert has_more1 is True
            page2, _, has_more2 = NotificationService.get_notifications(
                user.id, cursor=cursor1, limit=2
            )
            assert len(page2) == 2
            ids1 = {n.id for n in page1}
            ids2 = {n.id for n in page2}
            assert ids1.isdisjoint(ids2)

    def test_get_notifications_empty(self, app: Flask) -> None:
        """Edge case: user with no notifications returns empty list."""
        with app.app_context():
            user = _user('empty_notif')
            items, cursor, has_more = NotificationService.get_notifications(user.id)
            assert items == []
            assert cursor is None
            assert has_more is False

    def test_get_notifications_no_actor_loaded(self, app: Flask) -> None:
        """Edge case: notification with deleted actor still loads safely."""
        with app.app_context():
            user = _user('orphan_user')
            actor = _user('soon_gone')
            n = Notification(user_id=user.id, actor_id=actor.id, type='follow')
            db.session.add(n)
            db.session.commit()
            # Delete the actor
            db.session.delete(actor)
            db.session.commit()
            items, _, _ = NotificationService.get_notifications(user.id)
            # Should not crash; actor reference may be None
            assert len(items) == 1
