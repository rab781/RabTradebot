const fs = require('fs');
const path = require('path');

const CHECK_ONLY = process.argv.includes('--check');
const root = process.cwd();

const publicDir = path.join(root, 'public');
const legacyDir = path.join(root, 'docs', 'web-legacy');

const indexPath = path.join(publicDir, 'index.html');
const legacyPath = path.join(
  legacyDir,
  'index.pre-WEB2A.html',
);
const cssPath = path.join(publicDir, 'dashboard.css');
const jsPath = path.join(publicDir, 'dashboard.js');
const testPath = path.join(
  root,
  'tests',
  'webDashboard.web2.test.ts',
);

function fail(message) {
  throw new Error(`[WEB2-A v2] ${message}`);
}

function readUtf8(file) {
  if (!fs.existsSync(file)) {
    fail(`Required file not found: ${path.relative(root, file)}`);
  }

  return fs.readFileSync(file, 'utf8');
}

function normalize(text) {
  return text.replace(/\r\n/g, '\n');
}

function sameText(a, b) {
  return normalize(a).trimEnd() === normalize(b).trimEnd();
}

const currentIndex = readUtf8(indexPath);

const legacyFingerprints = [
  '<title>RabTradebot | Pro Interface</title>',
  'https://cdn.socket.io/4.5.4/socket.io.min.js',
  'const socket = io();',
  "loadData('/api/dashboard', updateDashboard);",
  "setInterval(() => loadData('/api/stats', updateStats), 1000);",
  "async function loadTrades() { loadData('/api/trades?limit=20', updateTrades); }",
  "async function loadSignals() { loadData('/api/signals?limit=20', updateSignals); }",
  "async function loadPortfolio() { loadData('/api/portfolio', updatePortfolio); }",
];

for (const fingerprint of legacyFingerprints) {
  if (!currentIndex.includes(fingerprint)) {
    fail(
      `Existing public/index.html does not match the audited legacy dashboard fingerprint: ${fingerprint}. ` +
      `No files were changed.`
    );
  }
}

