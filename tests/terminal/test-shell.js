#!/usr/bin/env node
/**
 * Shell, utility, and info terminal tests.
 * Extracted from tests/test_terminal.js.
 */

const { check, hasOutput, notOutput, runCommand, setupLoggedIn, wait, nextTick, outputHTML, makePost } = require('./helpers');

// ──────────────────────────────────
// 6. INFO: whoami, id, info, fortune
// ──────────────────────────────────

async function test_whoami_logged_in(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/v1/auth/me', { authenticated: true, user: { username: 'testuser', id: 1 } });
  runCommand(dom, 'whoami');
  hasOutput(dom, 'User:', 'whoami shows User:');
}

async function test_whoami_guest(dom) {
  const T = dom.window.__RT;
  runCommand(dom, 'whoami');
  hasOutput(dom, 'Not logged in', 'whoami guest shows message');
  hasOutput(dom, 'feed', 'whoami guest shows guest commands');
}

async function test_id(dom) {
  const T = dom.window.__RT;
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
  const T = dom.window.__RT;
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
  const T = dom.window.__RT;
  T.commandHistory = ['help', 'ls', 'feed --inline'];
  runCommand(dom, 'history');
  hasOutput(dom, 'help', 'history shows help');
  hasOutput(dom, 'feed', 'history shows feed');
  hasOutput(dom, 'commands', 'history shows count');
}

async function test_history_clear(dom) {
  const T = dom.window.__RT;
  T.commandHistory = ['help', 'ls'];
  runCommand(dom, 'history -c');
  check(T.commandHistory.length === 0, 'history -c clears');
  hasOutput(dom, 'history cleared', 'history -c shows message');
}

async function test_history_search(dom) {
  const T = dom.window.__RT;
  T.commandHistory = ['help', 'feed --inline', 'ls -l'];
  runCommand(dom, 'history --search feed');
  hasOutput(dom, 'feed', 'history --search shows feed');
  notOutput(dom, 'help', 'history --search hides non-match');
}

async function test_uptime(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1)];
  T.commandHistory = ['help', 'ls'];
  T.startTime = Date.now() - 3600000; // 1 hour ago
  runCommand(dom, 'uptime');
  hasOutput(dom, 'commands', 'uptime shows commands');
  hasOutput(dom, 'user', 'uptime shows user');
}

async function test_export(dom) {
  const T = dom.window.__RT;
  runCommand(dom, 'export MYVAR=hello');
  check(T.env.MYVAR === 'hello', 'export sets env var');
  hasOutput(dom, 'MYVAR=hello', 'export shows confirmation');
}

async function test_export_no_args(dom) {
  const T = dom.window.__RT;
  T.env = { TEST: 'value' };
  runCommand(dom, 'export');
  hasOutput(dom, 'TEST=value', 'export list shows vars');
}

async function test_export_theme(dom) {
  const T = dom.window.__RT;
  runCommand(dom, 'export THEME=light');
  check(T.env.THEME === 'light', 'export THEME sets env');
}

async function test_export_lang(dom) {
  const T = dom.window.__RT;
  runCommand(dom, 'export LANG=ru');
  check(T.env.LANG === 'ru', 'export LANG sets env');
}

async function test_clear(dom) {
  const T = dom.window.__RT;
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

// ──────────────────────────────────
// 9. SHELL: alias, unalias, source, echo
// ──────────────────────────────────

async function test_alias(dom) {
  const T = dom.window.__RT;
  runCommand(dom, 'alias ll="ls -l"');
  hasOutput(dom, 'll aliased', 'alias creates alias');
}

async function test_alias_list(dom) {
  const T = dom.window.__RT;
  T._saveAliases({ ll: 'ls -l', g: 'grep' });
  runCommand(dom, 'alias');
  hasOutput(dom, 'll', 'alias list shows ll');
  hasOutput(dom, 'g', 'alias list shows g');
}

async function test_alias_empty(dom) {
  const T = dom.window.__RT;
  T._saveAliases({});
  runCommand(dom, 'alias');
  hasOutput(dom, 'no aliases', 'alias empty shows message');
}

async function test_unalias(dom) {
  const T = dom.window.__RT;
  T._saveAliases({ ll: 'ls -l' });
  runCommand(dom, 'unalias ll');
  hasOutput(dom, 'removed', 'unalias removes alias');
  check(T._loadAliases().ll === undefined, 'unalias actually removes');
}

async function test_unalias_not_found(dom) {
  const T = dom.window.__RT;
  T._saveAliases({});
  runCommand(dom, 'unalias nonexistent');
  hasOutput(dom, 'not found', 'unalias unknown shows error');
}

async function test_source_script(dom) {
  const T = dom.window.__RT;
  const scripts = JSON.stringify({ test: 'echo Hello from source' });
  dom.window.localStorage.setItem('rugram_scripts', scripts);
  runCommand(dom, 'source test');
  hasOutput(dom, 'Running script', 'source runs script');
}

async function test_source_list(dom) {
  const T = dom.window.__RT;
  const scripts = JSON.stringify({ hello: 'echo hi', test: 'echo test' });
  dom.window.localStorage.setItem('rugram_scripts', scripts);
  runCommand(dom, 'source');
  hasOutput(dom, 'hello', 'source list shows hello');
  hasOutput(dom, 'Scripts:', 'source list shows header');
}

async function test_source_empty(dom) {
  const T = dom.window.__RT;
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
  const T = dom.window.__RT;
  T.feedData = [makePost(1, { text: 'First' }), makePost(2, { text: 'Second' }), makePost(3, { text: 'Third' })];
  runCommand(dom, 'head -n 2');
  hasOutput(dom, 'First', 'head shows first');
  hasOutput(dom, 'Second', 'head shows second');
  // third should not appear in the first 2
}

async function test_head_default(dom) {
  const T = dom.window.__RT;
  const posts = Array.from({ length: 10 }, (_, i) => makePost(i + 1, { text: 'Post ' + (i + 1) }));
  T.feedData = posts;
  runCommand(dom, 'head');
  // Default head is 5 posts
  hasOutput(dom, 'Post 1', 'head default shows first');
  hasOutput(dom, 'Post 5', 'head default shows 5th');
}

async function test_tail(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1, { text: 'First' }), makePost(2, { text: 'Second' }), makePost(3, { text: 'Third' })];
  runCommand(dom, 'tail -n 2');
  hasOutput(dom, 'Second', 'tail shows second');
  hasOutput(dom, 'Third', 'tail shows third');
}

