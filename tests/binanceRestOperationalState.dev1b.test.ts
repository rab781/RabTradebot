import {
    BinanceRestOperationalState,
} from '../src/services/binanceRestOperationalState';

describe('DEV1-B Binance REST operational state', () => {
    test('fails closed while health is unknown', () => {
        const state = new BinanceRestOperationalState();

        expect(state.getEntryGate(1_000, 60_000)).toEqual({
            allowed: false,
            blockers: ['BINANCE_REST_HEALTH_UNKNOWN'],
            status: 'UNKNOWN',
            checkedAt: null,
            ageMs: null,
        });
    });

    test('allows NEW entry only while a healthy observation is fresh', () => {
        const state = new BinanceRestOperationalState();
        state.markHealthy({
            checkedAt: 10_000,
            latencyMs: 120,
            source: 'TEST',
        });

        expect(state.getEntryGate(30_000, 60_000).allowed).toBe(true);
        expect(state.getEntryGate(70_001, 60_000)).toMatchObject({
            allowed: false,
            blockers: ['BINANCE_REST_HEALTH_STALE'],
            status: 'HEALTHY',
        });
    });

    test('blocks NEW entry while REST is reachable but degraded', () => {
        const state = new BinanceRestOperationalState();
        state.markDegraded({
            checkedAt: 15_000,
            latencyMs: 6_000,
            error: 'slow',
            source: 'PUBLIC_REST_PROBE',
        });

        expect(state.getEntryGate(16_000, 60_000)).toMatchObject({
            allowed: false,
            blockers: ['BINANCE_REST_DEGRADED'],
            status: 'DEGRADED',
        });
    });

    test('blocks NEW entry immediately after an unavailable observation', () => {
        const state = new BinanceRestOperationalState();
        state.markUnavailable({
            checkedAt: 20_000,
            latencyMs: 250,
            error: 'read ECONNRESET',
            source: 'PUBLIC_REST_PROBE',
        });

        expect(state.getEntryGate(21_000, 60_000)).toMatchObject({
            allowed: false,
            blockers: ['BINANCE_REST_UNAVAILABLE'],
            status: 'UNAVAILABLE',
        });

        expect(state.getSnapshot()).toMatchObject({
            lastFailureAt: 20_000,
            latencyMs: 250,
            error: 'read ECONNRESET',
            source: 'PUBLIC_REST_PROBE',
        });
    });
});
