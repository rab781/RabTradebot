import { EventEmitter } from 'events';
import { SpotMicrostructureFeatureEngine } from '../src/services/marketData/spotMicrostructureFeatureEngine';
import { SpotAggregateTrade, SpotMarketDataSnapshot } from '../src/services/marketData/spotMarketDataTypes';
import { SpotDepthHealth, SpotLocalOrderBookSnapshot } from '../src/services/marketData/spotDepthTypes';

class MarketSource extends EventEmitter {
    snapshot: SpotMarketDataSnapshot;
    constructor(trades: SpotAggregateTrade[], status: 'LIVE' | 'STALE' = 'LIVE') {
        super();
        this.snapshot = {
            symbol: 'BTCUSDT', interval: '1m', candles: [], aggregateTrades: trades,
            health: { status, symbol: 'BTCUSDT', interval: '1m', reconnectCount: 0, duplicateEvents: 0, outOfOrderEvents: 0, tradeGapCount: 0, candleGapCount: 0, ignoredWrongSymbolEvents: 0 },
        };
    }
    getSnapshot(): SpotMarketDataSnapshot { return this.snapshot; }
    getHealth() { return this.snapshot.health; }
}

class DepthSource extends EventEmitter {
    constructor(public snapshot: SpotLocalOrderBookSnapshot, public status: SpotDepthHealth['status'] = 'LIVE') { super(); }
    getSnapshot(): SpotLocalOrderBookSnapshot { return this.snapshot; }
    getHealth(): SpotDepthHealth {
        return { status: this.status, symbol: 'BTCUSDT', reconnectCount: 0, resyncCount: 0, sequenceGapCount: 0, staleEventCount: 0, invalidBookCount: 0, snapshotRetryCount: 0, depthEventsApplied: 1, ignoredWrongSymbolEvents: 0 };
    }
}

function trade(id: number, at: number, buy: boolean, qty = 1, price = 100): SpotAggregateTrade {
    return { symbol: 'BTCUSDT', id, price, quantity: qty, firstTradeId: id, lastTradeId: id, tradeTime: at, buyerIsMaker: !buy, source: 'WS', receivedAt: at };
}

function book(at: number, bidQty = 2, askQty = 2, bid = 100, ask = 101): SpotLocalOrderBookSnapshot {
    const bids = Array.from({ length: 20 }, (_, i) => ({ price: bid - i * 0.1, quantity: bidQty + i * 0.01 }));
    const asks = Array.from({ length: 20 }, (_, i) => ({ price: ask + i * 0.1, quantity: askQty + i * 0.01 }));
    const mid = (bid + ask) / 2;
    const bidDepth = bids.reduce((s, x) => s + x.quantity, 0);
    const askDepth = asks.reduce((s, x) => s + x.quantity, 0);
    return { symbol: 'BTCUSDT', lastUpdateId: at, bids, asks, receivedAt: at, metrics: {
        levels: 20, bestBid: bid, bestBidQty: bidQty, bestAsk: ask, bestAskQty: askQty, midPrice: mid,
        spread: ask - bid, spreadBps: ((ask - bid) / mid) * 10_000,
        microPrice: (ask * bidQty + bid * askQty) / (bidQty + askQty), bidDepth, askDepth,
        queueImbalance: (bidDepth - askDepth) / (bidDepth + askDepth),
    } };
}

