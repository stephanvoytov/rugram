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
  T.feedData = [];
  T.bootShown = false;
  T.loadingEl = null;
  T.cwd = '';
  T.prevCmd = '';

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

  // ── Nano overlay state ──
  T.nanoOverlay = null;

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
    var user = T.username || 'guest';
    var dir = T.cwd ? '~/' + T.cwd : '~';
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
      if (!T.el.output.querySelector('.term-post') && !T.el.output.querySelector('.term-boot')) {
        if (!T.bootShown) {
          T.showBootScreen();
        } else {
          T.renderFeed();
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

  // ── Cache feed posts from DOM ──
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

  // ── Command Processing ──
  T.processCommand = function(cmd) {
    cmd = cmd.trim();
    if (!cmd) return;

    if (cmd.includes('&&')) {
      T.commandHistory.push(cmd);
      if (T.commandHistory.length > 50) T.commandHistory.shift();
      T.historyIdx = T.commandHistory.length;
      T.prevCmd = T.lastCmd;
      T.lastCmd = cmd;
      var parts = cmd.split('&&');
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i].trim();
        if (part) T._dispatchCommand(part);
      }
      return;
    }

    T.commandHistory.push(cmd);
    if (T.commandHistory.length > 50) T.commandHistory.shift();
    T.historyIdx = T.commandHistory.length;
    T.prevCmd = T.lastCmd;
    T.lastCmd = cmd;

    T._dispatchCommand(cmd);
  };

  T._dispatchCommand = function(cmd) {
    // --help flag
    if (/\s--help$|^--help$/.test(cmd)) {
      var hlpName = cmd.replace(/\s*--help$/, '').trim().split(' ')[0];
      T.showCmdHelp(hlpName || 'help');
      return;
    }

    var m;

    // login <username> <password>
    if (/^login/i.test(cmd)) {
      m = cmd.match(/^login\s+(\S+)\s+(.+)$/i);
      if (m) { T.cmdLogin(m[1], m[2]); return; }
      T.addOutputLine('<span class="tp-err">Usage: login &lt;username&gt; &lt;password&gt;</span>');
      return;
    }

    // register <username> <email> <password>
    if (/^register/i.test(cmd)) {
      m = cmd.match(/^register\s+(\S+)\s+(\S+)\s+(.+)$/i);
      if (m) { T.cmdRegister(m[1], m[2], m[3]); return; }
      T.addOutputLine('<span class="tp-err">Usage: register &lt;username&gt; &lt;email&gt; &lt;password&gt;</span>');
      return;
    }

    // logout
    if (cmd.toLowerCase() === 'logout') { T.cmdLogout(); return; }

    // like <id>
    m = cmd.match(/^like\s+(\d+)$/i);
    if (m) { T.cmdLike(parseInt(m[1], 10)); return; }

    // comment <id> "text" or comment <id> text
    m = cmd.match(/^comment\s+(\d+)\s+"(.+?)"$/i) || cmd.match(/^comment\s+(\d+)\s+(.+)$/i);
    if (m) { T.cmdComment(parseInt(m[1], 10), m[2]); return; }

    // follow/unfollow @user
    m = cmd.match(/^(follow|unfollow)\s+@?(\w+)$/i);
    if (m) { T.cmdFollow(m[1].toLowerCase(), m[2]); return; }

    // bookmark <id>
    m = cmd.match(/^bookmark\s+(\d+)$/i);
    if (m) { T.cmdBookmark(parseInt(m[1], 10)); return; }

    // neofetch @user
    m = cmd.match(/^neofetch\s+@?(\w+)$/i);
    if (m) { T.cmdNeofetch(m[1]); return; }

    // whoami
    if (cmd.toLowerCase() === 'whoami') { T.cmdWhoami(); return; }

    // ls [-l] [section]
    if (cmd.toLowerCase() === 'ls' || /^ls\b/.test(cmd)) {
      var lsArgs = cmd.substring(2).trim();
      T.cmdLs(lsArgs);
      return;
    }

    // echo
    if (/^echo\b/i.test(cmd)) {
      T.cmdEcho(cmd.substring(4).trim());
      return;
    }

    // date
    if (cmd.toLowerCase() === 'date') { T.cmdDate(false); return; }
    if (cmd.toLowerCase() === 'date -u' || cmd.toLowerCase() === 'date -utc') { T.cmdDate(true); return; }

    // history [-c]
    if (cmd.toLowerCase() === 'history') { T.cmdHistory(false); return; }
    if (cmd.toLowerCase() === 'history -c' || cmd.toLowerCase() === 'history --clear') { T.cmdHistory(true); return; }

    // uptime
    if (cmd.toLowerCase() === 'uptime') { T.cmdUptime(); return; }

    // man [-k] [command]
    if (cmd.toLowerCase() === 'man' || /^man\b/.test(cmd)) {
      T.cmdMan(cmd.substring(3).trim());
      return;
    }

    // export [VAR[=value]]
    if (cmd.toLowerCase() === 'export' || /^export\b/.test(cmd)) {
      T.cmdExport(cmd.substring(6).trim());
      return;
    }

    // fortune
    if (cmd.toLowerCase() === 'fortune') { T.cmdFortune(); return; }

    // ping [@user]
    if (/^ping\b/i.test(cmd)) {
      T.cmdPing(cmd.substring(4).trim());
      return;
    }

    // watch [-n N] <command> | watch stop
    if (/^watch\b/i.test(cmd)) {
      T.cmdWatch(cmd.substring(5).trim());
      return;
    }

    // head [-n N]
    if (cmd.toLowerCase() === 'head' || /^head\s+-/.test(cmd)) {
      T.cmdHead(cmd.substring(4).trim());
      return;
    }

    // tail [-n N]
    if (cmd.toLowerCase() === 'tail' || /^tail\s+-/.test(cmd)) {
      T.cmdTail(cmd.substring(4).trim());
      return;
    }

    // top
    if (cmd.toLowerCase() === 'top') { T.cmdTop(); return; }

    // nano post <id> | nano profile
    if (/^nano\b/i.test(cmd)) {
      T.cmdNano(cmd.substring(4).trim());
      return;
    }

    // say <text>
    if (/^say\s+/i.test(cmd)) {
      T.cmdSay(cmd.substring(3).trim());
      return;
    }

    // start @user
    if (/^start\b/i.test(cmd)) {
      T.startChatWithUser(cmd.substring(5).trim().replace(/^@/, ''), true);
      return;
    }

    // cat /feed or feed
    if (cmd.toLowerCase() === 'cat /feed' || cmd.toLowerCase() === 'feed') { T.renderFeed(); return; }

    // grep "text" /feed
    m = cmd.match(/^grep\s+"(.+?)"(?:\s+\/feed)?$/i);
    if (m) { T.cmdGrep(m[1]); return; }

    // cat /notifications or notifications
    if (cmd.toLowerCase() === 'cat /notifications' || cmd.toLowerCase() === 'notifications') { T.cmdNotifications(); return; }

    // clear
    if (cmd.toLowerCase() === 'clear') { T.el.output.innerHTML = ''; return; }

    // help
    if (cmd.toLowerCase() === 'help') { T.cmdHelp(); return; }

    // gui
    if (cmd.toLowerCase() === 'gui' || cmd.toLowerCase() === 'exit') { T.setMode('gui'); return; }

    // cd <section>
    if (cmd.toLowerCase().startsWith('cd ') || cmd.toLowerCase() === 'cd') {
      var cdTarget = cmd.trim().length > 2 ? cmd.slice(cmd.indexOf(' ') + 1).trim() : '';
      T.processCd(cdTarget);
      return;
    }

    // pwd
    if (cmd.toLowerCase() === 'pwd') { T.cmdPwd(); return; }

    // sudo !!
    if (cmd.toLowerCase() === 'sudo !!') {
      if (T.prevCmd) { T._dispatchCommand(T.prevCmd); return; }
      T.addOutputLine('<span class="tp-err">sudo: no previous command</span>');
      return;
    }

    // Unknown command
    T.cmdUnknown(cmd);
  };

  // ── Input handler ──
  T.onInputKey = function(e) {
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
    T.addOutputLine('<span class="tp-muted">Server: ' + window.location.host + '  |  User: @' + T.username + '</span>');
    T.addOutputLine('');

    var unread = typeof T.unreadNotifs !== 'undefined' ? T.unreadNotifs : 0;
    if (unread > 0) {
      T.addOutputLine('You have <span class="tp-ok">' + unread + ' unread notification' + (unread > 1 ? 's' : '') + '</span>');
    }
    T.addOutputLine('<span class="tp-desc">' + (T.feedData.length || '0') + ' posts cached in feed</span>');
    T.addOutputLine('');

    T.addOutputLine('<span class="tp-muted"># <span class="tp-cmd">help</span> — all commands  |  <span class="tp-cmd">cd feed</span> — browse feed  |  <span class="tp-cmd">cd chat</span> — messages</span>');
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
    T.clearOutput();
    T.addOutputLine('<span class="tp-section">-- /feed -- (' + list.length + ' posts)</span>');

    if (!list.length) {
      if (window.location.pathname !== '/' && window.location.pathname !== '/index') {
        T.addSysLine('<span class="tp-muted">No feed cache — navigating to homepage...</span>');
        sessionStorage.setItem('cd_nav', 'feed');
        localStorage.setItem('rugram_mode', 'tty');
        window.location.href = window.HOME_URL;
        return;
      }
      T.addOutputLine('<span class="tp-muted">  feed: empty</span>');
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
    return document.querySelector('meta[name="csrf-token"]');
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

    T.cacheFeedFromDOM();

    var cdNav = sessionStorage.getItem('cd_nav');
    if (cdNav) {
      sessionStorage.removeItem('cd_nav');
      T.cwd = cdNav.split('/')[0];
      T.updatePrompt();
      T.setMode('tty');
      if (T.cwd === 'feed') {
        T.renderFeed();
      } else {
        T.addOutputLine('<span class="tp-muted">[ Navigated to /' + T.escapeHtml(T.cwd) + ' ]</span>');
      }
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
