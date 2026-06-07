#!/usr/bin/env node
/**
 * Feed, saved, notifications, and grep terminal tests.
 * Extracted from tests/test_terminal.js.
 */

const { check, hasOutput, notOutput, runCommand, setupLoggedIn, wait, nextTick, makePost } = require('./helpers');

// ──────────────────────────────────
// PROGRAMS: feed, saved, notifications, grep
// ──────────────────────────────────

async function test_feed_inline(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1, { author: 'alice' }), makePost(2, { author: 'bob', text: 'Second post text' })];
  runCommand(dom, 'feed --inline');
  hasOutput(dom, '#1', 'feed inline shows #1');
  hasOutput(dom, '#2', 'feed inline shows #2');
  hasOutput(dom, '@alice', 'feed inline shows @alice');
  hasOutput(dom, '@bob', 'feed inline shows @bob');
  hasOutput(dom, 'Second post text', 'feed inline shows text');
}

async function test_feed_program(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(42, { text: 'Program view post' })];
  runCommand(dom, 'feed');
  await nextTick(); await wait(15);
  check(T._lessActive === true, 'feed program opens less mode');
  hasOutput(dom, '#42', 'feed program shows #42');
  hasOutput(dom, 'Program view post', 'feed program shows text');
  hasOutput(dom, 'l:like', 'feed footer has l:like');
  hasOutput(dom, 'q quit', 'feed footer has q:quit');
  T._exitLessMode();
}

async function test_feed_filter_by(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1, { author: 'alice' }), makePost(2, { author: 'bob' }), makePost(3, { author: 'alice' })];
  runCommand(dom, 'feed --by alice --inline');
  hasOutput(dom, '@alice', 'feed filter shows alice');
  notOutput(dom, '@bob', 'feed filter hides bob');
}

async function test_feed_search(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1, { text: 'Hello world' }), makePost(2, { text: 'Goodbye world' })];
  runCommand(dom, 'feed --inline --search Hello');
  hasOutput(dom, 'Hello', 'feed search shows match');
  notOutput(dom, 'Goodbye', 'feed search hides non-match');
}

async function test_feed_image(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(7, { text: 'Image post', image: '/static/test.jpg' })];
  runCommand(dom, 'feed --inline');
  hasOutput(dom, '[img]', 'feed inline shows [img] indicator');
  hasOutput(dom, '#7', 'feed inline shows #7');
}

async function test_feed_tail(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1), makePost(2), makePost(3)];
  runCommand(dom, 'feed --inline --tail 2');
  hasOutput(dom, '#3', 'feed tail shows last');
  notOutput(dom, '#1', 'feed tail hides first');
}

async function test_feed_empty(dom) {
  const T = dom.window.__RT;
  T.feedData = [];
  dom.window.fetch.__mockPrefix('/api/v1/posts', { posts: [] });
  runCommand(dom, 'feed --inline');
  await nextTick(); await wait(30);
  hasOutput(dom, 'no posts', 'feed empty shows message');
}

async function test_saved(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/v1/saved', { posts: [
    makePost(10, { text: 'Saved first' }),
    makePost(11, { text: 'Saved second' }),
  ]});

  runCommand(dom, 'saved --inline');
  await nextTick(); await wait(30);

  hasOutput(dom, '#10', 'saved shows #10');
  hasOutput(dom, 'Saved first', 'saved shows first text');
  hasOutput(dom, '#11', 'saved shows #11');
}

async function test_saved_empty(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/v1/saved', { posts: [] });

  runCommand(dom, 'saved --inline');
  await nextTick(); await wait(30);

  hasOutput(dom, 'No saved', 'saved empty shows message');
}

async function test_saved_search(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/v1/saved', { posts: [
    makePost(10, { text: 'Cats are great' }),
    makePost(11, { text: 'Dogs are cool' }),
  ]});

  runCommand(dom, 'saved --inline --search Cats');
  await nextTick(); await wait(30);

  hasOutput(dom, 'Cats', 'saved search shows match');
  notOutput(dom, 'Dogs', 'saved search hides non-match');
}

async function test_notifications(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/v1/notifications', { notifications: [
    { id: 1, type: 'like', actor: { username: 'alice' }, post_id: 42, is_read: false, created_date: '2026-06-03T10:00:00' },
    { id: 2, type: 'follow', actor: { username: 'bob' }, post_id: null, is_read: true, created_date: '2026-06-02T10:00:00' },
  ]});

  runCommand(dom, 'notifications --inline --unread');
  await nextTick(); await wait(30);

  hasOutput(dom, 'alice', 'notifications shows alice');
  notOutput(dom, 'bob', 'notifications unread hides bob');
}

async function test_notifications_empty(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/v1/notifications', { notifications: [] });

  runCommand(dom, 'notifications --inline');
  await nextTick(); await wait(30);

  hasOutput(dom, 'No notifications', 'notifications empty shows message');
}

async function test_grep(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1, { text: 'Hello world' }), makePost(2, { text: 'Goodbye world' })];
  runCommand(dom, 'grep "Hello"');
  hasOutput(dom, 'Hello', 'grep shows match');
  hasOutput(dom, '#1', 'grep shows post id');
}

async function test_grep_no_match(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1, { text: 'Hello world' })];
  runCommand(dom, 'grep "zzzz"');
  hasOutput(dom, 'no matches', 'grep empty shows message');
}

module.exports = [
  ['feed inline', test_feed_inline],
  ['feed program', test_feed_program],
  ['feed filter', test_feed_filter_by],
  ['feed search', test_feed_search],
  ['feed image', test_feed_image],
  ['feed tail', test_feed_tail],
  ['feed empty', test_feed_empty],
  ['saved', test_saved],
  ['saved empty', test_saved_empty],
  ['saved search', test_saved_search],
  ['notifications', test_notifications],
  ['notifications empty', test_notifications_empty],
  ['grep', test_grep],
  ['grep no match', test_grep_no_match],
];
