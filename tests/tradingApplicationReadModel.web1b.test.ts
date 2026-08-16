import {
    TradingApplicationDependencies,
    TradingApplicationService,
} from '../src/services/tradingApplicationService';

function dependencies(
    options: {
        openTrades?: any[];
        pendingTrades?: any[];
    } = {},
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
            getOpenLiveTrades: async () =>
                options.openTrades ?? [],

            getPendingLiveTrades: async () =>
                options.pendingTrades ?? [],
        },
    };
}

describe('WEB1-B canonical live trading read model', () => {
    test('reports FLAT when there is no live Spot exposure', async () => {
        const service =
            new TradingApplicationService(
                dependencies(),
            );

        const state =
            await service.getTradingState();

        expect(state.product).toBe('SPOT');
        expect(state.positionMode)
            .toBe('LONG_FLAT');

        expect(state.exposure.state)
            .toBe('FLAT');
        expect(state.exposure.count)
            .toBe(0);

        expect(state.reconciliation.state)
            .toBe('READY');
    });

    test('maps persisted BUY live exposure to LONG', async () => {
        const service =
            new TradingApplicationService(
                dependencies({
                    openTrades: [
                        {
                            id: 'trade-1',
                            userId: 7,
                            symbol: 'btcusdt',
                            side: 'BUY',
                            quantity: 0.01,
                            entryPrice: 60000,
                            status: 'LIVE_OPEN',
                        },
                    ],
                }),
            );

        const state =
            await service.getTradingState();

        expect(state.exposure.state)
            .toBe('LONG');
        expect(state.exposure.positions[0])
            .toMatchObject({
                symbol: 'BTCUSDT',
                position: 'LONG',
                quantity: 0.01,
                reconciliation: 'NONE',
            });
    });

    test('keeps residual pending exit visible as LONG exposure', async () => {
        const trade = {
            id: 'trade-exit',
            userId: 7,
            symbol: 'BTCUSDT',
            side: 'BUY',
            quantity: 0.004,
            entryPrice: 60000,
            status:
                'LIVE_EXIT_PENDING_RECONCILIATION',
            tags: JSON.stringify({
                exitOrderId: 991,
            }),
        };

        const service =
            new TradingApplicationService(
                dependencies({
                    openTrades: [trade],
                    pendingTrades: [trade],
                }),
            );

        const state =
            await service.getTradingState();

        expect(state.exposure.state)
            .toBe('LONG');

        expect(
            state.exposure.positions[0]
                .reconciliation,
        ).toBe('EXIT_PENDING');

        expect(state.reconciliation.state)
            .toBe('PENDING');

        expect(
            state.reconciliation
                .pendingOrders[0].orderId,
        ).toBe(991);
    });

    test('shows zero-fill pending entry as reconciliation risk without synthetic exposure', async () => {
        const pendingEntry = {
            id: 'trade-entry',
            userId: 7,
            symbol: 'BTCUSDT',
            side: 'BUY',
            quantity: 0,
            entryPrice: 60000,
            status:
                'LIVE_ENTRY_PENDING_RECONCILIATION',
            tags: JSON.stringify({
                entryOrderId: 123,
            }),
        };

        const service =
            new TradingApplicationService(
                dependencies({
                    openTrades: [],
                    pendingTrades: [pendingEntry],
                }),
            );

        const state =
            await service.getTradingState();

        expect(state.exposure.state)
            .toBe('FLAT');
        expect(state.exposure.count)
            .toBe(0);

        expect(state.reconciliation.state)
            .toBe('PENDING');
        expect(state.reconciliation.pendingCount)
            .toBe(1);
    });

    test('never interprets persisted SELL/SHORT as valid Spot exposure', async () => {
        const service =
            new TradingApplicationService(
                dependencies({
                    openTrades: [
                        {
                            id: 'legacy-invalid',
                            userId: 7,
                            symbol: 'BTCUSDT',
                            side: 'SELL',
                            quantity: 0.01,
                            entryPrice: 60000,
                            status: 'OPEN',
                        },
                    ],
                }),
            );

        const state =
            await service.getTradingState();

        expect(state.exposure.state)
            .toBe('INVALID');
        expect(state.exposure.invalidCount)
            .toBe(1);

        expect(
            state.exposure.positions[0]
                .position,
        ).toBe('INVALID');
    });

    test('malformed pending metadata remains visible and does not invent an order id', async () => {
        const service =
            new TradingApplicationService(
                dependencies({
                    pendingTrades: [
                        {
                            id: 'broken-meta',
                            userId: 7,
                            symbol: 'BTCUSDT',
                            side: 'BUY',
                            quantity: 0,
                            entryPrice: 60000,
                            status:
                                'LIVE_ENTRY_PENDING_RECONCILIATION',
                            tags: '{bad-json',
                        },
                    ],
                }),
            );

        const state =
            await service.getTradingState();

        expect(state.reconciliation.state)
            .toBe('PENDING');

        expect(
            state.reconciliation
                .pendingOrders[0],
        ).toMatchObject({
            orderId: null,
            metadataValid: false,
        });
    });

    test('does not expose NEW ENTRY permission before market/feature health is wired', async () => {
        const service =
            new TradingApplicationService(
                dependencies(),
            );

        const state =
            await service.getTradingState();

        expect(state.newEntryPermission)
            .toEqual({
                exposed: false,
                allowed: null,
                reason:
                    'MARKET_FEATURE_HEALTH_NOT_WIRED',
            });
    });
});
