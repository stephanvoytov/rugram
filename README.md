# Rugram — social network inside a terminal

<div align="center">

[![Flask](https://img.shields.io/badge/Flask-000000?logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://python.org)
[![Bootstrap 5.3](https://img.shields.io/badge/Bootstrap-5.3-712CF9?logo=bootstrap&logoColor=white)](https://getbootstrap.com)
[![Stars](https://img.shields.io/github/stars/stephanvoytov/rugram)](https://github.com/stephanvoytov/rugram/stargazers)
[![Site](https://img.shields.io/badge/demo-rugram.mooo.com-89b4fa)](https://rugram.mooo.com)

**Терминал, в котором живёт социальная сеть.**  
**A social network that lives inside a terminal.**

**[rugram.mooo.com](https://rugram.mooo.com) — live / живой**

</div>

---

### 🇷🇺 Rugram — это соцсеть, в которой можно сделать всё, не отрываясь от клавиатуры.

Поставить лайк — `like 42`. Написать в личку — `cd chat @bob` → `say привет!`.  
Найти пост по тегу — `grep "python"`. Посмотреть профиль — `neofetch @alice`.  
Отредактировать шапку — `nano description.txt`.

Это **не игрушечная консоль**. Это полноценный эмулятор терминала в браузере:  
с `--help`, автодополнением по Tab, историей стрелками, `man`, `cat`, `head`, `tail`,  
`watch -n 5 feed`, `export LANG=ru_RU`, `fortune`, `uptime`, `ping`.

Каждая страница GUI отображается на путь в файловой системе:  
`cd /feed` → лента, `cd /chat/@alice` → диалог, `cd /settings` → настройки.

Всё задублировано GUI на Bootstrap 5.3 — для тех, кто не дружит с клавиатурой.  
Тёмная тема, анимации, lightbox, infinite scroll — обычный веб, просто под капотом `bash`.

---

### 🇬🇧 Rugram is a social network you drive from a terminal.

Like a post — `like 42`. DM someone — `cd chat @bob` → `say hey!`.  
Search posts — `grep "python"`. View a profile — `neofetch @alice`.  
Edit your bio — `nano description.txt`.

This is **not a toy console**. It's a full terminal emulator running in the browser:  
`--help` on every command, Tab autocomplete, arrow-key history, `man`, `cat`, `head`, `tail`,  
`watch -n 5 feed`, `export LANG=ru_RU`, `fortune`, `uptime`, `ping`.

Every GUI page maps to a filesystem path:  
`cd /feed` → the feed, `cd /chat/@alice` → your DMs, `cd /settings` → preferences.

A full Bootstrap 5.3 UI mirrors everything — for the keyboard-shy.  
Dark theme, animations, lightbox, infinite scroll — regular web, but with `bash` underneath.

---

## Terminal — как это работает / how it works

```
┌──────────────────────────────────────────────────────┐
│  user@rugram ~ $ neofetch @stepan                    │
│                                                      │
│  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿  ┌────────────────────────┐  │
│  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿  │  user:    stepan       │  │
│  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿  │  name:    Stepan       │  │
│  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿  │  posts:   42           │  │
│  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿  │  likes:   128          │  │
│  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿  │  since:   May 2025     │  │
│  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿  └────────────────────────┘  │
│                                                      │
│  user@rugram ~ $ _                                    │
└──────────────────────────────────────────────────────┘
```

### Команды / Commands

| Команда | Что делает | Command | What it does |
|---------|-----------|---------|-------------|
| `help` | список всех команд | `help` | list all commands |
| `man <cmd>` | документация команды | `man <cmd>` | per-command docs |
| `like <id>` | лайкнуть пост | `like <id>` | like a post |
| `follow @user` | подписаться | `follow @user` | follow a user |
| `comment <id> текст` | написать комментарий | `comment <id> text` | leave a comment |
| `cd chat @user` | открыть диалог | `cd chat @user` | open a DM |
| `say <text>` | отправить сообщение | `say <text>` | send a message |
| `grep <query>` | поиск постов | `grep <query>` | search posts |
| `neofetch @user` | профиль + ASCII-арт | `neofetch @user` | profile + ASCII art |
| `nano <file>` | редактор постов / профиля | `nano <file>` | edit posts / profile |
| `watch -n 5 feed` | автообновление ленты | `watch -n 5 feed` | auto-refresh feed |
| `export LANG=ru_RU` | переключить язык | `export LANG=ru_RU` | switch language |
| `ping @user` | проверить онлайн | `ping @user` | check if online |
| `uptime` | сколько живёт сервер | `uptime` | server uptime |
| `fortune` | цитата программиста | `fortune` | programmer quote |
| `cd /` .. `ls` .. `cat` .. | навигация как в Unix | `cd /` .. `ls` .. `cat` .. | Unix-style navigation |

Горячие клавиши: **Tab** — автодополнение, **↑↓** — история, **Ctrl+L** — очистить экран,  
**Ctrl+C** — прервать, **Ctrl+D** — выход. При загрузке — Matrix Rain с шансом 30%.

Hotkeys: **Tab** autocomplete, **↑↓** history, **Ctrl+L** clear,  
**Ctrl+C** interrupt, **Ctrl+D** exit. Boot animation: Matrix Rain (30% chance).

---

## Возможности / Features

### 🌐 Два языка / Bilingual (EN + RU)
Английский по умолчанию, русский — `?lang=ru` на любом URL.  
Переключается всё: интерфейс, терминал, `help`/`man`, флеш-сообщения, пустые состояния, формы.  
Терминал подхватывает язык из GUI, можно сменить и на лету: `export LANG=ru_RU`.

English by default, Russian via `?lang=ru` on any URL.  
Everything switches: UI, terminal, `help`/`man`, flash messages, empty states, forms.  
The terminal picks up the language from the GUI — or switch on the fly: `export LANG=ru_RU`.

### 💬 Мессенджер с шифрованием / Encrypted messenger
Real-time polling, онлайн-статус, индикатор «печатает…», даты-разделители («Сегодня», «Вчера»),  
read receipts. **Все сообщения зашифрованы в базе** (Fernet, ключ от `SECRET_KEY`).

Real-time polling, online status, typing indicator, date separators, read receipts.  
**All messages encrypted at rest** (Fernet, key derived from `SECRET_KEY`).

### 🔔 Push-уведомления / Push notifications
Приходят, когда сайт закрыт — через Service Worker + Web Push API (VAPID).  
Новые сообщения, лайки, комментарии, подписки.

Arrive when the site is closed — via Service Worker + Web Push API.  
New messages, likes, comments, follows.

### 🎨 Интерфейс / GUI
Построен на **Bootstrap 5.3** — адаптивная сетка, карточки, модалки, тёмная тема  
(учитывает `prefers-color-scheme`), тэбы, формы, Bootstrap Icons.

Built on **Bootstrap 5.3** — responsive grid, cards, modals, dark theme  
(respects `prefers-color-scheme`), tabs, forms, Bootstrap Icons.

- Бесконечная лента с фильтром «Все / Подписки» / Infinite feed
- Лайки с pop + ripple анимацией / Like animations (Web Animations API)
- Комментарии с auto-expand textarea / Inline comments
- Закладки в сетке / Bookmarks grid
- Репосты / Reposts
- Lightbox для изображений / Image lightbox
- Загрузка аватаров с кропом 500×500 / Avatar upload with crop
- REST API (`/api/v1/posts`)

---

## Стек / Stack

| Слой | Технологии |
|------|-----------|
| **Backend** | Python 3.12, Flask, SQLAlchemy, Flask-Login, Flask-WTF, SQLite |
| **Frontend** | Jinja2, **Bootstrap 5.3**, Vanilla JS, CSS Custom Properties |
| **Security** | cryptography (Fernet), pywebpush (VAPID) |
| **Infra** | Alembic, Gunicorn |

---

<div align="center">

[MIT](LICENSE) · [github.com/stephanvoytov/rugram](https://github.com/stephanvoytov/rugram)

</div>
