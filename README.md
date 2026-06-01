# Rugram - фотохостинг на Flask
[![Flask](https://img.shields.io/badge/Flask-000000?logo=flask&logoColor=white)](https://flask.palletsprojects.com/) [![Stars](https://img.shields.io/github/stars/stephanvoytov/rugram)](https://github.com/stephanvoytov/rugram/stargazers)


## Описание проекта

Проект предоставляет полный функционал для создания фотохостинга с авторизацией, загрузкой изображений, лентой публикаций, лайками и комментариями.

## Основной функционал

- Регистрация и авторизация пользователей
- Загрузка и просмотр изображений
- Лента публикаций с сортировкой
- Лайки и комментарии
- Профили пользователей
- REST API для расширяемости

[В разработке]
- Панель администратора
- Система тегов
- Поиск по изображениям
- Продвинутые настройки приватности

## Технологический стек

**Backend:**
- Python 3.12
- Flask
- Flask-Login (аутентификация)
- SQLAlchemy (ORM)
- SQLite (база данных)

**Frontend:**
- Jinja2 (шаблонизатор)
- JavaScript (динамический контент)
- CSS (стилизация)

## Установка и запуск

1. Клонируйте репозиторий:
   ```bash
   git clone https://github.com/stephanvoytov/rugram.git
   cd rugram
   ```

2. Создайте виртуальное окружение:
   ```bash
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   # venv\Scripts\activate  # Windows
   ```

3. Установите зависимости:
   ```bash
   pip install -r requirements.txt
   ```

4. Настройте переменные окружения:
   Создайте файл `.env` с SECRET_KEY:
   ```bash
   echo 'SECRET_KEY=your-secret-key' > .env
   # Отредактируйте .env файл при необходимости
   ```

5. Запустите приложение:
   ```bash
   python run.py
   ```

Приложение будет доступно по адресу http://localhost:5000