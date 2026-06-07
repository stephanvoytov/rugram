#!/usr/bin/env node
/**
 * Edge case, auth guard, special commands, and comprehensive tests.
 * Extracted from tests/test_terminal.js — the largest file, ~83 test functions.
 */

const { check, hasOutput, notOutput, runCommand, setupLoggedIn, wait, nextTick, makePost, outputHTML, outputText } = require('./helpers');

// ──────────────────────────────────
// 12. SPECIAL: gui, sudo !!, --help, &&
// ──────────────────────────────────

async function test_gui(dom) {
  const T = dom.window.__RT;
  const modeChanges = [];
  T.setMode = function(m) { modeChanges.push(m); };
  runCommand(dom, 'gui');
  check(modeChanges.includes('gui'), 'gui switches to GUI mode');
}

async function test_exit(dom) {
  const T = dom.window.__RT;
  const modeChanges = [];
  T.setMode = function(m) { modeChanges.push(m); };
  runCommand(dom, 'exit');
  check(modeChanges.includes('gui'), 'exit switches to GUI mode');
}

async function test_sudo_repeat(dom) {
  const T = dom.window.__RT;
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
  const T = dom.window.__RT;
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
  const T = dom.window.__RT;
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
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  T.env.TEST_DIR = 'profile';
  T.cwd = '';
  T.clearOutput();
  runCommand(dom, 'cat $TEST_DIR/info');
  hasOutput(dom, 'testuser', '$TEST_DIR expands before cat command (shows profile)');
  delete T.env.TEST_DIR;
}

async function test_var_expansion_undefined(dom) {
  const T = dom.window.__RT;
  T.clearOutput();
  runCommand(dom, 'echo $NOEXIST');
  hasOutput(dom, '$NOEXIST', 'undefined $VAR keeps literal (intentional)');
}

// ──────────────────────────────────
// 13. LESS VIEW — tests for less mode feed/followers/notifications
// ──────────────────────────────────

async function test_less_feed(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1), makePost(2), makePost(3)];
  runCommand(dom, 'less feed');
  await nextTick(); await wait(15);
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
  const T = dom.window.__RT;
  runCommand(dom, 'cd /');
  check(T.cwd === '', 'cd / goes to root');
}

async function test_cd_tilde(dom) {
  const T = dom.window.__RT;
  runCommand(dom, 'cd ~');
  check(T.cwd === '', 'cd ~ goes to root');
}

async function test_cd_nonexistent(dom) {
  const T = dom.window.__RT;
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
  const T = dom.window.__RT;
  T.feedData = [makePost(1), makePost(2)];
  runCommand(dom, 'FEED --inline');
  hasOutput(dom, '#1', 'FEED (uppercase) works');
}

async function test_multiple_spaces(dom) {
  runCommand(dom, 'echo    hello');
  hasOutput(dom, 'hello', 'echo with multiple spaces');
}

async function test_echo_undefined_var(dom) {
  const T = dom.window.__RT;
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
  const T = dom.window.__RT;
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
  const T = dom.window.__RT;
  T.feedData = [makePost(1), makePost(2)];
  runCommand(dom, 'feed --less');
  await nextTick(); await wait(15);
  hasOutput(dom, 'Feed', 'feed --less shows feed title');
  hasOutput(dom, '2 items', 'feed --less shows count');
}

async function test_saved_inline(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/v1/saved', { posts: [makePost(10, { text: 'inline saved post' })] });
  runCommand(dom, 'saved --inline');
  await nextTick(); await wait(30);
  hasOutput(dom, '10', 'saved --inline shows post id');
  hasOutput(dom, 'inline saved', 'saved --inline shows text');
}

async function test_cat_post_meta(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1, { likes: 42, comments: 7, time: '2026-06-03T12:00:00' })];
  runCommand(dom, 'cat posts/1/.meta');
  hasOutput(dom, 'likes=42', 'cat .meta shows likes');
  hasOutput(dom, 'comments=7', 'cat .meta shows comments');
}

