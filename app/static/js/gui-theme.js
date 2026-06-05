// ── Rugram GUI — Theme & Font Size ──
(function() {
  'use strict';

  var THEME_KEY = 'gui_theme';
  var FONT_KEY  = 'gui_font_size';

  // ── Theme ──
  function getTheme() {
    return localStorage.getItem(THEME_KEY) || 'dark';
  }

  function setTheme(theme) {
    if (theme !== 'dark' && theme !== 'light') return;
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute('data-bs-theme', theme);
  }

  // ── Font size ──
  function getFontSize() {
    return localStorage.getItem(FONT_KEY) || '14px';
  }

  function setFontSize(size) {
    if (['12px','13px','14px','15px','16px','18px','20px'].indexOf(size) === -1) return;
    localStorage.setItem(FONT_KEY, size);
    document.documentElement.style.setProperty('--tp-font-size', size);
  }

  // ── Init (safe to call from <head>) ──
  function init() {
    setTheme(getTheme());
    setFontSize(getFontSize());
  }

  // ── Public API ──
  window.GUI_THEME = {
    getTheme:    getTheme,
    setTheme:    setTheme,
    getFontSize: getFontSize,
    setFontSize: setFontSize,
    init:        init
  };
})();