const indexSource = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>RabTradebot | Operator Dashboard</title>
  <meta
    name="description"
    content="Read-only canonical operator dashboard for RabTradebot Spot trading state."
  >
  <link rel="stylesheet" href="/dashboard.css">
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">RABTRADEBOT / OPERATOR VIEW</p>
        <h1>Spot Trading Dashboard</h1>
        <p class="muted">
          Canonical execution state · Binance Spot · LONG / FLAT
        </p>
      </div>

      <div class="top-actions">
        <span class="badge neutral">READ ONLY</span>
        <button id="refreshButton" type="button">
          Refresh
        </button>
      </div>
    </header>

    <div
      id="banner"
      class="banner"
      role="status"
      aria-live="polite"
    >
      Loading canonical trading state…
    </div>

    <main>
      <section
        class="metrics"
        aria-label="Canonical trading overview"
      >
        <article class="card metric">
          <span class="label">CORE EXECUTION</span>
          <strong id="coreGate">—</strong>
          <small id="coreDetail">Waiting</small>
        </article>

        <article class="card metric">
          <span class="label">EXPOSURE</span>
          <strong id="exposureState">—</strong>
          <small id="exposureDetail">
            LONG / FLAT
          </small>
        </article>

        <article class="card metric">
          <span class="label">RECONCILIATION</span>
          <strong id="reconState">—</strong>
          <small id="reconDetail">Waiting</small>
        </article>

        <article class="card metric">
          <span class="label">RISK MONITOR</span>
          <strong id="riskState">—</strong>
          <small id="riskDetail">Runtime monitor</small>
        </article>
      </section>

      <section class="columns">
        <article class="card">
          <div class="title-row">
            <div>
              <p class="eyebrow">EXECUTION</p>
              <h2>System Status</h2>
            </div>
            <span
              id="healthBadge"
              class="badge neutral"
            >
              UNKNOWN
            </span>
          </div>

          <dl>
            <div>
              <dt>Venue</dt>
              <dd id="venue">—</dd>
            </div>
            <div>
              <dt>Product</dt>
              <dd id="product">—</dd>
            </div>
            <div>
              <dt>Position mode</dt>
              <dd id="positionMode">—</dd>
            </div>
            <div>
              <dt>Binance configured</dt>
              <dd id="binanceConfigured">—</dd>
            </div>
            <div>
              <dt>Startup recovery</dt>
              <dd id="startupRecovery">—</dd>
            </div>
            <div>
              <dt>Web control mode</dt>
              <dd id="controlMode">—</dd>
            </div>
          </dl>

          <div class="reason-box">
            <b>Core blockers</b>
            <ul id="coreBlockers"></ul>
          </div>
        </article>

        <article class="card">
          <div class="title-row">
            <div>
              <p class="eyebrow">MARKET INPUT</p>
              <h2>Microstructure Gate</h2>
            </div>
            <span
              id="entryBadge"
              class="badge bad"
            >
              BLOCKED
            </span>
          </div>

          <label for="symbolInput">
            Inspect symbol
          </label>

          <div class="symbol-row">
            <input
              id="symbolInput"
              value="BTCUSDT"
              maxlength="20"
              autocomplete="off"
              spellcheck="false"
            >
            <button id="inspectButton" type="button">
              Inspect
            </button>
          </div>

          <small class="muted">
            Inspection only. This does not start a runtime,
            submit an order, or mutate trading state.
          </small>

          <dl>
            <div>
              <dt>Runtime</dt>
              <dd id="runtimeState">—</dd>
            </div>
            <div>
              <dt>Market data</dt>
              <dd id="marketStatus">—</dd>
            </div>
            <div>
              <dt>Order book</dt>
              <dd id="depthStatus">—</dd>
            </div>
            <div>
              <dt>Feature quality</dt>
              <dd id="featureHealth">—</dd>
            </div>
          </dl>

          <div class="reason-box">
            <b>Entry blockers / quality reasons</b>
            <ul id="entryBlockers"></ul>
          </div>
        </article>
      </section>

      <section class="columns">
        <article class="card">
          <div class="title-row">
            <div>
              <p class="eyebrow">LIVE SPOT</p>
              <h2>Open Exposure</h2>
            </div>
            <span
              id="positionCount"
              class="badge neutral"
            >
              0
            </span>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Position</th>
                  <th>Qty</th>
                  <th>Entry</th>
                  <th>Status</th>
                  <th>Recon</th>
                </tr>
              </thead>
              <tbody id="positionsBody"></tbody>
            </table>
          </div>
        </article>

        <article class="card">
          <div class="title-row">
            <div>
              <p class="eyebrow">RECOVERY</p>
              <h2>Pending Reconciliation</h2>
            </div>
            <span
              id="pendingCount"
              class="badge neutral"
            >
              0
            </span>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Status</th>
                  <th>Qty</th>
                  <th>Order ID</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody id="pendingBody"></tbody>
            </table>
          </div>
        </article>
      </section>

      <section class="card">
        <div class="title-row">
          <div>
            <p class="eyebrow">RUNTIME OWNERSHIP</p>
            <h2>Active Microstructure Runtimes</h2>
          </div>
          <span
            id="runtimeCount"
            class="badge neutral"
          >
            0 ACTIVE
          </span>
        </div>

        <div
          id="runtimeCards"
          class="runtime-grid"
        ></div>
      </section>
    </main>

    <footer>
      <span>
        WEB2-A · canonical read-only operator dashboard
      </span>
      <span id="lastUpdated">
        Last update: —
      </span>
    </footer>
  </div>

  <script src="/dashboard.js" defer></script>
</body>
</html>
`;

const cssSource = `:root {
  color-scheme: dark;

  --bg: #0f172a;
  --panel: #1e293b;
  --panel-soft: #182334;
  --border: #334155;

  --text: #f8fafc;
  --muted: #94a3b8;
  --accent: #818cf8;

  --good: #34d399;
  --warn: #fbbf24;
  --bad: #f87171;

  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  background:
    radial-gradient(
      circle at 50% 0%,
      rgba(99, 102, 241, 0.10),
      transparent 40rem
    ),
    var(--bg);
  color: var(--text);
}

button,
input {
  font: inherit;
}

button {
  min-height: 38px;
  padding: 8px 14px;
  cursor: pointer;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-soft);
  color: var(--text);
}

