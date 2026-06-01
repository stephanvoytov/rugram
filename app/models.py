import datetime
from datetime import timezone

from flask_login import UserMixin
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy_serializer import SerializerMixin
from werkzeug.security import generate_password_hash, check_password_hash

from sqlalchemy import DateTime
from extensions import db


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
    profile_image: Mapped[str] = mapped_column(nullable=True, default='default_profile_image.jpg')
    description: Mapped[str] = mapped_column(nullable=True)
    last_seen: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=True)

    posts: Mapped[list["Post"]] = relationship(back_populates='author')
    likes: Mapped[list["Like"]] = relationship(back_populates='user')
    comments: Mapped[list['Comment']] = relationship(back_populates='author')
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
    chat_participations: Mapped[list['ChatParticipant']] = relationship(back_populates='user')
    messages: Mapped[list['Message']] = relationship(back_populates='author')

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
            return 'никогда'
        if self.is_online:
            return 'онлайн'
        delta = utcnow() - self.last_seen
        minutes = int(delta.total_seconds() / 60)
        if minutes < 60:
            return f'был(а) {minutes} мин назад'
        hours = int(minutes / 60)
        if hours < 24:
            return f'был(а) {hours} ч назад'
        days = int(hours / 24)
        if days == 1:
            return 'был(а) вчера'
        return f'был(а) {days} дн назад'


class Post(db.Model, SerializerMixin):
    __tablename__ = 'posts'

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    image: Mapped[str] = mapped_column(nullable=True)
    text: Mapped[str] = mapped_column()
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)
    likes_count: Mapped[int] = mapped_column(default=0)
    comments_count: Mapped[int] = mapped_column(default=0)
    reposts_count: Mapped[int] = mapped_column(default=0)
    is_deleted: Mapped[bool] = mapped_column(default=False)

    author_id: Mapped[int] = mapped_column(db.ForeignKey('users.id'))
    author: Mapped["User"] = relationship(back_populates='posts')

    likes: Mapped[list['Like']] = relationship(back_populates='post')
    comments: Mapped[list['Comment']] = relationship(back_populates='post')

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
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(db.ForeignKey('users.id'))
    post_id: Mapped[int] = mapped_column(db.ForeignKey('posts.id'))
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped["User"] = relationship(back_populates="likes")
    post: Mapped["Post"] = relationship(back_populates="likes")


class Follow(db.Model, SerializerMixin):
    __tablename__ = 'follows'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    follower_id: Mapped[int] = mapped_column(db.ForeignKey('users.id'))
    followed_id: Mapped[int] = mapped_column(db.ForeignKey('users.id'))
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    follower: Mapped["User"] = relationship(foreign_keys=[follower_id], back_populates="following")
    followed: Mapped["User"] = relationship(foreign_keys=[followed_id], back_populates="followers")


class Comment(db.Model, SerializerMixin):
    __tablename__ = 'comments'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    author_id: Mapped[int] = mapped_column(db.ForeignKey('users.id'))
    post_id: Mapped[int] = mapped_column(db.ForeignKey('posts.id'))
    text: Mapped[str] = mapped_column()
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    author: Mapped["User"] = relationship(back_populates="comments")
    post: Mapped["Post"] = relationship(back_populates="comments")


class Notification(db.Model, SerializerMixin):
    __tablename__ = 'notifications'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(db.ForeignKey('users.id'))
    actor_id: Mapped[int] = mapped_column(db.ForeignKey('users.id'))
    type: Mapped[str] = mapped_column()  # 'like', 'comment', 'follow'
    post_id: Mapped[int] = mapped_column(db.ForeignKey('posts.id'), nullable=True)
    is_read: Mapped[bool] = mapped_column(default=False)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped["User"] = relationship(foreign_keys=[user_id], backref="notifications")
    actor: Mapped["User"] = relationship(foreign_keys=[actor_id])
    post: Mapped["Post"] = relationship(foreign_keys=[post_id])


class Chat(db.Model, SerializerMixin):
    __tablename__ = 'chats'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    participants: Mapped[list['ChatParticipant']] = relationship(back_populates="chat")
    messages: Mapped[list['Message']] = relationship(back_populates="chat")


class ChatParticipant(db.Model, SerializerMixin):
    __tablename__ = 'chat_participants'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_id: Mapped[int] = mapped_column(db.ForeignKey('chats.id'))
    user_id: Mapped[int] = mapped_column(db.ForeignKey('users.id'))
    last_read_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=True)
    last_typing_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=True)

    chat: Mapped["Chat"] = relationship(back_populates="participants")
    user: Mapped["User"] = relationship(back_populates="chat_participations")


class Repost(db.Model, SerializerMixin):
    __tablename__ = 'reposts'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(db.ForeignKey('users.id'))
    post_id: Mapped[int] = mapped_column(db.ForeignKey('posts.id'))
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped["User"] = relationship(backref="reposts")
    post: Mapped["Post"] = relationship(backref="reposted_by")


class SavedPost(db.Model, SerializerMixin):
    __tablename__ = 'saved_posts'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(db.ForeignKey('users.id'))
    post_id: Mapped[int] = mapped_column(db.ForeignKey('posts.id'))
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped["User"] = relationship(backref="saved_posts")
    post: Mapped["Post"] = relationship(backref="saved_by")


class Message(db.Model, SerializerMixin):
    __tablename__ = 'messages'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_id: Mapped[int] = mapped_column(db.ForeignKey('chats.id'))
    author_id: Mapped[int] = mapped_column(db.ForeignKey('users.id'))
    text: Mapped[str] = mapped_column()
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=utcnow)
    is_read: Mapped[bool] = mapped_column(db.Boolean, default=False)
    read_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=True)

    chat: Mapped["Chat"] = relationship(back_populates="messages")
    author: Mapped["User"] = relationship(back_populates="messages")