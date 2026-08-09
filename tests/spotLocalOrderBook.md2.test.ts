import { SpotLocalOrderBook } from '../src/services/marketData/spotLocalOrderBook';
import { SpotDepthSnapshot, SpotDepthUpdate } from '../src/services/marketData/spotDepthTypes';

function snapshot(lastUpdateId = 100): SpotDepthSnapshot {
    return {
        symbol: 'BTCUSDT', lastUpdateId,
        bids: [{ price: 100, quantity: 2 }, { price: 99, quantity: 3 }],
        asks: [{ price: 101, quantity: 4 }, { price: 102, quantity: 5 }],
        receivedAt: 1, source: 'REST',
    };
}

function update(U: number, u: number, overrides: Partial<SpotDepthUpdate> = {}): SpotDepthUpdate {
    return {
        symbol: 'BTCUSDT', firstUpdateId: U, finalUpdateId: u,
        bids: [], asks: [], eventTime: 10, receivedAt: 11, source: 'WS',
        ...overrides,
    };
}

describe('SpotLocalOrderBook MD2', () => {
    it('loads and sorts a REST snapshot', () => {
        const book = new SpotLocalOrderBook('BTCUSDT');
        book.loadSnapshot(snapshot());
        const result = book.getSnapshot(2);
        expect(result.bids.map((x) => x.price)).toEqual([100, 99]);
        expect(result.asks.map((x) => x.price)).toEqual([101, 102]);
        expect(result.lastUpdateId).toBe(100);
    });

    it('applies a contiguous depth update', () => {
        const book = new SpotLocalOrderBook('BTCUSDT');
        book.loadSnapshot(snapshot());
        expect(book.apply(update(101, 101, { bids: [{ price: 100, quantity: 7 }] }))).toEqual({ status: 'APPLIED', updateId: 101 });
        expect(book.getSnapshot(1).bids[0].quantity).toBe(7);
    });

    it('accepts a bridging event whose U starts before local+1', () => {
        const book = new SpotLocalOrderBook('BTCUSDT');
        book.loadSnapshot(snapshot(100));
        expect(book.apply(update(99, 102, { asks: [{ price: 101, quantity: 6 }] }))).toEqual({ status: 'APPLIED', updateId: 102 });
    });

    it('ignores stale depth events', () => {
        const book = new SpotLocalOrderBook('BTCUSDT');
        book.loadSnapshot(snapshot(100));
        expect(book.apply(update(90, 100)).status).toBe('IGNORED_STALE');
        expect(book.lastUpdateId).toBe(100);
    });

    it('detects a sequence gap without mutating the book', () => {
        const book = new SpotLocalOrderBook('BTCUSDT');
        book.loadSnapshot(snapshot(100));
        const result = book.apply(update(103, 104, { bids: [{ price: 100, quantity: 9 }] }));
        expect(result).toMatchObject({ status: 'GAP', expectedUpdateId: 101 });
        expect(book.lastUpdateId).toBe(100);
        expect(book.getSnapshot(1).bids[0].quantity).toBe(2);
    });

    it('removes price levels when update quantity is zero', () => {
        const book = new SpotLocalOrderBook('BTCUSDT');
        book.loadSnapshot(snapshot());
        book.apply(update(101, 101, { bids: [{ price: 100, quantity: 0 }] }));
        expect(book.getSnapshot(2).bids.map((x) => x.price)).toEqual([99]);
    });

    it('adds new price levels', () => {
        const book = new SpotLocalOrderBook('BTCUSDT');
        book.loadSnapshot(snapshot());
        book.apply(update(101, 101, { bids: [{ price: 100.5, quantity: 1 }] }));
        expect(book.getSnapshot(1).bids[0].price).toBe(100.5);
    });

    it('fails on crossed books after an update', () => {
        const book = new SpotLocalOrderBook('BTCUSDT');
        book.loadSnapshot(snapshot());
        expect(() => book.apply(update(101, 101, { bids: [{ price: 102, quantity: 1 }] }))).toThrow(/Crossed or locked/);
        expect(book.lastUpdateId).toBe(100);
        expect(book.getSnapshot(1).bids[0].price).toBe(100);
    });

    it('calculates spread, microprice and queue imbalance', () => {
        const book = new SpotLocalOrderBook('BTCUSDT');
        book.loadSnapshot(snapshot());
        const metrics = book.calculateMetrics(1);
        expect(metrics.midPrice).toBe(100.5);
        expect(metrics.spread).toBe(1);
        expect(metrics.microPrice).toBeCloseTo((101 * 2 + 100 * 4) / 6, 10);
        expect(metrics.queueImbalance).toBeCloseTo((2 - 4) / 6, 10);
    });

    it('returns defensive snapshot levels', () => {
        const book = new SpotLocalOrderBook('BTCUSDT');
        book.loadSnapshot(snapshot());
        const snap = book.getSnapshot(1);
        snap.bids[0].quantity = 999;
        expect(book.getSnapshot(1).bids[0].quantity).toBe(2);
    });
});
