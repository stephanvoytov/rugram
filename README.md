# Rugram — социальная сеть на Flask
[![Flask](https://img.shields.io/badge/Flask-000000?logo=flask&logoColor=white)](https://flask.palletsprojects.com/) [![Stars](https://img.shields.io/github/stars/stephanvoytov/rugram)](https://github.com/stephanvoytov/rugram/stargazers)

Rugram — социальная сеть с мессенджером, уведомлениями, закладками и полным управлением аккаунтом.

## Функционал

### Основное
- **Регистрация и авторизация** — вход по email или username, запоминание сессии
- **Лента постов** — с бесконечной подгрузкой (infinite scroll), фильтром «Все / Подписки»
- **Публикация постов** — с изображениями, редактирование и удаление
- **Лайки** — анимация pop + ripple через Web Animations API, единый обработчик
- **Комментарии** — inline-форма с auto-expand textarea, AJAX-отправка, удаление и редактирование своих комментариев
- **Подписки** — AJAX follow/unfollow, страницы followers/following
- **Поиск** — по пользователям
- **Профиль** — смена аватарки, имени, описания; счётчики подписчиков/подписок

### Мессенджер
- **Личные сообщения** — создание чата, отправка/получение сообщений в реальном времени (polling)
- **Онлайн-статус** — отображение «онлайн» / «был(а) N мин назад» с зелёной точкой в списке чатов, динамическое обновление
- **«Печатает...»** — анимированный индикатор при наборе текста собеседником
- **Пагинация** — подгрузка старых сообщений при скролле вверх
- **Дата-разделители** — «Сегодня», «Вчера», «15 мая 2026» между группами сообщений
- **Прочитано** — отметка прочитанных сообщений (read receipts)
- **Шифрование** — все сообщения шифруются в БД (Fernet, ключ от SECRET_KEY)

### Уведомления
- **Система уведомлений** — лайки, комментарии, подписки; непрочитанные — бейдж в навбаре
- **Браузерные уведомления** — Notification API при новых сообщениях / лайках (когда вкладка не активна)
- **Дропдаун** — последние уведомления в выпадающем списке
- **Страница уведомлений** — полный список, отметка «прочитано»

### Прочее
- **Настройки** — смена email, пароля, удаление аккаунта с подтверждением
- **Закладки** — сохранение постов (`/saved`) с сеткой и пагинацией
- **Репосты** — счётчик репостов с переключателем
- **Тёмная тема** — переключатель в навбаре, сохраняется в localStorage, учитывает системные настройки
- **Lightbox** — просмотр изображений в полном размере, закрытие по Escape/клику
- **REST API** — `/api/v1/posts`

## Оптимизация

- **Изображения** — автоматический ресайз до 1200px при загрузке, превью 400px для ленты, JPEG quality 85, lazy loading
- **Кеширование** — версионирование CSS/JS (`?v=timestamp`), `defer` для скриптов
- **База данных** — все сообщения шифруются (Fernet), datetime-поля без timezone (совместимость с SQLite)

## Технологии

**Backend:** Python 3.12, Flask, SQLAlchemy, Flask-Login, Flask-WTF, SQLite, cryptography (Fernet)  
**Frontend:** Jinja2, Bootstrap 5.3, Bootstrap Icons, чистый CSS/JS  

## Быстрый старт (Docker)

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/stephanvoytov/rugram.git
cd rugram

# 2. Создайте .env с секретным ключом
python -c "import secrets; print(f'SECRET_KEY={secrets.token_hex(32)}')" > .env

# 3. Создайте директории для данных
mkdir -p instance uploads

# 4. Соберите и запустите
docker compose up -d --build
```

Сайт будет доступен на **http://localhost:8000**.

Для production за контейнером поставьте reverse proxy (Caddy, Nginx) на порт `8000`.

### Переменные окружения (.env)

| Переменная | Обязательно | По умолчанию | Описание |
|------------|-------------|-------------|----------|
| `SECRET_KEY` | ✅ | — | Ключ для подписи сессий и шифрования сообщений |

### Volumes

| Путь в контейнере | Назначение |
|-------------------|------------|
| `/app/instance` | SQLite база данных |
| `/app/app/static/uploads` | Загруженные изображения (аватарки, посты) |

### Миграции БД (Alembic)

При изменении моделей БД:

```bash
# Создать новую миграцию
alembic revision --autogenerate -m "описание изменений"

# Накатить
alembic upgrade head

# Откатить на одну
alembic downgrade -1
```

Миграции накатываются автоматически при старте контейнера (через `start.sh`).

### Обновление

```bash
git pull
docker compose up -d --build
```

### Логи

```bash
docker compose logs -f
```

## Локальная разработка

```bash
git clone https://github.com/stephanvoytov/rugram.git
cd rugram
python -m venv venv

# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt
python -c "import secrets; print(f'SECRET_KEY={secrets.token_hex(32)}')" > .env
alembic upgrade head
python run.py
```

Откройте `http://localhost:5000`
