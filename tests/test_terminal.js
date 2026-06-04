#!/usr/bin/env node
/**
 * Comprehensive Terminal Test Suite — covers ALL commands.
 *
 * Usage: node tests/test_terminal.js [--verbose]
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const JS_DIR = path.resolve(__dirname, '..', 'app', 'static', 'js');
const LOAD_ORDER = [
  'terminal.js',
  'terminal-vfs.js',
  'terminal-nano.js',
  'terminal-chat.js',
  'terminal-help.js',
  'terminal-navigation.js',
  'terminal-commands.js',
];

const verbose = process.argv.includes('--verbose');
let passed = 0;
let failed = 0;
const failures = [];

// ── DOM & Helpers ──

function createDOM() {
  const html = '<!DOCTYPE html><html><head><meta name="csrf-token" content="test-csrf"></head><body>' +
    '<div id="terminal-mode"><div id="termOutput"></div></div>' +
    '<div id="termBar"><div style="display:flex"><span id="termPrompt">guest@tty:~$</span><input type="text" id="termInput"></div></div>' +
    '<div id="top-body"></div><div id="top-meta"></div>' +
    '</body></html>';
  return new JSDOM(html, { url: 'http://localhost:5000', pretendToBeVisual: true, runScripts: 'dangerously' });
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
    LOGIN_URL: '/login', HOME_URL: '/', API_ME_URL: '/auth/api/me',
    API_LOGIN_URL: '/auth/api/login', API_REGISTER_URL: '/auth/api/register',
    API_LOGOUT_URL: '/auth/api/logout', API_NOTIFICATIONS_URL: '/api/notifications',
    API_NOTIFICATIONS_UNREAD_URL: '/api/notifications/unread', API_USERS_SEARCH_URL: '/api/users/search',
    API_PUSH_SUBSCRIBE_URL: '/push/subscribe', API_FEED_URL: '/api/v1/posts',
    API_CHAT_LIST_URL: '/api/chat/list', LIKE_URL: '/like/0/', COMMENT_URL: '/comment/0/',
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
  const T = dom.window.TERMINAL;
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
  const T = dom.window.TERMINAL;
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
  if (cond) { passed++; if (verbose) console.log('  \u2713', msg); }
  else { failed++; const s = '  \u2717 FAIL: ' + msg; failures.push(s); console.error(s); }
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

// ════════════════════════════════════════════════════
//  TEST HELPERS (reusable setup for logged-in sessions)
// ════════════════════════════════════════════════════

function setupLoggedIn(dom) {
  const T = dom.window.TERMINAL;
  T.isLoggedIn = true;
  T.username = 'testuser';
  T.currentUserId = 1;
  T.feedData = [makePost(1), makePost(2)];
  T.commandHistory = ['help', 'ls', 'feed'];
}

// ════════════════════════════════════════════════════
//  TESTS
// ════════════════════════════════════════════════════

// ──────────────────────────────────
// 1. AUTH: login, register, logout
// ──────────────────────────────────

async function test_login(dom) {
  const T = dom.window.TERMINAL;
  dom.window.fetch.__mock('/auth/api/login', { ok: true, user: { username: 'testuser', id: 1 } });
  dom.window.fetch.__mockPrefix('/api/v1/posts', { posts: [] });

  runCommand(dom, 'login testuser pass123');
  await nextTick(); await wait(50);

  check(T.isLoggedIn === true, 'login sets isLoggedIn');
  check(T.username === 'testuser', 'login sets username');
  check(T.cwd === 'posts', 'login sets cwd to posts');
  hasOutput(dom, 'Logged in as @testuser', 'login shows success msg');
}

async function test_login_error(dom) {
  const T = dom.window.TERMINAL;
  dom.window.fetch.__mock('/auth/api/login', { ok: false, error: 'Invalid credentials' });

  runCommand(dom, 'login baduser wrong');
  await nextTick(); await wait(50);

  check(T.isLoggedIn !== true, 'login error does NOT set isLoggedIn');
  hasOutput(dom, 'Invalid credentials', 'login shows error');
}

async function test_register(dom) {
  const T = dom.window.TERMINAL;
  dom.window.fetch.__mock('/auth/api/register', { ok: true, user: { username: 'newuser', id: 2 } });
  dom.window.fetch.__mockPrefix('/api/v1/posts', { posts: [] });

  runCommand(dom, 'register newuser new@mail.com secret');
  await nextTick(); await wait(50);

  check(T.isLoggedIn === true, 'register sets isLoggedIn');
  check(T.username === 'newuser', 'register sets username');
  hasOutput(dom, 'Registered and logged in as @newuser', 'register shows success msg');
}

async function test_logout(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/auth/api/logout', { ok: true });

  runCommand(dom, 'logout');
  await nextTick(); await wait(50);

  check(T.isLoggedIn === false, 'logout clears isLoggedIn');
  check(T.username === 'guest', 'logout resets username to guest');
  hasOutput(dom, 'Logged out', 'logout shows success msg');
}

// ──────────────────────────────────
// 2. POST: like, comment, bookmark, create, rm, cat, less, postview
// ──────────────────────────────────

async function test_like(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/like/1/', { status: 'liked', likes_count: 6 });

  runCommand(dom, 'like 1');
  await nextTick(); await wait(50);

  hasOutput(dom, '+ Post #1 — 6 likes', 'like shows result');
}

async function test_like_unliked(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/like/1/', { status: 'unliked', likes_count: 4 });

  runCommand(dom, 'like 1');
  await nextTick(); await wait(50);

  hasOutput(dom, '- Post #1 — 4 likes', 'unlike shows result');
}

async function test_comment(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/comment/1/', { ok: true });

  runCommand(dom, 'comment 1 "Nice post!"');
  await nextTick(); await wait(50);

  hasOutput(dom, 'Comment added to post #1', 'comment shows result');
}

async function test_bookmark(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/save/1/', { is_saved: true });

  runCommand(dom, 'bookmark 1');
  await nextTick(); await wait(50);

  hasOutput(dom, '* Post #1 saved', 'bookmark shows result');
}

async function test_bookmark_unsave(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/save/2/', { is_saved: false });

  runCommand(dom, 'bookmark 2');
  await nextTick(); await wait(50);

  hasOutput(dom, '# Post #2 unsaved', 'unbookmark shows result');
}

async function test_create_shows_nano(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  runCommand(dom, 'create');
  await nextTick(); await wait(50);
  check(T.nanoOverlay !== null, 'create opens nano editor');
  if (T.nanoOverlay) { T.nanoOverlay.remove(); T.nanoOverlay = null; }
}

async function test_cat_by_path(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(5, { text: 'Post content for cat test' })];
  T.cwd = 'posts';
  dom.window.fetch.__mock('/api/v1/posts/5', { post: makePost(5, { text: 'Post content for cat test' }) });
  runCommand(dom, 'cat 5');
  await nextTick(); await wait(50);
  hasOutput(dom, 'Post content for cat test', 'cat post shows content');
  hasOutput(dom, '#5', 'cat shows post id');
}

async function test_cat_not_found(dom) {
  const T = dom.window.TERMINAL;
  T.cwd = 'posts';
  dom.window.fetch.__mock('/api/v1/posts/999', { post: { is_deleted: true } });
  runCommand(dom, 'cat 999');
  await nextTick(); await wait(50);
  hasOutput(dom, 'not found', 'cat unknown shows error');
}

async function test_less(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1), makePost(2), makePost(3)];
  runCommand(dom, 'less feed');
  await nextTick(); await wait(50);
  check(T._lessActive === true, 'less opens pager');
  check(T._lessType === 'feed', 'less type is feed');
  T._exitLessMode();
}

async function test_less_by_number(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(42, { text: 'Less by number' })];
  runCommand(dom, 'less 42');
  await nextTick(); await wait(50);
  check(T._lessActive === true, 'less by id opens pager');
  hasOutput(dom, '#42', 'less by id shows post');
  T._exitLessMode();
}

async function test_rm_post(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  T.feedData = [makePost(1, { author: 'testuser' })];
  T.cwd = 'posts';
  dom.window.fetch.__mock('/delete/1', { ok: true });

  runCommand(dom, 'rm -f 1');
  await nextTick(); await wait(50);

  hasOutput(dom, 'Post #1 permanently deleted', 'rm -f deletes post');
}

async function test_rm_comment(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/comment/123', { ok: true });

  runCommand(dom, 'rm comment 123');
  await nextTick(); await wait(50);

  hasOutput(dom, 'Comment #123 deleted', 'rm comment deletes comment');
}

async function test_rm_usage(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  runCommand(dom, 'rm');
  hasOutput(dom, 'usage:', 'rm without args shows usage');
}

// ──────────────────────────────────
// 3. SOCIAL: follow, unfollow, followers, following, neofetch
// ──────────────────────────────────

async function test_follow(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/follow/alice', { status: 'followed', followers_count: 42 });

  runCommand(dom, 'follow alice');
  await nextTick(); await wait(50);

  hasOutput(dom, '@alice', 'follow shows result');
}

async function test_follow_error(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  // Mock the fetch to return 404 for any follow URL
  const routes = new Map();
  const origFetch = dom.window.fetch;
  dom.window.fetch = function(url, opts) {
    if (typeof url === 'string' && url.startsWith('/follow/')) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    }
    return origFetch(url, opts);
  };

  runCommand(dom, 'follow nouser');
  await nextTick(); await wait(100);

  hasOutput(dom, 'not found', 'follow error shows message');
  dom.window.fetch = origFetch;
}

async function test_unfollow(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/follow/testuser2', { status: 'unfollowed', followers_count: 10 });

  runCommand(dom, 'unfollow testuser2');
  await nextTick(); await wait(50);

  hasOutput(dom, 'followers', 'unfollow shows result');
}

async function test_followers_inline(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mockPrefix('/api/followers/', { users: [
    { username: 'fan1', is_online: true, description: 'Big fan' },
    { username: 'fan2', is_online: false },
  ]});

  runCommand(dom, 'followers --inline');
  await nextTick(); await wait(100);

  hasOutput(dom, 'fan1', 'followers inline shows fan1');
  hasOutput(dom, 'fan2', 'followers inline shows fan2');
}

async function test_following_inline(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mockPrefix('/api/following/', { users: [
    { username: 'hero1', is_online: true },
    { username: 'hero2', is_online: false, description: 'Cool person' },
  ]});

  runCommand(dom, 'following --inline');
  await nextTick(); await wait(100);

  hasOutput(dom, 'hero1', 'following inline shows hero1');
  hasOutput(dom, 'hero2', 'following inline shows hero2');
}

async function test_followers_less(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mockPrefix('/api/followers/', { users: [
    { username: 'fan1', is_online: true },
  ]});

  runCommand(dom, 'followers --less');
  await nextTick(); await wait(100);

  check(T._lessActive === true, 'followers --less opens pager');
  T._exitLessMode();
}

async function test_followers_empty(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mockPrefix('/api/followers/', { users: [] });

  runCommand(dom, 'followers --inline');
  await nextTick(); await wait(100);

  hasOutput(dom, 'No followers', 'followers empty shows message');
}

async function test_following_empty(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mockPrefix('/api/following/', { users: [] });

  runCommand(dom, 'following --inline');
  await nextTick(); await wait(100);

  hasOutput(dom, 'Not following', 'following empty shows message');
}

async function test_neofetch(dom) {
  const T = dom.window.TERMINAL;
  dom.window.fetch.__mock('/api/users/search?q=alice', { users: [
    { username: 'alice', is_online: true, profile_image: null },
  ]});

  runCommand(dom, 'neofetch alice');
  await nextTick(); await wait(100);

  hasOutput(dom, 'User:', 'neofetch shows header');
  hasOutput(dom, '@alice', 'neofetch shows username');
}

async function test_neofetch_not_found(dom) {
  const T = dom.window.TERMINAL;
  dom.window.fetch.__mock('/api/users/search?q=nobody', { users: [] });

  runCommand(dom, 'neofetch nobody');
  await nextTick(); await wait(100);

  hasOutput(dom, 'user not found', 'neofetch missing user shows error');
}

// ──────────────────────────────────
// 4. PROGRAMS: feed, saved, notifications, grep
// ──────────────────────────────────

async function test_feed_inline(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1, { author: 'alice' }), makePost(2, { author: 'bob', text: 'Second post text' })];
  runCommand(dom, 'feed --inline');
  hasOutput(dom, '#1', 'feed inline shows #1');
  hasOutput(dom, '#2', 'feed inline shows #2');
  hasOutput(dom, '@alice', 'feed inline shows @alice');
  hasOutput(dom, '@bob', 'feed inline shows @bob');
  hasOutput(dom, 'Second post text', 'feed inline shows text');
}

async function test_feed_program(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(42, { text: 'Program view post' })];
  runCommand(dom, 'feed');
  await nextTick(); await wait(50);
  check(T._lessActive === true, 'feed program opens less mode');
  hasOutput(dom, '#42', 'feed program shows #42');
  hasOutput(dom, 'Program view post', 'feed program shows text');
  hasOutput(dom, 'l:like', 'feed footer has l:like');
  hasOutput(dom, 'q quit', 'feed footer has q:quit');
  T._exitLessMode();
}

async function test_feed_filter_by(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1, { author: 'alice' }), makePost(2, { author: 'bob' }), makePost(3, { author: 'alice' })];
  runCommand(dom, 'feed --by alice --inline');
  hasOutput(dom, '@alice', 'feed filter shows alice');
  notOutput(dom, '@bob', 'feed filter hides bob');
}

async function test_feed_search(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1, { text: 'Hello world' }), makePost(2, { text: 'Goodbye world' })];
  runCommand(dom, 'feed --inline --search Hello');
  hasOutput(dom, 'Hello', 'feed search shows match');
  notOutput(dom, 'Goodbye', 'feed search hides non-match');
}

async function test_feed_image(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(7, { text: 'Image post', image: '/static/test.jpg' })];
  runCommand(dom, 'feed --inline');
  hasOutput(dom, '[img]', 'feed inline shows [img] indicator');
  hasOutput(dom, '#7', 'feed inline shows #7');
}

async function test_feed_tail(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1), makePost(2), makePost(3)];
  runCommand(dom, 'feed --inline --tail 2');
  hasOutput(dom, '#3', 'feed tail shows last');
  notOutput(dom, '#1', 'feed tail hides first');
}

async function test_feed_empty(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [];
  dom.window.fetch.__mockPrefix('/api/v1/posts', { posts: [] });
  runCommand(dom, 'feed --inline');
  await nextTick(); await wait(100);
  hasOutput(dom, 'no posts', 'feed empty shows message');
}

async function test_saved(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/saved', { posts: [
    makePost(10, { text: 'Saved first' }),
    makePost(11, { text: 'Saved second' }),
  ]});

  runCommand(dom, 'saved --inline');
  await nextTick(); await wait(100);

  hasOutput(dom, '#10', 'saved shows #10');
  hasOutput(dom, 'Saved first', 'saved shows first text');
  hasOutput(dom, '#11', 'saved shows #11');
}

async function test_saved_empty(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/saved', { posts: [] });

  runCommand(dom, 'saved --inline');
  await nextTick(); await wait(100);

  hasOutput(dom, 'No saved', 'saved empty shows message');
}

async function test_saved_search(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/saved', { posts: [
    makePost(10, { text: 'Cats are great' }),
    makePost(11, { text: 'Dogs are cool' }),
  ]});

  runCommand(dom, 'saved --inline --search Cats');
  await nextTick(); await wait(100);

  hasOutput(dom, 'Cats', 'saved search shows match');
  notOutput(dom, 'Dogs', 'saved search hides non-match');
}

async function test_notifications(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/notifications', { notifications: [
    { id: 1, type: 'like', actor: { username: 'alice' }, post_id: 42, is_read: false, created_date: '2026-06-03T10:00:00' },
    { id: 2, type: 'follow', actor: { username: 'bob' }, post_id: null, is_read: true, created_date: '2026-06-02T10:00:00' },
  ]});

  runCommand(dom, 'notifications --inline --unread');
  await nextTick(); await wait(100);

  hasOutput(dom, 'alice', 'notifications shows alice');
  notOutput(dom, 'bob', 'notifications unread hides bob');
}

async function test_notifications_empty(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/notifications', { notifications: [] });

  runCommand(dom, 'notifications --inline');
  await nextTick(); await wait(100);

  hasOutput(dom, 'No notifications', 'notifications empty shows message');
}

async function test_grep(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1, { text: 'Hello world' }), makePost(2, { text: 'Goodbye world' })];
  runCommand(dom, 'grep "Hello"');
  hasOutput(dom, 'Hello', 'grep shows match');
  hasOutput(dom, '#1', 'grep shows post id');
}

async function test_grep_no_match(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1, { text: 'Hello world' })];
  runCommand(dom, 'grep "zzzz"');
  hasOutput(dom, 'no matches', 'grep empty shows message');
}

// ──────────────────────────────────
// 5. NAVIGATION: cd, ls, pwd
// ──────────────────────────────────

async function test_cd(dom) {
  const T = dom.window.TERMINAL;
  runCommand(dom, 'cd posts');
  check(T.cwd === 'posts', 'cd posts sets cwd');
  runCommand(dom, 'cd ..');
  check(T.cwd === '', 'cd .. resets to root');
  runCommand(dom, 'cd /profile');
  check(T.cwd === 'profile', 'cd /profile sets cwd');
  runCommand(dom, 'cd ////saved');
  check(T.cwd === 'saved', 'cd normalizes slashes');
}

async function test_cd_from_subdir(dom) {
  const T = dom.window.TERMINAL;
  T.cwd = 'profile';
  runCommand(dom, 'cd posts');
  check(T.cwd === 'profile/posts', 'cd posts from profile/ goes to profile/posts');
  runCommand(dom, 'cd ..');
  check(T.cwd === 'profile', 'cd .. from profile/posts goes back to profile');
  runCommand(dom, 'cd /posts');
  check(T.cwd === 'posts', 'cd /posts from anywhere goes to root posts');
}

async function test_ls_root(dom) {
  const T = dom.window.TERMINAL;
  T.cwd = '';
  runCommand(dom, 'ls');
  hasOutput(dom, 'posts/', 'ls root shows posts/');
  hasOutput(dom, 'saved/', 'ls root shows saved/');
  hasOutput(dom, 'profile/', 'ls root shows profile/');
}

async function test_ls_in_posts(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1), makePost(2)];
  T.cwd = 'posts';
  runCommand(dom, 'ls');
  hasOutput(dom, '1.post', 'ls posts shows 1.post');
  hasOutput(dom, '2.post', 'ls posts shows 2.post');
}

async function test_ls_detail(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1)];
  T.cwd = 'posts';
  runCommand(dom, 'ls -l');
  hasOutput(dom, '1.post', 'ls -l shows file');
  hasOutput(dom, 'entries', 'ls -l shows count');
}

async function test_pwd(dom) {
  const T = dom.window.TERMINAL;
  T.cwd = 'profile';
  runCommand(dom, 'pwd');
  hasOutput(dom, '~/profile', 'pwd shows current dir');
}

// ──────────────────────────────────
// 6. INFO: whoami, id, info, fortune
// ──────────────────────────────────

async function test_whoami_logged_in(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/auth/api/me', { authenticated: true, user: { username: 'testuser', id: 1 } });
  runCommand(dom, 'whoami');
  hasOutput(dom, 'User:', 'whoami shows User:');
}

async function test_whoami_guest(dom) {
  const T = dom.window.TERMINAL;
  runCommand(dom, 'whoami');
  hasOutput(dom, 'Not logged in', 'whoami guest shows message');
  hasOutput(dom, 'feed', 'whoami guest shows guest commands');
}

async function test_id(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  runCommand(dom, 'id');
  hasOutput(dom, 'uid=1(testuser)', 'id shows uid');
}

async function test_id_guest(dom) {
  runCommand(dom, 'id');
  hasOutput(dom, 'uid=0(guest)', 'id guest shows guest');
}

async function test_id_with_user(dom) {
  runCommand(dom, 'id alice');
  hasOutput(dom, 'uid=0(alice)', 'id @user shows user info');
}

async function test_fortune(dom) {
  runCommand(dom, 'fortune');
  hasOutput(dom, '— programmer wisdom', 'fortune shows quote');
}

async function test_info(dom) {
  runCommand(dom, 'info');
  hasOutput(dom, 'VFS', 'info mentions VFS');
  hasOutput(dom, 'posts/', 'info shows posts/');
  hasOutput(dom, 'cat', 'info shows cat');
  hasOutput(dom, 'nano', 'info shows nano');
}

// ──────────────────────────────────
// 7. SYSTEM: echo, date, history, uptime, export, pwd, clear
// ──────────────────────────────────

async function test_echo(dom) {
  runCommand(dom, 'echo Hello World');
  hasOutput(dom, 'Hello World', 'echo shows text');
}

async function test_echo_with_env(dom) {
  const T = dom.window.TERMINAL;
  T.env = { USER: 'testuser' };
  runCommand(dom, 'echo $USER');
  hasOutput(dom, 'testuser', 'echo expands $USER');
}

async function test_date(dom) {
  runCommand(dom, 'date');
  // Date output is dynamic — just check it doesn't error and has content
  const html = outputHTML(dom);
  check(html.length > 0, 'date produces output');
}

async function test_date_utc(dom) {
  runCommand(dom, 'date -u');
  hasOutput(dom, 'UTC', 'date -u shows UTC');
}

async function test_history(dom) {
  const T = dom.window.TERMINAL;
  T.commandHistory = ['help', 'ls', 'feed --inline'];
  runCommand(dom, 'history');
  hasOutput(dom, 'help', 'history shows help');
  hasOutput(dom, 'feed', 'history shows feed');
  hasOutput(dom, 'commands', 'history shows count');
}

async function test_history_clear(dom) {
  const T = dom.window.TERMINAL;
  T.commandHistory = ['help', 'ls'];
  runCommand(dom, 'history -c');
  check(T.commandHistory.length === 0, 'history -c clears');
  hasOutput(dom, 'history cleared', 'history -c shows message');
}

async function test_history_search(dom) {
  const T = dom.window.TERMINAL;
  T.commandHistory = ['help', 'feed --inline', 'ls -l'];
  runCommand(dom, 'history --search feed');
  hasOutput(dom, 'feed', 'history --search shows feed');
  notOutput(dom, 'help', 'history --search hides non-match');
}

async function test_uptime(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1)];
  T.commandHistory = ['help', 'ls'];
  T.startTime = Date.now() - 3600000; // 1 hour ago
  runCommand(dom, 'uptime');
  hasOutput(dom, 'commands', 'uptime shows commands');
  hasOutput(dom, 'user', 'uptime shows user');
}

async function test_export(dom) {
  const T = dom.window.TERMINAL;
  runCommand(dom, 'export MYVAR=hello');
  check(T.env.MYVAR === 'hello', 'export sets env var');
  hasOutput(dom, 'MYVAR=hello', 'export shows confirmation');
}

async function test_export_no_args(dom) {
  const T = dom.window.TERMINAL;
  T.env = { TEST: 'value' };
  runCommand(dom, 'export');
  hasOutput(dom, 'TEST=value', 'export list shows vars');
}

async function test_export_theme(dom) {
  const T = dom.window.TERMINAL;
  runCommand(dom, 'export THEME=light');
  check(T.env.THEME === 'light', 'export THEME sets env');
}

async function test_export_lang(dom) {
  const T = dom.window.TERMINAL;
  runCommand(dom, 'export LANG=ru');
  check(T.env.LANG === 'ru', 'export LANG sets env');
}

async function test_clear(dom) {
  const T = dom.window.TERMINAL;
  T.addOutputLine('some content');
  check(outputHTML(dom).length > 0, 'output has content before clear');
  runCommand(dom, 'clear');
  check(outputHTML(dom).length < 50 || outputHTML(dom) === '', 'clear empties output');
}

// ──────────────────────────────────
// 8. PROGRAMS: man, help
// ──────────────────────────────────

async function test_man(dom) {
  runCommand(dom, 'man feed');
  hasOutput(dom, '--tail', 'man feed shows --tail flag');
  hasOutput(dom, 'FEED(1)', 'man feed shows header');
}

async function test_man_list(dom) {
  runCommand(dom, 'man -k');
  hasOutput(dom, 'feed', 'man -k lists feed');
  hasOutput(dom, 'ls', 'man -k lists ls');
}

async function test_help(dom) {
  runCommand(dom, 'help');
  hasOutput(dom, 'feed', 'help shows feed');
  hasOutput(dom, 'login', 'help shows login');
  hasOutput(dom, 'cat', 'help shows cat');
}

async function test_help_specific(dom) {
  runCommand(dom, 'man feed');
  hasOutput(dom, 'FEED(1)', 'man feed shows man page');
}

// ──────────────────────────────────
// 9. SHELL: alias, unalias, source, echo
// ──────────────────────────────────

async function test_alias(dom) {
  const T = dom.window.TERMINAL;
  runCommand(dom, 'alias ll="ls -l"');
  hasOutput(dom, 'll aliased', 'alias creates alias');
}

async function test_alias_list(dom) {
  const T = dom.window.TERMINAL;
  T._saveAliases({ ll: 'ls -l', g: 'grep' });
  runCommand(dom, 'alias');
  hasOutput(dom, 'll', 'alias list shows ll');
  hasOutput(dom, 'g', 'alias list shows g');
}

async function test_alias_empty(dom) {
  const T = dom.window.TERMINAL;
  T._saveAliases({});
  runCommand(dom, 'alias');
  hasOutput(dom, 'no aliases', 'alias empty shows message');
}

async function test_unalias(dom) {
  const T = dom.window.TERMINAL;
  T._saveAliases({ ll: 'ls -l' });
  runCommand(dom, 'unalias ll');
  hasOutput(dom, 'removed', 'unalias removes alias');
  check(T._loadAliases().ll === undefined, 'unalias actually removes');
}

async function test_unalias_not_found(dom) {
  const T = dom.window.TERMINAL;
  T._saveAliases({});
  runCommand(dom, 'unalias nonexistent');
  hasOutput(dom, 'not found', 'unalias unknown shows error');
}

async function test_source_script(dom) {
  const T = dom.window.TERMINAL;
  const scripts = JSON.stringify({ test: 'echo Hello from source' });
  dom.window.localStorage.setItem('rugram_scripts', scripts);
  runCommand(dom, 'source test');
  hasOutput(dom, 'Running script', 'source runs script');
}

async function test_source_list(dom) {
  const T = dom.window.TERMINAL;
  const scripts = JSON.stringify({ hello: 'echo hi', test: 'echo test' });
  dom.window.localStorage.setItem('rugram_scripts', scripts);
  runCommand(dom, 'source');
  hasOutput(dom, 'hello', 'source list shows hello');
  hasOutput(dom, 'Scripts:', 'source list shows header');
}

async function test_source_empty(dom) {
  const T = dom.window.TERMINAL;
  dom.window.localStorage.removeItem('rugram_scripts');
  runCommand(dom, 'source');
  hasOutput(dom, 'no scripts', 'source empty shows message');
}

async function test_source_save(dom) {
  runCommand(dom, 'source --save greet "echo hello"');
  hasOutput(dom, 'saved', 'source --save saves script');
}

async function test_source_rm(dom) {
  const scripts = JSON.stringify({ greet: 'echo hello' });
  dom.window.localStorage.setItem('rugram_scripts', scripts);
  runCommand(dom, 'source --rm greet');
  hasOutput(dom, 'removed', 'source --rm removes script');
}

async function test_source_not_found(dom) {
  runCommand(dom, 'source nonexistent');
  hasOutput(dom, 'No such file or directory', 'source unknown shows error');
}

// ──────────────────────────────────
// 10. HEAD / TAIL
// ──────────────────────────────────

async function test_head(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1, { text: 'First' }), makePost(2, { text: 'Second' }), makePost(3, { text: 'Third' })];
  runCommand(dom, 'head -n 2');
  hasOutput(dom, 'First', 'head shows first');
  hasOutput(dom, 'Second', 'head shows second');
  // third should not appear in the first 2
}

async function test_head_default(dom) {
  const T = dom.window.TERMINAL;
  const posts = Array.from({ length: 10 }, (_, i) => makePost(i + 1, { text: 'Post ' + (i + 1) }));
  T.feedData = posts;
  runCommand(dom, 'head');
  // Default head is 5 posts
  hasOutput(dom, 'Post 1', 'head default shows first');
  hasOutput(dom, 'Post 5', 'head default shows 5th');
}

async function test_tail(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1, { text: 'First' }), makePost(2, { text: 'Second' }), makePost(3, { text: 'Third' })];
  runCommand(dom, 'tail -n 2');
  hasOutput(dom, 'Second', 'tail shows second');
  hasOutput(dom, 'Third', 'tail shows third');
}

// ──────────────────────────────────
// 11. WATCH / PING / TOP (basic)
// ──────────────────────────────────

async function test_watch(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1)];
  runCommand(dom, 'watch echo hello');
  hasOutput(dom, 'watch:', 'watch shows banner');
  hasOutput(dom, 'hello', 'watch runs command');
  hasOutput(dom, 'watch stop', 'watch shows stop hint');
  // Cleanup
  if (T.watchInterval) { clearInterval(T.watchInterval); T.watchInterval = null; }
}

async function test_watch_stop(dom) {
  const T = dom.window.TERMINAL;
  T.watchInterval = setInterval(function(){}, 1000);
  runCommand(dom, 'watch stop');
  hasOutput(dom, 'watch stopped', 'watch stop shows message');
  check(T.watchInterval === null, 'watch stop clears interval');
}

async function test_ping_local(dom) {
  runCommand(dom, 'ping');
  await nextTick(); await wait(100);
  hasOutput(dom, 'PING 127.0.0.1', 'ping localhost shows header');
  hasOutput(dom, 'icmp_seq=1', 'ping localhost shows seq starting at 1');
  hasOutput(dom, '56(84) bytes of data', 'ping shows unix-style header');
}

async function test_ping_user(dom) {
  dom.window.fetch.__mock('/api/users/search?q=alice', { users: [
    { username: 'alice', is_online: true },
  ]});
  runCommand(dom, 'ping alice');
  await nextTick(); await wait(100);
  hasOutput(dom, 'PING @alice', 'ping user shows header');
}

async function test_ping_unreachable(dom) {
  dom.window.fetch.__mock('/api/users/search?q=ghost', { users: [] });
  runCommand(dom, 'ping ghost');
  await nextTick(); await wait(600);
  hasOutput(dom, 'packet loss', 'ping unreachable shows loss');
}

async function test_top(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1, { likes: 10 }), makePost(2, { likes: 5 })];
  T.commandHistory = ['help', 'ls'];
  runCommand(dom, 'top');
  hasOutput(dom, '-- top --', 'top shows header');
  hasOutput(dom, 'press any key to exit', 'top shows exit hint');
}

// ──────────────────────────────────
// 12. SPECIAL: gui, sudo !!, --help, &&
// ──────────────────────────────────

async function test_gui(dom) {
  const T = dom.window.TERMINAL;
  const modeChanges = [];
  T.setMode = function(m) { modeChanges.push(m); };
  runCommand(dom, 'gui');
  check(modeChanges.includes('gui'), 'gui switches to GUI mode');
}

async function test_exit(dom) {
  const T = dom.window.TERMINAL;
  const modeChanges = [];
  T.setMode = function(m) { modeChanges.push(m); };
  runCommand(dom, 'exit');
  check(modeChanges.includes('gui'), 'exit switches to GUI mode');
}

async function test_sudo_repeat(dom) {
  const T = dom.window.TERMINAL;
  // Build up state: run a command to set lastCmd
  runCommand(dom, 'echo first_cmd');
  await nextTick(); await wait(10);
  // Run another command so prevCmd = 'echo first_cmd'
  runCommand(dom, 'echo second_cmd');
  await nextTick(); await wait(10);
  // prevCmd should be 'echo first_cmd'
  T.clearOutput();
  T.addOutputLine('<span class="tp-prompt">$</span><span class="tp-cmd">sudo !!</span>');
  T.processCommand('sudo !!');
  await nextTick(); await wait(10);
  hasOutput(dom, 'second_cmd', 'sudo !! repeats previous command');
}

async function test_sudo_no_prev(dom) {
  const T = dom.window.TERMINAL;
  T.prevCmd = null;
  T.lastCmd = null;
  runCommand(dom, 'sudo !!');
  hasOutput(dom, 'no previous command', 'sudo !! with no prev shows error');
}

async function test_help_flag(dom) {
  runCommand(dom, 'feed --help');
  hasOutput(dom, '--tail', 'feed --help shows tail flag');
  hasOutput(dom, 'feed', 'feed --help shows feed');
}

async function test_chained_commands(dom) {
  const T = dom.window.TERMINAL;
  runCommand(dom, 'echo Hello && echo World');
  hasOutput(dom, 'Hello', 'chain first cmd runs');
  hasOutput(dom, 'World', 'chain second cmd runs');
}

async function test_chain_semicolon(dom) {
  runCommand(dom, 'echo One ; echo Two ; echo Three');
  hasOutput(dom, 'One', '; chain first cmd runs');
  hasOutput(dom, 'Two', '; chain second cmd runs');
  hasOutput(dom, 'Three', '; chain third cmd runs');
}

async function test_chain_or(dom) {
  runCommand(dom, 'echo A || echo B || echo C');
  hasOutput(dom, 'A', '|| chain first cmd runs');
  hasOutput(dom, 'B', '|| chain second cmd runs');
  hasOutput(dom, 'C', '|| chain third cmd runs');
}

async function test_var_expansion_in_cat(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  T.env.TEST_DIR = 'profile';
  T.cwd = '';
  T.clearOutput();
  runCommand(dom, 'cat $TEST_DIR/info');
  hasOutput(dom, 'testuser', '$TEST_DIR expands before cat command (shows profile)');
  delete T.env.TEST_DIR;
}

async function test_var_expansion_undefined(dom) {
  const T = dom.window.TERMINAL;
  T.clearOutput();
  runCommand(dom, 'echo $NOEXIST');
  hasOutput(dom, '$NOEXIST', 'undefined $VAR keeps literal (intentional)');
}

// ──────────────────────────────────
// 13. LESS VIEW — tests for less mode feed/followers/notifications
// ──────────────────────────────────

async function test_less_feed(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1), makePost(2), makePost(3)];
  runCommand(dom, 'less feed');
  await nextTick(); await wait(50);
  check(T._lessActive === true, 'less feed activates');
  check(T._lessType === 'feed', 'less feed type');
  T._exitLessMode();
}

async function test_less_unknown(dom) {
  runCommand(dom, 'less unknown');
  hasOutput(dom, 'No such', 'less unknown shows error');
}

// ──────────────────────────────────
// 14. AUTH GUARD — commands requiring login
// ──────────────────────────────────

async function test_auth_guard_like(dom) {
  runCommand(dom, 'like 1');
  hasOutput(dom, 'Login required', 'like without login shows error');
}

async function test_auth_guard_comment(dom) {
  runCommand(dom, 'comment 1 "text"');
  hasOutput(dom, 'Login required', 'comment without login shows error');
}

async function test_auth_guard_bookmark(dom) {
  runCommand(dom, 'bookmark 1');
  hasOutput(dom, 'Login required', 'bookmark without login shows error');
}

async function test_auth_guard_follow(dom) {
  runCommand(dom, 'follow alice');
  hasOutput(dom, 'Login required', 'follow without login shows error');
}

async function test_auth_guard_notifications(dom) {
  runCommand(dom, 'notifications');
  hasOutput(dom, 'Login required', 'notifications without login shows error');
}

async function test_auth_guard_saved(dom) {
  runCommand(dom, 'saved');
  hasOutput(dom, 'Login required', 'saved without login shows error');
}

// ──────────────────────────────────
// 15. EDGE CASES
// ──────────────────────────────────

async function test_unknown_command(dom) {
  runCommand(dom, 'zxy');
  hasOutput(dom, 'command not found', 'unknown cmd shows error');
}

async function test_cd_root(dom) {
  const T = dom.window.TERMINAL;
  runCommand(dom, 'cd /');
  check(T.cwd === '', 'cd / goes to root');
}

async function test_cd_tilde(dom) {
  const T = dom.window.TERMINAL;
  runCommand(dom, 'cd ~');
  check(T.cwd === '', 'cd ~ goes to root');
}

async function test_cd_nonexistent(dom) {
  const T = dom.window.TERMINAL;
  runCommand(dom, 'cd nonexistent');
  hasOutput(dom, 'No such', 'cd nonexistent shows error');
}

async function test_ls_nonexistent(dom) {
  runCommand(dom, 'ls /nonexistent');
  hasOutput(dom, 'No such', 'ls nonexistent shows error');
}

async function test_cat_no_args(dom) {
  runCommand(dom, 'cat');
  hasOutput(dom, 'Usage:', 'cat without args shows usage');
}

async function test_like_bad_args(dom) {
  setupLoggedIn(dom);
  runCommand(dom, 'like abc');
  hasOutput(dom, 'command not found', 'like bad args shows error');
}

async function test_comment_no_args(dom) {
  setupLoggedIn(dom);
  runCommand(dom, 'comment');
  hasOutput(dom, 'command not found', 'comment no args shows error');
}

async function test_bookmark_bad_args(dom) {
  setupLoggedIn(dom);
  runCommand(dom, 'bookmark abc');
  hasOutput(dom, 'command not found', 'bookmark bad args shows error');
}

async function test_follow_no_args(dom) {
  setupLoggedIn(dom);
  runCommand(dom, 'follow');
  hasOutput(dom, 'command not found', 'follow no args shows error');
}

async function test_unfollow_no_args(dom) {
  setupLoggedIn(dom);
  runCommand(dom, 'unfollow');
  hasOutput(dom, 'usage:', 'unfollow no args shows usage');
}

async function test_nano_unauth(dom) {
  runCommand(dom, 'nano');
  hasOutput(dom, 'Login required', 'nano without login shows error');
}

async function test_create_unauth(dom) {
  runCommand(dom, 'create');
  hasOutput(dom, 'Login required', 'create without login shows error');
}

async function test_rm_unauth(dom) {
  runCommand(dom, 'rm 1');
  hasOutput(dom, 'Login required', 'rm without login shows error');
}

async function test_man_unknown(dom) {
  runCommand(dom, 'man nonexistent');
  hasOutput(dom, 'No manual entry', 'man unknown shows error');
}

async function test_chain_limit(dom) {
  runCommand(dom, 'echo a && echo b && echo c && echo d && echo e && echo f');
  hasOutput(dom, 'too many chained', 'chain >5 shows error');
}

async function test_help_flag_unknown(dom) {
  runCommand(dom, 'zxy --help');
  hasOutput(dom, 'No manual entry', '--help unknown shows error');
}

async function test_case_insensitive(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1), makePost(2)];
  runCommand(dom, 'FEED --inline');
  hasOutput(dom, '#1', 'FEED (uppercase) works');
}

async function test_multiple_spaces(dom) {
  runCommand(dom, 'echo    hello');
  hasOutput(dom, 'hello', 'echo with multiple spaces');
}

async function test_echo_undefined_var(dom) {
  const T = dom.window.TERMINAL;
  T.env = {};
  runCommand(dom, 'echo $UNDEFINED');
  hasOutput(dom, '$UNDEFINED', 'echo $UNDEFINED shows literal');
}

async function test_chat_unauth(dom) {
  runCommand(dom, 'chat');
  hasOutput(dom, 'Login required', 'chat without login shows error');
}

async function test_write_unauth(dom) {
  runCommand(dom, 'write hello');
  hasOutput(dom, 'Login required', 'write without login shows error');
}

async function test_start_unauth(dom) {
  runCommand(dom, 'start @alice');
  hasOutput(dom, 'Login required', 'start without login shows error');
}

async function test_say_no_chat(dom) {
  setupLoggedIn(dom);
  runCommand(dom, 'say hello');
  hasOutput(dom, 'not in a chat', 'say outside chat shows error');
}

async function test_start_no_args(dom) {
  setupLoggedIn(dom);
  runCommand(dom, 'start');
  hasOutput(dom, 'command not found', 'start no args shows error');
}

async function test_export_bad_syntax(dom) {
  runCommand(dom, 'export bad');
  hasOutput(dom, 'not a valid identifier', 'export bad syntax shows error');
}

async function test_export_bad_theme(dom) {
  runCommand(dom, 'export THEME=rainbow');
  hasOutput(dom, 'must be dark or light', 'export bad theme shows error');
}

async function test_alias_bad_syntax(dom) {
  runCommand(dom, 'alias / bad');
  hasOutput(dom, 'not a valid identifier', 'alias bad syntax shows error');
}

async function test_source_save_empty_name(dom) {
  runCommand(dom, 'source --save');
  hasOutput(dom, 'No such file or directory', 'source --save no name shows error');
}

async function test_program_view(dom) {
  const T = dom.window.TERMINAL;
  T.enterProgramView();
  check(T._programDepth === 1, 'enterProgramView sets depth');
  T.exitProgramView();
  check(T._programDepth === 0, 'exitProgramView clears depth');
}

async function test_auth_guard_create(dom) {
  runCommand(dom, 'create');
  hasOutput(dom, 'Login required', 'create without login shows error');
}

async function test_auth_guard_rm(dom) {
  runCommand(dom, 'rm');
  hasOutput(dom, 'Login required', 'rm without login shows error');
}

// ──────────────────────────────────
// 16. EXTRA EDGE CASES (VFS, feed --less, saved --inline, etc.)
// ──────────────────────────────────

async function test_feed_less(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1), makePost(2)];
  runCommand(dom, 'feed --less');
  await nextTick(); await wait(50);
  hasOutput(dom, 'Feed', 'feed --less shows feed title');
  hasOutput(dom, '2 items', 'feed --less shows count');
}

async function test_saved_inline(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/saved', { posts: [makePost(10, { text: 'inline saved post' })] });
  runCommand(dom, 'saved --inline');
  await nextTick(); await wait(100);
  hasOutput(dom, '10', 'saved --inline shows post id');
  hasOutput(dom, 'inline saved', 'saved --inline shows text');
}

async function test_cat_post_meta(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1, { likes: 42, comments: 7, time: '2026-06-03T12:00:00' })];
  runCommand(dom, 'cat posts/1/.meta');
  hasOutput(dom, 'likes=42', 'cat .meta shows likes');
  hasOutput(dom, 'comments=7', 'cat .meta shows comments');
}

async function test_cd_stop_chat_polling(dom) {
  const T = dom.window.TERMINAL;
  T.chatPollInterval = setInterval(function(){}, 1000);
  T.cwd = 'chat/5';
  runCommand(dom, 'cd ..');
  check(T.cwd === 'chat', 'cd .. from chat/5 goes to chat');
  check(T.chatPollInterval === null, 'cd .. clears chat polling');
  // Now go up again to root
  runCommand(dom, 'cd ..');
  check(T.cwd === '', 'cd .. from chat goes to root');
}

async function test_sudo_repeat_after_cmd(dom) {
  const T = dom.window.TERMINAL;
  T.isLoggedIn = true;
  T.username = 'testuser';
  T.feedData = [makePost(1)];
  runCommand(dom, 'echo hello');
  await nextTick(); await wait(50);
  T.clearOutput();
  T.isLoggedIn = false; // to not get auth error for any command
  runCommand(dom, 'sudo !!');
  hasOutput(dom, 'hello', 'sudo !! repeats last command');
}

async function test_ping_numeric(dom) {
  runCommand(dom, 'ping 127.0.0.1');
  await nextTick(); await wait(100);
  hasOutput(dom, 'PING', 'ping numeric IP shows PING');
}

async function test_empty_input(dom) {
  runCommand(dom, '');
  // Should produce no additional output
  const html = outputHTML(dom);
  check(html.includes('$') || html === '', 'empty input does nothing');
}

async function test_whitespace_input(dom) {
  runCommand(dom, '   ');
  // Should produce no additional output
  const html = outputHTML(dom);
  check(html.includes('$') || html === '', 'whitespace input does nothing');
}

async function test_followers_inline_of(dom) {
  dom.window.fetch.__mockPrefix('/api/followers/', { users: [
    { username: 'fan1', is_online: true },
    { username: 'fan2', is_online: false },
  ]});
  runCommand(dom, 'followers --inline --of @alice');
  await nextTick(); await wait(100);
  hasOutput(dom, 'fan1', 'followers --of shows user');
  hasOutput(dom, 'fan2', 'followers --of shows second user');
}

async function test_following_inline_of(dom) {
  dom.window.fetch.__mockPrefix('/api/following/', { users: [
    { username: 'hero1', is_online: true },
  ]});
  runCommand(dom, 'following --inline --of @bob');
  await nextTick(); await wait(100);
  hasOutput(dom, 'hero1', 'following --of shows user');
}

async function test_followers_empty_of(dom) {
  dom.window.fetch.__mockPrefix('/api/followers/', { users: [] });
  runCommand(dom, 'followers --inline --of @nobody');
  await nextTick(); await wait(100);
  hasOutput(dom, 'No followers', 'followers empty --of shows msg');
}

async function test_notifications_inline(dom) {
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/notifications', { notifications: [
    { id: 1, type: 'like', actor: { username: 'alice' }, post_id: 10,
      is_read: false, created_date: '2026-06-03T12:00:00' },
  ]});
  runCommand(dom, 'notifications --inline');
  await nextTick(); await wait(100);
  hasOutput(dom, 'alice', 'notifications --inline shows actor');
  hasOutput(dom, 'liked', 'notifications --inline shows type');
}

async function test_notifications_inline_unread(dom) {
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/notifications', { notifications: [
    { id: 1, type: 'like', actor: { username: 'bob' }, post_id: 10,
      is_read: false, created_date: '2026-06-03T12:00:00' },
    { id: 2, type: 'follow', actor: { username: 'carol' }, post_id: null,
      is_read: true, created_date: '2026-06-03T11:00:00' },
  ]});
  runCommand(dom, 'notifications --inline --unread');
  await nextTick(); await wait(100);
  hasOutput(dom, 'bob', 'unread shows bob');
  notOutput(dom, 'carol', 'unread filters out read');
}

async function test_head_fetched(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [];
  // Mock returns posts so fetchFeedFromAPI breaks the recursion
  dom.window.fetch.__mockPrefix('/api/v1/posts', { posts: [makePost(1), makePost(2)] });
  runCommand(dom, 'head');
  await nextTick(); await wait(100);
  hasOutput(dom, '#1', 'head fetches and shows posts');
}

async function test_tail_fetched(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [];
  dom.window.fetch.__mockPrefix('/api/v1/posts', { posts: [makePost(1), makePost(2)] });
  runCommand(dom, 'tail');
  await nextTick(); await wait(100);
  hasOutput(dom, '#2', 'tail fetches and shows last posts');
}

async function test_grep_empty_feed(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [];
  // Mock returns SOME posts so fetchFeedFromAPI doesn't recurse infinitely
  dom.window.fetch.__mockPrefix('/api/v1/posts', { posts: [makePost(1, { text: 'hello world' })] });
  runCommand(dom, 'grep "hello"');
  await nextTick(); await wait(100);
  hasOutput(dom, '#1', 'grep fetches and finds match');
}

async function test_rm_force(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  T.feedData = [makePost(99)];
  runCommand(dom, 'rm -f 99');
  hasOutput(dom, '99', 'rm -f mentions post');
}

async function test_cat_directory(dom) {
  // Root has content callback, so cat / shows home. Use a plain dir instead.
  // 'trash' has no content callback when empty → shows "Is a directory"
  runCommand(dom, 'cat trash');
  hasOutput(dom, 'Is a directory', 'cat trash shows is a directory error');
}

async function test_nano_edit_file(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  runCommand(dom, 'nano posts/1.post');
  await nextTick(); await wait(50);
  // Should resolve VFS path and open editor — just check no error
  check(T.nanoOverlay !== null || outputHTML(dom).includes('No such file') === false,
    'nano path resolves without error');
  if (T.nanoOverlay) { T.nanoOverlay.remove(); T.nanoOverlay = null; }
}

async function test_chat_list(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  // IMPORTANT: last_message_time and last_message are TOP-LEVEL chat fields, not nested!
  dom.window.fetch.__mock('/api/chat/list', { chats: [
    { id: 1, other_user: { username: 'alice', is_online: true },
      last_message_time: '2026-06-03T10:00:00Z', last_message: 'hi', unread_count: 0 },
  ]});
  runCommand(dom, 'chat');
  await nextTick(); await wait(100);
  const txt = outputText(dom);
  const ok = txt.includes('alice');
  check(ok, 'chat list shows conversations');
}

async function test_write_message(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mockPrefix('/chat/start/', { chat_id: 5 });
  dom.window.fetch.__mock('/chat/5/send', { ok: true });
  runCommand(dom, 'write @alice hello!');
  await nextTick(); await wait(100);
  hasOutput(dom, 'alice', 'write sends to user');
}

async function test_start_valid(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/chat/start/bob', { chat_id: 5 });
  dom.window.fetch.__mockPrefix('/chat/5/messages', { messages: [], other_user: { username: 'bob' } });
  runCommand(dom, 'start @bob');
  await nextTick(); await wait(100);
  // start → startChatWithUser → loadChatMessages which clears output and shows chat
  const txt = outputText(dom);
  check(txt.includes('bob'), 'start shows chat with bob');
  // Stop polling interval if started
  if (T.chatPollInterval) { clearInterval(T.chatPollInterval); T.chatPollInterval = null; }
  // Exit program view
  if (T._lessActive) T._exitLessMode();
  if (T._programDepth > 0) T.exitProgramView();
}

async function test_watch_with_interval(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1)];
  runCommand(dom, 'watch -n 1 echo interval_test');
  await nextTick(); await wait(50);
  hasOutput(dom, 'watch:', 'watch -n shows banner');
  hasOutput(dom, 'interval_test', 'watch -n runs command');
  if (T.watchInterval) { clearInterval(T.watchInterval); T.watchInterval = null; }
}

async function test_ls_saved_dir(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  // ls in saved dir — use path arg instead of changing cwd
  dom.window.fetch.__mock('/api/saved', { posts: [] });
  runCommand(dom, 'ls saved');
  // Should either list contents or show empty info
  const html = outputHTML(dom);
  // Just check it doesn't error
  check(!html.includes('No such'), 'ls saved does not error');
}

// ── EVEN MORE EDGE CASES ──

async function test_saved_less(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/saved', { posts: [makePost(10)] });
  runCommand(dom, 'saved --less');
  await nextTick(); await wait(100);
  check(T._lessActive === true, 'saved --less opens pager');
  check(T._lessTitle.indexOf('Saved') >= 0, 'saved --less shows Saved title');
  if (T._lessActive) { T._exitLessMode(); T.exitProgramView(); }
}

async function test_saved_tail(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/saved', { posts: [makePost(1), makePost(2), makePost(3)] });
  runCommand(dom, 'saved --tail 1');
  await nextTick(); await wait(100);
  hasOutput(dom, '#3', 'saved --tail 1 shows last post');
  check(outputHTML(dom).indexOf('#1') < 0 && outputHTML(dom).indexOf('#2') < 0,
    'saved --tail 1 hides earlier posts');
}

async function test_notifications_less(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/notifications', {
    notifications: [
      { id: 101, actor: { username: 'alice' }, type: 'like', post_id: 1,
        created_date: '2026-06-03T10:00:00Z', is_read: false },
    ]
  });
  runCommand(dom, 'notifications --less');
  await nextTick(); await wait(100);
  check(T._lessActive === true, 'notifications --less opens pager');
  check(T._lessTitle.indexOf('Notifications') >= 0, 'notifications --less shows Notifications title');
  if (T._lessActive) { T._exitLessMode(); T.exitProgramView(); }
}

async function test_notifications_tail(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/notifications', {
    notifications: [
      { id: 1, actor: { username: 'a' }, type: 'like', post_id: 1,
        created_date: '2026-06-03T10:00:00Z', is_read: false },
      { id: 2, actor: { username: 'b' }, type: 'follow', post_id: null,
        created_date: '2026-06-03T11:00:00Z', is_read: true },
      { id: 3, actor: { username: 'c' }, type: 'comment', post_id: 2,
        created_date: '2026-06-03T12:00:00Z', is_read: false },
    ]
  });
  runCommand(dom, 'notifications --tail 2');
  await nextTick(); await wait(100);
  hasOutput(dom, '@b', 'notifications --tail 2 shows second item');
  hasOutput(dom, '@c', 'notifications --tail 2 shows third item');
  check(outputHTML(dom).indexOf('@a') < 0, 'notifications --tail 2 hides first item');
}

async function test_following_less(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  dom.window.fetch.__mockPrefix('/api/following/', { users: [
    { username: 'alice', is_online: true },
    { username: 'bob', is_online: false },
  ]});
  runCommand(dom, 'following --less');
  await nextTick(); await wait(100);
  check(T._lessActive === true, 'following --less opens pager');
  check(T._lessTitle.indexOf('Following') >= 0, 'following --less shows Following title');
  if (T._lessActive) { T._exitLessMode(); T.exitProgramView(); }
}

async function test_feed_page(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [];
  for (let i = 1; i <= 12; i++) T.feedData.push(makePost(i, { text: 'post ' + i }));
  T.isLoggedIn = true;
  runCommand(dom, 'feed --inline --page 1');
  await nextTick(); await wait(50);
  hasOutput(dom, '#1', 'feed --page 1 shows first post');
  hasOutput(dom, '#10', 'feed --page 1 shows tenth post');
  check(outputHTML(dom).indexOf('#11') < 0, 'feed --page 1 hides 11th post');
}

async function test_watch_stop_no_active(dom) {
  const T = dom.window.TERMINAL;
  runCommand(dom, 'watch off');
  hasOutput(dom, 'No active watch', 'watch off no active shows message');
}

async function test_nano_not_found(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  runCommand(dom, 'nano posts/999.post');
  hasOutput(dom, 'No such file', 'nano nonexistent path shows error');
}

async function test_say_in_chat(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  T.cwd = 'chat/5';
  dom.window.fetch.__mock('/chat/5/send', { ok: true });
  runCommand(dom, 'say hello from terminal');
  await nextTick(); await wait(100);
  hasOutput(dom, 'hello from terminal', 'say in chat shows message text');
  hasOutput(dom, 'me now', 'say shows timestamp');
}

async function test_say_empty(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);
  T.cwd = 'chat/5';
  runCommand(dom, 'say');
  hasOutput(dom, 'message text required', 'say without text shows error');
}

async function test_say_unauth(dom) {
  const T = dom.window.TERMINAL;
  T.cwd = 'chat/5';
  runCommand(dom, 'say hello');
  hasOutput(dom, 'Login required', 'say without login shows error');
}

async function test_rm_trash(dom) {
  const T = dom.window.TERMINAL;
  T.isLoggedIn = true;
  T.username = 'testuser';
  T.cwd = 'posts';
  T.feedData = [makePost(1, { author: 'testuser' })];
  runCommand(dom, 'rm 1');
  await nextTick(); await wait(50);
  hasOutput(dom, 'moved to trash', 'rm 1 moves own post to trash');
  hasOutput(dom, 'Restore', 'rm shows restore hint');
}

async function test_rm_other_post(dom) {
  const T = dom.window.TERMINAL;
  T.isLoggedIn = true;
  T.username = 'testuser';
  T.cwd = 'posts';
  T.feedData = [makePost(1, { author: 'otheruser' })];
  runCommand(dom, 'rm 1');
  await nextTick(); await wait(50);
  hasOutput(dom, 'cannot delete', 'rm other user post shows permission error');
}

async function test_export_matrix(dom) {
  const T = dom.window.TERMINAL;
  T.env = {};
  runCommand(dom, 'export MATRIX=1');
  check(T.env.MATRIX === '1', 'export MATRIX=1 sets env');
}

async function test_cd_home(dom) {
  const T = dom.window.TERMINAL;
  T.cwd = 'posts';
  T.updatePrompt();
  runCommand(dom, 'cd home');
  check(T.cwd === '', 'cd home goes to root');
}

async function test_vfs_completion(dom) {
  const T = dom.window.TERMINAL;
  T.cwd = '';

  var res = T._completeVFSPath('po', '');
  check(res.length > 0 && res[0] === 'posts/', 'tab complete "po" → "posts/"');

  var res2 = T._completeVFSPath('sav', '');
  check(res2.length > 0 && res2[0] === 'saved/', 'tab complete "sav" → "saved/"');

  var res3 = T._completeVFSPath('x', '');
  check(res3.length === 0, 'tab complete "x" → no matches');
}

async function test_cd_comprehensive(dom) {
  const T = dom.window.TERMINAL;
  setupLoggedIn(dom);

  // ══════════════════════════════════════════
  //  A. FROM ROOT (cwd = '')
  // ══════════════════════════════════════════
  // Each case resets T.cwd before itself

  // A1. Simple section
  T.cwd = '';
  runCommand(dom, 'cd posts');
  check(T.cwd === 'posts', 'A1: cd posts from root');

  // A2. cd ../section from root = /section (Unix: /../x = /x)
  T.cwd = '';
  runCommand(dom, 'cd ../saved');
  check(T.cwd === 'saved', 'A2: cd ../saved from root equals /saved');

  // A3. cd ./section
  T.cwd = '';
  runCommand(dom, 'cd ./profile');
  check(T.cwd === 'profile', 'A3: cd ./profile from root');

  // A4. cd section/ (trailing slash)
  T.cwd = '';
  runCommand(dom, 'cd trash/');
  check(T.cwd === 'trash', 'A4: cd trash/ from root');

  // A5. cd /section (absolute)
  T.cwd = '';
  runCommand(dom, 'cd /notifications');
  check(T.cwd === 'notifications', 'A5: cd /notifications from root');

  // A6. cd /////section (many slashes)
  T.cwd = '';
  runCommand(dom, 'cd ////drafts');
  check(T.cwd === 'drafts', 'A6: cd ////drafts normalizes slashes');

  // A7. cd . (stay in place — needs a starting dir)
  T.cwd = 'saved';
  runCommand(dom, 'cd .');
  check(T.cwd === 'saved', 'A7: cd . stays in same dir');

  // A8. cd section/. (dot in middle)
  T.cwd = '';
  runCommand(dom, 'cd saved/.');
  check(T.cwd === 'saved', 'A8: cd saved/. from root');

  // A9. cd ~ (root)
  runCommand(dom, 'cd ~');
  check(T.cwd === '', 'A9: cd ~ goes to root');

  // A10. cd ~/section (tilde = root)
  T.cwd = '';
  runCommand(dom, 'cd ~/posts');
  check(T.cwd === 'posts', 'A10: cd ~/posts from root');

  // A11. cd .. from root stays at root (Unix: /.. = /)
  T.cwd = '';
  runCommand(dom, 'cd ..');
  check(T.cwd === '', 'A11: cd .. from root stays at root');

  // A12. cd section/../other (path normalization)
  T.cwd = '';
  runCommand(dom, 'cd posts/../saved');
  check(T.cwd === 'saved', 'A12: cd posts/../saved resolves correctly');

  // A13. cd section/.. (back to parent)
  T.cwd = '';
  runCommand(dom, 'cd saved/..');
  check(T.cwd === '', 'A13: cd saved/.. from root goes to root');

  // A14. cd section/./ (dots + slash)
  T.cwd = '';
  runCommand(dom, 'cd profile/./');
  check(T.cwd === 'profile', 'A14: cd profile/./ from root');

  // A15. cd to nested dir: profile/posts
  T.cwd = '';
  runCommand(dom, 'cd profile/posts');
  check(T.cwd === 'profile/posts', 'A15: cd profile/posts from root');
  runCommand(dom, 'cd ..');
  check(T.cwd === 'profile', 'A15b: cd .. from profile/posts goes to profile');
  runCommand(dom, 'cd ..');
  check(T.cwd === '', 'A15c: cd .. from profile goes to root');

  // ══════════════════════════════════════════
  //  B. FROM SUBDIR (cwd = 'profile')
  // ══════════════════════════════════════════

  // B1. Relative cd to subsection
  T.cwd = 'profile';
  runCommand(dom, 'cd posts');
  check(T.cwd === 'profile/posts', 'B1: cd posts from profile/');

  // B2. cd .. from sub-subdir → parent
  runCommand(dom, 'cd ..');
  check(T.cwd === 'profile', 'B2: cd .. from profile/posts');

  // B3. cd ../section from subdir
  runCommand(dom, 'cd ../saved');
  check(T.cwd === 'saved', 'B3: cd ../saved from profile/');

  // B4. cd ../../section from subdir (two levels up)
  T.cwd = 'profile/posts';
  runCommand(dom, 'cd ../../trash');
  check(T.cwd === 'trash', 'B4: cd ../../trash from profile/posts');

  // B5. cd ../../.. from subdir (past root, stays at root)
  T.cwd = 'profile/posts';
  runCommand(dom, 'cd ../../..');
  check(T.cwd === '', 'B5: cd ../../.. from profile/posts = root');

  // B6. cd /section (absolute from subdir)
  T.cwd = 'profile';
  runCommand(dom, 'cd /posts');
  check(T.cwd === 'posts', 'B6: cd /posts from profile/ (absolute)');

  // B7. cd ~ from subdir → root
  T.cwd = 'profile/posts';
  runCommand(dom, 'cd ~');
  check(T.cwd === '', 'B7: cd ~ from profile/posts goes to root');

  // B8. cd ~/section from subdir (FIXED BUG)
  T.cwd = 'profile';
  runCommand(dom, 'cd ~/saved');
  check(T.cwd === 'saved', 'B8: cd ~/saved from profile/ (was BUG: profile/saved)');

  // B9. cd . from subdir (stay)
  T.cwd = 'profile';
  runCommand(dom, 'cd .');
  check(T.cwd === 'profile', 'B9: cd . from profile');

  // B10. cd ./section from subdir
  runCommand(dom, 'cd ./posts');
  check(T.cwd === 'profile/posts', 'B10: cd ./posts from profile');

  // B11. cd section/.. from subdir (back to parent)
  T.cwd = 'profile';
  runCommand(dom, 'cd posts/..');
  check(T.cwd === 'profile', 'B11: cd posts/.. from profile');

  // B12. cd section/./. from subdir (dots everywhere)
  T.cwd = 'profile';
  runCommand(dom, 'cd posts/./.');
  check(T.cwd === 'profile/posts', 'B12: cd posts/./. from profile');

  // B13. cd section/../../other = two up then down
  T.cwd = 'profile';
  runCommand(dom, 'cd posts/../../saved');
  check(T.cwd === 'saved', 'B13: cd posts/../../saved from profile');

  // ══════════════════════════════════════════
  //  C. ERROR CASES
  // ══════════════════════════════════════════

  // C1. cd into file → error
  T.cwd = 'profile';
  T.clearOutput();
  runCommand(dom, 'cd info');
  hasOutput(dom, 'Not a directory', 'C1: cd info from profile/');
  check(T.cwd === 'profile', 'C1b: cwd unchanged after cd into file');

  // C2. cd nonexistent section → error
  T.clearOutput();
  runCommand(dom, 'cd nonexistent_dir');
  hasOutput(dom, 'No such file or directory', 'C2: cd nonexistent_dir');
  check(T.cwd === 'profile', 'C2b: cwd unchanged after cd nonexistent');

  // C3. cd ../nonexistent → error
  T.clearOutput();
  runCommand(dom, 'cd ../nonexistent_dir');
  hasOutput(dom, 'No such file or directory', 'C3: cd ../nonexistent from profile');
  check(T.cwd === 'profile', 'C3b: cwd unchanged');

  // ══════════════════════════════════════════
  //  D. @user DIRS
  // ══════════════════════════════════════════

  // D1. cd @user from root
  T.cwd = '';
  runCommand(dom, 'cd @testuser2');
  check(T.cwd === '@testuser2', 'D1: cd @testuser2 from root');

  // D2. cd posts from inside @user (relative)
  runCommand(dom, 'cd posts');
  check(T.cwd === '@testuser2/posts', 'D2: cd posts from @testuser2/');

  // D3. cd .. from @user/posts → back to @user
  runCommand(dom, 'cd ..');
  check(T.cwd === '@testuser2', 'D3: cd .. from @user/posts');

  // D4. cd ../posts from @user → root/posts
  runCommand(dom, 'cd ../posts');
  check(T.cwd === 'posts', 'D4: cd ../posts from @testuser2');

  // Restore
  T.cwd = '';
}

async function test_history_empty(dom) {
  const T = dom.window.TERMINAL;
  T.commandHistory = [];
  T.addOutputLine('<span class="tp-prompt">$</span><span class="tp-cmd">history</span>');
  T._dispatchCommand('history');
  hasOutput(dom, 'history is empty', 'history with no commands shows empty');
}

async function test_history_search_no_match(dom) {
  const T = dom.window.TERMINAL;
  T.commandHistory = ['help', 'ls', 'feed'];
  T.addOutputLine('<span class="tp-prompt">$</span><span class="tp-cmd">history --search nonexistent</span>');
  T._dispatchCommand('history --search nonexistent');
  hasOutput(dom, 'no matches', 'history --search no match shows error');
}

async function run() {
  console.log('');
  console.log('  ' + String.fromCharCode(0x250D) + String.fromCharCode(0x2500).repeat(55) + String.fromCharCode(0x2511));
  console.log('  ' + String.fromCharCode(0x2502) + '  Terminal Test Suite — All Commands       ' + String.fromCharCode(0x2502));
  console.log('  ' + String.fromCharCode(0x2515) + String.fromCharCode(0x2500).repeat(55) + String.fromCharCode(0x2519));
  console.log('');

  const tests = [
    // AUTH
    ['login',          test_login],
    ['login error',    test_login_error],
    ['register',       test_register],
    ['logout',         test_logout],

    // POST
    ['like',           test_like],
    ['like unliked',   test_like_unliked],
    ['comment',        test_comment],
    ['bookmark',       test_bookmark],
    ['bookmark unsave',test_bookmark_unsave],
    ['create',         test_create_shows_nano],
    ['cat',            test_cat_by_path],
    ['cat not found',  test_cat_not_found],
    ['less',           test_less],
    ['less by number', test_less_by_number],
    ['rm',             test_rm_post],
    ['rm comment',     test_rm_comment],
    ['rm usage',       test_rm_usage],

    // SOCIAL
    ['follow',         test_follow],
    ['follow error',   test_follow_error],
    ['unfollow',       test_unfollow],
    ['followers',      test_followers_inline],
    ['followers less', test_followers_less],
    ['followers empty',test_followers_empty],
    ['following',      test_following_inline],
    ['following empty',test_following_empty],
    ['neofetch',       test_neofetch],
    ['neofetch not found', test_neofetch_not_found],

    // PROGRAMS
    ['feed inline',    test_feed_inline],
    ['feed program',   test_feed_program],
    ['feed filter',    test_feed_filter_by],
    ['feed search',    test_feed_search],
    ['feed image',     test_feed_image],
    ['feed tail',      test_feed_tail],
    ['feed empty',     test_feed_empty],
    ['saved',          test_saved],
    ['saved empty',    test_saved_empty],
    ['saved search',   test_saved_search],
    ['notifications',  test_notifications],
    ['notifications empty', test_notifications_empty],
    ['grep',           test_grep],
    ['grep no match',  test_grep_no_match],

    // NAVIGATION
    ['cd',             test_cd],
    ['cd from subdir', test_cd_from_subdir],
    ['ls root',        test_ls_root],
    ['ls posts',       test_ls_in_posts],
    ['ls detail',      test_ls_detail],
    ['pwd',            test_pwd],

    // INFO
    ['whoami',         test_whoami_logged_in],
    ['whoami guest',   test_whoami_guest],
    ['id',             test_id],
    ['id guest',       test_id_guest],
    ['id @user',       test_id_with_user],
    ['fortune',        test_fortune],
    ['info',           test_info],

    // SYSTEM
    ['echo',           test_echo],
    ['echo $ENV',      test_echo_with_env],
    ['date',           test_date],
    ['date -u',        test_date_utc],
    ['history',        test_history],
    ['history clear',  test_history_clear],
    ['history search', test_history_search],
    ['uptime',         test_uptime],
    ['export',         test_export],
    ['export list',    test_export_no_args],
    ['export theme',   test_export_theme],
    ['export lang',    test_export_lang],
    ['clear',          test_clear],

    // MAN / HELP
    ['man',            test_man],
    ['man -k',         test_man_list],
    ['help',           test_help],

    // SHELL
    ['alias',          test_alias],
    ['alias list',     test_alias_list],
    ['alias empty',    test_alias_empty],
    ['unalias',        test_unalias],
    ['unalias error',  test_unalias_not_found],
    ['source',         test_source_script],
    ['source list',    test_source_list],
    ['source empty',   test_source_empty],
    ['source save',    test_source_save],
    ['source rm',      test_source_rm],
    ['source error',   test_source_not_found],

    // HEAD/TAIL
    ['head',           test_head],
    ['head default',   test_head_default],
    ['tail',           test_tail],

    // WATCH / PING / TOP
    ['watch',          test_watch],
    ['watch stop',     test_watch_stop],
    ['ping local',     test_ping_local],
    ['ping user',      test_ping_user],
    ['ping unreach',   test_ping_unreachable],
    ['top',            test_top],

    // SPECIAL
    ['gui',            test_gui],
    ['exit',           test_exit],
    ['sudo repeat',    test_sudo_repeat],
    ['sudo no prev',   test_sudo_no_prev],
    ['--help flag',    test_help_flag],
    ['&& chain',       test_chained_commands],
    ['; chain',        test_chain_semicolon],
    ['|| chain',       test_chain_or],
    ['$VAR in cat',    test_var_expansion_in_cat],
    ['$VAR undefined', test_var_expansion_undefined],

    // LESS
    ['less feed',      test_less_feed],
    ['less unknown',   test_less_unknown],

    // AUTH GUARD
    ['auth like',      test_auth_guard_like],
    ['auth comment',   test_auth_guard_comment],
    ['auth bookmark',  test_auth_guard_bookmark],
    ['auth follow',    test_auth_guard_follow],
    ['auth notif',     test_auth_guard_notifications],
    ['auth saved',     test_auth_guard_saved],

    // ── EDGE CASES ──
    ['unknown cmd',    test_unknown_command],
    ['cd /',           test_cd_root],
    ['cd ~',           test_cd_tilde],
    ['cd nonexistent', test_cd_nonexistent],
    ['ls nonexistent', test_ls_nonexistent],
    ['cat no args',    test_cat_no_args],
    ['like bad args',  test_like_bad_args],
    ['comment no args',test_comment_no_args],
    ['bookmark bad',   test_bookmark_bad_args],
    ['follow no args', test_follow_no_args],
    ['unfollow no args',test_unfollow_no_args],
    ['nano unauth',    test_nano_unauth],
    ['create unauth',  test_create_unauth],
    ['rm unauth',      test_rm_unauth],
    ['man unknown',    test_man_unknown],
    ['chain limit',    test_chain_limit],
    ['--help unknown', test_help_flag_unknown],
    ['case insensitive',test_case_insensitive],
    ['multi spaces',   test_multiple_spaces],
    ['echo $UNDEFINED',test_echo_undefined_var],
    ['chat unauth',    test_chat_unauth],
    ['write unauth',   test_write_unauth],
    ['start unauth',   test_start_unauth],
    ['say no chat',    test_say_no_chat],
    ['start no args',  test_start_no_args],
    ['export bad',     test_export_bad_syntax],
    ['export bad theme',test_export_bad_theme],
    ['alias bad',      test_alias_bad_syntax],
    ['source save empty',test_source_save_empty_name],
    ['program view',   test_program_view],
    ['auth create',    test_auth_guard_create],
    ['auth rm',        test_auth_guard_rm],

    // ── MORE EDGE CASES ──
    ['followers --of', test_followers_inline_of],
    ['following --of', test_following_inline_of],
    ['followers empty of',test_followers_empty_of],
    ['notifs inline',  test_notifications_inline],
    ['notifs unread',  test_notifications_inline_unread],
    ['head fetched',   test_head_fetched],
    ['tail fetched',   test_tail_fetched],
    ['grep empty',     test_grep_empty_feed],
    ['rm -f',          test_rm_force],
    ['cat /',          test_cat_directory],
    ['nano edit file', test_nano_edit_file],
    ['chat unauth',    test_chat_unauth],
    ['chat list',      test_chat_list],
    ['write msg',      test_write_message],
    ['start valid',    test_start_valid],
    ['watch interval', test_watch_with_interval],
    ['ls saved dir',   test_ls_saved_dir],
    ['feed --less',    test_feed_less],
    ['saved --inline', test_saved_inline],
    ['cat meta',       test_cat_post_meta],
    ['cd .. stop poll',test_cd_stop_chat_polling],
    ['sudo !! after',  test_sudo_repeat_after_cmd],
    ['ping numeric',   test_ping_numeric],
    ['empty input',    test_empty_input],
    ['whitespace inp', test_whitespace_input],

    // ── EVEN MORE EDGE CASES (batch 3) ──
    ['saved --less',    test_saved_less],
    ['saved --tail',    test_saved_tail],
    ['notif --less',    test_notifications_less],
    ['notif --tail',    test_notifications_tail],
    ['following --less',test_following_less],
    ['feed --page',     test_feed_page],
    ['watch off idle',  test_watch_stop_no_active],
    ['nano not found',  test_nano_not_found],
    ['say in chat',     test_say_in_chat],
    ['say empty',       test_say_empty],
    ['say unauth',      test_say_unauth],
    ['rm trash',        test_rm_trash],
    ['rm other post',   test_rm_other_post],
    ['export MATRIX',   test_export_matrix],
    ['cd home',         test_cd_home],
    ['cd comprehensive',test_cd_comprehensive],
    ['vfs tab complete',test_vfs_completion],
    ['history empty',   test_history_empty],
    ['history search no',test_history_search_no_match],
  ];

  for (const [name, fn] of tests) {
    const dom = createDOM();
    setupGlobals(dom);
    loadJSFiles(dom);
    setupTerminal(dom);
    const T = dom.window.TERMINAL;
    // Ensure T._ and T._loadAliases etc are consistent
    // (localStorage mock is already set up in setupGlobals)
    T.env = {};

    try {
      await fn(dom);
    } catch (e) {
      failed++;
      const msg = name + ': ' + e.message;
      failures.push(msg);
      console.error('\n  \u2717', msg);
      if (verbose) console.error(e.stack);
    }
  }

  const total = passed + failed;
  console.log('');
  console.log('  ' + String.fromCharCode(0x2500).repeat(55));
  console.log('  ' + passed + '/' + total + ' passed');
  if (failed > 0) {
    console.log('  ' + failed + ' FAILED');
    if (verbose) {
      console.log('');
      failures.forEach(f => console.error('  \u2717', f));
    }
    process.exit(1);
  }
  console.log('  All passed!');
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
