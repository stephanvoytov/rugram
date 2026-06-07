const { check, hasOutput, runCommand, setupLoggedIn, wait, nextTick } = require('./helpers');

// ──────────────────────────────────
// SOCIAL: follow, unfollow, followers, following, neofetch
// ──────────────────────────────────

async function test_follow(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/follow/alice', { status: 'followed', followers_count: 42 });

  runCommand(dom, 'follow alice');
  await nextTick(); await wait(15);

  hasOutput(dom, '@alice', 'follow shows result');
}

async function test_follow_error(dom) {
  const T = dom.window.__RT;
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
  await nextTick(); await wait(30);

  hasOutput(dom, 'not found', 'follow error shows message');
  dom.window.fetch = origFetch;
}

async function test_unfollow(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/follow/testuser2', { status: 'unfollowed', followers_count: 10 });

  runCommand(dom, 'unfollow testuser2');
  await nextTick(); await wait(15);

  hasOutput(dom, 'followers', 'unfollow shows result');
}

async function test_followers_inline(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mockPrefix('/api/v1/followers/', { users: [
    { username: 'fan1', is_online: true, description: 'Big fan' },
    { username: 'fan2', is_online: false },
  ]});

  runCommand(dom, 'followers --inline');
  await nextTick(); await wait(30);

  hasOutput(dom, 'fan1', 'followers inline shows fan1');
  hasOutput(dom, 'fan2', 'followers inline shows fan2');
}

async function test_followers_less(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mockPrefix('/api/v1/followers/', { users: [
    { username: 'fan1', is_online: true },
  ]});

  runCommand(dom, 'followers --less');
  await nextTick(); await wait(30);

  check(T._lessActive === true, 'followers --less opens pager');
  T._exitLessMode();
}

async function test_followers_empty(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mockPrefix('/api/v1/followers/', { users: [] });

  runCommand(dom, 'followers --inline');
  await nextTick(); await wait(30);

  hasOutput(dom, 'No followers', 'followers empty shows message');
}

async function test_following_inline(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mockPrefix('/api/v1/following/', { users: [
    { username: 'hero1', is_online: true },
    { username: 'hero2', is_online: false, description: 'Cool person' },
  ]});

  runCommand(dom, 'following --inline');
  await nextTick(); await wait(30);

  hasOutput(dom, 'hero1', 'following inline shows hero1');
  hasOutput(dom, 'hero2', 'following inline shows hero2');
}

async function test_following_empty(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mockPrefix('/api/v1/following/', { users: [] });

  runCommand(dom, 'following --inline');
  await nextTick(); await wait(30);

  hasOutput(dom, 'Not following', 'following empty shows message');
}

async function test_neofetch(dom) {
  const T = dom.window.__RT;
  dom.window.fetch.__mock('/api/v1/users/search?q=alice', { users: [
    { username: 'alice', is_online: true, profile_image: null },
  ]});

  runCommand(dom, 'neofetch alice');
  await nextTick(); await wait(30);

  hasOutput(dom, 'User:', 'neofetch shows header');
  hasOutput(dom, '@alice', 'neofetch shows username');
}

async function test_neofetch_not_found(dom) {
  const T = dom.window.__RT;
  dom.window.fetch.__mock('/api/v1/users/search?q=nobody', { users: [] });

  runCommand(dom, 'neofetch nobody');
  await nextTick(); await wait(30);

  hasOutput(dom, 'user not found', 'neofetch missing user shows error');
}

module.exports = [
  ['follow', test_follow],
  ['follow error', test_follow_error],
  ['unfollow', test_unfollow],
  ['followers', test_followers_inline],
  ['followers less', test_followers_less],
  ['followers empty', test_followers_empty],
  ['following', test_following_inline],
  ['following empty', test_following_empty],
  ['neofetch', test_neofetch],
  ['neofetch not found', test_neofetch_not_found],
];
