import datetime
from datetime import timezone

from flask_login import UserMixin
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy_serializer import SerializerMixin
from werkzeug.security import generate_password_hash, check_password_hash

from sqlalchemy import DateTime
from extensions import db


class User(db.Model, UserMixin, SerializerMixin):
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(index=True, unique=True)
    email: Mapped[str] = mapped_column(index=True, unique=True)
    hashed_password: Mapped[str] = mapped_column()
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    name: Mapped[str] = mapped_column(nullable=True)
    surname: Mapped[str] = mapped_column(nullable=True)
    birthdate: Mapped[str] = mapped_column(nullable=True)
    profile_image: Mapped[str] = mapped_column(nullable=True, default='default_profile_image.jpg')
    description: Mapped[str] = mapped_column(nullable=True)

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


class Post(db.Model, SerializerMixin):
    __tablename__ = 'posts'

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    image: Mapped[str] = mapped_column(nullable=True)
    text: Mapped[str] = mapped_column()
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    likes_count: Mapped[int] = mapped_column(default=0)
    comments_count: Mapped[int] = mapped_column(default=0)
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


class Like(db.Model, SerializerMixin):
    __tablename__ = 'likes'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(db.ForeignKey('users.id'))
    post_id: Mapped[int] = mapped_column(db.ForeignKey('posts.id'))
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    user: Mapped["User"] = relationship(back_populates="likes")
    post: Mapped["Post"] = relationship(back_populates="likes")


class Follow(db.Model, SerializerMixin):
    __tablename__ = 'follows'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    follower_id: Mapped[int] = mapped_column(db.ForeignKey('users.id'))
    followed_id: Mapped[int] = mapped_column(db.ForeignKey('users.id'))
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    follower: Mapped["User"] = relationship(foreign_keys=[follower_id], back_populates="following")
    followed: Mapped["User"] = relationship(foreign_keys=[followed_id], back_populates="followers")


class Comment(db.Model, SerializerMixin):
    __tablename__ = 'comments'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    author_id: Mapped[int] = mapped_column(db.ForeignKey('users.id'))
    post_id: Mapped[int] = mapped_column(db.ForeignKey('posts.id'))
    text: Mapped[str] = mapped_column()
    created_date: Mapped[datetime.datetime] = mapped_column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    author: Mapped["User"] = relationship(back_populates="comments")
    post: Mapped["Post"] = relationship(back_populates="comments")