async function test_cd_stop_chat_polling(dom) {
  const T = dom.window.__RT;
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
  const T = dom.window.__RT;
  T.isLoggedIn = true;
  T.username = 'testuser';
  T.feedData = [makePost(1)];
  runCommand(dom, 'echo hello');
  await nextTick(); await wait(15);
  T.clearOutput();
  T.isLoggedIn = false; // to not get auth error for any command
  runCommand(dom, 'sudo !!');
  hasOutput(dom, 'hello', 'sudo !! repeats last command');
}

async function test_ping_numeric(dom) {
  runCommand(dom, 'ping 127.0.0.1');
  await nextTick(); await wait(30);
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
  dom.window.fetch.__mockPrefix('/api/v1/followers/', { users: [
    { username: 'fan1', is_online: true },
    { username: 'fan2', is_online: false },
  ]});
  runCommand(dom, 'followers --inline --of @alice');
  await nextTick(); await wait(30);
  hasOutput(dom, 'fan1', 'followers --of shows user');
  hasOutput(dom, 'fan2', 'followers --of shows second user');
}

async function test_following_inline_of(dom) {
  dom.window.fetch.__mockPrefix('/api/v1/following/', { users: [
    { username: 'hero1', is_online: true },
  ]});
  runCommand(dom, 'following --inline --of @bob');
  await nextTick(); await wait(30);
  hasOutput(dom, 'hero1', 'following --of shows user');
}

async function test_followers_empty_of(dom) {
  dom.window.fetch.__mockPrefix('/api/v1/followers/', { users: [] });
  runCommand(dom, 'followers --inline --of @nobody');
  await nextTick(); await wait(30);
  hasOutput(dom, 'No followers', 'followers empty --of shows msg');
}

async function test_notifications_inline(dom) {
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/v1/notifications', { notifications: [
    { id: 1, type: 'like', actor: { username: 'alice' }, post_id: 10,
      is_read: false, created_date: '2026-06-03T12:00:00' },
  ]});
  runCommand(dom, 'notifications --inline');
  await nextTick(); await wait(30);
  hasOutput(dom, 'alice', 'notifications --inline shows actor');
  hasOutput(dom, 'liked', 'notifications --inline shows type');
}

async function test_notifications_inline_unread(dom) {
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/v1/notifications', { notifications: [
    { id: 1, type: 'like', actor: { username: 'bob' }, post_id: 10,
      is_read: false, created_date: '2026-06-03T12:00:00' },
    { id: 2, type: 'follow', actor: { username: 'carol' }, post_id: null,
      is_read: true, created_date: '2026-06-03T11:00:00' },
  ]});
  runCommand(dom, 'notifications --inline --unread');
  await nextTick(); await wait(30);
  hasOutput(dom, 'bob', 'unread shows bob');
  notOutput(dom, 'carol', 'unread filters out read');
}

async function test_head_fetched(dom) {
  const T = dom.window.__RT;
  T.feedData = [];
  // Mock returns posts so fetchFeedFromAPI breaks the recursion
  dom.window.fetch.__mockPrefix('/api/v1/posts', { posts: [makePost(1), makePost(2)] });
  runCommand(dom, 'head');
  await nextTick(); await wait(30);
  hasOutput(dom, '#1', 'head fetches and shows posts');
}

async function test_tail_fetched(dom) {
  const T = dom.window.__RT;
  T.feedData = [];
  dom.window.fetch.__mockPrefix('/api/v1/posts', { posts: [makePost(1), makePost(2)] });
  runCommand(dom, 'tail');
  await nextTick(); await wait(30);
  hasOutput(dom, '#2', 'tail fetches and shows last posts');
}

async function test_grep_empty_feed(dom) {
  const T = dom.window.__RT;
  T.feedData = [];
  // Mock returns SOME posts so fetchFeedFromAPI doesn't recurse infinitely
  dom.window.fetch.__mockPrefix('/api/v1/posts', { posts: [makePost(1, { text: 'hello world' })] });
  runCommand(dom, 'grep "hello"');
  await nextTick(); await wait(30);
  hasOutput(dom, '#1', 'grep fetches and finds match');
}