button:hover {
  border-color: #64748b;
}

button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.shell {
  width: min(1480px, calc(100% - 30px));
  margin: 0 auto;
  padding: 28px 0 22px;
}

.topbar,
.top-actions,
.title-row,
.symbol-row,
footer {
  display: flex;
  align-items: center;
}

.topbar,
.title-row,
footer {
  justify-content: space-between;
}

.topbar {
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 18px;
}

.top-actions,
.symbol-row {
  gap: 9px;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 5px;
  font-size: clamp(1.8rem, 3vw, 2.5rem);
}

h2 {
  margin-bottom: 0;
  font-size: 1.08rem;
}

.eyebrow {
  margin: 0 0 6px;
  color: var(--accent);
  font-size: 0.70rem;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.muted,
small,
footer {
  color: var(--muted);
}

.banner {
  margin-bottom: 14px;
  padding: 10px 13px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.08);
}

.banner.good {
  border-color: rgba(52, 211, 153, 0.35);
}

.banner.bad {
  border-color: rgba(248, 113, 113, 0.42);
}

.metrics,
.columns {
  display: grid;
  gap: 12px;
  margin-bottom: 12px;
}

.metrics {
  grid-template-columns:
    repeat(4, minmax(0, 1fr));
}

.columns {
  grid-template-columns:
    repeat(2, minmax(0, 1fr));
}

.card {
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--panel);
  box-shadow:
    0 10px 25px rgba(0, 0, 0, 0.18);
}

.metric {
  display: flex;
  min-height: 130px;
  flex-direction: column;
  justify-content: space-between;
}

.metric .label,
.reason-box b {
  color: var(--muted);
  font-size: 0.71rem;
  font-weight: 700;
  letter-spacing: 0.07em;
}

.metric strong {
  font-size: 1.62rem;
}

.title-row {
  gap: 10px;
  margin-bottom: 15px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.badge.neutral {
  color: var(--muted);
}

.badge.good {
  color: var(--good);
  border-color: rgba(52, 211, 153, 0.35);
}

.badge.warn {
  color: var(--warn);
  border-color: rgba(251, 191, 36, 0.35);
}

.badge.bad {
  color: var(--bad);
  border-color: rgba(248, 113, 113, 0.38);
}

dl {
  margin: 12px 0 0;
}

dl > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom:
    1px solid rgba(255, 255, 255, 0.055);
}

dl > div:last-child {
  border-bottom: 0;
}

dt {
  color: var(--muted);
}

dd {
  margin: 0;
  text-align: right;
  font-weight: 700;
}

.reason-box {
  margin-top: 13px;
  padding: 11px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.12);
}

ul {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--muted);
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}

.symbol-row {
  margin: 7px 0;
}

.symbol-row input {
  width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-soft);
  color: var(--text);
  text-transform: uppercase;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.80rem;
}

th,
td {
  padding: 9px 8px;
  border-bottom:
    1px solid rgba(255, 255, 255, 0.055);
  text-align: left;
  white-space: nowrap;
}

th {
  color: var(--muted);
  font-size: 0.67rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.empty {
  color: var(--muted);
  text-align: center;
}

.runtime-grid {
  display: grid;
  grid-template-columns:
    repeat(3, minmax(0, 1fr));
  gap: 9px;
}

.runtime-card {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-soft);
}

.runtime-card .title-row {
  margin-bottom: 8px;
}

.runtime-card dl {
  font-size: 0.78rem;
}

footer {
  gap: 16px;
  padding: 14px 2px 0;
  font-size: 0.72rem;
}

