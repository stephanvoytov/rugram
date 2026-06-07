// ── Rugram Terminal — Virtual File System v3 (class-based) ──
// Единый движок разрешения путей. Все команды (cd, ls, cat, rm, nano)
// идут через T.vfs.resolve() — никакого хардкода в каждой команде.
(function(T) {
  'use strict';

  // ── Node classes ──

  /**
   * @typedef {Object} VfsDirOpts
   * @property {function(string): void} [content] - Async callback accepting a `write(line)` fn
   */

  /**
   * Virtual directory node. Children are resolved synchronously from in-memory data;
   * dynamic directories (e.g. followers/) use `content()` callback.
   */
  class VfsDir {
    /**
     * @param {Array<VfsDir|VfsFile>} [children] - Child nodes
     * @param {VfsDirOpts} [opts] - Options
     */
    constructor(children, opts) {
      this.type = 'dir';
      this.children = children || [];
      if (opts && opts.content) this.content = opts.content;
    }
  }

  /**
   * @typedef {Object} VfsFileOpts
   * @property {function(string): void} [content] - Render content callback (`write(line)`)
   * @property {function(): void} [remove]     - Delete/move-to-trash handler
   * @property {function(): void} [edit]       - Open in nano overlay
   * @property {string}        [name]          - Display name (falls back to constructor arg)
   * @property {number}        [id]            - Post ID
   * @property {string}        [author]        - Post author username
   * @property {string}        [text]          - Post text
   * @property {string}        [image]         - Post image URL
   */

  /**
   * Virtual file node. Extra properties from `opts` (id, author, text, etc.)
   * are copied directly onto the instance.
   */
  class VfsFile {
    /**
     * @param {string} name - File name
     * @param {VfsFileOpts} opts - Options (all extra props copied to instance)
     */
    constructor(name, opts) {
      this.type = 'file';
      this.name = name || '';
      if (!opts) opts = {};
      if (opts.content) this.content = opts.content;
      if (opts.remove)  this.remove  = opts.remove;
      if (opts.edit)    this.edit    = opts.edit;
      // Copy extra properties (id, author, text, image, etc.)
      for (var k in opts) {
        if (k !== 'content' && k !== 'remove' && k !== 'edit' && k !== 'name') {
          this[k] = opts[k];
        }
      }
    }
  }

  // ── VFS class ──

  class VFS {

    // ── 1. Path normalization ──
    normalize(path, cwd) {
      path = (path || '').trim();
      cwd = cwd || '';
      if (!path || path === '~' || path === '/') return cwd ? cwd.split('/') : [];

      if (path.startsWith('/')) {
        path = path.substring(1);
      } else if (path.startsWith('~/')) {
        path = path.substring(2);
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
    }

    // ── 2. Canonical path string ──
    canonical(parts) {
      if (!parts || parts.length === 0) return '';
      return parts.join('/');
    }

    // ── 3. Route: parts → node ──
    route(parts) {
      if (!parts || parts.length === 0) return this._root();
      var first = parts[0].toLowerCase();
      var sub = parts.slice(1);

      if (first.startsWith('@')) return this._user(first, sub);

      switch (first) {
        case 'posts':    return this._posts(sub);
        case 'saved':    return this._saved(sub);
        case 'drafts':   return this._drafts(sub);
        case 'trash':    return this._trash(sub);
        case 'profile':  return this._profile(sub);
        case 'users':    return this._users(sub);
        case 'chat':     return this._chat(sub);
        case 'notifications': return this._notifications(sub);
        case 'followers':  return this._followers(sub);
        case 'following':  return this._following(sub);
        case 'mnt':      return this._mnt(sub);
      }

      throw new Error('No such file or directory');
    }

    // ── 4. Route handlers ──

    _root() {
      return new VfsDir([
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
        { name: 'mnt',      type: 'dir', desc: T._('(пусто)', '(empty)') },
      ], {
        content: function(out) { T.renderHome(); },
      });
    }

    // ── /posts ──
    _posts(sub) {
      var self = this;
      if (sub.length === 0) {
        var children = T.feedData.map(function(p) {
          return { name: p.id + '.post', type: 'file', id: p.id, author: p.author, desc: '@' + p.author };
        });
        return new VfsDir(children, {
          content: function(out) { T.cmdFeed(''); },
        });
      }

      var m = sub[0].match(/^(\d+)(\.post)?$/i);
      if (!m) throw new Error('No such file or directory');
      var id = parseInt(m[1], 10);
      var post = self._findPost(id);
      if (!post) throw new Error('Post #' + id + ' not found');

      if (sub.length === 1) return self._buildPostNode(post);
      return self._postSubdir(post, sub.slice(1));
    }

    // ── /posts/<id>.post/.meta | /image | /comments ──
    _postSubdir(post, sub) {
      if (sub.length === 0) return this._buildPostNode(post);
      var key = sub[0].toLowerCase();
      if (key === '.meta') {
        return new VfsFile('.meta', {
          content: function(out) {
            out('# likes=' + (post.likes || 0) + '\n');
            out('# comments=' + (post.comments || 0) + '\n');
            out('# views=' + (post.views || '?') + '\n');
            out('# created=' + (post.time || '?') + '\n');
          },
        });
      }
      if (key === 'image') return this._postImage(post);
      if (key === 'comments') return this._postComments(post, sub.slice(1));
      throw new Error('No such file or directory');
    }

    // ── Build a post file node (ownership-aware) ──
    _buildPostNode(post) {
      var isOwn = T.isLoggedIn && T.username &&
                  post.author &&
                  post.author.toLowerCase() === T.username.toLowerCase();
      return new VfsFile(post.id + '.post', {
        content: function(out) { T.cmdPostView(post.id); },
        edit: isOwn ? function(out, newText) { T.editPost(post.id, newText, out); } : null,
        remove: isOwn ? function(out, force) { T.movePostToTrash(post, out, force); } : null,
        id: post.id, author: post.author, text: post.text, image: post.image,
      });
    }

    // ── /saved (symlink → posts/) ──
    _saved(sub) {
      if (sub.length === 0) {
        return new VfsDir([], {
          content: function(out) { T.cmdSaved(''); },
        });
      }
      return this._posts(sub);
    }

    // ── /drafts ──
    _drafts(sub) {
      if (sub.length === 0) {
        var files = T.loadDrafts();
        var children = files.map(function(f) { return { name: f.name, type: 'file' }; });
        return new VfsDir(children);
      }
      var fileName = sub[0];
      return new VfsFile(fileName, {
        content: function(out) {
          var files = T.loadDrafts();
          var f = files.find(function(x) { return x.name === fileName; });
          out('<pre>' + T.escapeHtml(f ? f.text : '') + '</pre>');
        },
        remove: function(out) {
          T.removeDraft(fileName);
          out('<span class="tp-ok">' + T.escapeHtml(fileName) + ' ' + T._('удалён', 'removed') + '</span>');
        },
      });
    }

    // ── /trash (recycle bin) ──
    _trash(sub) {
      if (sub.length === 0) {
        var items = T.loadTrash();
        var children = items.map(function(item) {
          return { name: item.id + '.post', type: 'file', id: item.id, desc: item.original_path };
        });
        return new VfsDir(children);
      }
      var m = sub[0].match(/^(\d+)(\.post)?$/i);
      if (!m) throw new Error('No such file or directory');
      var id = parseInt(m[1], 10);
      var items = T.loadTrash();
      var item = items.find(function(x) { return x.id === id; });
      if (!item) throw new Error('Trash item #' + id + ' not found');

      return new VfsFile(id + '.post', {
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
            T.removeFromTrash(id);
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

    // ── /profile ──
    _profile(sub) {
      var self = this;
      if (sub.length === 0) {
        var myName = T.username || 'unknown';
        var myPosts = T.feedData.filter(function(p) {
          return p.author.toLowerCase() === myName.toLowerCase();
        });
        var children = [{ name: 'info', type: 'file', desc: T._('Информация', 'Info') }];
        children.push({ name: 'posts', type: 'dir', desc: T._('Мои посты', 'My posts') });
        return new VfsDir(children);
      }

      if (sub[0] === 'info') {
        return new VfsFile('info', {
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
          return new VfsDir(children);
        }
        // profile/posts/42.post → posts/42.post (symlink)
        var m = sub[1].match(/^(\d+)(\.post)?$/i);
        if (m && myPosts.some(function(p) { return p.id === parseInt(m[1], 10); })) {
          return self._posts(sub.slice(1));
        }
        throw new Error('No such file or directory');
      }

      throw new Error('No such file or directory');
    }

    // ── /users ──
    _users(sub) {
      if (sub.length === 0) return new VfsDir([]);
      var userPart = sub[0].startsWith('@') ? sub[0] : '@' + sub[0];
      return this._user(userPart, sub.slice(1));
    }

    // ── @user ──
    _user(userPart, sub) {
      var name = userPart.replace('@', '');
      if (!name) throw new Error('No such user');

      if (sub.length === 0) {
        return new VfsDir([
          { name: 'info', type: 'file', desc: T._('Инфо', 'Info') },
          { name: 'posts', type: 'dir', desc: T._('Посты', 'Posts') },
        ]);
      }

      if (sub[0] === 'info') {
        return new VfsFile('info', {
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
          return new VfsDir(children);
        }
        // users/@name/posts/42.post → posts/42.post
        return this._posts(sub.slice(1)); // symlink
      }

      throw new Error('No such file or directory');
    }

    // ── /chat ──
    _chat(sub) {
      if (sub.length === 0) return new VfsDir([]);

      if (sub[0] && sub[0].startsWith('@')) {
        var name = sub[0].replace('@', '');
        if (sub.length === 1) return this._chatUser(name, []);
        return this._chatUser(name, sub.slice(1));
      }

      // chat/<number> — fallback for backward compat (treated as @id)
      var m = sub[0].match(/^(\d+)$/);
      if (m) return this._chatUser('user' + m[1], sub.slice(1));

      throw new Error('No such file or directory');
    }

    _chatUser(name, sub) {
      var self = this;
      if (sub.length === 0) {
        return new VfsDir([
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
          return new VfsDir([], {
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
          });
        }
        var mInbox = sub[1].match(/^(\d+)\.msg$/);
        if (mInbox) {
          return new VfsFile(mInbox[1] + '.msg', {
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
        throw new Error('No such file or directory');
      }

      if (sub[0] === 'outbox') {
        if (sub.length === 1) {
          return new VfsDir([], {
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
          });
        }
        var mOutbox = sub[1].match(/^(\d+)\.msg$/);
        if (mOutbox) {
          return new VfsFile(mOutbox[1] + '.msg', {
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
        throw new Error('No such file or directory');
      }

      throw new Error('No such file or directory');
    }

    // ── /notifications ──
    _notifications(sub) {
      var self = this;
      if (sub.length > 0) {
        var m = sub[0].match(/^(\d+)(\.notification)?$/);
        if (m) {
          var notifId = parseInt(m[1], 10);
          return new VfsFile(m[1] + '.notification', {
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
        throw new Error('No such file or directory');
      }
      return new VfsDir([], {
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
      });
    }

    // ── /mnt (reserved) ──
    _mnt(sub) {
      if (sub.length === 0) {
        return new VfsDir([]);
      }
      throw new Error('No such file or directory');
    }

    // ── /followers ──
    _followers(sub) {
      if (sub.length > 0 && sub[0].startsWith('@')) {
        var name = sub[0].replace('@', '');
        return new VfsFile(sub[0], {
          content: function(out) { T.cmdNeofetch(name); },
        });
      }
      return new VfsDir([], {
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
      });
    }

    // ── /following ──
    _following(sub) {
      if (sub.length > 0 && sub[0].startsWith('@')) {
        var name = sub[0].replace('@', '');
        return new VfsFile(sub[0], {
          content: function(out) { T.cmdNeofetch(name); },
        });
      }
      return new VfsDir([], {
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
      });
    }

    // ── 5. Helpers ──

    _findPost(id) {
      for (var i = 0; i < T.feedData.length; i++) {
        if (T.feedData[i].id === id) return T.feedData[i];
      }
      return null;
    }

    // ── /posts/<id>.post/image ──
    _postImage(post) {
      return new VfsFile('image', {
        content: function(out) {
          if (!post.image) { out('<span class="tp-err">cat: ' + T._('нет изображения', 'no image') + '</span>'); return; }
          T.imageToAscii('/static/uploads/posts/' + post.image, 80, function(ascii) { out(ascii); });
        },
      });
    }

    // ── /posts/<id>.post/comments ──
    _postComments(post, sub) {
      if (sub.length === 0) return new VfsDir([]);
      var m = sub[0].match(/^(\d+)(\.comment)?$/i);
      if (m) {
        return new VfsFile(m[1] + '.comment', {
          content: function(out) { out('<span class="tp-muted">comment #' + m[1] + ' on post #' + post.id + '</span>'); },
        });
      }
      throw new Error('No such file or directory');
    }

    // ── 6. Public resolve —─
    resolve(path) {
      var parts = this.normalize(path, T.cwd);
      // route() throws on error — let it propagate
      return this.route(parts);
    }

    isDir(path) {
      try {
        var node = this.resolve(path);
        return node && node.type === 'dir';
      } catch(e) {
        return false;
      }
    }

    isFile(path) {
      try {
        var node = this.resolve(path);
        return node && node.type === 'file';
      } catch(e) {
        return false;
      }
    }

  }

  // ── Instantiate ──
  T.vfs = new VFS();

})(window.__RT);
