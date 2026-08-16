import {
    TradingApplicationDependencies,
    TradingApplicationService,
} from '../src/services/tradingApplicationService';

function makeDependencies(
    overrides: Partial<TradingApplicationDependencies> = {},
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
                activeStreamCount: 1,
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
            getActiveSymbols: () => [],
            getEntryGate: ((symbol: string) => ({
                symbol: symbol.toUpperCase(),
                allowed: false,
                blockers: [
                    'MICROSTRUCTURE_RUNTIME_NOT_STARTED',
                ],
            })) as TradingApplicationDependencies['microstructure']['getEntryGate'],
            getStatus: () => undefined,
        },

        ...overrides,
    };
}

describe('WEB1-A TradingApplicationService', () => {
    test('exposes Binance Spot LONG/FLAT semantics with read-only Web controls', () => {
        const service = new TradingApplicationService(makeDependencies());
        const status = service.getStatus();

        expect(status.venue).toBe('BINANCE');
        expect(status.product).toBe('SPOT');
        expect(status.positionMode).toBe('LONG_FLAT');

        expect(status.web.controlMode).toBe('READ_ONLY');
        expect(status.web.mutableControlsEnabled).toBe(false);
        expect(status.web.newEntryPermissionExposed).toBe(true);
    });

    test('blocks core execution when Binance credentials are unavailable', () => {
        const service = new TradingApplicationService(
            makeDependencies({
                orderService: {
                    isConfigured: () => false,
                },
            }),
        );

        const status = service.getStatus();

        expect(status.execution.coreExecutionGate).toBe('BLOCKED');
        expect(status.execution.blockers).toEqual([
            'BINANCE_NOT_CONFIGURED',
        ]);
    });

    test('blocks core execution while startup reconciliation is pending', () => {
        const service = new TradingApplicationService(
            makeDependencies({
                executionEngine: {
                    isStartupRecoveryReady: () => false,
                },
            }),
        );

        const status = service.getStatus();

        expect(status.execution.coreExecutionGate).toBe('BLOCKED');
        expect(status.execution.blockers).toEqual([
            'STARTUP_RECOVERY_PENDING',
        ]);
    });

    test('READY remains scoped while canonical NEW ENTRY permission is exposed per symbol', () => {
        const service = new TradingApplicationService(makeDependencies());
        const status = service.getStatus();

        expect(status.execution.coreExecutionGate).toBe('READY');
        expect(status.execution.blockers).toEqual([]);
        expect(status.web.newEntryPermissionExposed).toBe(true);
    });
});
