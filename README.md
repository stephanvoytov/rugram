![Flask](https://img.shields.io/badge/Flask-000000?logo=flask&logoColor=white)
![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Bootstrap 5.3](https://img.shields.io/badge/Bootstrap-5.3-712CF9?logo=bootstrap&logoColor=white)
![Stars](https://img.shields.io/github/stars/stephanvoytov/rugram)
[![Site](https://img.shields.io/badge/demo-rugram.mooo.com-89b4fa)](https://rugram.mooo.com)
[![Wiki](https://img.shields.io/badge/wiki-docs-cba6f7)](https://github.com/stephanvoytov/rugram/wiki)

[Русская версия →](README.ru.md)

# Rugram — social network inside a terminal

**A social network you drive from the command line.**  
Full GUI included for the keyboard-shy.

→ **[rugram.mooo.com](https://rugram.mooo.com)** — live demo

```bash
# Like a post
like 42
# DM someone
cd chat @alice
say hey!
# Search posts
grep "flask"
# View a profile
neofetch @alice
# Edit your bio
nano description.txt
# See who's online
ping @bob
# Watch the feed live
watch -n 5 feed
```

This is **not a toy console**. It's a real terminal emulator running in the browser — with `--help` on every command, Tab autocomplete, arrow-key history, `Ctrl+R` reverse search, `Ctrl+L` clear, pipe chaining (`like 42 | echo liked`), and boot animation (Matrix Rain).

Every GUI page maps to a filesystem path:  
`cd /feed` → the feed, `cd /chat/@alice` → your DMs, `cd /settings` → preferences.

The GUI is built on **Bootstrap 5.3** (grid, alerts, dark mode, dropdowns, icons) but styled entirely in **Catppuccin Mocha** with **JetBrains Mono** — even the GUI looks like a terminal. Buttons use `[brackets]`, modals are minimal, everything is monospace.

---

## Quick start

```bash
git clone https://github.com/stephanvoytov/rugram
cd rugram

# Generate SECRET_KEY (required)
python -c "import secrets; print(f'SECRET_KEY={secrets.token_hex(32)}')" > .env

# Install dependencies
pip install -r requirements.txt

# Seed demo data (alice/pass123, bob/pass123)
python seed.py

# Run dev server
python run.py
# → http://localhost:5000
```

### Production (Docker)

```bash
docker compose up -d
# → http://localhost:8000 (gunicorn)
```

---

## Commands (not exhaustive — full list via `help` in the terminal)

| Command | What it does |
|---------|-------------|
| `help`, `man <cmd>` | List all commands / per-command docs |
| `login`, `register`, `logout` | Authentication |
| `like <id>`, `comment <id> text` | Social actions |
| `follow @user`, `unfollow @user` | Manage follows |
| `bookmark <id>` | Save a post |
| `cd chat @user` | Open a direct message |
| `say <text>` | Send a message |
| `grep <query>` | Search posts |
| `neofetch @user` | Profile with ASCII art from avatar |
| `nano <file>` | Edit posts and profile inside the terminal |
| `create <text>` | Create a new post |
| `cat <id>`, `less <id>` | View a post |
| `watch -n 5 feed` | Auto-refresh feed |
| `export LANG=ru_RU` | Switch language |
| `ping @user` | Check if user exists |
| `feed`, `saved` | Browse posts |
| `followers @user`, `following @user` | Social lists |
| `rm <id>` | Delete your post |
| `clear`, `pwd`, `echo`, `date`, `history` | Unix classics |
| `uptime`, `top`, `whoami`, `id`, `info` | System info |
| `fortune`, `alias`, `source` | Shell features |
| `gui` / `exit` | Switch back to GUI |

---

## Architecture

```
app/
├── routes/           # 3 blueprints: auth, main, posts + admin
│   ├── helpers.py    # Shared utils (image processing, cursor pagination, system events)
│   └── admin.py      # Admin panel (users, posts, tags, events, logs)
├── resources/        # REST API (/api/v1/posts)
├── services/         # Business logic layer (planned)
├── models.py         # SQLAlchemy models (User, Post, Chat, Message, …)
├── logger.py         # Structured logging (structlog → console + file + DB)
├── crypto.py         # Fernet/MultiFernet chat encryption
├── push.py           # Web Push notifications (VAPID)
├── limiter.py        # Rate limiting
├── translations.py   # EN/RU bilingual support
├── forms.py          # WTForms (Login, Registration, Post, Profile, Settings)
├── filters.py        # Jinja2 template filters
├── templates/        # Jinja2 (auth, main, posts, errors, admin)
└── static/           # CSS, JS (terminal emulator), uploads, sw.js
```

### Test coverage

**558 tests — all green**

| Category | File(s) | Count | What it covers |
|----------|---------|-------|----------------|
| Unit | `tests/unit/test_services.py` | 116 | PostService, ChatService, SocialService, FeedService, NotificationService, AdminService, AuthService — mock-based |
| Unit | `tests/unit/test_translations.py` | 3 | RU dictionary covers all `_()` keys in source |
| Integration | `tests/integration/test_integration.py` | 18 | Full-stack flows: signup → login → post → chat → follow → notification |
| Integration | `tests/integration/test_routes.py` | 17 | Page rendering, form validation, redirects |
| Integration | `tests/integration/test_posts.py` | 19 | Post CRUD, comments, likes, bookmarks, reposts |
| Integration | `tests/integration/test_chat.py` | 19 | Chat lifecycle, message CRUD, participants, images |
| Integration | `tests/integration/test_social.py` | 13 | Follow/unfollow, notifications, feed |
| Integration | `tests/integration/test_api.py` | 10 | REST endpoints, pagination, JSON responses |
| Security | `tests/security/test_security.py` | 24 | Auth guards, IDOR (post/chat/comment), XSS, admin access, upload validation |
| **JS** | `tests/test_terminal.js` | **319** | All terminal commands, auth guards, edge cases |

```
Fast run with xdist (6+ workers):
  python -m pytest tests/ -n auto -q          # ~10s

Sequential:
  python -m pytest tests/ -q                  # ~20s

JS terminal tests:
  node tests/test_terminal.js                 # ~2s

In-memory SQLite per test, idempotent DB user registration.
All API endpoints under /api/v1/*.
Redis cache optional (set REDIS_URL in .env).
```

### API documentation

Full OpenAPI/Swagger docs available at `/apidocs/` when the server is running.

---

## Features

**Bilingual (EN + RU)** — English by default, Russian via `?lang=ru`.  
Flash messages, empty states, forms, help pages — all translated. Switch on the fly: `export LANG=ru_RU`.

**Encrypted messenger** — real-time polling, online status, typing indicator, read receipts, image upload.  
All messages encrypted at rest (Fernet, key rotation via MultiFernet).

**Push notifications** — via Service Worker + Web Push API (VAPID). Messages, likes, comments, follows.

**Terminal-inspired GUI** — Bootstrap 5.3 + Catppuccin Mocha theme. Infinite feed, like animations, inline comments, bookmarks, reposts, dark/light mode, image lightbox, avatar upload, mobile-first.

**REST API** — `/api/v1/posts`, `/api/v1/feed`, `/api/v1/notifications`, `/api/v1/saved`.  
Cursor-based pagination, JSON responses.

**Admin panel** — `/admin/` dashboard with stats, user/post management, system events, structured log viewer.

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.12, Flask, SQLAlchemy, Flask-Login, Flask-WTF, SQLite |
| Frontend | Jinja2, Bootstrap 5.3, Vanilla JS, CSS Custom Properties (Catppuccin Mocha) |
| Security | cryptography (Fernet), pywebpush (VAPID), Flask-Limiter |
| Logging | structlog (console + rotating JSON file + SystemEvent DB) |
| Infra | Alembic, Gunicorn, Docker Compose |
| Tests | pytest (xdist), Node.js (JSDOM) |

---

[MIT](LICENSE) · [github.com/stephanvoytov/rugram](https://github.com/stephanvoytov/rugram)
