// ── Rugram Terminal — Navigation (cd & ls) ──
(function(T) {
  'use strict';

  // ── Valid directories ──
  T.VALID_DIRS = {
    'feed': true,
    'saved': true,
    'followers': true,
    'following': true,
    'notifications': true,
    'profile': true,
    'chat': true,
    'create': true,
    'settings': true,
    'edit_profile': true
  };

  // ── COMMAND: cd <target> ──
  // cd now ONLY changes $PWD — no rendering
  T.processCd = function(target) {
    target = target.trim().toLowerCase();

    // Home
    if (target === '' || target === '/' || target === '~' || target === 'home') {
      T.stopChatPolling();
      T.cwd = '';
      T.updatePrompt();
      return;
    }

    // gui / exit — leave terminal
    if (target === 'gui' || target === 'exit') {
      T.setMode('gui');
      return;
    }

    // ..
    if (target === '..') {
      if (T.cwd.indexOf('/') >= 0) {
        var parts = T.cwd.split('/');
        parts.pop();
        T.cwd = parts.join('/');
        T.updatePrompt();
        return;
      }
      T.cwd = '';
      T.updatePrompt();
      return;
    }

    // @user — profile directory
    var userMatch = target.match(/^@(\w+)$/);
    if (userMatch) {
      T.cwd = '@' + userMatch[1];
      T.updatePrompt();
      return;
    }

    // post/<id> — single post directory
    var postMatch = target.match(/^post[\s/]+(\d+)$/i);
    if (postMatch) {
      T.cwd = 'post/' + postMatch[1];
      T.updatePrompt();
      return;
    }

    // chat/<id> or chat/<user>
    var chatIdMatch = target.match(/^chat[\s/]+(\d+)$/i);
    if (chatIdMatch) {
      T.cwd = 'chat/' + chatIdMatch[1];
      T.updatePrompt();
      return;
    }

    // Known sections
    if (T.VALID_DIRS[target]) {
      T.cwd = target;
      T.updatePrompt();
      return;
    }

    // URL-routed sections (settings, edit_profile)
    var url = T.sectionUrls[target];
    if (url) {
      T.cwd = target;
      T.updatePrompt();
      T.addOutputLine('<span class="tp-desc">  ' + T.escapeHtml(target) + '/  — <span class="tp-cmd">gui</span> ' + T._('для перехода в настройки', 'to open settings in GUI') + '</span>');
      T.addOutputLine('<span class="tp-muted">  # ' + T._('Настройки доступны в графическом интерфейсе', 'Settings are available in the GUI') + '</span>');
      return;
    }

    // Not found
    T.addOutputLine('<span class="tp-err">bash: cd: ' + T.escapeHtml(target) + ': No such directory</span>');
    T.addOutputLine('<span class="tp-desc"># Sections: feed, saved, followers, following, notifications, profile, chat, create</span>');
    T.addOutputLine('<span class="tp-muted">  # use <span class="tp-cmd">ls</span> to see all available sections</span>');
  };

  // ── COMMAND: ls [-l] [dir] ──
  T.cmdLs = function(args) {
    args = args || '';
    var detailed = /-l/.test(args);
    var target = args.replace(/-l/g, '').trim();

    var listFrom = target || T.cwd || '~';
    var items = [];

    // ── Home / ~ ──
    if (listFrom === '~' || listFrom === '' || listFrom === 'home') {
      var sections = [
        ['feed', 'd', T._('Лента постов', 'Post feed'), 4096],
        ['notifications', 'd', T._('Уведомления', 'Notifications'), 512],
        ['profile', 'd', T._('Мой профиль', 'My profile'), 2048],
        ['settings', 'f', T._('Настройки', 'Settings'), 1024],
        ['saved', 'd', T._('Сохранённое', 'Saved'), 2048],
        ['chat', 'd', T._('Сообщения', 'Messages'), 4096],
        ['create', 'd', T._('Новый пост', 'New post'), 0],
        ['followers', 'd', T._('Подписчики', 'Followers'), 1024],
        ['following', 'd', T._('Подписки', 'Following'), 512],
      ];
      if (detailed) {
        var now = new Date();
        var dateStr = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
        sections.forEach(function(s) {
          var perms = s[1] === 'f' ? '-rw-r--r--' : 'drwxr-xr-x';
          var size = String(s[3]).padStart(8);
          T.addOutputLine('<span class="tp-ok">' + perms + '</span> 1 ' + T.escapeHtml(T.username) + ' staff ' + size + ' ' + dateStr + ' <span class="tp-section">' + s[0] + '</span>');
        });
      } else {
        sections.forEach(function(s) {
          T.addOutputLine('  <span class="tp-cmd">' + s[0] + '</span>');
        });
      }
      T.addSysLine('<span class="tp-muted">' + sections.length + ' sections</span>');
      return;
    }

    // ── /feed ──
    if (listFrom === 'feed') {
      if (!T.feedData.length) {
        T.addOutputLine('<span class="tp-muted">  feed: empty</span>');
        return;
      }
      if (detailed) {
        T.feedData.forEach(function(p) {
          var size = p.text.length;
          var d = new Date(Date.now() - (p.id % 7) * 86400000 - (p.id % 24) * 3600000);
          var ds = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
          var sizeStr = String(size).padStart(8);
          T.addOutputLine('<span class="tp-ok">-rw-r--r--</span> 1 ' + T.escapeHtml(p.author) + ' staff ' + sizeStr + ' ' + ds + ' <span class="tp-post-id">post_' + p.id + '.txt</span>');
        });
      } else {
        T.feedData.forEach(function(p) {
          T.addOutputLine('  <span class="tp-post-id">post_' + p.id + '.txt</span>  <span class="tp-post-author">@' + T.escapeHtml(p.author) + '</span>');
        });
      }
      T.addSysLine('<span class="tp-muted">' + T.feedData.length + ' files</span>');
      return;
    }

    // ── /saved ──
    if (listFrom === 'saved') {
      T.addOutputLine('<span class="tp-desc">saved/</span>');
      T.addOutputLine('<span class="tp-muted">  use <span class="tp-cmd">saved</span> to view saved posts</span>');
      T.addOutputLine('<span class="tp-muted">  use <span class="tp-cmd">saved --less</span> for interactive pager</span>');
      T.addSysLine('<span class="tp-muted">1 directory</span>');
      return;
    }

    // ── /profile ──
    if (listFrom === 'profile') {
      var myName = T.username || 'unknown';
      var myPosts = T.feedData.filter(function(p) { return p.author.toLowerCase() === myName.toLowerCase(); });
      if (detailed) {
        T.addOutputLine('<span class="tp-ok">-rw-r--r--</span> 1 ' + T.escapeHtml(myName) + ' staff        8 Apr 01 2025 <span class="tp-cmd">description.txt</span>');
        myPosts.forEach(function(p) {
          var size = p.text.length;
          var d = new Date(Date.now() - (p.id % 7) * 86400000 - (p.id % 24) * 3600000);
          var ds = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
          var sizeStr = String(size).padStart(8);
          T.addOutputLine('<span class="tp-ok">-rw-r--r--</span> 1 ' + T.escapeHtml(myName) + ' staff ' + sizeStr + ' ' + ds + ' <span class="tp-post-id">post_' + p.id + '.txt</span>');
        });
      } else {
        T.addOutputLine('  <span class="tp-cmd">description.txt</span>');
        myPosts.forEach(function(p) {
          T.addOutputLine('  <span class="tp-post-id">post_' + p.id + '.txt</span>');
        });
      }
      T.addSysLine('<span class="tp-muted">' + (1 + myPosts.length) + ' files</span>');
      return;
    }

    // ── /notifications ──
    if (listFrom === 'notifications') {
      T.addOutputLine('<span class="tp-desc">notifications/</span>');
      T.addOutputLine('<span class="tp-muted">  use <span class="tp-cmd">notifications</span> to view</span>');
      T.addSysLine('<span class="tp-muted">1 entry</span>');
      return;
    }

    // ── /chat ──
    if (listFrom === 'chat' || listFrom === 'chats') {
      T.addOutputLine('<span class="tp-desc">chat/</span>');
      T.addOutputLine('<span class="tp-muted">  # <span class="tp-cmd">chat</span> ' + T._('показать диалоги', 'to list conversations') + '</span>');
      T.addOutputLine('<span class="tp-muted">  # <span class="tp-cmd">ls chat/&lt;id&gt;</span> ' + T._('показать переписку', 'to show a conversation') + '</span>');
      T.addSysLine('<span class="tp-muted">1 directory</span>');
      return;
    }

    // ── /settings ──
    if (listFrom === 'settings') {
      if (detailed) {
        T.addOutputLine('<span class="tp-ok">-rw-r--r--</span> 1 ' + T.escapeHtml(T.username || 'user') + ' staff      512 Apr 01 2025 <span class="tp-cmd">config.yaml</span>');
      } else {
        T.addOutputLine('  <span class="tp-cmd">config.yaml</span>');
      }
      T.addSysLine('<span class="tp-muted">1 file</span>');
      return;
    }

    // ── /create ──
    if (listFrom === 'create') {
      if (detailed) {
        T.addOutputLine('<span class="tp-ok">-rw-r--r--</span> 1 ' + T.escapeHtml(T.username || 'user') + ' staff        0 Apr 01 2025 <span class="tp-cmd">draft.txt</span>');
      } else {
        T.addOutputLine('  <span class="tp-cmd">draft.txt</span>');
      }
      T.addSysLine('<span class="tp-muted">1 file (use <span class="tp-cmd">nano</span> to edit)</span>');
      return;
    }

    // ── /followers /following ──
    if (listFrom === 'followers' || listFrom === 'following') {
      T.addOutputLine('<span class="tp-desc">' + listFrom + '/</span>');
      T.addOutputLine('<span class="tp-muted">  use <span class="tp-cmd">' + listFrom + '</span> to view the list</span>');
      T.addOutputLine('<span class="tp-muted">  use <span class="tp-cmd">' + listFrom + ' --of @user</span> for a specific user</span>');
      T.addSysLine('<span class="tp-muted">1 directory</span>');
      return;
    }

    // ── /post/<id> ──
    var postMatch = listFrom.match(/^post\/(\d+)$/i);
    if (postMatch) {
      T.addOutputLine('<span class="tp-desc">post/' + postMatch[1] + '/</span>');
      T.addOutputLine('<span class="tp-muted">  use <span class="tp-cmd">cat ' + postMatch[1] + '</span> to view this post</span>');
      T.addSysLine('<span class="tp-muted">1 file</span>');
      return;
    }

    // ── /chat/<id> ──
    var chatSubMatch = listFrom.match(/^chat\/(\d+)$/);
    if (chatSubMatch) {
      T.loadChatMessages(parseInt(chatSubMatch[1], 10));
      return;
    }

    // ── /@user ──
    if (listFrom.charAt(0) === '@') {
      T.addOutputLine('<span class="tp-desc">Profile: ' + T.escapeHtml(listFrom) + '</span>');
      T.addOutputLine('<span class="tp-muted">  use <span class="tp-cmd">cat ' + T.escapeHtml(listFrom) + '</span> or <span class="tp-cmd">neofetch ' + T.escapeHtml(listFrom) + '</span> to view</span>');
      T.addSysLine('<span class="tp-muted">1 profile</span>');
      return;
    }

    T.addOutputLine('<span class="tp-err">ls: ' + T.escapeHtml(listFrom) + ': No such directory</span>');
  };

})(window.TERMINAL);
