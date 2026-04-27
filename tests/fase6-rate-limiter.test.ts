import { RateLimiter } from '../src/services/rateLimiter';

describe('F6: RateLimiter — Token Bucket Algorithm', () => {
    beforeEach(() => {
        delete process.env.BINANCE_MAX_WEIGHT_PER_MINUTE;
        delete process.env.BINANCE_MAX_ORDERS_PER_SECOND;
        delete process.env.BINANCE_MAX_WS_STREAMS;
    });

    // ─── Initialization ────────────────────────────────────────────────────────

    describe('Initialization', () => {
        it('should initialize with default capacities', () => {
            const limiter = new RateLimiter();
            const snapshot = limiter.getSnapshot();

            expect(snapshot.rest.capacity).toBe(1200);
            expect(snapshot.order.capacity).toBe(10);
            expect(snapshot.restTokens).toBe(1200);
            expect(snapshot.orderTokens).toBe(10);
        });

        it('should use environment variable overrides', () => {
            process.env.BINANCE_MAX_WEIGHT_PER_MINUTE = '600';
            process.env.BINANCE_MAX_ORDERS_PER_SECOND = '5';
            process.env.BINANCE_MAX_WS_STREAMS = '3';

            const limiter = new RateLimiter();
            const snapshot = limiter.getSnapshot();

            expect(snapshot.rest.capacity).toBe(600);
            expect(snapshot.order.capacity).toBe(5);
            expect(snapshot.wsTokens).toBe(3);
        });

        it('should fallback to defaults on invalid env vars', () => {
            process.env.BINANCE_MAX_WEIGHT_PER_MINUTE = '-100';
            process.env.BINANCE_MAX_ORDERS_PER_SECOND = 'notanumber';

            const limiter = new RateLimiter();
            const snapshot = limiter.getSnapshot();

            expect(snapshot.rest.capacity).toBe(1200);
            expect(snapshot.order.capacity).toBe(10);
        });
    });

    // ─── Token Consumption ─────────────────────────────────────────────────────

    describe('Token Consumption', () => {
        it('should consume tokens from REST bucket', async () => {
            process.env.BINANCE_MAX_WEIGHT_PER_MINUTE = '120';
            const limiter = new RateLimiter();

            await limiter.acquire('rest', 60, 1000);

            const snapshot = limiter.getSnapshot();
            expect(snapshot.restTokens).toBeLessThanOrEqual(60);
            expect(snapshot.restTokens).toBeGreaterThanOrEqual(0);
        });

        it('should consume tokens from ORDER bucket', async () => {
            process.env.BINANCE_MAX_ORDERS_PER_SECOND = '10';
            const limiter = new RateLimiter();

            await limiter.acquire('order', 3, 1000);

            const snapshot = limiter.getSnapshot();
            expect(snapshot.orderTokens).toBeLessThan(8);
        });

        it('should handle zero-cost acquire gracefully', async () => {
            const limiter = new RateLimiter();
            await limiter.acquire('rest', 0, 1000);
            const snapshot = limiter.getSnapshot();
            expect(snapshot.restTokens).toBe(1200);
        });

        it('should handle negative-cost acquire gracefully', async () => {
            const limiter = new RateLimiter();
            await limiter.acquire('rest', -5, 1000);
            const snapshot = limiter.getSnapshot();
            expect(snapshot.restTokens).toBe(1200);
        });
    });

    // ─── Token Refilling ───────────────────────────────────────────────────────

    describe('Token Refilling', () => {
        it('should refill tokens over time', async () => {
            process.env.BINANCE_MAX_WEIGHT_PER_MINUTE = '120';
            const limiter = new RateLimiter();

            // Consume all tokens
            await limiter.acquire('rest', 120, 1000);
            const emptySnapshot = limiter.getSnapshot();
            expect(emptySnapshot.restTokens).toBeLessThanOrEqual(1);

            // Wait for partial refill (120/60s = 2 tokens/sec)
            await new Promise(r => setTimeout(r, 550));

            const refilled = limiter.getSnapshot();
            expect(refilled.restTokens).toBeGreaterThan(0);
        });

        it('should never exceed capacity during refill', async () => {
            const limiter = new RateLimiter();

            // Wait some time — tokens should stay at capacity
            await new Promise(r => setTimeout(r, 100));
            const snapshot = limiter.getSnapshot();
            expect(snapshot.restTokens).toBeLessThanOrEqual(1200);
        });
    });

    // ─── Timeout Behavior ──────────────────────────────────────────────────────

    describe('Timeout Behavior', () => {
        it('should throw on timeout when insufficient tokens', async () => {
            process.env.BINANCE_MAX_WEIGHT_PER_MINUTE = '10';
            const limiter = new RateLimiter();

            // Consume all tokens
            await limiter.acquire('rest', 10, 1000);

            // Try to acquire more with very short timeout
            await expect(
                limiter.acquire('rest', 10, 50)
            ).rejects.toThrow(/timeout/i);
        });
    });

    // ─── Header Sync ───────────────────────────────────────────────────────────

    describe('Header Sync (X-MBX-USED-WEIGHT)', () => {
        it('should sync REST tokens from Binance used-weight header', () => {
            process.env.BINANCE_MAX_WEIGHT_PER_MINUTE = '1200';
            const limiter = new RateLimiter();

            limiter.syncFromHeaders({
                'x-mbx-used-weight-1m': '1190',
            });

            const snapshot = limiter.getSnapshot();
            expect(snapshot.restTokens).toBeLessThan(11);
        });

        it('should sync ORDER tokens from order-count header', () => {
            process.env.BINANCE_MAX_ORDERS_PER_SECOND = '10';
            const limiter = new RateLimiter();

            limiter.syncFromHeaders({
                'x-mbx-order-count-1s': '9',
            });

            const snapshot = limiter.getSnapshot();
            expect(snapshot.orderTokens).toBeLessThanOrEqual(1);
        });

        it('should ignore invalid header values gracefully', () => {
            const limiter = new RateLimiter();

            limiter.syncFromHeaders({
                'x-mbx-used-weight-1m': 'invalid',
                'x-mbx-order-count-1s': undefined,
            });

            const snapshot = limiter.getSnapshot();
            expect(snapshot.restTokens).toBeGreaterThan(0);
            expect(snapshot.orderTokens).toBeGreaterThan(0);
        });

        it('should handle empty headers object', () => {
            const limiter = new RateLimiter();
            limiter.syncFromHeaders({});
            const snapshot = limiter.getSnapshot();
            expect(snapshot.restTokens).toBe(1200);
        });

        it('should handle undefined headers', () => {
            const limiter = new RateLimiter();
            limiter.syncFromHeaders(undefined);
            const snapshot = limiter.getSnapshot();
            expect(snapshot.restTokens).toBe(1200);
        });

        it('should handle array header values', () => {
            const limiter = new RateLimiter();
            limiter.syncFromHeaders({
                'x-mbx-used-weight-1m': ['500'],
            });
            const snapshot = limiter.getSnapshot();
            expect(snapshot.restTokens).toBeLessThanOrEqual(700);
        });

        it('should update lastSyncTime on successful sync', () => {
            const limiter = new RateLimiter();
            const before = limiter.getSnapshot().lastSyncTime;

            limiter.syncFromHeaders({
                'x-mbx-used-weight-1m': '100',
            });

            const after = limiter.getSnapshot().lastSyncTime;
            expect(after).toBeGreaterThanOrEqual(before);
        });
    });

    // ─── Snapshot ──────────────────────────────────────────────────────────────

    describe('Snapshot', () => {
        it('should report correct used weight', async () => {
            process.env.BINANCE_MAX_WEIGHT_PER_MINUTE = '100';
            const limiter = new RateLimiter();

            await limiter.acquire('rest', 30, 1000);
            const snapshot = limiter.getSnapshot();

            expect(snapshot.rest.used).toBeGreaterThanOrEqual(29);
            expect(snapshot.rest.used).toBeLessThanOrEqual(31);
            expect(snapshot.rest.capacity).toBe(100);
        });

        it('should include all bucket types in snapshot', () => {
            const limiter = new RateLimiter();
            const snapshot = limiter.getSnapshot();

            expect(typeof snapshot.restTokens).toBe('number');
            expect(typeof snapshot.orderTokens).toBe('number');
            expect(typeof snapshot.wsTokens).toBe('number');
            expect(typeof snapshot.lastSyncTime).toBe('number');
        });
    });
});
