#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
function createDOM() {
  const html = '<!DOCTYPE html><html><head><meta name="csrf-token" content="test-csrf"></head><body><div id="terminal-mode"><div id="termOutput"></div></div><div id="termBar"><div style="display:flex"><span id="termPrompt">guest@tty:~$</span><input id="termInput"></div></div></body></html>';
  return new JSDOM(html, { url: 'http://localhost:5000', pretendToBeVisual: true, runScripts: 'dangerously' });
}
const dom = createDOM();
const w = dom.window;
const store = {};
w.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, clear: () => { for (let k in store) delete store[k]; } };
w.sessionStorage = { getItem: () => null, setItem: () => {} };
Object.assign(w, { LOGIN_URL: '/login', HOME_URL: '/', API_ME_URL: '/auth/api/me', API_LOGIN_URL: '/auth/api/login', API_REGISTER_URL: '/auth/api/register', API_LOGOUT_URL: '/auth/api/logout', API_NOTIFICATIONS_URL: '/api/notifications', API_NOTIFICATIONS_UNREAD_URL: '/api/notifications/unread', API_USERS_SEARCH_URL: '/api/users/search', API_PUSH_SUBSCRIBE_URL: '/push/subscribe', API_FEED_URL: '/api/v1/posts', API_CHAT_LIST_URL: '/api/chat/list', LIKE_URL: '/like/0/', COMMENT_URL: '/comment/0/', SAVE_URL: '/save/0/', REPOST_URL: '/repost/0/', DELETE_POST_URL: '/delete/0', FOLLOW_URL: '/follow/', MARK_READ_URL: '/notif/read/0', MARK_ALL_READ_URL: '/notif/read/all', EDIT_COMMENT_URL: '/comment/edit/0', DELETE_COMMENT_URL: '/comment/delete/0', CHAT_START_URL: '/chat/start/', CHAT_SEND_URL: '/chat/send/0', CHAT_MESSAGES_URL: '/chat/messages/0', CHAT_TYPING_URL: '/chat/typing/0', STATIC_PROFILE_IMAGES: '/static/uploads/profile_images/', STATIC_DEFAULT_PROFILE: '/static/default-profile.png', CURRENT_USER_ID: 0, CURRENT_USERNAME: 'guest', POST_URL: '/api/v1/posts/0', PROFILE_URL: '/profile/', SETTINGS_URL: '/settings', SAVED_URL: '/saved', CHAT_PAGE_URL: '/chat', CREATE_POST_URL: '/create', EDIT_POST_URL: '/edit/0/', EDIT_PROFILE_URL: '/edit/profile', FOLLOWERS_URL: '/followers/', FOLLOWING_URL: '/following/', VAPID_PUBLIC_KEY: '' });
w.isAuthenticated = false;
const routes = new Map();
w.fetch = function(url, opts) {
  if (typeof url === 'string' && routes.has(url)) return Promise.resolve({ ok: true, json: () => Promise.resolve(routes.get(url)) });
  for (const [prefix, data] of routes) { if (typeof url === 'string' && url.startsWith(prefix)) return Promise.resolve({ ok: true, json: () => Promise.resolve(data) }); }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
};

const JS_DIR = path.resolve('app/static/js');
['terminal.js','terminal-vfs.js','terminal-nano.js','terminal-chat.js','terminal-help.js','terminal-navigation.js','terminal-commands.js'].forEach(f => w.eval(fs.readFileSync(path.join(JS_DIR, f), 'utf-8')));

const T = w.TERMINAL;
const doc = w.document;
T.addOutputLine = function(html) { doc.getElementById('termOutput').innerHTML += '<div class="tp-line">' + html + '</div>'; };
T.addSysLine = T.addOutputLine; T.addOutput = function(html) { doc.getElementById('termOutput').innerHTML += html; };
T.showLoading = function(){}; T.hideLoading = function(){}; T.toast = function(){};
T.env = {};

// Test: history empty
T.commandHistory = [];
T.processCommand('history');
console.log('HISTORY EMPTY TEXT:', doc.getElementById('termOutput').innerHTML.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());

// Test: sudo !!
T.clearOutput();
T.prevCmd = 'echo sudo_works';
T.processCommand('sudo !!');
console.log('SUDO TEXT:', doc.getElementById('termOutput').innerHTML.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());

// Test: follow
T.clearOutput();
T.isLoggedIn = true; T.username = 'testuser'; T.currentUserId = 1;
routes.set('/follow/alice', { status: 'followed', followers_count: 5 });
T.processCommand('follow alice');
setTimeout(() => {
  const txt = doc.getElementById('termOutput').innerHTML.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  console.log('FOLLOW TEXT:', txt);
}, 100);
