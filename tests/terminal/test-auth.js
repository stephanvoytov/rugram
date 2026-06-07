const { check, hasOutput, runCommand, setupLoggedIn, wait, nextTick } = require('./helpers');

// ──────────────────────────────────
// 1. AUTH: login, register, logout
// ──────────────────────────────────

async function test_login(dom) {
  const T = dom.window.__RT;
  dom.window.fetch.__mock('/api/v1/auth/login', { ok: true, user: { username: 'testuser', id: 1 } });
  dom.window.fetch.__mockPrefix('/api/v1/posts', { posts: [] });

  runCommand(dom, 'login testuser pass123');
  await nextTick(); await wait(15);

  check(T.isLoggedIn === true, 'login sets isLoggedIn');
  check(T.username === 'testuser', 'login sets username');
  check(T.cwd === 'posts', 'login sets cwd to posts');
  hasOutput(dom, 'Logged in as @testuser', 'login shows success msg');
}

async function test_login_error(dom) {
  const T = dom.window.__RT;
  dom.window.fetch.__mock('/api/v1/auth/login', { ok: false, error: 'Invalid credentials' });

  runCommand(dom, 'login baduser wrong');
  await nextTick(); await wait(15);

  check(T.isLoggedIn !== true, 'login error does NOT set isLoggedIn');
  hasOutput(dom, 'Invalid credentials', 'login shows error');
}

async function test_register(dom) {
  const T = dom.window.__RT;
  dom.window.fetch.__mock('/api/v1/auth/register', { ok: true, user: { username: 'newuser', id: 2 } });
  dom.window.fetch.__mockPrefix('/api/v1/posts', { posts: [] });

  runCommand(dom, 'register newuser new@mail.com secret');
  await nextTick(); await wait(15);

  check(T.isLoggedIn === true, 'register sets isLoggedIn');
  check(T.username === 'newuser', 'register sets username');
  hasOutput(dom, 'Registered and logged in as @newuser', 'register shows success msg');
}

async function test_logout(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/v1/auth/logout', { ok: true });

  runCommand(dom, 'logout');
  await nextTick(); await wait(15);

  check(T.isLoggedIn === false, 'logout clears isLoggedIn');
  check(T.username === 'guest', 'logout resets username to guest');
  hasOutput(dom, 'Logged out', 'logout shows success msg');
}

module.exports = [
  ['login', test_login],
  ['login error', test_login_error],
  ['register', test_register],
  ['logout', test_logout],
];
