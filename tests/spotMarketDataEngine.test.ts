import { SpotMarketDataEngine } from '../src/services/marketData/spotMarketDataEngine';
import {
    SpotAggregateTrade,
    SpotBookTicker,
    SpotMarketCandle,
    SpotMarketDataEvent,
    SpotRestMarketDataPort,
    SpotWebSocketLifecycleEvent,
    SpotWebSocketPort,
} from '../src/services/marketData/spotMarketDataTypes';

function candle(openTime: number, close = 100, receivedAt = openTime): SpotMarketCandle {
    return {
        symbol: 'BTCUSDT', interval: '1m', openTime, closeTime: openTime + 59_999,
        open: 100, high: Math.max(101, close), low: Math.min(99, close), close,
        volume: 1, quoteVolume: 100, trades: 1, takerBuyBaseVolume: 0.5,
        takerBuyQuoteVolume: 50, closed: true, source: 'REST', receivedAt,
    };
}

function trade(id: number, receivedAt = id): SpotAggregateTrade {
    return {
        symbol: 'BTCUSDT', id, price: 100, quantity: 1, firstTradeId: id,
        lastTradeId: id, tradeTime: receivedAt, buyerIsMaker: false,
        source: 'REST', receivedAt,
    };
}

function ticker(updateId = 1, receivedAt = 1): SpotBookTicker {
    return {
        symbol: 'BTCUSDT', updateId, bidPrice: 99.9, bidQty: 1, askPrice: 100,
        askQty: 1, source: 'REST', receivedAt,
    };
}

class FakeRest implements SpotRestMarketDataPort {
    callOrder: string[] = [];
    beforeResolve?: () => void;
    async fetchKlines(): Promise<SpotMarketCandle[]> {
        this.callOrder.push('rest-klines');
        this.beforeResolve?.();
        return [candle(0), candle(60_000)];
    }
    async fetchBookTicker(): Promise<SpotBookTicker> {
        this.callOrder.push('rest-book');
        return ticker(10);
    }
    async fetchAggregateTrades(): Promise<SpotAggregateTrade[]> {
        this.callOrder.push('rest-trades');
        return [trade(10), trade(11)];
    }
}

class FakeWs implements SpotWebSocketPort {
    callOrder: string[] = [];
    connected = false;
    onEvent?: (event: SpotMarketDataEvent) => void;
    onLifecycle?: (event: SpotWebSocketLifecycleEvent) => void;
    async connect(_symbol: string, _interval: string, onEvent: (event: SpotMarketDataEvent) => void, onLifecycle: (event: SpotWebSocketLifecycleEvent) => void): Promise<void> {
        this.callOrder.push('ws-connect');
        this.connected = true;
        this.onEvent = onEvent;
        this.onLifecycle = onLifecycle;
        onLifecycle({ type: 'connected', at: 1 });
    }
    async close(): Promise<void> { this.connected = false; this.callOrder.push('ws-close'); }
    isConnected(): boolean { return this.connected; }
    emit(event: SpotMarketDataEvent): void { this.onEvent?.(event); }
    lifecycle(event: SpotWebSocketLifecycleEvent): void { this.onLifecycle?.(event); }
}

function createEngine(rest = new FakeRest(), ws = new FakeWs(), overrides: Record<string, unknown> = {}) {
    const engine = new SpotMarketDataEngine(rest, ws, {
        symbol: 'BTCUSDT', interval: '1m', candleBootstrapLimit: 2,
        aggregateTradeBootstrapLimit: 2, maxCandleCache: 4,
        maxAggregateTradeCache: 4, staleAfterMs: 1_000,
        enableStaleMonitor: false, ...overrides,
    });
    return { engine, rest, ws };
}

