const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const publicDir = path.join(root, 'public');
const port = Number(process.env.WEB2B_MOCK_PORT || 3001);
const mode = String(process.env.WEB2B_MOCK_MODE || 'healthy').toLowerCase();

function send(res, status, type, body) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendJson(res, value) {
  send(
    res,
    200,
    'application/json; charset=utf-8',
    JSON.stringify(value),
  );
}

function serveFile(res, file, type) {
  const full = path.join(publicDir, file);
  if (!fs.existsSync(full)) {
    send(res, 404, 'text/plain; charset=utf-8', 'Not found');
    return;
  }
  send(res, 200, type, fs.readFileSync(full));
}

function maybeDelay(handler) {
  if (mode === 'stale') {
    setTimeout(handler, 7000);
    return;
  }
  handler();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method !== 'GET') {
    send(res, 405, 'text/plain; charset=utf-8', 'GET only');
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    serveFile(res, 'index.html', 'text/html; charset=utf-8');
    return;
  }

  if (url.pathname === '/dashboard.css') {
    serveFile(res, 'dashboard.css', 'text/css; charset=utf-8');
    return;
  }

  if (url.pathname === '/dashboard.js') {
    serveFile(res, 'dashboard.js', 'application/javascript; charset=utf-8');
    return;
  }

  if (url.pathname === '/api/system/status') {
    maybeDelay(() => sendJson(res, {
      venue: 'BINANCE',
      product: 'SPOT',
      positionMode: 'LONG_FLAT',
      execution: {
        coreExecutionGate: 'READY',
        blockers: [],
        binanceConfigured: true,
        startupRecoveryReady: true,
      },
      risk: {
        monitorActive: true,
      },
      web: {
        controlMode: 'READ_ONLY',
        newEntryPermissionExposed: true,
      },
      health: {
        overallStatus: 'OK',
      },
    }));
    return;
  }

  if (url.pathname === '/api/trading/state') {
    maybeDelay(() => sendJson(res, {
      exposure: {
        state: 'LONG',
        count: 1,
        positions: [
          {
            symbol: 'BTCUSDT',
            position: 'LONG',
            quantity: 0.00125,
            entryPrice: 61234.5,
            status: 'OPEN',
            reconciliation: 'READY',
          },
        ],
      },
      reconciliation: {
        state: 'READY',
        pendingCount: 0,
        pendingOrders: [],
      },
      newEntryPermission: {
        exposed: true,
        allowed: null,
        reason: 'PER_SYMBOL_MICROSTRUCTURE_GATE',
      },
      microstructure: {
        activeSymbols: ['BTCUSDT'],
        runtimes: [
          {
            symbol: 'BTCUSDT',
            available: true,
            runtimeState: 'RUNNING',
            marketStatus: 'HEALTHY',
            depthStatus: 'HEALTHY',
            featureHealthy: true,
            qualityReasons: [],
            newEntry: {
              allowed: true,
              blockers: [],
            },
          },
        ],
      },
    }));
    return;
  }

  const match = url.pathname.match(
    /^\/api\/trading\/microstructure\/([A-Za-z0-9]+)$/
  );

  if (match) {
    const symbol = match[1].toUpperCase();

    maybeDelay(() => sendJson(res, {
      symbol,
      available: true,
      runtimeState: 'RUNNING',
      marketStatus: 'HEALTHY',
      depthStatus: 'HEALTHY',
      featureHealthy: true,
      qualityReasons: [],
      newEntry: {
        allowed: true,
        blockers: [],
      },
    }));
    return;
  }

  send(res, 404, 'text/plain; charset=utf-8', 'Not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log('WEB2-B dependency-free mock server');
  console.log(`Mode : ${mode}`);
  console.log(`URL  : http://localhost:${port}/`);
  console.log('');
  if (mode === 'healthy') {
    console.log('Expected: FRESH + NEW ENTRY ALLOWED.');
  } else if (mode === 'stale') {
    console.log('API replies are delayed 7s; dashboard timeout is 5s.');
    console.log('Expected: STALE, never persistent ALLOWED.');
  }
  console.log('');
  console.log('Press Ctrl+C to stop.');
});
