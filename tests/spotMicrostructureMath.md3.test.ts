import {
    calculateDepthLevelFeatures,
    calculateTopOfBookOfiIncrement,
    signAggregateTrade,
} from '../src/services/marketData/spotMicrostructureFeatureEngine';
import { SpotAggregateTrade } from '../src/services/marketData/spotMarketDataTypes';
import { SpotLocalOrderBookSnapshot } from '../src/services/marketData/spotDepthTypes';

function trade(overrides: Partial<SpotAggregateTrade> = {}): SpotAggregateTrade {
    return {
        symbol: 'BTCUSDT', id: 1, price: 100, quantity: 2, firstTradeId: 1, lastTradeId: 1,
        tradeTime: 1_000, buyerIsMaker: false, source: 'WS', receivedAt: 1_001, ...overrides,
    };
}

function book(bidPrice: number, bidQty: number, askPrice: number, askQty: number): SpotLocalOrderBookSnapshot {
    const bids = Array.from({ length: 20 }, (_, i) => ({ price: bidPrice - i * 0.1, quantity: bidQty + i * 0.1 }));
    const asks = Array.from({ length: 20 }, (_, i) => ({ price: askPrice + i * 0.1, quantity: askQty + i * 0.1 }));
    const mid = (bidPrice + askPrice) / 2;
    return {
        symbol: 'BTCUSDT', lastUpdateId: 1, bids, asks, receivedAt: 1_000,
        metrics: {
            levels: 20, bestBid: bidPrice, bestBidQty: bidQty, bestAsk: askPrice, bestAskQty: askQty,
            midPrice: mid, spread: askPrice - bidPrice, spreadBps: ((askPrice - bidPrice) / mid) * 10_000,
            microPrice: (askPrice * bidQty + bidPrice * askQty) / (bidQty + askQty),
            bidDepth: bids.reduce((s, x) => s + x.quantity, 0), askDepth: asks.reduce((s, x) => s + x.quantity, 0),
            queueImbalance: 0,
        },
    };
}

describe('MD3 microstructure math', () => {
    it('signs buyer-taker aggTrade positive when buyerIsMaker=false', () => {
        expect(signAggregateTrade(trade()).signedBase).toBe(2);
    });

    it('signs seller-taker aggTrade negative when buyerIsMaker=true', () => {
        expect(signAggregateTrade(trade({ buyerIsMaker: true })).signedBase).toBe(-2);
    });

    it('calculates quote signed flow from price x quantity', () => {
        expect(signAggregateTrade(trade({ price: 125, quantity: 2 })).signedQuote).toBe(250);
    });

    it('OFI is positive when same best bid gains quantity', () => {
        expect(calculateTopOfBookOfiIncrement(book(100, 2, 101, 2), book(100, 4, 101, 2))).toBe(2);
    });

    it('OFI is negative when same best ask gains quantity', () => {
        expect(calculateTopOfBookOfiIncrement(book(100, 2, 101, 2), book(100, 2, 101, 5))).toBe(-3);
    });

    it('OFI is positive when best bid price improves', () => {
        expect(calculateTopOfBookOfiIncrement(book(100, 2, 101, 2), book(100.5, 3, 101, 2))).toBeGreaterThan(0);
    });

    it('OFI is negative when best ask price improves downward', () => {
        expect(calculateTopOfBookOfiIncrement(book(100, 2, 101, 2), book(100, 2, 100.5, 3))).toBeLessThan(0);
    });

    it('calculates finite multi-level depth density and imbalance', () => {
        const value = calculateDepthLevelFeatures(book(100, 3, 101, 1), 10);
        expect(value.bidDepthBase).toBeGreaterThan(value.askDepthBase);
        expect(value.queueImbalance).toBeGreaterThan(0);
        expect(Number.isFinite(value.depthDensityImbalance)).toBe(true);
    });
});
