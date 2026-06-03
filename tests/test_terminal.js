#!/usr/bin/env node
/**
 * Terminal integration tests.
 *
 * Runs the terminal JS in a headless JSDOM environment,
 * simulates commands, and checks rendered output.
 *
 * Usage: node tests/test_terminal.js
 *        node tests/test_terminal.js --verbose
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// ── Config ──
const JS_DIR = path.resolve(__dirname, '..', 'app', 'static', 'js');
// Must match HTML loading order in base.html
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

// ── DOM & Environment ──
function createDOM() {
  const html = `<!DOCTYPE html>
<html><head>
  <meta name="csrf-token" content="test-csrf-token">
</head><body>
  <div id="terminal-mode">
    <div id="termOutput"></div>
  </div>
  <div id="termBar">
    <div style="display:flex;align-items:center;gap:6px;">
      <span id="termPrompt">guest@tty:~$</span>
      <input type="text" id="termInput">
    </div>
  </div>
</body></html>`;
  return new JSDOM(html, {
    url: 'http://localhost:5000',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });
}

function setupGlobals(dom) {
  const w = dom.window;
  // localStorage mock
  const store = {};
  w.localStorage = {
    getItem: k => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (let k in store) delete store[k]; },
  };
  w.sessionStorage = { getItem: () => null, setItem: () => {} };

  // URL constants (mirrors base.html)
  const urls = {
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
  };
  Object.assign(w, urls);
  w.isAuthenticated = false;

  // Mock fetch with overridable per-URL responses
  const routes = new Map();
  w.fetch = function(url, opts) {
    if (typeof url === 'string' && routes.has(url)) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(routes.get(url)),
      });
    }
    // Try matching by prefix
    for (const [prefix, data] of routes) {
      if (typeof url === 'string' && url.startsWith(prefix)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(data),
        });
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
    try {
      dom.window.eval(code);
    } catch (e) {
      console.error(`ERROR loading ${file}:`, e.message);
      process.exit(1);
    }
  });
}

function setupTerminal(dom) {
  const T = dom.window.TERMINAL;
  T.addOutputLine = function(html) {
    const el = dom.window.document.getElementById('termOutput');
    el.innerHTML += '<div class="tp-line">' + html + '</div>';
  };
  T.addSysLine = T.addOutputLine;
  T.addOutput = function(html) {
    const el = dom.window.document.getElementById('termOutput');
    el.innerHTML += html;
  };
  T.clearOutput = function() {
    dom.window.document.getElementById('termOutput').innerHTML = '';
  };
  T.showLoading = function() {};
  T.hideLoading = function() {};
  T.toast = function() {};
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
  if (cond) { passed++; if (verbose) console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

function hasOutput(dom, text, msg) {
  const html = outputHTML(dom);
  const txt = outputText(dom);
  // Normalize spaces
  const normHtml = html.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const normTxt = txt.replace(/\s+/g, ' ');
  check(normHtml.includes(text) || normTxt.includes(text), msg || `output contains "${text}"`);
}

function notOutput(dom, text, msg) {
  const html = outputHTML(dom);
  check(!html.includes(text), msg || `output does NOT contain "${text}"`);
}

// ── Mock data ──
function makePost(id, overrides) {
  return Object.assign({
    id, author: 'testuser2', text: 'Hello world! This is my first post on Rugram!',
    time: '2026-06-03T00:00:00', likes: 5, comments: 2, reposts: 1,
    is_liked: false, is_saved: false, is_reposted: false, image: null,
  }, overrides || {});
}

// ══════════════════════════════════════════════
//  TESTS
// ══════════════════════════════════════════════

async function test_help(dom) {
  runCommand(dom, 'help');
  hasOutput(dom, 'feed', 'help shows feed');
  hasOutput(dom, 'login', 'help shows login');
  hasOutput(dom, 'cat', 'help shows cat');
}

async function test_ls_root(dom) {
  runCommand(dom, 'ls');
  hasOutput(dom, 'posts/', 'ls root shows posts/');
  hasOutput(dom, 'saved/', 'ls root shows saved/');
  hasOutput(dom, 'profile/', 'ls root shows profile/');
  hasOutput(dom, 'trash/', 'ls root shows trash/');
}

async function test_ls_in_posts(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1), makePost(2)];
  T.cwd = 'posts';
  runCommand(dom, 'ls');
  hasOutput(dom, '1.post', 'ls posts shows 1.post');
  hasOutput(dom, '2.post', 'ls posts shows 2.post');
}

async function test_cd(dom) {
  const T = dom.window.TERMINAL;
  runCommand(dom, 'cd posts');
  check(T.cwd === 'posts', 'cd posts → cwd=posts');

  runCommand(dom, 'cd ..');
  check(T.cwd === '', 'cd .. → cwd=root');

  runCommand(dom, 'cd /profile');
  check(T.cwd === 'profile', 'cd /profile → cwd=profile');

  runCommand(dom, 'cd ////posts');
  check(T.cwd === 'posts', 'cd ////posts normalizes to posts');
}

async function test_login(dom) {
  const T = dom.window.TERMINAL;
  dom.window.fetch.__mock('/auth/api/login', { ok: true, user: { username: 'testuser', id: 1 } });
  dom.window.fetch.__mockPrefix('/api/v1/posts', { posts: [] });  // fetchFeedFromAPI

  runCommand(dom, 'login testuser pass123');
  await wait(50);

  check(T.isLoggedIn === true, 'login → isLoggedIn=true');
  check(T.username === 'testuser', 'login → username=testuser');
  check(T.cwd === 'posts', 'login → cwd=posts');
}

async function test_feed_inline(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1, { author: 'alice' }), makePost(2, { author: 'bob', text: 'Second post text' })];

  runCommand(dom, 'feed --inline');
  hasOutput(dom, '#1', 'feed inline shows post #1');
  hasOutput(dom, '#2', 'feed inline shows post #2');
  hasOutput(dom, '@alice', 'feed inline shows @alice');
  hasOutput(dom, '@bob', 'feed inline shows @bob');
  hasOutput(dom, 'Second post text', 'feed inline shows full text');
}

async function test_feed_program(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(42, { text: 'Program view post' })];

  runCommand(dom, 'feed');
  await wait(50);

  check(T._lessActive === true, 'feed opens less mode');
  hasOutput(dom, '#42', 'feed program shows #42');
  hasOutput(dom, 'Program view post', 'feed program shows text');
  hasOutput(dom, 'l:like', 'feed footer has l:like');
  hasOutput(dom, 's:save', 'feed footer has s:save');
  hasOutput(dom, 'r:repost', 'feed footer has r:repost');
  hasOutput(dom, 'q quit', 'feed footer has q:quit');
}

async function test_feed_filter_by(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [
    makePost(1, { author: 'alice' }),
    makePost(2, { author: 'bob' }),
    makePost(3, { author: 'alice', text: 'Another from alice' }),
  ];

  runCommand(dom, 'feed --by alice');
  hasOutput(dom, 'alice', 'filter by alice shows alice posts');
  hasOutput(dom, 'Another from alice', 'filter shows alice post 2');
}

async function test_feed_with_image(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(7, { text: 'Image post', image: '/static/test.jpg' })];

  runCommand(dom, 'feed --inline');
  hasOutput(dom, 'Image post', 'inline feed shows text');
  hasOutput(dom, '[img]', 'inline feed shows [img] indicator');
  hasOutput(dom, '#7', 'inline feed shows #7');
}

async function test_feed_search(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [
    makePost(1, { text: 'Hello world' }),
    makePost(2, { text: 'Goodbye world' }),
  ];

  runCommand(dom, 'feed --inline --search Hello');
  hasOutput(dom, 'Hello', 'search shows matched post');
  notOutput(dom, 'Goodbye', 'search hides non-matched post');
}

async function test_followers(dom) {
  const T = dom.window.TERMINAL;
  T.isLoggedIn = true;
  T.username = 'testuser';
  dom.window.fetch.__mockPrefix('/api/followers/', { users: [
    { username: 'follower1', is_online: true, description: 'First follower' },
    { username: 'follower2', is_online: false },
  ]});

  runCommand(dom, 'followers --inline');
  await wait(100);

  hasOutput(dom, 'follower1', 'followers shows follower1');
  hasOutput(dom, 'follower2', 'followers shows follower2');
}

async function test_notifications(dom) {
  const T = dom.window.TERMINAL;
  T.isLoggedIn = true;
  T.username = 'testuser';
  dom.window.fetch.__mock('/api/notifications', { notifications: [
    { id: 1, type: 'like', actor: { username: 'alice' }, post_id: 42, is_read: false, created_date: '2026-06-03T10:00:00' },
    { id: 2, type: 'follow', actor: { username: 'bob' }, post_id: null, is_read: true, created_date: '2026-06-02T10:00:00' },
  ]});

  runCommand(dom, 'notifications --inline --unread');
  await nextTick();
  await wait(50);

  hasOutput(dom, 'alice', 'notifications shows alice');
}

async function test_saved(dom) {
  const T = dom.window.TERMINAL;
  T.isLoggedIn = true;
  T.username = 'testuser';
  dom.window.fetch.__mock('/api/saved', { posts: [
    makePost(1, { text: 'Saved first' }),
    makePost(2, { text: 'Saved second' }),
  ]});

  runCommand(dom, 'saved --inline');
  await wait(100);

  hasOutput(dom, 'Saved first', 'saved shows post 1');
  hasOutput(dom, 'Saved second', 'saved shows post 2');
}

async function test_info(dom) {
  runCommand(dom, 'info');
  hasOutput(dom, 'VFS', 'info mentions VFS');
  hasOutput(dom, 'posts/', 'info shows posts/');
  hasOutput(dom, 'saved/', 'info shows saved/');
  hasOutput(dom, 'cat', 'info shows cat');
  hasOutput(dom, 'nano', 'info shows nano');
}

async function test_man(dom) {
  runCommand(dom, 'man feed');
  hasOutput(dom, 'feed', 'man feed shows feed');
  hasOutput(dom, '--tail', 'man feed shows --tail flag');
}

async function test_less_feed(dom) {
  const T = dom.window.TERMINAL;
  T.feedData = [makePost(1), makePost(2), makePost(3)];

  runCommand(dom, 'less feed');
  await wait(50);
  check(T._lessActive === true, 'less feed activates less mode');
  check(T._lessType === 'feed', 'less feed type is feed');
}

async function test_unfollow(dom) {
  const T = dom.window.TERMINAL;
  T.isLoggedIn = true;
  T.username = 'testuser';
  dom.window.fetch.__mock('/follow/testuser2', { ok: true, action: 'unfollow' });

  runCommand(dom, 'unfollow testuser2');
  await wait(50);

  hasOutput(dom, 'unfollow', 'unfollow command works');
}

async function test_clear(dom) {
  const T = dom.window.TERMINAL;
  T.addOutputLine('some content');
  check(outputHTML(dom).length > 0, 'output has content before clear');
  runCommand(dom, 'clear');
  // After clear, output should be empty (or just the prompt)
  check(outputHTML(dom).length < 50 || outputHTML(dom) === '', 'clear empties output');
}

// ══════════════════════════════════════════════
//  RUNNER
// ══════════════════════════════════════════════

async function run() {
  console.log('\n  ╭─────────────────────────────╮');
  console.log('  │   Terminal Test Suite        │');
  console.log('  ╰─────────────────────────────╯\n');

  const tests = [
    ['help',          test_help],
    ['ls root',       test_ls_root],
    ['ls in posts',   test_ls_in_posts],
    ['cd',            test_cd],
    ['login',         test_login],
    ['info',          test_info],
    ['man',           test_man],
    ['clear',         test_clear],
    ['feed inline',   test_feed_inline],
    ['feed program',  test_feed_program],
    ['feed by',       test_feed_filter_by],
    ['feed search',   test_feed_search],
    ['feed image',    test_feed_with_image],
    ['followers',     test_followers],
    ['notifications', test_notifications],
    ['saved',         test_saved],
    ['less feed',     test_less_feed],
    ['unfollow',      test_unfollow],
  ];

  for (const [name, fn] of tests) {
    if (verbose) process.stdout.write(`  ${name}: `);
    const dom = createDOM();
    setupGlobals(dom);
    loadJSFiles(dom);
    setupTerminal(dom);
    try {
      await fn(dom);
      if (verbose) console.log(`  ✓ ${name}`);
    } catch (e) {
      failed++;
      console.error(`\n  ✗ ${name}: ${e.message}`);
      if (verbose) console.error(e.stack);
    }
  }

  const total = passed + failed;
  console.log(`\n  ${'─'.repeat(40)}`);
  console.log(`  ${passed}/${total} passed`);
  if (failed > 0) {
    console.log(`  ${failed} FAILED`);
    process.exit(1);
  }
  console.log('  All passed!');
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
