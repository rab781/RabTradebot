import { RateLimiter } from '../src/services/rateLimiter';

describe('F6: RateLimiter', () => {
    beforeEach(() => {
        delete process.env.BINANCE_MAX_WEIGHT_PER_MINUTE;
        delete process.env.BINANCE_MAX_ORDERS_PER_SECOND;
        delete process.env.BINANCE_MAX_WS_STREAMS;
    });

    it('consumes tokens from REST bucket', async () => {
        process.env.BINANCE_MAX_WEIGHT_PER_MINUTE = '120';
        const limiter = new RateLimiter();

        await limiter.acquire('rest', 60, 1000);

        const snapshot = limiter.getSnapshot();
        expect(snapshot.restTokens).toBeLessThan(61);
        expect(snapshot.restTokens).toBeGreaterThanOrEqual(0);
    });

    it('syncs REST tokens from Binance used weight header', () => {
        process.env.BINANCE_MAX_WEIGHT_PER_MINUTE = '1200';
        const limiter = new RateLimiter();

        limiter.syncFromHeaders({
            'x-mbx-used-weight-1m': '1190',
        });

        const snapshot = limiter.getSnapshot();
        expect(snapshot.restTokens).toBeLessThan(11);
    });

    it('syncs ORDER tokens from order count header', () => {
        process.env.BINANCE_MAX_ORDERS_PER_SECOND = '10';
        const limiter = new RateLimiter();

        limiter.syncFromHeaders({
            'x-mbx-order-count-1s': '9',
        });

        const snapshot = limiter.getSnapshot();
        expect(snapshot.orderTokens).toBeLessThan(2);
    });

    it('ignores invalid headers gracefully', () => {
        const limiter = new RateLimiter();

        limiter.syncFromHeaders({
            'x-mbx-used-weight-1m': 'invalid',
            'x-mbx-order-count-1s': undefined,
        });

        const snapshot = limiter.getSnapshot();
        expect(snapshot.restTokens).toBeGreaterThan(0);
        expect(snapshot.orderTokens).toBeGreaterThan(0);
    });
});
