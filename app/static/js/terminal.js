// ── Rugram Terminal Mode ──
// Dual-mode: GUI (обычный) + TTY (терминальный)
// Переключение: кнопка в навбаре или команда `gui`/`exit`
// CORE module — defines window.TERMINAL with all shared state and utilities

(function() {
  'use strict';

  var T = window.TERMINAL = {};

  T.APP_VERSION = '0.3.0';

  // ── State ──
  T.mode = 'gui';
  T.lastCmd = '';
  T.commandHistory = [];
  T.historyIdx = -1;
  T.username = 'guest';
  T.isLoggedIn = false;
  T.feedData = [];
  T._fetchingFeed = false;
  T.bootShown = false;
  T.loadingEl = null;
  T.cwd = '';
  T.prevCmd = '';

  // ── Command Registry (system metadata) ──
  T.registry = {};
  T._regOrder = 0;

  T.register = function(name, meta) {
    meta._order = T._regOrder++;
    // Default: exact match with no args (must be set BEFORE regex auto-generation)
    if (!meta.match) meta.match = 'exact';
    if (!meta.auth) meta.auth = false;
    // Auto-generate match regex
    if (meta.match === 'exact' && !meta.regex) {
      meta.regex = new RegExp('^' + name + '$', 'i');
    } else if (meta.match === 'prefix' && !meta.regex) {
      meta.regex = new RegExp('^' + name + '\\b', 'i');
    } else if (meta.match === 'regex' && !meta.regex) {
      meta.regex = new RegExp(name, 'i');
    }
    T.registry[name] = meta;
  };

  T.unauthError = function(cmdName) {
    T.addOutputLine('<span class="tp-err">' + cmdName + ': ' + T._('Требуется вход.', 'Login required.') + '</span>');
    T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
  };

  T.onceKey = function(key, callback) {
    var handler = function(e) {
      if (e.key === key || (key === 'q' && (e.key === 'Q' || e.key === 'Escape'))) {
        document.removeEventListener('keydown', handler);
        e.preventDefault();
        callback();
      }
    };
    setTimeout(function() { document.addEventListener('keydown', handler); }, 100);
  };
  // ── DOM refs (set on init) ──
  T.el = {};

  // ── Enhanced state ──
  T.savedLang = localStorage.getItem('rugram_lang');
  T.env = { LANG: T.savedLang || 'ru_RU', EDITOR: 'vim', THEME: 'dark', MATRIX: '0' };
  T.startTime = Date.now();

  // ── Bilingual helper ──
  T._ = function(ru, en) {
    return (T.env.LANG || '').toLowerCase().startsWith('ru') ? ru : en;
  };

  T.unreadNotifs = 0;
  T.watchInterval = null;

  T.fortuneQuotes = [];
  T.manPages = {};

  // ── ASCII art from image (Canvas) ──
  T.asciiCache = {};
  T.asciiSymbols = '@%#*+=-:. ';
  T.DEFAULT_AVATAR_URL = '/static/default-profile.png';

  // ── Matrix rain ──
  T.matrixEnabled = T.env.MATRIX === '1' || Math.random() < 0.3;

  // ── Section route map for cd command ──
  T.sectionUrls = {
    'settings': window.SETTINGS_URL,
    'edit_profile': window.EDIT_PROFILE_URL,
  };

  // ── Chat state ──
  T.chatPollInterval = null;
  T.lastMessageId = 0;
  T.currentChatUser = '';
  T.currentUserId = window.CURRENT_USER_ID || 0;
  T.isLoggedIn = window.isAuthenticated === true && T.currentUserId > 0;

  // ── Nano overlay state ──
  T.nanoOverlay = null;

  // ── Reverse-i-search state ──
  T._reverseSearchActive = false;
  T._reverseSearchQuery = '';

  // ── Pre-cache default avatar in advance ──
  (function preloadDefaultAvatar() {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var maxWidth = 22;
      var ratio = Math.min(maxWidth / img.width, 1);
      canvas.width = Math.floor(img.width * ratio);
      canvas.height = Math.floor(img.height * ratio * 0.45);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var data = imgData.data;
      var result = '<pre class="tp-ascii-img">';
      for (var y = 0; y < canvas.height; y++) {
        for (var x = 0; x < canvas.width; x++) {
          var i = (y * canvas.width + x) * 4;
          var ri = data[i], gi = data[i+1], bi = data[i+2];
          var gray = (ri + gi + bi) / 3;
          var symIdx = Math.floor(gray / 255 * (T.asciiSymbols.length - 1));
          var ch = T.asciiSymbols[symIdx];
          if (ch === ' ') ch = '&nbsp;';
          result += '<span style="color:rgb(' + ri + ',' + gi + ',' + bi + ')">' + ch + '</span>';
        }
        result += '\n';
      }
      result += '</pre>';
      T.asciiCache[T.DEFAULT_AVATAR_URL] = result;
    };
    img.src = T.DEFAULT_AVATAR_URL;
  })();

  // ── Update prompt ──
  T.updatePrompt = function() {
    if (!T.el.prompt) return;
    var user = T.escapeHtml(T.username || 'guest');
    var dir = T.cwd ? '~/' + T.escapeHtml(T.cwd) : '~';
    var badge = T.unreadNotifs > 0 ? ' <span class="tp-notif-badge">' + T.unreadNotifs + '</span>' : '';
    T.el.prompt.innerHTML = user + '@tty:' + dir + badge + '$';
  };

  // ── Mode switching (fullscreen overlay, body scroll locked) ──
  T.setMode = function(newMode) {
    T.mode = newMode;
    if (T.mode === 'tty') {
      document.body.style.overflow = 'hidden';
      T.el.terminal.style.display = 'flex';
      T.el.bar.style.display = 'block';
      if (T.el.toggleIcon) T.el.toggleIcon.innerHTML = '[>_ TTY]';
      if (T.el.toggleBtn) { T.el.toggleBtn.classList.add('active'); T.el.toggleBtn.title = 'Switch to GUI'; }
      localStorage.setItem('rugram_mode', 'tty');
      sessionStorage.setItem('tty_session', '1');
      // Refresh feed from API on re-entry
      T.fetchFeedFromAPI();
      if (!T.el.output.querySelector('.term-post') && !T.el.output.querySelector('.term-boot')) {
        if (!T.bootShown) {
          T.showBootScreen();
        } else {
          T.clearOutput();
          T.addSysLine('<span class="tp-muted">session restored — use <span class="tp-cmd">feed</span> to view feed</span>');
          T.updatePrompt();
        }
      }
      setTimeout(function() { if (T.el.input) T.el.input.focus(); }, 100);
    } else {
      document.body.style.overflow = '';
      T.el.terminal.style.display = 'none';
      T.el.bar.style.display = 'none';
      setTimeout(function() { T.cacheFeedFromDOM(); }, 200);
      if (T.el.toggleIcon) T.el.toggleIcon.innerHTML = '[>_ TTY]';
      if (T.el.toggleBtn) { T.el.toggleBtn.classList.remove('active'); T.el.toggleBtn.title = 'Terminal mode'; }
      localStorage.setItem('rugram_mode', 'gui');
      sessionStorage.removeItem('tty_session');
    }
  };

  T.toggleMode = function() {
    T.setMode(T.mode === 'gui' ? 'tty' : 'gui');
  };

  // ── Fetch feed posts from API (terminal-independent) ──
  T.fetchFeedFromAPI = function(callback) {
    fetch(window.API_FEED_URL + '?per_page=50', { credentials: 'same-origin' })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        T.feedData = (data.posts || []).map(function(p) {
          return {
            id: p.id,
            author: p.author,
            time: p.time,
            text: p.text,
            liked: p.is_liked,
            likes: p.likes,
            comments: p.comments,
            image: p.image
          };
        });
        if (callback) callback();
      })
      .catch(function() {
        if (callback) callback();
      });
  };

  // ── Cache feed posts from DOM (GUI fallback — only when switching to GUI) ──
  T.cacheFeedFromDOM = function() {
    var cards = document.querySelectorAll('.post-card');
    if (!cards.length) return;
    T.feedData = [];
    cards.forEach(function(card) {
      var id = card.dataset.postUrl ? card.dataset.postUrl.split('/').pop() : (card.dataset.postId || '');
      var authorEl = card.querySelector('.post-author');
      var timeEl = card.querySelector('.post-time');
      var textEl = card.querySelector('.post-body');
      var likeBtn = card.querySelector('.like-btn');
      var imgEl = card.querySelector('.post-img-clickable');

      var likeCount = 0;
      if (likeBtn) {
        var lm = likeBtn.textContent.match(/♥\s*(\d+)/);
        if (lm) likeCount = parseInt(lm[1], 10);
      }

      var commentCount = 0;
      var commentEl = card.querySelector('a[href*="#comments"]');
      if (!commentEl) commentEl = card.querySelector('.post-action');
      if (commentEl) {
        var cm = commentEl.textContent.match(/💬\s*(\d+)/);
        if (cm) commentCount = parseInt(cm[1], 10);
      }

      T.feedData.push({
        id: parseInt(id, 10) || 0,
        author: authorEl ? authorEl.textContent.trim().replace(/^@/, '') : 'unknown',
        time: timeEl ? (timeEl.title || timeEl.textContent.trim()) : '',
        text: textEl ? textEl.textContent.trim() : '',
        liked: likeBtn ? likeBtn.dataset.liked === 'true' : false,
        likes: likeCount,
        comments: commentCount,
        image: imgEl ? (imgEl.dataset.fullImg || imgEl.src || null) : null
      });
    });
  };

  // ── Alias system ──
  T._loadAliases = function() {
    try { return JSON.parse(localStorage.getItem('rugram_aliases')) || {}; }
    catch(e) { return {}; }
  };

  T._saveAliases = function(aliases) {
    localStorage.setItem('rugram_aliases', JSON.stringify(aliases));
  };

  T._expandAliases = function(cmd) {
    var aliases = T._loadAliases();
    var firstWord = cmd.split(/\s+/)[0];
    if (aliases[firstWord] !== undefined) {
      return aliases[firstWord] + cmd.substring(firstWord.length);
    }
    return cmd;
  };

  // ── Check if command should be stored in history (filter passwords) ──
  T._shouldAddToHistory = function(cmd) {
    var lower = cmd.toLowerCase().trim();
    // Never store login/register commands — they contain passwords
    if (/^(login|register)\s/i.test(lower)) return false;
    return true;
  };

  // ── Command Processing ──
  T.processCommand = function(cmd) {
    cmd = cmd.trim();
    if (!cmd) return;

    // Expand aliases before any processing
    cmd = T._expandAliases(cmd);

    var addToHistory = T._shouldAddToHistory(cmd);

    if (cmd.includes('&&')) {
      var parts = cmd.split('&&');
      // Limit && chaining depth
      if (parts.length > 5) {
        T.addOutputLine('<span class="tp-err">bash: too many chained commands (max 5)</span>');
        return;
      }
      if (addToHistory) {
        T.commandHistory.push(cmd);
        if (T.commandHistory.length > 50) T.commandHistory.shift();
      }
      T.historyIdx = T.commandHistory.length;
      T.prevCmd = T.lastCmd;
      T.lastCmd = cmd;
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i].trim();
        if (part) T._dispatchCommand(part);
      }
      return;
    }

    if (addToHistory) {
      T.commandHistory.push(cmd);
      if (T.commandHistory.length > 50) T.commandHistory.shift();
    }
    T.historyIdx = T.commandHistory.length;
    T.prevCmd = T.lastCmd;
    T.lastCmd = cmd;

    T._dispatchCommand(cmd);
  };

  T._dispatchCommand = function(cmd) {
    // --help flag (generic — works for any command)
    if (/\s--help$|^--help$/.test(cmd)) {
      var hlpName = cmd.replace(/\s*--help$/, '').trim().split(' ')[0];
      T.showCmdHelp(hlpName || 'help');
      return;
    }

    // Special commands that DON'T use the registry
    // (non-standard dispatch, command history, mode switch, cd)

    // cd <section>
    if (cmd.toLowerCase().startsWith('cd ') || cmd.toLowerCase() === 'cd') {
      var cdTarget = cmd.trim().length > 2 ? cmd.slice(cmd.indexOf(' ') + 1).trim() : '';
      T.processCd(cdTarget);
      return;
    }

    // gui / exit
    if (cmd.toLowerCase() === 'gui' || cmd.toLowerCase() === 'exit') {
      T.setMode('gui');
      return;
    }

    // sudo !! — repeat previous command
    if (cmd.toLowerCase() === 'sudo !!') {
      if (T.prevCmd) { T._dispatchCommand(T.prevCmd); return; }
      T.addOutputLine('<span class="tp-err">sudo: no previous command</span>');
      return;
    }

    // ── Registry dispatch ──
    // Iterate in registration order (entries registered first = matched first)
    var names = Object.keys(T.registry);
    for (var i = 0; i < names.length; i++) {
      var entry = T.registry[names[i]];
      var m = cmd.match(entry.regex);
      if (!m) continue;

      // Auth middleware
      if (entry.auth && !T.isLoggedIn) {
        T.unauthError(names[i]);
        return;
      }

      if (entry.match === 'regex' && entry.parse) {
        // Regex with captured args + parser
        entry.handler.apply(null, entry.parse(m));
      } else if (entry.match === 'prefix') {
        // Prefix match — pass rest of string after command name
        entry.handler(cmd.substring(names[i].length).trim());
      } else {
        // Exact match — no args or simple args
        if (m[1] !== undefined && entry.parse) {
          entry.handler.apply(null, entry.parse(m));
        } else {
          entry.handler();
        }
      }
      return;
    }

    // Unknown command
    T.cmdUnknown(cmd);
  };

  // ── Input handler ──
  T.onInputKey = function(e) {
    // Ctrl+R — reverse-i-search
    if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      if (T._reverseSearchActive) {
        // Cycle to previous (older) match
        var q = T._reverseSearchQuery.toLowerCase();
        var found = false;
        for (var i = T._reverseSearchMatchIdx - 1; i >= 0; i--) {
          if (T.commandHistory[i].toLowerCase().indexOf(q) >= 0) {
            T.el.input.value = T.commandHistory[i];
            T._reverseSearchMatchIdx = i;
            found = true;
            break;
          }
        }
        if (!found) { /* beep silently */ }
      } else {
        T._reverseSearchActive = true;
        T._reverseSearchQuery = '';
        T._reverseSearchMatchIdx = -1;
        T.el.input.value = '';
        T.el.input.placeholder = '(reverse-i-search) ``\'';
      }
      return;
    }

    // If reverse search is active, intercept keys
    if (T._reverseSearchActive) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var matchedCmd = T.el.input.value;
        T._reverseSearchActive = false;
        T.el.input.placeholder = '';
        T._reverseSearchQuery = '';
        T.el.input.value = '';
        if (matchedCmd.trim()) {
          var fullPrompt = T.escapeHtml(T.username) + '@tty:' + (T.cwd ? '~/' + T.escapeHtml(T.cwd) : '~');
          T.addOutputLine('<span class="tp-prompt">' + fullPrompt + '$</span><span class="tp-cmd">' + T.escapeHtml(matchedCmd.trim()) + '</span>');
          T.processCommand(matchedCmd.trim());
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        T._reverseSearchActive = false;
        T.el.input.placeholder = '';
        T.el.input.value = '';
        T._reverseSearchQuery = '';
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        T._reverseSearchQuery = T._reverseSearchQuery.slice(0, -1);
        if (T._reverseSearchQuery) {
          var lower = T._reverseSearchQuery.toLowerCase();
          var found = false;
          for (var i = T.commandHistory.length - 1; i >= 0; i--) {
            if (T.commandHistory[i].toLowerCase().indexOf(lower) >= 0) {
              T.el.input.value = T.commandHistory[i];
              T._reverseSearchMatchIdx = i;
              found = true;
              break;
            }
          }
          if (!found) T.el.input.value = '';
        } else {
          T.el.input.value = '';
          T._reverseSearchMatchIdx = -1;
        }
        T.el.input.placeholder = '(reverse-i-search) `' + T._reverseSearchQuery + '\'';
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        T._reverseSearchQuery += e.key;
        var lower = T._reverseSearchQuery.toLowerCase();
        var found = false;
        for (var i = T.commandHistory.length - 1; i >= 0; i--) {
          if (T.commandHistory[i].toLowerCase().indexOf(lower) >= 0) {
            T.el.input.value = T.commandHistory[i];
            T._reverseSearchMatchIdx = i;
            found = true;
            break;
          }
        }
        if (!found) T.el.input.value = '';
        T.el.input.placeholder = '(reverse-i-search) `' + T._reverseSearchQuery + '\'';
        return;
      }
      // Block other keys during search
      e.preventDefault();
      return;
    }

    // Tab — autocomplete
    if (e.key === 'Tab') {
      e.preventDefault();
      var input = T.el.input.value.trim();
      if (!input) return;
      var words = input.split(/\s+/);
      var partial = words[0].toLowerCase();
      var candidates = [];

      // Match against registry keys
      var names = Object.keys(T.registry);
      for (var i = 0; i < names.length; i++) {
        if (names[i].toLowerCase().startsWith(partial)) {
          candidates.push(names[i]);
        }
      }

      // If second word starts with @, match usernames from feedData
      if (words.length > 1 && words[1].startsWith('@')) {
        var userPartial = words[1].toLowerCase().replace('@', '');
        T.feedData.forEach(function(p) {
          if (p.author.toLowerCase().startsWith(userPartial)) {
            var at = '@' + p.author;
            if (candidates.indexOf(at) < 0) candidates.push(at);
          }
        });
      }

      if (candidates.length === 0) return;
      if (candidates.length === 1) {
        words[0] = candidates[0];
        T.el.input.value = words.join(' ') + ' ';
      } else {
        T.addOutputLine('<span class="tp-desc">' + candidates.join('  ') + '</span>');
      }
      return;
    }

    if (e.key === 'Enter') {
      var cmd = T.el.input.value.trim();
      if (cmd) {
        var fullPrompt = T.escapeHtml(T.username) + '@tty:' + (T.cwd ? '~/' + T.escapeHtml(T.cwd) : '~');
        T.addOutputLine('<span class="tp-prompt">' + fullPrompt + '$</span><span class="tp-cmd">' + T.escapeHtml(cmd) + '</span>');
        T.processCommand(cmd);
      }
      T.el.input.value = '';
      e.preventDefault();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (T.historyIdx > 0) {
        T.historyIdx--;
        T.el.input.value = T.commandHistory[T.historyIdx];
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (T.historyIdx < T.commandHistory.length - 1) {
        T.historyIdx++;
        T.el.input.value = T.commandHistory[T.historyIdx];
      } else {
        T.historyIdx = T.commandHistory.length;
        T.el.input.value = '';
      }
    }
  };

  // ── Output helpers ──
  T.addOutput = function(html) {
    var div = document.createElement('div');
    div.innerHTML = html;
    T.el.output.appendChild(div);
    T.el.output.scrollTop = T.el.output.scrollHeight;
  };

  T.addOutputLine = function(html) {
    T.addOutput('<div class="tp-line">' + html + '</div>');
  };

  T.clearOutput = function() {
    T.el.output.innerHTML = '';
  };

  T.escapeHtml = function(text) {
    var d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  };

  T.sysTime = function() {
    var d = new Date();
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  T.addSysLine = function(text) {
    T.addOutputLine('<span class="tp-sys"><span class="tp-time">[' + T.sysTime() + ']</span>' + text + '</span>');
  };

  T.showLoading = function(text) {
    T.hideLoading();
    var line = document.createElement('div');
    line.className = 'tp-line';
    line.id = 'tp-loading-line';
    line.innerHTML = '<span class="tp-spinner"></span><span class="tp-desc">' + T.escapeHtml(text || 'Processing') + '<span class="tp-loading"></span></span>';
    T.el.output.appendChild(line);
    T.el.output.scrollTop = T.el.output.scrollHeight;
    T.loadingEl = line;
  };

  T.hideLoading = function() {
    if (T.loadingEl) {
      T.loadingEl.remove();
      T.loadingEl = null;
    }
  };

  T.toast = function(msg, type) {
    if (window.showToast) {
      window.showToast(type === 'ok' ? '✓' : type === 'err' ? '✗' : 'TTY', msg, type || 'info');
    }
  };

  // ── Boot screen ──
  T.showBootScreen = function() {
    T.bootShown = true;
    if (T.matrixEnabled) {
      T.showMatrixRain(function() { T._bootContent(); });
    } else {
      T._bootContent();
    }
  };

  T._welcomeMessage = function() {
    var now = new Date();
    var dateStr = now.toDateString() + ' ' + now.toLocaleTimeString();

    var logo = '<div class="term-boot">';
    logo += '  <pre>';
    logo += '  █████     █    █     █████    █████      █████    █     ██  \n';
    logo += '  █    █    █    █    █         █    █    █    █    ██   ██   \n';
    logo += '  █████     █    █    █  ████   █████     ██████    █ █ █ █   \n';
    logo += '  █   █     █    █    █    █    █   █     █    █    █  █  █   \n';
    logo += '  █    █     ██████    █████    █    █    █    █    █     █   \n';
    logo += '  </pre>';
    logo += '</div>';
    T.addOutput(logo);

    var lastLogin = localStorage.getItem('rugram_last_login');
    if (lastLogin) {
      T.addOutputLine('<span class="tp-desc">Last login: ' + lastLogin + '</span>');
    }
    T.addOutputLine('');

    T.addOutputLine('Welcome to <span class="tp-section">Rugram Terminal v' + T.APP_VERSION + '</span>');
    T.addOutputLine('<span class="tp-muted">Server: ' + T.escapeHtml(window.location.host) + '  |  User: @' + T.escapeHtml(T.username) + '</span>');
    T.addOutputLine('');

    var unread = typeof T.unreadNotifs !== 'undefined' ? T.unreadNotifs : 0;
    if (unread > 0) {
      T.addOutputLine('You have <span class="tp-ok">' + unread + ' unread notification' + (unread > 1 ? 's' : '') + '</span>');
    }
    T.addOutputLine('<span class="tp-desc">' + (T.feedData.length || '0') + T._(' постов в ленте', ' posts in feed') + '</span>');
    T.addOutputLine('');

    T.addOutputLine('<span class="tp-muted"># <span class="tp-cmd">help</span> — all commands  |  <span class="tp-cmd">feed</span> — browse feed  |  <span class="tp-cmd">saved</span> — saved posts  |  <span class="tp-cmd">chat</span> — messages</span>');
    T.addOutputLine('');

    localStorage.setItem('rugram_last_login', dateStr);
  };

  T._bootContent = function() {
    T.clearOutput();
    T._welcomeMessage();
  };

  // ── Cat /feed ──
  T.renderFeed = function(posts) {
    var list = posts || T.feedData;
    T.addOutputLine('<span class="tp-section">-- /feed -- (' + list.length + ' posts)</span>');

    if (!list.length) {
      T.addOutputLine('<span class="tp-muted">  feed: empty</span>');
      T.addOutputLine('<span class="tp-desc">  # <span class="tp-cmd">create</span> to write a new post</span>');
      return;
    }

    list.forEach(function(p) {
      var timeDisplay = p.time.indexOf('T') > 0 ? T.relTime(p.time) : p.time;
      T.addOutputLine('  #' + p.id + '  <span class="tp-post-author">@' + T.escapeHtml(p.author) + '</span>  <span class="tp-post-time">' + T.escapeHtml(timeDisplay) + '</span>');
      T.addOutputLine('  ' + T.escapeHtml(p.text.substring(0, 200)));
      if (p.image) {
        T.addOutputLine('  <span class="tp-muted">[img]</span>');
      }
      var liked = p.liked ? '<span class="tp-ok">+</span>' : '-';
      T.addOutputLine('  ' + liked + ' ' + p.likes + '  c:' + p.comments + '  #' + p.id);
    });

    T.addSysLine('<span class="tp-muted">' + list.length + ' post(s) · page 1</span>');
  };

  // ── HOME screen ──
  T.renderHome = function() {
    T.clearOutput();
    T._welcomeMessage();
  };

  // ── Program view stack (save/restore terminal output) ──
  T._programStack = [];
  T._programDepth = 0;

  T.enterProgramView = function() {
    if (T._programDepth === 0) {
      T._programStack.push({
        output: T.el.output.innerHTML,
        scrollTop: T.el.output.scrollTop
      });
      if (T.el.bar) T.el.bar.style.display = 'none';
    }
    T._programDepth++;
    T.clearOutput();
  };

  T.exitProgramView = function() {
    if (T._programDepth <= 0) return;
    T._programDepth--;
    if (T._programDepth === 0) {
      var saved = T._programStack.pop();
      if (saved) {
        T.el.output.innerHTML = saved.output;
        T.el.output.scrollTop = saved.scrollTop;
      }
      if (T.el.bar) T.el.bar.style.display = 'block';
    }
    T.updatePrompt();
    if (T.el.input) setTimeout(function() { T.el.input.focus(); }, 50);
  };

  // ── Less mode state ──
  T._lessActive = false;
  T._lessItems = [];
  T._lessTitle = '';
  T._lessPos = 0;
  T._lessPerPage = 15;
  T._lessSearchQuery = '';
  T._lessSearchResults = [];
  T._lessFilteredItems = [];
  T._lessOnEnter = null; // callback for Enter key
  T._lessGPress = false;
  T._lessAwaitingSearch = false;
  T._lessSearchHandler = null;

  // ── INTERACTIVE PAGER (less) ──
  T.enterLessMode = function(items, title, onEnter) {
    T._lessActive = true;
    T._lessItems = items;
    T._lessTitle = title || 'feed';
    T._lessPos = 0;
    T._lessSearchQuery = '';
    T._lessSearchResults = [];
    T._lessFilteredItems = items;
    T._lessOnEnter = onEnter || null;

    // Calculate items per page
    T._lessPerPage = Math.max(10, Math.floor((T.el.output.clientHeight || 400) / 20));

    T.enterProgramView();
    T._renderLess();

    if (T.el.input) T.el.input.blur();

    T._lessKeyHandler = function(e) {
      if (!T._lessActive) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // q / Q — quit
      if (e.key === 'q' || e.key === 'Q') {
        T._exitLessMode();
        e.preventDefault();
        return;
      }

      // j / Down — next line
      if (e.key === 'j' || e.key === 'ArrowDown') {
        T._lessPos = Math.min(T._lessPos + 1, T._lessFilteredItems.length - 1);
        T._renderLess();
        e.preventDefault();
        return;
      }

      // k / Up — prev line
      if (e.key === 'k' || e.key === 'ArrowUp') {
        T._lessPos = Math.max(T._lessPos - 1, 0);
        T._renderLess();
        e.preventDefault();
        return;
      }

      // Space / PageDown — next page
      if (e.key === ' ' || e.key === 'PageDown') {
        T._lessPos = Math.min(T._lessPos + T._lessPerPage, T._lessFilteredItems.length - 1);
        T._renderLess();
        e.preventDefault();
        return;
      }

      // PageUp — prev page
      if (e.key === 'PageUp') {
        T._lessPos = Math.max(T._lessPos - T._lessPerPage, 0);
        T._renderLess();
        e.preventDefault();
        return;
      }

      // g (and then g) — go to top
      if (e.key === 'g' && !e.shiftKey && !e.ctrlKey) {
        if (T._lessGPress) {
          T._lessPos = 0;
          T._renderLess();
          T._lessGPress = false;
          e.preventDefault();
          return;
        }
        T._lessGPress = true;
        setTimeout(function() { T._lessGPress = false; }, 500);
        e.preventDefault();
        return;
      }

      // G / Shift+g — go to bottom
      if (e.key === 'G' || (e.key === 'g' && e.shiftKey)) {
        T._lessPos = Math.max(0, T._lessFilteredItems.length - 1);
        T._renderLess();
        e.preventDefault();
        return;
      }

      // / — search mode
      if (e.key === '/') {
        T._lessSearchQuery = '';
        T._renderLessSearchPrompt();
        e.preventDefault();
        return;
      }

      // n — next search result
      if (e.key === 'n' && T._lessSearchQuery) {
        var found = -1;
        for (var i = T._lessPos + 1; i < T._lessFilteredItems.length; i++) {
          if (T._lessItemMatches(T._lessFilteredItems[i], T._lessSearchQuery)) {
            found = i;
            break;
          }
        }
        if (found >= 0) {
          T._lessPos = found;
          T._renderLess();
        }
        e.preventDefault();
        return;
      }

      // N — prev search result
      if (e.key === 'N' && T._lessSearchQuery) {
        var found = -1;
        for (var i = T._lessPos - 1; i >= 0; i--) {
          if (T._lessItemMatches(T._lessFilteredItems[i], T._lessSearchQuery)) {
            found = i;
            break;
          }
        }
        if (found >= 0) {
          T._lessPos = found;
          T._renderLess();
        }
        e.preventDefault();
        return;
      }

      // Enter — open item detail
      if (e.key === 'Enter') {
        var item = T._lessFilteredItems[T._lessPos];
        if (item && T._lessOnEnter) {
          T._lessOnEnter(item);
        } else if (item && item.id) {
          T._exitLessMode();
          T.cmdPostView(item.id);
        }
        e.preventDefault();
        return;
      }

      // r — refresh current view
      if (e.key === 'r') {
        T._renderLess();
        e.preventDefault();
        return;
      }
    };

    document.addEventListener('keydown', T._lessKeyHandler);

    // ── Touch scroll support ──
    T._lessTouchStartY = 0;
    T._lessTouchStartPos = 0;

    T._lessTouchHandler = function(e) {
      if (!T._lessActive) return;
      if (e.type === 'touchstart') {
        T._lessTouchStartY = e.touches[0].clientY;
        T._lessTouchStartPos = T._lessPos;
      } else if (e.type === 'touchmove') {
        e.preventDefault();
        var deltaY = T._lessTouchStartY - e.touches[0].clientY;
        var lineDelta = Math.round(deltaY / 20);
        if (lineDelta !== 0) {
          T._lessPos = Math.max(0, Math.min(T._lessTouchStartPos + lineDelta, T._lessFilteredItems.length - 1));
          T._renderLess();
        }
      }
    };
    document.addEventListener('touchstart', T._lessTouchHandler, { passive: true });
    document.addEventListener('touchmove', T._lessTouchHandler, { passive: false });
  };

  T._exitLessMode = function() {
    if (!T._lessActive) return;
    T._lessActive = false;
    T._lessGPress = false;
    T._lessSearchQuery = '';
    T._lessSearchResults = [];
    T._lessAwaitingSearch = false;
    document.removeEventListener('keydown', T._lessKeyHandler);
    T._lessKeyHandler = null;
    if (T._lessTouchHandler) {
      document.removeEventListener('touchstart', T._lessTouchHandler);
      document.removeEventListener('touchmove', T._lessTouchHandler);
      T._lessTouchHandler = null;
    }
    if (T._lessSearchHandler) {
      document.removeEventListener('keydown', T._lessSearchHandler);
      T._lessSearchHandler = null;
    }
    T.exitProgramView();
  };

  T._renderLess = function() {
    if (!T._lessActive) return;

    var items = T._lessFilteredItems;
    if (!items.length) {
      T.clearOutput();
      T.addOutputLine('<span class="tp-muted">less: empty</span>');
      T.addOutputLine('');
      T.addOutputLine('<span class="tp-desc"># press <span class="tp-cmd">q</span> to quit</span>');
      return;
    }

    // Calculate visible range
    var total = items.length;
    var pageStart = Math.max(0, Math.min(T._lessPos, total - 1));
    var visibleStart = Math.max(0, pageStart - Math.floor(T._lessPerPage / 3));
    var visibleEnd = Math.min(total, visibleStart + T._lessPerPage);
    if (visibleEnd - visibleStart < T._lessPerPage) {
      visibleStart = Math.max(0, visibleEnd - T._lessPerPage);
    }
    T._lessPos = Math.min(pageStart, total - 1);

    T.clearOutput();

    // Header
    var pct = total > 0 ? Math.round((pageStart + 1) / total * 100) : 0;
    var searchInfo = T._lessSearchQuery ? '  /' + T._lessSearchQuery : '';
    T.addOutput('<div class="tp-less-header"><span class="tp-section">-- ' + T.escapeHtml(T._lessTitle) + ' (' + total + ' items) ' + searchInfo + ' --</span><span class="tp-muted" style="float:right">' + (pageStart + 1) + '-' + visibleEnd + '  ' + pct + '%</span></div>');

    // Items
    for (var i = visibleStart; i < visibleEnd; i++) {
      var item = items[i];
      var isCurrent = (i === pageStart);
      var prefix = isCurrent ? '<span class="tp-less-cursor">></span> ' : '  ';
      var line = T._lessRenderItem(item, i);
      T.addOutput('<div class="tp-line' + (isCurrent ? ' tp-less-current' : '') + '">' + prefix + line + '</div>');
    }

    // Footer
    var footer = '# less  —  j/k/⇅ scroll  Enter view  /search  n/N next  gg/G top/bottom  q quit';
    if (T._lessSearchQuery) {
      footer = '/ ' + T._lessSearchQuery + '  —  n next  N prev  Enter open  q quit';
    }
    T.addOutput('<div class="tp-less-footer"><span class="tp-muted">' + footer + '</span></div>');
  };

  T._renderLessSearchPrompt = function() {
    if (!T._lessActive) return;
    T._lessAwaitingSearch = true;

    // Show a search bar at the bottom
    T._renderLess();
    T.addOutput('<div class="tp-less-search"><span class="tp-ok">/</span><span class="tp-cmd" id="lessSearchInput"></span><span class="tp-less-cursor">█</span></div>');

    // Install search input handler
    T._lessSearchHandler = function(e) {
      if (!T._lessActive) return;

      if (e.key === 'Escape' || e.key === 'q') {
        T._lessAwaitingSearch = false;
        document.removeEventListener('keydown', T._lessSearchHandler);
        T._renderLess();
        e.preventDefault();
        return;
      }

      if (e.key === 'Enter') {
        T._lessAwaitingSearch = false;
        document.removeEventListener('keydown', T._lessSearchHandler);

        // Search through items
        T._lessSearchResults = [];
        for (var i = 0; i < T._lessFilteredItems.length; i++) {
          if (T._lessItemMatches(T._lessFilteredItems[i], T._lessSearchQuery)) {
            T._lessSearchResults.push(i);
          }
        }
        if (T._lessSearchResults.length) {
          T._lessPos = T._lessSearchResults[0];
        }
        T._renderLess();
        e.preventDefault();
        return;
      }

      if (e.key === 'Backspace') {
        T._lessSearchQuery = T._lessSearchQuery.slice(0, -1);
        var promptEl = document.getElementById('lessSearchInput');
        if (promptEl) promptEl.textContent = T._lessSearchQuery;
        e.preventDefault();
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        // Only printable characters
        if (e.key.match(/[\x20-\x7E]/)) {
          T._lessSearchQuery += e.key;
          var promptEl = document.getElementById('lessSearchInput');
          if (promptEl) promptEl.textContent = T._lessSearchQuery;
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', T._lessSearchHandler);
  };

  T._lessItemMatches = function(item, query) {
    if (!query) return true;
    var q = query.toLowerCase();
    var text = '';
    // Try common fields
    if (item.text) text += item.text;
    if (item.author) text += ' ' + item.author;
    if (item.username) text += ' ' + item.username;
    if (item.description) text += ' ' + item.description;
    return text.toLowerCase().indexOf(q) >= 0;
  };

  T._lessRenderItem = function(item, idx) {
    // Default: show brief info
    var buf = '';
    // Unread/read indicator (for notifications)
    if (item.is_read !== undefined) {
      buf += item.is_read ? '<span class="tp-muted">·</span> ' : '<span class="tp-ok">◆</span> ';
    }
    // Online indicator (for chat list)
    if (item.is_online !== undefined) {
      buf += item.is_online ? '<span class="tp-ok">●</span> ' : '<span class="tp-muted">○</span> ';
    }
    // Unread count (for chat list)
    if (item.unread && item.unread > 0) {
      buf += '<span class="tp-ok">[' + item.unread + ']</span> ';
    }
    if (item.id) buf += '<span class="tp-post-id">#' + item.id + '</span> ';
    if (item.author) buf += '<span class="tp-post-author">@' + T.escapeHtml(item.author) + '</span> ';
    if (item.username) buf += '<span class="tp-post-author">@' + T.escapeHtml(item.username) + '</span> ';
    if (item.time) {
      var td = item.time.indexOf('T') > 0 ? T.relTime(item.time) : item.time;
      buf += '<span class="tp-post-time">' + T.escapeHtml(td) + '</span> ';
    }
    if (item.text) buf += T.escapeHtml(item.text.substring(0, 120));
    if (item.description) buf += '<span class="tp-muted">' + T.escapeHtml(item.description.substring(0, 80)) + '</span>';
    if (!item.text && !item.description) {
      buf += '<span class="tp-muted">(no content)</span>';
    }
    return buf;
  };

  // ── Image to ASCII ──
  T.imageToAscii = function(imgSrc, maxWidth, callback) {
    if (T.asciiCache[imgSrc]) {
      callback(T.asciiCache[imgSrc]);
      return;
    }

    var img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = function() {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');

      var w = img.width;
      var h = img.height;
      var ratio = Math.min(maxWidth / w, 1);
      canvas.width = Math.floor(w * ratio);
      canvas.height = Math.floor(h * ratio * 0.45);

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var data = imgData.data;

      var result = '<pre class="tp-ascii-img">';
      for (var y = 0; y < canvas.height; y++) {
        for (var x = 0; x < canvas.width; x++) {
          var i = (y * canvas.width + x) * 4;
          var ri = data[i], gi = data[i+1], bi = data[i+2];
          var gray = (ri + gi + bi) / 3;
          var symIdx = Math.floor(gray / 255 * (T.asciiSymbols.length - 1));
          var ch = T.asciiSymbols[symIdx];
          if (ch === ' ') ch = '&nbsp;';
          result += '<span style="color:rgb(' + ri + ',' + gi + ',' + bi + ')">' + ch + '</span>';
        }
        result += '\n';
      }
      result += '</pre>';

      T.asciiCache[imgSrc] = result;
      callback(result);
    };

    img.onerror = function() {
      callback('<span class="tp-muted">[image load error]</span>');
    };

    img.src = imgSrc;
  };

  // ── CSRF token ──
  T.csrfToken = function() {
    var el = document.querySelector('meta[name="csrf-token"]');
    return el ? el.content : '';
  };

  // ── Uptime string ──
  T.uptimeStr = function() {
    var elapsed = Math.floor((Date.now() - T.startTime) / 1000);
    var h = Math.floor(elapsed / 3600);
    var m = Math.floor((elapsed % 3600) / 60);
    var s = elapsed % 60;
    return h + 'h ' + m + 'm ' + s + 's';
  };

  // ── Relative time ──
  T.relTime = function(isoStr) {
    if (!isoStr || !isoStr.includes('T')) return isoStr;
    var then = new Date(isoStr);
    if (isNaN(then.getTime())) return isoStr;
    var now = new Date();
    var diff = Math.floor((now - then) / 1000);
    if (diff < 0) return 'just now';
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    var days = Math.floor(diff / 86400);
    if (days < 30) return days + 'd ago';
    if (days < 365) return Math.floor(days / 30) + 'mo ago';
    return Math.floor(days / 365) + 'y ago';
  };

  // ── Matrix rain boot animation ──
  T.showMatrixRain = function(callback) {
    var original = T.el.output.innerHTML;
    T.el.output.innerHTML = '';

    var rootStyle = getComputedStyle(document.documentElement);
    var brightGreen = rootStyle.getPropertyValue('--green').trim() || '#a6e3a1';
    var dimGreen = rootStyle.getPropertyValue('--surface2').trim() || '#1a5a2a';

    var cols = Math.floor(T.el.output.clientWidth / 8) || 40;
    var drops = [];
    for (var i = 0; i < cols; i++) drops[i] = 1;

    var frame = 0;
    var interval = setInterval(function() {
      var html = '';
      for (var i = 0; i < drops.length; i++) {
        var ch = String.fromCharCode(0x30A0 + Math.random() * 96);
        var color = drops[i] < 5 ? brightGreen : dimGreen;
        html += '<span style="color:' + color + '">' + ch + '</span>';
        if (drops[i] > 20) drops[i] = 0;
        if (Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      T.el.output.innerHTML = html;
      frame++;
      if (frame > 40) {
        clearInterval(interval);
        T.el.output.innerHTML = original;
        if (callback) callback();
      }
    }, 50);
  };

  // ── Unknown command ──
  T.cmdUnknown = function(cmd) {
    var first = cmd.split(' ')[0];
    T.addOutputLine('<span class="tp-err">bash: ' + T.escapeHtml(first) + ': command not found</span>');
    T.addOutputLine('<span class="tp-desc"># <span class="tp-cmd">help</span> — list commands</span>');
  };

  // ── Init ──
  T.init = function() {
    if (!T.savedLang) {
      var htmlLang = document.documentElement.getAttribute('lang') || '';
      if (htmlLang.startsWith('ru')) T.env.LANG = 'ru_RU';
      else if (htmlLang.startsWith('en')) T.env.LANG = 'en_US';
      localStorage.setItem('rugram_lang', T.env.LANG);
    }

    T.el.main = document.querySelector('main');
    T.el.terminal = document.getElementById('terminal-mode');
    T.el.output = document.getElementById('termOutput');
    T.el.input = document.getElementById('termInput');
    T.el.prompt = document.getElementById('termPrompt');
    T.el.toggleBtn = document.getElementById('termToggle');
    T.el.toggleIcon = document.getElementById('termToggle');
    T.el.bar = document.getElementById('termBar');

    if (!T.el.terminal) return;

    if (T.el.toggleBtn) { T.el.toggleBtn.onclick = T.toggleMode; }

    if (window.CURRENT_USERNAME && window.CURRENT_USERNAME !== 'guest') {
      T.username = window.CURRENT_USERNAME;
      T.isLoggedIn = true;
    } else {
      var userEl = document.querySelector('.term-username') || document.querySelector('[data-username]');
      if (userEl) T.username = userEl.textContent.trim() || userEl.dataset.username || 'guest';
    }

    if (T.username === 'guest' && window.isAuthenticated) {
      fetch(window.API_ME_URL, { credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.authenticated) {
            T.username = data.user.username;
            T.currentUserId = data.user.id || T.currentUserId;
            T.isLoggedIn = true;
            T.updatePrompt();
          }
        })
        .catch(function() {});
    }

    fetch(window.API_NOTIFICATIONS_URL + '?page=1&per_page=1', { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        T.unreadNotifs = data.total_unread || data.unread || 0;
        T.updatePrompt();
      })
      .catch(function() {});

    T.fetchFeedFromAPI();

    var cdNav = sessionStorage.getItem('cd_nav');
    if (cdNav) {
      sessionStorage.removeItem('cd_nav');
      T.cwd = cdNav.split('/')[0];
      T.updatePrompt();
      T.setMode('tty');
      T.clearOutput();
      T.addSysLine('<span class="tp-muted">[ Navigated to ~/' + T.escapeHtml(T.cwd) + ' ]</span>');
      T.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">ls</span> to list contents, <span class="tp-cmd">feed</span> to view posts</span>');
    }

    if (!cdNav && localStorage.getItem('rugram_mode') === 'tty' && sessionStorage.getItem('tty_session') === '1') {
      T.setMode('tty');
    }

    if (T.el.input) {
      T.el.input.addEventListener('keydown', T.onInputKey);
    }

    document.addEventListener('keydown', function(e) {
      var tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Don't handle / ? Escape when less mode is active
      if (T._lessActive) return;

      if (e.key === '/' && T.mode === 'tty') {
        e.preventDefault();
        T.el.input.focus();
      }
      if (e.key === '?' && T.mode === 'tty') {
        e.preventDefault();
        T.processCommand('help');
      }
      if (e.key === 'Escape' && T.mode === 'tty') {
        var modal = document.querySelector('.modal.show, .term-modal-overlay');
        if (modal) return;
        T.el.input.blur();
      }
    });
  };

  // ── Expose ──
  window.TERMINAL = T;
  window.toggleTerminal = T.toggleMode;

  // Auto-init
  T.init();
})();
