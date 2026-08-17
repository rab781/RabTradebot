import { SpotLiveEntryGateService } from '../src/services/spotLiveEntryGateService';
import { BinanceRestOperationalState } from '../src/services/binanceRestOperationalState';

function microstructureGate(allowed: boolean) {
    return {
        getEntryGate: (symbol: string) => ({
            symbol: symbol.toUpperCase(),
            allowed,
            blockers: allowed ? [] : ['MICROSTRUCTURE_STALE_TRADE'],
            quality: {
                healthy: allowed,
                reasons: allowed ? [] : ['STALE_TRADE'],
            } as any,
        }),
    };
}

describe('DEV1-B canonical Spot live-entry gate', () => {
    test('allows only when REST operational health and microstructure are both healthy', () => {
        const rest = new BinanceRestOperationalState();
        rest.markHealthy({ checkedAt: Date.now(), latencyMs: 80 });

        const service = new SpotLiveEntryGateService({
            microstructure: microstructureGate(true),
            binanceRest: rest,
        });

        expect(service.getEntryGate('btcusdt')).toMatchObject({
            symbol: 'BTCUSDT',
            allowed: true,
            blockers: [],
        });
    });

    test('adds Binance REST blocker without discarding healthy microstructure quality', () => {
        const rest = new BinanceRestOperationalState();
        rest.markUnavailable({ error: 'ECONNRESET' });

        const service = new SpotLiveEntryGateService({
            microstructure: microstructureGate(true),
            binanceRest: rest,
        });

        const gate = service.getEntryGate('BTCUSDT');
        expect(gate.allowed).toBe(false);
        expect(gate.blockers).toEqual(['BINANCE_REST_UNAVAILABLE']);
        expect(gate.quality?.healthy).toBe(true);
    });

    test('retains symbol-scoped microstructure blocker when REST is healthy', () => {
        const rest = new BinanceRestOperationalState();
        rest.markHealthy({ checkedAt: Date.now(), latencyMs: 80 });

        const service = new SpotLiveEntryGateService({
            microstructure: microstructureGate(false),
            binanceRest: rest,
        });

        expect(service.getEntryGate('ETHUSDT')).toMatchObject({
            symbol: 'ETHUSDT',
            allowed: false,
            blockers: ['MICROSTRUCTURE_STALE_TRADE'],
        });
    });
});
