![Flask](https://img.shields.io/badge/Flask-000000?logo=flask&logoColor=white)
![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Bootstrap 5.3](https://img.shields.io/badge/Bootstrap-5.3-712CF9?logo=bootstrap&logoColor=white)
![Stars](https://img.shields.io/github/stars/stephanvoytov/rugram)
[![Site](https://img.shields.io/badge/demo-rugram.mooo.com-89b4fa)](https://rugram.mooo.com)

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

## Команды

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

## Возможности

**Два языка (EN + RU)** — английский по умолчанию, русский через `?lang=ru` в любом URL.  
Переключается всё: интерфейс, терминал, `help`/`man`, флеш-сообщения, формы, пустые состояния.  
Или на лету: `export LANG=en_US`.

**Мессенджер с шифрованием** — real-time polling, онлайн-статус, индикатор «печатает…», даты-разделители («Сегодня», «Вчера»), отметки о прочтении. Все сообщения зашифрованы в базе (Fernet, ключ от `SECRET_KEY`).

**Push-уведомления** — через Service Worker + Web Push API (VAPID). Новые сообщения, лайки, комментарии, подписки — приходят, даже когда сайт закрыт.

**Интерфейс в стиле терминала** — Bootstrap 5.3 (сетка и утилиты) под кастомной темой Catppuccin. Бесконечная лента с фильтром «Все / Подписки», анимация лайков (Web Animations API), inline-комментарии с auto-expand textarea, закладки сеткой, репосты, тёмная/светлая тема (учитывает `prefers-color-scheme`), lightbox для изображений, загрузка аватара с кропом 500×500, адаптивный дизайн (mobile-first), REST API (`/api/v1/posts`).

---

## Стек

| Слой | Технологии |
|------|-----------|
| Backend | Python 3.12, Flask, SQLAlchemy, Flask-Login, Flask-WTF, SQLite |
| Frontend | Jinja2, **Bootstrap 5.3**, Vanilla JS, CSS Custom Properties (Catppuccin Mocha) |
| Security | cryptography (Fer­net), pywebpush (VAPID) |
| Infra | Alembic, Gunicorn |

---

[MIT](LICENSE) · [github.com/stephanvoytov/rugram](https://github.com/stephanvoytov/rugram)
