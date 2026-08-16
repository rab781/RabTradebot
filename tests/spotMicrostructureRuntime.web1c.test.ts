import {
    SpotMicrostructureRuntimePort,
    SpotMicrostructureRuntimeRegistry,
    SpotMicrostructureRuntimeService,
} from '../src/services/marketData/spotMicrostructureRuntimeService';

function healthyQuality() {
    return {
        healthy: true,
        marketStatus: 'LIVE',
        depthStatus: 'LIVE',
        lastTradeAgeMs: 20,
        lastDepthAgeMs: 10,
        tradeSamples60s: 100,
        ofiSamples60s: 200,
        reasons: [],
    } as any;
}

function runtimeComponents(
    options: {
        quality?: any;
        marketStartError?: Error;
    } = {},
) {
    let marketStatus = 'STOPPED';
    let depthStatus = 'STOPPED';

    const quality =
        options.quality ?? healthyQuality();

    return {
        market: {
            start: jest.fn(async () => {
                if (options.marketStartError) {
                    throw options.marketStartError;
                }

                marketStatus = 'LIVE';
            }),

            stop: jest.fn(async () => {
                marketStatus = 'STOPPED';
            }),

            getHealth: jest.fn(() => ({
                status: marketStatus,
                symbol: 'BTCUSDT',
                interval: '1m',
                reconnectCount: 0,
                duplicateEvents: 0,
                outOfOrderEvents: 0,
                tradeGapCount: 0,
                candleGapCount: 0,
                ignoredWrongSymbolEvents: 0,
            } as any)),
        },

        depth: {
            start: jest.fn(async () => {
                depthStatus = 'LIVE';
            }),

            stop: jest.fn(async () => {
                depthStatus = 'STOPPED';
            }),

            getHealth: jest.fn(() => ({
                status: depthStatus,
                symbol: 'BTCUSDT',
                reconnectCount: 0,
                resyncCount: 0,
                sequenceGapCount: 0,
                staleEventCount: 0,
                invalidBookCount: 0,
                snapshotRetryCount: 0,
                depthEventsApplied: 1,
                ignoredWrongSymbolEvents: 0,
            } as any)),
        },

        features: {
            start: jest.fn(),
            stop: jest.fn(),

            getSnapshot: jest.fn(() => ({
                quality,
            } as any)),
        },
    };
}