// ──────────────────────────────────
// 11. WATCH / PING / TOP (basic)
// ──────────────────────────────────

async function test_watch(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1)];
  runCommand(dom, 'watch echo hello');
  hasOutput(dom, 'watch:', 'watch shows banner');
  hasOutput(dom, 'hello', 'watch runs command');
  hasOutput(dom, 'watch stop', 'watch shows stop hint');
  // Cleanup
  if (T.watchInterval) { clearInterval(T.watchInterval); T.watchInterval = null; }
}

async function test_watch_stop(dom) {
  const T = dom.window.__RT;
  T.watchInterval = setInterval(function(){}, 1000);
  runCommand(dom, 'watch stop');
  hasOutput(dom, 'watch stopped', 'watch stop shows message');
  check(T.watchInterval === null, 'watch stop clears interval');
}

async function test_ping_local(dom) {
  runCommand(dom, 'ping');
  await nextTick(); await wait(500);
  hasOutput(dom, 'PING 127.0.0.1', 'ping localhost shows header');
  hasOutput(dom, 'icmp_seq=1', 'ping localhost shows seq starting at 1');
  hasOutput(dom, '56(84) bytes of data', 'ping shows unix-style header');
}

async function test_ping_user(dom) {
  dom.window.fetch.__mock('/api/v1/users/search?q=alice', { users: [
    { username: 'alice', is_online: true },
  ]});
  runCommand(dom, 'ping alice');
  await nextTick(); await wait(300);
  hasOutput(dom, 'PING @alice', 'ping user shows header');
}

async function test_ping_unreachable(dom) {
  dom.window.fetch.__mock('/api/v1/users/search?q=ghost', { users: [] });
  runCommand(dom, 'ping ghost');
  await nextTick(); await wait(500);
  hasOutput(dom, 'packet loss', 'ping unreachable shows loss');
}

async function test_top(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1, { likes: 10 }), makePost(2, { likes: 5 })];
  T.commandHistory = ['help', 'ls'];
  runCommand(dom, 'top');
  hasOutput(dom, '-- top --', 'top shows header');
  hasOutput(dom, 'press any key to exit', 'top shows exit hint');
}

module.exports = [
  ['whoami', test_whoami_logged_in],
  ['whoami guest', test_whoami_guest],
  ['id', test_id],
  ['id guest', test_id_guest],
  ['id @user', test_id_with_user],
  ['fortune', test_fortune],
  ['info', test_info],
  ['echo', test_echo],
  ['echo $ENV', test_echo_with_env],
  ['date', test_date],
  ['date -u', test_date_utc],
  ['history', test_history],
  ['history clear', test_history_clear],
  ['history search', test_history_search],
  ['uptime', test_uptime],
  ['export', test_export],
  ['export list', test_export_no_args],
  ['export theme', test_export_theme],
  ['export lang', test_export_lang],
  ['clear', test_clear],
  ['man', test_man],
  ['man -k', test_man_list],
  ['help', test_help],
  ['alias', test_alias],
  ['alias list', test_alias_list],
  ['alias empty', test_alias_empty],
  ['unalias', test_unalias],
  ['unalias error', test_unalias_not_found],
  ['source', test_source_script],
  ['source list', test_source_list],
  ['source empty', test_source_empty],
  ['source save', test_source_save],
  ['source rm', test_source_rm],
  ['source error', test_source_not_found],
  ['head', test_head],
  ['head default', test_head_default],
  ['tail', test_tail],
  ['watch', test_watch],
  ['watch stop', test_watch_stop],
  ['ping local', test_ping_local],
  ['ping user', test_ping_user],
  ['ping unreach', test_ping_unreachable],
  ['top', test_top],
];
