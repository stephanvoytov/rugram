import datetime
from datetime import timezone
from typing import Optional

from flask_login import UserMixin
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy_serializer import SerializerMixin
from werkzeug.security import generate_password_hash, check_password_hash

from sqlalchemy import DateTime, event, UniqueConstraint, Index, Text
from sqlalchemy.engine import Engine
from extensions import db
from app.translations import _


@event.listens_for(Engine, "connect")
def _set_sqlite_foreign_keys(dbapi_connection, connection_record):
    """Enable FK enforcement for SQLite (disabled by default)."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def utcnow():
    """Текущее UTC время без timezone (SQLite не хранит tz)."""
    return datetime.datetime.now(timezone.utc).replace(tzinfo=None)


class User(db.Model, UserMixin, SerializerMixin):
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(index=True, unique=True)
    email: Mapped[str] = mapped_column(index=True, unique=True)
    hashed_password: Mapped[str] = mapped_column()
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    name: Mapped[str] = mapped_column(nullable=True)
    surname: Mapped[str] = mapped_column(nullable=True)
    birthdate: Mapped[str] = mapped_column(nullable=True)
    profile_image: Mapped[str] = mapped_column(nullable=True)
    description: Mapped[str] = mapped_column(nullable=True)
    last_seen: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=True)
    notifications_enabled: Mapped[bool] = mapped_column(default=True)
    is_admin: Mapped[bool] = mapped_column(default=False)
    is_moderator: Mapped[bool] = mapped_column(default=False)

    @property
    def role_color(self) -> str | None:
        """Цвет для подсветки имени в UI: admin=yellow, moderator=red."""
        if self.is_admin:
            return 'var(--yellow)'
        if self.is_moderator:
            return 'var(--red)'
        return None

    posts: Mapped[list["Post"]] = relationship(back_populates='author', cascade='all, delete-orphan')
    likes: Mapped[list["Like"]] = relationship(back_populates='user', cascade='all, delete-orphan')
    comments: Mapped[list['Comment']] = relationship(back_populates='author', cascade='all, delete-orphan')
    followers: Mapped[list['Follow']] = relationship(
        foreign_keys='Follow.followed_id',
        back_populates='followed',
        lazy='dynamic',
        viewonly=True
    )
    following: Mapped[list['Follow']] = relationship(
        foreign_keys='Follow.follower_id',
        back_populates='follower',
        lazy='dynamic',
        viewonly=True
    )
    chat_participations: Mapped[list['ChatParticipant']] = relationship(back_populates='user', cascade='all, delete-orphan')
    messages: Mapped[list['Message']] = relationship(back_populates='author', cascade='all, delete-orphan')
    notifications: Mapped[list['Notification']] = relationship(foreign_keys='Notification.user_id', back_populates='user', cascade='all, delete-orphan')
    reposts: Mapped[list['Repost']] = relationship(back_populates='user', cascade='all, delete-orphan')
    saved_posts: Mapped[list['SavedPost']] = relationship(back_populates='user', cascade='all, delete-orphan')
    push_subscriptions: Mapped[list['PushSubscription']] = relationship(back_populates='user', cascade='all, delete-orphan')

    @property
    def followers_count(self):
        return self.followers.count()

    @property
    def following_count(self):
        return self.following.count()

    def is_followed_by(self, user):
        if not user.is_authenticated:
            return False
        return Follow.query.filter_by(
            follower_id=user.id,
            followed_id=self.id
        ).first() is not None

    def get_id(self):
        return str(self.id)

    def set_password(self, password):
        self.hashed_password = generate_password_hash(password)

    def check_password(self, password: str):
        return check_password_hash(self.hashed_password, password)

    @property
    def is_online(self):
        if not self.last_seen:
            return False
        delta = utcnow() - self.last_seen
        return delta.total_seconds() < 300  # 5 минут

    def last_seen_str(self):
        if not self.last_seen:
            return _('never')
        if self.is_online:
            return _('online')
        delta = utcnow() - self.last_seen
        minutes = int(delta.total_seconds() / 60)
        if minutes < 60:
            return _('%(minutes)s min ago') % {'minutes': minutes}
        hours = int(minutes / 60)
        if hours < 24:
            return _('%(hours)s h ago') % {'hours': hours}
        days = int(hours / 24)
        if days == 1:
            return _('yesterday')
        return _('%(days)s days ago') % {'days': days}


class Post(db.Model, SerializerMixin):
    __tablename__ = 'posts'

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    image: Mapped[str] = mapped_column(nullable=True)
    text: Mapped[str] = mapped_column()
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)
    likes_count: Mapped[int] = mapped_column(default=0)
    comments_count: Mapped[int] = mapped_column(default=0)
    reposts_count: Mapped[int] = mapped_column(default=0)
    is_deleted: Mapped[bool] = mapped_column(default=False, index=True)

    author_id: Mapped[int] = mapped_column(db.ForeignKey('users.id', ondelete='CASCADE'))
    author: Mapped["User"] = relationship(back_populates='posts')

    likes: Mapped[list['Like']] = relationship(back_populates='post', cascade='all, delete-orphan', lazy='dynamic')
    comments: Mapped[list['Comment']] = relationship(back_populates='post', cascade='all, delete-orphan', lazy='dynamic')
    reposted_by: Mapped[list['Repost']] = relationship(back_populates='post')
    saved_by: Mapped[list['SavedPost']] = relationship(back_populates='post')
    post_tags: Mapped[list['PostTag']] = relationship(back_populates='post', cascade='all, delete-orphan')

    def is_liked_by(self, user):
        if not user.is_authenticated:
            return False
        return Like.query.filter_by(
            user_id=user.id,
            post_id=self.id
        ).first() is not None

    def is_saved_by(self, user):
        if not user.is_authenticated:
            return False
        return SavedPost.query.filter_by(
            user_id=user.id,
            post_id=self.id
        ).first() is not None

    def is_reposted_by(self, user):
        if not user.is_authenticated:
            return False
        return Repost.query.filter_by(
            user_id=user.id,
            post_id=self.id
        ).first() is not None


class Like(db.Model, SerializerMixin):
    __tablename__ = 'likes'
    __table_args__ = (
        UniqueConstraint('user_id', 'post_id', name='uq_likes_user_post'),
        Index('ix_likes_user_id', 'user_id'),
        Index('ix_likes_post_id', 'post_id'),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(db.ForeignKey('users.id', ondelete='CASCADE'))
    post_id: Mapped[int] = mapped_column(db.ForeignKey('posts.id', ondelete='CASCADE'))
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped["User"] = relationship(back_populates="likes")
    post: Mapped["Post"] = relationship(back_populates="likes")


class Follow(db.Model, SerializerMixin):
    __tablename__ = 'follows'
    __table_args__ = (
        UniqueConstraint('follower_id', 'followed_id', name='uq_follows_pair'),
        Index('ix_follows_follower_id', 'follower_id'),
        Index('ix_follows_followed_id', 'followed_id'),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    follower_id: Mapped[int] = mapped_column(db.ForeignKey('users.id', ondelete='CASCADE'))
    followed_id: Mapped[int] = mapped_column(db.ForeignKey('users.id', ondelete='CASCADE'))
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    follower: Mapped["User"] = relationship(foreign_keys=[follower_id], back_populates="following")
    followed: Mapped["User"] = relationship(foreign_keys=[followed_id], back_populates="followers")


class Comment(db.Model, SerializerMixin):
    __tablename__ = 'comments'
    __table_args__ = (
        Index('ix_comments_author_id', 'author_id'),
        Index('ix_comments_post_id', 'post_id'),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    author_id: Mapped[int] = mapped_column(db.ForeignKey('users.id', ondelete='CASCADE'))
    post_id: Mapped[int] = mapped_column(db.ForeignKey('posts.id', ondelete='CASCADE'))
    text: Mapped[str] = mapped_column()
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    author: Mapped["User"] = relationship(back_populates="comments")
    post: Mapped["Post"] = relationship(back_populates="comments")


class SystemEvent(db.Model, SerializerMixin):
    """Системное событие: ошибки, алерты, важные уведомления для админа."""
    __tablename__ = 'system_events'

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    level: Mapped[str] = mapped_column(default='info')  # critical / error / warning / info
    category: Mapped[str] = mapped_column(default='system')  # push / db / auth / chat / upload / system
    message: Mapped[str] = mapped_column()
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)
    is_read: Mapped[bool] = mapped_column(default=False)


class Notification(db.Model, SerializerMixin):
    __tablename__ = 'notifications'
    __table_args__ = (
        Index('ix_notifications_user_id', 'user_id'),
        Index('ix_notifications_actor_id', 'actor_id'),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(db.ForeignKey('users.id', ondelete='CASCADE'))
    actor_id: Mapped[int] = mapped_column(db.ForeignKey('users.id', ondelete='CASCADE'))
    type: Mapped[str] = mapped_column()  # 'like', 'comment', 'follow', 'repost', 'wall'
    post_id: Mapped[int] = mapped_column(db.ForeignKey('posts.id', ondelete='SET NULL'), nullable=True)
    text: Mapped[str] = mapped_column(nullable=True)  # message body (for 'wall' type)
    is_read: Mapped[bool] = mapped_column(default=False)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped["User"] = relationship(foreign_keys=[user_id], back_populates="notifications")
    actor: Mapped["User"] = relationship(foreign_keys=[actor_id])
    post: Mapped["Post"] = relationship(foreign_keys=[post_id])


class Chat(db.Model, SerializerMixin):
    __tablename__ = 'chats'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    participants: Mapped[list['ChatParticipant']] = relationship(back_populates="chat", cascade='all, delete-orphan')
    messages: Mapped[list['Message']] = relationship(back_populates="chat", cascade='all, delete-orphan')


class ChatParticipant(db.Model, SerializerMixin):
    __tablename__ = 'chat_participants'
    __table_args__ = (
        UniqueConstraint('chat_id', 'user_id', name='uq_chat_participant'),
        Index('ix_chat_participants_chat_id', 'chat_id'),
        Index('ix_chat_participants_user_id', 'user_id'),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_id: Mapped[int] = mapped_column(db.ForeignKey('chats.id', ondelete='CASCADE'))
    user_id: Mapped[int] = mapped_column(db.ForeignKey('users.id', ondelete='CASCADE'))
    last_read_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=True)
    last_typing_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=True)

    chat: Mapped["Chat"] = relationship(back_populates="participants")
    user: Mapped["User"] = relationship(back_populates="chat_participations")


class Repost(db.Model, SerializerMixin):
    __tablename__ = 'reposts'
    __table_args__ = (
        UniqueConstraint('user_id', 'post_id', name='uq_reposts_user_post'),
        Index('ix_reposts_user_id', 'user_id'),
        Index('ix_reposts_post_id', 'post_id'),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(db.ForeignKey('users.id', ondelete='CASCADE'))
    post_id: Mapped[int] = mapped_column(db.ForeignKey('posts.id', ondelete='CASCADE'))
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped["User"] = relationship(back_populates="reposts")
    post: Mapped["Post"] = relationship(back_populates="reposted_by")



class SavedPost(db.Model, SerializerMixin):
    __tablename__ = 'saved_posts'
    __table_args__ = (
        UniqueConstraint('user_id', 'post_id', name='uq_saved_posts_user_post'),
        Index('ix_saved_posts_user_id', 'user_id'),
        Index('ix_saved_posts_post_id', 'post_id'),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(db.ForeignKey('users.id', ondelete='CASCADE'))
    post_id: Mapped[int] = mapped_column(db.ForeignKey('posts.id', ondelete='CASCADE'))
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped["User"] = relationship(back_populates="saved_posts")
    post: Mapped["Post"] = relationship(back_populates="saved_by")


class Message(db.Model, SerializerMixin):
    __tablename__ = 'messages'
    __table_args__ = (
        Index('ix_messages_chat_id', 'chat_id'),
        Index('ix_messages_author_id', 'author_id'),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_id: Mapped[int] = mapped_column(db.ForeignKey('chats.id', ondelete='CASCADE'))
    author_id: Mapped[int] = mapped_column(db.ForeignKey('users.id', ondelete='CASCADE'))
    text: Mapped[str] = mapped_column()  # пустая строка '' если сообщение только с картинкой
    image: Mapped[Optional[str]] = mapped_column(nullable=True)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)
    is_read: Mapped[bool] = mapped_column(db.Boolean, default=False)
    read_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=True)
    edited_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)

    chat: Mapped["Chat"] = relationship(back_populates="messages")
    author: Mapped["User"] = relationship(back_populates="messages")


class PushSubscription(db.Model):
    __tablename__ = 'push_subscriptions'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(db.Text, nullable=False)
    p256dh_key: Mapped[str] = mapped_column(db.String(256), nullable=False)
    auth_key: Mapped[str] = mapped_column(db.String(64), nullable=False)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped["User"] = relationship(back_populates="push_subscriptions")


class Tag(db.Model, SerializerMixin):
    __tablename__ = 'tags'

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(index=True, unique=True)
    post_count: Mapped[int] = mapped_column(default=0)

    post_tags: Mapped[list['PostTag']] = relationship(back_populates='tag', cascade='all, delete-orphan')


class PostTag(db.Model, SerializerMixin):
    __tablename__ = 'post_tags'
    __table_args__ = (
        UniqueConstraint('post_id', 'tag_id', name='uq_post_tag'),
        Index('ix_post_tags_tag_id', 'tag_id'),
        Index('ix_post_tags_post_id', 'post_id'),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(db.ForeignKey('posts.id', ondelete='CASCADE'))
    tag_id: Mapped[int] = mapped_column(db.ForeignKey('tags.id', ondelete='CASCADE'))

    post: Mapped['Post'] = relationship(back_populates='post_tags')
    tag: Mapped['Tag'] = relationship(back_populates='post_tags')