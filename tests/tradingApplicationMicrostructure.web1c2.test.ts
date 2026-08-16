import {
    TradingApplicationDependencies,
    TradingApplicationService,
} from '../src/services/tradingApplicationService';

function dependencies(
    options: {
        activeSymbols?: string[];
        gateBySymbol?: Record<string, any>;
        statusBySymbol?: Record<string, any>;
    } = {},
): TradingApplicationDependencies {
    const activeSymbols =
        options.activeSymbols ?? [];

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
        },

        microstructure: {
            getActiveSymbols: () =>
                [...activeSymbols],

            getEntryGate: (rawSymbol: string) => {
                const symbol =
                    rawSymbol.toUpperCase();

                return (
                    options.gateBySymbol?.[symbol] ??
                    {
                        symbol,
                        allowed: false,
                        blockers: [
                            'MICROSTRUCTURE_RUNTIME_NOT_STARTED',
                        ],
                    }
                );
            },

            getStatus: (rawSymbol: string) => {
                const symbol =
                    rawSymbol.toUpperCase();

                return options.statusBySymbol?.[symbol];
            },
        },
    };
}

describe(
    'WEB1-C2 application microstructure read model',
    () => {
        test(
            'system status declares per-symbol NEW ENTRY permission available from canonical runtime',
            () => {
                const service =
                    new TradingApplicationService(
                        dependencies(),
                    );

                expect(
                    service.getStatus().web
                        .newEntryPermissionExposed,
                ).toBe(true);
            },
        );

        test(
            'healthy active runtime is projected without recalculating its gate',
            async () => {
                const service =
                    new TradingApplicationService(
                        dependencies({
                            activeSymbols: [
                                'BTCUSDT',
                            ],

                            gateBySymbol: {
                                BTCUSDT: {
                                    symbol:
                                        'BTCUSDT',
                                    allowed: true,
                                    blockers: [],
                                    quality: {
                                        healthy: true,
                                        reasons: [],
                                    },
                                },
                            },

                            statusBySymbol: {
                                BTCUSDT: {
                                    symbol:
                                        'BTCUSDT',
                                    state:
                                        'RUNNING',
                                    market: {
                                        status:
                                            'LIVE',
                                    },
                                    depth: {
                                        status:
                                            'LIVE',
                                    },
                                    quality: {
                                        healthy: true,
                                        reasons: [],
                                    },
                                    entryGate: {
                                        symbol:
                                            'BTCUSDT',
                                        allowed: true,
                                        blockers: [],
                                    },
                                },
                            },
                        }),
                    );

                const state =
                    await service
                        .getTradingState();

                expect(
                    state.microstructure
                        .activeSymbols,
                ).toEqual([
                    'BTCUSDT',
                ]);

                expect(
                    state.microstructure
                        .runtimes[0],
                ).toMatchObject({
                    symbol: 'BTCUSDT',
                    available: true,
                    runtimeState:
                        'RUNNING',
                    marketStatus: 'LIVE',
                    depthStatus: 'LIVE',
                    featureHealthy: true,
                    qualityReasons: [],
                    newEntry: {
                        allowed: true,
                        blockers: [],
                    },
                });

                expect(
                    state.newEntryPermission,
                ).toEqual({
                    exposed: true,
                    allowed: null,
                    reason:
                        'PER_SYMBOL_MICROSTRUCTURE_GATE',
                });
            },
        );

        test(
            'unhealthy canonical blockers are exposed exactly rather than recomputed',
            () => {
                const blockers = [
                    'MICROSTRUCTURE_depth:RESYNCING',
                    'MICROSTRUCTURE_depth-stale',
                ];

                const service =
                    new TradingApplicationService(
                        dependencies({
                            gateBySymbol: {
                                BTCUSDT: {
                                    symbol:
                                        'BTCUSDT',
                                    allowed: false,
                                    blockers,
                                },
                            },

                            statusBySymbol: {
                                BTCUSDT: {
                                    symbol:
                                        'BTCUSDT',
                                    state:
                                        'RUNNING',
                                    market: {
                                        status:
                                            'LIVE',
                                    },
                                    depth: {
                                        status:
                                            'RESYNCING',
                                    },
                                    quality: {
                                        healthy: false,
                                        reasons: [
                                            'depth:RESYNCING',
                                            'depth-stale',
                                        ],
                                    },
                                    entryGate: {
                                        symbol:
                                            'BTCUSDT',
                                        allowed: false,
                                        blockers,
                                    },
                                },
                            },
                        }),
                    );

                const view =
                    service
                        .getMicrostructureState(
                            'btcusdt',
                        );

                expect(
                    view.newEntry,
                ).toEqual({
                    allowed: false,
                    blockers,
                });

                expect(
                    view.qualityReasons,
                ).toEqual([
                    'depth:RESYNCING',
                    'depth-stale',
                ]);
            },
        );

        test(
            'runtime not started is exposed fail-closed instead of inventing market health',
            () => {
                const service =
                    new TradingApplicationService(
                        dependencies(),
                    );

                const view =
                    service
                        .getMicrostructureState(
                            'ETHUSDT',
                        );

                expect(view)
                    .toEqual({
                        symbol: 'ETHUSDT',
                        available: false,
                        runtimeState:
                            'NOT_STARTED',
                        marketStatus: null,
                        depthStatus: null,
                        featureHealthy: null,
                        qualityReasons: [],
                        newEntry: {
                            allowed: false,
                            blockers: [
                                'MICROSTRUCTURE_RUNTIME_NOT_STARTED',
                            ],
                        },
                    });
            },
        );

        test(
            'active-symbol race still fails closed if runtime disappears before projection',
            async () => {
                const service =
                    new TradingApplicationService(
                        dependencies({
                            activeSymbols: [
                                'BTCUSDT',
                            ],
                        }),
                    );

                const state =
                    await service
                        .getTradingState();

                expect(
                    state.microstructure
                        .runtimes[0],
                ).toMatchObject({
                    symbol: 'BTCUSDT',
                    available: false,
                    runtimeState:
                        'NOT_STARTED',
                    newEntry: {
                        allowed: false,
                        blockers: [
                            'MICROSTRUCTURE_RUNTIME_NOT_STARTED',
                        ],
                    },
                });
            },
        );
    },
);
