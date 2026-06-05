"""Seed fake data for local development and screenshots.

Creates users, posts, follows, and chat messages.
Run: python seed.py
"""

import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.models import User, Post, Follow, Chat, ChatParticipant, Message, Notification, Like, Tag, PostTag
from extensions import db
from app.crypto import encrypt
from app.routes.helpers import extract_tags, sync_post_tags

app = create_app()

with app.app_context():
    print("** Seeding database...")

    # ── Users ──
    alice = User.query.filter_by(username='alice').first()
    if not alice:
        alice = User(username='alice', email='alice@rugram.local')
        alice.set_password('pass123')
        alice.description = 'Python developer & terminal enthusiast. Building the future of social networks.'
        alice.name = 'Alice'
        alice.is_admin = True
        db.session.add(alice)

    bob = User.query.filter_by(username='bob').first()
    if not bob:
        bob = User(username='bob', email='bob@rugram.local')
        bob.set_password('pass123')
        bob.description = 'AI/ML researcher. Love Rust, neural networks, and good coffee.'
        bob.name = 'Bob'
        db.session.add(bob)
        db.session.flush()
    bob.is_moderator = True

    db.session.flush()

    # ── Posts by Alice ──
    def _make_post(author, text, likes=0, comments=0, reposts=0):
        existing = Post.query.filter_by(author_id=author.id, text=text).first()
        if existing:
            return existing
        p = Post(text=text, author_id=author.id,
                 likes_count=likes, comments_count=comments, reposts_count=reposts)
        db.session.add(p)
        db.session.flush()
        tags = extract_tags(text)
        if tags:
            sync_post_tags(p.id, tags)
        return p

    alice_posts = [
        "just finished rewriting the entire routing layer in Flask.\n\nthe terminal UI now feels buttery smooth. next up: async chat polling.\n\n#dev #flask #python",
        "people ask me why I built a social network with a terminal interface.\n\nbecause keyboards are faster than mice.\n\n>_ prove me wrong.",
        "hot take: the best UIs are the ones you don't have to touch.\n\n⌨️ > 🖱️",
        "deep dive into WebSocket scaling today. 10k concurrent connections on a single box.\n\n#dev #python #websocket",
        "my new terminal-based text editor can now syntax-highlight 40+ languages.\n\n#dev #tools",
    ]
    for text in alice_posts:
        _make_post(alice, text)

    # ── Posts by Bob ──
    bob_posts = [
        ("finally got the transformer model to converge.\n\n72 hours of training. 4 A100s. zero sleep.\n\nworth it.\n\n#ml #ai #transformers", 42, 15, 8),
        ("been testing rugram's TTY mode all morning.\n\n`grep` for searching posts, `cd` for navigation...\n\nthis is how social media should work.", 12, 3, 1),
        ("just published a paper on attention mechanisms. TL;DR: we can make transformers 3x faster with sparse attention.\n\n#ml #ai #research", 28, 10, 5),
        ("Rust vs Zig for systems programming? my hot take:\n\nRust for safety, Zig for simplicity.\n\n#dev #rust #zig", 15, 7, 2),
        ("built a tiny ML model that generates terminal commands from natural language.\n\n`show me all posts about transformers` → `grep transformers`\n\n#ml #ai #tools", 33, 12, 6),
    ]
    for text, likes, comments, reposts in bob_posts:
        _make_post(bob, text, likes, comments, reposts)

    db.session.flush()

    # ── Follow: alice → bob ──
    if not Follow.query.filter_by(follower_id=alice.id, followed_id=bob.id).first():
        f = Follow(follower_id=alice.id, followed_id=bob.id)
        db.session.add(f)

    # ── Like: alice likes bob's first post ──
    bobs_first = Post.query.filter_by(author_id=bob.id).order_by(Post.id).first()
    if bobs_first and not Like.query.filter_by(user_id=alice.id, post_id=bobs_first.id).first():
        lk = Like(user_id=alice.id, post_id=bobs_first.id)
        db.session.add(lk)
        bobs_first.likes_count += 1

    # ── Chat alice ↔ bob ──
    existing_chat = Chat.query.join(ChatParticipant).filter(
        ChatParticipant.user_id.in_([alice.id, bob.id])
    ).group_by(Chat.id).having(db.func.count(ChatParticipant.id) == 2).first()

    if not existing_chat:
        chat = Chat()
        db.session.add(chat)
        db.session.flush()

        cp1 = ChatParticipant(chat_id=chat.id, user_id=alice.id)
        cp2 = ChatParticipant(chat_id=chat.id, user_id=bob.id)
        db.session.add(cp1)
        db.session.add(cp2)
        db.session.flush()

        messages = [
            (alice.id, "hey! saw your transformer post. 72 hours? that's insane"),
            (bob.id, "haha yeah. but it converged! will write a blog post about it soon."),
            (alice.id, "nice! also the terminal UI i'm building, you should check it out"),
            (bob.id, "already testing it. grep for posts is genius."),
        ]
        for author_id, text in messages:
            msg = Message(chat_id=chat.id, author_id=author_id, text=encrypt(text))
            msg.is_read = True
            db.session.add(msg)

    db.session.commit()
    print("** Database seeded!")
    print(f"   - Users: alice / pass123, bob / pass123")
    print(f"   - Posts: {Post.query.count()}")
    print(f"   - Follows: {Follow.query.count()}")
    print(f"   - Likes: {Like.query.count()}")
    print(f"   - Chats: {Chat.query.count()}")
