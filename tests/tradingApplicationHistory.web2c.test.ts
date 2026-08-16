import {
    TradingApplicationDependencies,
    TradingApplicationService,
} from '../src/services/tradingApplicationService';

function dependencies(
    rows: any[] = [],
): TradingApplicationDependencies {
    return {
        orderService: {
            isConfigured: () => true,
        },

        executionEngine: {
            isStartupRecoveryReady: () => true,
        },

        riskMonitor: {
            isActive: () => false,
        },

        connection: {
            getStatus: (() => ({
                activeStreamCount: 0,
                maxStreams: 5,
                streams: [],
                listenKeyExpiresAt: null,
            })) as TradingApplicationDependencies['connection']['getStatus'],
        },

        health: {
            getSnapshot: (() => ({
                timestamp: 1,
                overallStatus: 'ok',
                components: {},
                uptime: 10,
                memoryUsageMb: 20,
            })) as TradingApplicationDependencies['health']['getSnapshot'],
        },

        database: {
            getOpenLiveTrades: async () => [],
            getPendingLiveTrades: async () => [],
            getRecentLiveSpotTrades: jest.fn(
                async () => rows,
            ),
        },

        microstructure: {
            getActiveSymbols: () => [],
            getEntryGate: (symbol: string) => ({
                symbol: symbol.toUpperCase(),
                allowed: false,
                blockers: [
                    'MICROSTRUCTURE_RUNTIME_NOT_STARTED',
                ],
            }),
            getStatus: () => undefined,
        },
    };
}

function liveTags(
    overrides: Record<string, unknown> = {},
): string {
    return JSON.stringify({
        live: true,
        product: 'SPOT',
        positionIntent: 'LONG',
        positionEffect: 'OPEN',
        entryOrderId: 1001,
        ...overrides,
    });
}

function trade(
    overrides: Record<string, unknown> = {},
): any {
    return {
        id: 'trade-1',
        userId: 7,
        symbol: 'btcusdt',
        side: 'BUY',
        entryPrice: 50000,
        exitPrice: null,
        quantity: 0.01,
        entryTime: new Date(
            '2026-08-16T01:00:00.000Z',
        ),
        exitTime: null,
        status: 'LIVE_OPEN',
        profit: null,
        profitPct: null,
        fees: 0.2,
        notes: 'LIVE_ENTRY:1001',
        tags: liveTags(),
        ...overrides,
    };
}

