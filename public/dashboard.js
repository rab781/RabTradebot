'use strict';

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