async function test_rm_force(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  T.feedData = [makePost(99)];
  runCommand(dom, 'rm -f 99');
  hasOutput(dom, '99', 'rm -f mentions post');
}

async function test_cat_directory(dom) {
  // Root has content callback, so cat / shows home. Use a plain dir instead.
  // 'trash' has no content callback when empty -> shows "Is a directory"
  runCommand(dom, 'cat trash');
  hasOutput(dom, 'Is a directory', 'cat trash shows is a directory error');
}

async function test_nano_edit_file(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  runCommand(dom, 'nano posts/1.post');
  await nextTick(); await wait(15);
  // Should resolve VFS path and open editor — just check no error
  check(T.nanoOverlay !== null || outputHTML(dom).includes('No such file') === false,
    'nano path resolves without error');
  if (T.nanoOverlay) { T.nanoOverlay.remove(); T.nanoOverlay = null; }
}

async function test_chat_list(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  // IMPORTANT: last_message_time and last_message are TOP-LEVEL chat fields, not nested!
  dom.window.fetch.__mock('/api/v1/chat/list', { chats: [
    { id: 1, other_user: { username: 'alice', is_online: true },
      last_message_time: '2026-06-03T10:00:00Z', last_message: 'hi', unread_count: 0 },
  ]});
  runCommand(dom, 'chat');
  await nextTick(); await wait(30);
  const txt = outputText(dom);
  const ok = txt.includes('alice');
  check(ok, 'chat list shows conversations');
}

async function test_write_message(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mockPrefix('/chat/start/', { chat_id: 5 });
  dom.window.fetch.__mock('/chat/5/send', { ok: true });
  runCommand(dom, 'write @alice hello!');
  await nextTick(); await wait(30);
  hasOutput(dom, 'alice', 'write sends to user');
}

async function test_start_valid(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/chat/start/bob', { chat_id: 5 });
  dom.window.fetch.__mockPrefix('/chat/5/messages', { messages: [], other_user: { username: 'bob' } });
  runCommand(dom, 'start @bob');
  await nextTick(); await wait(30);
  // start -> startChatWithUser -> loadChatMessages which clears output and shows chat
  const txt = outputText(dom);
  check(txt.includes('bob'), 'start shows chat with bob');
  // Stop polling interval if started
  if (T.chatPollInterval) { clearInterval(T.chatPollInterval); T.chatPollInterval = null; }
  // Exit program view
  if (T._lessActive) T._exitLessMode();
  if (T._programDepth > 0) T.exitProgramView();
}

async function test_watch_with_interval(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1)];
  runCommand(dom, 'watch -n 1 echo interval_test');
  await nextTick(); await wait(15);
  hasOutput(dom, 'watch:', 'watch -n shows banner');
  hasOutput(dom, 'interval_test', 'watch -n runs command');
  if (T.watchInterval) { clearInterval(T.watchInterval); T.watchInterval = null; }
}

async function test_ls_saved_dir(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  // ls in saved dir — use path arg instead of changing cwd
  dom.window.fetch.__mock('/api/v1/saved', { posts: [] });
  runCommand(dom, 'ls saved');
  // Should either list contents or show empty info
  const html = outputHTML(dom);
  // Just check it doesn't error
  check(!html.includes('No such'), 'ls saved does not error');
}

// ── EVEN MORE EDGE CASES ──

async function test_saved_less(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/v1/saved', { posts: [makePost(10)] });
  runCommand(dom, 'saved --less');
  await nextTick(); await wait(30);
  check(T._lessActive === true, 'saved --less opens pager');
  check(T._lessTitle.indexOf('Saved') >= 0, 'saved --less shows Saved title');
  if (T._lessActive) { T._exitLessMode(); T.exitProgramView(); }
}