describe(
    'WEB2-C1 canonical live Spot lifecycle history',
    () => {
        test(
            'projects a canonical live BUY as LONG lifecycle without inventing SHORT semantics',
            async () => {
                const service =
                    new TradingApplicationService(
                        dependencies([trade()]),
                    );

                const result =
                    await service.getTradingHistory();

                expect(result).toMatchObject({
                    product: 'SPOT',
                    positionMode: 'LONG_FLAT',
                    count: 1,
                });

                expect(result.items[0])
                    .toMatchObject({
                        tradeId: 'trade-1',
                        symbol: 'BTCUSDT',
                        rawSide: 'BUY',
                        positionIntent: 'LONG',
                        lifecycleState: 'OPEN',
                        exposureState: 'LONG',
                        quantity: 0.01,
                        entry: {
                            side: 'BUY',
                            price: 50000,
                            orderId: 1001,
                        },
                        exit: {
                            side: null,
                            price: null,
                            orderId: null,
                        },
                        provenance: {
                            metadataValid: true,
                            live: true,
                            product: 'SPOT',
                            semanticsValid: true,
                        },
                    });
            },
        );

        test(
            'closed canonical Spot lifecycle is FLAT and its SELL is an exit, never a SHORT position',
            async () => {
                const service =
                    new TradingApplicationService(
                        dependencies([
                            trade({
                                status: 'CLOSED',
                                exitPrice: 51000,
                                exitTime: new Date(
                                    '2026-08-16T02:00:00.000Z',
                                ),
                                profit: 10,
                                profitPct: 2,
                                notes:
                                    'LIVE_EXIT:2002:TAKE_PROFIT',
                            }),
                        ]),
                    );

                const item =
                    (
                        await service
                            .getTradingHistory()
                    ).items[0];

                expect(item.positionIntent)
                    .toBe('LONG');
                expect(item.exposureState)
                    .toBe('FLAT');
                expect(item.exit)
                    .toMatchObject({
                        side: 'SELL',
                        price: 51000,
                        orderId: 2002,
                    });

                expect(
                    JSON.stringify({
                        positionIntent:
                            item.positionIntent,
                        exposureState:
                            item.exposureState,
                    }),
                ).not.toContain('SHORT');
            },
        );

        test(
            'reconciled final exit prefers canonical persisted exitOrderId metadata',
            async () => {
                const service =
                    new TradingApplicationService(
                        dependencies([
                            trade({
                                status: 'CLOSED',
                                exitPrice: 50500,
                                exitTime: new Date(
                                    '2026-08-16T02:30:00.000Z',
                                ),
                                notes:
                                    'LIVE_EXIT_RECONCILED:3003:FILLED:RISK',
                                tags: liveTags({
                                    exitOrderId: 3003,
                                    finalExitQuantity:
                                        0.01,
                                    finalExitAveragePrice:
                                        50500,
                                }),
                            }),
                        ]),
                    );

                const item =
                    (
                        await service
                            .getTradingHistory()
                    ).items[0];

                expect(item.lifecycleState)
                    .toBe('CLOSED');
                expect(item.exit.orderId)
                    .toBe(3003);
                expect(item.exit.side)
                    .toBe('SELL');
            },
        );

        test(
            'persisted SELL or SHORT live rows are surfaced INVALID and never become Spot shorts',
            async () => {
                const service =
                    new TradingApplicationService(
                        dependencies([
                            trade({
                                id: 'bad-sell',
                                side: 'SELL',
                            }),
                            trade({
                                id: 'bad-short',
                                side: 'SHORT',
                            }),
                        ]),
                    );

                const result =
                    await service.getTradingHistory();

                expect(result.count).toBe(2);

                for (const item of result.items) {
                    expect(item.positionIntent)
                        .toBe('INVALID');
                    expect(item.exposureState)
                        .toBe('INVALID');
                    expect(item.entry.side)
                        .toBe('INVALID');
                    expect(item.exit.side)
                        .toBeNull();
                }
            },
        );

        test(
            'paper trade returned accidentally by the adapter is excluded by application-level provenance validation',
            async () => {
                const service =
                    new TradingApplicationService(
                        dependencies([
                            trade({
                                id: 'paper-1',
                                status: 'CLOSED',
                                notes: 'PAPER_TRADE',
                                tags: null,
                            }),
                        ]),
                    );

                const result =
                    await service.getTradingHistory();

                expect(result.count).toBe(0);
                expect(result.items).toEqual([]);
            },
        );

        test(
            'malformed metadata cannot qualify as canonical live Spot history',
            async () => {
                const service =
                    new TradingApplicationService(
                        dependencies([
                            trade({
                                id: 'malformed-1',
                                tags: '{not-json',
                            }),
                        ]),
                    );

                const result =
                    await service.getTradingHistory();

                expect(result.count).toBe(0);
            },
        );

        test(
            'terminal zero-fill entry is CANCELLED with no confirmed Spot exposure',
            async () => {
                const service =
                    new TradingApplicationService(
                        dependencies([
                            trade({
                                id: 'zero-fill',
                                quantity: 0,
                                status: 'CANCELLED',
                                notes:
                                    'LIVE_ENTRY_TERMINAL_ZERO_FILL:4004:CANCELED',
                            }),
                        ]),
                    );

                const item =
                    (
                        await service
                            .getTradingHistory()
                    ).items[0];

                expect(item.lifecycleState)
                    .toBe('CANCELLED');
                expect(item.exposureState)
                    .toBe('NONE');
                expect(item.exit.side)
                    .toBeNull();
            },
        );

        test(
            'history limit is strict 1..200 and is forwarded unchanged to the canonical database adapter',
            async () => {
                const deps = dependencies([]);
                const service =
                    new TradingApplicationService(
                        deps,
                    );

                await service.getTradingHistory(25);

                expect(
                    deps.database
                        .getRecentLiveSpotTrades,
                ).toHaveBeenCalledWith(25);

                await expect(
                    service.getTradingHistory(0),
                ).rejects.toThrow(
                    /history limit/i,
                );

                await expect(
                    service.getTradingHistory(201),
                ).rejects.toThrow(
                    /history limit/i,
                );

                await expect(
                    service.getTradingHistory(1.5),
                ).rejects.toThrow(
                    /history limit/i,
                );
            },
        );
    },
);
