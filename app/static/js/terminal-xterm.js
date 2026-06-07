// ── Rugram Terminal — xterm.js Integration ──
// Replaces DOM-based rendering with xterm.js canvas terminal.
// Load AFTER terminal.js, terminal-ascii.js, terminal-vfs.js
// Load BEFORE terminal-nano.js, terminal-chat.js, terminal-help.js,
//          terminal-navigation.js, terminal-commands.js
//
// Phase 1: Output rendering + basic input handling.
// Phase 2+: Less-mode, nano, matrix rain, full input.

(function() {
  'use strict';

  var T = window.__RT;
  if (!T) return;

  // ============================================================
  // 1. HTML → ANSI Escape Converter
  // ============================================================

  var RESET = '\x1b[0m';

  var CLASS_TO_ANSI = {
    'tp-prompt':       '\x1b[32m',
    'tp-cmd':          '\x1b[97m',
    'tp-err':          '\x1b[31m',
    'tp-ok':           '\x1b[32m',
    'tp-muted':        '\x1b[2m',
    'tp-desc':         '\x1b[2m',
    'tp-section':      '\x1b[1;33m',
    'tp-post-author':  '\x1b[36m',
    'tp-post-time':    '\x1b[2m',
    'tp-post-id':      '\x1b[2;36m',
    'tp-bold':         '\x1b[1m',
    'tp-active':       '\x1b[1;31m',
    'tp-less-cursor':  '\x1b[1;32m',
    'tp-tag':          '\x1b[36m',
    'tp-sys':          '\x1b[2m',
    'tp-time':         '\x1b[2;33m',
    'tp-notif-badge':  '\x1b[1;31m',
    'tp-spinner':      '\x1b[2m',
    'tp-loading':      '\x1b[2m',
    'tp-output-header': '\x1b[1;33m',
    'tp-neofetch-art': '\x1b[32m',
    'tp-neofetch-info': '\x1b[97m',
    'tp-neofetch-row': '\x1b[0m',
    'tp-feed-text':    '\x1b[0m',
    'tp-feed-actions': '\x1b[2m',
    'tp-feed-spacer':  '\x1b[0m',
    'tp-feed-img':     '\x1b[2m',
    'tp-man-line':     '\x1b[0m',
    'tp-less-current': '',  // handled by prefix
    'tp-less-header':  '',  // handled by content
    'tp-less-footer':  '\x1b[2m',
    'tp-less-search':  '\x1b[0m',
    'tp-ascii-img':    '\x1b[90m',
  };

  // HTML entity → plain char
  function decodeEntities(text) {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  // Strip HTML tags and convert CSS classes to ANSI escape codes.
  // Also removes pre-existing ANSI if any (from nested processing).
  // Handles: <span class="tp-xxx">...</span>, <div ...>, </div>, <br>, <pre>...</pre>
  T._htmlToAnsi = function(html) {
    if (!html) return '';

    var result = '';
    var ansiStack = [];  // stack of active ANSI codes for nesting
    var i = 0;

    while (i < html.length) {
      // <span class="tp-xxx">
      if (html[i] === '<' && html.substring(i, i + 6) === '<span ') {
        var clsMatch = html.substring(i).match(/^<span\s+class="([\w\s-]+)"/);
        if (clsMatch) {
          var classes = clsMatch[1].split(/\s+/);
          var closeIdx = html.indexOf('>', i);
          if (closeIdx >= 0) {
            // Find the first class that has an ANSI mapping
            var ansiCode = '';
            for (var c = 0; c < classes.length; c++) {
              if (CLASS_TO_ANSI[classes[c]]) {
                ansiCode = CLASS_TO_ANSI[classes[c]];
                break;
              }
            }
            if (ansiCode) {
              ansiStack.push(ansiCode);
              result += ansiCode;
            }
            i = closeIdx + 1;
            continue;
          }
        }
        // Unknown span — skip the opening tag
        var spanEnd = html.indexOf('>', i);
        if (spanEnd >= 0) { i = spanEnd + 1; continue; }
      }

      // </span>
      if (html[i] === '<' && html.substring(i, i + 7) === '</span>') {
        if (ansiStack.length > 0) {
          ansiStack.pop();
          result += RESET;
          // Re-apply remaining stack (for nested spans)
          for (var s = 0; s < ansiStack.length; s++) {
            result += ansiStack[s];
          }
        } else {
          result += RESET;
        }
        i += 7;
        continue;
      }

      // <div ...> or class="..." attributes — skip entire opening tag
      if (html[i] === '<') {
        var tagEnd = html.indexOf('>', i);
        if (tagEnd >= 0) {
          // Check if it's a closing div
          var tagContent = html.substring(i + 1, tagEnd);
          // Check for self-closing or closing tags
          if (tagContent.indexOf('/') >= 0 && tagContent.length < 10) {
            // closing tag like </div>, </pre>
            i = tagEnd + 1;
            continue;
          }
          if (tagContent.startsWith('div') || tagContent.startsWith('/div') ||
              tagContent.indexOf('tp-') >= 0 || tagContent.startsWith('pre')) {
            i = tagEnd + 1;
            continue;
          }
        }
      }

      // <br> or <br/>
      if (html[i] === '<' && (html.substring(i, i + 4) === '<br>' || html.substring(i, i + 5) === '<br/>' || html.substring(i, i + 6) === '<br />')) {
        result += '\r\n';
        i += (html[i + 3] === '/' ? 5 : html[i + 4] === '/' ? 6 : 4);
        continue;
      }

      // <pre> ... </pre> — pass through (ascii art)
      if (html[i] === '<' && html.substring(i, i + 5) === '<pre>') {
        i += 5;
        var preEnd = html.indexOf('</pre>', i);
        if (preEnd >= 0) {
          result += html.substring(i, preEnd);
          i = preEnd + 6;
          continue;
        }
      }

      // &nbsp; and other entities inside text
      if (html[i] === '&') {
        var semi = html.indexOf(';', i);
        if (semi >= 0 && semi - i < 12) {
          result += decodeEntities(html.substring(i, semi + 1));
          i = semi + 1;
          continue;
        }
      }

      // Normal character
      result += html[i];
      i++;
    }

    // Close any unclosed ANSI
    if (ansiStack.length > 0) {
      result += RESET;
    }

    return result;
  };

  // ============================================================
  // 2. xterm.js Instance + State
  // ============================================================

  var term = null;
  var fitAddon = null;
  var xtermContainer = null;

  // Input state
  T._xterm = null;          // xterm.js Terminal instance (set on init)
  T._xtermReady = false;    // true after init
  T._inputLine = '';        // current input buffer
  T._inputCursor = 0;       // cursor position within input
  T._promptText = '';       // current prompt text (without ANSI)

  // Reverse search state (in-xterm version)
  T._xtermReverseActive = false;
  T._xtermReverseQuery = '';

  // ============================================================
  // 3. Prompt & Input Rendering
  // ============================================================

  // Redraw the input line at cursor position.
  // Uses \r to go to start of line, \x1b[K to clear, then rewrites.
  function renderInputLine() {
    if (!term || !T._xtermReady) return;

    var prompt = T._promptText ? '\x1b[32m' + T._promptText + RESET + ' ' : '';
    var input = T._inputLine;

    // Replace newlines in input with visible indicator
    input = input.replace(/\n/g, '\\n');

    // Carriage return + clear line + prompt + input
    term.write('\r\x1b[K' + prompt + input);

    // Position cursor within input
    var cursorOffset = input.length - T._inputCursor;
    if (cursorOffset > 0) {
      term.write('\x1b[' + cursorOffset + 'D');
    }
  }

  // Write prompt and input on a NEW line (after output)
  function writePromptLine() {
    if (!term || !T._xtermReady) return;
    // NOTE: cursor is ALREADY on a new line before calling this function
    // (preceded by term.writeln() or buffer content ending in \r\n).
    // Do NOT add \r\n here — it would create an extra blank line.
    var prompt = T._promptText ? '\x1b[32m' + T._promptText + RESET + ' ' : '';
    term.write(prompt + T._inputLine);
    // Position cursor if needed
    var cursorOffset = T._inputLine.length - T._inputCursor;
    if (cursorOffset > 0) {
      term.write('\x1b[' + cursorOffset + 'D');
    }
    if (!T._xtermInLessMode) term.scrollToBottom();
  }

  // ============================================================
  // 4. Output Overrides
  // ============================================================

  // Less-mode flag: when true, clearOutput uses \x1b[H\x1b[J instead of term.clear()
  // This avoids flicker during less re-renders
  T._xtermInLessMode = false;

  // Override: addOutput — write ANSI to xterm
  T.addOutput = function(html) {
    if (!term || !T._xtermReady) return;
    var ansi = T._htmlToAnsi(html);
    term.write(ansi);
    if (!T._xtermInLessMode) term.scrollToBottom();
  };

  // Override: addOutputLine — write ANSI to xterm
  T.addOutputLine = function(html) {
    if (!term || !T._xtermReady) return;
    var ansi = T._htmlToAnsi(html);
    term.writeln(ansi);
    if (!T._xtermInLessMode) term.scrollToBottom();
  };

  // Override: clearOutput — clear xterm display
  T.clearOutput = function() {
    if (term && T._xtermReady && term.buffer.active.length > 0) {
      term.write('\r\n\x1b[H\x1b[J');
    }
  };

  // Override: enterLessMode — set xterm flag for flicker-free rendering
  var _lessModeEnter = T.enterLessMode;
  T.enterLessMode = function(items, title, onEnter, type) {
    T._xtermInLessMode = true;
    _lessModeEnter.call(T, items, title, onEnter, type);
  };

  // Override: _exitLessMode — clear xterm flag
  var _lessModeExit = T._exitLessMode;
  T._exitLessMode = function() {
    T._xtermInLessMode = false;
    _lessModeExit.call(T);
  };

  // Override: addSysLine (timestamp + text)
  T.addSysLine = function(text) {
    if (!term || !T._xtermReady) return;
    var time = T.sysTime();
    var ansi = '\x1b[2m[\x1b[2;33m' + time + '\x1b[2m]\x1b[0m' + T._htmlToAnsi(text);
    term.writeln(ansi);
  };

  // Override: showLoading
  T.showLoading = function(msg) {
    if (!term || !T._xtermReady) return;
    term.write('\r\x1b[2m' + (msg || 'Processing') + '...\x1b[0m');
  };

  // Override: hideLoading
  T.hideLoading = function() {
    if (!term || !T._xtermReady) return;
    term.write('\r\x1b[K');
  };

  // Override: updatePrompt (called by existing code)
  T.updatePrompt = function() {
    if (T._xtermReady) {
      var user = T.username || 'guest';
      var dir = T.cwd ? '~/' + T.cwd : '~';
      T._promptText = user + '@tty:' + dir + '$';
    }
  };

  // Override: renderFeed — map to ANSI for feed command
  T.renderFeed = function(posts) {
    if (!term || !T._xtermReady) return;

    // ANSI version
    var list = posts || T.feedData;
    var header = '\x1b[1;33m-- /feed -- (' + list.length + ' posts)\x1b[0m';
    term.writeln(header);

    if (!list.length) {
      term.writeln('\x1b[2m  feed: empty\x1b[0m');
      term.writeln('\x1b[2m  # \x1b[97mcreate\x1b[2m to write a new post\x1b[0m');
      return;
    }

    list.forEach(function(p) {
      var timeDisplay = p.time && p.time.indexOf('T') > 0 ? T.relTime(p.time) : (p.time || '');
      var line = '  #' + p.id + '  \x1b[36m@' + T.escapeHtml(p.author) + '\x1b[0m  \x1b[2m' + T.escapeHtml(timeDisplay) + '\x1b[0m';
      term.writeln(line);

      var textLine = '  ' + T.escapeHtml((p.text || '').substring(0, 200));
      term.writeln(textLine);

      if (p.image) {
        term.writeln('  \x1b[2m[img]\x1b[0m');
      }

      var liked = p.liked ? '\x1b[32m+\x1b[0m' : '\x1b[2m-\x1b[0m';
      var actionLine = '  ' + liked + ' ' + p.likes + '  c:' + p.comments + '  #' + p.id;
      term.writeln(actionLine);
    });

    term.writeln('\x1b[2m[' + T.sysTime() + ']\x1b[0m\x1b[2m ' + list.length + ' post(s) · page 1\x1b[0m');
  };

  // ============================================================
  // 5. Input Handling (term.onKey)
  // ============================================================

  // Build replacement for T.onInputKey that works with xterm.js
  // Called from term.onKey for ALL keys.

  T._xtermOnKey = function(e) {
    var key = e.key;
    var ev = e.domEvent;

    // ── Reverse search mode (active) ──
    if (T._xtermReverseActive) {
      if (key === '\r') { // Enter — submit matched command
        ev.preventDefault();
        var matchedCmd = T._inputLine;
        T._xtermReverseActive = false;
        T._xtermReverseQuery = '';
        term.writeln(''); // newline after search line
        if (matchedCmd.trim()) {
          // Show the command being executed
          term.writeln('\x1b[32m' + T._xtermPromptText() + RESET + ' ' + matchedCmd);
          T.processCommand(matchedCmd.trim());
        }
        T._inputLine = '';
        T._inputCursor = 0;
        writePromptLine();
        return;
      }
      if (key === '\x1b' || key === '\x03') { // Escape / Ctrl+C — cancel
        ev.preventDefault();
        T._xtermReverseActive = false;
        T._xtermReverseQuery = '';
        T._inputLine = '';
        T._inputCursor = 0;
        term.writeln('');
        writePromptLine();
        return;
      }
      if (key === '\x7f') { // Backspace
        ev.preventDefault();
        T._xtermReverseQuery = T._xtermReverseQuery.slice(0, -1);
        // Search and update
        _xtermReverseSearch();
        return;
      }
      if (key === '\x12') { // Ctrl+R again — cycle
        ev.preventDefault();
        if (T._xtermReverseQuery) {
          _xtermReverseCycle();
        }
        return;
      }
      if (key.length === 1) { // Printable char
        ev.preventDefault();
        T._xtermReverseQuery += key;
        _xtermReverseSearch();
        return;
      }
      ev.preventDefault();
      return;
    }

    // ── Ctrl+C — interrupt ──
    if (key === '\x03') {
      ev.preventDefault();
      T._cancelCommand();
      term.writeln('\x1b[2m^C\x1b[0m');
      T._inputLine = '';
      T._inputCursor = 0;
      writePromptLine();
      return;
    }

    // ── Ctrl+R — reverse search ──
    if (key === '\x12') {
      ev.preventDefault();
      T._xtermReverseActive = true;
      T._xtermReverseQuery = '';
      T._inputLine = '';
      T._inputCursor = 0;
      // Show search prompt on a new line
      term.writeln('');
      term.write('\x1b[2m(reverse-i-search)`\'\x1b[0m');
      return;
    }

    // ── Ctrl+L — clear ──
    if (key === '\x0c') {
      ev.preventDefault();
      T.clearOutput();
      writePromptLine();
      return;
    }

    // ── Tab — autocomplete ──
    if (key === '\x09') {
      ev.preventDefault();
      _xtermTabComplete();
      return;
    }

    // ── Enter — submit ──
    if (key === '\r') {
      ev.preventDefault();
      var cmd = T._inputLine.trim();
      if (cmd) {
        // Move cursor past the prompt line (already showing the typed command)
        term.writeln('');
        var promptStr = '\x1b[32m' + T._xtermPromptText() + RESET + ' ' + cmd;
        // Pass writePromptLine as onComplete — for sync commands it runs after dispatch,
        // for async commands (ping/watch/top) they consume the callback and run it when done.
        T.processCommand(cmd, function() {
          T._inputLine = '';
          T._inputCursor = 0;
          writePromptLine();
        });
      } else {
        // Empty command — new prompt
        term.writeln('');
        T._inputLine = '';
        T._inputCursor = 0;
        writePromptLine();
      }
      return;
    }

    // ── Backspace ──
    if (key === '\x7f') {
      ev.preventDefault();
      if (T._inputCursor > 0) {
        T._inputLine = T._inputLine.slice(0, T._inputCursor - 1) + T._inputLine.slice(T._inputCursor);
        T._inputCursor--;
        renderInputLine();
      }
      return;
    }

    // ── ArrowUp — history back ──
    if (key === '\x1b[A') {
      ev.preventDefault();
      if (T.historyIdx > 0) {
        T.historyIdx--;
        T._inputLine = T.commandHistory[T.historyIdx];
        T._inputCursor = T._inputLine.length;
        renderInputLine();
      }
      return;
    }

    // ── ArrowDown — history forward ──
    if (key === '\x1b[B') {
      ev.preventDefault();
      if (T.historyIdx < T.commandHistory.length - 1) {
        T.historyIdx++;
        T._inputLine = T.commandHistory[T.historyIdx];
      } else {
        T.historyIdx = T.commandHistory.length;
        T._inputLine = '';
      }
      T._inputCursor = T._inputLine.length;
      renderInputLine();
      return;
    }

    // ── ArrowLeft — cursor left ──
    if (key === '\x1b[D') {
      ev.preventDefault();
      if (T._inputCursor > 0) {
        T._inputCursor--;
        term.write('\x1b[D'); // move cursor left in terminal
      }
      return;
    }

    // ── ArrowRight — cursor right ──
    if (key === '\x1b[C') {
      ev.preventDefault();
      if (T._inputCursor < T._inputLine.length) {
        T._inputCursor++;
        term.write('\x1b[C'); // move cursor right in terminal
      }
      return;
    }

    // ── Home — beginning of line ──
    if (key === '\x1b[H' || key === '\x1b[1~') {
      ev.preventDefault();
      T._inputCursor = 0;
      renderInputLine();
      return;
    }

    // ── End — end of line ──
    if (key === '\x1b[F' || key === '\x1b[4~') {
      ev.preventDefault();
      T._inputCursor = T._inputLine.length;
      renderInputLine();
      return;
    }

    // ── Delete (Del) — delete char at cursor ──
    if (key === '\x1b[3~') {
      ev.preventDefault();
      if (T._inputCursor < T._inputLine.length) {
        T._inputLine = T._inputLine.slice(0, T._inputCursor) + T._inputLine.slice(T._inputCursor + 1);
        renderInputLine();
      }
      return;
    }

    // ── PgUp / PgDn — scroll viewport ──
    if (key === '\x1b[5~') {
      ev.preventDefault();
      if (term) term.scrollPages(-1);
      return;
    }
    if (key === '\x1b[6~') {
      ev.preventDefault();
      if (term) term.scrollToBottom();
      return;
    }
    if (key === '\x1b[5;2~') { ev.preventDefault(); if (term) term.scrollToLine(0); return; }  // Shift+PgUp — top
    if (key === '\x1b[6;2~') { ev.preventDefault(); if (term) term.scrollToBottom(); return; } // Shift+PgDn — bottom

    // ── Ctrl+U — delete entire line ──
    if (key === '\x15') {
      ev.preventDefault();
      T._inputLine = '';
      T._inputCursor = 0;
      renderInputLine();
      return;
    }

    // ── Ctrl+W — delete word before cursor ──
    if (key === '\x17') {
      ev.preventDefault();
      if (T._inputCursor > 0) {
        // Find word boundary
        var i = T._inputCursor - 1;
        while (i >= 0 && T._inputLine[i] === ' ') i--;
        while (i >= 0 && T._inputLine[i] !== ' ') i--;
        i++; // first char to delete
        T._inputLine = T._inputLine.slice(0, i) + T._inputLine.slice(T._inputCursor);
        T._inputCursor = i;
        renderInputLine();
      }
      return;
    }

    // ── Ctrl+K — delete to end of line ──
    if (key === '\x0b') {
      ev.preventDefault();
      T._inputLine = T._inputLine.slice(0, T._inputCursor);
      renderInputLine();
      return;
    }

    // ── Ctrl+A — beginning of line ──
    if (key === '\x01') {
      ev.preventDefault();
      T._inputCursor = 0;
      renderInputLine();
      return;
    }

    // ── Ctrl+E — end of line ──
    if (key === '\x05') {
      ev.preventDefault();
      T._inputCursor = T._inputLine.length;
      renderInputLine();
      return;
    }

    // ── Printable character ──
    if (key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      T._inputLine = T._inputLine.slice(0, T._inputCursor) + key + T._inputLine.slice(T._inputCursor);
      T._inputCursor++;
      renderInputLine();
      return;
    }

    // ── Alt+← / Alt+→ — word movement ──
    if (key === '\x1bb') { // Alt+Left in some terminals
      ev.preventDefault();
      _xtermCursorPrevWord();
      return;
    }
    if (key === '\x1bf') { // Alt+Right in some terminals
      ev.preventDefault();
      _xtermCursorNextWord();
      return;
    }
  };

  // ── Prompt text helper ──
  T._xtermPromptText = function() {
    var user = T.username || 'guest';
    var dir = T.cwd ? '~/' + T.cwd : '~';
    return user + '@tty:' + dir + '$';
  };

  // ── Tab completion ──
  function _xtermTabComplete() {
    var input = T._inputLine.trim();
    if (!input) return;

    var words = input.split(/\s+/);
    var partial = words[0].toLowerCase();
    var candidates = [];
    var navCmds = { cd: 1, ls: 1, cat: 1, nano: 1, rm: 1 };

    if (words.length === 1) {
      // Complete command name
      var names = Object.keys(T.registry);
      for (var i = 0; i < names.length; i++) {
        if (names[i].toLowerCase().startsWith(partial)) {
          candidates.push(names[i]);
        }
      }
    } else if (navCmds[partial] && words.length === 2) {
      // Complete VFS path
      candidates = T._completeVFSPath(words[1], T.cwd);
    } else {
      // Complete @username
      if (words[1] && words[1].startsWith('@')) {
        var userPartial = words[1].toLowerCase().replace('@', '');
        (T.feedData || []).forEach(function(p) {
          if (p.author.toLowerCase().startsWith(userPartial)) {
            var at = '@' + p.author;
            if (candidates.indexOf(at) < 0) candidates.push(at);
          }
        });
      }
    }

    if (candidates.length === 0) {
      // Beep
      term.write('\x07');
      return;
    }

    if (candidates.length === 1) {
      if (words.length >= 2 && navCmds[partial]) {
        words[words.length - 1] = candidates[0];
        T._inputLine = words.join(' ') + ' ';
      } else {
        words[0] = candidates[0];
        T._inputLine = words.join(' ') + ' ';
      }
      T._inputCursor = T._inputLine.length;
      renderInputLine();
    } else {
      // Show candidates in output
      term.writeln('');
      term.writeln('\x1b[2m' + candidates.join('  ') + '\x1b[0m');
      writePromptLine();
    }
  }

  // ── Reverse search ──
  function _xtermReverseSearch() {
    var q = T._xtermReverseQuery.toLowerCase();
    if (!q) {
      T._inputLine = '';
      T._inputCursor = 0;
      term.write('\r\x1b[K\x1b[2m(reverse-i-search)`\'\x1b[0m');
      return;
    }
    var found = false;
    for (var i = T.commandHistory.length - 1; i >= 0; i--) {
      if (T.commandHistory[i].toLowerCase().indexOf(q) >= 0) {
        T._inputLine = T.commandHistory[i];
        T._inputCursor = T._inputLine.length;
        found = true;
        break;
      }
    }
    if (found) {
      term.write('\r\x1b[K\x1b[2m(reverse-i-search)`\x1b[0m' + q + '\x1b[2m\'\x1b[0m: ' + T._inputLine);
    } else {
      T._inputLine = '';
      T._inputCursor = 0;
      term.write('\r\x1b[K\x1b[2m(reverse-i-search)`\x1b[31m' + q + '\x1b[2m\'\x1b[0m: \x1b[31m(failed reverse-i-search)\x1b[0m');
    }
  }

  function _xtermReverseCycle() {
    var q = T._xtermReverseQuery.toLowerCase();
    if (!q) return;
    var currentIdx = T.commandHistory.indexOf(T._inputLine);
    if (currentIdx < 0) currentIdx = T.commandHistory.length;
    var found = false;
    for (var i = currentIdx - 1; i >= 0; i--) {
      if (T.commandHistory[i].toLowerCase().indexOf(q) >= 0) {
        T._inputLine = T.commandHistory[i];
        T._inputCursor = T._inputLine.length;
        found = true;
        break;
      }
    }
    if (found) {
      term.write('\r\x1b[K\x1b[2m(reverse-i-search)`\x1b[0m' + q + '\x1b[2m\'\x1b[0m: ' + T._inputLine);
    }
  }

  // ── Word navigation helpers ──
  function _xtermCursorPrevWord() {
    if (T._inputCursor <= 0) return;
    var i = T._inputCursor - 1;
    // Skip spaces
    while (i >= 0 && T._inputLine[i] === ' ') i--;
    // Skip word
    while (i >= 0 && T._inputLine[i] !== ' ') i--;
    T._inputCursor = i + 1;
    renderInputLine();
  }

  function _xtermCursorNextWord() {
    if (T._inputCursor >= T._inputLine.length) return;
    var i = T._inputCursor;
    // Skip current word
    while (i < T._inputLine.length && T._inputLine[i] !== ' ') i++;
    // Skip spaces
    while (i < T._inputLine.length && T._inputLine[i] === ' ') i++;
    T._inputCursor = i;
    renderInputLine();
  }

  // ============================================================
  // 6. Program View Stack (save/restore xterm buffer)
  // ============================================================

  // Program view save/restore — captures xterm buffer content on enter,
  // restores plain text on exit (color is cosmetic, content is preserved).
  var _origEnterProgramView = T.enterProgramView;
  var _origExitProgramView = T.exitProgramView;
  T.enterProgramView = function() {
    if (T._xtermReady && term) {
      // Snapshot current xterm buffer lines as plain text
      var lines = [];
      var buf = term.buffer.active;
      var startRow = Math.max(0, buf.length - 500); // max 500 lines to save
      for (var i = startRow; i < buf.length; i++) {
        var line = buf.getLine(i);
        if (line) {
          var text = line.translateToString();
          // Skip trailing empty lines for compact save
          if (text.trim() || lines.length > 0) {
            lines.push(text);
          }
        }
      }
      T._xtermBufferSnapshot = lines;
    }
    // Call original DOM-based enter too (for non-xterm fallback)
    _origEnterProgramView.call(T);
    if (T._xtermReady && term) {
      term.write('\x1b[H\x1b[J'); // clear screen for program
    }
  };

  T.exitProgramView = function() {
    _origExitProgramView.call(T);
    if (T._xtermReady && term && T._xtermBufferSnapshot) {
      // Restore saved lines as plain text (xterm buffer was cleared by program)
      term.write('\x1b[H\x1b[J'); // clear program content
      for (var i = 0; i < T._xtermBufferSnapshot.length; i++) {
        term.writeln(T._xtermBufferSnapshot[i]);
      }
      T._xtermBufferSnapshot = null;
      writePromptLine();
    }
  };

  // ============================================================
  // 7. Matrix Rain (xterm version)
  // ============================================================

  T.showMatrixRain = function(callback) {
    if (!term || !T._xtermReady) return;

    // Full-screen matrix rain using ANSI cursor control
    var cols = Math.min(term.cols || 80, 120);
    var rows = Math.min(term.rows || 25, 20);
    var drops = [];
    for (var i = 0; i < cols; i++) {
      drops[i] = Math.floor(Math.random() * rows * 2);
    }

    var frame = 0;
    var interval = setInterval(function() {
      var out = '\x1b[H';  // cursor home (top-left)
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var ch = String.fromCharCode(0x30A0 + Math.random() * 96);
          var dropPos = drops[c];
          var dist = Math.abs(r - dropPos);
          var color;
          if (dist === 0) color = '\x1b[38;5;46m';     // bright green (head)
          else if (dist < 4) color = '\x1b[32m';        // green (tail)
          else color = '\x1b[2m';                        // dim (fade)
          out += color + ch + '\x1b[0m';
        }
        out += '\r\n';
      }
      term.write(out);

      for (var i = 0; i < drops.length; i++) {
        if (drops[i] > rows + 5) drops[i] = 0;
        if (Math.random() > 0.97) drops[i] = 0;
        drops[i]++;
      }

      frame++;
      if (frame > 35) {
        clearInterval(interval);
        term.write('\x1b[H\x1b[J');  // clear entire screen
        if (callback) callback();
      }
    }, 55);
  };

  // ============================================================
  // 8. Boot Screen (ANSI version)
  // ============================================================

  T._bootContent = function() {
    if (!term || !T._xtermReady) return;

    // Don't clear on first boot — terminal is already fresh.
    // call term.reset() here only if you want full wipe.

    // ANSI art logo
    var logo = '';
    logo += '\x1b[36m';
    logo += '  █████     █    █     █████    █████      █████    █     ██  \r\n';
    logo += '  █    █    █    █    █         █    █    █    █    ██   ██   \r\n';
    logo += '  █████     █    █    █  ████   █████     ██████    █ █ █ █   \r\n';
    logo += '  █   █     █    █    █    █    █   █     █    █    █  █  █   \r\n';
    logo += '  █    █     ██████    █████    █    █    █    █    █     █   \r\n';
    logo += '\x1b[0m';
    term.writeln(logo);

    var lastLogin = localStorage.getItem('rugram_last_login');
    if (lastLogin) {
      term.writeln('\x1b[2mLast login: ' + lastLogin + '\x1b[0m');
    }

    term.writeln('');

    var welcome = '\x1b[1;33mWelcome to Rugram Terminal v' + T.APP_VERSION + '\x1b[0m';
    term.writeln(welcome);

    var userLabel = T.isLoggedIn ? '@' + T.username : 'guest \x1b[2m(not logged in)\x1b[0m';
    var server = '\x1b[2mServer: ' + window.location.host + '  |  User: ' + userLabel + '\x1b[0m';
    term.writeln(server);

    term.writeln('');

    var unread = typeof T.unreadNotifs !== 'undefined' ? T.unreadNotifs : 0;
    if (unread > 0) {
      term.writeln('You have \x1b[32m' + unread + ' unread notification' + (unread > 1 ? 's' : '') + '\x1b[0m');
    }

    var feedCount = T.feedData.length || '0';
    term.writeln('\x1b[2m' + feedCount + ' posts in feed\x1b[0m');

    term.writeln('');

    if (T.isLoggedIn) {
      term.writeln('\x1b[2m# \x1b[97mhelp\x1b[2m — all commands  |  \x1b[97mfeed\x1b[2m — browse feed  |  \x1b[97msaved\x1b[2m — saved posts  |  \x1b[97mchat\x1b[2m — messages\x1b[0m');
    } else {
      term.writeln('\x1b[2m# \x1b[97mhelp\x1b[2m — all commands  |  \x1b[97mfeed\x1b[2m — browse feed  |  \x1b[97mlogin\x1b[2m — sign in  |  \x1b[97mregister\x1b[2m — create account\x1b[0m');
    }

    term.writeln('');

    writePromptLine();

    localStorage.setItem('rugram_last_login', new Date().toDateString() + ' ' + new Date().toLocaleTimeString());
  };

  // ============================================================
  // 9. Init / Teardown
  // ============================================================

  T._xtermInit = function() {
    // Find container
    xtermContainer = document.getElementById('xterm-container');
    if (!xtermContainer) return;

    // Build prompt text
    T._promptText = T._xtermPromptText();

    // Create xterm.js instance
    term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      cursorWidth: 1,
      scrollback: 2000,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      lineHeight: 1.2,
      letterSpacing: 0,
      allowTransparency: false,
      rows: 30,
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        cursorAccent: '#1e1e2e',
        selectionBackground: '#585b70',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#cdd6f4',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#f5c2e7',
        brightCyan: '#94e2d5',
        brightWhite: '#bac2de',
      }
    });

    // Fit addon — unwrap from UMD module if needed ({Addon: class} → class)
    var FitAddonCtor = typeof FitAddon === 'function' ? FitAddon : (FitAddon.FitAddon || FitAddon.default);
    fitAddon = new FitAddonCtor();
    term.loadAddon(fitAddon);

    // WebGL addon disabled — causes blank canvas in some environments.
    // Default canvas (2D) renderer is stable and sufficient.

    // Open terminal
    term.open(xtermContainer);

    // Fit to container size
    try { fitAddon.fit(); } catch(e) {}

    // Mark as ready
    T._xterm = term;
    T._xtermReady = true;

    // No termBar in tty mode — remove the 49px bottom gap from CSS
    if (T.el && T.el.terminal) {
      T.el.terminal.style.bottom = '0';
    }

    // Click handler for #tags
    var xtermElement = term.element;
    if (xtermElement) {
      xtermElement.addEventListener('click', function(e) {
        if (T._lessActive) return; // less mode has its own click handling
        try {
          var rect = xtermElement.getBoundingClientRect();
          var x = e.clientX - rect.left;
          var y = e.clientY - rect.top;
          var dims = term._core._renderService.dimensions;
          if (!dims || !dims.actualCellWidth || !dims.actualCellHeight) return;
          var col = Math.floor(x / dims.actualCellWidth);
          var row = Math.floor(y / dims.actualCellHeight);
          var line = term.buffer.active.getLine(row);
          if (!line) return;
          var lineStr = line.translateToString();
          if (col >= lineStr.length) return;
          // Find word boundaries around click position
          var start = col;
          while (start > 0 && lineStr[start - 1] !== ' ') start--;
          var end = col;
          while (end < lineStr.length && lineStr[end] !== ' ') end++;
          var word = lineStr.substring(start, end);
          // Check for #tag (not ## or ###, just #word)
          if (word.length > 1 && word[0] === '#' && word[1] !== '#') {
            e.preventDefault();
            var tag = word.substring(1);
            T.processCommand('feed --tag ' + tag);
          }
        } catch(_) { /* silently fail */ }
      });
    }

    // Override resize
    window.addEventListener('resize', function() {
      if (fitAddon) {
        try { fitAddon.fit(); } catch(e) {}
      }
    });

    // BLOCK xterm from processing keys natively (prevents duplicate writes).
    // We handle all input via a direct listener on the xterm textarea.
    term.attachCustomKeyEventHandler(function(e) {
      return false;
    });

    // Direct DOM listener on xterm textarea — bypasses xterm's native key handling.
    var _textarea = term.textarea;
    if (_textarea) {
      _textarea.addEventListener('keydown', function _onTermKey(e) {
        // Normalize DOM key to xterm key format
        var key;
        if (e.ctrlKey && e.key !== 'Control' && e.key !== 'Shift' && e.key !== 'Alt' && e.key !== 'Meta') {
          var code = e.key.toLowerCase().charCodeAt(0) - 96;
          if (code >= 1 && code <= 26) key = String.fromCharCode(code);
        }
        if (!key) {
          switch (e.key) {
            case 'Enter': key = '\r'; break;
            case 'Backspace': key = '\x7f'; break;
            case 'Tab': key = '\x09'; break;
            case 'Escape': key = '\x1b'; break;
            case 'ArrowUp': key = '\x1b[A'; break;
            case 'ArrowDown': key = '\x1b[B'; break;
            case 'ArrowLeft': key = '\x1b[D'; break;
            case 'ArrowRight': key = '\x1b[C'; break;
            case 'Home': key = '\x1b[H'; break;
            case 'End': key = '\x1b[F'; break;
            case 'Delete': key = '\x1b[3~'; break;
            case 'PageUp': key = '\x1b[5~'; break;
            case 'PageDown': key = '\x1b[6~'; break;
            default:
              if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) key = e.key;
          }
        }
        if (key) {
          T._xtermOnKey({key: key, domEvent: e});
          e.preventDefault();
        }
      });
      // Fallback: capture characters that keydown misses (IME, Russian layout, etc.)
      _textarea.addEventListener('input', function _onTermInput(e) {
        if (T._xterm && e.data && e.data.length === 1) {
          var lastChar = e.data;
          // Only forward if not handled by keydown (keydown would have already appended it)
          // Check if inputLine didn't change (meaning keydown didn't fire)
          var prevLen = T._inputLine.length;
          T._xtermOnKey({key: lastChar, domEvent: e});
          // keydown handler calls e.preventDefault() which suppresses input event,
          // so this only fires for IME/composition where preventDefault doesn't apply.
        }
      });
    }

    // Focus terminal
    setTimeout(function() { term.focus(); }, 100);

    // Custom mouse wheel scrolling (DOM renderer doesn't expose scrollHeight)
    var _wheelHandler = function(e) {
      if (e.deltaY < 0) {
        term.scrollPages(-1);
      } else {
        if (term.buffer.active.viewportY >= term.buffer.active.baseY) {
          term.scrollToBottom();
        } else {
          term.scrollPages(1);
        }
      }
      e.preventDefault();
    };
    if (xtermElement) {
      xtermElement.addEventListener('wheel', _wheelHandler, { passive: false });
    }

    // Handle paste
    term.onData(function(data) {
      // Multi-character paste (more than one char and not escape sequences)
      if (data.length > 2 && data.indexOf('\x1b') === -1) {
        T._inputLine = T._inputLine.slice(0, T._inputCursor) + data + T._inputLine.slice(T._inputCursor);
        T._inputCursor += data.length;
        renderInputLine();
      }
    });

    // Show boot screen after init
    if (!T.bootShown) {
      T.showBootScreen();
    }
  };

  // ── Override setMode to init xterm on first tty entry ──
  var _modeSwitcher = T.setMode;
  T.setMode = function(newMode) {
    if (newMode === 'tty' && !T._xtermReady) {
      T._xtermInit();
    }
    _modeSwitcher.call(T, newMode);
  };

  // ── Override toggleMode ──
  T.toggleMode = function() {
    T.setMode(T.mode === 'gui' ? 'tty' : 'gui');
  };

  // ── Garbage collection ──
  var _origOnUnload = window.onunload;
  window.onunload = function() {
    if (term) {
      term.dispose();
      term = null;
    }
    T._xtermReady = false;
    if (_origOnUnload) _origOnUnload();
  };

})();
