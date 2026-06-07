#!/usr/bin/env node
/**
 * Comprehensive Terminal Test Suite — covers ALL commands.
 *
 * Test categories are in tests/terminal/test-*.js, each exporting
 * an array of [name, asyncFn] tuples.
 *
 * Usage: node tests/test_terminal.js [--verbose]
 */

const { stats, setVerbose, createDOM, setupGlobals, loadJSFiles, setupTerminal } = require('./terminal/helpers');

const verbose = process.argv.includes('--verbose');
setVerbose(verbose);

const testModules = [
  require('./terminal/test-auth'),
  require('./terminal/test-posts'),
  require('./terminal/test-social'),
  require('./terminal/test-feed'),
  require('./terminal/test-nav'),
  require('./terminal/test-shell'),
  require('./terminal/test-edge'),
];

const tests = testModules.flat();

async function run() {
  console.log('');
  console.log('  ' + String.fromCharCode(0x250D) + String.fromCharCode(0x2500).repeat(55) + String.fromCharCode(0x2511));
  console.log('  ' + String.fromCharCode(0x2502) + '  Terminal Test Suite — All Commands       ' + String.fromCharCode(0x2502));
  console.log('  ' + String.fromCharCode(0x2515) + String.fromCharCode(0x2500).repeat(55) + String.fromCharCode(0x2519));
  console.log('');

  for (const [name, fn] of tests) {
    const dom = createDOM();
    setupGlobals(dom);
    loadJSFiles(dom);
    setupTerminal(dom);
    const T = dom.window.__RT;
    T.env = {};

    try {
      await fn(dom);
    } catch (e) {
      stats.failed++;
      const msg = name + ': ' + e.message;
      stats.failures.push(msg);
      console.error('\n  \u2717', msg);
      if (verbose) console.error(e.stack);
    }
  }

  const total = stats.passed + stats.failed;
  console.log('');
  console.log('  ' + String.fromCharCode(0x2500).repeat(55));
  console.log('  ' + stats.passed + '/' + total + ' passed');
  if (stats.failed > 0) {
    console.log('  ' + stats.failed + ' FAILED');
    if (verbose) {
      console.log('');
      stats.failures.forEach(f => console.error('  \u2717', f));
    }
    process.exit(1);
  }
  console.log('  All passed!');
  process.exit(0);
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
