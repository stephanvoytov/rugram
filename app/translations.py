"""Bilingual UI: English (default) + Russian translations."""

from flask import session

# English is the default — keys are English strings.
# Only provide Russian entries for user-facing messages.
RU: dict[str, str] = {
    # ── Flash messages ──
    'Logged in':             'Вход выполнен',
    'Login failed':          'Ошибка при входе',
    'Registered':            'Регистрация выполнена',
    'Registration failed':   'Ошибка при регистрации',
    'Registration successful! You can now log in.':
                             'Регистрация прошла успешно! Теперь вы можете войти.',
    'Registration failed. Please try again.':
                             'Ошибка при регистрации. Попробуйте снова.',
    'Logged out':            'Выход выполнен',
    'Comment text cannot be empty':
                             'Текст комментария не может быть пустым',
    'Username changed':      'Логин успешно изменён',
    'Email updated':         'Email обновлён',
    'Password changed':      'Пароль изменён',
    'Notifications enabled': 'Уведомления включены',
    'Notifications disabled':'Уведомления отключены',
    'Post published!':       'Пост опубликован',
    'Post updated!':         'Пост обновлён',
    'Post deleted':          'Пост удалён',
    'Comment added':         'Комментарий добавлен',
    'Comment edited':        'Комментарий изменён',
    'Comment deleted':       'Комментарий удалён',
    'Settings saved':        'Настройки сохранены',
    'Profile updated!':      'Профиль обновлён',
    'Account deleted':       'Аккаунт удалён',
    'Message sent':          'Сообщение отправлено',
    'Reported':              'Пожаловались',
    'Saved':                 'Сохранено',
    'Not following anyone yet': 'Пока ни на кого не подписан',
    'Unsaved':               'Удалено из сохранённого',

    # ── Validation / errors ──
    'Password must be at least 6 characters':
        'Пароль должен быть минимум 6 символов',
    'Passwords do not match':
        'Пароли не совпадают',
    'Invalid email address':
        'Неверный формат email',
    'Invalid email/username or password':
        'Неверная почта/логин или пароль',
    'This username is already taken':
        'Это имя пользователя уже занято',
    'This email is already registered':
        'Этот email уже зарегистрирован',
    'Current password is incorrect':
        'Неверный текущий пароль',
    'User not found':
        'Пользователь не найден',
    'Post not found':
        'Пост не найден',
    'You cannot follow yourself':
        'Нельзя подписаться на себя',
    'Access denied':
        'Доступ запрещён',
    'Message is required':
        'Введите сообщение',

    # ── Empty states ──
    'No saved posts':
        'Нет сохранённых постов',
    'No notifications':
        'Нет уведомлений',
    'No chats yet':
        'Нет сообщений',
    'No followers yet':
        'Пока нет подписчиков',
    'No comments yet. Be the first!':
        'Комментариев пока нет. Будьте первым!',
    'User has no posts yet':
        'Пользователь ещё не написал ни одного поста',

    # ── Auth ──
    'Remember me':
        'Запомнить меня',
    'Don\'t have an account?':
        'Нет аккаунта?',
    'Already have an account?':
        'Уже есть аккаунт?',
    'Forgot your password?':
        'Забыли пароль?',
    'Log in to leave a comment':
        'Войдите, чтобы оставить комментарий',

    # ── Misc ──
    'Type something...':
        'Напишите что-нибудь...',
    'Write a comment...':
        'Напишите комментарий...',
    'Search users...':
        'Поиск пользователей...',
    'Type a message...':
        'Напишите сообщение...',
    'Loading...':
        'Загрузка...',
    'has no posts yet':
        'пока нет постов',
    'No new notifications':
        'Нет новых уведомлений',
    'All notifications':
        'Все уведомления',
    'Error loading chats':
        'Ошибка загрузки чатов',
    'log in':
        'войти',
    'to leave a comment':
        'чтобы оставить комментарий',

    # ── TTY Help ──
    'TTY Terminal Reference':
        'Справочник TTY-терминала',
    'TTY (Teletype) is an alternative interface for Rugram. All functionality is available through a terminal emulator with commands like':
        'TTY (Teletype) — альтернативный интерфейс управления Rugram. Весь функционал доступен через эмуляцию терминала с командами',
    'cd, ls, grep, echo, man, history, export and more — each works as close as possible to a real Unix terminal.':
        'cd, ls, grep, echo, man, history, export и другие — каждая команда работает максимально близко к реальному Unix-терминалу.',
    'This mode is for those who prefer the keyboard: arrow key history, --help on every command.':
        'Режим для тех, кто привык к клавиатуре: история стрелками, --help на каждой команде.',
    'Open TTY':
        'Открыть TTY',
    'Keyboard Shortcuts':
        'Горячие клавиши',
    'Focus input':
        'Фокус ввода',
    'Show help':
        'Показать справку',
    'Command history':
        'История команд',
    'Autocomplete':
        'Автодополнение',
    'Blur input':
        'Снять фокус',
    'Per-command help':
        'Справка по команде',
    'Params':
        'Параметры',
    'Description':
        'Описание',
    'Example':
        'Пример',

    # ── TTY sections ──
    'Commands': 'Команды',
    'Command': 'Команда',
    'Key': 'Клавиша',
    'Auth': 'Авторизация',
    'Posts': 'Посты',
    'Social': 'Общение',
    'Navigation': 'Навигация',
    'Feed': 'Лента',
    'System': 'Система',

    # ── TTY intro fragments ──
    'Use the':
        'Используйте кнопку',
    'button in the top bar to open the terminal, or':
        'в верхней панели чтобы открыть терминал, или',
    'to return.':
        'чтобы вернуться.',
    'All commands are in English — type':
        'Все команды на английском — введите',
    'in the terminal to get started.':
        'в терминале чтобы начать.',
    'and more — each works as close as possible to a real Unix terminal.':
        'и другие — каждая команда работает максимально близко к реальному Unix-терминалу.',

    # ── TTY command descriptions ──
    'All commands behave like a real Unix terminal: cd, ls, grep, echo, man, history, export and more.':
        'все команды работают как в реальном Unix-терминале: cd, ls, grep, echo, man, history, export и другие.',
    'Sign in to your account': 'Войти в аккаунт',
    'Create a new account': 'Создать новый аккаунт',
    'Sign out': 'Выйти из аккаунта',
    'Like or unlike a post': 'Лайкнуть / убрать лайк',
    'Add a comment to a post': 'Оставить комментарий',
    'Save or unsave a post': 'Сохранить / убрать из сохранённого',
    'Follow a user': 'Подписаться на пользователя',
    'Unfollow a user': 'Отписаться от пользователя',
    'Show your profile (neofetch)': 'Показать свой профиль (neofetch)',
    'View any user profile': 'Посмотреть профиль пользователя',
    'Check if a user exists': 'Проверить, существует ли пользователь',
    'Navigate between sections': 'Навигация по разделам',
    'List files in current directory': 'Список файлов в текущем разделе',
    'Show current section': 'Показать текущий раздел',
    'Search posts in feed': 'Поиск по постам в ленте',
    'Show first N posts': 'Показать первые N постов',
    'Show last N posts': 'Показать последние N постов',
    'Show the feed': 'Показать ленту',
    'Clear terminal screen': 'Очистить терминал',
    'Switch back to GUI mode': 'Вернуться в GUI-режим',
    'Show this help': 'Показать эту справку',
    'Re-run the last command': 'Повторить последнюю команду',
    'Show current date and time': 'Показать текущую дату и время',
    'Show terminal session uptime': 'Показать время работы терминала',
    'Show or clear command history': 'Показать / очистить историю команд',
    'Print text with $VAR support': 'Вывести текст (поддержка $VAR)',
    'Show manual pages': 'Показать man-страницы',
    'Set or view environment variables': 'Установить / посмотреть переменные окружения',
    'Random programmer quote': 'Случайная цитата программиста',
    'Execute command repeatedly': 'Повторять команду с интервалом',
    'Live activity feed': 'Лента активности в реальном времени',
    'Edit a post or profile': 'Редактировать пост или профиль',
    'Go up one directory': 'На уровень выше',
    'Open a chat or start a new one': 'Открыть чат или начать новый',
    'Edit a post or profile (N.txt or description.txt)': 'Редактировать пост или профиль (N.txt или description.txt)',
    'Send a message in the current chat': 'Отправить сообщение в текущем чате',
    'Start a chat with a user': 'Начать чат с пользователем',

    # ── last_seen_str() ──
    'never': 'никогда',
    'online': 'онлайн',
    'yesterday': 'вчера',
    '%(minutes)s min ago': '%(minutes)s мин назад',
    '%(hours)s h ago': '%(hours)s ч назад',
    '%(days)s days ago': '%(days)s дн назад',

    # ── Audit fixes ──
    'Error updating profile':  'Ошибка при обновлении профиля',
    'Error updating post':     'Ошибка при обновлении поста',
    'Error updating settings': 'Ошибка при обновлении настроек',

    # ── About page ──
    'About Rugram': 'О проекте',
    'a social network you drive from a terminal. Like, comment, follow, search, and message — all without leaving the command line.':
        'социальная сеть, которой управляют из терминала. Лайки, комментарии, подписки, поиск и сообщения — не отрываясь от командной строки.',
    'Most social networks are endless feeds, buttons, and popups. Rugram is built for developers — everything is duplicated in the terminal.':
        'Большинство соцсетей — это бесконечные ленты, кнопки и попапы. Rugram спроектирован для разработчиков — всё продублировано терминалом.',
    'Full TTY terminal emulator in the browser —':
        'Полноценный эмулятор TTY-терминала в браузере —',
    'GUI on Bootstrap 5.3 styled in Catppuccin — dark/light theme, infinite scroll, animations':
        'GUI на Bootstrap 5.3 в стиле Catppuccin — тёмная/светлая тема, infinite scroll, анимации',
    'Bilingual UI — English and Russian, switch at any time':
        'Два языка — английский и русский, переключение в любой момент',
    'Real-time messenger with encryption at rest':
        'Мессенджер в реальном времени с шифрованием',
    'Push notifications via Web Push API':
        'Push-уведомления через Web Push API',
    'Image upload, bookmarks, reposts, REST API':
        'Загрузка изображений, закладки, репосты, REST API',
    'MIT License': 'Лицензия MIT',
    'Type': 'Введите',
    'in the terminal for your profile': 'в терминале чтобы увидеть свой профиль',

    # ── Help page ──
    'Rugram Help': 'Справка Rugram',
    'about': 'о проекте',
    'commands': 'команды',
    'filesystem': 'файловая система',
    'All commands are in English': 'Все команды на английском',
    'button in the top bar to open the terminal.': 'в верхней панели чтобы открыть терминал.',

    # ── VFS page ──
    'TTY File System': 'Файловая структура терминала',
    'Virtual File System reference for the Rugram TTY terminal': 'Файловая система TTY-терминала Rugram',
    'Navigate with': 'Используйте',
    'list with': 'для просмотра',
    'reads files': 'для чтения файлов',
    'edits': 'для редактирования',
    'Sections': 'Разделы',
    'post feed': 'лента постов',
    'post (cat, nano)': 'пост (cat, nano)',
    'metadata: likes, comments, time': 'метаданные (likes, comments, time)',
    'image as ASCII art': 'ASCII-арт изображения',
    'post comments': 'комментарии к посту',
    'saved posts (symlink → posts/)': 'сохранённые посты (symlink → posts/)',
    'post drafts': 'черновики',
    'recycle bin (rm without -f)': 'корзина (rm без -f)',
    'your profile (info, posts/)': 'профиль (info, posts/)',
    'bio and stats (cat, nano)': 'био и статистика (cat, nano)',
    'your posts': 'ваши посты',
    'user profile (info, posts/)': 'профиль пользователя (info, posts/)',
    'chat with user (live messages)': 'чат с пользователем (живые сообщения)',
    'incoming messages (N.msg)': 'входящие сообщения (N.msg)',
    'outgoing messages (N.msg)': 'исходящие сообщения (N.msg)',
    'followers (ls = list, cat @user = info)': 'подписчики (ls = список, cat @user = инфо)',
    'following (ls = list, cat @user = info)': 'подписки (ls = список, cat @user = инфо)',
    'notifications (ls = list, cat N = details)': 'уведомления (ls = список, cat N = детали)',
    'GUI mount points': 'точки монтирования GUI',
    'settings (cat = open GUI)': 'настройки (cat = открыть GUI)',
    'edit profile (cat = open GUI)': 'редактирование профиля (cat = открыть GUI)',
    'File types': 'Типы файлов',
    'File': 'Файл',
    'Key commands': 'Основные команды',
    'change directory': 'перейти в раздел',
    'list files': 'список файлов',
    'view file': 'просмотр файла',
    'edit file': 'редактирование',
    'remove (trash / permanent)': 'удаление (в корзину / навсегда)',
    'saved posts': 'сохранённые посты',
    'help & manuals': 'справка',
    'All functionality is available via the TTY terminal.': 'Вся функциональность доступна через TTY-терминал.',
    'Open TTY': 'Открыть TTY',
    'Help': 'Справка',
    'profile info (cat, nano)': 'информация профиля (cat, nano)',
    'post': 'пост',
    # ── Chat image support ──
    'Failed to process image': 'Не удалось обработать изображение',
    'Invalid file type':       'Недопустимый тип файла',
    'Invalid request':         'Недопустимый запрос',
    'Message cannot be empty': 'Сообщение не может быть пустым',
}


def _(text: str) -> str:
    """Translate text to the current session language, or return as-is (English)."""
    lang = session.get('lang', 'en')
    if lang == 'ru':
        return RU.get(text, text)
    return text
