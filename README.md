![Flask](https://img.shields.io/badge/Flask-000000?logo=flask&logoColor=white)
![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Bootstrap 5.3](https://img.shields.io/badge/Bootstrap-5.3-712CF9?logo=bootstrap&logoColor=white)
![Stars](https://img.shields.io/github/stars/stephanvoytov/rugram)
[![Site](https://img.shields.io/badge/demo-rugram.mooo.com-89b4fa)](https://rugram.mooo.com)

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

## Commands

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
| `export LANG=ru_RU` | Switch language on the fly |
| `ping @user` | Check if user exists |
| `feed`, `saved` | Browse posts |
| `followers @user`, `following @user` | Social lists |
| `rm <id>` | Delete your post |
| `clear`, `pwd`, `echo`, `date`, `history` | Unix classics |
| `uptime`, `top`, `whoami`, `id`, `info` | System info |
| `fortune`, `alias`, `source` | Shell features |
| `gui` / `exit` | Switch back to GUI |

---

## Features

**Bilingual (EN + RU)** — English by default, Russian via `?lang=ru` on any URL.  
Everything switches: UI, terminal, `help`/`man`, flash messages, forms, empty states.  
Or switch on the fly: `export LANG=ru_RU`.

**Encrypted messenger** — real-time polling, online status, typing indicator, date separators, read receipts. All messages encrypted at rest (Fernet, key derived from `SECRET_KEY`).

**Push notifications** — via Service Worker + Web Push API (VAPID). New messages, likes, comments, follows — arrive even when the site is closed.

**Terminal-inspired GUI** — Bootstrap 5.3 grid and utilities under a custom Catppuccin theme. Infinite feed with All/Subscriptions filter, like animations (Web Animations API), inline comments with auto-expand textarea, bookmarks grid, reposts, dark/light theme (respects `prefers-color-scheme`), image lightbox, avatar upload with 500×500 crop, mobile-first responsive layout, REST API (`/api/v1/posts`).

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.12, Flask, SQLAlchemy, Flask-Login, Flask-WTF, SQLite |
| Frontend | Jinja2, **Bootstrap 5.3**, Vanilla JS, CSS Custom Properties (Catppuccin Mocha) |
| Security | cryptography (Fernet), pywebpush (VAPID) |
| Infra | Alembic, Gunicorn |

---

[MIT](LICENSE) · [github.com/stephanvoytov/rugram](https://github.com/stephanvoytov/rugram)
