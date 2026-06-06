![Flask](https://img.shields.io/badge/Flask-000000?logo=flask&logoColor=white)
![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Bootstrap 5.3](https://img.shields.io/badge/Bootstrap-5.3-712CF9?logo=bootstrap&logoColor=white)
![Stars](https://img.shields.io/github/stars/stephanvoytov/rugram)
[![Site](https://img.shields.io/badge/demo-rugram.mooo.com-89b4fa)](https://rugram.mooo.com)

[← English version](README.md)

# Rugram — социальная сеть внутри терминала

**Соцсеть, в которой всё делается с клавиатуры.**  
Обычный GUI тоже есть — для тех, кто не дружит с командной строкой.

→ **[rugram.mooo.com](https://rugram.mooo.com)** — живой демо-инстанс

```bash
# Поставить лайк
like 42
# Написать в личку
cd chat @alice
say привет!
# Найти пост по теме
grep "flask"
# Посмотреть профиль
neofetch @alice
# Отредактировать шапку
nano description.txt
# Проверить, онлайн ли пользователь
ping @bob
# Смотреть ленту в реальном времени
watch -n 5 feed
```

Это **не игрушечная консоль**. Это полноценный эмулятор терминала в браузере: `--help` на каждой команде, автодополнение по Tab, история стрелками, `Ctrl+R` обратный поиск, `Ctrl+L` очистка, конвейер из команд (`like 42 | echo liked`), и boot-анимация Matrix Rain.

Каждая страница GUI отображается на путь в файловой системе:  
`cd /feed` → лента, `cd /chat/@alice` → диалог, `cd /settings` → настройки.

Интерфейс построен на **Bootstrap 5.3** (сетка, алерты, тёмная тема, выпадающие списки, иконки), но стилизован полностью в **Catppuccin Mocha** со шрифтом **JetBrains Mono** — даже GUI выглядит как терминал. Кнопки в `[квадратных скобках]`, модалки минималистичные, всё моноширинное.

---

## Быстрый старт

```bash
git clone https://github.com/stephanvoytov/rugram
cd rugram

# Сгенерировать SECRET_KEY (обязательно)
python -c "import secrets; print(f'SECRET_KEY={secrets.token_hex(32)}')" > .env

# Установить зависимости
pip install -r requirements.txt

# Засеять демо-данные (alice/pass123, bob/pass123)
python seed.py

# Запустить dev-сервер
python run.py
# → http://localhost:5000
```

### Продакшн (Docker)

```bash
docker compose up -d
# → http://localhost:8000 (gunicorn)
```

---

## Команды (неполный список — полный через `help` в терминале)

| Команда | Что делает |
|---------|-----------|
| `help`, `man <cmd>` | Список команд / документация |
| `login`, `register`, `logout` | Вход / регистрация / выход |
| `like <id>`, `comment <id> текст` | Лайки и комментарии |
| `follow @user`, `unfollow @user` | Подписки |
| `bookmark <id>` | Сохранить пост |
| `cd chat @user` | Открыть диалог |
| `say <text>` | Отправить сообщение |
| `grep <запрос>` | Поиск постов |
| `neofetch @user` | Профиль с ASCII-артом из аватарки |
| `nano <файл>` | Редактор постов и профиля |
| `create <текст>` | Создать пост |
| `cat <id>`, `less <id>` | Прочитать пост |
| `watch -n 5 feed` | Автообновление ленты |
| `export LANG=en_US` | Переключить язык на лету |
| `ping @user` | Проверить, существует ли пользователь |
| `feed`, `saved` | Просмотр постов |
| `followers @user`, `following @user` | Списки подписчиков |
| `rm <id>` | Удалить свой пост |
| `clear`, `pwd`, `echo`, `date`, `history` | Классика Unix |
| `uptime`, `top`, `whoami`, `id`, `info` | Информация о системе |
| `fortune`, `alias`, `source` | Фичи шелла |
| `gui` / `exit` | Переключиться обратно в GUI |

---

## Архитектура

```
app/
├── routes/           # 3 blueprint: auth, main, posts + admin
│   ├── helpers.py    # Утилиты (обработка изображений, cursor-пагинация, system events)
│   └── admin.py      # Панель администратора (пользователи, посты, теги, события, логи)
├── resources/        # REST API (/api/v1/posts)
├── services/         # Слой бизнес-логики (планируется)
├── models.py         # SQLAlchemy модели (User, Post, Chat, Message, …)
├── logger.py         # Структурированное логирование (structlog → консоль + файл + БД)
├── crypto.py         # Шифрование чата (Fernet/MultiFernet)
├── push.py           # Web Push уведомления (VAPID)
├── limiter.py        # Rate limiting
├── translations.py   # Перевод EN/RU
├── forms.py          # WTForms
├── filters.py        # Jinja2 фильтры
├── templates/        # Шаблоны (auth, main, posts, errors, admin)
└── static/           # CSS, JS (эмулятор терминала), uploads, sw.js
```

### Тесты

```
81 тест Python (pytest) + 319 тестов JS (Node/JSDOM)
Всё зелёное:
  python -m pytest tests/ -n auto -q
  node tests/test_terminal.js
```

### API документация

Swagger/OpenAPI доступен по `/apidocs/` на запущенном сервере.

---

## Возможности

**Два языка (EN + RU)** — английский по умолчанию, русский через `?lang=ru`.  
Переводятся флеш-сообщения, пустые состояния, формы, страницы помощи. Переключить на лету: `export LANG=en_US`.

**Мессенджер с шифрованием** — real-time polling, онлайн-статус, индикатор «печатает…», отметки о прочтении, отправка изображений. Все сообщения зашифрованы в БД (Fernet, поддержка key rotation).

**Push-уведомления** — через Service Worker + Web Push API (VAPID). Новые сообщения, лайки, комментарии, подписки.

**Интерфейс в стиле терминала** — Bootstrap 5.3 + Catppuccin Mocha. Бесконечная лента, анимация лайков, inline-комментарии, закладки, репосты, тёмная/светлая тема, lightbox, загрузка аватара, mobile-first.

**REST API** — `/api/v1/posts`, `/api/feed`, `/api/notifications`, `/api/saved`.  
Cursor-based пагинация, JSON-ответы.

**Панель администратора** — `/admin/`: дашборд со статистикой, управление пользователями/постами, системные события, просмотр логов.

---

## Стек

| Слой | Технологии |
|------|-----------|
| Backend | Python 3.12, Flask, SQLAlchemy, Flask-Login, Flask-WTF, SQLite |
| Frontend | Jinja2, Bootstrap 5.3, Vanilla JS, CSS Custom Properties (Catppuccin Mocha) |
| Security | cryptography (Fernet), pywebpush (VAPID), Flask-Limiter |
| Логирование | structlog (консоль + ротируемый JSON + SystemEvent в БД) |
| Инфра | Alembic, Gunicorn, Docker Compose |
| Тесты | pytest (xdist), Node.js (JSDOM) |

---

[MIT](LICENSE) · [github.com/stephanvoytov/rugram](https://github.com/stephanvoytov/rugram)
