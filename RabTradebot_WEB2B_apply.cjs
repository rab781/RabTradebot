const fs = require('fs');
const path = require('path');

const CHECK_ONLY = process.argv.includes('--check');
const root = process.cwd();
const indexPath = path.join(root, 'public', 'index.html');
const cssPath = path.join(root, 'public', 'dashboard.css');
const jsPath = path.join(root, 'public', 'dashboard.js');
const testPath = path.join(root, 'tests', 'webDashboard.web2.test.ts');

function fail(message) {
  throw new Error(`[WEB2-B] ${message}`);
}

function read(file) {
  if (!fs.existsSync(file)) fail(`Required file not found: ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

function once(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) fail(`${label}: expected one anchor, found ${count}. No files were changed.`);
  return source.replace(from, to);
}

let html = read(indexPath);
let css = read(cssPath);
let js = read(jsPath);
let test = read(testPath);

for (const fingerprint of [
  '<title>RabTradebot | Operator Dashboard</title>',
  'Canonical execution state · Binance Spot · LONG / FLAT',
  'id="refreshButton"',
  'id="entryBadge"',
  'id="lastUpdated"',
]) {
  if (!html.includes(fingerprint)) fail(`WEB2-A v2 HTML fingerprint missing: ${fingerprint}`);
}

for (const fingerprint of [
  'const POLL_MS = 3000;',
  "system: '/api/system/status'",
  "trading: '/api/trading/state'",
  "'/api/trading/microstructure/'",
  "method: 'GET'",
  'async function refreshAll()',
  'function renderMicrostructure(view)',
]) {
  if (!js.includes(fingerprint)) fail(`WEB2-A v2 JS fingerprint missing: ${fingerprint}`);
}

if (!test.includes('WEB2-A canonical read-only dashboard')) {
  fail('WEB2-A test fingerprint missing.');
}

html = once(
  html,
`      <div class="top-actions">
        <span class="badge neutral">READ ONLY</span>
        <button id="refreshButton" type="button">
          Refresh
        </button>
      </div>`,
`      <div class="top-actions">
        <span class="badge neutral">READ ONLY</span>
        <span id="freshnessBadge" class="badge neutral" title="Freshness of the last successful canonical refresh">
          WAITING
        </span>
        <button id="refreshButton" type="button">
          Refresh
        </button>
      </div>`,
  'freshness badge',
);

html = once(
  html,
`        WEB2-A · canonical read-only operator dashboard`,
`        WEB2-B · canonical read-only operator dashboard`,
  'WEB2 marker',
);

html = once(
  html,
`        Last update: —`,
`        Last successful refresh: —`,
  'last refresh label',
);

if (!css.includes('/* WEB2-B freshness / transport safety */')) {
  css += `\n\n/* WEB2-B freshness / transport safety */\n#freshnessBadge { min-width: 82px; justify-content: center; }\n`;
}

js = once(
  js,
`const POLL_MS = 3000;`,
`const POLL_MS = 3000;\nconst REQUEST_TIMEOUT_MS = 5000;\nconst STALE_AFTER_MS = 10000;`,
  'freshness constants',
);

js = once(
  js,
`let pollTimer = null;\n\nconst el = {};`,
`let pollTimer = null;\nlet freshnessTimer = null;\nlet lastSuccessfulRefreshAt = null;\n\nconst el = {};`,
  'freshness state',
);

js = once(
  js,
`      'lastUpdated',\n    ].forEach((id) => {`,
`      'lastUpdated',\n      'freshnessBadge',\n    ].forEach((id) => {`,
  'freshness element binding',
);

js = once(
  js,
`    pollTimer = window.setInterval(\n      () => void refreshAll(),\n      POLL_MS,\n    );`,
`    pollTimer = window.setInterval(\n      () => void refreshAll(),\n      POLL_MS,\n    );\n\n    freshnessTimer = window.setInterval(\n      updateFreshnessIndicator,\n      1000,\n    );`,
  'freshness timer',
);

js = once(
  js,
`    if (pollTimer !== null) {\n      window.clearInterval(pollTimer);\n    }`,
`    if (pollTimer !== null) {\n      window.clearInterval(pollTimer);\n    }\n\n    if (freshnessTimer !== null) {\n      window.clearInterval(freshnessTimer);\n    }`,
  'freshness timer cleanup',
);

const oldGetJson = `async function getJson(url) {
  const response = await fetch(
    url,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  );

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      payload?.error ||
      'HTTP ' +
        response.status +
        ' from ' +
        url,
    );
  }

  return payload;
}`;

const newGetJson = `async function getJson(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      url,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      },
    );

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    if (!response.ok) {
      throw new Error(
        payload?.error ||
        'HTTP ' + response.status + ' from ' + url,
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timeout from ' + url);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}`;

js = once(js, oldGetJson, newGetJson, 'GET timeout protection');

js = once(
  js,
`    setBanner(\n      'Canonical application state loaded. ' +\n      'Dashboard remains read only.',\n      trading?.exposure?.state ===\n        'INVALID',\n    );\n\n    el.lastUpdated.textContent =\n      'Last update: ' +\n      new Date().toLocaleString();`,
`    lastSuccessfulRefreshAt = Date.now();\n    updateFreshnessIndicator();\n\n    setBanner(\n      'Canonical application state loaded. ' +\n      'Dashboard remains read only.',\n      trading?.exposure?.state ===\n        'INVALID',\n    );\n\n    el.lastUpdated.textContent =\n      'Last successful refresh: ' +\n      new Date(lastSuccessfulRefreshAt).toLocaleString();`,
  'refresh success freshness',
);

js = once(
  js,
`  } catch (error) {\n    setBanner(\n      'Dashboard refresh failed: ' +`,
`  } catch (error) {\n    markCanonicalDataStale();\n\n    setBanner(\n      'Dashboard refresh failed: ' +`,
  'refresh failure stale marker',
);

const badgeAnchor = `function setBadge(\n  node,\n  value,\n  tone,\n) {`;
const freshnessHelpers = `function markCanonicalDataStale() {
  setBadge(el.freshnessBadge, 'STALE', 'warn');
  setBadge(el.entryBadge, 'STALE', 'warn');
  setText(el.coreGate, 'STALE');
}

function updateFreshnessIndicator() {
  if (lastSuccessfulRefreshAt === null) {
    setBadge(el.freshnessBadge, 'WAITING', 'neutral');
    return;
  }

  if (Date.now() - lastSuccessfulRefreshAt > STALE_AFTER_MS) {
    markCanonicalDataStale();
    return;
  }

  setBadge(el.freshnessBadge, 'FRESH', 'good');
}

${badgeAnchor}`;

js = once(js, badgeAnchor, freshnessHelpers, 'freshness helper insertion');

test = once(
  test,
`'WEB2-A canonical read-only dashboard'`,
`'WEB2-B canonical read-only dashboard'`,
  'test suite marker',
);

const endAnchor = `        );\n    },\n);`;
const endCount = test.split(endAnchor).length - 1;
if (endCount !== 1) fail(`test file final anchor expected once, found ${endCount}`);

test = test.replace(
  endAnchor,
`        );

        test(
            'canonical GET requests have an explicit transport timeout',
            () => {
                expect(js()).toContain('const REQUEST_TIMEOUT_MS = 5000;');
                expect(js()).toContain('new AbortController()');
                expect(js()).toContain('signal: controller.signal');
                expect(js()).toContain('Request timeout from ');
            },
        );

        test(
            'stale transport state cannot leave NEW ENTRY displayed as ALLOWED',
            () => {
                expect(js()).toContain('function markCanonicalDataStale()');
                expect(js()).toContain("setBadge(el.entryBadge, 'STALE', 'warn')");
                expect(js()).toContain('const STALE_AFTER_MS = 10000;');
                expect(html()).toContain('id="freshnessBadge"');
            },
        );
    },
);`,
);

if (CHECK_ONLY) {
  console.log('[WEB2-B] CHECK PASS');
  console.log('  - WEB2-A v2 fingerprint confirmed');
  console.log('  - timeout/freshness patch anchors confirmed');
  console.log('  - stale UI cannot retain displayed NEW ENTRY ALLOWED');
  console.log('  - no production trading/risk/execution source changes');
  console.log('  - no files changed');
  process.exit(0);
}

fs.writeFileSync(indexPath, html, 'utf8');
fs.writeFileSync(cssPath, css, 'utf8');
fs.writeFileSync(jsPath, js, 'utf8');
fs.writeFileSync(testPath, test, 'utf8');

console.log('[WEB2-B] APPLY PASS');
console.log('Changed only public dashboard assets + WEB2 test.');
console.log('Added 5s GET timeout, 10s freshness threshold, FRESH/STALE/WAITING badge.');
console.log('On stale transport, displayed NEW ENTRY becomes STALE; no browser rule recomputation.');
console.log('No mutable endpoint/control added.');
console.log('Next gates:');
console.log('  npx jest tests/webDashboard.web2.test.ts --runInBand');
console.log('  node --check .\\public\\dashboard.js');
console.log('  npm run build');
console.log('  npm test -- --runInBand');
console.log('  git diff --check');
console.log('  git status --short');