async function test_saved_tail(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/v1/saved', { posts: [makePost(1), makePost(2), makePost(3)] });
  runCommand(dom, 'saved --tail 1');
  await nextTick(); await wait(30);
  hasOutput(dom, '#3', 'saved --tail 1 shows last post');
  check(outputHTML(dom).indexOf('#1') < 0 && outputHTML(dom).indexOf('#2') < 0,
    'saved --tail 1 hides earlier posts');
}

async function test_notifications_less(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/v1/notifications', {
    notifications: [
      { id: 101, actor: { username: 'alice' }, type: 'like', post_id: 1,
        created_date: '2026-06-03T10:00:00Z', is_read: false },
    ]
  });
  runCommand(dom, 'notifications --less');
  await nextTick(); await wait(30);
  check(T._lessActive === true, 'notifications --less opens pager');
  check(T._lessTitle.indexOf('Notifications') >= 0, 'notifications --less shows Notifications title');
  if (T._lessActive) { T._exitLessMode(); T.exitProgramView(); }
}

async function test_notifications_tail(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mock('/api/v1/notifications', {
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
  await nextTick(); await wait(30);
  hasOutput(dom, '@b', 'notifications --tail 2 shows second item');
  hasOutput(dom, '@c', 'notifications --tail 2 shows third item');
  check(outputHTML(dom).indexOf('@a') < 0, 'notifications --tail 2 hides first item');
}

async function test_following_less(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  dom.window.fetch.__mockPrefix('/api/v1/following/', { users: [
    { username: 'alice', is_online: true },
    { username: 'bob', is_online: false },
  ]});
  runCommand(dom, 'following --less');
  await nextTick(); await wait(30);
  check(T._lessActive === true, 'following --less opens pager');
  check(T._lessTitle.indexOf('Following') >= 0, 'following --less shows Following title');
  if (T._lessActive) { T._exitLessMode(); T.exitProgramView(); }
}

async function test_feed_page(dom) {
  const T = dom.window.__RT;
  T.feedData = [];
  for (let i = 1; i <= 12; i++) T.feedData.push(makePost(i, { text: 'post ' + i }));
  T.isLoggedIn = true;
  runCommand(dom, 'feed --inline --page 1');
  await nextTick(); await wait(15);
  hasOutput(dom, '#1', 'feed --page 1 shows first post');
  hasOutput(dom, '#10', 'feed --page 1 shows tenth post');
  check(outputHTML(dom).indexOf('#11') < 0, 'feed --page 1 hides 11th post');
}

async function test_watch_stop_no_active(dom) {
  const T = dom.window.__RT;
  runCommand(dom, 'watch off');
  hasOutput(dom, 'No active watch', 'watch off no active shows message');
}

async function test_nano_not_found(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  runCommand(dom, 'nano posts/999.post');
  hasOutput(dom, 'No such file', 'nano nonexistent path shows error');
}

async function test_say_in_chat(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  T.cwd = 'chat/5';
  dom.window.fetch.__mock('/chat/5/send', { ok: true });
  runCommand(dom, 'say hello from terminal');
  await nextTick(); await wait(30);
  hasOutput(dom, 'hello from terminal', 'say in chat shows message text');
  hasOutput(dom, 'me now', 'say shows timestamp');
}

async function test_say_empty(dom) {
  const T = dom.window.__RT;
  setupLoggedIn(dom);
  T.cwd = 'chat/5';
  runCommand(dom, 'say');
  hasOutput(dom, 'message text required', 'say without text shows error');
}

async function test_say_unauth(dom) {
  const T = dom.window.__RT;
  T.cwd = 'chat/5';
  runCommand(dom, 'say hello');
  hasOutput(dom, 'Login required', 'say without login shows error');
}

async function test_rm_trash(dom) {
  const T = dom.window.__RT;
  T.isLoggedIn = true;
  T.username = 'testuser';
  T.cwd = 'posts';
  T.feedData = [makePost(1, { author: 'testuser' })];
  runCommand(dom, 'rm 1');
  await nextTick(); await wait(15);
  hasOutput(dom, 'moved to trash', 'rm 1 moves own post to trash');
  hasOutput(dom, 'Restore', 'rm shows restore hint');
}

async function test_rm_other_post(dom) {
  const T = dom.window.__RT;
  T.isLoggedIn = true;
  T.username = 'testuser';
  T.cwd = 'posts';
  T.feedData = [makePost(1, { author: 'otheruser' })];
  runCommand(dom, 'rm 1');
  await nextTick(); await wait(15);
  hasOutput(dom, 'cannot delete', 'rm other user post shows permission error');
}

async function test_export_matrix(dom) {
  const T = dom.window.__RT;
  T.env = {};
  runCommand(dom, 'export MATRIX=1');
  check(T.env.MATRIX === '1', 'export MATRIX=1 sets env');
}

async function test_cd_home(dom) {
  const T = dom.window.__RT;
  T.cwd = 'posts';
  T.updatePrompt();
  runCommand(dom, 'cd home');
  check(T.cwd === '', 'cd home goes to root');
}

async function test_vfs_completion(dom) {
  const T = dom.window.__RT;
  T.cwd = '';

  var res = T._completeVFSPath('po', '');
  check(res.length > 0 && res[0] === 'posts/', 'tab complete "po" -> "posts/"');

  var res2 = T._completeVFSPath('sav', '');
  check(res2.length > 0 && res2[0] === 'saved/', 'tab complete "sav" -> "saved/"');

  var res3 = T._completeVFSPath('x', '');
  check(res3.length === 0, 'tab complete "x" -> no matches');
}

async function test_cd_comprehensive(dom) {
  const T = dom.window.__RT;
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

  // B2. cd .. from sub-subdir -> parent
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

  // B7. cd ~ from subdir -> root
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

  // C1. cd into file -> error
  T.cwd = 'profile';
  T.clearOutput();
  runCommand(dom, 'cd info');
  hasOutput(dom, 'Not a directory', 'C1: cd info from profile/');
  check(T.cwd === 'profile', 'C1b: cwd unchanged after cd into file');

  // C2. cd nonexistent section -> error
  T.clearOutput();
  runCommand(dom, 'cd nonexistent_dir');
  hasOutput(dom, 'No such file or directory', 'C2: cd nonexistent_dir');
  check(T.cwd === 'profile', 'C2b: cwd unchanged after cd nonexistent');

  // C3. cd ../nonexistent -> error
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

  // D3. cd .. from @user/posts -> back to @user
  runCommand(dom, 'cd ..');
  check(T.cwd === '@testuser2', 'D3: cd .. from @user/posts');

  // D4. cd ../posts from @user -> root/posts
  runCommand(dom, 'cd ../posts');
  check(T.cwd === 'posts', 'D4: cd ../posts from @testuser2');

  // Restore
  T.cwd = '';
}

async function test_history_empty(dom) {
  const T = dom.window.__RT;
  T.commandHistory = [];
  T.addOutputLine('<span class="tp-prompt">$</span><span class="tp-cmd">history</span>');
  T._dispatchCommand('history');
  hasOutput(dom, 'history is empty', 'history with no commands shows empty');
}

async function test_history_search_no_match(dom) {
  const T = dom.window.__RT;
  T.commandHistory = ['help', 'ls', 'feed'];
  T.addOutputLine('<span class="tp-prompt">$</span><span class="tp-cmd">history --search nonexistent</span>');
  T._dispatchCommand('history --search nonexistent');
  hasOutput(dom, 'no matches', 'history --search no match shows error');
}

module.exports = [
  ['gui', test_gui],
  ['exit', test_exit],
  ['sudo repeat', test_sudo_repeat],
  ['sudo no prev', test_sudo_no_prev],
  ['--help flag', test_help_flag],
  ['&& chain', test_chained_commands],
  ['; chain', test_chain_semicolon],
  ['|| chain', test_chain_or],
  ['$VAR in cat', test_var_expansion_in_cat],
  ['$VAR undefined', test_var_expansion_undefined],
  ['less feed', test_less_feed],
  ['less unknown', test_less_unknown],
  ['auth like', test_auth_guard_like],
  ['auth comment', test_auth_guard_comment],
  ['auth bookmark', test_auth_guard_bookmark],
  ['auth follow', test_auth_guard_follow],
  ['auth notif', test_auth_guard_notifications],
  ['auth saved', test_auth_guard_saved],
  ['unknown cmd', test_unknown_command],
  ['cd /', test_cd_root],
  ['cd ~', test_cd_tilde],
  ['cd nonexistent', test_cd_nonexistent],
  ['ls nonexistent', test_ls_nonexistent],
  ['cat no args', test_cat_no_args],
  ['like bad args', test_like_bad_args],
  ['comment no args', test_comment_no_args],
  ['bookmark bad', test_bookmark_bad_args],
  ['follow no args', test_follow_no_args],
  ['unfollow no args', test_unfollow_no_args],
  ['nano unauth', test_nano_unauth],
  ['create unauth', test_create_unauth],
  ['rm unauth', test_rm_unauth],
  ['man unknown', test_man_unknown],
  ['chain limit', test_chain_limit],
  ['--help unknown', test_help_flag_unknown],
  ['case insensitive', test_case_insensitive],
  ['multi spaces', test_multiple_spaces],
  ['echo $UNDEFINED', test_echo_undefined_var],
  ['chat unauth', test_chat_unauth],
  ['write unauth', test_write_unauth],
  ['start unauth', test_start_unauth],
  ['say no chat', test_say_no_chat],
  ['start no args', test_start_no_args],
  ['export bad', test_export_bad_syntax],
  ['export bad theme', test_export_bad_theme],
  ['alias bad', test_alias_bad_syntax],
  ['source save empty', test_source_save_empty_name],
  ['program view', test_program_view],
  ['auth create', test_auth_guard_create],
  ['auth rm', test_auth_guard_rm],
  ['followers --of', test_followers_inline_of],
  ['following --of', test_following_inline_of],
  ['followers empty of', test_followers_empty_of],
  ['notifs inline', test_notifications_inline],
  ['notifs unread', test_notifications_inline_unread],
  ['head fetched', test_head_fetched],
  ['tail fetched', test_tail_fetched],
  ['grep empty', test_grep_empty_feed],
  ['rm -f', test_rm_force],
  ['cat /', test_cat_directory],
  ['nano edit file', test_nano_edit_file],
  ['chat list', test_chat_list],
  ['write msg', test_write_message],
  ['start valid', test_start_valid],
  ['watch interval', test_watch_with_interval],
  ['ls saved dir', test_ls_saved_dir],
  ['feed --less', test_feed_less],
  ['saved --inline', test_saved_inline],
  ['cat meta', test_cat_post_meta],
  ['cd .. stop poll', test_cd_stop_chat_polling],
  ['sudo !! after', test_sudo_repeat_after_cmd],
  ['ping numeric', test_ping_numeric],
  ['empty input', test_empty_input],
  ['whitespace inp', test_whitespace_input],
  ['saved --less', test_saved_less],
  ['saved --tail', test_saved_tail],
  ['notif --less', test_notifications_less],
  ['notif --tail', test_notifications_tail],
  ['following --less', test_following_less],
  ['feed --page', test_feed_page],
  ['watch off idle', test_watch_stop_no_active],
  ['nano not found', test_nano_not_found],
  ['say in chat', test_say_in_chat],
  ['say empty', test_say_empty],
  ['say unauth', test_say_unauth],
  ['rm trash', test_rm_trash],
  ['rm other post', test_rm_other_post],
  ['export MATRIX', test_export_matrix],
  ['cd home', test_cd_home],
  ['cd comprehensive', test_cd_comprehensive],
  ['vfs tab complete', test_vfs_completion],
  ['history empty', test_history_empty],
  ['history search no', test_history_search_no_match],
];
