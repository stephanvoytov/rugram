// ── Rugram Terminal — Help & Man Pages ──
(function(T) {
  'use strict';

  // ── Fortune quotes ──
  T.fortuneQuotes.push(
    '"В любой непонятной ситуации — sudo !!".',
    '"There are 10 types of people: those who understand binary and those who don\'t."',
    '"Если код работает — лучше его не трогать."',
    '"It\'s not a bug, it\'s an undocumented feature."',
    '"Настоящие программисты не пишут документацию."',
    '"Before software can be reusable it first has to be usable."',
    '"git push --force — это способ переписать историю."',
    '"The best way to get a project done faster is to start sooner."',
    '"Чинить баги — это как искать иголку в стоге сена."',
    '"Measuring programming progress by lines of code is like measuring aircraft building progress by weight."',
    '"Рефакторинг — перекладывание грязи из одной кучи в другую."',
    '"First, solve the problem. Then, write the code."',
    '"Документация — когда код настолько плох, что его нужно объяснять."',
    '"Code is like humor. When you have to explain it, it\'s bad."',
    '"Это не баг, это фича!"',
    '"Simplicity is prerequisite for reliability."',
    '"Я не отлаживаю, я пишу новый код без багов."',
    '"Any fool can write code that a computer can understand. Good programmers write code that humans can understand."',
    '"Сделал дело — перезагрузи сервер."',
    '"Talk is cheap. Show me the code."'
  );

  // ── Man pages ──
  T.manPages = {
    ls: [
      'LS(1)                         User Commands                        LS(1)',
      '',
      'NAME',
      '    ls — list directory contents',
      '',
      'SYNOPSIS',
      '    ls [-l] [dir]',
      '',
      'DESCRIPTION',
      '    List files in the current directory. Shows posts',
      '    as files (&lt;id&gt;.post) in /posts and /profile/posts.',
      '    Use -l for detailed view with permissions and sizes.',
      '',
      '    In home (~), shows all available directories.',
      '',
      'EXAMPLES',
      '    ls            list files in current dir',
      '    ls -l         detailed list',
      '    ls posts      list posts',
      '    ls -l posts   detailed post list',
    ],
    echo: [
      'ECHO(1)                      User Commands                      ECHO(1)',
      '',
      'NAME',
      '    echo — display a line of text',
      '',
      'SYNOPSIS',
      '    echo [string]',
      '',
      'DESCRIPTION',
      '    Print the given string to terminal.',
      '    Supports $VAR substitution from environment.',
      '',
      'EXAMPLES',
      '    echo Hello World',
      '    echo $LANG',
    ],
    date: [
      'DATE(1)                      User Commands                      DATE(1)',
      '',
      'NAME',
      '    date — display current date and time',
      '',
      'SYNOPSIS',
      '    date [-u]',
      '',
      'DESCRIPTION',
      '    Show current system date and time.',
      '    -u  display UTC time',
      '',
      'EXAMPLES',
      '    date',
      '    date -u',
    ],
    history: [
      'HISTORY(1)                   User Commands                   HISTORY(1)',
      '',
      'NAME',
      '    history — command history',
      '',
      'SYNOPSIS',
      '    history [-c]',
      '',
      'DESCRIPTION',
      '    Display the command history list.',
      '    -c  clear the history list',
      '',
      'EXAMPLES',
      '    history     show all commands',
      '    history -c  clear history',
    ],
    uptime: [
      'UPTIME(1)                    User Commands                    UPTIME(1)',
      '',
      'NAME',
      '    uptime — show how long system has been running',
      '',
      'SYNOPSIS',
      '    uptime',
      '',
      'DESCRIPTION',
      '    Display current time, uptime, user count, and load.',
    ],
    man: [
      'MAN(1)                       User Commands                       MAN(1)',
      '',
      'NAME',
      '    man — format and display manual pages',
      '',
      'SYNOPSIS',
      '    man [-k] [command]',
      '',
      'DESCRIPTION',
      '    Display the manual page for a command.',
      '    -k  list all available commands',
      '',
      'EXAMPLES',
      '    man ls      show ls manual',
      '    man -k      list all commands',
    ],
    export: [
      'EXPORT(1)                    User Commands                    EXPORT(1)',
      '',
      'NAME',
      '    export — set environment variable',
      '',
      'SYNOPSIS',
      '    export [VAR[=value]]',
      '',
      'DESCRIPTION',
      '    Set an environment variable or list all.',
      '',
      'VARIABLES',
      '    LANG    language (ru_RU / en_US)',
      '    EDITOR  editor (vim)',
      '    THEME   color theme (dark / light)',
      '    MATRIX  boot animation (0/1)',
      '',
      'EXAMPLES',
      '    export                 list all vars',
      '    export LANG=en_US     set language to English',
      '    export THEME=light     switch to light theme',
    ],
    fortune: [
      'FORTUNE(1)                   User Commands                   FORTUNE(1)',
      '',
      'NAME',
      '    fortune — print a random, hopefully interesting, adage',
      '',
      'SYNOPSIS',
      '    fortune',
      '',
      'DESCRIPTION',
      '    Display a random programming quote or saying.',
    ],
    ping: [
      'PING(1)                      User Commands                      PING(1)',
      '',
      'NAME',
      '    ping — send ICMP probes to a user or localhost',
      '',
      'SYNOPSIS',
      '    ping [@user]',
      '',
      'DESCRIPTION',
      '    Send 4 ICMP ECHO_REQUEST packets to localhost (no args)',
      '    or to a remote user. Displays RTT, TTL, and packet loss.',
      '    On completion shows min/avg/max/mdev statistics.',
      '',
      'BEHAVIOR',
      '    Without argument — pings 127.0.0.1 (RTT 0.2–2.2 ms, TTL=64).',
      '    With @user — resolves user via API, then sends 4 probes,',
      '      showing decreasing TTL and real round-trip times.',
      '    If user not found — all 4 probes show Destination Unreachable.',
      '',
      'EXAMPLES',
      '    ping            ping localhost (4 packets)',
      '    ping @alice     ping user @alice',
    ],
    watch: [
      'WATCH(1)                     User Commands                     WATCH(1)',
      '',
      'NAME',
      '    watch — execute command periodically',
      '',
      'SYNOPSIS',
      '    watch [-n seconds] <command>',
      '    watch stop',
      '',
      'DESCRIPTION',
      '    Run the given command repeatedly.',
      '    -n N   interval in seconds (default 3)',
      '    stop   stop current watch',
      '',
      'EXAMPLES',
      '    watch feed          refresh feed every 3s',
      '    watch -n 5 feed     refresh feed every 5s',
      '    watch stop          stop watching',
    ],
    head: [
      'HEAD(1)                      User Commands                      HEAD(1)',
      '',
      'NAME',
      '    head — output the first part of the feed',
      '',
      'SYNOPSIS',
      '    head [-n N]',
      '',
      'DESCRIPTION',
      '    Show the first N posts (default 5).',
      '',
      'EXAMPLES',
      '    head         first 5 posts',
      '    head -n 10   first 10 posts',
    ],
    tail: [
      'TAIL(1)                      User Commands                      TAIL(1)',
      '',
      'NAME',
      '    tail — output the last part of the feed',
      '',
      'SYNOPSIS',
      '    tail [-n N]',
      '',
      'DESCRIPTION',
      '    Show the last N posts (default 5).',
      '',
      'EXAMPLES',
      '    tail         last 5 posts',
      '    tail -n 10   last 10 posts',
    ],
    top: [
      'TOP(1)                       User Commands                       TOP(1)',
      '',
      'NAME',
      '    top — display live activity feed',
      '',
      'SYNOPSIS',
      '    top',
      '',
      'DESCRIPTION',
      '    Show real-time activity with auto-refresh.',
      '    Press any key to exit top mode.',
    ],
    cd: [
      'CD(1)                        User Commands                        CD(1)',
      '',
      'NAME',
      '    cd — change current directory (does NOT show content)',
      '',
      'SYNOPSIS',
      '    cd [section | @user | .. | post/N]',
      '',
      'DESCRIPTION',
      '    cd only changes $PWD. Use the corresponding',
      '    program command to view content: feed, saved,',
      '    followers, following, cat, less.',
      '',
      'DIRECTORIES',
      '    posts           all posts',
      '    saved           saved posts',
      '    drafts          drafts directory',
      '    trash           recycle bin',
      '    followers       followers list',
      '    following       following list',
      '    notifications   notifications',
      '    profile         my profile',
      '    chat            messages',
      '    users/@name     user profile',
      '    mnt             GUI mount points',
      '',
      'EXAMPLES',
      '    cd posts        go to /posts',
      '    posts           show all posts (program)',
      '    feed --tail 10  show last 10 posts',
      '    feed --search cat  search posts',
      '    feed --less     browse interactively',
      '    ls              list files in current dir',
      '    cat 42          show post #42',
      '    less            page current dir',
      '    cd ..           go up',
      '    cd              go home',
    ],
    follow: [
      'FOLLOW(1)                    User Commands                    FOLLOW(1)',
      '',
      'NAME',
      '    follow, unfollow — subscribe to user',
      '',
      'SYNOPSIS',
      '    follow @user',
      '    unfollow @user',
      '',
      'DESCRIPTION',
      '    Subscribe or unsubscribe from a user.',
    ],
    login: [
      'LOGIN(1)                     User Commands                     LOGIN(1)',
      '',
      'NAME',
      '    login — authenticate to the system',
      '',
      'SYNOPSIS',
      '    login <username> <password>',
      '',
      'DESCRIPTION',
      '    Log in with username/email and password.',
    ],
    register: [
      'REGISTER(1)                  User Commands                  REGISTER(1)',
      '',
      'NAME',
      '    register — create a new account',
      '',
      'SYNOPSIS',
      '    register <username> <email> <password>',
      '',
      'DESCRIPTION',
      '    Create a new user account.',
    ],
    cat: [
      'CAT(1)                       User Commands                       CAT(1)',
      '',
      'NAME',
      '    cat — show post content or file contents',
      '',
      'SYNOPSIS',
      '    cat <id>',
      '    cat <path>',
      '    cat <id> --img',
      '',
      'DESCRIPTION',
      '    Display the contents of a post or file.',
      '    Resolves paths against the current directory.',
      '    --img  show post image as ASCII art',
      '',
      'EXAMPLES',
      '    cat 42              show post #42',
      '    cat 42 --img        show post #42 with image',
      '    cat .meta           show post metadata (in post dir)',
      '    cat profile/info    show profile info',
    ],
    nano: [
      'NANO(1)                      User Commands                      NANO(1)',
      '',
      'NAME',
      '    nano — terminal text editor for posts and profile',
      '',
      'SYNOPSIS',
      '    nano <path>',
      '    nano /profile/info',
      '    nano /posts/42.post',
      '',
      'DESCRIPTION',
      '    Opens a full-screen editor. Paths are resolved against',
      '    the current directory (cd profile, cd posts).',
      '',
      'FILES',
      '    profile/info      edit profile bio',
      '    posts/N.post      edit post #N',
      '',
      'KEYS',
      '    ^O     save changes',
      '    ^X     exit (if no unsaved changes)',
      '    ^C     cancel and close',
      '    ^G     toggle help',
    ],
    rm: [
      'RM(1)                        User Commands                        RM(1)',
      '',
      'NAME',
      '    rm — remove posts or comments',
      '',
      'SYNOPSIS',
      '    rm [-f] <id>',
      '    rm comment <id>',
      '    rm <path>',
      '',
      'DESCRIPTION',
      '    Remove a post or comment. Posts move to /trash by default.',
      '    -f  permanently delete (skip trash)',
      '',
      'EXAMPLES',
      '    rm 42          move post #42 to trash',
      '    rm -f 42       permanently delete post #42',
      '    rm comment 5   delete comment #5',
    ],
    feed: [
      'FEED(1)                      User Commands                      FEED(1)',
      '',
      'NAME',
      '    feed — show the post feed',
      '',
      'SYNOPSIS',
      '    feed [--tail N] [--page N] [--search text] [--by @user] [--inline]',
      '',
      'DESCRIPTION',
      '    Display posts from users you follow.',
      '    By default opens the interactive pager (less-like).',
      '',
      'FLAGS',
      '    --tail N       show last N posts',
      '    --page N       show page N (10 per page)',
      '    --search text  filter posts by text',
      '    --by @user     filter posts by author',
      '    --inline       render inline (no pager)',
      '',
      'EXAMPLES',
      '    feed                open feed in pager',
      '    feed --tail 5       show last 5 posts inline',
      '    feed --search cat   search for "cat"',
      '    feed --by @alice    filter by alice',
    ],
    saved: [
      'SAVED(1)                     User Commands                     SAVED(1)',
      '',
      'NAME',
      '    saved — show bookmarked posts',
      '',
      'SYNOPSIS',
      '    saved [--less]',
      '',
      'DESCRIPTION',
      '    Show posts you have bookmarked.',
      '    --less  open in interactive pager mode',
      '',
      'EXAMPLES',
      '    saved           show saved posts',
      '    saved --less    browse interactively',
    ],
    notifications: [
      'NOTIFICATIONS(1)             User Commands             NOTIFICATIONS(1)',
      '',
      'NAME',
      '    notifications — show notifications',
      '',
      'SYNOPSIS',
      '    notifications',
      '',
      'DESCRIPTION',
      '    Show your latest notifications.',
    ],
    create: [
      'CREATE(1)                    User Commands                    CREATE(1)',
      '',
      'NAME',
      '    create — create a new post',
      '',
      'SYNOPSIS',
      '    create',
      '',
      'DESCRIPTION',
      '    Open the post creation window.',
      '    Shortcut: nano without arguments also creates a post.',
    ],
  };

  // ── Show brief help for specific command (--help) ──
  T.showCmdHelp = function(cmdName) {
    var aliasMap = {
      gui: 'cd', exit: 'cd',
    };
    var name = aliasMap[cmdName.toLowerCase()] || cmdName.toLowerCase();
    var page = T.manPages[name];
    if (!page) {
      T.addOutputLine('<span class="tp-err">No manual entry for "' + T.escapeHtml(cmdName) + '"</span>');
      T.addOutputLine('<span class="tp-desc"># <span class="tp-cmd">man -k</span> — list all commands</span>');
      return;
    }
    T.addSysLine('<span class="tp-section">--help: ' + T.escapeHtml(cmdName) + '</span>');
    for (var i = 0; i < page.length; i++) {
      var line = page[i];
      if (line === 'DESCRIPTION' || line === 'EXAMPLES' || line === 'SECTIONS' || line === 'VARIABLES') break;
      T.addOutputLine('<span class="tp-man-line">' + T.escapeHtml(line) + '</span>');
    }
  };

  // ── COMMAND: help [command] ──
  T.cmdHelp = function(args) {
    args = (args || '').trim();
    if (args) {
      T.showCmdHelp(args);
      return;
    }
    T.addOutputLine('<span class="tp-section">' + T._('Rugram Terminal — Commands Reference', 'Rugram Terminal — Commands Reference') + '</span>');
    T.addOutputLine('<span class="tp-muted">' + T._('Формат: команда  [параметры]  — описание', 'Format: command  [params]  — description') + '</span>');
    T.addOutputLine('');

    function printCategory(title, cmds) {
      T.addOutputLine('<span class="tp-section">-- ' + title + ' --</span>');
      cmds.forEach(function(c) {
        var cmd = T.escapeHtml(c[0]);
        var params = c[1] ? ' <span class="tp-muted">' + T.escapeHtml(c[1]) + '</span>' : '';
        T.addOutputLine('  ' + cmd + params + '<span class="tp-desc"> — ' + c[2] + '</span>');
      });
    }

    printCategory(T._('Авторизация', 'Auth'), [
      ['login', '<user> <pass>', T._('Войти в аккаунт', 'Sign in to your account')],
      ['register', '<user> <email> <pass>', T._('Создать аккаунт', 'Create a new account')],
      ['logout', '', T._('Выйти из аккаунта', 'Sign out')],
    ]);
    T.addOutputLine('');

    printCategory(T._('Посты', 'Posts'), [
      ['like', '<id>', T._('Лайкнуть/убрать лайк', 'Like or unlike a post')],
      ['comment', '<id> "<text>"', T._('Добавить комментарий', 'Add a comment to a post')],
      ['bookmark', '<id>', T._('Сохранить/убрать пост', 'Save or unsave a post')],
      ['rm', '[-f] <id>', T._('Удалить пост (в корзину)', 'Remove a post (to trash)')],
      ['create', '', T._('Новый пост', 'Create a new post')],
      ['nano', '<path>', T._('Редактор (posts/N.post, profile/info)', 'Edit a post or profile')],
    ]);
    T.addOutputLine('');

    printCategory(T._('Социальное', 'Social'), [
      ['follow', '@<user>', T._('Подписаться', 'Follow a user')],
      ['unfollow', '@<user>', T._('Отписаться', 'Unfollow a user')],
      ['whoami', '', T._('Мой профиль', 'Show your profile')],
      ['neofetch', '@<user>', T._('Профиль пользователя', 'View any user profile')],
      ['id', '[user]', T._('Информация о пользователе', 'Show user info (uid, groups)')],
      ['ping', '[@user]', T._('Проверить доступность', 'Check if a user exists')],
    ]);
    T.addOutputLine('');

    printCategory(T._('Навигация (файловая система)', 'Navigation (filesystem)'), [
      ['ls', '[-l] [dir]', T._('Файлы в текущей директории', 'List files in current directory')],
      ['cd', '<section>', T._('Перейти в раздел (posts, saved, profile…)', 'Change directory')],
      ['pwd', '', T._('Текущая директория', 'Show current directory')],
      ['info', '', T._('Структура и описание TTY', 'Filesystem structure and CLI overview')],
    ]);
    T.addOutputLine('');

    printCategory(T._('Программы', 'Programs'), [
      ['feed', '[--tail N] [--search text]', T._('Лента постов', 'Show the post feed')],
      ['saved', '[--less]', T._('Сохранённые посты', 'Show saved posts')],
      ['followers', '[--of @user]', T._('Подписчики', 'Show followers')],
      ['following', '[--of @user]', T._('Подписки', 'Show following')],
      ['notifications', '', T._('Уведомления', 'Show notifications')],
      ['cat', '<id> | <path>', T._('Показать содержимое', 'View a post or file')],
      ['less', '<path>', T._('Интерактивный просмотр', 'Interactive pager (j/k, /, q)')],
      ['grep', '"<text>"', T._('Поиск по ленте', 'Search posts in feed')],
    ]);
    T.addOutputLine('');

    printCategory(T._('Чат', 'Chat'), [
      ['chat', '[<id>]', T._('Список диалогов / открыть диалог', 'List conversations / open conversation')],
      ['say', '<text>', T._('Отправить сообщение', 'Send a message in current chat')],
      ['start', '@<user>', T._('Начать чат с пользователем', 'Start a chat with a user')],
    ]);
    T.addOutputLine('');

    printCategory(T._('Система', 'System'), [
      ['clear', '', T._('Очистить экран', 'Clear terminal')],
      ['gui / exit', '', T._('В GUI режим', 'Switch to GUI mode')],
      ['help', '[command]', T._('Эта справка / справка по команде', 'Show help / command help')],
      ['man', '[-k] [command]', T._('Руководство', 'Show manual pages')],
      ['date', '[-u]', T._('Дата и время', 'Show date and time')],
      ['uptime', '', T._('Время работы', 'Show terminal uptime')],
      ['history', '[-c]', T._('История команд', 'Show or clear history')],
      ['echo', '<text>', T._('Вывести текст', 'Print text')],
      ['export', '[VAR=value]', T._('Переменные окружения', 'Environment variables')],
      ['alias', '[name=cmd]', T._('Псевдонимы команд', 'Command aliases')],
      ['source', '<name>', T._('Выполнить скрипт', 'Run a saved script')],
      ['sudo !!', '', T._('Повторить команду', 'Re-run last command')],
      ['fortune', '', T._('Случайная цитата', 'Random quote')],
      ['watch', '[-n N] <cmd>', T._('Повторять команду', 'Repeat command')],
      ['top', '', T._('Активность в реальном времени', 'Live activity feed')],
    ]);
    T.addOutputLine('');

    var langLabel = T.env.LANG && T.env.LANG.startsWith('ru') ? 'RU' : 'EN';
    T.addOutputLine('<span class="tp-muted"># <span class="tp-cmd">man &lt;command&gt;</span> ' + T._('для подробной справки', 'for detailed manual') + '  |  <span class="tp-cmd">export LANG=en_US</span> — ' + T._('язык', 'language') + ': ' + langLabel + '</span>');
    T.addOutputLine('<span class="tp-muted"># <span class="tp-cmd">/</span> ' + T._('фокус ввода', 'focus input') + '  <span class="tp-cmd">?</span> help  <span class="tp-cmd">↑↓</span> ' + T._('история', 'history') + '  <span class="tp-cmd">Esc</span> blur</span>');
  };

  // ── COMMAND: info — structure and CLI overview ──
  T.cmdInfo = function() {
    T.addSysLine('<span class="tp-section">' + T._('Rugram Terminal — файловая система и команды', 'Rugram Terminal — filesystem & commands') + '</span>');
    T.addOutputLine('');
    T.addOutputLine('<span class="tp-bold">' + T._('Виртуальная файловая система (VFS)', 'Virtual File System (VFS)') + '</span>');
    T.addOutputLine('');
    T.addOutputLine('<span class="tp-muted">' + T._('Корень ~/ — содержит разделы. cd <раздел> для навигации.', 'Root ~/ — contains sections. cd <section> to navigate.') + '</span>');
    T.addOutputLine('');
    T.addOutputLine('  <span class="tp-cmd">posts/</span>          <span class="tp-desc">— ' + T._('лента постов (N.post, .meta, image, comments/)', 'post feed (N.post, .meta, image, comments/)') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">saved/</span>          <span class="tp-desc">— ' + T._('сохранённые посты (симлинк на posts/)', 'bookmarked posts (symlink to posts/)') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">drafts/</span>         <span class="tp-desc">— ' + T._('черновики', 'drafts') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">trash/</span>          <span class="tp-desc">— ' + T._('корзина (rm без -f)', 'recycle bin (rm without -f)') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">profile/</span>        <span class="tp-desc">— ' + T._('профиль (info, posts/)', 'profile (info, posts/)') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">users/@name/</span>    <span class="tp-desc">— ' + T._('профили пользователей (info, posts/)', 'user profiles (info, posts/)') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">chat/@name/</span>     <span class="tp-desc">— ' + T._('чаты (inbox/, outbox/)', 'chats (inbox/, outbox/)') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">followers/</span>      <span class="tp-desc">— ' + T._('подписчики (hint → команда followers)', 'followers (hint → followers command)') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">following/</span>      <span class="tp-desc">— ' + T._('подписки (hint → команда following)', 'following (hint → following command)') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">notifications/</span>  <span class="tp-desc">— ' + T._('уведомления (hint → команда notifications)', 'notifications (hint → notifications command)') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">mnt/</span>            <span class="tp-desc">— ' + T._('точки монтирования GUI (settings, edit_profile)', 'GUI mount points (settings, edit_profile)') + '</span>');
    T.addOutputLine('');
    T.addOutputLine('<span class="tp-bold">' + T._('Типы файлов:', 'File types:') + '</span>');
    T.addOutputLine('  <span class="tp-post-id">42.post</span>        <span class="tp-desc">— ' + T._('пост (cat, nano)', 'post (cat, nano)') + '</span>');
    T.addOutputLine('  <span class="tp-post-id">.meta</span>          <span class="tp-desc">— ' + T._('метаданные поста (cat)', 'post metadata (cat)') + '</span>');
    T.addOutputLine('  <span class="tp-post-id">image</span>          <span class="tp-desc">— ' + T._('ASCII-арт изображения (cat --img)', 'image ASCII art (cat --img)') + '</span>');
    T.addOutputLine('  <span class="tp-post-id">info</span>           <span class="tp-desc">— ' + T._('информация профиля (cat, nano)', 'profile info (cat, nano)') + '</span>');
    T.addOutputLine('');
    T.addOutputLine('<span class="tp-bold">' + T._('Основные команды:', 'Key commands:') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">help</span>              <span class="tp-desc">— ' + T._('полный список команд', 'full command list') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">man &lt;cmd&gt;</span>       <span class="tp-desc">— ' + T._('подробная справка', 'detailed manual') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">cd &lt;раздел&gt;</span>     <span class="tp-desc">— ' + T._('переход между разделами', 'navigate sections') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">ls [-l]</span>           <span class="tp-desc">— ' + T._('список файлов', 'list files') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">cat &lt;файл&gt;</span>      <span class="tp-desc">— ' + T._('просмотр содержимого', 'view file contents') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">nano &lt;файл&gt;</span>     <span class="tp-desc">— ' + T._('редактирование', 'edit files') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">rm [-f] &lt;id&gt;</span>    <span class="tp-desc">— ' + T._('удаление поста (в корзину / навсегда)', 'remove post (trash / permanent)') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">feed [--tail N] [--page N] [--search Q] [--by @user]</span>  <span class="tp-desc">— ' + T._('лента постов', 'post feed') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">saved [--tail N] [--search Q]</span>  <span class="tp-desc">— ' + T._('сохранённые посты', 'saved posts') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">notifications [--unread] [--tail N]</span>  <span class="tp-desc">— ' + T._('уведомления', 'notifications') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">followers [--of @user]</span>  <span class="tp-desc">— ' + T._('подписчики', 'followers') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">following [--of @user]</span>  <span class="tp-desc">— ' + T._('подписки', 'following') + '</span>');
    T.addOutputLine('  <span class="tp-cmd">less [section] [N]</span>    <span class="tp-desc">— ' + T._('программный просмотр', 'program view (pager)') + '</span>');
    T.addOutputLine('');
    T.addOutputLine('<span class="tp-muted"># ' + T._('Используйте export LANG=en_US для английского языка.', 'Use export LANG=en_US for English interface.') + '</span>');
    T.addOutputLine('<span class="tp-muted"># ' + T._('/ — фокус ввода, ? — help, ↑↓ — история, Esc — blur', '/ — focus input, ? — help, ↑↓ — history, Esc — blur') + '</span>');
    T.addOutputLine('<span class="tp-muted"># ' + T._('Tab — автодополнение, Ctrl+R — поиск по истории', 'Tab — autocomplete, Ctrl+R — reverse-i-search') + '</span>');
  };

  // ── COMMAND: man ──
  T.cmdMan = function(args) {
    args = (args || '').trim();
    if (args === '-k' || args === '') {
      T.addOutputLine('<span class="tp-section">Available commands:</span>');
      Object.keys(T.manPages).sort().forEach(function(name) {
        var firstLine = T.manPages[name][0] || name;
        var desc = firstLine.split('—').pop() || name;
        T.addOutputLine('  <span class="tp-cmd">' + name + '</span>  <span class="tp-desc">' + desc.trim() + '</span>');
      });
      return;
    }
    var page = T.manPages[args.toLowerCase()];
    if (!page) {
      T.addOutputLine('<span class="tp-err">No manual entry for ' + T.escapeHtml(args) + '</span>');
      T.addOutputLine('<span class="tp-desc"># <span class="tp-cmd">man -k</span> — list all commands</span>');
      return;
    }
    page.forEach(function(line) {
      T.addOutputLine('<span class="tp-man-line">' + T.escapeHtml(line) + '</span>');
    });
    T.addSysLine('<span class="tp-muted">Manual page ' + T.escapeHtml(args) + '(1) line ' + page.length + '</span>');
  };

})(window.TERMINAL);
