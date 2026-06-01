# Rugram — социальная сеть на Flask

Социальная сеть с возможностью публикации постов, лайков, комментариев, подписок, поиска и настройки профиля.

## Функционал

- **Регистрация и авторизация** — вход по email или username, запоминание сессии
- **Лента постов** — с бесконечной подгрузкой (infinite scroll), фильтром «Все / Подписки»
- **Публикация постов** — с изображениями, редактирование и удаление
- **Лайки** — анимация pop + ripple через Web Animations API, единый обработчик
- **Комментарии** — inline-форма с auto-expand textarea, AJAX-отправка, удаление
- **Подписки** — AJAX follow/unfollow, страницы followers/following
- **Поиск** — по пользователям
- **Профиль** — смена аватарки, имени, описания; счётчики подписчиков/подписок
- **Тёмная тема** — переключатель в навбаре, сохраняется в localStorage, учитывает системные настройки
- **Lightbox** — просмотр изображений в полном размере, закрытие по Escape/клику
- **REST API** — `/api/v1/posts`

## Технологии

**Backend:** Python 3.12, Flask, SQLAlchemy, Flask-Login, Flask-WTF, SQLite  
**Frontend:** Jinja2, Bootstrap 5.3, Bootstrap Icons, чистый CSS/JS

## Установка

```bash
git clone https://github.com/stephanvoytov/rugram.git
cd rugram
python -m venv venv

# Windows:
venv\Scripts\activate
# Linux/Mac:
# source venv/bin/activate

pip install -r requirements.txt
echo 'SECRET_KEY=your-secret-key' > .env
python run.py
```

Откройте `http://localhost:5000`