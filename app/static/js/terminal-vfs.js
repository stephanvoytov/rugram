// ── Rugram Terminal — Virtual File System ──
// Единый движок разрешения путей. Все команды (cd, ls, cat, rm, nano)
// идут через T.vfs.resolve() — никакого хардкода в каждой команде.
(function(T) {
  'use strict';

  // ── 1. Path normalization ──
  // Принимает строку пути и текущую cwd, возвращает массив частей (уже с ресолвом . и ..)
  T.vfs = {};

  T.vfs.normalize = function(path, cwd) {
    path = (path || '').trim();
    cwd = cwd || '';

    // Пусто / ~ / / → корень
    if (!path || path === '~' || path === '/') {
      return (cwd ? cwd.split('/') : []);
    }

    // Абсолютный путь
    if (path.startsWith('/')) {
      path = path.substring(1);
    } else if (path.startsWith('~/')) {
      // Относительно home
      path = path.substring(2);
      if (cwd) path = cwd + '/' + path;
    } else {
      // Относительный — отностиельно cwd
      if (cwd) path = cwd + '/' + path;
    }

    // Разбиваем, ресолвим . и ..
    var parts = path.split('/').filter(Boolean);
    var result = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p === '.' || p === '') continue;
      if (p === '..') {
        if (result.length) result.pop();
        continue;
      }
      result.push(p);
    }

    // ── Алиасы ──
    // post/42 → feed/42
    if (result.length >= 2 && result[0] === 'post' && /^\d+$/.test(result[1])) {
      result = ['feed'].concat(result.slice(1));
    }
    // post_42.txt (одиночный, с любого уровня) → feed/post_42.txt
    if (result.length === 1 && /^post_\d+(?:\.txt)?$/i.test(result[0])) {
      result = ['feed'].concat(result);
    }

    return result;
  };

  // ── 2. Canonical path string (для cd/pwd) ──
  T.vfs.canonical = function(parts) {
    if (!parts || parts.length === 0) return '';
    return parts.join('/');
  };

  // ── 3. Routing: parts → node descriptor ──
  T.vfs.route = function(parts) {
    if (!parts || parts.length === 0) return _root();
    var first = parts[0].toLowerCase();
    var sub = parts.slice(1);

    // @username (всегда на первом уровне)
    if (first.startsWith('@')) return _user(first, sub);

    switch (first) {
      case 'feed': return _feed(sub);
      case 'saved': return _saved(sub);
      case 'profile': return _profile(sub);
      case 'notifications': return _notifications(sub);
      case 'chat': return _chat(sub);
      case 'users': return _users(sub);
      case 'tmp': return _tmp(sub);
      case 'mnt': return _mnt(sub);
      case 'settings': return _settings();
      case 'edit_profile': return _editProfile();
      case 'create': return _create();
      case 'followers': return _followers();
      case 'following': return _following();
      // home alias
      case 'home': return _root();
    }

    return _err('No such file or directory');
  };

  function _err(msg) {
    return { error: msg };
  }

  function _dir(children) {
    return { type: 'dir', children: children || [] };
  }

  function _file(meta) {
    var node = { type: 'file' };
    if (meta.content) node.content = meta.content;
    if (meta.remove) node.remove = meta.remove;
    if (meta.edit) node.edit = meta.edit;
    if (meta.displayName) node.name = meta.displayName;
    // passthrough for rendering
    if (meta.text !== undefined) node.text = meta.text;
    if (meta.id !== undefined) node.id = meta.id;
    if (meta.author !== undefined) node.author = meta.author;
    if (meta.image !== undefined) node.image = meta.image;
    return node;
  }

  // ── 4. Route handlers ──

  // ── / (root) ──
  function _root() {
    return {
      type: 'dir',
      content: function(out) { T.renderHome(); },
      children: [
      { name: 'feed', type: 'dir', desc: T._('Лента постов', 'Post feed') },
      { name: 'saved', type: 'dir', desc: T._('Сохранённое', 'Saved posts') },
      { name: 'profile', type: 'dir', desc: T._('Мой профиль', 'My profile') },
      { name: 'notifications', type: 'dir', desc: T._('Уведомления', 'Notifications') },
      { name: 'chat', type: 'dir', desc: T._('Сообщения', 'Messages') },
      { name: 'followers', type: 'dir', desc: T._('Подписчики', 'Followers') },
      { name: 'following', type: 'dir', desc: T._('Подписки', 'Following') },
      { name: 'users', type: 'dir', desc: T._('Пользователи', 'Users') },
      { name: 'create', type: 'file', desc: T._('Новый пост', 'New post') },
      { name: 'tmp', type: 'dir', desc: T._('Временные файлы', 'Temp files') },
      { name: 'settings', type: 'file', desc: T._('Настройки (GUI)', 'Settings (GUI)') },
      { name: 'edit_profile', type: 'file', desc: T._('Редактор профиля (GUI)', 'Edit profile (GUI)') },
    ]};
  }

  // ── /feed ──
  function _feed(sub) {
    if (sub.length === 0) {
      // Список постов
      var children = T.feedData.map(function(p) {
        return {
          name: 'post_' + p.id + '.txt',
          shortName: p.id + '.txt',
          type: 'file',
          id: p.id,
          author: p.author,
          desc: '@' + T.escapeHtml(p.author),
        };
      });
      return {
        type: 'dir',
        children: children,
        content: function(out) { T.cmdFeed(''); },
      };
    }

    // feed/post_42.txt or feed/42.txt
    var m = sub[0].match(/^(?:post_)?(\d+)(?:\.txt)?$/i);
    if (m) {
      var id = parseInt(m[1], 10);
      var post = _findPost(id);
      if (post) {
        // feed/<id>/image or feed/<id>/comments
        if (sub.length >= 2) {
          if (sub[1] === 'image') return _postImage(post);
          if (sub[1] === 'comments') return _postComments(post, sub.slice(2));
          return _err('No such file or directory');
        }
        return _file({
          content: function(out) { _catPost(post, out); },
          remove: function(out) { _rmPost(post.id, out); },
          displayName: 'post_' + post.id + '.txt',
          text: post.text,
          id: post.id,
          author: post.author,
          image: post.image,
        });
      }
      return _err('Post #' + id + ' not found');
    }

    return _err('No such file or directory');
  }

  // ── /saved ──
  function _saved(sub) {
    // Сохранённые посты — динамические, через API
    if (sub.length === 0) {
      return {
        type: 'dir',
        children: [],
        content: function(out) { T.cmdSaved(''); },
      };
    }
    var m = sub[0].match(/^(?:post_)?(\d+)(?:\.txt)?$/i);
    if (m) {
      var post = _findPost(parseInt(m[1], 10));
      if (post) return _file({
        content: function(out) { _catPost(post, out); },
        remove: function(out) { _rmPost(post.id, out); },
      });
    }
    return _err('No such file or directory');
  }

  // ── /profile ──
  function _profile(sub) {
    if (sub.length === 0) {
      var myName = T.username || 'unknown';
      var myPosts = T.feedData.filter(function(p) {
        return p.author.toLowerCase() === myName.toLowerCase();
      });
      var children = [{ name: 'description.txt', type: 'file', desc: 'Bio' }];
      myPosts.forEach(function(p) {
        children.push({
          name: 'post_' + p.id + '.txt',
          type: 'file',
          id: p.id,
          desc: '@' + T.escapeHtml(p.author),
        });
      });
      return _dir(children);
    }

    // profile/description.txt
    if (sub[0] === 'description.txt') {
      return _file({
        content: function(out) { _catProfile(out); },
        edit: function(out, newText) { _editProfile(out, newText); },
      });
    }

    // profile/post_42.txt
    var m = sub[0].match(/^(?:post_)?(\d+)(?:\.txt)?$/i);
    if (m) {
      var post = _findPost(parseInt(m[1], 10));
      if (post) return _file({
        content: function(out) { _catPost(post, out); },
        remove: function(out) { _rmPost(post.id, out); },
      });
    }

    return _err('No such file or directory');
  }

  // ── /notifications ──
  function _notifications(sub) {
    if (sub.length === 0) return _dir([]);
    // notifications/<id>.txt
    var m = sub[0].match(/^(\d+)(?:\.txt)?$/);
    if (m) {
      return _file({
        content: function(out) {
          out('<span class="tp-muted">notification #' + m[1] + '</span>');
        },
      });
    }
    return _err('No such file or directory');
  }

  // ── /chat ──
  function _chat(sub) {
    if (sub.length === 0) return _dir([]);
    // chat/<id> — отдельный диалог
    var m = sub[0].match(/^(\d+)$/);
    if (m) {
      return _dir([
        { name: 'messages', type: 'file', chatId: parseInt(m[1], 10) },
      ]);
    }
    return _err('No such file or directory');
  }

  // ── /users ──
  function _users(sub) {
    if (sub.length === 0) return _dir([]);
    // users/@name
    var userPart = sub[0].startsWith('@') ? sub[0] : '@' + sub[0];
    return _user(userPart, sub.slice(1));
  }

  // ── @user (profile directory) ──
  function _user(userPart, sub) {
    var name = userPart.replace('@', '');
    if (!name) return _err('No such user');

    if (sub.length === 0) {
      return _dir([
        { name: 'info', type: 'file', desc: T._('Информация', 'Info'), username: name },
        { name: 'posts', type: 'dir', desc: T._('Посты', 'Posts'), username: name },
      ]);
    }

    // @user/info
    if (sub[0] === 'info') {
      return _file({
        content: function(out) {
          T.cmdNeofetch(name);
        },
      });
    }

    // @user/posts — список постов пользователя
    if (sub[0] === 'posts') {
      var userPosts = T.feedData.filter(function(p) {
        return p.author.toLowerCase() === name.toLowerCase();
      });
      var children = userPosts.map(function(p) {
        return {
          name: 'post_' + p.id + '.txt',
          type: 'file',
          id: p.id,
          author: p.author,
        };
      });
      return _dir(children);
    }

    // @user/post_42.txt
    var m = sub[0].match(/^(?:post_)?(\d+)(?:\.txt)?$/i);
    if (m) {
      var post = _findPost(parseInt(m[1], 10));
      if (post) return _file({
        content: function(out) { _catPost(post, out); },
      });
    }

    return _err('No such file or directory');
  }

  // ── /tmp ──
  function _tmp(sub) {
    if (sub.length === 0) {
      var files = [];
      try {
        var raw = localStorage.getItem('rugram_tmp_files');
        if (raw) files = JSON.parse(raw);
      } catch(e) {}
      var children = files.map(function(f) {
        return { name: f.name, type: 'file', size: f.size || 0 };
      });
      return _dir(children);
    }

    // tmp/draft.txt или tmp/<file>
    var fileName = sub[0];
    return _file({
      content: function(out) {
        try {
          var raw = localStorage.getItem('rugram_tmp_' + fileName);
          out('<pre>' + T.escapeHtml(raw || '') + '</pre>');
        } catch(e) {
          out('<span class="tp-err">tmp: error reading ' + T.escapeHtml(fileName) + '</span>');
        }
      },
      edit: function(out, newText, originalText) {
        localStorage.setItem('rugram_tmp_' + fileName, newText);
        _trackTmpFile(fileName, newText.length);
        out('<span class="tp-ok">' + T.escapeHtml(fileName) + ' ' + T._('сохранён', 'saved') + '</span>');
      },
      remove: function(out) {
        localStorage.removeItem('rugram_tmp_' + fileName);
        _untrackTmpFile(fileName);
        out('<span class="tp-ok">' + T.escapeHtml(fileName) + ' ' + T._('удалён', 'removed') + '</span>');
      },
    });
  }

  function _trackTmpFile(name, size) {
    try {
      var raw = localStorage.getItem('rugram_tmp_files');
      var files = raw ? JSON.parse(raw) : [];
      var idx = -1;
      for (var i = 0; i < files.length; i++) {
        if (files[i].name === name) { idx = i; break; }
      }
      var entry = { name: name, size: size || 0, mtime: Date.now() };
      if (idx >= 0) files[idx] = entry;
      else files.push(entry);
      localStorage.setItem('rugram_tmp_files', JSON.stringify(files));
    } catch(e) {}
  }

  function _untrackTmpFile(name) {
    try {
      var raw = localStorage.getItem('rugram_tmp_files');
      var files = raw ? JSON.parse(raw) : [];
      files = files.filter(function(f) { return f.name !== name; });
      localStorage.setItem('rugram_tmp_files', JSON.stringify(files));
    } catch(e) {}
  }

  // ── /mnt — GUI mount points ──
  function _mnt(sub) {
    if (sub.length === 0) {
      return _dir([
        { name: 'settings', type: 'file', desc: 'Settings (GUI)' },
        { name: 'edit_profile', type: 'file', desc: 'Edit profile (GUI)' },
      ]);
    }
    if (sub[0] === 'settings') return _settings();
    if (sub[0] === 'edit_profile') return _editProfile();
    return _err('No such file or directory');
  }

  // ── /settings ──
  function _settings() {
    return _file({
      content: function(out) {
        out('<span class="tp-desc">' + T._('Настройки:', 'Settings:') + '</span>');
        out('<span class="tp-muted">  # <span class="tp-cmd">gui</span> ' + T._('для перехода в настройки', 'to open settings in GUI') + '</span>');
      },
    });
  }

  // ── /edit_profile ──
  function _editProfile() {
    return _file({
      content: function(out) {
        out('<span class="tp-desc">' + T._('Редактирование профиля:', 'Edit profile:') + '</span>');
        out('<span class="tp-muted">  # ' + T._('Используйте nano description.txt', 'Use nano description.txt') + '</span>');
      },
    });
  }

  // ── /create ──
  function _create() {
    return _file({
      content: function(out) {
        out('<span class="tp-desc">' + T._('Новый пост:', 'New post:') + '</span>');
        out('<span class="tp-muted">  # <span class="tp-cmd">nano</span> ' + T._('для открытия редактора', 'to open the editor') + '</span>');
      },
    });
  }

  // ── /followers ──
  function _followers() {
    return _dir([]);
  }

  // ── /following ──
  function _following() {
    return _dir([]);
  }

  // ── 5. Helper functions ──

  function _findPost(id) {
    for (var i = 0; i < T.feedData.length; i++) {
      if (T.feedData[i].id === id) return T.feedData[i];
    }
    // Попробовать через API
    T.cmdPostView(id);
    return null;
  }

  function _catPost(post, out) {
    T.cmdPostView(post.id);
  }

  function _catProfile(out) {
    T.cmdWhoami();
  }

  function _editProfile(out, newText) {
    if (!T.isLoggedIn) {
      out('<span class="tp-err">nano: ' + T._('Требуется вход.', 'Login required.') + '</span>');
      return;
    }
    fetch(window.EDIT_PROFILE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRFToken': T.csrfToken().content,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: 'description=' + encodeURIComponent(newText)
    }).then(function(r) {
      if (r.ok) out('<span class="tp-ok">' + T._('Профиль обновлён', 'Profile updated') + '</span>');
      else out('<span class="tp-err">' + T._('Ошибка', 'Error') + '</span>');
    });
  }

  function _rmPost(id, out) {
    if (!T.isLoggedIn) {
      out('<span class="tp-err">rm: ' + T._('Требуется вход.', 'Login required.') + '</span>');
      return 'error';
    }
    var token = T.csrfToken();
    fetch('/delete/' + id, {
      method: 'DELETE',
      headers: {
        'X-CSRFToken': token ? token.content : '',
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'same-origin'
    }).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      T.feedData = T.feedData.filter(function(p) { return p.id !== id; });
      out('<span class="tp-ok">' + T._('Пост #', 'Post #') + id + ' ' + T._('удалён', 'deleted') + '</span>');
    }).catch(function() {
      out('<span class="tp-err">rm: ' + T._('ошибка удаления поста #', 'could not delete post #') + id + '</span>');
    });
  }

  function _postImage(post) {
    return _file({
      content: function(out) {
        if (!post.image) {
          out('<span class="tp-err">cat: ' + T._('нет изображения', 'no image') + '</span>');
          return;
        }
        T.imageToAscii(post.image, 60, function(ascii) {
          out(ascii);
        });
      },
    });
  }

  function _postComments(post, sub) {
    if (sub.length === 0) return _dir([]);
    // comment/<id>.txt
    var m = sub[0].match(/^(\d+)(?:\.txt)?$/);
    if (m) {
      return _file({
        content: function(out) {
          out('<span class="tp-muted">comment #' + m[1] + ' on post #' + post.id + '</span>');
        },
      });
    }
    return _err('No such file or directory');
  }

  // ── 6. Single resolve function ──
  T.vfs.resolve = function(path) {
    var parts = this.normalize(path, T.cwd);
    return this.route(parts);
  };

  // ── 7. Directory existence check (для cd) ──
  T.vfs.isDir = function(path) {
    var node = this.resolve(path);
    return node && !node.error && node.type === 'dir';
  };

  // ── 8. File existence check (для nano) ──
  T.vfs.isFile = function(path) {
    var node = this.resolve(path);
    return node && !node.error && node.type === 'file';
  };

})(window.TERMINAL);