@media (max-width: 1000px) {
  .metrics {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }

  .runtime-grid {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .topbar,
  footer {
    flex-direction: column;
    align-items: stretch;
  }

  .metrics,
  .columns,
  .runtime-grid {
    grid-template-columns: 1fr;
  }

  .shell {
    width: calc(100% - 18px);
    padding-top: 18px;
  }
}
`;

const jsSource = `'use strict';

const POLL_MS = 3000;

const API = Object.freeze({
  system: '/api/system/status',
  trading: '/api/trading/state',

  microstructure: (symbol) =>
    '/api/trading/microstructure/' +
    encodeURIComponent(symbol),
});

let refreshing = false;
let selectedSymbol = 'BTCUSDT';
let pollTimer = null;

const el = {};

document.addEventListener(
  'DOMContentLoaded',
  () => {
    [
      'banner',
      'refreshButton',
      'inspectButton',
      'symbolInput',
      'coreGate',
      'coreDetail',
      'exposureState',
      'exposureDetail',
      'reconState',
      'reconDetail',
      'riskState',
      'riskDetail',
      'healthBadge',
      'venue',
      'product',
      'positionMode',
      'binanceConfigured',
      'startupRecovery',
      'controlMode',
      'coreBlockers',
      'entryBadge',
      'runtimeState',
      'marketStatus',
      'depthStatus',
      'featureHealth',
      'entryBlockers',
      'positionCount',
      'positionsBody',
      'pendingCount',
      'pendingBody',
      'runtimeCount',
      'runtimeCards',
      'lastUpdated',
    ].forEach((id) => {
      el[id] = document.getElementById(id);
    });

    el.refreshButton.addEventListener(
      'click',
      () => void refreshAll(),
    );

    el.inspectButton.addEventListener(
      'click',
      inspectSymbol,
    );

    el.symbolInput.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter') {
          inspectSymbol();
        }
      },
    );

    el.symbolInput.addEventListener(
      'input',
      () => {
        el.symbolInput.value =
          el.symbolInput.value.toUpperCase();
      },
    );

    void refreshAll();

    pollTimer = window.setInterval(
      () => void refreshAll(),
      POLL_MS,
    );
  },
);

window.addEventListener(
  'beforeunload',
  () => {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
    }
  },
);

async function getJson(url) {
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
}

async function refreshAll() {
  if (refreshing) {
    return;
  }

  refreshing = true;
  el.refreshButton.disabled = true;

  try {
    const [system, trading] =
      await Promise.all([
        getJson(API.system),
        getJson(API.trading),
      ]);

    renderSystem(system);
    renderTrading(trading);

    selectedSymbol =
      chooseSymbol(trading) ||
      selectedSymbol;

    el.symbolInput.value =
      selectedSymbol;

    await refreshMicrostructure(
      selectedSymbol,
    );

    setBanner(
      'Canonical application state loaded. ' +
      'Dashboard remains read only.',
      trading?.exposure?.state ===
        'INVALID',
    );

    el.lastUpdated.textContent =
      'Last update: ' +
      new Date().toLocaleString();
  } catch (error) {
    setBanner(
      'Dashboard refresh failed: ' +
      errorMessage(error),
      true,
    );
  } finally {
    refreshing = false;
    el.refreshButton.disabled = false;
  }
}

function inspectSymbol() {
  const symbol =
    normalizeSymbol(
      el.symbolInput.value,
    );

  if (!symbol) {
    setBanner(
      'Enter a valid Spot symbol such as BTCUSDT.',
      true,
    );
    return;
  }

  selectedSymbol = symbol;
  el.symbolInput.value = symbol;

  void refreshMicrostructure(symbol);
}

async function refreshMicrostructure(
  symbol,
) {
  try {
    const view =
      await getJson(
        API.microstructure(symbol),
      );

    renderMicrostructure(view);
  } catch (error) {
    setBadge(
      el.entryBadge,
      'BLOCKED',
      'bad',
    );

    setText(
      el.runtimeState,
      'UNAVAILABLE',
    );

    setText(el.marketStatus, '—');
    setText(el.depthStatus, '—');
    setText(
      el.featureHealth,
      'UNKNOWN',
    );

    renderList(
      el.entryBlockers,
      [
        symbol +
          ': ' +
          errorMessage(error),
      ],
      'No canonical status available.',
    );
  }
}

