// ── Rugram Terminal — Interactive Pager (less) ──
// Extracted from terminal.js core. Provides enter/exit/render/search for
// the less-mode pager used by feed, saved, notifications, and generic item lists.
(function(T) {
  'use strict';

  // ════════════════════════════════════════════
  //  INTERACTIVE PAGER (less)
  // ════════════════════════════════════════════

  T.enterLessMode = function(items, title, onEnter, type) {
    this._lessActive = true;
    this._lessItems = items;
    this._lessTitle = title || 'feed';
    this._lessType = type || 'generic';
    this._lessPos = 0;
    this._lessSearchQuery = '';
    this._lessSearchResults = [];
    this._lessFilteredItems = items;
    this._lessOnEnter = onEnter || null;
    if (this._lessType === 'feed') {
      items.forEach(function(it) {
        if (it._asciiArt !== undefined) delete it._asciiArt;
        if (it._asciiConverting !== undefined) delete it._asciiConverting;
      });
    }
    var lineH = this._lessType === 'feed' ? 80 : 20;
    this._lessPerPage = Math.max(3, Math.floor(((this.el.output && this.el.output.clientHeight) || 400) / lineH));
    this.enterProgramView();
    this._renderLess();
    if (this.el.input) this.el.input.blur();

    this._lessKeyHandler = function(e) {
      if (!this._lessActive) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'q' || e.key === 'Q') { this._exitLessMode(); e.preventDefault(); return; }
      if (e.key === 'j' || e.key === 'ArrowDown') {
        this._lessPos = Math.min(this._lessPos + 1, this._lessFilteredItems.length - 1);
        this._renderLess(); e.preventDefault(); return;
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        this._lessPos = Math.max(this._lessPos - 1, 0);
        this._renderLess(); e.preventDefault(); return;
      }
      if (e.key === ' ' || e.key === 'PageDown') {
        this._lessPos = Math.min(this._lessPos + this._lessPerPage, this._lessFilteredItems.length - 1);
        this._renderLess(); e.preventDefault(); return;
      }
      if (e.key === 'PageUp') {
        this._lessPos = Math.max(this._lessPos - this._lessPerPage, 0);
        this._renderLess(); e.preventDefault(); return;
      }
      if (e.key === 'g' && !e.shiftKey && !e.ctrlKey) {
        if (this._lessGPress) { this._lessPos = 0; this._renderLess(); this._lessGPress = false; e.preventDefault(); return; }
        this._lessGPress = true; setTimeout(function() { this._lessGPress = false; }.bind(this), 500); e.preventDefault(); return;
      }
      if (e.key === 'G' || (e.key === 'g' && e.shiftKey)) {
        this._lessPos = Math.max(0, this._lessFilteredItems.length - 1);
        this._renderLess(); e.preventDefault(); return;
      }
      if (e.key === '/') { this._lessSearchQuery = ''; this._renderLessSearchPrompt(); e.preventDefault(); return; }
      if (e.key === 'n' && this._lessSearchQuery) {
        var idx = -1;
        for (var i = this._lessPos + 1; i < this._lessFilteredItems.length; i++) {
          if (this._lessItemMatches(this._lessFilteredItems[i], this._lessSearchQuery)) { idx = i; break; }
        }
        if (idx >= 0) { this._lessPos = idx; this._renderLess(); }
        e.preventDefault(); return;
      }
      if (e.key === 'N' && this._lessSearchQuery) {
        var idx = -1;
        for (var i = this._lessPos - 1; i >= 0; i--) {
          if (this._lessItemMatches(this._lessFilteredItems[i], this._lessSearchQuery)) { idx = i; break; }
        }
        if (idx >= 0) { this._lessPos = idx; this._renderLess(); }
        e.preventDefault(); return;
      }
      if (e.key === 'Enter') {
        var item = this._lessFilteredItems[this._lessPos];
        if (item && this._lessOnEnter) { this._lessOnEnter(item); }
        else if (item && item.id) { this._exitLessMode(); this.cmdPostView(item.id); }
        e.preventDefault(); return;
      }
      if (this._lessType === 'feed') {
        var cur = this._lessFilteredItems[this._lessPos];
        if (e.key === 'l' && cur && cur.id) { this._feedToggleLike(cur); e.preventDefault(); return; }
        if (e.key === 's' && cur && cur.id) { this._feedToggleSave(cur); e.preventDefault(); return; }
        if (e.key === 'r' && !e.shiftKey && !e.ctrlKey && cur && cur.id) { this._feedToggleRepost(cur); e.preventDefault(); return; }
        if ((e.key === 'R' || (e.key === 'r' && e.shiftKey)) && !e.ctrlKey) { this._feedRefresh(); e.preventDefault(); return; }
        if (e.key === 'c' && cur && cur.id) { this._exitLessMode(); this.cmdPostView(cur.id); e.preventDefault(); return; }
        if (e.key === 'f' && cur && cur.author) { this._feedFilterByAuthor(cur.author); e.preventDefault(); return; }
      }
      if (e.key === 'r' && !e.ctrlKey && this._lessType !== 'feed') { this._renderLess(); e.preventDefault(); return; }
    }.bind(this);
    document.addEventListener('keydown', this._lessKeyHandler);

    this._lessTouchStartY = 0;
    this._lessTouchStartPos = 0;
    this._lessTouchHandler = function(e) {
      if (!this._lessActive) return;
      if (e.type === 'touchstart') { this._lessTouchStartY = e.touches[0].clientY; this._lessTouchStartPos = this._lessPos; }
      else if (e.type === 'touchmove') {
        e.preventDefault();
        var dy = this._lessTouchStartY - e.touches[0].clientY;
        var dl = Math.round(dy / 20);
        if (dl !== 0) { this._lessPos = Math.max(0, Math.min(this._lessTouchStartPos + dl, this._lessFilteredItems.length - 1)); this._renderLess(); }
      }
    }.bind(this);
    document.addEventListener('touchstart', this._lessTouchHandler, { passive: true });
    document.addEventListener('touchmove', this._lessTouchHandler, { passive: false });
  };

  T._exitLessMode = function() {
    if (!this._lessActive) return;
    this._lessActive = false;
    this._lessGPress = false;
    this._lessSearchQuery = '';
    this._lessSearchResults = [];
    this._lessAwaitingSearch = false;
    document.removeEventListener('keydown', this._lessKeyHandler);
    this._lessKeyHandler = null;
    if (this._lessTouchHandler) {
      document.removeEventListener('touchstart', this._lessTouchHandler);
      document.removeEventListener('touchmove', this._lessTouchHandler);
      this._lessTouchHandler = null;
    }
    if (this._lessSearchHandler) {
      document.removeEventListener('keydown', this._lessSearchHandler);
      this._lessSearchHandler = null;
    }
    this.exitProgramView();
  };

  T._renderLess = function() {
    if (!this._lessActive) return;
    var items = this._lessFilteredItems;
    if (!items.length) {
      this.clearOutput();
      this.addOutputLine('<span class="tp-muted">less: empty</span><span class="tp-desc">  press <span class="tp-cmd">q</span> to quit</span>');
      return;
    }
    var total = items.length;
    var pageStart = Math.max(0, Math.min(this._lessPos, total - 1));
    var visibleStart = Math.max(0, pageStart - Math.floor(this._lessPerPage / 3));
    var visibleEnd = Math.min(total, visibleStart + this._lessPerPage);
    if (visibleEnd - visibleStart < this._lessPerPage) { visibleStart = Math.max(0, visibleEnd - this._lessPerPage); }
    this._lessPos = Math.min(pageStart, total - 1);
    this.clearOutput();
    var pct = total > 0 ? Math.round((pageStart + 1) / total * 100) : 0;
    var si = this._lessSearchQuery ? '  /' + this._lessSearchQuery : '';
    this.addOutput('<div class="tp-less-header"><span class="tp-section">-- ' + this.escapeHtml(this._lessTitle) + ' (' + total + ' items)' + si + ' --</span><span class="tp-muted" style="float:right">' + (pageStart + 1) + '-' + visibleEnd + ' ' + pct + '%</span></div>');
    if (this._lessType === 'feed') {
      for (var i = visibleStart; i < visibleEnd; i++) { this._renderFeedItem(items[i], i, i === pageStart); }
    } else {
      for (var i = visibleStart; i < visibleEnd; i++) {
        var item = items[i];
        var ic = (i === pageStart);
        var prefix = ic ? '<span class="tp-less-cursor">></span> ' : '  ';
        this.addOutput('<div class="tp-line' + (ic ? ' tp-less-current' : '') + '">' + prefix + this._lessRenderItem(item, i) + '</div>');
      }
    }
    var footer;
    if (this._lessType === 'feed') {
      footer = this._lessSearchQuery ? '/ ' + this._lessSearchQuery + ' - n next N prev Enter open q quit' : '# feed - l:like s:save r:repost c:comments f:filter R:refresh j/k scroll /search q quit';
    } else {
      footer = this._lessSearchQuery ? '/ ' + this._lessSearchQuery + ' - n next N prev Enter open q quit' : '# less - j/k scroll Enter view /search n/N next gg/G top/bottom q quit';
    }
    this.addOutput('<div class="tp-less-footer"><span class="tp-muted">' + footer + '</span></div>');
  };

  T._renderLessSearchPrompt = function() {
    if (!this._lessActive) return;
    this._lessAwaitingSearch = true;
    this._renderLess();
    this.addOutput('<div class="tp-less-search"><span class="tp-ok">/</span><span class="tp-cmd" id="lessSearchInput"></span><span class="tp-less-cursor">|</span></div>');
    this._lessSearchHandler = function(e) {
      if (!this._lessActive) return;
      if (e.key === 'Escape' || e.key === 'q') {
        this._lessAwaitingSearch = false; document.removeEventListener('keydown', this._lessSearchHandler); this._renderLess(); e.preventDefault(); return;
      }
      if (e.key === 'Enter') {
        this._lessAwaitingSearch = false; document.removeEventListener('keydown', this._lessSearchHandler);
        this._lessSearchResults = [];
        for (var i = 0; i < this._lessFilteredItems.length; i++) {
          if (this._lessItemMatches(this._lessFilteredItems[i], this._lessSearchQuery)) { this._lessSearchResults.push(i); }
        }
        if (this._lessSearchResults.length) { this._lessPos = this._lessSearchResults[0]; }
        this._renderLess(); e.preventDefault(); return;
      }
      if (e.key === 'Backspace') {
        this._lessSearchQuery = this._lessSearchQuery.slice(0, -1);
        var el = document.getElementById('lessSearchInput');
        if (el) el.textContent = this._lessSearchQuery;
        e.preventDefault(); return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && e.key.match(/[\x20-\x7E]/)) {
        this._lessSearchQuery += e.key;
        var el = document.getElementById('lessSearchInput');
        if (el) el.textContent = this._lessSearchQuery;
        e.preventDefault();
      }
    }.bind(this);
    document.addEventListener('keydown', this._lessSearchHandler);
  };

  T._lessItemMatches = function(item, query) {
    if (!query) return true;
    var q = query.toLowerCase();
    var text = '';
    if (item.text) text += item.text;
    if (item.author) text += ' ' + item.author;
    if (item.username) text += ' ' + item.username;
    if (item.description) text += ' ' + item.description;
    return text.toLowerCase().indexOf(q) >= 0;
  };

  T._lessRenderItem = function(item, idx) {
    var buf = '';
    if (item.is_read !== undefined) { buf += item.is_read ? '<span class="tp-muted">.</span> ' : '<span class="tp-ok">*</span> '; }
    if (item.is_online !== undefined) { buf += item.is_online ? '<span class="tp-ok">O</span> ' : '<span class="tp-muted">o</span> '; }
    if (item.unread && item.unread > 0) { buf += '<span class="tp-ok">[' + item.unread + ']</span> '; }
    if (item.id) buf += '<span class="tp-post-id">#' + item.id + '</span> ';
    if (item.author) buf += '<span class="tp-post-author">@' + this.escapeHtml(item.author) + '</span> ';
    if (item.username) buf += '<span class="tp-post-author">@' + this.escapeHtml(item.username) + '</span> ';
    if (item.time) { buf += '<span class="tp-post-time">' + this.escapeHtml(item.time.indexOf('T') > 0 ? this.relTime(item.time) : item.time) + '</span> '; }
    if (item.text) buf += this.escapeHtml(item.text.substring(0, 120));
    if (item.description) buf += '<span class="tp-muted">' + this.escapeHtml(item.description.substring(0, 80)) + '</span>';
    if (!item.text && !item.description) { buf += '<span class="tp-muted">(no content)</span>'; }
    return buf;
  };

  // _renderFeedItem — called from _renderLess, placed here to avoid circular dep with terminal-feed.js
  T._renderFeedItem = function(item, idx, isCurrent) {
    var cls = 'tp-line' + (isCurrent ? ' tp-less-current' : '');
    var prefix = isCurrent ? '<span class="tp-less-cursor">></span>' : '';
    var esc = this.escapeHtml.bind(this);
    var timeDisplay = item.time && item.time.indexOf('T') > 0 ? this.relTime(item.time) : (item.time || '');
    var header = prefix + ' <span class="tp-post-id">#' + item.id + '</span> <span class="tp-post-author">@' + esc(item.author) + '</span> <span class="tp-post-time">' + esc(timeDisplay) + '</span>';
    var textBlock = item.text ? '<div class="tp-feed-text">' + this._linkifyTags(esc(item.text)) + '</div>' : '';
    var asciiBlock = '';
    if (item.image && item._asciiArt) { asciiBlock = item._asciiArt; }
    else if (item.image && !item._asciiConverting) {
      item._asciiConverting = true;
      this.imageToAscii(item.image, 40, function(ascii) { item._asciiArt = ascii; item._asciiConverting = false; this._renderLess(); }.bind(this));
      asciiBlock = '<div class="tp-feed-img"><span class="tp-muted">[img...</span></div>';
    }
    var liked = item.is_liked ? '<span class="tp-ok">+</span>' : '<span class="tp-muted">-</span>';
    var savedMark = item.is_saved ? ' <span class="tp-ok">*</span>' : '';
    var imgMark = item.image ? ' <span class="tp-muted">[img]</span>' : '';
    var actions = '<div class="tp-feed-actions">' + liked + ' <span class="tp-muted">' + (item.likes || 0) + '</span> <span class="tp-muted">c:' + (item.comments || 0) + '</span>' + imgMark + savedMark + '</div>';
    this.addOutput('<div class="' + cls + '">' + header + '</div>');
    if (textBlock) this.addOutput('<div class="tp-line tp-feed-text-wrap">' + textBlock + '</div>');
    if (asciiBlock) this.addOutput('<div class="tp-line">' + asciiBlock + '</div>');
    this.addOutput('<div class="tp-line">' + actions + '</div>');
  };

})(window.__RT);
