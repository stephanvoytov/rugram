# Rugram — terminal-native social network

<div align="center">

[![Flask](https://img.shields.io/badge/Flask-000000?logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://python.org)
[![Stars](https://img.shields.io/github/stars/stephanvoytov/rugram)](https://github.com/stephanvoytov/rugram/stargazers)
[![Site](https://img.shields.io/badge/demo-rugram.mooo.com-89b4fa)](https://rugram.mooo.com)

**A social network you drive from a terminal.**  
Full GUI included for the keyboard-shy.

**[rugram.mooo.com](https://rugram.mooo.com) — live demo instance**

</div>

```bash
# Like a post
like 42
# DM a friend
cd chat @alice
say hey!
# Search posts
grep "flask"
# View profile
neofetch @alice
# Edit bio
nano description.txt
```

A single page that holds Bootstrap cards and `bash: command not found`,  
likes with pop animation and `man ls`, push notifications and `uptime`.

---

## Quick start

```bash
git clone https://github.com/stephanvoytov/rugram.git
cd rugram
python -c "import secrets; print(f'SECRET_KEY={secrets.token_hex(32)}')" > .env
docker compose up -d --build
```

→ **http://localhost:8000** — hit `[>_ TTY]` and start typing.

| Env variable | Required | Default | Description |
|---|---|---|---|
| `SECRET_KEY` | ✅ | — | Session signing + message encryption |
| `VAPID_PUBLIC_KEY` | ❌ | Built-in | Web Push public key |
| `VAPID_PRIVATE_KEY` | ❌ | Built-in | Web Push private key |

---

## Features

### Terminal (TTY)
A full terminal emulator in the browser — the project's signature.

| Command | What it does |
|---|---|
| `help`, `man <cmd>` | List all commands / per-command docs |
| `cd`, `ls`, `cat`, `grep` | Navigate and search like Unix |
| `like`, `follow`, `comment` | Social actions from the prompt |
| `neofetch @user` | User profile with ASCII art from avatar |
| `nano <file>` | Edit posts and profile inside the terminal |
| `say`, `cd chat @user` | Messaging via the command line |
| `watch -n 5 feed` | Auto-refresh feed |
| `export LANG=ru_RU` | Switch language on the fly |
| `fortune`, `ping`, `uptime`, `date` | Unix classics |

Every GUI page maps to a `cd` path (`/feed`, `/chat`, `/notifications`, …).  
The terminal has boot animations (Matrix Rain), `--help` on every command, arrow-key history, and autocomplete.

### Bilingual (EN + RU)
- English by default, Russian via `?lang=ru` on any URL
- Terminal, `help`, `man`, flash messages, forms, empty states — all translated
- TTY picks up the language from the GUI automatically

### Messenger with encryption
- Real-time polling, online status, typing indicator
- Date separators ("Today", "Yesterday", "May 15")
- Read receipts
- **All messages encrypted at rest** (Fernet, key derived from `SECRET_KEY`)

### Push notifications
- Service Worker + Web Push API (VAPID)
- Arrive when the site is closed
- New messages, likes, comments, follows
- Expired subscriptions cleaned up automatically

### Also
- Infinite feed with "All / Subscriptions" filter
- Like animation (pop + ripple via Web Animations API)
- Comments with inline form and auto-expand textarea
- Bookmarks (saved posts grid)
- Reposts
- Dark theme (respects `prefers-color-scheme`)
- Lightbox for images
- Avatar upload with 500×500 crop
- REST API (`/api/v1/posts`)
- Mobile-first responsive layout
- SEO: sitemap, OG/Twitter cards, canonical URLs, hreflang
- Docker Compose + Caddy/Nginx reverse proxy

---

## Stack

**Backend** Python 3.12, Flask, SQLAlchemy, Flask-Login, Flask-WTF, WTForms, SQLite  
**Security** cryptography (Fernet), pywebpush (VAPID)  
**Frontend** Jinja2, Bootstrap 5.3, Vanilla JS, CSS Custom Properties  
**Infra** Docker, Alembic, Gunicorn

## Optimizations

- **Images** — 1200px full / 400px thumbnail, JPEG q85, lazy loading
- **Caching** — CSS/JS versioned by mtime (`?v=timestamp`), `defer`
- **Architecture** — routes in a package (`app/routes/`), JS split by concern, CSS variables

---

## Project structure

```
app/
├── __init__.py          # create_app() factory
├── models.py            # SQLAlchemy models
├── routes/              # Blueprint package
│   ├── auth.py          # /auth/*
│   ├── posts.py         # /posts/* (like, comment, repost, save)
│   ├── main.py          # /, /settings, /chat, /about …
│   └── helpers.py       # Shared utilities
├── forms.py             # WTForms
├── crypto.py            # Fernet message encryption
├── translations.py      # EN/RU bilingual engine
├── resources/           # REST API (/api/v1/posts)
├── static/
│   ├── css/style.css
│   └── js/
│       ├── main.js      # GUI logic
│       └── terminal.js  # TTY emulator
├── templates/
│   ├── base.html
│   ├── macros/
│   ├── auth/            # login, register
│   ├── main/            # feed, profile, settings, chat, about …
│   └── posts/           # post page, create
└── uploads/             # Avatars + post images
```

## Local development

```bash
git clone https://github.com/stephanvoytov/rugram.git
cd rugram
python -m venv venv

# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
python -c "import secrets; print(f'SECRET_KEY={secrets.token_hex(32)}')" > .env
alembic upgrade head
python run.py
```

Open **http://localhost:5000**

### Database migrations

```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
alembic downgrade -1
```

Migrations run automatically on container start (via `start.sh`).

### Volumes (Docker)

| Container path | Purpose |
|---|---|
| `/app/instance` | SQLite database |
| `/app/app/static/uploads` | Uploaded images |

### Production deploy

```bash
git pull
docker compose up -d --build
```

Reverse proxy (Caddy/Nginx) on port `8000`.  
Logs: `docker compose logs -f`

---

## Push notifications

Requires HTTPS (Caddy provides Let's Encrypt on production).

1. On first click, the browser asks for notification permission
2. Service Worker (`sw.js`) registers
3. Push subscription keys are stored on the server

Push fires on: new chat message, like, comment, follow.  
If the browser is closed, push won't arrive (Web Push API limitation).  
If the tab is inactive, the OS shows the notification.

---

<div align="center">

[MIT License](LICENSE) · [github.com/stephanvoytov/rugram](https://github.com/stephanvoytov/rugram)

</div>
