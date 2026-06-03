// ── Rugram Terminal — User Commands ──
(function(T) {
  'use strict';

  // ── COMMAND: login ──
  T.cmdLogin = function(loginOrEmail, password) {
    T.showLoading('Logging in...');
    fetch(window.API_LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': (document.querySelector('meta[name="csrf-token"]') || {}).content || '' },
      body: JSON.stringify({ login: loginOrEmail, password: password }),
      credentials: 'same-origin'
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      T.hideLoading();
      if (!data.ok) {
        T.addOutputLine('<span class="tp-err">' + T.escapeHtml(data.error) + '</span>');
        return;
      }
      T.username = data.user.username;
      T.currentUserId = data.user.id || 0;
      T.isLoggedIn = true;
      T.cwd = 'feed';
      T.updatePrompt();
      T.addSysLine('<span class="tp-ok">' + T._('Вошли как @', 'Logged in as @') + T.escapeHtml(T.username) + '</span>');
      T.fetchFeedFromAPI();
    })
    .catch(function(err) {
      T.hideLoading();
      T.addOutputLine('<span class="tp-err">error: ' + T.escapeHtml(err.message) + '</span>');
    });
  };

  // ── COMMAND: register ──
  T.cmdRegister = function(uname, email, password) {
    T.showLoading('Registering...');
    fetch(window.API_REGISTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': (document.querySelector('meta[name="csrf-token"]') || {}).content || '' },
      body: JSON.stringify({ username: uname, email: email, password: password }),
      credentials: 'same-origin'
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      T.hideLoading();
      if (!data.ok) {
        T.addOutputLine('<span class="tp-err">' + T.escapeHtml(data.error) + '</span>');
        return;
      }
      T.username = data.user.username;
      T.currentUserId = data.user.id || 0;
      T.isLoggedIn = true;
      T.cwd = 'feed';
      T.updatePrompt();
      T.fetchFeedFromAPI();
      T.addSysLine('<span class="tp-ok">' + T._('Зарегистрированы и вошли как @', 'Registered and logged in as @') + T.escapeHtml(T.username) + '</span>');
    })
    .catch(function(err) {
      T.hideLoading();
      T.addOutputLine('<span class="tp-err">error: ' + T.escapeHtml(err.message) + '</span>');
    });
  };

  // ── COMMAND: logout ──
  T.cmdLogout = function() {
    T.showLoading('Logging out...');
    fetch(window.API_LOGOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': (document.querySelector('meta[name="csrf-token"]') || {}).content || '' },
      credentials: 'same-origin'
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      T.hideLoading();
      T.username = 'guest';
      T.currentUserId = 0;
      T.isLoggedIn = false;
      T.cwd = '';
      T.feedData = [];
      T.stopChatPolling();
      T.updatePrompt();
      T.addSysLine('<span class="tp-ok">' + T._('Вышли из системы', 'Logged out') + '</span>');
    })
    .catch(function(err) {
      T.hideLoading();
      T.addOutputLine('<span class="tp-err">error: ' + T.escapeHtml(err.message) + '</span>');
    });
  };

  // ── COMMAND: like ──
  T.cmdLike = function(id) {
    if (!T.isLoggedIn) {
      T.addOutputLine('<span class="tp-err">like: ' + T._('Требуется вход.', 'Login required.') + '</span>');
      T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
      return;
    }
    var csrf = document.querySelector('meta[name="csrf-token"]');
    T.showLoading('Liking post #' + id);

    fetch(window.LIKE_URL.replace('/0/', '/' + id + '/'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': csrf.content
      },
      body: '{}',
      credentials: 'same-origin'
    })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(data) {
      T.hideLoading();
      var status = data.status === 'liked' ? '+' : '-';
      T.addOutputLine('<span class="tp-ok">' + status + ' Post #' + id + ' — ' + data.likes_count + ' likes</span>');
      T.toast(status + ' Post #' + id, 'ok');
      T.feedData.forEach(function(p) {
        if (p.id === id) {
          p.liked = data.status === 'liked';
          p.likes = data.likes_count;
        }
      });
      var btn = document.querySelector('.like-btn[data-post-id="' + id + '"]');
      if (btn) {
        btn.dataset.liked = data.status === 'liked' ? 'true' : 'false';
        var heart = data.status === 'liked' ? '\u2665' : '\u2661';
        var count = data.likes_count > 0 ? ' ' + data.likes_count : '';
        btn.innerHTML = '[' + heart + count + ' like]';
      }
    })
    .catch(function(err) {
      T.hideLoading();
      T.addOutputLine('<span class="tp-err">error: ' + T.escapeHtml(err.message) + '</span>');
    });
  };

  // ── COMMAND: comment ──
  T.cmdComment = function(id, text) {
    if (!T.isLoggedIn) {
      T.addOutputLine('<span class="tp-err">comment: ' + T._('Требуется вход.', 'Login required.') + '</span>');
      T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
      return;
    }
    var csrf = document.querySelector('meta[name="csrf-token"]');
    T.showLoading('Adding comment');

    fetch(window.COMMENT_URL.replace('/0/', '/' + id + '/'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': csrf.content
      },
      body: JSON.stringify({ text: text }),
      credentials: 'same-origin'
    })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(data) {
      T.hideLoading();
      T.addSysLine('<span class="tp-ok">Comment added to post #' + id + '</span>');
      T.toast('Comment added', 'ok');
      T.feedData.forEach(function(p) {
        if (p.id === id) p.comments = (p.comments || 0) + 1;
      });
    })
    .catch(function(err) {
      T.hideLoading();
      T.addOutputLine('<span class="tp-err">error: ' + T.escapeHtml(err.message) + '</span>');
    });
  };

  // ── COMMAND: follow/unfollow ──
  T.cmdFollow = function(action, targetUser) {
    if (!T.isLoggedIn) {
      T.addOutputLine('<span class="tp-err">follow: ' + T._('Требуется вход.', 'Login required.') + '</span>');
      T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
      return;
    }
    var csrf = document.querySelector('meta[name="csrf-token"]');
    T.showLoading('@' + targetUser);

    fetch(window.FOLLOW_URL + targetUser, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': csrf.content
      },
      credentials: 'same-origin'
    })
    .then(function(r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    })
    .then(function(data) {
      T.hideLoading();
      var icon = data.status === 'followed' ? '+' : '-';
      T.addSysLine('<span class="tp-ok">' + icon + ' @' + T.escapeHtml(targetUser) + ' — ' + data.followers_count + ' followers</span>');
      T.toast(icon + ' @' + targetUser, 'ok');
    })
    .catch(function(err) {
      T.hideLoading();
      var msg = err.message;
      if (msg === '404') {
        msg = 'error: user @' + targetUser + ' not found';
      } else if (msg === '401') {
        msg = 'error: login required';
      } else if (msg === '500') {
        msg = 'error: server error';
      }
      T.addOutputLine('<span class="tp-err">' + T.escapeHtml(msg) + '</span>');
    });
  };

  // ── COMMAND: bookmark ──
  T.cmdBookmark = function(id) {
    if (!T.isLoggedIn) {
      T.addOutputLine('<span class="tp-err">bookmark: ' + T._('Требуется вход.', 'Login required.') + '</span>');
      T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
      return;
    }
    var csrf = document.querySelector('meta[name="csrf-token"]');
    T.showLoading('Saving post #' + id);

    fetch(window.SAVE_URL.replace('/0/', '/' + id + '/'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': csrf.content
      },
      credentials: 'same-origin'
    })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(data) {
      T.hideLoading();
      var icon = data.is_saved ? '*' : '#';
      T.addSysLine('<span class="tp-ok">' + icon + ' Post #' + id + (data.is_saved ? ' saved' : ' unsaved') + '</span>');
      T.toast(icon + ' Post #' + id, 'ok');
    })
    .catch(function(err) {
      T.hideLoading();
      T.addOutputLine('<span class="tp-err">error: ' + T.escapeHtml(err.message) + '</span>');
    });
  };

  // ── COMMAND: whoami (neofetch-style profile) ──
  T.cmdWhoami = function() {
    if (!T.isLoggedIn) {
      T.addOutputLine('<span class="tp-muted">' + T._('Не в системе.', 'Not logged in.') + '</span>');
      T.addOutputLine('<span class="tp-desc">' + T._('Используйте ', 'Use ') + '<span class="tp-cmd">login</span> ' + T._('или', 'or') + ' <span class="tp-cmd">register</span> ' + T._('для входа.', 'to authenticate.') + '</span>');
      T.addOutputLine('<span class="tp-desc">' + T._('Гостевые команды: ', 'Guest commands: ') + '<span class="tp-cmd">feed</span>, <span class="tp-cmd">cat &lt;id&gt;</span>, <span class="tp-cmd">neofetch @user</span>, <span class="tp-cmd">followers --of @user</span></span>');
      return;
    }
    T.renderNeofetch(T.username, 'No description', null);
    // Also fetch to get fresh data
    fetch(window.API_ME_URL, { credentials: 'same-origin' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.authenticated) {
        T.username = data.user.username;
        T.currentUserId = data.user.id || T.currentUserId;
        T.updatePrompt();
      }
    })
    .catch(function() {});
  };

  // ── COMMAND: id (Unix-style user info) ──
  T.cmdId = function(args) {
    args = (args || '').trim();
    var userMatch = args.match(/^@?(\w+)$/);
    if (userMatch) {
      T.addOutputLine('uid=0(' + T.escapeHtml(userMatch[1]) + ') gid=0(' + T.escapeHtml(userMatch[1]) + ') groups=0(' + T.escapeHtml(userMatch[1]) + ')');
      return;
    }
    if (T.isLoggedIn) {
      T.addOutputLine('uid=' + T.currentUserId + '(' + T.escapeHtml(T.username) + ') gid=' + T.currentUserId + '(' + T.escapeHtml(T.username) + ') groups=' + T.currentUserId + '(' + T.escapeHtml(T.username) + ')');
    } else {
      T.addOutputLine('uid=0(guest) gid=0(guest) groups=0(guest)');
    }
  };

  // ── COMMAND: alias ──
  T.cmdAlias = function(args) {
    args = (args || '').trim();
    if (!args) {
      var aliases = T._loadAliases();
      var keys = Object.keys(aliases);
      if (!keys.length) { T.addOutputLine('<span class="tp-muted">no aliases</span>'); return; }
      keys.sort().forEach(function(k) {
        T.addOutputLine('alias ' + T.escapeHtml(k) + '="' + T.escapeHtml(aliases[k]) + '"');
      });
      return;
    }
    var m = args.match(/^(\w+)=['"]?(.+?)['"]?$/);
    if (m) {
      var aliases = T._loadAliases();
      aliases[m[1]] = m[2];
      T._saveAliases(aliases);
      T.addOutputLine('<span class="tp-ok">' + T.escapeHtml(m[1]) + ' aliased to "' + T.escapeHtml(m[2]) + '"</span>');
      return;
    }
    T.addOutputLine('<span class="tp-err">alias: invalid syntax. Usage: alias name="command"</span>');
  };

  // ── COMMAND: rm — с корзиной, -f флагом (VFS-powered) ──
  T.cmdRm = function(args) {
    args = (args || '').trim();
    var force = false;

    // Parse -f flag
    if (args.indexOf('-f ') === 0 || args === '-f') {
      force = true;
      args = args.replace(/^-f\s*/, '').trim();
      if (!args) {
        T.addOutputLine('<span class="tp-err">Usage: rm [-f] &lt;path&gt; | rm comment &lt;id&gt;</span>');
        return;
      }
    }

    // rm comment <id> — не path-based
    var commentMatch = args.match(/^comment\s+(\d+)$/i);
    if (commentMatch) {
      if (!T.isLoggedIn) {
        T.addOutputLine('<span class="tp-err">rm: ' + T._('Требуется вход.', 'Login required.') + '</span>');
        T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
        return;
      }
      var commentId = parseInt(commentMatch[1], 10);
      T.showLoading(T._('Удаление комментария...', 'Deleting comment...'));
      var token = T.csrfToken();
      fetch('/comment/' + commentId, {
        method: 'DELETE',
        headers: { 'X-CSRFToken': token ? token.content : '', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin'
      })
      .then(function(r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.json();
      })
      .then(function() {
        T.hideLoading();
        T.addSysLine('<span class="tp-ok">' + T._('Комментарий #', 'Comment #') + commentId + ' ' + T._('удалён', 'deleted') + '</span>');
        T.toast(T._('Комментарий удалён', 'Comment deleted'), 'ok');
      })
      .catch(function() {
        T.hideLoading();
        T.addOutputLine('<span class="tp-err">rm: ' + T._('ошибка удаления комментария #', 'could not delete comment #') + commentId + '</span>');
      });
      return;
    }

    // ── VFS resolution ──
    var node = T.vfs.resolve(args);
    if (node && !node.error && typeof node.remove === 'function') {
      if (force) {
        // -f: удалить навсегда, минуя корзину
        node.remove(T.addOutputLine, true);
      } else {
        node.remove(T.addOutputLine, false);
      }
      return;
    }

    // ── Fallback: голый номер (из контекста posts) ──
    var idMatch = args.match(/^(\d+)$/i);
    if (idMatch && T.cwd === 'posts') {
      if (!T.isLoggedIn) {
        T.addOutputLine('<span class="tp-err">rm: ' + T._('Требуется вход.', 'Login required.') + '</span>');
        return;
      }
      // Ищем пост в feedData
      var postId = parseInt(idMatch[1], 10);
      var post = null;
      for (var i = 0; i < T.feedData.length; i++) {
        if (T.feedData[i].id === postId) { post = T.feedData[i]; break; }
      }
      if (!post) {
        T.addOutputLine('<span class="tp-err">rm: ' + T._('пост #', 'post #') + postId + ' ' + T._('не найден', 'not found') + '</span>');
        return;
      }
      var isOwn = T.username && post.author && post.author.toLowerCase() === T.username.toLowerCase();
      if (!isOwn) {
        T.addOutputLine('<span class="tp-err">rm: ' + T._('нельзя удалять чужие посты', 'cannot delete other users\' posts') + '</span>');
        return;
      }
      if (force) {
        T.showLoading(T._('Удаление навсегда...', 'Deleting permanently...'));
        var token = T.csrfToken();
        fetch('/delete/' + postId, {
          method: 'DELETE',
          headers: { 'X-CSRFToken': token ? token.content : '', 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'same-origin'
        }).then(function(r) {
          if (!r.ok) throw new Error();
          T.hideLoading();
          T.feedData = T.feedData.filter(function(p) { return p.id !== postId; });
          T.addSysLine('<span class="tp-ok">' + T._('Пост #', 'Post #') + postId + ' ' + T._('удалён навсегда', 'permanently deleted') + '</span>');
          T.toast(T._('Пост удалён', 'Post deleted'), 'ok');
        }).catch(function() {
          T.hideLoading();
          T.addOutputLine('<span class="tp-err">rm: ' + T._('ошибка удаления поста #', 'could not delete post #') + postId + '</span>');
        });
      } else {
        // В корзину
        T._movePostToTrash(post);
        T.feedData = T.feedData.filter(function(p) { return p.id !== postId; });
        T.addSysLine('<span class="tp-ok">' + T._('Пост #', 'Post #') + postId + ' ' + T._('перемещён в корзину', 'moved to trash') + '</span>');
        T.addOutputLine('<span class="tp-muted">  # <span class="tp-cmd">rm -f ' + postId + '</span> ' + T._('для безвозвратного удаления', 'to delete permanently') + '</span>');
      }
      return;
    }

    T.addOutputLine('<span class="tp-err">rm: ' + T._('использование: rm [-f] &lt;id&gt; | rm comment &lt;id&gt; | rm &lt;path&gt;', 'usage: rm [-f] &lt;id&gt; | rm comment &lt;id&gt; | rm &lt;path&gt;') + '</span>');
  };

  // ── Trash helper (shared between VFS and fallback) ──
  T._movePostToTrash = function(post) {
    try {
      var trash = JSON.parse(localStorage.getItem('rugram_trash')) || [];
      trash.push({
        id: post.id, author: post.author, text: post.text, time: post.time,
        likes: post.likes, image: post.image,
        original_path: 'posts/' + post.id + '.post',
        deleted_at: new Date().toISOString(),
      });
      localStorage.setItem('rugram_trash', JSON.stringify(trash));
    } catch(e) {}
  };

  // ── COMMAND: source — load and run scripts ──
  T.cmdSource = function(args) {
    args = (args || '').trim();
    // Load scripts from localStorage
    var scripts = {};
    try { scripts = JSON.parse(localStorage.getItem('rugram_scripts')) || {}; } catch(e) {}

    if (!args) {
      var keys = Object.keys(scripts);
      if (!keys.length) {
        T.addOutputLine('<span class="tp-muted">no scripts. Use <span class="tp-cmd">source --save name</span> followed by commands, or <span class="tp-cmd">alias</span> to see aliases.</span>');
        return;
      }
      T.addOutputLine('<span class="tp-section">Scripts:</span>');
      keys.sort().forEach(function(k) {
        T.addOutputLine('  <span class="tp-cmd">' + T.escapeHtml(k) + '</span>  <span class="tp-desc">' + T.escapeHtml(scripts[k].substring(0, 80)) + '</span>');
      });
      return;
    }

    // source --save <name> <command...>
    var saveMatch = args.match(/^--save\s+(\w+)\s+(.+)$/);
    if (saveMatch) {
      var name = saveMatch[1];
      var cmds = saveMatch[2];
      scripts[name] = cmds;
      localStorage.setItem('rugram_scripts', JSON.stringify(scripts));
      T.addOutputLine('<span class="tp-ok">script "' + T.escapeHtml(name) + '" saved</span>');
      return;
    }

    // source --rm <name>
    var rmMatch = args.match(/^--rm\s+(\w+)$/);
    if (rmMatch) {
      if (scripts[rmMatch[1]]) {
        delete scripts[rmMatch[1]];
        localStorage.setItem('rugram_scripts', JSON.stringify(scripts));
        T.addOutputLine('<span class="tp-ok">script "' + T.escapeHtml(rmMatch[1]) + '" removed</span>');
      } else {
        T.addOutputLine('<span class="tp-err">source: script "' + T.escapeHtml(rmMatch[1]) + '" not found</span>');
      }
      return;
    }

    // source <name> — run the script
    if (scripts[args]) {
      T.addSysLine('<span class="tp-ok">Running script "' + T.escapeHtml(args) + '"...</span>');
      T.processCommand(scripts[args]);
      return;
    }

    T.addOutputLine('<span class="tp-err">source: ' + T.escapeHtml(args) + ': script not found</span>');
  };

  // ── COMMAND: unalias ──
  T.cmdUnalias = function(args) {
    args = (args || '').trim();
    if (!args) { T.addOutputLine('<span class="tp-err">unalias: usage: unalias name</span>'); return; }
    var aliases = T._loadAliases();
    if (aliases[args] !== undefined) {
      delete aliases[args];
      T._saveAliases(aliases);
      T.addOutputLine('<span class="tp-ok">unalias: ' + T.escapeHtml(args) + ' removed</span>');
    } else {
      T.addOutputLine('<span class="tp-err">unalias: ' + T.escapeHtml(args) + ': not found</span>');
    }
  };

  // ── Render neofetch ──
  T.renderNeofetch = function(name, desc, imageUrl) {
    T.addSysLine('<span class="tp-section">User: ' + T.escapeHtml(name) + '</span>');
    var artId = 'neo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    var html = '<div class="tp-neofetch">';
    html += '  <div class="tp-neofetch-row">';
    html += '    <div class="tp-neofetch-art">';
    html += '      <pre id="' + artId + '">';
    html += '             ___\n';
    html += '            /   \\\n';
    html += '       .-. |O O  |\n';
    html += '       |_| |     |\n';
    html += '      /   \\|  U  |\n';
    html += '     /     \\ ___ /\n';
    html += '    |  _   |/   \\\n';
    html += '    | |_|  |     |\n';
    html += '    |      |  _  |\n';
    html += '     \\    /| |_| |\n';
    html += '      \\__/ \\___/\n';
    html += '      </pre>';
    html += '    </div>';
    html += '    <div class="tp-neofetch-info">';
    html += '      <span class="tp-bold">' + T.escapeHtml(name) + '</span>\n';
    html += '      <span class="tp-muted">OS:</span> tty.so v' + T.APP_VERSION + '\n';
    html += '      <span class="tp-muted">Shell:</span> rugram-terminal 2026\n';
    html += '      <span class="tp-muted">Uptime:</span> ' + Math.floor(Math.random() * 99 + 1) + 'h\n';
    html += '      <span class="tp-muted">Posts:</span> ' + T.feedData.filter(function(p) { return p.author.toLowerCase() === name.toLowerCase(); }).length + '\n';
    html += '      <span class="tp-muted">Bio:</span> ' + T.escapeHtml(desc) + '\n';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';
    T.addOutput(html);

    if (imageUrl) {
      T.imageToAscii(imageUrl, 22, function(ascii) {
        var pre = document.getElementById(artId);
        if (pre) pre.innerHTML = ascii;
      });
    } else if (T.asciiCache[T.DEFAULT_AVATAR_URL]) {
      var pre = document.getElementById(artId);
      if (pre) pre.innerHTML = T.asciiCache[T.DEFAULT_AVATAR_URL];
    }
  };

  // ── COMMAND: neofetch @user ──
  T.cmdNeofetch = function(targetUser) {
    T.addSysLine('<span class="tp-muted">Looking up @' + T.escapeHtml(targetUser) + '...</span>');
    fetch(window.API_USERS_SEARCH_URL + '?q=' + encodeURIComponent(targetUser), {
      credentials: 'same-origin'
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var user = data.users && data.users.find(function(u) {
        return u.username.toLowerCase() === targetUser.toLowerCase();
      });
      if (user) {
        T._showNeofetch(targetUser, user.is_online || false, user.profile_image);
      } else {
        T.addSysLine('<span class="tp-err">neofetch: @' + T.escapeHtml(targetUser) + ': user not found</span>');
      }
    })
    .catch(function() {
      T.addSysLine('<span class="tp-err">neofetch: @' + T.escapeHtml(targetUser) + ': request failed</span>');
    });
  };

  // ── Internal neofetch display ──
  T._showNeofetch = function(username, isOnline, imageUrl) {
    var desc = 'Active user';
    var postsCount = T.feedData.filter(function(p) {
      return p.author.toLowerCase() === username.toLowerCase();
    }).length;
    var onlineIcon = isOnline ? '<span class="tp-ok">●</span>' : '<span class="tp-muted">○</span>';

    if (imageUrl) {
      var artId = 'neo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      T.addSysLine('<span class="tp-section">User: @' + T.escapeHtml(username) + '</span>');
      var html = '<div class="tp-neofetch">';
      html += '  <div class="tp-neofetch-row">';
      html += '    <div class="tp-neofetch-art">';
      html += '      <pre id="' + artId + '">';
      html += '       ________\n';
      html += '      |        |\n';
      html += '      | loading |\n';
      html += '      |________|\n';
      html += '      </pre>';
      html += '    </div>';
      html += '    <div class="tp-neofetch-info">';
      html += '      <span class="tp-bold">@' + T.escapeHtml(username) + '</span>\n';
      html += '      <span class="tp-muted">OS:</span> tty.so v' + T.APP_VERSION + '\n';
      html += '      <span class="tp-muted">Shell:</span> rugram-terminal 2026\n';
      html += '      <span class="tp-muted">Posts:</span> ' + String(postsCount) + '\n';
      html += '      ' + onlineIcon + ' <span class="tp-muted">Status:</span> ' + (isOnline ? '<span class="tp-ok">online</span>' : '<span class="tp-muted">offline</span>') + '\n';
      html += '      <span class="tp-muted">Bio:</span> ' + T.escapeHtml(desc) + '\n';
      html += '    </div>';
      html += '  </div>';
      html += '</div>';
      T.addOutput(html);
      T.addOutputLine('<span class="tp-desc"># <span class="tp-cmd">follow @' + T.escapeHtml(username) + '</span> to subscribe</span>');

      T.imageToAscii(imageUrl, 22, function(ascii) {
        var pre = document.getElementById(artId);
        if (pre) pre.innerHTML = ascii;
      });
      return;
    }

    if (imageUrl === null && T.asciiCache[T.DEFAULT_AVATAR_URL]) {
      var artId = 'neo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      T.addSysLine('<span class="tp-section">User: @' + T.escapeHtml(username) + '</span>');
      var html = '<div class="tp-neofetch">';
      html += '  <div class="tp-neofetch-row">';
      html += '    <div class="tp-neofetch-art">';
      html += '      <pre id="' + artId + '">' + T.asciiCache[T.DEFAULT_AVATAR_URL] + '</pre>';
      html += '    </div>';
      html += '    <div class="tp-neofetch-info">';
      html += '      <span class="tp-bold">@' + T.escapeHtml(username) + '</span>\n';
      html += '      <span class="tp-muted">OS:</span> tty.so v' + T.APP_VERSION + '\n';
      html += '      <span class="tp-muted">Shell:</span> rugram-terminal 2026\n';
      html += '      <span class="tp-muted">Posts:</span> ' + String(postsCount) + '\n';
      html += '      ' + onlineIcon + ' <span class="tp-muted">Status:</span> ' + (isOnline ? '<span class="tp-ok">online</span>' : '<span class="tp-muted">offline</span>') + '\n';
      html += '      <span class="tp-muted">Bio:</span> ' + T.escapeHtml(desc) + '\n';
      html += '    </div>';
      html += '  </div>';
      html += '</div>';
      T.addOutput(html);
      T.addOutputLine('<span class="tp-desc"># <span class="tp-cmd">follow @' + T.escapeHtml(username) + '</span> to subscribe</span>');
      return;
    }

    T.addSysLine('<span class="tp-section">User: @' + T.escapeHtml(username) + '</span>');
    T.addOutputLine('<span class="tp-muted">OS:</span> tty.so v' + T.APP_VERSION);
    T.addOutputLine('<span class="tp-muted">Shell:</span> rugram-terminal 2026');
    T.addOutputLine('<span class="tp-muted">Posts:</span> ' + String(postsCount));
    T.addOutputLine(onlineIcon + ' <span class="tp-muted">Status:</span> ' + (isOnline ? '<span class="tp-ok">online</span>' : '<span class="tp-muted">offline</span>'));
    T.addOutputLine('<span class="tp-muted">Bio:</span> ' + T.escapeHtml(desc));
    T.addOutputLine('<span class="tp-desc"># <span class="tp-cmd">follow @' + T.escapeHtml(username) + '</span> to subscribe</span>');
  };

  // ── COMMAND: grep ──
  T.cmdGrep = function(query) {
    if (!T.feedData.length) {
      if (!T._fetchingFeed) {
        T._fetchingFeed = true;
        T.showLoading('Fetching feed...');
        T.fetchFeedFromAPI(function() {
          T.hideLoading();
          T._fetchingFeed = false;
          T.cmdGrep(query);
        });
        return;
      }
      T.addOutputLine('<span class="tp-muted">grep: feed is empty</span>');
      return;
    }
    var q = query.toLowerCase();
    var results = T.feedData.filter(function(p) {
      return p.text.toLowerCase().includes(q) || p.author.toLowerCase().includes(q);
    });
    if (!results.length) {
      T.addOutputLine('<span class="tp-err">grep: no matches for "' + T.escapeHtml(query) + '"</span>');
      return;
    }
    T.addSysLine('<span class="tp-section">grep "' + T.escapeHtml(query) + '" — ' + results.length + ' matches</span>');
    T.renderFeed(results);
  };

  // ── COMMAND: notifications ──
  T.cmdNotifications = function() {
    if (!T.isLoggedIn) {
      T.addOutputLine('<span class="tp-err">notifications: ' + T._('Требуется вход.', 'Login required.') + '</span>');
      T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
      return;
    }
    T.showLoading('Loading notifications...');
    fetch(window.API_NOTIFICATIONS_URL)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        T.hideLoading();
        if (!data.notifications.length) {
          T.addOutputLine('<span class="tp-muted">No notifications.</span>');
          return;
        }
        // Build items for program view (less)
        var items = data.notifications.map(function(n) {
          var icon = n.type === 'like' ? '+' : n.type === 'comment' ? 'c' : '>';
          var msg = n.type === 'like' ? T._('лайкнул(а) ваш пост', 'liked your post') :
                    n.type === 'comment' ? T._('прокомментировал(а) ваш пост', 'commented on your post') :
                    T._('подписался(ась) на вас', 'followed you');
          return {
            id: n.id,
            author: n.actor.username,
            time: n.created_date,
            text: icon + ' ' + msg,
            is_read: n.is_read,
            post_id: n.post_id
          };
        });
        T.enterLessMode(items, T._('Уведомления', 'Notifications') + ' (' + items.length + ')', function(item) {
          T._exitLessMode();
          if (item.post_id) T.cmdPostView(item.post_id);
        });
      })
      .catch(function() {
        T.hideLoading();
        T.addOutputLine('<span class="tp-err">error: could not load notifications</span>');
      });
  };

  // ── COMMAND: saved ──
  T.cmdSaved = function(args) {
    if (!T.isLoggedIn) {
      T.addOutputLine('<span class="tp-err">saved: ' + T._('Требуется вход.', 'Login required.') + '</span>');
      T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
      return;
    }
    args = (args || '').trim().toLowerCase();

    var tailN = null;
    var inlineMode = /\b--inline\b/.test(args);
    var tailMatch = args.match(/--tail\s+(\d+)/);
    if (tailMatch) tailN = parseInt(tailMatch[1], 10);

    T.showLoading(T._('Загрузка сохранённого...', 'Loading saved posts...'));
    fetch('/api/saved', { credentials: 'same-origin' })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        T.hideLoading();
        var posts = data.posts || [];

        if (!posts.length) {
          T.addOutputLine('<span class="tp-muted">  ' + T._('Нет сохранённых постов.', 'No saved posts.') + '</span>');
          return;
        }

        // Tail
        if (tailN) posts = posts.slice(-tailN);

        // Default: program view (less)
        if (!inlineMode && !tailN) {
          T.enterLessMode(posts, T._('Сохранённое', 'Saved') + ' (' + posts.length + ')', function(item) {
            T._exitLessMode();
            T.cmdPostView(item.id);
          });
          return;
        }

        T.addOutputLine('<span class="tp-section">-- /saved -- (' + posts.length + ' posts)</span>');
        posts.forEach(function(p) {
          var timeDisplay = p.time && p.time.indexOf('T') > 0 ? T.relTime(p.time) : (p.time || '');
          T.addOutputLine('  #' + p.id + '  <span class="tp-post-author">@' + T.escapeHtml(p.author) + '</span>  <span class="tp-post-time">' + T.escapeHtml(timeDisplay) + '</span>');
          T.addOutputLine('  ' + T.escapeHtml(p.text.substring(0, 200)));
          if (p.image) T.addOutputLine('  <span class="tp-muted">[img]</span>');
          var liked = p.is_liked ? '<span class="tp-ok">+</span>' : '-';
          T.addOutputLine('  ' + liked + ' ' + p.likes + '  c:' + p.comments + '  #' + p.id);
        });
        T.addSysLine('<span class="tp-muted">' + posts.length + ' ' + T._('пост(а/ов)', 'post(s)') + '</span>');
      })
      .catch(function(err) {
        T.hideLoading();
        T.addOutputLine('<span class="tp-err">' + T._('Ошибка загрузки сохранённого.', 'Error loading saved posts.') + '</span>');
      });
  };

  // ── COMMAND: create ──
  T.cmdCreate = function() {
    if (!T.isLoggedIn) {
      T.addOutputLine('<span class="tp-err">create: ' + T._('Требуется вход.', 'Login required.') + '</span>');
      T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
      return;
    }
    T.showNanoEditor('create', null, '', function(newText) {
      if (!newText.trim()) {
        throw new Error('empty post');
      }
      return fetch('/api/v1/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': T.csrfToken().content,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ text: newText }),
        credentials: 'same-origin'
      });
    });
  };

  // ── COMMAND: followers [--of @user] [--less] ──
  T.cmdFollowers = function(args) {
    args = (args || '').trim();
    var inlineMode = /\b--inline\b/.test(args);
    var ofMatch = args.match(/--of\s+@?(\w+)/);
    var user = ofMatch ? ofMatch[1] : (T.isLoggedIn ? T.username : null);

    if (!user) {
      if (!T.isLoggedIn) {
        T.addOutputLine('<span class="tp-err">followers: ' + T._('Требуется вход.', 'Login required.') + '</span>');
        T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span>, or <span class="tp-cmd">followers --of @user</span></span>');
      } else {
        T.addOutputLine('<span class="tp-err">followers: ' + T._('пользователь не определён', 'could not resolve current user') + '</span>');
        T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">followers --of @user</span></span>');
      }
      return;
    }
    T.showLoading(T._('Загрузка подписчиков...', 'Loading followers...'));
    fetch('/api/followers/' + encodeURIComponent(user), { credentials: 'same-origin' })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        T.hideLoading();
        var users = data.users || [];

        if (!users.length) {
          T.addOutputLine('<span class="tp-muted">  ' + T._('Нет подписчиков.', 'No followers.') + '</span>');
          return;
        }

        // Default: program view (less)
        if (!inlineMode) {
          T.enterLessMode(users, T._('Подписчики', 'Followers') + ' (' + user + ')', function(item) {
            T._exitLessMode();
            T.cmdNeofetch(item.username);
          });
          return;
        }

        T.addOutputLine('<span class="tp-section">-- /followers (' + T.escapeHtml(user) + ') -- (' + users.length + ')</span>');
        users.forEach(function(u) {
          var online = u.is_online ? '<span class="tp-ok">●</span>' : '<span class="tp-muted">○</span>';
          T.addOutputLine('  ' + online + ' <span class="tp-post-author">@' + T.escapeHtml(u.username) + '</span>');
          if (u.description) T.addOutputLine('    <span class="tp-muted">' + T.escapeHtml(u.description.substring(0, 80)) + '</span>');
        });
      })
      .catch(function() {
        T.hideLoading();
        T.addOutputLine('<span class="tp-err">' + T._('Ошибка загрузки подписчиков.', 'Error loading followers.') + '</span>');
      });
  };

  // ── COMMAND: following [--of @user] [--less] ──
  T.cmdFollowing = function(args) {
    args = (args || '').trim();
    var inlineMode = /\b--inline\b/.test(args);
    var ofMatch = args.match(/--of\s+@?(\w+)/);
    var user = ofMatch ? ofMatch[1] : (T.isLoggedIn ? T.username : null);

    if (!user) {
      if (!T.isLoggedIn) {
        T.addOutputLine('<span class="tp-err">following: ' + T._('Требуется вход.', 'Login required.') + '</span>');
        T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span>, or <span class="tp-cmd">following --of @user</span></span>');
      } else {
        T.addOutputLine('<span class="tp-err">following: ' + T._('пользователь не определён', 'could not resolve current user') + '</span>');
        T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">following --of @user</span></span>');
      }
      return;
    }
    T.showLoading(T._('Загрузка подписок...', 'Loading following...'));
    fetch('/api/following/' + encodeURIComponent(user), { credentials: 'same-origin' })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        T.hideLoading();
        var users = data.users || [];

        if (!users.length) {
          T.addOutputLine('<span class="tp-muted">  ' + T._('Нет подписок.', 'Not following anyone.') + '</span>');
          return;
        }

        // Default: program view (less)
        if (!inlineMode) {
          T.enterLessMode(users, T._('Подписки', 'Following') + ' (' + user + ')', function(item) {
            T._exitLessMode();
            T.cmdNeofetch(item.username);
          });
          return;
        }

        T.addOutputLine('<span class="tp-section">-- /following (' + T.escapeHtml(user) + ') -- (' + users.length + ')</span>');
        users.forEach(function(u) {
          var online = u.is_online ? '<span class="tp-ok">●</span>' : '<span class="tp-muted">○</span>';
          T.addOutputLine('  ' + online + ' <span class="tp-post-author">@' + T.escapeHtml(u.username) + '</span>');
          if (u.description) T.addOutputLine('    <span class="tp-muted">' + T.escapeHtml(u.description.substring(0, 80)) + '</span>');
        });
      })
      .catch(function() {
        T.hideLoading();
        T.addOutputLine('<span class="tp-err">' + T._('Ошибка загрузки подписок.', 'Error loading following.') + '</span>');
      });
  };

  // ── COMMAND: cd post <id> ──
  T.cmdPostView = function(postId) {
    T.showLoading(T._('Загрузка поста...', 'Loading post...'));
    fetch('/api/v1/posts/' + postId, { credentials: 'same-origin' })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        T.hideLoading();
        var p = data.post;
        if (!p || p.is_deleted) {
          T.addOutputLine('<span class="tp-err">' + T._('Пост #', 'Post #') + postId + ' ' + T._('не найден или удалён.', 'not found or deleted.') + '</span>');
          return;
        }
        var timeDisplay = p.time && p.time.indexOf('T') > 0 ? T.relTime(p.time) : (p.time || '');
        T.addOutputLine('<span class="tp-section">-- Post #' + p.id + ' --</span>');
        T.addOutputLine('  <span class="tp-post-author">@' + T.escapeHtml(p.author) + '</span>  <span class="tp-post-time">' + T.escapeHtml(timeDisplay) + '</span>');
        T.addOutputLine('');
        T.addOutputLine('  ' + T.escapeHtml(p.text));
        if (p.image) {
          T.addOutputLine('  <span class="tp-muted">[img: ' + T.escapeHtml(p.image) + ']</span>');
        }
        T.addOutputLine('');
        var liked = p.is_liked ? '<span class="tp-ok">♥</span>' : '♡';
        var saved = p.is_saved ? '<span class="tp-ok">★</span>' : '☆';
        T.addOutputLine('  ' + liked + ' ' + p.likes + '  c:' + p.comments + '  r:' + p.reposts + '  ' + saved);
        T.addOutputLine('');
        T.addOutputLine('<span class="tp-desc"># <span class="tp-cmd">like ' + p.id + '</span>  <span class="tp-cmd">comment ' + p.id + ' "..."</span>  <span class="tp-cmd">bookmark ' + p.id + '</span></span>');
      })
      .catch(function() {
        T.hideLoading();
        T.addOutputLine('<span class="tp-err">' + T._('Ошибка загрузки поста #', 'Error loading post #') + postId + '</span>');
      });
  };

  // ── COMMAND: ping ──
  T.cmdPing = function(target) {
    target = (target || '').replace(/^@/, '').trim();
    var PACKETS = 4;
    var seq = 0;
    var rtts = [];
    var received = 0;

    if (!target) {
      T.addOutputLine('PING 127.0.0.1 (127.0.0.1): 56 data bytes');
      function sendLocal() {
        if (seq >= PACKETS) {
          T.addOutputLine('--- 127.0.0.1 ping statistics ---');
          T.addOutputLine(PACKETS + ' packets transmitted, ' + received + ' received, ' +
            Math.round((PACKETS - received) / PACKETS * 100) + '% packet loss');
          if (rtts.length) {
            var min = Math.min.apply(null, rtts);
            var max = Math.max.apply(null, rtts);
            var avg = rtts.reduce(function(a,b) { return a+b; }, 0) / rtts.length;
            var vari = rtts.reduce(function(a,b) { return a + (b-avg)*(b-avg); }, 0) / rtts.length;
            var mdev = Math.sqrt(vari);
            T.addOutputLine('rtt min/avg/max/mdev = ' +
              min.toFixed(2) + '/' + avg.toFixed(2) + '/' + max.toFixed(2) + '/' + mdev.toFixed(2) + ' ms');
          }
          return;
        }
        var ms = Math.random() * 2 + 0.2;
        rtts.push(ms);
        received++;
        T.addOutputLine('64 bytes from 127.0.0.1: icmp_seq=' + seq + ' ttl=64 time=' + ms.toFixed(2) + ' ms');
        seq++;
        setTimeout(sendLocal, Math.random() * 200 + 50);
      }
      sendLocal();
      return;
    }

    var apiStart = Date.now();
    var userFound = null;
    T.addOutputLine('PING @' + T.escapeHtml(target) + ' (' + window.location.host + '): 56 data bytes');

    fetch(window.API_USERS_SEARCH_URL + '?q=' + encodeURIComponent(target), {
      credentials: 'same-origin'
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      userFound = data.users && data.users.find(function(u) {
        return u.username.toLowerCase() === target.toLowerCase();
      });
      var apiTime = Date.now() - apiStart;

      if (!userFound) {
        for (var i = 0; i < PACKETS; i++) {
          (function(s) {
            setTimeout(function() {
              T.addOutputLine('<span class="tp-err">From ' + window.location.host + ' icmp_seq=' + s + ' Destination Host Unreachable</span>');
              seq++;
              if (seq >= PACKETS) {
                T.addOutputLine('--- @' + T.escapeHtml(target) + ' ping statistics ---');
                T.addOutputLine(PACKETS + ' packets transmitted, 0 received, 100% packet loss');
              }
            }, Math.random() * 300 + 100);
          })(i);
        }
        return;
      }

      function sendUser() {
        if (seq >= PACKETS) {
          T.addOutputLine('--- @' + T.escapeHtml(target) + ' ping statistics ---');
          T.addOutputLine(PACKETS + ' packets transmitted, ' + received + ' received, ' +
            Math.round((PACKETS - received) / PACKETS * 100) + '% packet loss');
          if (rtts.length) {
            var min = Math.min.apply(null, rtts);
            var max = Math.max.apply(null, rtts);
            var avg = rtts.reduce(function(a,b) { return a+b; }, 0) / rtts.length;
            var vari = rtts.reduce(function(a,b) { return a + (b-avg)*(b-avg); }, 0) / rtts.length;
            var mdev = Math.sqrt(vari);
            T.addOutputLine('rtt min/avg/max/mdev = ' +
              min.toFixed(2) + '/' + avg.toFixed(2) + '/' + max.toFixed(2) + '/' + mdev.toFixed(2) + ' ms');
          }
          return;
        }

        var ms;
        if (seq === 0) {
          ms = Math.max(apiTime, Math.random() * 30 + 10);
        } else {
          ms = (rtts[0] || 30) + (Math.random() * 20 - 10);
          if (ms < 5) ms = 5;
        }
        rtts.push(ms);
        received++;

        var ttl = 64 - Math.floor(Math.random() * 20 + 2);
        T.addOutputLine('64 bytes from @' + T.escapeHtml(target) + ' (' + window.location.host + '): icmp_seq=' + seq +
          ' ttl=' + ttl + ' time=' + ms.toFixed(2) + ' ms');
        seq++;
        setTimeout(sendUser, Math.random() * 200 + 50);
      }

      setTimeout(sendUser, 50);
    })
    .catch(function() {
      T.addOutputLine('<span class="tp-err">ping: ' + T.escapeHtml(target) + ': Temporary failure in name resolution</span>');
    });
  };

  // ── COMMAND: fortune ──
  T.cmdFortune = function() {
    var q = T.fortuneQuotes[Math.floor(Math.random() * T.fortuneQuotes.length)];
    T.addOutputLine('<span class="tp-ok">' + T.escapeHtml(q) + '</span>');
    T.addOutputLine('<span class="tp-desc">    — programmer wisdom</span>');
  };

  // ── COMMAND: date ──
  T.cmdDate = function(utc) {
    var d = new Date();
    var ds, tz;
    if (utc) {
      ds = d.toUTCString();
      tz = 'UTC';
    } else {
      ds = d.toLocaleString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      var offset = -d.getTimezoneOffset();
      tz = (offset >= 0 ? '+' : '-') + String(Math.floor(offset / 60)).padStart(2,'0') + String(offset % 60).padStart(2,'0');
    }
    T.addOutputLine(ds + ' ' + tz);
  };

  // ── COMMAND: echo ──
  T.cmdEcho = function(text) {
    var out = text.replace(/\$(\w+)/g, function(m, key) {
      return T.env[key] !== undefined ? T.env[key] : '$' + key;
    });
    T.addOutputLine(T.escapeHtml(out));
  };

  // ── COMMAND: history ──
  T.cmdHistory = function(args) {
    args = (args || '').trim();
    if (args === '-c' || args === '--clear') {
      T.commandHistory = [];
      T.historyIdx = -1;
      T.addOutputLine('<span class="tp-ok">history cleared</span>');
      return;
    }
    var searchMatch = args.match(/^(?:-[sS]|--search)\s+(.+)$/);
    if (searchMatch) {
      var q = searchMatch[1].toLowerCase();
      var results = T.commandHistory.filter(function(c) {
        return c.toLowerCase().indexOf(q) >= 0;
      });
      if (!results.length) {
        T.addOutputLine('<span class="tp-err">history: ' + T._('нет совпадений с "', 'no matches for "') + T.escapeHtml(searchMatch[1]) + '"</span>');
        return;
      }
      results.forEach(function(c, i) {
        T.addOutputLine('  ' + (i + 1) + '  ' + T.escapeHtml(c));
      });
      T.addSysLine('<span class="tp-muted">' + results.length + ' ' + T._('совпадений', 'matches') + '</span>');
      return;
    }
    if (!T.commandHistory.length) {
      T.addOutputLine('<span class="tp-muted">history is empty</span>');
      return;
    }
    T.commandHistory.forEach(function(c, i) {
      T.addOutputLine('  ' + (i + 1) + '  ' + T.escapeHtml(c));
    });
    T.addSysLine('<span class="tp-muted">' + T.commandHistory.length + ' commands</span>');
  };

  // ── COMMAND: export ──
  T.cmdExport = function(args) {
    args = (args || '').trim();
    if (!args) {
      T.addOutputLine('<span class="tp-section">Environment:</span>');
      Object.keys(T.env).sort().forEach(function(k) {
        T.addOutputLine('  ' + T.escapeHtml(k) + '=' + T.escapeHtml(T.env[k]));
      });
      return;
    }
    var m = args.match(/^(\w+)=(.+)$/);
    if (m) {
      T.env[m[1]] = m[2];
      T.addOutputLine('<span class="tp-ok">' + T.escapeHtml(m[1]) + '=' + T.escapeHtml(m[2]) + '</span>');
      if (m[1] === 'MATRIX') T.matrixEnabled = m[2] === '1' || m[2] === 'true';
      if (m[1] === 'THEME') {
        var theme = m[2].toLowerCase();
        if (theme === 'dark' || theme === 'light') {
          document.documentElement.setAttribute('data-bs-theme', theme);
          localStorage.setItem('theme', theme);
        } else {
          T.addOutputLine('<span class="tp-err">export: THEME must be dark or light</span>');
        }
      }
      if (m[1] === 'LANG') {
        var lang = m[2].toLowerCase();
        if (lang.startsWith('ru') || lang.startsWith('en')) {
          localStorage.setItem('rugram_lang', T.env.LANG);
          T.addOutputLine('<span class="tp-desc">' + T._('Язык: ', 'Language: ') + (lang.startsWith('ru') ? T._('Русский', 'Russian') : T._('Английский', 'English')) + '</span>');
        }
      }
      return;
    }
    T.addOutputLine('<span class="tp-err">export: invalid syntax. Usage: export VAR=value</span>');
  };

  // ── COMMAND: uptime ──
  T.cmdUptime = function() {
    var now = new Date();
    var timeStr = now.toLocaleTimeString('en-US', { hour12: false });
    var elapsed = Math.floor((Date.now() - T.startTime) / 1000);
    var days = Math.floor(elapsed / 86400);
    var hours = Math.floor((elapsed % 86400) / 3600);
    var mins = Math.floor((elapsed % 3600) / 60);
    var secs = elapsed % 60;
    var parts = [];
    if (days > 0) parts.push(days + ' day' + (days > 1 ? 's' : ''));
    parts.push(hours + ':' + String(mins).padStart(2, '0'));
    var load = (T.feedData.length * 0.1).toFixed(2);
    T.addOutputLine(timeStr + ' up ' + parts.join(', ') + ',  1 user,  load average: ' + load + ', ' + (load * 0.8).toFixed(2) + ', ' + (load * 0.5).toFixed(2));
    T.addOutputLine(' ' + T.commandHistory.length + ' commands in history');
  };

  // ── COMMAND: pwd ──
  T.cmdPwd = function() {
    T.addOutputLine('<span class="tp-section">~/' + T.escapeHtml(T.cwd) + '</span>');
  };

  // ── COMMAND: head ──
  T.cmdHead = function(args) {
    args = (args || '').trim();
    var n = 5;
    var m = args.match(/-n\s+(\d+)/);
    if (m) n = parseInt(m[1], 10);

    if (!T.feedData.length) {
      if (!T._fetchingFeed) {
        T._fetchingFeed = true;
        T.showLoading('Fetching feed...');
        T.fetchFeedFromAPI(function() {
          T.hideLoading();
          T._fetchingFeed = false;
          T.cmdHead(args);
        });
        return;
      }
      T.addOutputLine('<span class="tp-muted">  feed: empty</span>');
      return;
    }
    var slice = T.feedData.slice(0, n);
    T.renderFeed(slice);
  };

  // ── COMMAND: tail ──
  T.cmdTail = function(args) {
    args = (args || '').trim();
    var n = 5;
    var m = args.match(/-n\s+(\d+)/);
    if (m) n = parseInt(m[1], 10);

    if (!T.feedData.length) {
      if (!T._fetchingFeed) {
        T._fetchingFeed = true;
        T.showLoading('Fetching feed...');
        T.fetchFeedFromAPI(function() {
          T.hideLoading();
          T._fetchingFeed = false;
          T.cmdTail(args);
        });
        return;
      }
      T.addOutputLine('<span class="tp-muted">  feed: empty</span>');
      return;
    }
    var slice = T.feedData.slice(-n);
    T.renderFeed(slice);
  };

  // ── COMMAND: watch ──
  T.cmdWatch = function(args) {
    args = (args || '').trim();

    if (args === 'stop' || args === 'off') {
      if (T.watchInterval) {
        clearInterval(T.watchInterval);
        T.watchInterval = null;
        T.addOutputLine('<span class="tp-ok">watch stopped</span>');
      } else {
        T.addOutputLine('<span class="tp-muted">No active watch.</span>');
      }
      return;
    }

    if (T.watchInterval) clearInterval(T.watchInterval);

    var interval = 3;
    var cmd = args;
    var m = args.match(/-n\s+(\d+)\s+(.+)/);
    if (m) {
      interval = parseInt(m[1], 10);
      cmd = m[2];
    }

    T.addOutputLine('<span class="tp-ok">watch: every ' + interval + 's — ' + T.escapeHtml(cmd) + '</span>');
    T.addOutputLine('<span class="tp-desc"># <span class="tp-cmd">watch stop</span> — stop watching</span>');

    T._dispatchCommand(cmd);

    T.watchInterval = setInterval(function() {
      T.clearOutput();
      T._dispatchCommand(cmd);
    }, interval * 1000);
  };

  // ── COMMAND: top ──
  T.cmdTop = function() {
    T.clearOutput();
    var running = true;

    T.addOutputLine('<span class="tp-output-header">-- top --</span>');
    T.addOutput('<div class="tp-line" id="top-meta"><span class="tp-muted">' + T.feedData.length + ' posts | ' + T.commandHistory.length + ' commands | uptime ' + T.uptimeStr() + '</span></div>');
    T.addOutput('<div class="tp-line" id="top-body"></div>');
    T.addOutputLine('<span class="tp-desc"># press any key to exit top</span>');

    function renderTopData() {
      if (!running) return;
      var meta = T.el.output.querySelector('#top-meta');
      if (meta) {
        meta.innerHTML = '<span class="tp-muted">' + T.feedData.length + ' posts | ' + T.commandHistory.length + ' commands | uptime ' + T.uptimeStr() + '</span>';
      }
      var body = T.el.output.querySelector('#top-body');
      if (!body) return;
      var sorted = T.feedData.slice().sort(function(a, b) { return b.likes - a.likes; });
      var html = '<span class="tp-section">Posts (by likes):</span><br>';
      sorted.slice(0, 5).forEach(function(p, i) {
        var heart = p.liked ? '<span class="tp-ok">+</span>' : '-';
        html += '  ' + (i+1) + '. <span class="tp-post-author">@' + p.author + '</span> ' + heart + ' ' + p.likes + '  <span class="tp-desc">#' + p.id + '</span><br>';
      });
      html += '<br>';
      html += '<span class="tp-section">Recent commands:</span><br>';
      var recent = T.commandHistory.slice(-5);
      recent.forEach(function(c) {
        html += '  <span class="tp-cmd">' + T.escapeHtml(c) + '</span><br>';
      });
      body.innerHTML = html;
    }

    renderTopData();

    var topInterval = setInterval(renderTopData, 3000);

    function exitTop(e) {
      if (!running) return;
      running = false;
      clearInterval(topInterval);
      document.removeEventListener('keydown', exitTop);
      T.el.output.innerHTML = '';
      T.addOutputLine('<span class="tp-muted">--- top end ---</span>');
    }
    setTimeout(function() {
      document.addEventListener('keydown', exitTop);
    }, 200);
  };

  // ── COMMAND: feed [--tail N] [--page N] [--search text] [--less] ──
  T.cmdFeed = function(args) {
    args = (args || '').trim().toLowerCase();

    // Auto-fetch feed from API if cache is empty (terminal independence)
    if (!T.feedData.length && !T._fetchingFeed) {
      T._fetchingFeed = true;
      T.showLoading(T._('Загрузка ленты...', 'Fetching feed...'));
      T.fetchFeedFromAPI(function() {
        T.hideLoading();
        T._fetchingFeed = false;
        if (T.feedData.length) {
          T.cmdFeed(args); // retry with populated data
        } else {
          T.addOutputLine('<span class="tp-muted">feed: ' + T._('постов нет', 'no posts yet') + '</span>');
          T.addOutputLine('<span class="tp-desc">  # <span class="tp-cmd">create</span> ' + T._('написать пост', 'to write a post') + '</span>');
        }
      });
      return;
    }

    var tailN = null;
    var pageN = null;
    var searchQ = null;
    var inlineMode = false;

    // Parse flags
    var tailMatch = args.match(/--tail\s+(\d+)/);
    if (tailMatch) tailN = parseInt(tailMatch[1], 10);

    var pageMatch = args.match(/--page\s+(\d+)/);
    if (pageMatch) pageN = parseInt(pageMatch[1], 10);

    var searchMatch = args.match(/--search\s+(.+?)(?:\s+--\w+)?$/);
    if (searchMatch) searchQ = searchMatch[1].trim();

    if (/\b--inline\b/.test(args)) inlineMode = true;

    var list = T.feedData;

    // Search filter
    if (searchQ) {
      var q = searchQ.toLowerCase();
      list = list.filter(function(p) {
        return (p.text && p.text.toLowerCase().indexOf(q) >= 0) ||
               (p.author && p.author.toLowerCase().indexOf(q) >= 0);
      });
    }

    if (!list.length) {
      T.addOutputLine('<span class="tp-muted">feed: no matching posts</span>');
      return;
    }

    // Tail
    if (tailN) {
      list = list.slice(-tailN);
    }

    // Page
    if (pageN && !tailN) {
      var perPage = 10;
      var start = (pageN - 1) * perPage;
      list = list.slice(start, start + perPage);
    }

    // Default: program view (less) — except with --inline, --tail, --page, --search
    var useProgramView = !inlineMode && !tailN && !pageN && !searchQ;
    if (useProgramView) {
      T.enterLessMode(list, T._('Лента', 'Feed') + ' (' + list.length + ')', function(item) {
        T._exitLessMode();
        T.cmdPostView(item.id);
      });
      return;
    }

    T.renderFeed(list);
  };

  // ── COMMAND: cat <path> — powered by VFS ──
  T.cmdCat = function(args) {
    args = (args || '').trim();

    if (!args) {
      T.addOutputLine('<span class="tp-err">Usage: cat &lt;path&gt; | cat post_&lt;id&gt; | cat &lt;number&gt;</span>');
      return;
    }

    // cat --img <id> — render image as ASCII art (специальный флаг, не путь)
    var imgMatch = args.match(/^--img\s+(\d+)$/i);
    if (imgMatch) {
      var postId = parseInt(imgMatch[1], 10);
      var post = null;
      for (var i = 0; i < T.feedData.length; i++) {
        if (T.feedData[i].id === postId) { post = T.feedData[i]; break; }
      }
      if (!post || !post.image) {
        T.addOutputLine('<span class="tp-err">cat --img: post #' + postId + ' has no image</span>');
        return;
      }
      T.showLoading(T._('Загрузка изображения...', 'Loading image...'));
      T.imageToAscii(post.image, 60, function(ascii) {
        T.hideLoading();
        T.addOutputLine('<span class="tp-section">' + T._('Пост #', 'Post #') + postId + ' ' + T._('— изображение', '— image') + '</span>');
        T.addOutput(ascii);
        if (post.text) T.addOutputLine('<span class="tp-desc">' + T.escapeHtml(post.text.substring(0, 200)) + '</span>');
      });
      return;
    }

    // ── VFS resolution ──
    var node = T.vfs.resolve(args);
    if (node && !node.error) {
      // Если у узла есть content callback — вызываем
      if (typeof node.content === 'function') {
        node.content(T.addOutputLine);
        return;
      }
      // Файл без контента
      if (node.type === 'file') {
        T.addOutputLine('<span class="tp-muted">  (empty)</span>');
        return;
      }
      // Директория без content-обработчика
      if (node.type === 'dir') {
        T.addOutputLine('<span class="tp-desc">cat: ' + T.escapeHtml(args) + ': Is a directory</span>');
        T.addOutputLine('<span class="tp-desc">  # <span class="tp-cmd">ls ' + T.escapeHtml(args) + '</span> ' + T._('для просмотра содержимого', 'to list contents') + '</span>');
        return;
      }
    }

    // ── Fallback: голый номер в posts/saved ──
    var bareNumMatch = args.match(/^(\d+)$/);
    if (bareNumMatch && (T.cwd === 'posts' || T.cwd === 'saved')) {
      T.cmdPostView(parseInt(bareNumMatch[1], 10));
      return;
    }

    T.addOutputLine('<span class="tp-err">cat: ' + T.escapeHtml(args) + ': No such file or directory</span>');
  };

  // ── COMMAND: less [dir] — interactive pager ──
  T.cmdLess = function(args) {
    args = (args || '').trim().toLowerCase();

    var target = args || T.cwd || '~';

    // less with no args defaults to current dir
    if (!args) {
      if (T.cwd === 'feed' || !T.cwd) {
        if (T.feedData.length) {
          T.enterLessMode(T.feedData, 'feed (' + T.feedData.length + ' posts)', function(item) {
            T._exitLessMode();
            T.cmdPostView(item.id);
          });
        } else {
          T.addOutputLine('<span class="tp-muted">feed: empty</span>');
        }
        return;
      }
      if (T.cwd === 'saved') {
        T.cmdSaved('--less');
        return;
      }
      if (T.cwd === 'followers') {
        T.cmdFollowers('--less');
        return;
      }
      if (T.cwd === 'following') {
        T.cmdFollowing('--less');
        return;
      }
      T.addOutputLine('<span class="tp-muted">less: nothing to page in ' + T.escapeHtml(T.cwd) + '</span>');
      return;
    }

    // less feed
    if (target === 'feed' || target === '/feed') {
      if (T.feedData.length) {
        T.enterLessMode(T.feedData, 'feed (' + T.feedData.length + ' posts)', function(item) {
          T._exitLessMode();
          T.cmdPostView(item.id);
        });
      } else {
        T.addOutputLine('<span class="tp-err">feed: empty</span>');
      }
      return;
    }

    // less saved
    if (target === 'saved' || target === '/saved') {
      T.cmdSaved('--less');
      return;
    }

    // less followers/following
    if (target === 'followers' || target === '/followers') {
      T.cmdFollowers('--less');
      return;
    }
    if (target === 'following' || target === '/following') {
      T.cmdFollowing('--less');
      return;
    }

    T.addOutputLine('<span class="tp-err">less: ' + T.escapeHtml(target) + ': No such section</span>');
  };

  // ── Registry (auth=true = dispatch auto-checks T.isLoggedIn) ──
  T.register('login',    { handler: T.cmdLogin, auth: false, category: 'auth',
    match: 'regex', regex: /^login\s+(\S+)\s+(.+)$/i,
    parse: function(m){return[m[1],m[2]]} });
  T.register('register', { handler: T.cmdRegister, auth: false, category: 'auth',
    match: 'regex', regex: /^register\s+(\S+)\s+(\S+)\s+(.+)$/i,
    parse: function(m){return[m[1],m[2],m[3]]} });
  T.register('logout',   { handler: T.cmdLogout, auth: false, category: 'auth' });
  T.register('like',     { handler: T.cmdLike, auth: true, category: 'posts',
    match: 'regex', regex: /^like\s+(\d+)$/i,
    parse: function(m){return[parseInt(m[1],10)]} });
  T.register('comment',  { handler: T.cmdComment, auth: true, category: 'posts',
    match: 'regex', regex: /^comment\s+(\d+)\s+(.+)$/i,
    parse: function(m){var t=m[2];if(t.startsWith('"')&&t.endsWith('"'))t=t.slice(1,-1);return[parseInt(m[1],10),t]} });
  T.register('follow',   { handler: T.cmdFollow, auth: true, category: 'posts',
    match: 'regex', regex: /^(follow|unfollow)\s+@?(\w+)$/i,
    parse: function(m){return[m[1].toLowerCase(),m[2]]} });
  T.register('bookmark', { handler: T.cmdBookmark, auth: true, category: 'posts',
    match: 'regex', regex: /^bookmark\s+(\d+)$/i,
    parse: function(m){return[parseInt(m[1],10)]} });
  T.register('neofetch', { handler: T.cmdNeofetch, auth: false, category: 'info',
    match: 'regex', regex: /^neofetch\s+@?(\w+)$/i,
    parse: function(m){return[m[1]]} });
  T.register('whoami',   { handler: T.cmdWhoami, auth: false, category: 'info' });
  T.register('feed',     { handler: T.cmdFeed, auth: false, category: 'programs', match: 'prefix' });
  T.register('saved',    { handler: T.cmdSaved, auth: true, category: 'programs', match: 'prefix' });
  T.register('followers',{ handler: T.cmdFollowers, auth: false, category: 'social', match: 'prefix' });
  T.register('following',{ handler: T.cmdFollowing, auth: false, category: 'social', match: 'prefix' });
  T.register('notifications',{ handler: T.cmdNotifications, auth: true, category: 'programs' });
  T.register('create',   { handler: T.cmdCreate, auth: true, category: 'posts', match: 'prefix' });
  T.register('cat',      { handler: T.cmdCat, auth: false, category: 'programs', match: 'prefix' });
  T.register('less',     { handler: T.cmdLess, auth: false, category: 'programs', match: 'prefix' });
  T.register('echo',     { handler: T.cmdEcho, auth: false, category: 'system', match: 'prefix' });
  T.register('date',     { handler: T.cmdDate, auth: false, category: 'system',
    match: 'regex', regex: /^date(\s+-[uU][tT][cC]|\s+-[uU])?$/i,
    parse: function(m){return[!!m[1]]} });
  T.register('history',  { handler: T.cmdHistory, auth: false, category: 'system',
    match: 'prefix' });
  T.register('uptime',   { handler: T.cmdUptime, auth: false, category: 'system' });
  T.register('man',      { handler: T.cmdMan, auth: false, category: 'help', match: 'prefix' });
  T.register('export',   { handler: T.cmdExport, auth: false, category: 'system', match: 'prefix' });
  T.register('fortune',  { handler: T.cmdFortune, auth: false, category: 'system' });
  T.register('ping',     { handler: T.cmdPing, auth: false, category: 'system', match: 'prefix' });
  T.register('watch',    { handler: T.cmdWatch, auth: false, category: 'system', match: 'prefix' });
  T.register('head',     { handler: T.cmdHead, auth: false, category: 'system', match: 'prefix' });
  T.register('tail',     { handler: T.cmdTail, auth: false, category: 'system', match: 'prefix' });
  T.register('top',      { handler: T.cmdTop, auth: false, category: 'system' });
  T.register('grep',     { handler: T.cmdGrep, auth: false, category: 'programs',
    match: 'regex', regex: /^grep\s+"(.+?)"$/i,
    parse: function(m){return[m[1]]} });
  T.register('clear',    { handler: function(){T.clearOutput()}, auth: false, category: 'system' });
  T.register('help',     { handler: T.cmdHelp, auth: false, category: 'help' });
  T.register('pwd',      { handler: T.cmdPwd, auth: false, category: 'system' });
  T.register('id',       { handler: T.cmdId, auth: false, category: 'info', match: 'prefix' });
  T.register('alias',    { handler: T.cmdAlias, auth: false, category: 'system', match: 'prefix' });
  T.register('unalias',  { handler: T.cmdUnalias, auth: false, category: 'system', match: 'prefix' });
  T.register('source',   { handler: T.cmdSource, auth: false, category: 'system', match: 'prefix' });
  T.register('rm',       { handler: T.cmdRm, auth: true, category: 'posts', match: 'prefix' });

})(window.TERMINAL);
