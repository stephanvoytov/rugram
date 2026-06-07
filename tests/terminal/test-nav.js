#!/usr/bin/env node
/**
 * Navigation tests (cd, ls, pwd) extracted from the main terminal test suite.
 */

const { check, hasOutput, runCommand, setupLoggedIn, wait, nextTick, makePost } = require('./helpers');

async function test_cd(dom) {
  const T = dom.window.__RT;
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
  const T = dom.window.__RT;
  T.cwd = 'profile';
  runCommand(dom, 'cd posts');
  check(T.cwd === 'profile/posts', 'cd posts from profile/ goes to profile/posts');
  runCommand(dom, 'cd ..');
  check(T.cwd === 'profile', 'cd .. from profile/posts goes back to profile');
  runCommand(dom, 'cd /posts');
  check(T.cwd === 'posts', 'cd /posts from anywhere goes to root posts');
}

async function test_ls_root(dom) {
  const T = dom.window.__RT;
  T.cwd = '';
  runCommand(dom, 'ls');
  hasOutput(dom, 'posts/', 'ls root shows posts/');
  hasOutput(dom, 'saved/', 'ls root shows saved/');
  hasOutput(dom, 'profile/', 'ls root shows profile/');
}

async function test_ls_in_posts(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1), makePost(2)];
  T.cwd = 'posts';
  runCommand(dom, 'ls');
  hasOutput(dom, '1.post', 'ls posts shows 1.post');
  hasOutput(dom, '2.post', 'ls posts shows 2.post');
}

async function test_ls_detail(dom) {
  const T = dom.window.__RT;
  T.feedData = [makePost(1)];
  T.cwd = 'posts';
  runCommand(dom, 'ls -l');
  hasOutput(dom, '1.post', 'ls -l shows file');
  hasOutput(dom, 'entries', 'ls -l shows count');
}

async function test_pwd(dom) {
  const T = dom.window.__RT;
  T.cwd = 'profile';
  runCommand(dom, 'pwd');
  hasOutput(dom, '~/profile', 'pwd shows current dir');
}

module.exports = [
  ['cd', test_cd],
  ['cd from subdir', test_cd_from_subdir],
  ['ls root', test_ls_root],
  ['ls posts', test_ls_in_posts],
  ['ls detail', test_ls_detail],
  ['pwd', test_pwd],
];