describe('MD3 SpotMicrostructureFeatureEngine', () => {
    const now = 100_000;

    it('builds rolling CVD and taker imbalance from seeded aggregate trades', () => {
        const market = new MarketSource([trade(1, now - 900, true, 2), trade(2, now - 500, false, 1)]);
        const depth = new DepthSource(book(now - 10));
        const engine = new SpotMicrostructureFeatureEngine(market, depth, { symbol: 'BTCUSDT' });
        engine.start();
        const out = engine.getSnapshot(now);
        expect(out.trade1s.signedBaseCvd).toBe(1);
        expect(out.trade1s.takerVolumeImbalance).toBeCloseTo(1 / 3, 8);
        engine.stop();
    });

    it('maintains independent 1s and 5s rolling windows', () => {
        const market = new MarketSource([trade(1, now - 4_000, true, 2), trade(2, now - 500, false, 1)]);
        const depth = new DepthSource(book(now - 10));
        const engine = new SpotMicrostructureFeatureEngine(market, depth, { symbol: 'BTCUSDT' });
        engine.start();
        const out = engine.getSnapshot(now);
        expect(out.trade1s.aggTradeCount).toBe(1);
        expect(out.trade5s.aggTradeCount).toBe(2);
        engine.stop();
    });

    it('ignores duplicate/out-of-order aggregate trade IDs defensively', () => {
        const market = new MarketSource([trade(10, now - 500, true, 1)]);
        const depth = new DepthSource(book(now - 10));
        const engine = new SpotMicrostructureFeatureEngine(market, depth, { symbol: 'BTCUSDT' });
        engine.start();
        market.emit('aggTrade', trade(10, now - 200, false, 10));
        market.emit('aggTrade', trade(9, now - 100, false, 10));
        expect(engine.getSnapshot(now).trade1s.aggTradeCount).toBe(1);
        engine.stop();
    });

    it('updates rolling trade flow from realtime aggTrade events', () => {
        const market = new MarketSource([trade(1, now - 2_000, true, 1)]);
        const depth = new DepthSource(book(now - 10));
        const engine = new SpotMicrostructureFeatureEngine(market, depth, { symbol: 'BTCUSDT' });
        engine.start();
        market.emit('aggTrade', trade(2, now - 100, true, 3));
        expect(engine.getSnapshot(now).trade1s.buyBaseVolume).toBe(3);
        engine.stop();
    });

    it('computes positive OFI when bid liquidity increases', () => {
        const market = new MarketSource([trade(1, now - 100, true)]);
        const depth = new DepthSource(book(now - 100, 2, 2));
        const engine = new SpotMicrostructureFeatureEngine(market, depth, { symbol: 'BTCUSDT' });
        engine.start();
        depth.emit('depth', book(now - 50, 4, 2));
        expect(engine.getSnapshot(now).depthFlow1s.ofi).toBeGreaterThan(0);
        engine.stop();
    });

    it('computes bullish visible liquidity pressure for bid adds + ask removals', () => {
        const market = new MarketSource([trade(1, now - 100, true)]);
        const depth = new DepthSource(book(now - 100, 2, 4));
        const engine = new SpotMicrostructureFeatureEngine(market, depth, { symbol: 'BTCUSDT' });
        engine.start();
        depth.emit('depth', book(now - 50, 4, 2));
        expect(engine.getSnapshot(now).depthFlow1s.visibleLiquidityPressure).toBeGreaterThan(0);
        engine.stop();
    });

    it('computes microprice deviation from top queue pressure', () => {
        const market = new MarketSource([trade(1, now - 100, true)]);
        const depth = new DepthSource(book(now - 20, 10, 1));
        const engine = new SpotMicrostructureFeatureEngine(market, depth, { symbol: 'BTCUSDT' });
        engine.start();
        const out = engine.getSnapshot(now);
        expect(out.microPriceDeviationBps).toBeGreaterThan(0);
        expect(out.topQueueImbalance).toBeGreaterThan(0);
        engine.stop();
    });

    it('marks quality healthy when both sources are LIVE and fresh', () => {
        const market = new MarketSource([trade(1, now - 100, true)]);
        const depth = new DepthSource(book(now - 20));
        const engine = new SpotMicrostructureFeatureEngine(market, depth, { symbol: 'BTCUSDT' });
        engine.start();
        expect(engine.getSnapshot(now).quality).toMatchObject({ healthy: true, reasons: [] });
        engine.stop();
    });

    it('marks quality unhealthy when market source is stale', () => {
        const market = new MarketSource([trade(1, now - 100, true)], 'STALE');
        const depth = new DepthSource(book(now - 20));
        const engine = new SpotMicrostructureFeatureEngine(market, depth, { symbol: 'BTCUSDT' });
        engine.start();
        const quality = engine.getSnapshot(now).quality;
        expect(quality.healthy).toBe(false);
        expect(quality.reasons).toContain('market:STALE');
        engine.stop();
    });

    it('marks quality unhealthy when trade data is too old', () => {
        const market = new MarketSource([trade(1, now - 10_000, true)]);
        const depth = new DepthSource(book(now - 20));
        const engine = new SpotMicrostructureFeatureEngine(market, depth, { symbol: 'BTCUSDT', maxTradeAgeMs: 1_000 });
        engine.start();
        expect(engine.getSnapshot(now).quality.reasons).toContain('trade-stale');
        engine.stop();
    });

    it('produces a deterministic finite flat feature schema', () => {
        const market = new MarketSource([trade(1, now - 100, true)]);
        const depth = new DepthSource(book(now - 20, 3, 2));
        const engine = new SpotMicrostructureFeatureEngine(market, depth, { symbol: 'BTCUSDT' });
        engine.start();
        const a = engine.toFlatVector(engine.getSnapshot(now));
        const b = engine.toFlatVector(engine.getSnapshot(now));
        expect(a.schemaVersion).toBe('spot-microstructure-v1');
        expect(a.names).toEqual(b.names);
        expect(a.values).toEqual(b.values);
        expect(a.values.every(Number.isFinite)).toBe(true);
        expect(new Set(a.names).size).toBe(a.names.length);
        engine.stop();
    });

    it('stops consuming realtime events after stop()', () => {
        const market = new MarketSource([trade(1, now - 100, true)]);
        const depth = new DepthSource(book(now - 20));
        const engine = new SpotMicrostructureFeatureEngine(market, depth, { symbol: 'BTCUSDT' });
        engine.start();
        engine.stop();
        market.emit('aggTrade', trade(2, now - 10, true, 10));
        expect(engine.getSnapshot(now).trade1s.buyBaseVolume).toBe(1);
    });
});
