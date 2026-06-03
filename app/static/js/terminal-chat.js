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

  // ── Render chat list ──
  T.renderChatList = function() {
    T.addSysLine('Fetching conversations...');
    fetch(window.API_CHAT_LIST_URL, { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        T.addOutputLine('<span class="tp-section">Conversations</span>');
        if (!data.chats || !data.chats.length) {
          T.addOutputLine('<span class="tp-muted">  no conversations</span>');
          T.addOutputLine('<span class="tp-desc">  # <span class="tp-cmd">start @user</span> to start a chat</span>');
          return;
        }
        data.chats.forEach(function(chat) {
          var last = chat.last_message || '';
          var preview = last.length > 50 ? T.escapeHtml(last.substring(0, 50)) + '…' : T.escapeHtml(last);
          var time = chat.last_message_time ? T.relTime(chat.last_message_time) : '';
          var unread = chat.unread_count > 0 ? ' <span class="tp-ok">[' + chat.unread_count + ']</span>' : '';
          var online = chat.other_user.is_online ? '<span class="tp-ok">●</span>' : '<span class="tp-muted">○</span>';
          T.addOutputLine('  <span class="tp-cmd">' + chat.id + '</span>  ' + online + ' @' + T.escapeHtml(chat.other_user.username) + unread);
          if (preview) T.addOutputLine('      <span class="tp-muted">' + preview + '</span>  <span class="tp-muted">' + time + '</span>');
        });
        T.addSysLine(data.chats.length + ' conversations');
      })
      .catch(function() {
        T.addOutputLine('<span class="tp-err">error: could not load conversations</span>');
        T.addOutputLine('<span class="tp-desc">  # try <span class="tp-cmd">cd feed</span> first to load data</span>');
      });
  };

  // ── Load chat messages ──
  T.loadChatMessages = function(chatId) {
    T.stopChatPolling();
    T.addSysLine('Loading chat...');
    fetch('/chat/' + chatId + '/messages?limit=50', { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        T.currentChatUser = data.other_user?.username || 'unknown';
        T.addOutputLine('<span class="tp-section">Chat with @' + T.escapeHtml(T.currentChatUser) + '</span>');
        T.addOutputLine('<span class="tp-desc">  # <span class="tp-cmd">say &lt;text&gt;</span> to send  ·  <span class="tp-cmd">cd ..</span> to go back</span>');

        var msgs = data.messages || [];
        if (!msgs.length) {
          T.addOutputLine('<span class="tp-muted">  no messages yet</span>');
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
      })
      .catch(function() {
        T.addOutputLine('<span class="tp-err">chat: could not load messages</span>');
      });
  };

  // ── COMMAND: say ──
  T.cmdSay = function(text) {
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

})(window.TERMINAL);
