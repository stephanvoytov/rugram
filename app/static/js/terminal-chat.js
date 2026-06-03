// ── Rugram Terminal — Chat System ──
(function(T) {
  'use strict';

  // ── Stop chat polling ──
  T.stopChatPolling = function() {
    if (T.chatPollInterval) {
      clearInterval(T.chatPollInterval);
      T.chatPollInterval = null;
    }
  };

  // ── Render chat list (program view) ──
  T.renderChatList = function() {
    if (!T.isLoggedIn) {
      T.addOutputLine('<span class="tp-err">chat: ' + T._('Требуется вход.', 'Login required.') + '</span>');
      T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
      return;
    }
    T.enterProgramView();
    T.addSysLine('Fetching conversations...');
    fetch(window.API_CHAT_LIST_URL, { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        T.clearOutput();
        T.addOutputLine('<span class="tp-section">' + T._('Диалоги', 'Conversations') + '</span>');
        if (!data.chats || !data.chats.length) {
          T.addOutputLine('<span class="tp-muted">  ' + T._('нет диалогов', 'no conversations') + '</span>');
          T.addOutputLine('<span class="tp-desc">  # <span class="tp-cmd">start @user</span> ' + T._('начать диалог', 'to start a chat') + '</span>');
          T.addOutputLine('');
          T.addOutputLine('<span class="tp-muted"># ' + T._('q — выйти', 'q — quit') + '</span>');
          T.onceKey('q', function(){T.exitProgramView()});
          return;
        }
        // Build items for less-like program view
        var items = data.chats.map(function(chat) {
          return {
            id: chat.id,
            username: chat.other_user.username,
            time: chat.last_message_time,
            text: chat.last_message || '',
            unread: chat.unread_count,
            is_online: chat.other_user.is_online,
            chat_id: chat.id
          };
        });
        T.enterLessMode(items, T._('Диалоги', 'Conversations') + ' (' + items.length + ')', function(item) {
          T._exitLessMode();
          T.cwd = 'chat/' + item.chat_id;
          T.updatePrompt();
          T.loadChatMessages(item.chat_id);
        });
      })
      .catch(function() {
        T.clearOutput();
        T.addOutputLine('<span class="tp-err">' + T._('Ошибка загрузки диалогов.', 'Error loading conversations.') + '</span>');
        T.addOutputLine('');
        T.addOutputLine('<span class="tp-muted"># q — ' + T._('выйти', 'quit') + '</span>');
        T.onceKey('q', function(){T.exitProgramView()});
      });
  };

  // ── Load chat messages (program view) ──
  T.loadChatMessages = function(chatId) {
    if (!T.isLoggedIn) {
      T.addOutputLine('<span class="tp-err">chat: ' + T._('Требуется вход.', 'Login required.') + '</span>');
      T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
      return;
    }
    T.stopChatPolling();
    T.enterProgramView();
    T.addSysLine('Loading chat...');
    fetch('/chat/' + chatId + '/messages?limit=50', { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        T.clearOutput();
        T.currentChatUser = data.other_user?.username || 'unknown';
        T.addOutputLine('<span class="tp-section">' + T._('Чат с @', 'Chat with @') + T.escapeHtml(T.currentChatUser) + '</span>');
        T.addOutputLine('<span class="tp-desc">  # <span class="tp-cmd">say &lt;text&gt;</span> ' + T._('отправить', 'to send') + '  ·  q ' + T._('выйти', 'quit') + '</span>');

        var msgs = data.messages || [];
        if (!msgs.length) {
          T.addOutputLine('<span class="tp-muted">  ' + T._('нет сообщений', 'no messages yet') + '</span>');
        } else {
          msgs.forEach(function(msg) {
            var isOwn = msg.author_id === T.currentUserId;
            var time = msg.created_date ? T.relTime(msg.created_date) : '';
            var chatUser = T.escapeHtml(T.currentChatUser);
            var author = isOwn ? 'me' : '@' + chatUser;
            var cls = isOwn ? 'tp-ok' : 'tp-cmd';
            T.addOutputLine(' <span class="' + cls + '">' + T.escapeHtml(msg.text) + '</span>  <span class="tp-muted">' + author + ' ' + time + '</span>');
          });
          T.lastMessageId = msgs[msgs.length - 1].id;
        }

        T.chatPollInterval = setInterval(function() {
          fetch('/chat/' + chatId + '/messages?after=' + T.lastMessageId, { credentials: 'same-origin' })
            .then(function(r) { return r.json(); })
            .then(function(pollData) {
              var newMsgs = pollData.messages || [];
              if (!newMsgs.length) return;
              newMsgs.forEach(function(msg) {
                var isOwn = msg.author_id === T.currentUserId;
                var time = msg.created_date ? T.relTime(msg.created_date) : '';
                var chatUser = T.escapeHtml(T.currentChatUser || '?');
                var author = isOwn ? 'me' : '@' + chatUser;
                var cls = isOwn ? 'tp-ok' : 'tp-cmd';
                T.addOutputLine(' <span class="' + cls + '">' + T.escapeHtml(msg.text) + '</span>  <span class="tp-muted">' + author + ' ' + time + '</span>');
              });
              T.lastMessageId = newMsgs[newMsgs.length - 1].id;
            })
            .catch(function() { /* silent */ });
        }, 3000);

        // Key handler to exit chat view
        T.onceKey('q', function(){
          T.stopChatPolling();
          T.exitProgramView();
        });
      })
      .catch(function() {
        T.clearOutput();
        T.addOutputLine('<span class="tp-err">' + T._('Ошибка загрузки чата.', 'Chat: could not load messages.') + '</span>');
        T.addOutputLine('');
        T.addOutputLine('<span class="tp-muted"># q — ' + T._('выйти', 'quit') + '</span>');
        T.onceKey('q', function(){T.exitProgramView()});
      });
  };

  // ── COMMAND: say ──
  T.cmdSay = function(text) {
    if (!T.isLoggedIn) {
      T.addOutputLine('<span class="tp-err">say: ' + T._('Требуется вход.', 'Login required.') + '</span>');
      T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
      return;
    }
    var chatMatch = T.cwd.match(/^chat\/(\d+)$/);
    if (!chatMatch) {
      T.addOutputLine('<span class="tp-err">say: not in a chat. Use <span class="tp-cmd">cd chat &lt;id&gt;</span> first</span>');
      return;
    }
    var chatId = parseInt(chatMatch[1], 10);
    if (!text) {
      T.addOutputLine('<span class="tp-err">say: message text required</span>');
      return;
    }
    var token = T.csrfToken();
    fetch('/chat/' + chatId + '/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': token ? token.content : '',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ text: text }),
      credentials: 'same-origin'
    })
    .then(function(r) { return r.json(); })
    .then(function() {
      T.addOutputLine(' <span class="tp-ok">' + T.escapeHtml(text) + '</span>  <span class="tp-muted">me now</span>');
    })
    .catch(function() {
      T.addOutputLine('<span class="tp-err">say: could not send message</span>');
    });
  };

  // ── Start chat with user ──
  T.startChatWithUser = function(username, shouldEnter) {
    if (!T.isLoggedIn) {
      T.addOutputLine('<span class="tp-err">start: ' + T._('Требуется вход.', 'Login required.') + '</span>');
      T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
      return;
    }
    if (!username) {
      T.addOutputLine('<span class="tp-err">start: username required. Use <span class="tp-cmd">start @user</span></span>');
      return;
    }
    T.addSysLine('Looking up @' + T.escapeHtml(username) + '...');
    var token = T.csrfToken();
    fetch('/chat/start/' + encodeURIComponent(username), {
      method: 'POST',
      headers: {
        'X-CSRFToken': token ? token.content : '',
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'same-origin'
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.chat_id) {
        if (shouldEnter) {
          T.cwd = 'chat/' + data.chat_id;
          T.updatePrompt();
          T.loadChatMessages(data.chat_id);
        } else {
          T.addOutputLine('<span class="tp-ok">Chat #' + data.chat_id + ' with @' + T.escapeHtml(username) + '</span>');
        }
      } else {
        T.addOutputLine('<span class="tp-err">start: could not create chat</span>');
      }
    })
    .catch(function() {
      T.addOutputLine('<span class="tp-err">start: user not found or request failed</span>');
    });
  };

  // ── COMMAND: write @user <message> ──
  T.cmdWrite = function(args) {
    if (!T.isLoggedIn) {
      T.addOutputLine('<span class="tp-err">write: ' + T._('Требуется вход.', 'Login required.') + '</span>');
      T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
      return;
    }
    var m = (args || '').trim().match(/^@?(\w+)\s+(.+)$/);
    if (!m) {
      T.addOutputLine('<span class="tp-err">write: usage: write @user &lt;message&gt;</span>');
      return;
    }
    var targetUser = m[1];
    var text = m[2];
    T.showLoading(T._('Отправка...', 'Sending...'));
    var token = T.csrfToken();
    fetch('/chat/start/' + encodeURIComponent(targetUser), {
      method: 'POST',
      headers: { 'X-CSRFToken': token ? token.content : '', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin'
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.chat_id) { T.hideLoading(); T.addOutputLine('<span class="tp-err">write: could not reach @' + T.escapeHtml(targetUser) + '</span>'); return; }
      fetch('/chat/' + data.chat_id + '/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': token ? token.content : '', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ text: text }),
        credentials: 'same-origin'
      })
      .then(function(r) { return r.json(); })
      .then(function() {
        T.hideLoading();
        T.addSysLine('<span class="tp-ok">' + T._('Сообщение отправлено @', 'Message sent to @') + T.escapeHtml(targetUser) + '</span>');
        T.toast(T._('Отправлено @', 'Sent to @') + targetUser, 'ok');
      })
      .catch(function() { T.hideLoading(); T.addOutputLine('<span class="tp-err">write: could not send message</span>'); });
    })
    .catch(function() { T.hideLoading(); T.addOutputLine('<span class="tp-err">write: could not reach @' + T.escapeHtml(targetUser) + '</span>'); });
  };

  // ── Registry ──
  // chat = list conversations, chat <id> = open conversation
  T.register('chat', { handler: function(args) {
    var m = (args || '').trim().match(/^(\d+)$/);
    if (m) { T.cwd = 'chat/' + m[1]; T.updatePrompt(); T.loadChatMessages(parseInt(m[1],10)); }
    else { T.renderChatList(); }
  }, auth: true, category: 'chat', match: 'prefix' });
  T.register('say',  { handler: T.cmdSay, auth: true, category: 'chat', match: 'prefix' });
  T.register('write',{ handler: T.cmdWrite, auth: true, category: 'chat', match: 'prefix' });
  T.register('start',{ handler: function(u){T.startChatWithUser(u||'',true)}, auth: true, category: 'chat',
    match: 'regex', regex: /^start\s+@?(\w+)$/i,
    parse: function(m){return[m[1]]} });

})(window.TERMINAL);
