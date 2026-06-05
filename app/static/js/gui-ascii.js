// ── Rugram GUI — Replace Images with ASCII Art ──
(function() {
  'use strict';

  var ENABLED_KEY = 'gui_ascii_art';

  // ── Check if ASCII mode is active ──
  function isEnabled() {
    return localStorage.getItem(ENABLED_KEY) === 'true';
  }

  // ── Calculate ASCII width from displayed image dimensions ──
  function asciiWidth(img) {
    // Use CSS rendered width, not naturalWidth (avoids blowing up big images)
    var px = img.offsetWidth || img.getBoundingClientRect().width || img.width || 400;
    // ~5px per character = more detail in GUI, cap at 100
    return Math.min(100, Math.max(4, Math.floor(px / 5)));
  }

  // ── Replace a single <img> with ASCII art ──
  function replaceImg(img) {
    if (img.dataset.asciiProcessed) return;
    img.dataset.asciiProcessed = 'true';

    var src = img.currentSrc || img.src;
    if (!src || src === '' || src.startsWith('data:')) return;

    var width = asciiWidth(img);
    // Don't try on tiny images (< 4 chars wide)
    if (width < 4) return;

    if (window.TERMINAL && typeof TERMINAL.imageToAscii === 'function') {
      TERMINAL.imageToAscii(src, width, function(asciiHtml) {
        // Don't insert if img is no longer in DOM
        if (!img.parentNode) return;
        // Don't insert twice
        if (img.dataset.asciiInserted) return;
        img.dataset.asciiInserted = 'true';

        var wrapper = document.createElement('div');
        wrapper.className = 'ascii-replacement';
        wrapper.style.cssText = 'overflow-x:auto;padding:2px 0;margin:4px 0;';

        // Allow clicking to view original
        wrapper.title = 'ASCII art — click to show original';
        wrapper.style.cursor = 'pointer';
        wrapper.addEventListener('click', function() {
          img.style.display = '';
          wrapper.style.display = 'none';
        });

        wrapper.innerHTML = asciiHtml;
        img.parentNode.insertBefore(wrapper, img);
        img.style.display = 'none';
      });
    }
  }

  // ── Restore original image ──
  function restoreImg(img) {
    if (!img.dataset.asciiProcessed) return;
    img.style.display = '';
    img.dataset.asciiProcessed = '';
    img.dataset.asciiInserted = '';
    var wrapper = img.parentNode ? img.parentNode.querySelector('.ascii-replacement') : null;
    if (wrapper) wrapper.remove();
  }

  // ── Scan DOM for images ──
  function processImages() {
    if (!isEnabled()) return;
    var imgs = document.querySelectorAll('img[src*="uploads"], .post-card img, #postContent img, .chat-img, #messagesContainer img, .msg-bubble img, .comment img');
    imgs.forEach(replaceImg);
  }

  // ── Restore all (when toggling off) ──
  function restoreAll() {
    document.querySelectorAll('img[data-ascii-processed="true"]').forEach(restoreImg);
  }

  // ── Toggle on/off ──
  function setEnabled(on) {
    if (on) {
      localStorage.setItem(ENABLED_KEY, 'true');
      processImages();
    } else {
      localStorage.setItem(ENABLED_KEY, 'false');
      restoreAll();
    }
  }

  // ── Init ──
  function init() {
    if (isEnabled()) {
      processImages();
    }

    // Watch for dynamically loaded content (htmx, infinite scroll, AJAX)
    var observer = new MutationObserver(function() {
      if (isEnabled()) processImages();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Public API ──
  window.GUI_ASCII = { isEnabled: isEnabled, setEnabled: setEnabled, processImages: processImages, restoreAll: restoreAll };

  // Auto-start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
