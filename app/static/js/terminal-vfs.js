// ── Rugram Terminal — Virtual File System v2 ──
// Единый движок разрешения путей. Все команды (cd, ls, cat, rm, nano)
// идут через T.vfs.resolve() — никакого хардкода в каждой команде.
(function(T) {
  'use strict';

  // ── 1. Path normalization ──
  T.vfs = {};

  T.vfs.normalize = function(path, cwd) {
    path = (path || '').trim();
    cwd = cwd || '';
    if (!path || path === '~' || path === '/') return cwd ? cwd.split('/') : [];

    if (path.startsWith('/')) {
      path = path.substring(1);
    } else if (path.startsWith('~/')) {
      path = path.substring(2);
      // ~ means VFS root (like /), no cwd prepending
    } else {
      if (cwd) path = cwd + '/' + path;
    }

    var parts = path.split('/').filter(Boolean);
    var result = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p === '.' || p === '') continue;
      if (p === '..') { if (result.length) result.pop(); continue; }
      result.push(p);
    }
    return result;
  };

  // ── 2. Canonical path string ──
  T.vfs.canonical = function(parts) {
    if (!parts || parts.length === 0) return '';
    return parts.join('/');
  };

  // ── 3. Route: parts → node descriptor ──
  T.vfs.route = function(parts) {
    if (!parts || parts.length === 0) return _root();
    var first = parts[0].toLowerCase();
    var sub = parts.slice(1);

    if (first.startsWith('@')) return _user(first, sub);

    switch (first) {
      case 'posts':    return _posts(sub);
      case 'saved':    return _saved(sub);
      case 'drafts':   return _drafts(sub);
      case 'trash':    return _trash(sub);
      case 'profile':  return _profile(sub);
      case 'users':    return _users(sub);
      case 'chat':     return _chat(sub);
      case 'notifications': return _notifications(sub);
      case 'followers':  return _followers(sub);
      case 'following':  return _following(sub);
      case 'mnt':      return _mnt(sub);
    }

    return _err('No such file or directory');
  };

  // ── Error / Dir / File helpers ──
  function _err(msg) { return { error: msg }; }
  function _file(meta) {
    var node = { type: 'file' };
    if (meta.content) node.content = meta.content;
    if (meta.remove)  node.remove = meta.remove;
    if (meta.edit)    node.edit = meta.edit;
    if (meta.name)    node.name = meta.name;
    for (var k in meta) {
      if (k !== 'content' && k !== 'remove' && k !== 'edit' && k !== 'name') {
        node[k] = meta[k];
      }
    }
    return node;
  }
  function _dir(children) { return { type: 'dir', children: children || [] }; }
  // ── 4. Route handlers ──

  // ── / (root) ──
  function _root() {
    return {
      type: 'dir',
      content: function(out) { T.renderHome(); },
      children: [
        { name: 'posts',    type: 'dir', desc: T._('Посты', 'Posts') },
        { name: 'saved',    type: 'dir', desc: T._('Сохранённое', 'Saved') },
        { name: 'drafts',   type: 'dir', desc: T._('Черновики', 'Drafts') },
        { name: 'trash',    type: 'dir', desc: T._('Корзина', 'Trash') },
        { name: 'profile',  type: 'dir', desc: T._('Профиль', 'Profile') },
        { name: 'users',    type: 'dir', desc: T._('Пользователи', 'Users') },
        { name: 'chat',     type: 'dir', desc: T._('Сообщения', 'Chat') },
        { name: 'notifications', type: 'dir', desc: T._('Уведомления', 'Notifications') },
        { name: 'followers',type: 'dir', desc: T._('Подписчики', 'Followers') },
        { name: 'following',type: 'dir', desc: T._('Подписки', 'Following') },
        { name: 'mnt',      type: 'dir', desc: T._('GUI точки монтирования', 'GUI mount points') },
      ],
    };
  }

  // ── /posts ──
  function _posts(sub) {
    if (sub.length === 0) {
      var children = T.feedData.map(function(p) {
        return { name: p.id + '.post', type: 'file', id: p.id, author: p.author, desc: '@' + p.author };
      });
      return {
        type: 'dir',
        children: children,
        content: function(out) { T.cmdFeed(''); },
      };
    }

    var m = sub[0].match(/^(\d+)(\.post)?$/i);
    if (!m) return _err('No such file or directory');
    var id = parseInt(m[1], 10);
    var post = _findPost(id);
    if (!post) return _err('Post #' + id + ' not found');

    // posts/42.post (file) or posts/42.post/* (sub-entries)
    if (sub.length === 1) return _buildPostNode(post);
    return _postSubdir(post, sub.slice(1));
  }

  // ── /posts/<id>.post/.meta | /image | /comments ──
  function _postSubdir(post, sub) {
    if (sub.length === 0) return _buildPostNode(post);
    var key = sub[0].toLowerCase();
    if (key === '.meta') {
      return _file({
        name: '.meta',
        content: function(out) {
          out('# likes=' + (post.likes || 0) + '\n');
          out('# comments=' + (post.comments || 0) + '\n');
          out('# views=' + (post.views || '?') + '\n');
          out('# created=' + (post.time || '?') + '\n');
        },
      });
    }
    if (key === 'image') return _postImage(post);
    if (key === 'comments') return _postComments(post, sub.slice(1));
    return _err('No such file or directory');
  }

  // ── Build a post file node (ownership-aware) ──
  function _buildPostNode(post) {
    var isOwn = T.isLoggedIn && T.username &&
                post.author &&
                post.author.toLowerCase() === T.username.toLowerCase();
    return _file({
      name: post.id + '.post',
      content: function(out) { T.cmdPostView(post.id); },
      edit: isOwn ? function(out, newText) { _editPost(post.id, newText, out); } : null,
      remove: isOwn ? function(out, force) { T.vfs.movePostToTrash(post, out, force); } : null,
      id: post.id, author: post.author, text: post.text, image: post.image,
    });
  }

  // ── /saved (symlink → posts/) ──
  function _saved(sub) {
    if (sub.length === 0) {
      return {
        type: 'dir',
        children: [],
        content: function(out) { T.cmdSaved(''); },
      };
    }
    return _posts(sub); // symlink
  }

  // ── /drafts ──
  function _drafts(sub) {
    if (sub.length === 0) {
      var files = _loadDrafts();
      var children = files.map(function(f) { return { name: f.name, type: 'file' }; });
      return _dir(children);
    }
    var fileName = sub[0];
    return _file({
      name: fileName,
      content: function(out) {
        var files = _loadDrafts();
        var f = files.find(function(x) { return x.name === fileName; });
        out('<pre>' + T.escapeHtml(f ? f.text : '') + '</pre>');
      },
      remove: function(out) {
        _removeDraft(fileName);
        out('<span class="tp-ok">' + T.escapeHtml(fileName) + ' ' + T._('удалён', 'removed') + '</span>');
      },
    });
  }

  function _loadDrafts() {
    try { return JSON.parse(localStorage.getItem('rugram_drafts')) || []; }
    catch(e) { return []; }
  }
  function _removeDraft(name) {
    var files = _loadDrafts().filter(function(f) { return f.name !== name; });
    localStorage.setItem('rugram_drafts', JSON.stringify(files));
  }

  // ── /trash (recycle bin) ──
  function _trash(sub) {
    if (sub.length === 0) {
      var items = _loadTrash();
      var children = items.map(function(item) {
        return { name: item.id + '.post', type: 'file', id: item.id, desc: item.original_path };
      });
      return _dir(children);
    }
    var m = sub[0].match(/^(\d+)(\.post)?$/i);
    if (!m) return _err('No such file or directory');
    var id = parseInt(m[1], 10);
    var items = _loadTrash();
    var item = items.find(function(x) { return x.id === id; });
    if (!item) return _err('Trash item #' + id + ' not found');

    return _file({
      name: id + '.post',
      content: function(out) {
        out('<span class="tp-section">' + T._('Пост #', 'Post #') + id + ' (' + T._('в корзине', 'in trash') + ')</span>');
        out('<span class="tp-desc">  ' + T._('Автор:', 'Author:') + ' @' + T.escapeHtml(item.author) + '</span>');
        out('<span class="tp-desc">  ' + T._('Удалён:', 'Deleted:') + ' ' + item.deleted_at + '</span>');
        out('<span class="tp-desc">  ' + T._('Путь:', 'Path:') + ' ' + item.original_path + '</span>');
        out('<br><span class="tp-muted">  # <span class="tp-cmd">rm ' + id + '.post</span> — ' + T._('удалить навсегда', 'delete permanently') + '</span>');
      },
      remove: function(out) {
        T.showLoading(T._('Удаление навсегда...', 'Deleting permanently...'));
        T.vfsFetch('/delete/' + id, {
          method: 'DELETE',
          headers: { 'X-CSRFToken': T.csrfToken(), 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'same-origin'
        }).then(function(r) {
          if (!r.ok) throw new Error();
          _removeFromTrash(id);
          T.hideLoading();
          out('<span class="tp-ok">' + T._('Пост #', 'Post #') + id + ' ' + T._('удалён навсегда', 'permanently deleted') + '</span>');
        }).catch(function() {
          T.hideLoading();
          out('<span class="tp-err">rm: ' + T._('не удалось удалить пост #', 'could not delete post #') + id + '</span>');
        });
      },
      id: id, author: item.author, text: item.text,
    });
  }

  function _loadTrash() {
    try { return JSON.parse(localStorage.getItem('rugram_trash')) || []; }
    catch(e) { return []; }
  }
  function _removeFromTrash(id) {
    var items = _loadTrash().filter(function(x) { return x.id !== id; });
    localStorage.setItem('rugram_trash', JSON.stringify(items));
  }

  // ── /profile ──
  function _profile(sub) {
    if (sub.length === 0) {
      var myName = T.username || 'unknown';
      var myPosts = T.feedData.filter(function(p) {
        return p.author.toLowerCase() === myName.toLowerCase();
      });
      var children = [{ name: 'info', type: 'file', desc: T._('Информация', 'Info') }];
      children.push({ name: 'posts', type: 'dir', desc: T._('Мои посты', 'My posts') });
      return _dir(children);
    }

    if (sub[0] === 'info') {
      return _file({
        name: 'info',
        content: function(out) { T.cmdWhoami(); },
        edit: function(out, newText) {
          if (!T.isLoggedIn) { out('<span class="tp-err">' + T._('Требуется вход.', 'Login required.') + '</span>'); return; }
          T.vfsFetch(window.EDIT_PROFILE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': T.csrfToken(), 'X-Requested-With': 'XMLHttpRequest' },
            body: 'description=' + encodeURIComponent(newText),
          }).then(function(r) {
            out(r.ok ? '<span class="tp-ok">' + T._('Профиль обновлён', 'Profile updated') + '</span>' : '<span class="tp-err">' + T._('Ошибка', 'Error') + '</span>');
          });
        },
      });
    }

    // profile/posts → list + symlink to own posts
    if (sub[0] === 'posts') {
      var myName = T.username || 'unknown';
      var myPosts = T.feedData.filter(function(p) {
        return p.author.toLowerCase() === myName.toLowerCase();
      });
      if (sub.length === 1) {
        var children = myPosts.map(function(p) {
          return { name: p.id + '.post', type: 'file', id: p.id, desc: '@' + p.author };
        });
        return _dir(children);
      }
      // profile/posts/42.post → posts/42.post (symlink, ownPost for edit/remove)
      var m = sub[1].match(/^(\d+)(\.post)?$/i);
      if (m && myPosts.some(function(p) { return p.id === parseInt(m[1], 10); })) {
        return _posts(sub.slice(1)); // delegate to posts/ with ownPost
      }
      return _err('No such file or directory');
    }

    return _err('No such file or directory');
  }

  // ── /users ──
  function _users(sub) {
    if (sub.length === 0) return _dir([]);
    var userPart = sub[0].startsWith('@') ? sub[0] : '@' + sub[0];
    return _user(userPart, sub.slice(1));
  }

  // ── @user ──
  function _user(userPart, sub) {
    var name = userPart.replace('@', '');
    if (!name) return _err('No such user');

    if (sub.length === 0) {
      return _dir([
        { name: 'info', type: 'file', desc: T._('Инфо', 'Info') },
        { name: 'posts', type: 'dir', desc: T._('Посты', 'Posts') },
      ]);
    }

    if (sub[0] === 'info') {
      return _file({
        content: function(out) { T.cmdNeofetch(name); },
      });
    }

    if (sub[0] === 'posts') {
      var userPosts = T.feedData.filter(function(p) {
        return p.author.toLowerCase() === name.toLowerCase();
      });
      if (sub.length === 1) {
        var children = userPosts.map(function(p) {
          return { name: p.id + '.post', type: 'file', id: p.id };
        });
        return _dir(children);
      }
      // users/@name/posts/42.post → posts/42.post
      return _posts(sub.slice(1)); // symlink
    }

    return _err('No such file or directory');
  }

  // ── /chat ──
  function _chat(sub) {
    if (sub.length === 0) return _dir([]);

    if (sub[0] && sub[0].startsWith('@')) {
      var name = sub[0].replace('@', '');
      if (sub.length === 1) return _chatUser(name, []);
      return _chatUser(name, sub.slice(1));
    }

    // chat/<number> — fallback for backward compat (treated as @id)
    var m = sub[0].match(/^(\d+)$/);
    if (m) return _chatUser('user' + m[1], sub.slice(1));

    return _err('No such file or directory');
  }

  function _chatUser(name, sub) {
    if (sub.length === 0) {
      return _dir([
        { name: 'inbox', type: 'dir', desc: T._('Входящие', 'Inbox') },
        { name: 'outbox', type: 'dir', desc: T._('Исходящие', 'Outbox') },
      ]);
    }

    // Shared: resolve @name → chatId then load messages
    function _loadMsgs(afterResolve) {
      if (!T.isLoggedIn) return afterResolve(null, T._('Требуется вход.', 'Login required.'));
      T.showLoading(T._('Загрузка сообщений...', 'Loading messages...'));
      T.vfsFetch(window.API_CHAT_LIST_URL, { credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var chats = data.chats || [];
          var chat = null;
          for (var i = 0; i < chats.length; i++) {
            if (chats[i].other_user && chats[i].other_user.username.toLowerCase() === name.toLowerCase()) {
              chat = chats[i]; break;
            }
          }
          if (!chat) {
            T.hideLoading();
            afterResolve(null, T._('Нет диалога с @', 'No chat with @') + T.escapeHtml(name));
            return;
          }
          T.vfsFetch('/chat/' + chat.id + '/messages?limit=50', { credentials: 'same-origin' })
            .then(function(r2) { return r2.json(); })
            .then(function(msgData) {
              T.hideLoading();
              var msgs = msgData.messages || [];
              var otherUser = msgData.other_user || {};
              afterResolve({ chatId: chat.id, messages: msgs, otherUser: otherUser, chat: chat });
            })
            .catch(function() {
              T.hideLoading();
              afterResolve(null, T._('Ошибка загрузки сообщений.', 'Error loading messages.'));
            });
        })
        .catch(function() {
          T.hideLoading();
          afterResolve(null, T._('Ошибка загрузки диалогов.', 'Error loading conversations.'));
        });
    }

    if (sub[0] === 'inbox') {
      if (sub.length === 1) {
        return {
          type: 'dir',
          children: [],
          content: function(out) {
            _loadMsgs(function(result, err) {
              if (err) { out('<span class="tp-err">' + err + '</span>'); return; }
              var msgs = result.messages.filter(function(m) {
                return m.author && m.author.username.toLowerCase() !== (T.username || '').toLowerCase();
              });
              if (!msgs.length) {
                out('<span class="tp-muted">  ' + T._('Нет входящих сообщений', 'No incoming messages') + '</span>');
                return;
              }
              out('<span class="tp-section">' + T._('Входящие от @', 'Inbox from @') + T.escapeHtml(name) + '</span>');
              msgs.forEach(function(m) {
                var time = T.relTime(m.created_date);
                out('  <span class="tp-post-id">' + m.id + '.msg</span>  <span class="tp-muted">@' + T.escapeHtml(m.author.username) + ' ' + time + '</span>');
              });
              out('<span class="tp-muted">' + msgs.length + ' ' + T._('сообщений', 'messages') + '</span>');
            });
          },
        };
      }
      var mInbox = sub[1].match(/^(\d+)\.msg$/);
      if (mInbox) {
        return _file({
          name: mInbox[1] + '.msg',
          content: function(out) {
            _loadMsgs(function(result, err) {
              if (err) { out('<span class="tp-err">' + err + '</span>'); return; }
              var msgs = result.messages.filter(function(m) {
                return m.author && m.author.username.toLowerCase() !== (T.username || '').toLowerCase();
              });
              var msg = null;
              for (var i = 0; i < msgs.length; i++) {
                if (msgs[i].id === parseInt(mInbox[1], 10)) { msg = msgs[i]; break; }
              }
              if (!msg) {
                out('<span class="tp-err">message #' + mInbox[1] + ' ' + T._('не найдено', 'not found') + '</span>');
                return;
              }
              var time = T.relTime(msg.created_date);
              out('<span class="tp-section">' + T._('Сообщение #', 'Message #') + msg.id + '</span>');
              out('  <span class="tp-post-author">@' + T.escapeHtml(msg.author.username) + '</span> <span class="tp-muted">' + time + '</span>');
              out('<span class="tp-ok">' + T.escapeHtml(msg.text) + '</span>');
            });
          },
        });
      }
      return _err('No such file or directory');
    }

    if (sub[0] === 'outbox') {
      if (sub.length === 1) {
        return {
          type: 'dir',
          children: [],
          content: function(out) {
            _loadMsgs(function(result, err) {
              if (err) { out('<span class="tp-err">' + err + '</span>'); return; }
              var msgs = result.messages.filter(function(m) {
                return m.author && m.author.username.toLowerCase() === (T.username || '').toLowerCase();
              });
              if (!msgs.length) {
                out('<span class="tp-muted">  ' + T._('Нет исходящих сообщений', 'No outgoing messages') + '</span>');
                return;
              }
              out('<span class="tp-section">' + T._('Исходящие @', 'Outbox to @') + T.escapeHtml(name) + '</span>');
              msgs.forEach(function(m) {
                var time = T.relTime(m.created_date);
                out('  <span class="tp-post-id">' + m.id + '.msg</span>  <span class="tp-muted">' + time + '</span>');
              });
              out('<span class="tp-muted">' + msgs.length + ' ' + T._('сообщений', 'messages') + '</span>');
            });
          },
        };
      }
      var mOutbox = sub[1].match(/^(\d+)\.msg$/);
      if (mOutbox) {
        return _file({
          name: mOutbox[1] + '.msg',
          content: function(out) {
            _loadMsgs(function(result, err) {
              if (err) { out('<span class="tp-err">' + err + '</span>'); return; }
              var msgs = result.messages.filter(function(m) {
                return m.author && m.author.username.toLowerCase() === (T.username || '').toLowerCase();
              });
              var msg = null;
              for (var i = 0; i < msgs.length; i++) {
                if (msgs[i].id === parseInt(mOutbox[1], 10)) { msg = msgs[i]; break; }
              }
              if (!msg) {
                out('<span class="tp-err">message #' + mOutbox[1] + ' ' + T._('не найдено', 'not found') + '</span>');
                return;
              }
              var time = T.relTime(msg.created_date);
              out('<span class="tp-section">' + T._('Сообщение #', 'Message #') + msg.id + '</span>');
              out('  <span class="tp-post-author">me</span> <span class="tp-muted">' + time + '</span>');
              out('<span class="tp-ok">' + T.escapeHtml(msg.text) + '</span>');
            });
          },
        });
      }
      return _err('No such file or directory');
    }

    return _err('No such file or directory');
  }

  // ── /notifications ──
  function _notifications(sub) {
    if (sub.length > 0) {
      var m = sub[0].match(/^(\d+)(\.notification)?$/);
      if (m) {
        var notifId = parseInt(m[1], 10);
        return _file({
          name: m[1] + '.notification',
          content: function(out) {
            if (!T.isLoggedIn) {
              out('<span class="tp-err">' + T._('Требуется вход.', 'Login required.') + '</span>');
              return;
            }
            T.showLoading(T._('Загрузка уведомления...', 'Loading notification...'));
            T.vfsFetch(window.API_NOTIFICATIONS_URL, { credentials: 'same-origin' })
              .then(function(r) { return r.json(); })
              .then(function(data) {
                T.hideLoading();
                var raw = data.notifications || [];
                var n = null;
                for (var i = 0; i < raw.length; i++) {
                  if (raw[i].id === notifId) { n = raw[i]; break; }
                }
                if (!n) {
                  out('<span class="tp-err">' + T._('Уведомление #', 'Notification #') + notifId + ' ' + T._('не найдено', 'not found') + '</span>');
                  return;
                }
                var icon = n.type === 'like' ? '+' : n.type === 'comment' ? 'c' : '>';
                var msg = n.type === 'like' ? T._('лайкнул(а) ваш пост', 'liked your post') :
                          n.type === 'comment' ? T._('прокомментировал(а) ваш пост', 'commented on your post') :
                          T._('подписался(ась) на вас', 'followed you');
                out('<span class="tp-section">' + T._('Уведомление #', 'Notification #') + notifId + '</span>');
                out('<span class="tp-desc">  ' + icon + ' @' + T.escapeHtml(n.actor.username) + ' — ' + msg + '</span>');
                out('<span class="tp-muted">  ' + T._('Время:', 'Time:') + ' ' + n.created_date + '</span>');
                out('<span class="tp-muted">  ' + T._('Тип:', 'Type:') + ' ' + n.type + '</span>');
                if (n.post_id) {
                  out('<span class="tp-muted">  ' + T._('Пост:', 'Post:') + ' #' + n.post_id + '</span>');
                }
                var readStatus = n.is_read ? T._('прочитано', 'read') : T._('не прочитано', 'unread');
                out('<span class="tp-muted">  ' + T._('Статус:', 'Status:') + ' ' + readStatus + '</span>');
              })
              .catch(function() {
                T.hideLoading();
                out('<span class="tp-err">' + T._('Ошибка загрузки.', 'Error loading.') + '</span>');
              });
          },
        });
      }
      return _err('No such file or directory');
    }
    return {
      type: 'dir',
      children: [],
      content: function(out) {
        if (!T.isLoggedIn) {
          out('<span class="tp-err">notifications: ' + T._('Требуется вход.', 'Login required.') + '</span>');
          return;
        }
        T.showLoading(T._('Загрузка уведомлений...', 'Loading notifications...'));
        T.vfsFetch(window.API_NOTIFICATIONS_URL, { credentials: 'same-origin' })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            T.hideLoading();
            var raw = data.notifications || [];
            if (!raw.length) {
              out('<span class="tp-muted">  ' + T._('Нет уведомлений.', 'No notifications.') + '</span>');
              return;
            }
            out('<span class="tp-section">' + T._('Уведомления', 'Notifications') + ' (' + raw.length + ')</span>');
            raw.forEach(function(n) {
              var icon = n.is_read ? '<span class="tp-muted">●</span>' : '<span class="tp-ok">●</span>';
              var typeIcon = n.type === 'like' ? '+' : n.type === 'comment' ? 'c' : '>';
              out(icon + ' <span class="tp-post-id">' + n.id + '.notification</span>  <span class="tp-post-author">@' + T.escapeHtml(n.actor.username) + '</span>  <span class="tp-muted">' + typeIcon + ' ' + n.type + '</span>');
            });
          })
          .catch(function() {
            T.hideLoading();
            out('<span class="tp-err">' + T._('Ошибка загрузки уведомлений.', 'Error loading notifications.') + '</span>');
          });
      },
    };
  }

  // ── /mnt (GUI mount points) ──
  function _mnt(sub) {
    if (sub.length === 0) {
      return _dir([
        { name: 'settings', type: 'file', desc: T._('Настройки (GUI)', 'Settings (GUI)') },
        { name: 'edit_profile', type: 'file', desc: T._('Редактор профиля (GUI)', 'Edit profile (GUI)') },
      ]);
    }
    if (sub[0] === 'settings') {
      return _file({
        name: 'settings',
        content: function(out) {
          out('<span class="tp-section">' + T._('Настройки', 'Settings') + '</span>');
          out('<span class="tp-muted">  ' + T._('Открыть в GUI:', 'Open in GUI:') + ' <a href="' + T.escapeHtml(window.SETTINGS_URL || '/settings') + '" target="_blank" class="tp-cmd">' + T._('Настройки', 'Settings') + '</a></span>');
          out('<span class="tp-desc">  # <span class="tp-cmd">gui</span> ' + T._('для перехода в GUI', 'to switch to GUI') + '</span>');
          out('<span class="tp-desc">  # ' + T._('или используйте nano profile/info', 'or use nano profile/info') + '</span>');
        },
      });
    }
    if (sub[0] === 'edit_profile') {
      return _file({
        name: 'edit_profile',
        content: function(out) {
          out('<span class="tp-section">' + T._('Редактирование профиля', 'Edit profile') + '</span>');
          out('<span class="tp-muted">  ' + T._('Открыть в GUI:', 'Open in GUI:') + ' <a href="' + T.escapeHtml(window.EDIT_PROFILE_URL || '/edit_profile') + '" target="_blank" class="tp-cmd">' + T._('Редактор профиля', 'Edit profile') + '</a></span>');
          out('<span class="tp-desc">  # <span class="tp-cmd">nano profile/info</span> ' + T._('редактировать из терминала', 'to edit from terminal') + '</span>');
          out('<span class="tp-desc">  # <span class="tp-cmd">profile/info</span> ' + T._('чтобы увидеть текущий', 'to see current') + '</span>');
        },
      });
    }
    return _err('No such file or directory');
  }

  // ── /followers ──
  function _followers(sub) {
    if (sub.length > 0 && sub[0].startsWith('@')) {
      var name = sub[0].replace('@', '');
      return _file({
        name: sub[0],
        content: function(out) { T.cmdNeofetch(name); },
      });
    }
    return {
      type: 'dir',
      children: [],
      content: function(out) {
        var user = T.isLoggedIn ? T.username : null;
        if (!user) {
          out('<span class="tp-err">' + T._('Требуется вход.', 'Login required.') + '</span>');
          out('<span class="tp-desc">  # <span class="tp-cmd">followers --of @user</span></span>');
          return;
        }
        T.showLoading(T._('Загрузка подписчиков...', 'Loading followers...'));
        T.vfsFetch('/api/v1/followers/' + encodeURIComponent(user), { credentials: 'same-origin' })
          .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
          .then(function(data) {
            T.hideLoading();
            var users = data.users || [];
            if (!users.length) {
              out('<span class="tp-muted">  ' + T._('Нет подписчиков.', 'No followers.') + '</span>');
              return;
            }
            out('<span class="tp-section">' + T._('Подписчики', 'Followers') + ' (' + T.escapeHtml(user) + ')</span>');
            users.forEach(function(u) {
              var online = u.is_online ? '<span class="tp-ok">●</span>' : '<span class="tp-muted">○</span>';
              out('  ' + online + ' <span class="tp-post-author">@' + T.escapeHtml(u.username) + '</span>');
              if (u.description) out('    <span class="tp-muted">' + T.escapeHtml(u.description.substring(0, 80)) + '</span>');
            });
            out('<span class="tp-muted">' + users.length + ' ' + T._('пользователей', 'users') + '</span>');
          })
          .catch(function() {
            T.hideLoading();
            out('<span class="tp-err">' + T._('Ошибка загрузки подписчиков.', 'Error loading followers.') + '</span>');
          });
      },
    };
  }

  // ── /following ──
  function _following(sub) {
    if (sub.length > 0 && sub[0].startsWith('@')) {
      var name = sub[0].replace('@', '');
      return _file({
        name: sub[0],
        content: function(out) { T.cmdNeofetch(name); },
      });
    }
    return {
      type: 'dir',
      children: [],
      content: function(out) {
        var user = T.isLoggedIn ? T.username : null;
        if (!user) {
          out('<span class="tp-err">' + T._('Требуется вход.', 'Login required.') + '</span>');
          out('<span class="tp-desc">  # <span class="tp-cmd">following --of @user</span></span>');
          return;
        }
        T.showLoading(T._('Загрузка подписок...', 'Loading following...'));
        T.vfsFetch('/api/v1/following/' + encodeURIComponent(user), { credentials: 'same-origin' })
          .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
          .then(function(data) {
            T.hideLoading();
            var users = data.users || [];
            if (!users.length) {
              out('<span class="tp-muted">  ' + T._('Нет подписок.', 'Not following anyone.') + '</span>');
              return;
            }
            out('<span class="tp-section">' + T._('Подписки', 'Following') + ' (' + T.escapeHtml(user) + ')</span>');
            users.forEach(function(u) {
              var online = u.is_online ? '<span class="tp-ok">●</span>' : '<span class="tp-muted">○</span>';
              out('  ' + online + ' <span class="tp-post-author">@' + T.escapeHtml(u.username) + '</span>');
              if (u.description) out('    <span class="tp-muted">' + T.escapeHtml(u.description.substring(0, 80)) + '</span>');
            });
            out('<span class="tp-muted">' + users.length + ' ' + T._('пользователей', 'users') + '</span>');
          })
          .catch(function() {
            T.hideLoading();
            out('<span class="tp-err">' + T._('Ошибка загрузки подписок.', 'Error loading following.') + '</span>');
          });
      },
    };
  }

  // ── 5. Helpers ──

  function _findPost(id) {
    for (var i = 0; i < T.feedData.length; i++) {
      if (T.feedData[i].id === id) return T.feedData[i];
    }
    return null;
  }

  function _editPost(id, newText, out) {
    var url = window.EDIT_POST_URL.replace('/0/', '/' + id + '/');
    T.vfsFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRFToken': T.csrfToken(),
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: 'text=' + encodeURIComponent(newText),
    }).then(function(r) {
      if (r.ok || r.status === 201) {
        T.feedData.forEach(function(p) { if (p.id === id) p.text = newText; });
        out('<span class="tp-ok">' + T._('Сохранено', 'Saved') + '</span>');
      } else {
        out('<span class="tp-err">' + T._('Ошибка сохранения', 'Save error') + '</span>');
      }
    }).catch(function() {
      out('<span class="tp-err">' + T._('Ошибка запроса', 'Request failed') + '</span>');
    });
  }

  // ── Trash / permanent-delete a post (shared, used by VFS and cmdRm) ──
  T.vfs.movePostToTrash = function(post, out, force) {
    if (force) {
      T.vfsFetch('/delete/' + post.id, {
        method: 'DELETE',
        headers: { 'X-CSRFToken': T.csrfToken(), 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin'
      }).then(function(r) {
        if (r.ok) {
          T.feedData = T.feedData.filter(function(p) { return p.id !== post.id; });
          out('<span class="tp-ok">' + T._('Пост #', 'Post #') + post.id + ' ' + T._('удалён навсегда', 'permanently deleted') + '</span>');
        } else {
          out('<span class="tp-err">rm: ' + T._('ошибка удаления', 'could not delete') + '</span>');
        }
      }).catch(function() {
        out('<span class="tp-err">rm: ' + T._('ошибка запроса', 'request failed') + '</span>');
      });
      return;
    }
    // — default: move to trash —
    var trash = _loadTrash();
    trash.push({
      id: post.id, author: post.author, text: post.text, time: post.time,
      likes: post.likes, image: post.image,
      original_path: 'posts/' + post.id + '.post',
      deleted_at: new Date().toISOString(),
    });
    localStorage.setItem('rugram_trash', JSON.stringify(trash));
    T.feedData = T.feedData.filter(function(p) { return p.id !== post.id; });
    out('<span class="tp-ok">' + T._('Пост #', 'Post #') + post.id + ' ' + T._('перемещён в корзину', 'moved to trash') + '</span>');
    out('<span class="tp-muted">  # ' + T._('Восстановление: пока не реализовано', 'Restore: not yet implemented') + '</span>');
  }

  function _postImage(post) {
    return _file({
      name: 'image',
      content: function(out) {
        if (!post.image) { out('<span class="tp-err">cat: ' + T._('нет изображения', 'no image') + '</span>'); return; }
        T.imageToAscii('/static/uploads/posts/' + post.image, 80, function(ascii) { out(ascii); });
      },
    });
  }

  function _postComments(post, sub) {
    if (sub.length === 0) return _dir([]);
    var m = sub[0].match(/^(\d+)(\.comment)?$/i);
    if (m) {
      return _file({
        name: m[1] + '.comment',
        content: function(out) { out('<span class="tp-muted">comment #' + m[1] + ' on post #' + post.id + '</span>'); },
      });
    }
    return _err('No such file or directory');
  }

  // ── 6. Public resolve ──
  T.vfs.resolve = function(path) {
    var parts = this.normalize(path, T.cwd);
    return this.route(parts);
  };

  T.vfs.isDir = function(path) {
    var node = this.resolve(path);
    return node && !node.error && node.type === 'dir';
  };

  T.vfs.isFile = function(path) {
    var node = this.resolve(path);
    return node && !node.error && node.type === 'file';
  };

})(window.TERMINAL);