function renderSystem(system) {
  const gate =
    system?.execution
      ?.coreExecutionGate ||
    'UNKNOWN';

  setText(el.coreGate, gate);

  const blockers =
    asArray(
      system?.execution?.blockers,
    );

  setText(
    el.coreDetail,
    blockers.length
      ? blockers.length +
        ' blocker(s)'
      : 'Core prerequisites ready',
  );

  setText(
    el.riskState,
    system?.risk?.monitorActive
      ? 'ACTIVE'
      : 'INACTIVE',
  );

  setText(
    el.riskDetail,
    system?.risk?.monitorActive
      ? 'Risk monitoring loop active'
      : 'Risk monitoring loop inactive',
  );

  setText(
    el.venue,
    system?.venue,
  );

  setText(
    el.product,
    system?.product,
  );

  setText(
    el.positionMode,
    system?.positionMode,
  );

  setText(
    el.binanceConfigured,
    yesNo(
      system?.execution
        ?.binanceConfigured,
    ),
  );

  setText(
    el.startupRecovery,
    system?.execution
      ?.startupRecoveryReady
      ? 'READY'
      : 'PENDING',
  );

  setText(
    el.controlMode,
    system?.web?.controlMode ||
      'READ_ONLY',
  );

  const health =
    String(
      system?.health?.overallStatus ||
      'UNKNOWN',
    ).toUpperCase();

  setBadge(
    el.healthBadge,
    health,
    health === 'OK'
      ? 'good'
      : health === 'DEGRADED'
        ? 'warn'
        : 'bad',
  );

  renderList(
    el.coreBlockers,
    blockers,
    'No core execution blockers.',
  );
}

function renderTrading(trading) {
  const exposure =
    trading?.exposure || {};

  const reconciliation =
    trading?.reconciliation || {};

  const exposureState =
    String(
      exposure.state || 'UNKNOWN',
    ).toUpperCase();

  setText(
    el.exposureState,
    exposureState,
  );

  setText(
    el.exposureDetail,
    numberOrZero(exposure.count) +
      ' persisted live position(s)',
  );

  setText(
    el.reconState,
    String(
      reconciliation.state ||
      'UNKNOWN',
    ).toUpperCase(),
  );

  setText(
    el.reconDetail,
    numberOrZero(
      reconciliation.pendingCount,
    ) +
      ' pending item(s)',
  );

  const positions =
    asArray(exposure.positions);

  const pending =
    asArray(
      reconciliation.pendingOrders,
    );

  setBadge(
    el.positionCount,
    String(positions.length),
    exposureState === 'INVALID'
      ? 'bad'
      : 'neutral',
  );

  setBadge(
    el.pendingCount,
    String(pending.length),
    pending.length
      ? 'warn'
      : 'neutral',
  );

  renderPositions(positions);
  renderPending(pending);

  const runtimes =
    asArray(
      trading?.microstructure
        ?.runtimes,
    );

  setBadge(
    el.runtimeCount,
    runtimes.length + ' ACTIVE',
    runtimes.length
      ? 'good'
      : 'neutral',
  );

  renderRuntimes(runtimes);
}

function renderMicrostructure(view) {
  const allowed =
    view?.newEntry?.allowed === true;

  setBadge(
    el.entryBadge,
    allowed
      ? 'ALLOWED'
      : 'BLOCKED',
    allowed
      ? 'good'
      : 'bad',
  );

  setText(
    el.runtimeState,
    view?.runtimeState ||
      'NOT_STARTED',
  );

  setText(
    el.marketStatus,
    view?.marketStatus,
  );

  setText(
    el.depthStatus,
    view?.depthStatus,
  );

  setText(
    el.featureHealth,
    view?.featureHealthy === true
      ? 'HEALTHY'
      : view?.featureHealthy ===
          false
        ? 'UNHEALTHY'
        : 'UNKNOWN',
  );

  const reasons = [
    ...asArray(
      view?.newEntry?.blockers,
    ),
    ...asArray(
      view?.qualityReasons,
    ),
  ];

  renderList(
    el.entryBlockers,
    [
      ...new Set(
        reasons.map(String),
      ),
    ],
    allowed
      ? 'No canonical blockers.'
      : 'No additional reason reported.',
  );
}

function renderPositions(items) {
  clear(el.positionsBody);

  if (!items.length) {
    addEmptyRow(
      el.positionsBody,
      6,
      'No persisted live Spot exposure.',
    );
    return;
  }

  items.forEach((position) => {
    addRow(
      el.positionsBody,
      [
        position.symbol,
        position.position,
        formatNumber(
          position.quantity,
        ),
        formatNumber(
          position.entryPrice,
        ),
        position.status,
        position.reconciliation,
      ],
    );
  });
}

