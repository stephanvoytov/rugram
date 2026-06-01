# Rugram — социальная сеть на Flask
[![Flask](https://img.shields.io/badge/Flask-000000?logo=flask&logoColor=white)](https://flask.palletsprojects.com/) [![Stars](https://img.shields.io/github/stars/stephanvoytov/rugram)](https://github.com/stephanvoytov/rugram/stargazers) [![Deployed on PythonAnywhere](https://img.shields.io/badge/Deployed%20on-PythonAnywhere-1DA1F2)](https://pythonanywhere.com)

🔗 **https://stephanv.pythonanywhere.com/**

Rugram — социальная сеть с мессенджером, уведомлениями, закладками и полным управлением аккаунтом.

## Функционал

### Основное
- **Регистрация и авторизация** — вход по email или username, запоминание сессии
- **Лента постов** — с бесконечной подгрузкой (infinite scroll), фильтром «Все / Подписки»
- **Публикация постов** — с изображениями, редактирование и удаление
- **Лайки** — анимация pop + ripple через Web Animations API, единый обработчик
- **Комментарии** — inline-форма с auto-expand textarea, AJAX-отправка, удаление и **редактирование** своих комментариев
- **Подписки** — AJAX follow/unfollow, страницы followers/following
- **Поиск** — по пользователям
- **Профиль** — смена аватарки, имени, описания; счётчики подписчиков/подписок

### Мессенджер
- **Личные сообщения** — создание чата, отправка/получение сообщений в реальном времени (polling)
- **Онлайн-статус** — отображение «онлайн» / «был(а) N мин назад» с зелёной точкой в списке чатов, динамическое обновление
- **«Печатает...»** — анимированный индикатор при наборе текста собеседником
- **Пагинация** — подгрузка старых сообщений при скролле вверх
- **Дата-разделители** — «Сегодня», «Вчера», «15 мая 2026» между группами сообщений
- **Шифрование** — все сообщения шифруются в БД (Fernet, ключ от SECRET_KEY)

### Уведомления
- **Система уведомлений** — лайки, комментарии, подписки; непрочитанные — бейдж в навбаре
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
**Хостинг:** Сайт работает на PythonAnywhere

## Установка (локальная)

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
python run.py
```

Откройте `http://localhost:5000`

## Деплой

### PythonAnywhere (рекомендую, самый простой)

1. Зарегистрируйтесь на [pythonanywhere.com](https://www.pythonanywhere.com)
2. Откройте **Dashboard → Consoles → Bash**
3. Клонируйте репозиторий:
   ```bash
   git clone https://github.com/stephanvoytov/rugram.git
   cd rugram
   ```
4. Создайте виртуальное окружение и установите зависимости:
   ```bash
   python3.12 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
5. Создайте `.env` с автоматически сгенерированным ключом:
   ```bash
   python -c "import secrets; print(f'SECRET_KEY={secrets.token_hex(32)}')" > .env
   ```
6. Создайте директорию для данных:
   ```bash
   mkdir -p ~/rugram/instance
   ```
7. Откройте **Web → Add new web app → Manual configuration → Python 3.12**
8. В **Code**:
   - Source code: `/home/ваш-username/rugram`
   - Working directory: `/home/ваш-username/rugram`
9. В **WSGI configuration file**:
   ```python
   import sys
   sys.path.insert(0, '/home/ваш-username/rugram')
   from wsgi import application
   ```
10. Нажмите **Reload** — готово 🎉

### Fly.io

```bash
# Установите flyctl: https://fly.io/docs/hands-on/install-flyctl/
fly launch
fly secrets set SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
fly deploy
```

Стартовая команда (в `Dockerfile`): `gunicorn --bind 0.0.0.0:5000 wsgi:app`

### Render

1. Fork репозитория на GitHub
2. На [render.com](https://render.com) → **New + Web Service** → подключите репозиторий
3. **Settings**:
   - Runtime: Python 3
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn wsgi:app`
4. **Environment Variables**: `SECRET_KEY=your-secret-key`
5. **Deploy** — готово (первый запуск ~3 мин, потом холодный старт ~30 сек)