describe('SpotMarketDataEngine', () => {
    it('opens WebSocket before REST bootstrap', async () => {
        const { engine, rest, ws } = createEngine();
        await engine.start();
        expect(ws.callOrder[0]).toBe('ws-connect');
        expect(rest.callOrder.length).toBe(3);
        await engine.stop();
    });

    it('boots canonical candle/book/trade state', async () => {
        const { engine } = createEngine();
        await engine.start();
        const snapshot = engine.getSnapshot();
        expect(snapshot.candles).toHaveLength(2);
        expect(snapshot.aggregateTrades.map((item) => item.id)).toEqual([10, 11]);
        expect(snapshot.bookTicker?.updateId).toBe(10);
        expect(snapshot.health.status).toBe('LIVE');
        await engine.stop();
    });

    it('buffers realtime events during REST bootstrap and replays them', async () => {
        const rest = new FakeRest();
        const ws = new FakeWs();
        rest.beforeResolve = () => ws.emit({ type: 'aggTrade', data: { ...trade(12, 100), source: 'WS' } });
        const { engine } = createEngine(rest, ws);
        await engine.start();
        expect(engine.getSnapshot().aggregateTrades.map((item) => item.id)).toEqual([10, 11, 12]);
        await engine.stop();
    });

    it('does not penalize WebSocket bootstrap overlap already covered by REST', async () => {
        const rest = new FakeRest();
        const ws = new FakeWs();
        rest.beforeResolve = () => {
            ws.emit({ type: 'aggTrade', data: { ...trade(11, 1), source: 'WS' } });
            ws.emit({ type: 'candle', data: { ...candle(60_000, 99, 1), source: 'WS' } });
        };
        const { engine } = createEngine(rest, ws);
        await engine.start();
        const health = engine.getHealth();
        expect(health.duplicateEvents).toBe(0);
        expect(health.outOfOrderEvents).toBe(0);
        expect(engine.getSnapshot().candles[1].close).toBe(100);
        await engine.stop();
    });

    it('ignores duplicate aggregate trades', async () => {
        const { engine, ws } = createEngine();
        await engine.start();
        ws.emit({ type: 'aggTrade', data: { ...trade(11, 100), source: 'WS' } });
        expect(engine.getHealth().duplicateEvents).toBe(1);
        expect(engine.getSnapshot().aggregateTrades).toHaveLength(2);
        await engine.stop();
    });

    it('ignores out-of-order aggregate trades', async () => {
        const { engine, ws } = createEngine();
        await engine.start();
        ws.emit({ type: 'aggTrade', data: { ...trade(9, 100), source: 'WS' } });
        expect(engine.getHealth().outOfOrderEvents).toBe(1);
        await engine.stop();
    });

    it('records aggregate-trade ID gaps', async () => {
        const { engine, ws } = createEngine();
        await engine.start();
        ws.emit({ type: 'aggTrade', data: { ...trade(14, 100), source: 'WS' } });
        expect(engine.getHealth().tradeGapCount).toBe(1);
        await engine.stop();
    });

    it('replaces the current candle on same-open-time updates', async () => {
        const { engine, ws } = createEngine();
        await engine.start();
        ws.emit({ type: 'candle', data: { ...candle(60_000, 105, 100), source: 'WS', closed: false } });
        const candles = engine.getSnapshot().candles;
        expect(candles[candles.length - 1]?.close).toBe(105);
        await engine.stop();
    });

    it('ignores older candle updates', async () => {
        const { engine, ws } = createEngine();
        await engine.start();
        ws.emit({ type: 'candle', data: { ...candle(0, 105, 100), source: 'WS' } });
        expect(engine.getHealth().outOfOrderEvents).toBe(1);
        await engine.stop();
    });

    it('records candle gaps', async () => {
        const { engine, ws } = createEngine();
        await engine.start();
        ws.emit({ type: 'candle', data: { ...candle(180_000, 101, 100), source: 'WS' } });
        expect(engine.getHealth().candleGapCount).toBe(1);
        await engine.stop();
    });

    it('caps candle and aggregate-trade caches', async () => {
        const { engine, ws } = createEngine(undefined, undefined, { maxCandleCache: 3, maxAggregateTradeCache: 3 });
        await engine.start();
        ws.emit({ type: 'candle', data: { ...candle(120_000, 101, 100), source: 'WS' } });
        ws.emit({ type: 'candle', data: { ...candle(180_000, 102, 101), source: 'WS' } });
        ws.emit({ type: 'aggTrade', data: { ...trade(12, 100), source: 'WS' } });
        ws.emit({ type: 'aggTrade', data: { ...trade(13, 101), source: 'WS' } });
        expect(engine.getSnapshot().candles.map((item) => item.openTime)).toEqual([60_000, 120_000, 180_000]);
        expect(engine.getSnapshot().aggregateTrades.map((item) => item.id)).toEqual([11, 12, 13]);
        await engine.stop();
    });

    it('rejects older bookTicker update IDs', async () => {
        const { engine, ws } = createEngine();
        await engine.start();
        ws.emit({ type: 'bookTicker', data: { ...ticker(9, 100), source: 'WS' } });
        expect(engine.getSnapshot().bookTicker?.updateId).toBe(10);
        expect(engine.getHealth().outOfOrderEvents).toBe(1);
        await engine.stop();
    });

    it('ignores events for another symbol', async () => {
        const { engine, ws } = createEngine();
        await engine.start();
        ws.emit({ type: 'aggTrade', data: { ...trade(12, 100), symbol: 'ETHUSDT', source: 'WS' } });
        expect(engine.getHealth().ignoredWrongSymbolEvents).toBe(1);
        await engine.stop();
    });

    it('marks a silent live feed stale and recovers on a new message', async () => {
        const { engine, ws } = createEngine();
        await engine.start();
        const lastMessageAt = engine.getHealth().lastMessageAt!;
        expect(engine.checkStaleness(lastMessageAt + 1_001)).toBe('STALE');
        ws.emit({ type: 'bookTicker', data: { ...ticker(11, lastMessageAt + 1_002), source: 'WS' } });
        expect(engine.getHealth().status).toBe('LIVE');
        await engine.stop();
    });

    it('tracks reconnect lifecycle without switching product/source', async () => {
        const { engine, ws } = createEngine();
        await engine.start();
        ws.lifecycle({ type: 'reconnecting', at: 100, attempt: 1, delayMs: 1_000 });
        expect(engine.getHealth().status).toBe('RECONNECTING');
        expect(engine.getHealth().reconnectCount).toBe(1);
        ws.lifecycle({ type: 'connected', at: 200 });
        expect(engine.getHealth().status).toBe('LIVE');
        await engine.stop();
    });

    it('returns defensive snapshot copies', async () => {
        const { engine } = createEngine();
        await engine.start();
        const snapshot = engine.getSnapshot();
        snapshot.candles[0].close = 999;
        expect(engine.getSnapshot().candles[0].close).toBe(100);
        await engine.stop();
    });

    it('closes WebSocket and becomes STOPPED', async () => {
        const { engine, ws } = createEngine();
        await engine.start();
        await engine.stop();
        expect(ws.connected).toBe(false);
        expect(engine.getHealth().status).toBe('STOPPED');
    });
});
