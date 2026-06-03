// ── Rugram Terminal — Navigation (cd & ls) ──
// Powered by T.vfs (terminal-vfs.js)
(function(T) {
  'use strict';

  // ── COMMAND: cd <target> ──
  T.processCd = function(target) {
    target = (target || '').trim().toLowerCase();

    // gui / exit
    if (target === 'gui' || target === 'exit') {
      T.setMode('gui');
      return;
    }

    // Без аргументов — домой
    if (!target || target === '~' || target === '/' || target === 'home') {
      T.stopChatPolling();
      T.cwd = '';
      T.updatePrompt();
      return;
    }

    // .. — вверх
    if (target === '..') {
      var newCwd = '';
      if (T.cwd && T.cwd.indexOf('/') >= 0) {
        var parts = T.cwd.split('/');
        parts.pop();
        newCwd = parts.join('/');
      } else if (T.cwd) {
        // Были в одноуровневой директории — выходим в корень
        newCwd = '';
      }
      // Если выходим из чата — чистим
      if (T.cwd.startsWith('chat') || (T.cwd === 'chat')) {
        T.stopChatPolling();
        if (T._programStack && T._programStack.length > 0) {
          T.exitProgramView();
        }
      }
      T.cwd = newCwd;
      T.updatePrompt();
      return;
    }

    // Проверка через VFS: существует ли такой путь как директория?
    var node = T.vfs.resolve(target);
    if (!node || node.error) {
      T.addOutputLine('<span class="tp-err">bash: cd: ' + T.escapeHtml(target) + ': No such directory</span>');
      T.addOutputLine('<span class="tp-desc"># Sections: feed, saved, followers, following, notifications, profile, chat, create</span>');
      return;
    }

    // chat/<id> — если уходили из чата, остановить поллинг
    var chatMatch = target.match(/^chat[\/\s]\d+$/i);
    if (!chatMatch && T.cwd && T.cwd.startsWith('chat')) {
      T.stopChatPolling();
    }
    if (chatMatch && !T.cwd.startsWith('chat')) {
      T.stopChatPolling();
    }

    // chat — переключение, не меняем cwd
    if (target === 'chat') {
      T.cwd = 'chat';
      T.updatePrompt();
      return;
    }

    // Устанавливаем cwd
    T.cwd = target;
    T.updatePrompt();

    // Специальные подсказки для GUI-секций
    var url = T.sectionUrls[target];
    if (url) {
      T.addOutputLine('<span class="tp-desc">  ' + T.escapeHtml(target) + '/  — <span class="tp-cmd">gui</span> ' + T._('для перехода в настройки', 'to open settings in GUI') + '</span>');
      T.addOutputLine('<span class="tp-muted">  # ' + T._('Настройки доступны в графическом интерфейсе', 'Settings are available in the GUI') + '</span>');
    }
  };

  // ── COMMAND: ls [-l] [dir] ──
  T.cmdLs = function(args) {
    args = args || '';
    var detailed = /-l/.test(args);
    var target = args.replace(/-l/g, '').trim() || T.cwd || '~';

    var node = T.vfs.resolve(target);
    if (!node || node.error) {
      T.addOutputLine('<span class="tp-err">ls: ' + T.escapeHtml(target) + ': No such directory</span>');
      T.addOutputLine('<span class="tp-desc"># <span class="tp-cmd">cd</span> to a section, or <span class="tp-cmd">ls &lt;section&gt;</span></span>');
      return;
    }

    if (node.type !== 'dir') {
      // Если это файл — показываем один файл
      T.addOutputLine('  <span class="tp-post-id">' + T.escapeHtml(node.name || target) + '</span>');
      T.addSysLine('<span class="tp-muted">1 file</span>');
      return;
    }

    var children = node.children;
    if (!children || children.length === 0) {
      if (target === '' || target === '~' || target === 'feed') {
        T.addOutputLine('<span class="tp-muted">  empty</span>');
        return;
      }
      T.addOutputLine('<span class="tp-desc">' + target.replace(/^\//, '') + '/</span>');
      T.addOutputLine('<span class="tp-muted">  use program command: <span class="tp-cmd">' + target + '</span></span>');
      T.addSysLine('<span class="tp-muted">1 directory</span>');
      return;
    }

    // ── Корень (~) ──
    if (target === '' || target === '~' || target === 'home' || target === '.') {
      if (detailed) {
        var now = new Date();
        var dateStr = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
        children.forEach(function(s) {
          var perms = s.type === 'file' ? '-rw-r--r--' : 'drwxr-xr-x';
          var size = '    4096';
          T.addOutputLine('<span class="tp-ok">' + perms + '</span> 1 ' + T.escapeHtml(T.username) + ' staff ' + size + ' ' + dateStr + ' <span class="tp-section">' + T.escapeHtml(s.name) + '</span>');
        });
      } else {
        children.forEach(function(s) {
          T.addOutputLine('  <span class="tp-cmd">' + T.escapeHtml(s.name) + '</span>');
        });
      }
      T.addSysLine('<span class="tp-muted">' + children.length + ' ' + T._('секций', 'sections') + '</span>');
      if (!T.isLoggedIn) {
        T.addOutputLine('<span class="tp-muted">  ' + T._('★ — без входа', '★ — works as guest') + ': feed, followers --of, neofetch, cat</span>');
      }
      return;
    }

    // ── /feed — список постов ──
    if (target === 'feed') {
      if (detailed) {
        children.forEach(function(c) {
          var d = new Date(Date.now() - ((c.id || 0) % 7) * 86400000 - ((c.id || 0) % 24) * 3600000);
          var ds = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
          var size = String(c.id ? 200 : 0).padStart(8);
          T.addOutputLine('<span class="tp-ok">-rw-r--r--</span> 1 ' + T.escapeHtml(c.author || '?') + ' staff ' + size + ' ' + ds + ' <span class="tp-post-id">' + T.escapeHtml(c.name) + '</span>');
        });
      } else {
        children.forEach(function(c) {
          T.addOutputLine('  <span class="tp-post-id">' + T.escapeHtml(c.name) + '</span>  <span class="tp-post-author">@' + T.escapeHtml(c.author || '?') + '</span>');
        });
      }
      T.addSysLine('<span class="tp-muted">' + children.length + ' ' + T._('файл(а/ов)', 'file(s)') + '</span>');
      return;
    }

    // ── /profile ──
    if (target === 'profile') {
      if (detailed) {
        var myName = T.username || 'unknown';
        var now = new Date();
        var dateStr = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
        children.forEach(function(c) {
          if (c.name === 'description.txt') {
            T.addOutputLine('<span class="tp-ok">-rw-r--r--</span> 1 ' + T.escapeHtml(myName) + ' staff        8 ' + dateStr + ' <span class="tp-cmd">description.txt</span>');
          } else {
            var d = new Date(Date.now() - ((c.id || 0) % 7) * 86400000);
            var ds = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
            T.addOutputLine('<span class="tp-ok">-rw-r--r--</span> 1 ' + T.escapeHtml(myName) + ' staff      200 ' + ds + ' <span class="tp-post-id">' + T.escapeHtml(c.name) + '</span>');
          }
        });
      } else {
        children.forEach(function(c) {
          if (c.name === 'description.txt') {
            T.addOutputLine('  <span class="tp-cmd">description.txt</span>');
          } else {
            T.addOutputLine('  <span class="tp-post-id">' + T.escapeHtml(c.name) + '</span>');
          }
        });
      }
      T.addSysLine('<span class="tp-muted">' + children.length + ' ' + T._('файл(а/ов)', 'file(s)') + '</span>');
      return;
    }

    // ── Все остальные секции ──
    if (children.length > 0 && children[0].hasOwnProperty('name')) {
      // Дочерние элементы с именами
      var hasFiles = children.some(function(c) { return c.type === 'file'; });
      if (hasFiles && detailed) {
        children.forEach(function(c) {
          var perms = c.type === 'file' ? '-rw-r--r--' : 'drwxr-xr-x';
          T.addOutputLine('<span class="tp-ok">' + perms + '</span> 1 ' + T.escapeHtml(T.username || 'user') + ' staff        0 Apr 01 2025 <span class="tp-cmd">' + T.escapeHtml(c.name) + '</span>');
        });
      } else {
        children.forEach(function(c) {
          if (c.type === 'dir') {
            T.addOutputLine('  <span class="tp-cmd">' + T.escapeHtml(c.name) + '/</span>');
          } else {
            T.addOutputLine('  <span class="tp-post-id">' + T.escapeHtml(c.name) + '</span>');
          }
        });
      }
      T.addSysLine('<span class="tp-muted">' + children.length + ' ' + T._('элемент(а/ов)', 'item(s)') + '</span>');
      return;
    }

    // fallback
    T.addOutputLine('<span class="tp-desc">' + target.replace(/^\//, '') + '/</span>');
    T.addOutputLine('<span class="tp-muted">  use <span class="tp-cmd">' + target + '</span> to view</span>');
    T.addSysLine('<span class="tp-muted">1 directory</span>');
  };

  // ── Registry ──
  T.register('ls', { handler: T.cmdLs, auth: false, category: 'navigation', match: 'prefix' });

})(window.TERMINAL);