describe('WEB1-C1 canonical Spot microstructure runtime', () => {
    test('fails closed before runtime start', () => {
        const components = runtimeComponents();
        const runtime =
            new SpotMicrostructureRuntimeService(
                'BTCUSDT',
                components,
            );

        expect(runtime.getEntryGate())
            .toEqual({
                symbol: 'BTCUSDT',
                allowed: false,
                blockers: [
                    'MICROSTRUCTURE_RUNTIME_STOPPED',
                ],
            });
    });

    test('allows new entry only when canonical feature quality is healthy', async () => {
        const components = runtimeComponents();
        const runtime =
            new SpotMicrostructureRuntimeService(
                'BTCUSDT',
                components,
            );

        await runtime.start();

        const gate = runtime.getEntryGate();

        expect(gate.allowed).toBe(true);
        expect(gate.blockers).toEqual([]);
        expect(gate.quality?.healthy).toBe(true);
    });

    test('blocks new entry when canonical feature quality is unhealthy', async () => {
        const components = runtimeComponents({
            quality: {
                ...healthyQuality(),
                healthy: false,
                marketStatus: 'STALE',
                reasons: [
                    'market:STALE',
                    'trade-stale',
                ],
            },
        });

        const runtime =
            new SpotMicrostructureRuntimeService(
                'BTCUSDT',
                components,
            );

        await runtime.start();

        const gate = runtime.getEntryGate();

        expect(gate.allowed).toBe(false);
        expect(gate.blockers).toEqual([
            'MICROSTRUCTURE_market:STALE',
            'MICROSTRUCTURE_trade-stale',
        ]);
    });

    test('startup failure remains ERROR and fail-closed', async () => {
        const components = runtimeComponents({
            marketStartError:
                new Error('bootstrap failed'),
        });

        const runtime =
            new SpotMicrostructureRuntimeService(
                'BTCUSDT',
                components,
            );

        await expect(runtime.start())
            .rejects.toThrow('bootstrap failed');

        const status = runtime.getStatus();

        expect(status.state).toBe('ERROR');
        expect(status.entryGate.allowed)
            .toBe(false);
        expect(status.lastError)
            .toBe('bootstrap failed');
    });

    test('registry shares one runtime per symbol with reference counting', async () => {
        const runtime: SpotMicrostructureRuntimePort = {
            start: jest.fn(async () => undefined),
            stop: jest.fn(async () => undefined),

            getEntryGate: jest.fn(() => ({
                symbol: 'BTCUSDT',
                allowed: true,
                blockers: [],
            })),

            getStatus: jest.fn(() => ({
                symbol: 'BTCUSDT',
                state: 'RUNNING',
                market: {} as any,
                depth: {} as any,

                entryGate: {
                    symbol: 'BTCUSDT',
                    allowed: true,
                    blockers: [],
                },
            })),
        };

        const factory = jest.fn(() => runtime);

        const registry =
            new SpotMicrostructureRuntimeRegistry({
                factory,
                maxSymbols: 2,
            });

        await registry.acquireHealthy('btcusdt');
        await registry.acquireHealthy('BTCUSDT');

        expect(factory).toHaveBeenCalledTimes(1);
        expect(
            registry.getReferenceCount('BTCUSDT'),
        ).toBe(2);

        registry.release('BTCUSDT');

        expect(
            registry.getReferenceCount('BTCUSDT'),
        ).toBe(1);

        expect(runtime.stop)
            .not.toHaveBeenCalled();

        registry.release('btcusdt');

        expect(
            registry.getReferenceCount('BTCUSDT'),
        ).toBe(0);

        expect(registry.getActiveSymbols())
            .toEqual([]);

        await Promise.resolve();

        expect(runtime.stop)
            .toHaveBeenCalledTimes(1);
    });

    test('acquireHealthy releases unhealthy runtime instead of leaking a reference', async () => {
        const runtime: SpotMicrostructureRuntimePort = {
            start: jest.fn(async () => undefined),
            stop: jest.fn(async () => undefined),

            getEntryGate: jest.fn(() => ({
                symbol: 'BTCUSDT',
                allowed: false,
                blockers: [
                    'MICROSTRUCTURE_trade-stale',
                ],
            })),

            getStatus: jest.fn(() => ({
                symbol: 'BTCUSDT',
                state: 'RUNNING',
                market: {} as any,
                depth: {} as any,

                entryGate: {
                    symbol: 'BTCUSDT',
                    allowed: false,
                    blockers: [
                        'MICROSTRUCTURE_trade-stale',
                    ],
                },
            })),
        };

        const registry =
            new SpotMicrostructureRuntimeRegistry({
                factory: () => runtime,
                maxSymbols: 2,
            });

        await expect(
            registry.acquireHealthy('BTCUSDT'),
        ).rejects.toThrow(
            'Canonical Spot microstructure gate blocked BTCUSDT',
        );

        expect(
            registry.getReferenceCount('BTCUSDT'),
        ).toBe(0);

        expect(registry.getActiveSymbols())
            .toEqual([]);

        await Promise.resolve();

        expect(runtime.stop)
            .toHaveBeenCalledTimes(1);
    });

    test('never invents health for symbol that was never acquired', () => {
        const registry =
            new SpotMicrostructureRuntimeRegistry({
                factory: jest.fn(),
                maxSymbols: 2,
            });

        expect(
            registry.getEntryGate('ETHUSDT'),
        ).toEqual({
            symbol: 'ETHUSDT',
            allowed: false,
            blockers: [
                'MICROSTRUCTURE_RUNTIME_NOT_STARTED',
            ],
        });
    });

    test('fails closed when live symbol limit is reached', async () => {
        const makeRuntime = (
            symbol: string,
        ): SpotMicrostructureRuntimePort => ({
            start: jest.fn(async () => undefined),
            stop: jest.fn(async () => undefined),

            getEntryGate: jest.fn(() => ({
                symbol,
                allowed: true,
                blockers: [],
            })),

            getStatus: jest.fn(() => ({
                symbol,
                state: 'RUNNING',
                market: {} as any,
                depth: {} as any,

                entryGate: {
                    symbol,
                    allowed: true,
                    blockers: [],
                },
            })),
        });

        const registry =
            new SpotMicrostructureRuntimeRegistry({
                factory: makeRuntime,
                maxSymbols: 1,
            });

        await registry.acquireHealthy('BTCUSDT');

        await expect(
            registry.acquireHealthy('ETHUSDT'),
        ).rejects.toThrow(
            'Spot microstructure runtime limit reached (1).',
        );
    });
});