function renderPending(items) {
  clear(el.pendingBody);

  if (!items.length) {
    addEmptyRow(
      el.pendingBody,
      5,
      'No pending live reconciliation.',
    );
    return;
  }

  items.forEach((pending) => {
    addRow(
      el.pendingBody,
      [
        pending.symbol,
        pending.status,
        formatNumber(
          pending.quantity,
        ),
        pending.orderId ?? '—',
        pending.metadataValid
          ? 'VALID'
          : 'INVALID',
      ],
    );
  });
}

function renderRuntimes(items) {
  clear(el.runtimeCards);

  if (!items.length) {
    const empty =
      document.createElement('div');

    empty.className = 'empty';

    empty.textContent =
      'No active canonical ' +
      'microstructure runtime reported.';

    el.runtimeCards.appendChild(
      empty,
    );

    return;
  }

  items.forEach((runtime) => {
    const card =
      document.createElement('article');

    card.className =
      'runtime-card';

    const head =
      document.createElement('div');

    head.className =
      'title-row';

    const symbol =
      document.createElement('strong');

    symbol.textContent =
      display(runtime.symbol);

    const badge =
      document.createElement('span');

    badge.className = 'badge';

    const allowed =
      runtime?.newEntry?.allowed ===
      true;

    setBadge(
      badge,
      allowed
        ? 'ALLOWED'
        : 'BLOCKED',
      allowed
        ? 'good'
        : 'bad',
    );

    head.append(
      symbol,
      badge,
    );

    const details =
      document.createElement('dl');

    [
      [
        'Runtime',
        runtime.runtimeState,
      ],
      [
        'Market',
        runtime.marketStatus,
      ],
      [
        'Depth',
        runtime.depthStatus,
      ],
      [
        'Feature',
        runtime.featureHealthy === true
          ? 'HEALTHY'
          : runtime.featureHealthy ===
              false
            ? 'UNHEALTHY'
            : 'UNKNOWN',
      ],
    ].forEach(
      ([label, value]) => {
        const wrap =
          document.createElement('div');

        const dt =
          document.createElement('dt');

        dt.textContent = label;

        const dd =
          document.createElement('dd');

        dd.textContent =
          display(value);

        wrap.append(dt, dd);
        details.appendChild(wrap);
      },
    );

    card.append(
      head,
      details,
    );

    card.addEventListener(
      'click',
      () => {
        const selected =
          normalizeSymbol(
            runtime.symbol,
          );

        if (!selected) {
          return;
        }

        selectedSymbol = selected;
        el.symbolInput.value =
          selected;

        void refreshMicrostructure(
          selected,
        );
      },
    );

    el.runtimeCards.appendChild(
      card,
    );
  });
}

function chooseSymbol(trading) {
  const active =
    asArray(
      trading?.microstructure
        ?.activeSymbols,
    );

  if (active.length) {
    return normalizeSymbol(
      active[0],
    );
  }

  const positions =
    asArray(
      trading?.exposure?.positions,
    );

  if (positions.length) {
    return normalizeSymbol(
      positions[0]?.symbol,
    );
  }

  const pending =
    asArray(
      trading?.reconciliation
        ?.pendingOrders,
    );

  if (pending.length) {
    return normalizeSymbol(
      pending[0]?.symbol,
    );
  }

  return null;
}

function renderList(
  node,
  items,
  emptyText,
) {
  clear(node);

  const values =
    asArray(items)
      .map(String)
      .filter(Boolean);

  (
    values.length
      ? values
      : [emptyText]
  ).forEach((value) => {
    const item =
      document.createElement('li');

    item.textContent = value;
    node.appendChild(item);
  });
}

function addRow(body, values) {
  const row =
    document.createElement('tr');

  values.forEach((value) => {
    const cell =
      document.createElement('td');

    cell.textContent =
      display(value);

    row.appendChild(cell);
  });

  body.appendChild(row);
}

