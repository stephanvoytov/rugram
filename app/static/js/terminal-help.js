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
      '    as files (post_42.txt) in /feed and /profile.',
      '    Use -l for detailed view with permissions and sizes.',
      '',
      '    In home (~), shows all available directories.',
      '',
      'EXAMPLES',
      '    ls            list files in current dir',
      '    ls -l         detailed list',
      '    ls feed       list posts in /feed',
      '    ls -l feed    detailed post list',
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
      '    feed            posts feed',
      '    saved           saved posts',
      '    followers       followers list',
      '    following       following list',
      '    notifications   notifications',
      '    profile         my profile',
      '    chat            messages',
      '    create          new post (use nano to edit)',
      '    post/N          single post',
      '    @user           user profile',
      '',
      'EXAMPLES',
      '    cd feed         go to /feed',
      '    feed            show all posts (program)',
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
    nano: [
      'NANO(1)                      User Commands                      NANO(1)',
      '',
      'NAME',
      '    nano — terminal text editor for posts and profile',
      '',
      'SYNOPSIS',
      '    nano <path>',
      '    nano /profile/description.txt',
      '    nano /feed/42.txt',
      '',
      'DESCRIPTION',
      '    Opens a full-screen editor. Paths are resolved against',
      '    the current directory (cd profile, cd feed).',
      '',
      'FILES',
      '    description.txt   edit profile description',
      '    N.txt             edit post #N',
      '',
      'KEYS',
      '    ^O     save changes',
      '    ^X     exit (if no unsaved changes)',
      '    ^C     cancel and close',
      '    ^G     toggle help',
    ],
  };

  // ── Show brief help for specific command (--help) ──
  T.showCmdHelp = function(cmdName) {
    var aliasMap = {
      gui: 'cd', exit: 'cd', feed: 'ls', notifications: 'cat',
      like: 'like', comment: 'comment', bookmark: 'bookmark',
      whoami: 'whoami', neofetch: 'neofetch', grep: 'grep',
      clear: 'clear', help: 'help', pwd: 'pwd', logout: 'logout',
      sudo: 'sudo', cat: 'ls', nano: 'nano',
    };
    var name = aliasMap[cmdName.toLowerCase()] || cmdName.toLowerCase();
    var page = T.manPages[name];
    if (cmdName.toLowerCase() === 'cd' || cmdName.toLowerCase() === 'follow' || cmdName.toLowerCase() === 'unfollow') {
      page = T.manPages[cmdName.toLowerCase()];
    }
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

  // ── COMMAND: help ──
  T.cmdHelp = function() {
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
      ['like', '<id>', T._('Поставить/убрать лайк', 'Like or unlike a post')],
      ['comment', '<id> "<text>"', T._('Добавить комментарий', 'Add a comment to a post')],
      ['bookmark', '<id>', T._('Сохранить/убрать пост', 'Save or unsave a post')],
    ]);
    T.addOutputLine('');

    printCategory(T._('Социальное', 'Social'), [
      ['follow', '@<user>', T._('Подписаться на пользователя', 'Follow a user')],
      ['unfollow', '@<user>', T._('Отписаться', 'Unfollow a user')],
      ['whoami', '', T._('Показать свой профиль', 'Show your profile (neofetch)')],
      ['neofetch', '@<user>', T._('Профиль другого пользователя', 'View any user profile')],
      ['ping', '[@user]', T._('Проверить доступность', 'Check if a user exists')],
    ]);
    T.addOutputLine('');

    printCategory(T._('Навигация (файловая система)', 'Navigation (filesystem)'), [
      ['ls', '[-l] [dir]', T._('Файлы в текущей директории', 'List files in current directory')],
      ['cd', '<section>', T._('Перейти в раздел (feed, saved, profile…)', 'Change directory (feed, saved, profile…)')],
      ['cd', '..', T._('На уровень выше', 'Go up one directory')],
      ['pwd', '', T._('Показать текущую директорию', 'Show current directory')],
    ]);
    T.addOutputLine('');

    printCategory(T._('Программы', 'Programs'), [
      ['feed', '[--tail N] [--page N] [--search text] [--less]', T._('Показать ленту постов', 'Show the post feed')],
      ['saved', '[--tail N] [--less]', T._('Сохранённые посты', 'Show saved posts')],
      ['followers', '[--of @user] [--less]', T._('Подписчики', 'Show followers')],
      ['following', '[--of @user] [--less]', T._('Подписки', 'Show following')],
      ['notifications', '', T._('Уведомления', 'Show notifications')],
      ['less', '[section]', T._('Интерактивный пейджер (j/k, /, Enter, q)', 'Interactive pager (j/k, /, Enter, q)')],
      ['cat', '<id> | post_<id>', T._('Показать содержимое поста', 'View a post by ID')],
      ['create', '', T._('Новый пост (открывает nano)', 'Create a new post (opens nano)')],
      ['grep', '"<text>"', T._('Поиск по ленте', 'Search posts in feed')],
      ['head', '[-n N]', T._('Первые N постов', 'Show first N posts')],
      ['tail', '[-n N]', T._('Последние N постов', 'Show last N posts')],
    ]);
    T.addOutputLine('');

    printCategory(T._('Чат', 'Chat'), [
      ['cd chat', '', T._('Перейти в /chat', 'Go to /chat')],
      ['say', '<text>', T._('Отправить сообщение', 'Send a message in current chat')],
      ['start', '@<user>', T._('Начать чат с пользователем', 'Start a chat with a user')],
    ]);
    T.addOutputLine('');

    printCategory(T._('Система', 'System'), [
      ['clear', '', T._('Очистить экран', 'Clear terminal screen')],
      ['gui / exit', '', T._('Вернуться в GUI режим', 'Switch back to GUI mode')],
      ['help', '', T._('Эта справка', 'Show this help')],
      ['man', '[-k] [command]', T._('Руководство по командам', 'Show manual pages')],
      ['nano', '<path>', T._('Редактор (description.txt, N.txt)', 'Edit a post or profile')],
      ['date', '[-u]', T._('Текущая дата и время', 'Show current date and time')],
      ['uptime', '', T._('Время работы терминала', 'Show terminal session uptime')],
      ['history', '[-c]', T._('История команд', 'Show or clear command history')],
      ['echo', '<text>', T._('Вывести текст ($VAR подстановка)', 'Print text with $VAR support')],
      ['export', '[VAR=value]', T._('Переменные окружения', 'Set or view environment variables')],
      ['sudo !!', '', T._('Повторить последнюю команду', 'Re-run the last command')],
      ['fortune', '', T._('Случайная цитата', 'Random programmer quote')],
      ['watch', '[-n N] <cmd>', T._('Повторять команду', 'Execute command repeatedly')],
      ['top', '', T._('Активность', 'Live activity feed')],
    ]);
    T.addOutputLine('');

    var langLabel = T.env.LANG && T.env.LANG.startsWith('ru') ? 'RU' : 'EN';
    T.addOutputLine('<span class="tp-muted"># <span class="tp-cmd">man &lt;command&gt;</span> ' + T._('для подробной справки', 'for detailed manual') + '  |  <span class="tp-cmd">export LANG=en_US</span> — ' + T._('язык', 'language') + ': ' + langLabel + '</span>');
    T.addOutputLine('<span class="tp-muted"># <span class="tp-cmd">/</span> ' + T._('фокус ввода', 'focus input') + '  <span class="tp-cmd">?</span> help  <span class="tp-cmd">↑↓</span> ' + T._('история', 'history') + '  <span class="tp-cmd">Esc</span> blur</span>');
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
