// ── Rugram Terminal — Navigation (cd & ls) ──
// Powered by T.vfs (terminal-vfs.js)
(function(T) {
  'use strict';
  if (!T.vfs) throw new Error('terminal-vfs.js must be loaded before terminal-navigation.js');

  // ── COMMAND: cd <target> ──
  T.processCd = function(target) {
    target = (target || '').trim().toLowerCase();

    // gui / exit
    if (target === 'gui' || target === 'exit') {
      if (window.location.pathname === '/terminal') {
        window.location.href = '/';
        return;
      }
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
        newCwd = '';
      }
      if (T.cwd && (T.cwd.startsWith('chat') || T.cwd === 'chat')) {
        T.stopChatPolling();
        if (T._programStack && T._programStack.length > 0) {
          T.exitProgramView();
        }
      }
      T.cwd = newCwd;
      T.updatePrompt();
      return;
    }

    // ── VFS validation ──
    var node;
    try { node = T.vfs.resolve(target); }
    catch(e) {
      T.addOutputLine('<span class="tp-err">bash: cd: ' + T.escapeHtml(target) + ': No such file or directory</span>');
      T.addOutputLine('<span class="tp-desc"># Sections: posts, saved, drafts, trash, profile, users, chat, notifications, followers, following</span>');
      return;
    }

    // ❌ cd в файл — запрещено (Unix-style)
    if (node.type !== 'dir') {
      T.addOutputLine('<span class="tp-err">bash: cd: ' + T.escapeHtml(target) + ': Not a directory</span>');
      return;
    }

    // Если уходим из чата — чистим
    if (target !== 'chat' && !target.startsWith('chat/') && T.cwd && T.cwd.startsWith('chat')) {
      T.stopChatPolling();
    }

    // ✅ Меняем директорию (с учётом текущей)
    var parts = T.vfs.normalize(target, T.cwd);
    T.cwd = T.vfs.canonical(parts);
    T.updatePrompt();
  };

  // ── COMMAND: ls [-l] [dir] ──
  T.cmdLs = function(args) {
    args = args || '';
    var detailed = /-l/.test(args);
    var rawTarget = args.replace(/-\w+/g, '').trim();
    var target = rawTarget || '.';
    var isRoot = !rawTarget && (!T.cwd || T.cwd === '');

    var node;
    try { node = T.vfs.resolve(target); }
    catch(e) {
      T.addOutputLine('<span class="tp-err">ls: ' + T.escapeHtml(target) + ': No such file or directory</span>');
      T.addOutputLine('<span class="tp-desc"># <span class="tp-cmd">cd</span> to a section, or <span class="tp-cmd">ls &lt;section&gt;</span></span>');
      return;
    }

    if (node.type !== 'dir') {
      T.addOutputLine('  <span class="tp-post-id">' + T.escapeHtml(node.name || target) + '</span>');
      T.addSysLine('<span class="tp-muted">1 file</span>');
      return;
    }

    var children = node.children;
    if (!children || children.length === 0) {
      // Hint-directories (followers, following, notifications) have dynamic content
      if (typeof node.content === 'function') {
        node.content(function(line) { T.addOutputLine(line); });
        return;
      }
      if (target === '' || target === '~') {
        T.addOutputLine('<span class="tp-muted">  empty</span>');
        return;
      }
      T.addOutputLine('<span class="tp-desc">' + target + '/</span>');
      T.addOutputLine('<span class="tp-muted">  use <span class="tp-cmd">' + target + '</span></span>');
      T.addSysLine('<span class="tp-muted">1 directory</span>');
      return;
    }

    // ── Detailed (-l) ──
    if (detailed) {
      var now = new Date();
      var dateStr = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
      children.forEach(function(c) {
        var perms = c.type === 'file' ? '-rw-r--r--' : 'drwxr-xr-x';
        var size = String(c.id ? 200 : 4096).padStart(8);
        var owner = T.escapeHtml(c.author || T.username || 'user');
        T.addOutputLine('<span class="tp-ok">' + perms + '</span> 1 ' + owner + ' staff ' + size + ' ' + dateStr + ' <span class="tp-section">' + T.escapeHtml(c.name) + '</span>');
      });
      T.addSysLine('<span class="tp-muted">' + children.length + ' entries</span>');
      return;
    }

    // ── Simple listing ──
    var hasAuthors = children.some(function(c) { return c.author; });
    children.forEach(function(c) {
      var line = '  ';
      if (c.type === 'dir') {
        line += '<span class="tp-cmd">' + T.escapeHtml(c.name) + '/</span>';
      } else {
        line += '<span class="tp-post-id">' + T.escapeHtml(c.name) + '</span>';
      }
      if (c.author) line += '  <span class="tp-post-author">@' + T.escapeHtml(c.author) + '</span>';
      T.addOutputLine(line);
    });
    T.addSysLine('<span class="tp-muted">' + children.length + ' ' + T._('элемент(а/ов)', 'item(s)') + '</span>');

    if (isRoot && !T.isLoggedIn) {
      T.addOutputLine('<span class="tp-muted">  ' + T._('без входа доступно: ls, cd, cat, neofetch, help', 'guest: ls, cd, cat, neofetch, help') + '</span>');
      T.addOutputLine('<span class="tp-muted">  ' + T._('авторизуйтесь: login или register', 'sign in: <span class="tp-cmd">login</span>  |  create account: <span class="tp-cmd">register</span>') + '</span>');
    }
  };

  // ── Registry ──
  T.registerCommand('ls', new T.Command('ls', { handler: T.cmdLs, auth: false, category: 'navigation', match: 'prefix' }));

})(window.__RT);