function addEmptyRow(
  body,
  colspan,
  value,
) {
  const row =
    document.createElement('tr');

  const cell =
    document.createElement('td');

  cell.colSpan = colspan;
  cell.className = 'empty';
  cell.textContent = value;

  row.appendChild(cell);
  body.appendChild(row);
}

function setBadge(
  node,
  value,
  tone,
) {
  node.textContent = value;
  node.className =
    'badge ' + tone;
}

function setBanner(
  value,
  bad,
) {
  el.banner.textContent = value;
  el.banner.className =
    bad
      ? 'banner bad'
      : 'banner good';
}

function setText(node, value) {
  node.textContent =
    display(value);
}

function clear(node) {
  while (node.firstChild) {
    node.removeChild(
      node.firstChild,
    );
  }
}

function asArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function numberOrZero(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatNumber(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed.toLocaleString(
        undefined,
        {
          maximumFractionDigits: 10,
        },
      )
    : '—';
}

function yesNo(value) {
  return value === true
    ? 'YES'
    : value === false
      ? 'NO'
      : '—';
}

function display(value) {
  return (
    value === null ||
    value === undefined ||
    value === ''
  )
    ? '—'
    : String(value);
}

function errorMessage(error) {
  return error instanceof Error
    ? error.message
    : String(error);
}

function normalizeSymbol(value) {
  const symbol =
    String(value || '')
      .trim()
      .toUpperCase();

  return /^[A-Z0-9]{5,20}$/
    .test(symbol)
      ? symbol
      : null;
}
`;

const testSource = `import fs from 'fs';
import path from 'path';

describe(
    'WEB2-A canonical read-only dashboard',
    () => {
        const root =
            path.resolve(
                __dirname,
                '..',
            );

        const html = () =>
            fs.readFileSync(
                path.join(
                    root,
                    'public',
                    'index.html',
                ),
                'utf8',
            );

        const js = () =>
            fs.readFileSync(
                path.join(
                    root,
                    'public',
                    'dashboard.js',
                ),
                'utf8',
            );

        test(
            'preserves the audited legacy dashboard outside the served public root',
            () => {
                const legacyPath =
                    path.join(
                        root,
                        'docs',
                        'web-legacy',
                        'index.pre-WEB2A.html',
                    );

                expect(
                    fs.existsSync(
                        legacyPath,
                    ),
                ).toBe(true);

                const legacy =
                    fs.readFileSync(
                        legacyPath,
                        'utf8',
                    );

                expect(legacy)
                    .toContain(
                        '<title>RabTradebot | Pro Interface</title>',
                    );

                expect(legacy)
                    .toContain(
                        "loadData('/api/dashboard', updateDashboard);",
                    );
            },
        );

        test(
            'canonical dashboard assets exist and browser JavaScript parses',
            () => {
                expect(
                    fs.existsSync(
                        path.join(
                            root,
                            'public',
                            'index.html',
                        ),
                    ),
                ).toBe(true);

                expect(
                    fs.existsSync(
                        path.join(
                            root,
                            'public',
                            'dashboard.css',
                        ),
                    ),
                ).toBe(true);

                expect(
                    fs.existsSync(
                        path.join(
                            root,
                            'public',
                            'dashboard.js',
                        ),
                    ),
                ).toBe(true);

                expect(
                    () =>
                        new Function(
                            js(),
                        ),
                ).not.toThrow();
            },
        );

        test(
            'consumes only canonical WEB1 read endpoints',
            () => {
                expect(js())
                    .toContain(
                        "'/api/system/status'",
                    );

                expect(js())
                    .toContain(
                        "'/api/trading/state'",
                    );

                expect(js())
                    .toContain(
                        "'/api/trading/microstructure/'",
                    );

                [
                    '/api/dashboard',
                    '/api/trades',
                    '/api/portfolio',
                    '/api/signals',
                    '/api/stats',
                ].forEach(
                    (legacyEndpoint) => {
                        expect(js())
                            .not.toContain(
                                legacyEndpoint,
                            );
                    },
                );
            },
        );

        test(
            'all dashboard HTTP calls are explicit GET-only reads',
            () => {
                expect(js())
                    .toContain(
                        "method: 'GET'",
                    );

                [
                    "method: 'POST'",
                    "method: 'PUT'",
                    "method: 'PATCH'",
                    "method: 'DELETE'",
                ].forEach(
                    (mutableMethod) => {
                        expect(js())
                            .not.toContain(
                                mutableMethod,
                            );
                    },
                );
            },
        );

        test(
            'served operator dashboard does not subscribe to legacy Socket.IO state',
            () => {
                expect(html())
                    .not.toContain(
                        'socket.io',
                    );

                expect(js())
                    .not.toContain(
                        'socket.io',
                    );

                expect(js())
                    .not.toContain(
                        'io(',
                    );
            },
        );

        test(
            'UI explicitly remains read-only with no trading mutation controls',
            () => {
                expect(html())
                    .toContain(
                        'READ ONLY',
                    );

                expect(html())
                    .toContain(
                        'Inspection only',
                    );

                expect(html())
                    .not.toMatch(
                        /<button[^>]*>\\s*(BUY|SELL|PAUSE|STOP|CLOSE|EMERGENCY)/i,
                    );
            },
        );

        test(
            'renders canonical execution exposure reconciliation and microstructure sections',
            () => {
                expect(html())
                    .toContain(
                        'System Status',
                    );

                expect(html())
                    .toContain(
                        'Open Exposure',
                    );

                expect(html())
                    .toContain(
                        'Pending Reconciliation',
                    );

                expect(html())
                    .toContain(
                        'Microstructure Gate',
                    );

                expect(html())
                    .toContain(
                        'Active Microstructure Runtimes',
                    );
            },
        );
    },
);
`;

if (fs.existsSync(legacyPath)) {
  const existingLegacy =
    readUtf8(legacyPath);

  if (!sameText(existingLegacy, currentIndex)) {
    fail(
      `Existing legacy snapshot differs from current audited public/index.html: ${path.relative(root, legacyPath)}. ` +
      `No files were changed.`
    );
  }
}

const generatedFiles = [
  [cssPath, cssSource],
  [jsPath, jsSource],
  [testPath, testSource],
];

for (const [file, expected] of generatedFiles) {
  if (!fs.existsSync(file)) {
    continue;
  }

  const existing = readUtf8(file);

  if (!sameText(existing, expected)) {
    fail(
      `Refusing to overwrite existing non-matching file: ${path.relative(root, file)}`
    );
  }
}

if (CHECK_ONLY) {
  console.log('[WEB2-A v2] CHECK PASS');
  console.log('  - audited legacy public/index.html fingerprint confirmed');
  console.log('  - legacy snapshot destination is safe');
  console.log('  - canonical dashboard asset paths are safe');
  console.log('  - WEB2 test path is safe');
  console.log('  - no production trading source changes');
  console.log('  - no files changed');
  process.exit(0);
}

fs.mkdirSync(publicDir, {
  recursive: true,
});

fs.mkdirSync(legacyDir, {
  recursive: true,
});

if (!fs.existsSync(legacyPath)) {
  fs.writeFileSync(
    legacyPath,
    currentIndex,
    'utf8',
  );
}

fs.writeFileSync(
  indexPath,
  indexSource,
  'utf8',
);

fs.writeFileSync(
  cssPath,
  cssSource,
  'utf8',
);

fs.writeFileSync(
  jsPath,
  jsSource,
  'utf8',
);

fs.writeFileSync(
  testPath,
  testSource,
  'utf8',
);

console.log('[WEB2-A v2] APPLY PASS');
console.log('Preserved:');
console.log('  - docs/web-legacy/index.pre-WEB2A.html');
console.log('');
console.log('Created/replaced served dashboard:');
console.log('  - public/index.html');
console.log('  - public/dashboard.css');
console.log('  - public/dashboard.js');
console.log('  - tests/webDashboard.web2.test.ts');
console.log('');
console.log('Production trading/risk/execution source was NOT changed.');
console.log('');
console.log('Next gates:');
console.log('  npx jest tests/webDashboard.web2.test.ts --runInBand');
console.log('  node --check .\\public\\dashboard.js');
console.log('  npm run build');
console.log('  npm test -- --runInBand');
console.log('  git diff --check');
console.log('  git status --short');
console.log('');
console.log('Manual smoke after automated gates:');
console.log('  http://localhost:3000/');
