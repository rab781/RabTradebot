import fs from 'fs';
import path from 'path';

describe(
    'WEB2-C2 canonical read-only dashboard',
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
                        /<button[^>]*>\s*(BUY|SELL|PAUSE|STOP|CLOSE|EMERGENCY)/i,
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

        test(
            'consumes WEB2-C1 canonical lifecycle history and never the legacy trades endpoint',
            () => {
                expect(js())
                    .toContain(
                        "'/api/trading/history?limit=50'",
                    );

                expect(js())
                    .toContain(
                        'getJson(API.history)',
                    );

                expect(js())
                    .not.toContain(
                        '/api/trades',
                    );
            },
        );

        test(
            'renders lifecycle history from backend-projected Spot semantics',
            () => {
                expect(html())
                    .toContain(
                        'Execution Lifecycle History',
                    );

                expect(html())
                    .toContain(
                        'id="historyBody"',
                    );

                expect(js())
                    .toContain(
                        'function renderHistory(history)',
                    );

                [
                    'item.lifecycleState',
                    'item.positionIntent',
                    'item.exposureState',
                    'item.entry',
                    'item.exit',
                    'item.pnl?.profitPct',
                ].forEach(
                    (canonicalField) => {
                        expect(js())
                            .toContain(
                                canonicalField,
                            );
                    },
                );
            },
        );

        test(
            'browser does not reinterpret SELL as SHORT or derive position intent from raw side',
            () => {
                expect(js())
                    .not.toContain(
                        "'SHORT'",
                    );

                expect(js())
                    .not.toContain(
                        '"SHORT"',
                    );

                expect(js())
                    .not.toMatch(
                        /rawSide\s*(===|!==|==|!=)/,
                    );

                expect(html())
                    .toContain(
                        'SELL is displayed only as an exit',
                    );
            },
        );

        test(
            'history participates in the same timeout and stale canonical refresh path',
            () => {
                expect(js())
                    .toContain(
                        'const [system, trading, history] =',
                    );

                expect(js())
                    .toContain(
                        'getJson(API.history)',
                    );

                expect(js())
                    .toContain(
                        'markCanonicalDataStale();',
                    );

                expect(js())
                    .toContain(
                        'const REQUEST_TIMEOUT_MS = 5000;',
                    );
            },
        );
    },
);
