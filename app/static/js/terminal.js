// ── Rugram Terminal Mode ──
// Dual-mode: GUI (обычный) + TTY (терминальный)
// Переключение: кнопка в навбаре или команда `gui`/`exit`
// @ts-check
// CORE module — defines window.__RT with all shared state and utilities

(function() {
  'use strict';

  class Terminal {
    constructor() {
      // ── State ──
      this.APP_VERSION = '0.3.0';
      this.mode = 'gui';
      this.lastCmd = '';
      this.commandHistory = [];
      this.historyIdx = -1;
      this.username = 'guest';
      this.isLoggedIn = false;
      this.feedData = [];
      this._fetchingFeed = false;
      this.bootShown = false;
      this.loadingEl = null;
      this.cwd = '';
      this.prevCmd = '';

      // ── Command Registry (system metadata) ──
      this.registry = {};
      this._regOrder = 0;

      // ── DOM refs (set on init) ──
      this.el = {};

      // ── Enhanced state ──
      this.savedLang = localStorage.getItem('rugram_lang');
      this.env = { LANG: this.savedLang || 'ru_RU', EDITOR: 'vim', THEME: 'dark', MATRIX: '0' };
      this.startTime = Date.now();

      // ── Notification / watch / fortune state ──
      this.unreadNotifs = 0;
      this.watchInterval = null;
      this.fortuneQuotes = [];
      this.manPages = {};

      // ── Matrix rain ──
      this.matrixEnabled = this.env.MATRIX === '1' || Math.random() < 0.3;

      // ── Section route map for cd command ──
      this.sectionUrls = {
        'settings': window.SETTINGS_URL,
        'edit_profile': window.EDIT_PROFILE_URL,
      };

      // ── Chat state ──
      this.chatPollInterval = null;
      this.lastMessageId = 0;
      this.currentChatUser = '';
      this.chatContext = null;
      this.currentUserId = window.CURRENT_USER_ID || 0;
      this.isLoggedIn = window.isAuthenticated === true && this.currentUserId > 0;

      // ── Nano overlay state ──
      this.nanoOverlay = null;

      // ── Reverse-i-search state ──
      this._reverseSearchActive = false;
      this._reverseSearchQuery = '';

      // ── Program view stack (save/restore terminal output) ──
      this._programStack = [];
      this._programDepth = 0;

      // ── Less mode state ──
      this._lessActive = false;
      this._lessItems = [];
      this._lessTitle = '';
      this._lessPos = 0;
      this._lessPerPage = 15;
      this._lessSearchQuery = '';
      this._lessSearchResults = [];
      this._lessFilteredItems = [];
      this._lessOnEnter = null;
      this._lessGPress = false;
      this._lessAwaitingSearch = false;
      this._lessSearchHandler = null;
      this._lessKeyHandler = null;
      this._lessTouchHandler = null;
      this._lessTouchStartY = 0;
      this._lessTouchStartPos = 0;
      this._lessType = 'generic';

      // ── Top / ping state ──
      this.topInterval = null;
      this._pingAborted = undefined;
      this._topExitListener = null;

      // ── AbortController for Ctrl+C ──
      this._abortController = null;

      // ── Command class ──
      // Wraps handler with execute() that handles sync/async completion.
      // async: handler receives (arg, onComplete), calls onComplete when done.
      // sync: handler receives (arg), onComplete called automatically after.
      const self = this;

      /**
       * @typedef {Object} CommandOptions
       * @property {function(...*): *} handler     - Handler function
       * @property {boolean}          [async]     - If true, handler gets (arg, onComplete)
       * @property {boolean}          [auth]      - If true, requires login
       * @property {string}           [category]  - Group name (auth, system, navigation, …)
       * @property {string}           [match]     - 'exact' | 'prefix' | 'regex'
       * @property {RegExp}           [regex]     - Custom regex (auto-generated from name otherwise)
       * @property {function(string): *} [parse]  - Custom arg parser
       * @property {string}           [description] - Human-readable help text
       * @property {string}           [usage]     - Usage example
       */

      /**
       * Registered terminal command with auto-dispatch.
       * Sync handlers: `onComplete` called automatically after handler returns.
       * Async handlers: receive `onComplete` as last arg and must call it.
       *
       * @param {string} name - Command name (used for matching)
       * @param {CommandOptions} options - Command configuration
       */
      this.Command = function(name, options) {
        this.name = name;
        this.handler = options.handler;
        this.async = !!options.async;
        this.auth = !!options.auth;
        this.category = options.category || 'system';
        this.match = options.match || 'exact';
        this.regex = options.regex || null;
        this.parse = options.parse || null;
        this.description = options.description || '';
        this.usage = options.usage || '';
        this._order = self._regOrder++;
        // Auto-generate regex from name + match type
        if (!this.regex) {
          if (this.match === 'exact') {
            this.regex = new RegExp('^' + name + '$', 'i');
          } else if (this.match === 'prefix') {
            this.regex = new RegExp('^' + name + '\\b', 'i');
          } else if (this.match === 'regex') {
            this.regex = new RegExp(name, 'i');
          }
        }
      };

      this.Command.prototype.execute = function(handlerArg, onComplete) {
        // Normalize handlerArg to an array of args for .apply()
        var args;
        if (handlerArg === null || handlerArg === undefined) {
          args = [];
        } else if (Array.isArray(handlerArg)) {
          args = handlerArg;
        } else {
          args = [handlerArg];
        }

        if (this.async) {
          // Append onComplete as last arg; handler must call it when done
          args.push(onComplete);
          this.handler.apply(self, args);
        } else {
          this.handler.apply(self, args);
          if (typeof onComplete === 'function') onComplete();
        }
      };

      // ── Context bindings for public callback methods ──
      // All methods that can be called as callbacks (setTimeout, event handlers,
      // fetch .then/.catch) MUST be bound here so `this` stays correct.
      this.init = this.init.bind(this);
      this.onInputKey = this.onInputKey.bind(this);
      this.processCommand = this.processCommand.bind(this);
      this._dispatchCommand = this._dispatchCommand.bind(this);
      this._cancelCommand = this._cancelCommand.bind(this);
      this.setMode = this.setMode.bind(this);
      this.toggleMode = this.toggleMode.bind(this);
      this.addOutput = this.addOutput.bind(this);
      this.addOutputLine = this.addOutputLine.bind(this);
      this.clearOutput = this.clearOutput.bind(this);
      this.addSysLine = this.addSysLine.bind(this);
      this.showLoading = this.showLoading.bind(this);
      this.hideLoading = this.hideLoading.bind(this);
      this.updatePrompt = this.updatePrompt.bind(this);
      this.enterProgramView = this.enterProgramView.bind(this);
      this.exitProgramView = this.exitProgramView.bind(this);
      // enterLessMode, _exitLessMode, _renderLess, _renderFeedItem are bound
      // externally in terminal-less.js (IIFE assigns to T with T.xxx = fn)
      this.exec = this.exec.bind(this);
      this.showCmdHelp = this.showCmdHelp.bind(this);
    }

    // ════════════════════════════════════════════════════
    //  UTILITY METHODS
    // ════════════════════════════════════════════════════

    // ── Bilingual helper ──
    _(ru, en) {
      return (this.env.LANG || '').toLowerCase().startsWith('ru') ? ru : en;
    }

    // ── CSRF token ──
    csrfToken() {
      var el = document.querySelector('meta[name="csrf-token"]');
      return el ? el.content : '';
    }

    // ── HTML escaping ──
    escapeHtml(text) {
      var d = document.createElement('div');
      d.textContent = text;
      return d.innerHTML;
    }

    // ── #tag linkifier ──
    _linkifyTags(escapedHtml) {
      return escapedHtml.replace(/#(\w{1,32})/g, function(match, tag) {
        return '<span class="tp-tag" data-tag="' + tag.toLowerCase() + '">#' + tag + '</span>';
      });
    }

    // ── Current time as HH:MM:SS ──
    sysTime() {
      var d = new Date();
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    // ── Toast notification ──
    toast(msg, type) {
      if (window.showToast) {
        window.showToast(type === 'ok' ? '✓' : type === 'err' ? '✗' : 'TTY', msg, type || 'info');
      }
    }

    // ── Uptime string ──
    uptimeStr() {
      var elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      var h = Math.floor(elapsed / 3600);
      var m = Math.floor((elapsed % 3600) / 60);
      var s = elapsed % 60;
      return h + 'h ' + m + 'm ' + s + 's';
    }

    // ── Relative time ──
    relTime(isoStr) {
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
    }

    // ── Unknown command ──
    cmdUnknown(cmd) {
      var first = cmd.split(' ')[0];
      this.addOutputLine('<span class="tp-err">bash: ' + this.escapeHtml(first) + ': command not found</span>');
      this.addOutputLine('<span class="tp-desc"># <span class="tp-cmd">help</span> — list commands</span>');
    }

    // ── Check if command should be stored in history (filter passwords) ──
    _shouldAddToHistory(cmd) {
      var lower = cmd.toLowerCase().trim();
      if (/^(login|register)\s/i.test(lower)) return false;
      return true;
    }

    // ── Alias system ──
    _loadAliases() {
      try { return JSON.parse(localStorage.getItem('rugram_aliases')) || {}; }
      catch(e) { return {}; }
    }

    _saveAliases(aliases) {
      localStorage.setItem('rugram_aliases', JSON.stringify(aliases));
    }

    _expandAliases(cmd) {
      var aliases = this._loadAliases();
      var firstWord = cmd.split(/\s+/)[0];
      if (aliases[firstWord] !== undefined) {
        return aliases[firstWord] + cmd.substring(firstWord.length);
      }
      return cmd;
    }

    // ── $VAR expansion ──
    _expandEnv(text) {
      var self = this;
      return text.replace(/\$(\w+)/g, function(m, key) {
        return self.env[key] !== undefined ? self.env[key] : m;
      });
    }

    // ── One-time key handler ──
    onceKey(key, callback) {
      var handler = function(e) {
        if (e.key === key || (key === 'q' && (e.key === 'Q' || e.key === 'Escape'))) {
          document.removeEventListener('keydown', handler);
          e.preventDefault();
          callback();
        }
      };
      setTimeout(function() { document.addEventListener('keydown', handler); }, 100);
    }

    // ── AbortController for Ctrl+C ──
    _newAbort() {
      if (this._abortController) this._abortController.abort();
      this._abortController = new AbortController();
      return this._abortController.signal;
    }

    _cancelCommand() {
      if (this._abortController) {
        this._abortController.abort();
        this._abortController = null;
      }
      // Stop watch interval
      if (this.watchInterval) {
        clearInterval(this.watchInterval);
        this.watchInterval = null;
        this.topInterval = null;
      }
      // Stop top interval
      if (this.topInterval) {
        clearInterval(this.topInterval);
        this.topInterval = null;
      }
      // Abort ping
      if (this._pingAborted !== undefined) {
        this._pingAborted = true;
      }
      // Clear keydown listener for top exit
      if (this._topExitListener) {
        document.removeEventListener('keydown', this._topExitListener);
        this._topExitListener = null;
      }
      if (this._programStack && this._programStack.length > 0) {
        while (this._programStack.length > 0) this.exitProgramView();
      }
    }

    // ── fetch wrapper with abort support ──
    vfsFetch(url, options) {
      options = options || {};
      if (!options.signal && this._abortController) {
        options.signal = this._abortController.signal;
      }
      return fetch(url, options);
    }

    // ── VFS tab completion ──
    _completeVFSPath(partial, cwd) {
      var hasSlash = partial.lastIndexOf('/') >= 0;
      var parentPath = hasSlash ? partial.substring(0, partial.lastIndexOf('/')) : '';
      var lastName = hasSlash ? partial.substring(partial.lastIndexOf('/') + 1) : partial;
      var prefix = hasSlash ? parentPath + '/' : '';

      var node;
      if (parentPath) {
        var parts = this.vfs.normalize(parentPath, cwd);
        node = this.vfs.route(parts);
      } else {
        var curParts = cwd ? this.vfs.normalize(cwd, '') : [];
        node = this.vfs.route(curParts);
      }

      if (!node || node.error || node.type !== 'dir') return [];

      var children = node.children || [];
      var results = [];
      var seen = {};

      for (var i = 0; i < children.length; i++) {
        var name = children[i].name;
        if (name.toLowerCase().startsWith(lastName.toLowerCase())) {
          var suffix = children[i].type === 'dir' ? '/' : '';
          var full = prefix + name + suffix;
          if (!seen[full]) { seen[full] = true; results.push(full); }
        }
      }

      // Also complete @usernames at root level (or when at /users)
      if (lastName.startsWith('@') && (!parentPath || parentPath === 'users')) {
        var userPartial = lastName.toLowerCase().replace('@', '');
        (this.feedData || []).forEach(function(p) {
          if (p.author.toLowerCase().startsWith(userPartial)) {
            var at = prefix + '@' + p.author + '/';
            if (!seen[at]) { seen[at] = true; results.push(at); }
          }
        });
      }

      return results.sort();
    }

    // ── Auth error message ──
    unauthError(cmdName) {
      this.addOutputLine('<span class="tp-err">' + cmdName + ': ' + this._('Требуется вход.', 'Login required.') + '</span>');
      this.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">login</span> or <span class="tp-cmd">register</span></span>');
    }

    // ── Register using Command class (new-style) ──
    registerCommand(name, cmd) {
      if (!(cmd instanceof this.Command)) {
        throw new Error('T.registerCommand: expected a Command instance');
      }
      this.registry[name] = cmd;
    }

    // ── Legacy register (old-style, still works for plain-object entries) ──
    register(name, meta) {
      meta._order = this._regOrder++;
      if (!meta.match) meta.match = 'exact';
      if (!meta.auth) meta.auth = false;
      if (meta.match === 'exact' && !meta.regex) {
        meta.regex = new RegExp('^' + name + '$', 'i');
      } else if (meta.match === 'prefix' && !meta.regex) {
        meta.regex = new RegExp('^' + name + '\\b', 'i');
      } else if (meta.match === 'regex' && !meta.regex) {
        meta.regex = new RegExp(name, 'i');
      }
      this.registry[name] = meta;
    }

    // ════════════════════════════════════════════════════
    //  CORE COMMAND PROCESSING
    // ════════════════════════════════════════════════════

    // ── Command Processing ──
    // processCommand dispatches the command and handles completion.
    // Sync commands: onComplete fires automatically after handler returns.
    // Async commands: handler receives onComplete and calls it when done.
    processCommand(cmd, onComplete) {
      cmd = cmd.trim();
      if (!cmd) {
        if (typeof onComplete === 'function') onComplete();
        return;
      }

      // Expand aliases before any processing
      cmd = this._expandAliases(cmd);

      var addToHistory = this._shouldAddToHistory(cmd);

      // ── Chaining: ; (always), || (if exit code), && (if exit code) ──
      // Since we don't track exit codes, all three just run sequentially.
      // Split precedence: ; first, then ||, then && (like bash precedence).
      var chainOp = null;
      if (cmd.indexOf(';') >= 0) chainOp = ';';
      else if (cmd.indexOf('||') >= 0) chainOp = '||';
      else if (cmd.indexOf('&&') >= 0) chainOp = '&&';

      if (chainOp) {
        var parts = cmd.split(chainOp);
        if (parts.length > 5) {
          this.addOutputLine('<span class="tp-err">bash: too many chained commands (max 5)</span>');
          if (typeof onComplete === 'function') onComplete();
          return;
        }
        if (addToHistory) {
          this.commandHistory.push(cmd);
          if (this.commandHistory.length > 50) this.commandHistory.shift();
        }
        this.historyIdx = this.commandHistory.length;
        this.prevCmd = this.lastCmd;
        this.lastCmd = cmd;
        for (var i = 0; i < parts.length; i++) {
          var part = parts[i].trim();
          if (part) this._dispatchCommand(part);
        }
        if (typeof onComplete === 'function') onComplete();
        return;
      }

      if (addToHistory) {
        this.commandHistory.push(cmd);
        if (this.commandHistory.length > 50) this.commandHistory.shift();
      }
      this.historyIdx = this.commandHistory.length;
      this.prevCmd = this.lastCmd;
      this.lastCmd = cmd;

      // Pass onComplete to _dispatchCommand; Command.execute handles sync/async
      this._dispatchCommand(cmd, onComplete);
    }

    // ── _dispatchCommand ──
    // Accepts optional onComplete callback.
    // For Command instances (new-style): uses entry.execute() which handles sync/async.
    // For plain-object entries (legacy): calls handler directly, fires onComplete after.
    // Special non-registry commands (cd, gui, sudo !!) also call onComplete when sync.
    _dispatchCommand(cmd, onComplete) {
      // Expand $VAR in the entire command line before dispatching
      cmd = this._expandEnv(cmd);

      // --help flag (generic — works for any command)
      if (/\s--help$|^--help$/.test(cmd)) {
        var hlpName = cmd.replace(/\s*--help$/, '').trim().split(' ')[0];
        this.showCmdHelp(hlpName || 'help');
        if (typeof onComplete === 'function') onComplete();
        return;
      }

      // Special commands that DON'T use the registry
      // (non-standard dispatch, command history, mode switch, cd)

      // cd <section>
      if (cmd.toLowerCase().startsWith('cd ') || cmd.toLowerCase() === 'cd') {
        var cdTarget = cmd.trim().length > 2 ? cmd.slice(cmd.indexOf(' ') + 1).trim() : '';
        this.processCd(cdTarget);
        if (typeof onComplete === 'function') onComplete();
        return;
      }

      // gui / exit
      if (cmd.toLowerCase() === 'gui' || cmd.toLowerCase() === 'exit') {
        if (window.location.pathname === '/terminal') {
          window.location.href = '/';
          return;
        }
        this.setMode('gui');
        if (typeof onComplete === 'function') onComplete();
        return;
      }

      // sudo !! — repeat previous command
      if (cmd.toLowerCase() === 'sudo !!') {
        if (this.prevCmd) { this._dispatchCommand(this.prevCmd, onComplete); return; }
        this.addOutputLine('<span class="tp-err">sudo: no previous command</span>');
        if (typeof onComplete === 'function') onComplete();
        return;
      }

      // ── Registry dispatch ──
      var names = Object.keys(this.registry);
      for (var i = 0; i < names.length; i++) {
        var entry = this.registry[names[i]];
        var m = cmd.match(entry.regex);
        if (!m) continue;

        // Auth middleware
        if (entry.auth && !this.isLoggedIn) {
          this.unauthError(names[i]);
          if (typeof onComplete === 'function') onComplete();
          return;
        }

        if (typeof entry.execute === 'function') {
          // New-style Command instance — let execute handle args + completion
          var handlerArg;
          if (entry.match === 'regex' && entry.parse) {
            handlerArg = entry.parse(m);
          } else if (entry.match === 'prefix') {
            handlerArg = cmd.substring(names[i].length).trim();
          } else {
            handlerArg = null;
          }
          entry.execute(handlerArg, onComplete);
        } else {
          // Legacy plain-object entry — call handler directly
          if (entry.match === 'regex' && entry.parse) {
            entry.handler.apply(null, entry.parse(m));
          } else if (entry.match === 'prefix') {
            entry.handler(cmd.substring(names[i].length).trim());
          } else {
            if (m[1] !== undefined && entry.parse) {
              entry.handler.apply(null, entry.parse(m));
            } else {
              entry.handler();
            }
          }
          if (typeof onComplete === 'function') onComplete();
        }
        return;
      }

      // Unknown command
      this.cmdUnknown(cmd);
      if (typeof onComplete === 'function') onComplete();
    }

    // ── Input handler ──
    onInputKey(e) {
      // Ctrl+C — interrupt
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        if (this.nanoOverlay) return;
        e.preventDefault();
        this._cancelCommand();
        this.addOutputLine('<span class="tp-muted">^C</span>');
        this.el.input.value = '';
        this.updatePrompt();
        if (this.el.input) { setTimeout(function() { this.el.input.focus(); }.bind(this), 10); }
        return;
      }

      // Ctrl+R — reverse-i-search
      if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (this._reverseSearchActive) {
          var q = this._reverseSearchQuery.toLowerCase();
          var found = false;
          for (var i = this._reverseSearchMatchIdx - 1; i >= 0; i--) {
            if (this.commandHistory[i].toLowerCase().indexOf(q) >= 0) {
              this.el.input.value = this.commandHistory[i];
              this._reverseSearchMatchIdx = i;
              found = true;
              break;
            }
          }
          if (!found) { /* beep silently */ }
        } else {
          this._reverseSearchActive = true;
          this._reverseSearchQuery = '';
          this._reverseSearchMatchIdx = -1;
          this.el.input.value = '';
          this.el.input.placeholder = '(reverse-i-search) ``\'';
        }
        return;
      }

      // If reverse search is active, intercept keys
      if (this._reverseSearchActive) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var matchedCmd = this.el.input.value;
          this._reverseSearchActive = false;
          this.el.input.placeholder = '';
          this._reverseSearchQuery = '';
          this.el.input.value = '';
          if (matchedCmd.trim()) {
            var fullPrompt = this.escapeHtml(this.username) + '@tty:' + (this.cwd ? '~/' + this.escapeHtml(this.cwd) : '~');
            this.addOutputLine('<span class="tp-prompt">' + fullPrompt + '$</span><span class="tp-cmd">' + this.escapeHtml(matchedCmd.trim()) + '</span>');
            this.processCommand(matchedCmd.trim());
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          this._reverseSearchActive = false;
          this.el.input.placeholder = '';
          this.el.input.value = '';
          this._reverseSearchQuery = '';
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          this._reverseSearchQuery = this._reverseSearchQuery.slice(0, -1);
          if (this._reverseSearchQuery) {
            var lower = this._reverseSearchQuery.toLowerCase();
            var found = false;
            for (var i = this.commandHistory.length - 1; i >= 0; i--) {
              if (this.commandHistory[i].toLowerCase().indexOf(lower) >= 0) {
                this.el.input.value = this.commandHistory[i];
                this._reverseSearchMatchIdx = i;
                found = true;
                break;
              }
            }
            if (!found) this.el.input.value = '';
          } else {
            this.el.input.value = '';
            this._reverseSearchMatchIdx = -1;
          }
          this.el.input.placeholder = '(reverse-i-search) `' + this._reverseSearchQuery + '\'';
          return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          this._reverseSearchQuery += e.key;
          var lower = this._reverseSearchQuery.toLowerCase();
          var found = false;
          for (var i = this.commandHistory.length - 1; i >= 0; i--) {
            if (this.commandHistory[i].toLowerCase().indexOf(lower) >= 0) {
              this.el.input.value = this.commandHistory[i];
              this._reverseSearchMatchIdx = i;
              found = true;
              break;
            }
          }
          if (!found) this.el.input.value = '';
          this.el.input.placeholder = '(reverse-i-search) `' + this._reverseSearchQuery + '\'';
          return;
        }
        // Block other keys during search
        e.preventDefault();
        return;
      }

      // Tab — autocomplete
      if (e.key === 'Tab') {
        e.preventDefault();
        var input = this.el.input.value.trim();
        if (!input) return;
        var words = input.split(/\s+/);
        var partial = words[0].toLowerCase();
        var candidates = [];
        var navCmds = { cd: 1, ls: 1, cat: 1, nano: 1, rm: 1 };

        if (words.length === 1) {
          // ── Complete command name ──
          var names = Object.keys(this.registry);
          for (var i = 0; i < names.length; i++) {
            if (names[i].toLowerCase().startsWith(partial)) {
              candidates.push(names[i]);
            }
          }
        } else if (navCmds[partial] && words.length === 2) {
          // ── Complete VFS path for nav commands (cd, ls, cat, nano, rm) ──
          candidates = this._completeVFSPath(words[1], this.cwd);
        } else {
          // ── Complete @username from feedData ──
          if (words[1] && words[1].startsWith('@')) {
            var userPartial = words[1].toLowerCase().replace('@', '');
            this.feedData.forEach(function(p) {
              if (p.author.toLowerCase().startsWith(userPartial)) {
                var at = '@' + p.author;
                if (candidates.indexOf(at) < 0) candidates.push(at);
              }
            });
          }
        }

        if (candidates.length === 0) return;
        if (candidates.length === 1) {
          if (words.length >= 2 && navCmds[partial]) {
            words[words.length - 1] = candidates[0];
            this.el.input.value = words.join(' ') + ' ';
          } else {
            words[0] = candidates[0];
            this.el.input.value = words.join(' ') + ' ';
          }
        } else {
          this.addOutputLine('<span class="tp-desc">' + candidates.join('  ') + '</span>');
        }
        return;
      }

      if (e.key === 'Enter') {
        var cmd = this.el.input.value.trim();
        if (cmd) {
          var fullPrompt = this.escapeHtml(this.username) + '@tty:' + (this.cwd ? '~/' + this.escapeHtml(this.cwd) : '~');
          this.addOutputLine('<span class="tp-prompt">' + fullPrompt + '$</span><span class="tp-cmd">' + this.escapeHtml(cmd) + '</span>');
          this.processCommand(cmd);
        }
        this.el.input.value = '';
        e.preventDefault();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.historyIdx > 0) {
          this.historyIdx--;
          this.el.input.value = this.commandHistory[this.historyIdx];
        }
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.historyIdx < this.commandHistory.length - 1) {
          this.historyIdx++;
          this.el.input.value = this.commandHistory[this.historyIdx];
        } else {
          this.historyIdx = this.commandHistory.length;
          this.el.input.value = '';
        }
      }
    }

    // ── Mode switching (fullscreen overlay, body scroll locked) ──
    setMode(newMode) {
      this.mode = newMode;
      if (this.mode === 'tty') {
        document.body.style.overflow = 'hidden';
        this.el.terminal.style.display = 'flex';
        if (this.el.bar) this.el.bar.style.display = 'block';
        if (this.el.toggleIcon) this.el.toggleIcon.innerHTML = '[>_ TTY]';
        if (this.el.toggleBtn) { this.el.toggleBtn.classList.add('active'); this.el.toggleBtn.title = 'Switch to GUI'; }
        localStorage.setItem('rugram_mode', 'tty');
        sessionStorage.setItem('tty_session', '1');
        this.fetchFeedFromAPI();
        if (this.el.output && !this.el.output.querySelector('.term-post') && !this.el.output.querySelector('.term-boot')) {
          if (!this.bootShown) {
            this.showBootScreen();
          } else {
            this.clearOutput();
            this.addSysLine('<span class="tp-muted">session restored — use <span class="tp-cmd">feed</span> to view feed</span>');
            this.updatePrompt();
          }
        }
        setTimeout(function() { if (this.el.input) this.el.input.focus(); }.bind(this), 100);
      } else {
        document.body.style.overflow = '';
        this.el.terminal.style.display = 'none';
        if (this.el.bar) this.el.bar.style.display = 'none';
        setTimeout(function() { this.cacheFeedFromDOM(); }.bind(this), 200);
        if (this.el.toggleIcon) this.el.toggleIcon.innerHTML = '[>_ TTY]';
        if (this.el.toggleBtn) { this.el.toggleBtn.classList.remove('active'); this.el.toggleBtn.title = 'Terminal mode'; }
        localStorage.setItem('rugram_mode', 'gui');
        sessionStorage.removeItem('tty_session');
      }
    }

    toggleMode() {
      this.setMode(this.mode === 'gui' ? 'tty' : 'gui');
    }

    // ── Prompt update (no-op stub — overridden by xterm adapter) ──
    updatePrompt() {}

    // ── Fetch feed posts from API (terminal-independent) ──
    fetchFeedFromAPI(callback) {
      this.vfsFetch(window.API_FEED_URL + '?per_page=50', { credentials: 'same-origin' })
        .then(function(r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function(data) {
          this.feedData = (data.posts || []).map(function(p) {
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
        }.bind(this))
        .catch(function() {
          if (callback) callback();
        });
    }

    // ── Cache feed posts from DOM (GUI fallback — only when switching to GUI) ──
    cacheFeedFromDOM() {
      var cards = document.querySelectorAll('.post-card');
      if (!cards.length) return;
      this.feedData = [];
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

        this.feedData.push({
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
    }

    // ── Init ──
    init() {
      this._abortController = new AbortController();

      if (!this.savedLang) {
        var htmlLang = document.documentElement.getAttribute('lang') || '';
        if (htmlLang.startsWith('ru')) this.env.LANG = 'ru_RU';
        else if (htmlLang.startsWith('en')) this.env.LANG = 'en_US';
        localStorage.setItem('rugram_lang', this.env.LANG);
      }

      this.el.main = document.querySelector('main');
      this.el.terminal = document.getElementById('terminal-mode');
      this.el.output = document.getElementById('termOutput');
      this.el.input = document.getElementById('termInput');
      this.el.prompt = document.getElementById('termPrompt');
      this.el.toggleBtn = document.getElementById('termToggle');
      this.el.toggleIcon = document.getElementById('termToggle');
      this.el.bar = document.getElementById('termBar');

      if (!this.el.terminal) return;

      if (window.CURRENT_USERNAME && window.CURRENT_USERNAME !== 'guest') {
        this.username = window.CURRENT_USERNAME;
        this.isLoggedIn = true;
      } else {
        var userEl = document.querySelector('.term-username') || document.querySelector('[data-username]');
        if (userEl) this.username = userEl.textContent.trim() || userEl.dataset.username || 'guest';
      }

      if (this.username === 'guest' && window.isAuthenticated) {
        this.vfsFetch(window.API_ME_URL, { credentials: 'same-origin' })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.authenticated) {
              this.username = data.user.username;
              this.currentUserId = data.user.id || this.currentUserId;
              this.isLoggedIn = true;
              this.updatePrompt();
            }
          }.bind(this))
          .catch(function() {});
      }

      this.vfsFetch(window.API_NOTIFICATIONS_URL + '?page=1&per_page=1', { credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          this.unreadNotifs = data.total_unread || data.unread || 0;
          this.updatePrompt();
        }.bind(this))
        .catch(function() {});

      this.fetchFeedFromAPI();

      var cdNav = sessionStorage.getItem('cd_nav');
      if (cdNav) {
        sessionStorage.removeItem('cd_nav');
        this.cwd = cdNav.split('/')[0];
        this.updatePrompt();
        this.setMode('tty');
        this.clearOutput();
        this.addSysLine('<span class="tp-muted">[ Navigated to ~/' + this.escapeHtml(this.cwd) + ' ]</span>');
        this.addOutputLine('<span class="tp-desc">  # use <span class="tp-cmd">ls</span> to list contents, <span class="tp-cmd">feed</span> to view posts</span>');
      }

      // Больше не восстанавливаем TTY на каждой странице — отдельный /terminal
      localStorage.removeItem('rugram_mode');
      sessionStorage.removeItem('tty_session');

      if (this.el.input) {
        this.el.input.addEventListener('keydown', this.onInputKey);
      }

      // Clickable #tags in terminal output (legacy DOM; xterm adapter adds its own handler)
      if (this.el.output) {
        this.el.output.addEventListener('click', function(e) {
          var tagEl = e.target.closest('.tp-tag');
          if (tagEl && tagEl.dataset.tag) {
            this.exec('feed --tag ' + tagEl.dataset.tag);
          }
        }.bind(this));
      }

      document.addEventListener('keydown', function(e) {
        var tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        if (this._lessActive) return;

        if (e.key === '/' && this.mode === 'tty') {
          e.preventDefault();
          if (this.el.input) this.el.input.focus();
        }
        if (e.key === '?' && this.mode === 'tty') {
          e.preventDefault();
          this.processCommand('help');
        }
        if (e.key === 'Escape' && this.mode === 'tty') {
          var modal = document.querySelector('.modal.show, .term-modal-overlay');
          if (modal) return;
          if (this.el.input) this.el.input.blur();
        }
      }.bind(this));
    }

    // ════════════════════════════════════════════════════
    //  OUTPUT HELPERS (no-op stubs — overridden by test
    //  harness and xterm-adapter)
    // ════════════════════════════════════════════════════

    addOutput(html) {}
    addOutputLine(html) {}
    clearOutput() {}
    addSysLine(text) {}
    showLoading(text) {}
    hideLoading() {}

    // ════════════════════════════════════════════════════
    //  BOOT SCREEN & WELCOME
    // ════════════════════════════════════════════════════

    showBootScreen() {
      this.bootShown = true;
      if (this.matrixEnabled) {
        this.showMatrixRain(function() { this._bootContent(); }.bind(this));
      } else {
        this._bootContent();
      }
    }

    _welcomeMessage() {
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
      this.addOutput(logo);
      var lastLogin = localStorage.getItem('rugram_last_login');
      if (lastLogin) {
        this.addOutputLine('<span class="tp-desc">Last login: ' + lastLogin + '</span>');
      }
      this.addOutputLine('');
      this.addOutputLine('Welcome to <span class="tp-section">Rugram Terminal v' + this.APP_VERSION + '</span>');
      var userLabel = this.isLoggedIn ? '@' + this.escapeHtml(this.username) : 'guest <span class="tp-muted">(not logged in)</span>';
this.addOutputLine('<span class="tp-muted">Server: ' + this.escapeHtml(window.location.host) + '  |  User: ' + userLabel + '</span>');
      this.addOutputLine('');
      var unread = typeof this.unreadNotifs !== 'undefined' ? this.unreadNotifs : 0;
      if (unread > 0) {
        this.addOutputLine('You have <span class="tp-ok">' + unread + ' unread notification' + (unread > 1 ? 's' : '') + '</span>');
      }
      this.addOutputLine('<span class="tp-desc">' + (this.feedData.length || '0') + this._(' posts in feed', ' posts in feed') + '</span>');
      this.addOutputLine('');
      this.addOutputLine('<span class="tp-muted"># <span class="tp-cmd">help</span> — all commands  |  <span class="tp-cmd">feed</span> — browse feed  |  <span class="tp-cmd">saved</span> — saved posts  |  <span class="tp-cmd">chat</span> — messages</span>');
      this.addOutputLine('');
      localStorage.setItem('rugram_last_login', dateStr);
    }

    // ── _bootContent (no-op stub — overridden by terminal-ascii.js) ──
    _bootContent() {}

    // renderFeed — implemented in terminal-feed.js
    // _renderFeedItem, _feedToggleLike, _feedToggleSave, _feedToggleRepost,
    // _feedRefresh, _feedFilterByAuthor — all in terminal-feed.js

    renderHome() {
      this.clearOutput();
      this._welcomeMessage();
    }

    // ════════════════════════════════════════════════════
    //  PROGRAM VIEW (save/restore terminal output)
    // ════════════════════════════════════════════════════

    enterProgramView() {
      if (this._programDepth === 0) {
        this._programStack.push({
          output: this.el.output ? this.el.output.innerHTML : '',
          scrollTop: this.el.output ? this.el.output.scrollTop : 0
        });
        if (this.el.bar) { this.el.bar.style.display = 'none'; }
        if (this.el.terminal) { this.el.terminal.style.bottom = '0'; }
      }
      this._programDepth++;
      this.clearOutput();
    }

    exitProgramView() {
      if (this._programDepth <= 0) return;
      this._programDepth--;
      if (this._programDepth === 0) {
        var saved = this._programStack.pop();
        if (saved && this.el.output) {
          this.el.output.innerHTML = saved.output;
          this.el.output.scrollTop = saved.scrollTop;
        }
        if (this.el.bar) { this.el.bar.style.display = 'block'; }
        if (this.el.terminal) { this.el.terminal.style.bottom = '49px'; }
      }
      this.updatePrompt();
      if (this.el.input) setTimeout(function() { this.el.input.focus(); }.bind(this), 50);
    }
    // ════════════════════════════════════════════════════
    //  BUSINESS LOGIC HELPERS (used by VFS and commands)
    // ════════════════════════════════════════════════════

    editPost(id, newText, out) {
      var url = window.EDIT_POST_URL.replace('/0/', '/' + id + '/');
      this.vfsFetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': this.csrfToken(), 'X-Requested-With': 'XMLHttpRequest' },
        body: 'text=' + encodeURIComponent(newText),
      }).then(function(r) {
        if (r.ok || r.status === 201) {
          this.feedData.forEach(function(p) { if (p.id === id) p.text = newText; });
          out('<span class="tp-ok">' + this._('Saved', 'Saved') + '</span>');
        } else { out('<span class="tp-err">' + this._('Save error', 'Save error') + '</span>'); }
      }.bind(this)).catch(function() { out('<span class="tp-err">' + this._('Request failed', 'Request failed') + '</span>'); }.bind(this));
    }

    loadDrafts() {
      try { return JSON.parse(localStorage.getItem('rugram_drafts')) || []; }
      catch(e) { return []; }
    }

    removeDraft(name) {
      var files = this.loadDrafts().filter(function(f) { return f.name !== name; });
      localStorage.setItem('rugram_drafts', JSON.stringify(files));
    }

    loadTrash() {
      try { return JSON.parse(localStorage.getItem('rugram_trash')) || []; }
      catch(e) { return []; }
    }

    removeFromTrash(id) {
      var items = this.loadTrash().filter(function(x) { return x.id !== id; });
      localStorage.setItem('rugram_trash', JSON.stringify(items));
    }

    movePostToTrash(post, out, force) {
      if (force) {
        this.vfsFetch('/delete/' + post.id, { method: 'DELETE', headers: { 'X-CSRFToken': this.csrfToken(), 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
          .then(function(r) {
            if (r.ok) {
              this.feedData = this.feedData.filter(function(p) { return p.id !== post.id; });
              out('<span class="tp-ok">' + this._('Post #', 'Post #') + post.id + ' ' + this._('permanently deleted', 'permanently deleted') + '</span>');
            } else { out('<span class="tp-err">rm: ' + this._('could not delete', 'could not delete') + '</span>'); }
          }.bind(this))
          .catch(function() { out('<span class="tp-err">rm: request failed</span>'); }.bind(this));
        return;
      }
      var trash = this.loadTrash();
      trash.push({ id: post.id, author: post.author, text: post.text, time: post.time, likes: post.likes, image: post.image, original_path: 'posts/' + post.id + '.post', deleted_at: new Date().toISOString() });
      localStorage.setItem('rugram_trash', JSON.stringify(trash));
      this.feedData = this.feedData.filter(function(p) { return p.id !== post.id; });
      out('<span class="tp-ok">' + this._('Post #', 'Post #') + post.id + ' ' + this._('moved to trash', 'moved to trash') + '</span>');
      out('<span class="tp-muted">  # Restore not yet implemented</span>');
    }

    // ════════════════════════════════════════════════════
    //  REMAINING STUBS (attached by other modules)
    // ════════════════════════════════════════════════════
    // These are defined as empty methods but are overridden
    // at runtime by terminal-*.js files and terminal-xterm.js.

    exec() {}
    showCmdHelp() {}
    processCd() {}
    showMatrixRain() {}
    imageToAscii() {}
    cmdPostView() {}
    // Stubs — overridden by terminal-less.js
    enterLessMode() {}
    _exitLessMode() {}
    _renderLess() {}
    _renderLessSearchPrompt() {}
    _lessItemMatches() {}
    _lessRenderItem() {}
    _renderFeedItem() {}
    // Stubs — overridden by terminal-feed.js
    renderFeed() {}
    _feedToggleLike() {}
    _feedToggleSave() {}
    _feedToggleRepost() {}
    _feedRefresh() {}
    _feedFilterByAuthor() {}
  }

  // ── Expose ──
  var T = window.__RT = new Terminal();
  window.toggleTerminal = T.toggleMode;

  // Auto-init
  T.init();
})();
