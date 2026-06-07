// ── Rugram Terminal — Feed rendering & interaction ──
// Extracted from terminal.js core. Renders post feeds and handles
// like/save/repost/refresh/filter interactions.
(function(T) {
  'use strict';

  // ════════════════════════════════════════════
  //  FEED RENDERING
  // ════════════════════════════════════════════

  T.renderFeed = function(posts) {
    var list = posts || this.feedData;
    this.addOutputLine('<span class="tp-section">-- /feed -- (' + list.length + ' posts)</span>');
    if (!list.length) {
      this.addOutputLine('<span class="tp-muted">  feed: empty</span>');
      this.addOutputLine('<span class="tp-desc">  # <span class="tp-cmd">create</span> to write a new post</span>');
      return;
    }
    list.forEach(function(p) {
      var timeDisplay = p.time.indexOf('T') > 0 ? this.relTime(p.time) : p.time;
      this.addOutputLine('  #' + p.id + '  <span class="tp-post-author">@' + this.escapeHtml(p.author) + '</span>  <span class="tp-post-time">' + this.escapeHtml(timeDisplay) + '</span>');
      this.addOutputLine('  ' + this.escapeHtml(p.text.substring(0, 200)));
      if (p.image) { this.addOutputLine('  <span class="tp-muted">[img]</span>'); }
      var liked = p.liked ? '<span class="tp-ok">+</span>' : '-';
      this.addOutputLine('  ' + liked + ' ' + p.likes + '  c:' + p.comments + '  #' + p.id);
    }.bind(this));
    this.addSysLine('<span class="tp-muted">' + list.length + ' post(s) · page 1</span>');
  };

  // ════════════════════════════════════════════
  //  FEED INTERACTION (like / save / repost / refresh / filter)
  // ════════════════════════════════════════════

  T._feedToggleLike = function(item) {
    if (!item || !item.id) return;
    var url = window.LIKE_URL.replace('/0/', '/' + item.id + '/');
    this.vfsFetch(url, { method: 'POST', headers: { 'X-CSRFToken': this.csrfToken(), 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.status === 'ok' || data.liked !== undefined) {
          item.is_liked = data.liked !== undefined ? data.liked : !item.is_liked;
          item.likes = data.likes_count !== undefined ? data.likes_count : (item.likes || 0) + (item.is_liked ? 1 : -1);
          this._renderLess(); this.toast(item.is_liked ? 'liked' : 'unliked', 'ok');
        }
      }.bind(this))
      .catch(function() { this.toast('like failed', 'err'); }.bind(this));
  };

  T._feedToggleSave = function(item) {
    if (!item || !item.id) return;
    var url = window.SAVE_URL.replace('/0/', '/' + item.id + '/');
    this.vfsFetch(url, { method: 'POST', headers: { 'X-CSRFToken': this.csrfToken(), 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.status === 'ok' || data.saved !== undefined) {
          item.is_saved = data.saved !== undefined ? data.saved : !item.is_saved;
          this._renderLess(); this.toast(item.is_saved ? 'saved' : 'unsaved', 'ok');
        }
      }.bind(this))
      .catch(function() { this.toast('save failed', 'err'); }.bind(this));
  };

  T._feedToggleRepost = function(item) {
    if (!item || !item.id) return;
    var url = window.REPOST_URL.replace('/0/', '/' + item.id + '/');
    this.vfsFetch(url, { method: 'POST', headers: { 'X-CSRFToken': this.csrfToken(), 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.status === 'ok' || data.reposted !== undefined) {
          item.is_reposted = data.reposted !== undefined ? data.reposted : !item.is_reposted;
          item.reposts = data.reposts_count !== undefined ? data.reposts_count : (item.reposts || 0) + (item.is_reposted ? 1 : -1);
          this._renderLess(); this.toast(item.is_reposted ? 'reposted' : 'repost removed', 'ok');
        }
      }.bind(this))
      .catch(function() { this.toast('repost failed', 'err'); }.bind(this));
  };

  T._feedRefresh = function() {
    this.showLoading(this._('Refreshing feed...', 'Refreshing feed...'));
    this.fetchFeedFromAPI(function() {
      this.hideLoading();
      if (this._lessActive) {
        this._lessFilteredItems = this.feedData.slice();
        this._lessItems = this.feedData.slice();
        this._lessPos = 0;
        this._lessFilteredItems.forEach(function(it) { delete it._asciiArt; delete it._asciiConverting; });
        this._renderLess();
      }
      this.toast('feed refreshed (' + this.feedData.length + ' posts)', 'ok');
    }.bind(this));
  };

  T._feedFilterByAuthor = function(author) {
    if (!author) return;
    var q = author.toLowerCase();
    var filtered = this._lessItems.filter(function(p) { return p.author && p.author.toLowerCase() === q; });
    if (!filtered.length) { this.toast('no posts from @' + author, 'err'); return; }
    this._lessFilteredItems = filtered;
    this._lessPos = 0;
    filtered.forEach(function(it) { delete it._asciiArt; delete it._asciiConverting; });
    this.toast('filter: @' + author + ' (' + filtered.length + ' posts)', 'ok');
    this._renderLess();
  };

})(window.__RT);
