#!/usr/bin/env node
/**
 * Shared test helpers for the Rugram Terminal Test Suite.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const JS_DIR = path.resolve(__dirname, '..', '..', 'app', 'static', 'js');
const LOAD_ORDER = [
  'terminal.js',
  'terminal-ascii.js',
  'terminal-vfs.js',
  'terminal-less.js',
  'terminal-feed.js',
  'terminal-nano.js',
  'terminal-chat.js',
  'terminal-help.js',
  'terminal-navigation.js',
  'terminal-commands.js',
];

// ── Shared stats (mutable, shared across all test files) ──
const stats = { passed: 0, failed: 0, failures: [] };
let verbose = false;

function setVerbose(v) { verbose = v; }

// ── DOM & Helpers ──

function createDOM() {
  const html = '<!DOCTYPE html><html><head><meta name="csrf-token" content="test-csrf"></head><body>' +
    '<div id="terminal-mode"><div id="termOutput"></div></div>' +
    '<div id="termBar"><div style="display:flex"><span id="termPrompt">guest@tty:~$</span><input type="text" id="termInput"></div></div>' +
    '<div id="top-body"></div><div id="top-meta"></div>' +
    '</body></html>';
  return new JSDOM(html, { url: 'http://localhost:5000', runScripts: 'dangerously' });
}

function setupGlobals(dom) {
  const w = dom.window;
  const store = {};
  w.localStorage = {
    getItem: k => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (let k in store) delete store[k]; },
  };
  w.sessionStorage = { getItem: () => null, setItem: () => {} };

  Object.assign(w, {
    LOGIN_URL: '/login', HOME_URL: '/', API_ME_URL: '/api/v1/auth/me',
    API_LOGIN_URL: '/api/v1/auth/login', API_REGISTER_URL: '/api/v1/auth/register',
    API_LOGOUT_URL: '/api/v1/auth/logout', API_NOTIFICATIONS_URL: '/api/v1/notifications',
    API_NOTIFICATIONS_UNREAD_URL: '/api/v1/notifications/unread', API_USERS_SEARCH_URL: '/api/v1/users/search',
    API_PUSH_SUBSCRIBE_URL: '/push/subscribe', API_FEED_URL: '/api/v1/posts',
    API_CHAT_LIST_URL: '/api/v1/chat/list', LIKE_URL: '/like/0/', COMMENT_URL: '/comment/0/',
    SAVE_URL: '/save/0/', REPOST_URL: '/repost/0/', DELETE_POST_URL: '/delete/0',
    FOLLOW_URL: '/follow/', MARK_READ_URL: '/notif/read/0', MARK_ALL_READ_URL: '/notif/read/all',
    EDIT_COMMENT_URL: '/comment/edit/0', DELETE_COMMENT_URL: '/comment/delete/0',
    CHAT_START_URL: '/chat/start/', CHAT_SEND_URL: '/chat/send/0',
    CHAT_MESSAGES_URL: '/chat/messages/0', CHAT_TYPING_URL: '/chat/typing/0',
    STATIC_PROFILE_IMAGES: '/static/uploads/profile_images/',
    STATIC_DEFAULT_PROFILE: '/static/default-profile.png',
    CURRENT_USER_ID: 0, CURRENT_USERNAME: 'guest',
    POST_URL: '/api/v1/posts/0', PROFILE_URL: '/profile/',
    SETTINGS_URL: '/settings', SAVED_URL: '/saved', CHAT_PAGE_URL: '/chat',
    CREATE_POST_URL: '/create', EDIT_POST_URL: '/edit/0/', EDIT_PROFILE_URL: '/edit/profile',
    FOLLOWERS_URL: '/followers/', FOLLOWING_URL: '/following/',
    VAPID_PUBLIC_KEY: '',
  });
  w.isAuthenticated = false;

  // Mock fetch
  const routes = new Map();
  w.fetch = function(url, opts) {
    if (typeof url === 'string' && routes.has(url)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(routes.get(url)) });
    }
    for (const [prefix, data] of routes) {
      if (typeof url === 'string' && url.startsWith(prefix)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
      }
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  };
  w.fetch.__mock = function(url, data) { routes.set(url, data); };
  w.fetch.__mockPrefix = function(prefix, data) { routes.set(prefix, data); };
  w.fetch.__clear = function() { routes.clear(); };
}

function loadJSFiles(dom) {
  LOAD_ORDER.forEach(file => {
    const code = fs.readFileSync(path.join(JS_DIR, file), 'utf-8');
    try { dom.window.eval(code); }
    catch (e) { console.error('ERROR loading', file, ':', e.message); process.exit(1); }
  });
}

function setupTerminal(dom) {
  const doc = dom.window.document;
  const T = dom.window.__RT;
  T.addOutputLine = function(html) {
    const el = doc.getElementById('termOutput');
    el.innerHTML += '<div class="tp-line">' + html + '</div>';
  };
  T.addSysLine = T.addOutputLine;
  T.addOutput = function(html) {
    doc.getElementById('termOutput').innerHTML += html;
  };
  T.clearOutput = function() {
    doc.getElementById('termOutput').innerHTML = '';
  };
  T.showLoading = function(){};
  T.hideLoading = function(){};
  T.toast = function(){};
  return T;
}

function runCommand(dom, cmd) {
  const T = dom.window.__RT;
  T.addOutputLine('<span class="tp-prompt">$</span><span class="tp-cmd">' + cmd + '</span>');
  T.processCommand(cmd);
}

function outputHTML(dom) {
  return dom.window.document.getElementById('termOutput').innerHTML;
}

function outputText(dom) {
  return outputHTML(dom).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function nextTick() {
  return new Promise(r => process.nextTick(r));
}

// ── Assertions ──

function check(cond, msg) {
  if (cond) { stats.passed++; if (verbose) console.log('  \u2713', msg); }
  else { stats.failed++; const s = '  \u2717 FAIL: ' + msg; stats.failures.push(s); console.error(s); }
}

function hasOutput(dom, text, msg) {
  const html = outputHTML(dom);
  const txt = outputText(dom);
  const normHtml = html.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const normTxt = txt.replace(/\s+/g, ' ');
  check(normHtml.includes(text) || normTxt.includes(text), msg || 'output contains "' + text + '"');
}

function notOutput(dom, text, msg) {
  const html = outputHTML(dom);
  check(!html.includes(text), msg || 'output does NOT contain "' + text + '"');
}

// ── Mock data factory ──

function makePost(id, overrides) {
  return Object.assign({
    id, author: 'testuser2', text: 'Hello world! This is my first post!',
    time: '2026-06-03T00:00:00', likes: 5, comments: 2, reposts: 1,
    is_liked: false, is_saved: false, is_reposted: false, image: null,
  }, overrides || {});
}

// ── Test setup helpers ──

function setupLoggedIn(dom) {
  const T = dom.window.__RT;
  T.isLoggedIn = true;
  T.username = 'testuser';
  T.currentUserId = 1;
  T.feedData = [makePost(1), makePost(2)];
  T.commandHistory = ['help', 'ls', 'feed'];
}

module.exports = {
  stats, setVerbose, LOAD_ORDER, JS_DIR,
  createDOM, setupGlobals, loadJSFiles, setupTerminal,
  runCommand, outputHTML, outputText, wait, nextTick,
  check, hasOutput, notOutput, makePost, setupLoggedIn,
};
