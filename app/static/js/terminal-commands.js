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
      T.cwd = 'feed';
      T.updatePrompt();
      T.addSysLine('<span class="tp-ok">' + T._('Вошли как @', 'Logged in as @') + T.escapeHtml(T.username) + '</span>');
      T.cacheFeedFromDOM();
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
      T.cwd = 'feed';
      T.updatePrompt();
      T.cacheFeedFromDOM();
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
      T.cwd = '';
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
    var csrf = document.querySelector('meta[name="csrf-token"]');
    if (!csrf) { T.addOutputLine('<span class="tp-err">error: login required</span>'); return; }
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
    var csrf = document.querySelector('meta[name="csrf-token"]');
    if (!csrf) { T.addOutputLine('<span class="tp-err">error: login required</span>'); return; }
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
    var csrf = document.querySelector('meta[name="csrf-token"]');
    if (!csrf) { T.addOutputLine('<span class="tp-err">error: login required</span>'); return; }
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
      T.addSysLine('<span class="tp-ok">' + icon + ' @' + targetUser + ' — ' + data.followers_count + ' followers</span>');
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
    var csrf = document.querySelector('meta[name="csrf-token"]');
    if (!csrf) { T.addOutputLine('<span class="tp-err">error: login required</span>'); return; }
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
    fetch(window.API_ME_URL, { credentials: 'same-origin' })
    .then(function(r) {
      if (!r.ok) throw new Error('not-authenticated');
      return r.json();
    })
    .then(function(data) {
      if (data.authenticated) {
        T.username = data.user.username;
        T.updatePrompt();
        T.renderNeofetch(data.user.username, data.user.description || 'No description', data.user.profile_image);
      }
    })
    .catch(function() {
      T.addOutputLine('<span class="tp-muted">' + T._('Не в системе.', 'Not logged in.') + '</span>');
      T.addOutputLine('<span class="tp-desc">' + T._('Используйте ', 'Use ') + '<span class="tp-cmd">login</span> ' + T._('или', 'or') + ' <span class="tp-cmd">register</span> ' + T._('для входа.', 'to authenticate.') + '</span>');
    });
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
    var localFound = T.feedData.some(function(p) {
      return p.author.toLowerCase() === targetUser.toLowerCase();
    });
    if (localFound) {
      T._showNeofetch(targetUser, true);
      return;
    }
    T.addSysLine('<span class="tp-muted">Looking up @' + targetUser + '...</span>');
    fetch(window.API_USERS_SEARCH_URL + '?q=' + encodeURIComponent(targetUser), {
      credentials: 'same-origin'
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var user = data.users && data.users.find(function(u) {
        return u.username.toLowerCase() === targetUser.toLowerCase();
      });
      if (user) {
        T._showNeofetch(targetUser, true, user.profile_image);
      } else {
        T.addSysLine('<span class="tp-err">neofetch: @' + targetUser + ': user not found</span>');
      }
    })
    .catch(function() {
      T.addSysLine('<span class="tp-err">neofetch: @' + targetUser + ': request failed</span>');
    });
  };

  // ── Internal neofetch display ──
  T._showNeofetch = function(username, found, imageUrl) {
    var desc = found ? 'Active user' : 'User not found';
    var postsCount = T.feedData.filter(function(p) {
      return p.author.toLowerCase() === username.toLowerCase();
    }).length;

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
      html += '      <span class="tp-muted">Posts:</span> ' + (found ? String(postsCount) : '<span class="tp-err">unknown</span>') + '\n';
      html += '      <span class="tp-muted">Bio:</span> ' + T.escapeHtml(desc) + '\n';
      html += '    </div>';
      html += '  </div>';
      html += '</div>';
      T.addOutput(html);
      T.addOutputLine('<span class="tp-desc"># <span class="tp-cmd">follow @' + username + '</span> to subscribe</span>');

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
      html += '      <span class="tp-muted">Posts:</span> ' + (found ? String(postsCount) : '<span class="tp-err">unknown</span>') + '\n';
      html += '      <span class="tp-muted">Bio:</span> ' + T.escapeHtml(desc) + '\n';
      html += '    </div>';
      html += '  </div>';
      html += '</div>';
      T.addOutput(html);
      T.addOutputLine('<span class="tp-desc"># <span class="tp-cmd">follow @' + username + '</span> to subscribe</span>');
      return;
    }

    T.addSysLine('<span class="tp-section">User: @' + username + '</span>');
    T.addOutputLine('<span class="tp-muted">OS:</span> tty.so v' + T.APP_VERSION);
    T.addOutputLine('<span class="tp-muted">Shell:</span> rugram-terminal 2026');
    T.addOutputLine('<span class="tp-muted">Posts:</span> ' + (found ? String(postsCount) : '<span class="tp-err">unknown</span>'));
    T.addOutputLine('<span class="tp-muted">Status:</span> ' + (found ? '<span class="tp-ok">online</span>' : '<span class="tp-err">offline</span>'));
    T.addOutputLine('<span class="tp-muted">Bio:</span> ' + T.escapeHtml(desc));
    T.addOutputLine('<span class="tp-desc"># <span class="tp-cmd">follow @' + username + '</span> to subscribe</span>');
  };

  // ── COMMAND: grep ──
  T.cmdGrep = function(query) {
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

  // ── COMMAND: cat /notifications ──
  T.cmdNotifications = function() {
    T.showLoading('Loading notifications...');
    fetch(window.API_NOTIFICATIONS_URL)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        T.hideLoading();
        T.clearOutput();
        if (!data.notifications.length) {
          T.addOutputLine('<span class="tp-muted">No notifications.</span>');
          return;
        }
        T.addOutputLine('<span class="tp-section">Notifications (' + data.total + ')</span>');
        data.notifications.forEach(function(n) {
          var actor = n.actor.username;
          var icon = n.type === 'like' ? '+' : n.type === 'comment' ? 'c' : '>';
          var msg = n.type === 'like' ? T._('лайкнул(а) ваш пост', 'liked your post') :
                    n.type === 'comment' ? T._('прокомментировал(а) ваш пост', 'commented on your post') :
                    T._('подписался(ась) на вас', 'followed you');
          var cls = n.is_read ? 'tp-desc' : 'tp-ok';
          T.addOutputLine('<span class="' + cls + '">' + icon + ' @' + actor + ' ' + msg + '</span>');
        });
        T.addSysLine('<span class="tp-muted">Page ' + data.current_page + '/' + data.pages + '</span>');
      })
      .catch(function() {
        T.hideLoading();
        T.addOutputLine('<span class="tp-err">error: could not load notifications</span>');
      });
  };

  // ── COMMAND: cd saved ──
  T.cmdSaved = function() {
    T.showLoading(T._('Загрузка сохранённого...', 'Loading saved posts...'));
    fetch('/api/saved', { credentials: 'same-origin' })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        T.hideLoading();
        T.clearOutput();
        var posts = data.posts || [];
        T.addOutputLine('<span class="tp-section">-- /saved -- (' + posts.length + ' posts)</span>');
        if (!posts.length) {
          T.addOutputLine('<span class="tp-muted">  ' + T._('Нет сохранённых постов.', 'No saved posts.') + '</span>');
          return;
        }
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

  // ── COMMAND: cd create ──
  T.cmdCreate = function() {
    if (!T.csrfToken()) {
      T.addOutputLine('<span class="tp-err">' + T._('Ошибка: требуется вход', 'Error: login required') + '</span>');
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

  // ── COMMAND: cd followers ──
  T.cmdFollowers = function(username) {
    var user = username || (T.username !== 'guest' ? T.username : null);
    if (!user) {
      T.addOutputLine('<span class="tp-err">cd: followers: ' + T._('пользователь не определён', 'could not resolve current user') + '</span>');
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
        T.clearOutput();
        var users = data.users || [];
        T.addOutputLine('<span class="tp-section">-- /followers (' + user + ') -- (' + users.length + ')</span>');
        if (!users.length) {
          T.addOutputLine('<span class="tp-muted">  ' + T._('Нет подписчиков.', 'No followers.') + '</span>');
          return;
        }
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

  // ── COMMAND: cd following ──
  T.cmdFollowing = function(username) {
    var user = username || (T.username !== 'guest' ? T.username : null);
    if (!user) {
      T.addOutputLine('<span class="tp-err">cd: following: ' + T._('пользователь не определён', 'could not resolve current user') + '</span>');
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
        T.clearOutput();
        var users = data.users || [];
        T.addOutputLine('<span class="tp-section">-- /following (' + user + ') -- (' + users.length + ')</span>');
        if (!users.length) {
          T.addOutputLine('<span class="tp-muted">  ' + T._('Нет подписок.', 'Not following anyone.') + '</span>');
          return;
        }
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
        T.clearOutput();
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
    T.addOutputLine('PING @' + target + ' (' + window.location.host + '): 56 data bytes');

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
                T.addOutputLine('--- @' + target + ' ping statistics ---');
                T.addOutputLine(PACKETS + ' packets transmitted, 0 received, 100% packet loss');
              }
            }, Math.random() * 300 + 100);
          })(i);
        }
        return;
      }

      function sendUser() {
        if (seq >= PACKETS) {
          T.addOutputLine('--- @' + target + ' ping statistics ---');
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
        T.addOutputLine('64 bytes from @' + target + ' (' + window.location.host + '): icmp_seq=' + seq +
          ' ttl=' + ttl + ' time=' + ms.toFixed(2) + ' ms');
        seq++;
        setTimeout(sendUser, Math.random() * 200 + 50);
      }

      setTimeout(sendUser, 50);
    })
    .catch(function() {
      T.addOutputLine('<span class="tp-err">ping: ' + target + ': Temporary failure in name resolution</span>');
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
    T.addOutputLine(out);
  };

  // ── COMMAND: history ──
  T.cmdHistory = function(clearFlag) {
    if (clearFlag) {
      T.commandHistory = [];
      T.historyIdx = -1;
      T.addOutputLine('<span class="tp-ok">history cleared</span>');
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
        T.addOutputLine('  ' + k + '=' + T.env[k]);
      });
      return;
    }
    var m = args.match(/^(\w+)=(.+)$/);
    if (m) {
      T.env[m[1]] = m[2];
      T.addOutputLine('<span class="tp-ok">' + m[1] + '=' + m[2] + '</span>');
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

})(window.TERMINAL);
