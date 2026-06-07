const { check, hasOutput, runCommand, setupLoggedIn, wait, nextTick, makePost } = require('./helpers');

// ════════════════════════════════════════════════════
//  POST TESTS — extracted from tests/test_terminal.js
// ════════════════════════════════════════════════════

// ──────────────────────────────────
// POST: like, comment, bookmark, create, rm, cat, less, postview
// ──────────────────────────────────

async function test_like(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/like/1/', { status: 'liked', likes_count: 6 });

  runCommand(dom, 'like 1');
  await nextTick(); await wait(15);

  hasOutput(dom, '+ Post #1 — 6 likes', 'like shows result');
}

async function test_like_unliked(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/like/1/', { status: 'unliked', likes_count: 4 });

  runCommand(dom, 'like 1');
  await nextTick(); await wait(15);

  hasOutput(dom, '- Post #1 — 4 likes', 'unlike shows result');
}

async function test_comment(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/comment/1/', { ok: true });

  runCommand(dom, 'comment 1 "Nice post!"');
  await nextTick(); await wait(15);

  hasOutput(dom, 'Comment added to post #1', 'comment shows result');
}

async function test_bookmark(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/save/1/', { is_saved: true });

  runCommand(dom, 'bookmark 1');
  await nextTick(); await wait(15);

  hasOutput(dom, '* Post #1 saved', 'bookmark shows result');
}

async function test_bookmark_unsave(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/save/2/', { is_saved: false });

  runCommand(dom, 'bookmark 2');
  await nextTick(); await wait(15);

  hasOutput(dom, '# Post #2 unsaved', 'unbookmark shows result');
}

async function test_create_shows_nano(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  runCommand(dom, 'create');
  await nextTick(); await wait(15);
  check(T.nanoOverlay !== null, 'create opens nano editor');
  if (T.nanoOverlay) { T.nanoOverlay.remove(); T.nanoOverlay = null; }
}

async function test_cat_by_path(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(5, { text: 'Post content for cat test' })];
  T.cwd = 'posts';
  dom.window.fetch.__mock('/api/v1/posts/5', { post: makePost(5, { text: 'Post content for cat test' }) });
  runCommand(dom, 'cat 5');
  await nextTick(); await wait(15);
  hasOutput(dom, 'Post content for cat test', 'cat post shows content');
  hasOutput(dom, '#5', 'cat shows post id');
}

async function test_cat_not_found(dom) {
  const T = dom.window.__RT;
  T.cwd = 'posts';
  dom.window.fetch.__mock('/api/v1/posts/999', { post: { is_deleted: true } });
  runCommand(dom, 'cat 999');
  await nextTick(); await wait(15);
  hasOutput(dom, 'not found', 'cat unknown shows error');
}

async function test_less(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1), makePost(2), makePost(3)];
  runCommand(dom, 'less feed');
  await nextTick(); await wait(15);
  check(T._lessActive === true, 'less opens pager');
  check(T._lessType === 'feed', 'less type is feed');
  T._exitLessMode();
}

async function test_less_by_number(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(42, { text: 'Less by number' })];
  runCommand(dom, 'less 42');
  await nextTick(); await wait(15);
  check(T._lessActive === true, 'less by id opens pager');
  hasOutput(dom, '#42', 'less by id shows post');
  T._exitLessMode();
}

async function test_rm_post(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  T.feedData = [makePost(1, { author: 'testuser' })];
  T.cwd = 'posts';
  dom.window.fetch.__mock('/delete/1', { ok: true });

  runCommand(dom, 'rm -f 1');
  await nextTick(); await wait(15);

  hasOutput(dom, 'Post #1 permanently deleted', 'rm -f deletes post');
}

async function test_rm_comment(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/comment/123', { ok: true });

  runCommand(dom, 'rm comment 123');
  await nextTick(); await wait(15);

  hasOutput(dom, 'Comment #123 deleted', 'rm comment deletes comment');
}

async function test_rm_usage(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  runCommand(dom, 'rm');
  hasOutput(dom, 'usage:', 'rm without args shows usage');
}

module.exports = [
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
];
