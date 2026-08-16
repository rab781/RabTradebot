const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = process.cwd();

const files = {
  html: path.join(root, 'public', 'index.html'),
  js: path.join(root, 'public', 'dashboard.js'),
  css: path.join(root, 'public', 'dashboard.css'),
  pkg: path.join(root, 'package.json'),
  lock: path.join(root, 'package-lock.json'),
};

function read(file) {
  assert.ok(
    fs.existsSync(file),
    `Required file missing: ${path.relative(root, file)}`
  );
  return fs.readFileSync(file, 'utf8');
}

function pass(name) {
  console.log(`PASS  ${name}`);
}

function fail(name, error) {
  console.error(`FAIL  ${name}`);
  console.error(`      ${error.message}`);
  process.exitCode = 1;
}

function test(name, fn) {
  try {
    fn();
    pass(name);
  } catch (error) {
    fail(name, error);
  }
}

const html = read(files.html);
const js = read(files.js);
const css = read(files.css);
const pkgText = read(files.pkg);
const lockText = read(files.lock);

test('dashboard JavaScript parses with Node/V8', () => {
  new vm.Script(js, {
    filename: 'public/dashboard.js',
  });
});

test('WEB2-B served dashboard assets exist', () => {
  assert.ok(html.includes('<title>RabTradebot | Operator Dashboard</title>'));
  assert.ok(css.length > 0);
  assert.ok(js.length > 0);
});

test('dashboard is explicitly read-only', () => {
  assert.ok(html.includes('READ ONLY'));
  assert.ok(html.includes('Inspection only'));

  assert.doesNotMatch(
    html,
    /<button[^>]*>\s*(BUY|SELL|PAUSE|STOP|CLOSE|EMERGENCY)/i
  );
});

test('browser consumes canonical WEB1 endpoints', () => {
  assert.ok(js.includes("system: '/api/system/status'"));
  assert.ok(js.includes("trading: '/api/trading/state'"));
  assert.ok(js.includes("'/api/trading/microstructure/'"));
});

test('browser does not consume legacy dashboard state endpoints', () => {
  [
    '/api/dashboard',
    '/api/trades',
    '/api/portfolio',
    '/api/signals',
    '/api/stats',
  ].forEach((endpoint) => {
    assert.ok(
      !js.includes(endpoint),
      `Legacy endpoint still present: ${endpoint}`
    );
  });
});

test('browser does not subscribe to legacy Socket.IO state', () => {
  assert.ok(!html.includes('socket.io'));
  assert.ok(!js.includes('socket.io'));
  assert.ok(!js.includes('io('));
});

test('browser network method is GET-only', () => {
  assert.ok(js.includes("method: 'GET'"));

  [
    "method: 'POST'",
    "method: 'PUT'",
    "method: 'PATCH'",
    "method: 'DELETE'",
  ].forEach((method) => {
    assert.ok(
      !js.includes(method),
      `Mutable HTTP method found: ${method}`
    );
  });
});

test('WEB2-B has explicit request timeout protection', () => {
  assert.ok(js.includes('const REQUEST_TIMEOUT_MS = 5000;'));
  assert.ok(js.includes('new AbortController()'));
  assert.ok(js.includes('signal: controller.signal'));
  assert.ok(js.includes('Request timeout from '));
});

test('WEB2-B has explicit freshness threshold', () => {
  assert.ok(js.includes('const STALE_AFTER_MS = 10000;'));
  assert.ok(html.includes('id="freshnessBadge"'));
  assert.ok(js.includes('lastSuccessfulRefreshAt'));
  assert.ok(js.includes('updateFreshnessIndicator'));
});

test('stale transport cannot leave displayed NEW ENTRY as ALLOWED', () => {
  const match = js.match(
    /function markCanonicalDataStale\(\)\s*\{([\s\S]*?)\n\}/
  );

  assert.ok(match, 'markCanonicalDataStale() not found');

  const body = match[1];

  assert.ok(
    body.includes('el.entryBadge'),
    'stale handler does not touch entry badge'
  );

  assert.ok(
    body.includes("'STALE'"),
    'stale handler does not mark state STALE'
  );

  assert.ok(
    !body.includes("'ALLOWED'"),
    'stale handler must never preserve ALLOWED'
  );
});

test('failed canonical refresh enters stale state', () => {
  const refreshMatch = js.match(
    /async function refreshAll\(\)\s*\{([\s\S]*?)\n\}/
  );

  assert.ok(refreshMatch, 'refreshAll() not found');
  assert.ok(
    refreshMatch[1].includes('markCanonicalDataStale()'),
    'refresh failure path does not call markCanonicalDataStale()'
  );
});

test('successful canonical refresh records freshness timestamp', () => {
  assert.ok(
    js.includes('lastSuccessfulRefreshAt =\n      Date.now();') ||
    js.includes('lastSuccessfulRefreshAt = Date.now();'),
    'successful refresh does not record Date.now()'
  );
});

test('last-known exposure remains rendered instead of being erased on stale transport', () => {
  const staleMatch = js.match(
    /function markCanonicalDataStale\(\)\s*\{([\s\S]*?)\n\}/
  );

  assert.ok(staleMatch);
  const body = staleMatch[1];

  assert.ok(!body.includes('positionsBody'));
  assert.ok(!body.includes('renderPositions'));
  assert.ok(!body.includes('clear('));
});

test('TensorFlow native dependency is no longer declared', () => {
  const pkg = JSON.parse(pkgText);
  const lock = JSON.parse(lockText);

  assert.equal(
    pkg.dependencies?.['@tensorflow/tfjs-node'],
    undefined,
    '@tensorflow/tfjs-node still exists in package.json'
  );

  assert.equal(
    lock.packages?.['node_modules/@tensorflow/tfjs-node'],
    undefined,
    '@tensorflow/tfjs-node still exists in package-lock.json'
  );
});

test('pure TensorFlow.js dependency remains declared', () => {
  const pkg = JSON.parse(pkgText);

  assert.ok(
    pkg.dependencies?.['@tensorflow/tfjs'],
    '@tensorflow/tfjs is missing from package.json'
  );
});

if (process.exitCode) {
  console.error('');
  console.error('WEB2-B STATIC GATE: FAILED');
  process.exit(process.exitCode);
}

console.log('');
console.log('WEB2-B STATIC GATE: PASS');
console.log('15 checks passed using Node built-ins only.');
console.log('No node_modules/Jest/ts-jest required.');
console.log('');
console.log('Still NOT covered by this static gate:');
console.log('  - TypeScript compile/build');
console.log('  - Jest integration tests');
console.log('  - backend endpoint execution');
console.log('  - full regression suite');
