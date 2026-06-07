/**
 * Vitest entry point — imports all 7 test modules and registers each test.
 * Each test gets a fresh DOM + JS environment (matching the old runner's behavior).
 */

const helpers = require('./helpers');
const testAuth = require('./test-auth');
const testPosts = require('./test-posts');
const testSocial = require('./test-social');
const testFeed = require('./test-feed');
const testNav = require('./test-nav');
const testShell = require('./test-shell');
const testEdge = require('./test-edge');

const ALL_TESTS = [
  ['auth',   testAuth],
  ['posts',  testPosts],
  ['social', testSocial],
  ['feed',   testFeed],
  ['nav',    testNav],
  ['shell',  testShell],
  ['edge',   testEdge],
];

let dom;

// Fresh DOM + JS for every test (matches old runner behavior)
beforeEach(() => {
  dom = helpers.createDOM();
  helpers.setupGlobals(dom);
  helpers.loadJSFiles(dom);
  helpers.setupTerminal(dom);
  const T = dom.window.__RT;
  T.env = {};
});

describe('Terminal', () => {
  ALL_TESTS.forEach(([category, tests]) => {
    describe(category, () => {
      tests.forEach(([name, fn]) => {
        it(name, async () => {
          await fn(dom);
        });
      });
    });
  });
});
