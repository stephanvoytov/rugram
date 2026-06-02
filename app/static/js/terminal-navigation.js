// ── Rugram Terminal — Navigation (cd & ls) ──
(function(T) {
  'use strict';

  // ── COMMAND: cd <section> ──
  T.processCd = function(target) {
    target = target.trim().toLowerCase();

    if (target === '' || target === '/' || target === '~' || target === 'home') {
      T.stopChatPolling();
      T.cwd = '';
      T.updatePrompt();
      T.renderHome();
      return;
    }

    if (target === 'feed') {
      T.stopChatPolling();
      T.cwd = 'feed';
      T.updatePrompt();
      T.renderFeed();
      return;
    }

    if (target === 'notifications') {
      T.stopChatPolling();
      T.cwd = 'notifications';
      T.updatePrompt();
      T.cmdNotifications();
      return;
    }

    if (target === 'profile') {
      T.stopChatPolling();
      T.cwd = 'profile';
      T.updatePrompt();
      T.cmdWhoami();
      return;
    }

    if (target === 'chat' || target === 'chats') {
      T.cwd = 'chat';
      T.updatePrompt();
      T.renderChatList();
      return;
    }

    var chatIdMatch = target.match(/^chat[\s/]+(\d+)$/i);
    if (chatIdMatch) {
      var cid = parseInt(chatIdMatch[1], 10);
      T.cwd = 'chat/' + cid;
      T.updatePrompt();
      T.loadChatMessages(cid);
      return;
    }

    var chatUserMatch = target.match(/^chat[\s/]+@?(\w+)$/i);
    if (chatUserMatch) {
      T.startChatWithUser(chatUserMatch[1], true);
      return;
    }

    if (target === '..') {
      if (T.cwd.indexOf('/') >= 0) {
        var parts = T.cwd.split('/');
        parts.pop();
        T.cwd = parts.join('/');
        T.updatePrompt();
        T.stopChatPolling();
        if (T.cwd === 'chat') T.renderChatList();
        else T.renderHome();
      } else {
        T.stopChatPolling();
        T.cwd = '';
        T.updatePrompt();
        T.renderHome();
      }
      return;
    }

    if (target === 'gui' || target === 'exit') {
      T.setMode('gui');
      return;
    }

    if (target === 'saved') {
      T.stopChatPolling();
      T.cwd = 'saved';
      T.updatePrompt();
      T.cmdSaved();
      return;
    }

    if (target === 'create') {
      T.stopChatPolling();
      T.cwd = 'create';
      T.updatePrompt();
      T.cmdCreate();
      return;
    }

    var url = T.sectionUrls[target];
    if (url) {
      sessionStorage.setItem('cd_nav', target);
      localStorage.setItem('rugram_mode', 'tty');
      window.location.href = url;
      return;
    }

    var postMatch = target.match(/^post\s+(\d+)$/i);
    if (postMatch) {
      T.stopChatPolling();
      T.cwd = 'post/' + postMatch[1];
      T.updatePrompt();
      T.cmdPostView(parseInt(postMatch[1], 10));
      return;
    }

    if (target === 'followers') {
      var user = T.username && T.username !== 'guest' ? T.username : null;
      if (!user) {
        T.addOutputLine('<span class="tp-err">cd: followers: ' + T._('пользователь не определён', 'could not resolve current user') + '</span>');
        return;
      }
      T.stopChatPolling();
      T.cwd = 'followers';
      T.updatePrompt();
      T.cmdFollowers(user);
      return;
    }

    if (target === 'following') {
      var user = T.username && T.username !== 'guest' ? T.username : null;
      if (!user) {
        T.addOutputLine('<span class="tp-err">cd: following: ' + T._('пользователь не определён', 'could not resolve current user') + '</span>');
        return;
      }
      T.stopChatPolling();
      T.cwd = 'following';
      T.updatePrompt();
      T.cmdFollowing(user);
      return;
    }

    var userMatch = target.match(/^@(\w+)$/);
    if (userMatch) {
      T.cwd = '@' + userMatch[1];
      T.updatePrompt();
      T.cmdNeofetch(userMatch[1]);
      return;
    }

    T.addOutputLine('<span class="tp-err">cd: ' + T.escapeHtml(target) + ': section not found</span>');
    T.addOutputLine('<span class="tp-desc"># Sections: feed, notifications, profile, settings, saved, chat, create, followers, following, post &lt;id&gt;</span>');
    T.addOutputLine('<span class="tp-muted">  # use <span class="tp-cmd">ls</span> to see all available sections</span>');
  };

  // ── COMMAND: ls ──
  T.cmdLs = function(args) {
    args = args || '';
    var detailed = /-l/.test(args);
    var target = args.replace(/-l/g, '').trim();

    if (target.indexOf('/') >= 0) {
      var parts = target.split('/').filter(Boolean);
      target = parts[0] + (parts.length > 1 && parts[0] === 'feed' && detailed ? ' ' + parts[1] : '');
    }

    var listFrom = target || T.cwd || '~';
    var items = [];

    if (listFrom === '~' || listFrom === '' || listFrom === 'home') {
      var sections = [
        ['feed', 'd', T._('Лента постов', 'Post feed'), 4096],
        ['notifications', 'd', T._('Уведомления', 'Notifications'), 512],
        ['profile', 'd', T._('Мой профиль', 'My profile'), 2048],
        ['settings', 'f', T._('Настройки', 'Settings'), 1024],
        ['saved', 'd', T._('Сохранённое', 'Saved'), 2048],
        ['chat', 'd', T._('Сообщения', 'Messages'), 4096],
        ['create', 'f', T._('Новый пост', 'New post'), 0],
        ['followers', 'd', T._('Подписчики', 'Followers'), 1024],
        ['following', 'd', T._('Подписки', 'Following'), 512],
      ];
      if (detailed) {
        var now = new Date();
        var dateStr = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
        sections.forEach(function(s) {
          var perms = s[1] === 'f' ? '-rw-r--r--' : 'drwxr-xr-x';
          var size = String(s[3]).padStart(8);
          T.addOutputLine('<span class="tp-ok">' + perms + '</span> 1 ' + T.username + ' staff ' + size + ' ' + dateStr + ' <span class="tp-section">' + s[0] + '</span>');
        });
      } else {
        sections.forEach(function(s) {
          T.addOutputLine('  <span class="tp-cmd">' + s[0] + '</span>');
        });
      }
      T.addSysLine('<span class="tp-muted">' + sections.length + ' sections</span>');
      return;
    }

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
          T.addOutputLine('<span class="tp-ok">-rw-r--r--</span> 1 ' + p.author + ' staff ' + sizeStr + ' ' + ds + ' <span class="tp-post-id">' + p.id + '.txt</span>');
        });
      } else {
        T.feedData.forEach(function(p) {
          T.addOutputLine('  <span class="tp-post-id">' + p.id + '.txt</span>  <span class="tp-post-author">@' + p.author + '</span>');
        });
      }
      T.addSysLine('<span class="tp-muted">' + T.feedData.length + ' files</span>');
      return;
    }

    if (listFrom === 'profile') {
      var myName = T.username || 'unknown';
      var myPosts = T.feedData.filter(function(p) { return p.author.toLowerCase() === myName.toLowerCase(); });
      var fileCount = 1 + myPosts.length;
      if (detailed) {
        T.addOutputLine('<span class="tp-ok">-rw-r--r--</span> 1 ' + myName + ' staff        8 Apr 01 2025 <span class="tp-cmd">description.txt</span>');
        myPosts.forEach(function(p) {
          var size = p.text.length;
          var d = new Date(Date.now() - (p.id % 7) * 86400000 - (p.id % 24) * 3600000);
          var ds = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
          var sizeStr = String(size).padStart(8);
          T.addOutputLine('<span class="tp-ok">-rw-r--r--</span> 1 ' + myName + ' staff ' + sizeStr + ' ' + ds + ' <span class="tp-post-id">' + p.id + '.txt</span>');
        });
      } else {
        T.addOutputLine('  <span class="tp-cmd">description.txt</span>');
        myPosts.forEach(function(p) {
          T.addOutputLine('  <span class="tp-post-id">' + p.id + '.txt</span>');
        });
      }
      T.addSysLine('<span class="tp-muted">' + fileCount + ' files</span>');
      return;
    }

    if (listFrom === 'notifications') {
      T.addOutputLine('<span class="tp-desc">notifications/</span>');
      T.addOutputLine('<span class="tp-muted">  use <span class="tp-cmd">cat /notifications</span> to view</span>');
      T.addSysLine('<span class="tp-muted">1 entry</span>');
      return;
    }

    if (listFrom === 'chat' || listFrom === 'chats') {
      T.addOutputLine('<span class="tp-desc">chat/</span>');
      T.addOutputLine('<span class="tp-muted">  use <span class="tp-cmd">cd chat</span> to open messenger</span>');
      T.addSysLine('<span class="tp-muted">1 entry</span>');
      return;
    }

    if (listFrom === 'saved') {
      T.addOutputLine('<span class="tp-desc">saved/</span>');
      T.addOutputLine('<span class="tp-muted">  use <span class="tp-cmd">cd saved</span> to view saved posts</span>');
      T.addSysLine('<span class="tp-muted">1 directory</span>');
      return;
    }

    if (listFrom === 'settings') {
      if (detailed) {
        T.addOutputLine('<span class="tp-ok">-rw-r--r--</span> 1 ' + (T.username || 'user') + ' staff      512 Apr 01 2025 <span class="tp-cmd">config.yaml</span>');
      } else {
        T.addOutputLine('  <span class="tp-cmd">config.yaml</span>');
      }
      T.addSysLine('<span class="tp-muted">1 file</span>');
      return;
    }

    if (listFrom === 'create') {
      if (detailed) {
        T.addOutputLine('<span class="tp-ok">-rw-r--r--</span> 1 ' + (T.username || 'user') + ' staff        0 Apr 01 2025 <span class="tp-cmd">draft.txt</span>');
      } else {
        T.addOutputLine('  <span class="tp-cmd">draft.txt</span>');
      }
      T.addSysLine('<span class="tp-muted">1 file</span>');
      return;
    }

    if (listFrom === 'followers' || listFrom === 'following') {
      T.addOutputLine('<span class="tp-desc">' + listFrom + '/</span>');
      T.addOutputLine('<span class="tp-muted">  use <span class="tp-cmd">cd ' + listFrom + '</span> to see the list</span>');
      T.addSysLine('<span class="tp-muted">1 entry</span>');
      return;
    }

    var chatSubMatch = listFrom.match(/^chat\/(\d+)$/);
    if (chatSubMatch) {
      T.loadChatMessages(parseInt(chatSubMatch[1], 10));
      return;
    }

    if (listFrom.charAt(0) === '@') {
      T.addOutputLine('<span class="tp-desc">Profile: ' + T.escapeHtml(listFrom) + '</span>');
      T.cmdNeofetch(listFrom.substring(1));
      return;
    }

    T.addOutputLine('<span class="tp-err">ls: ' + T.escapeHtml(listFrom) + ': No such directory</span>');
  };

})(window.TERMINAL);
