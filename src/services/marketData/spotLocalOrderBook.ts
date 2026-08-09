import {
    SpotDepthApplyResult,
    SpotDepthLevel,
    SpotDepthSnapshot,
    SpotDepthUpdate,
    SpotLocalOrderBookSnapshot,
    SpotOrderBookMetrics,
} from './spotDepthTypes';

function priceKey(price: number): string {
    if (!Number.isFinite(price) || price <= 0) {
        throw new Error(`Invalid order-book price: ${price}`);
    }
    return String(price);
}

function assertQuantity(quantity: number): void {
    if (!Number.isFinite(quantity) || quantity < 0) {
        throw new Error(`Invalid order-book quantity: ${quantity}`);
    }
}

export class SpotLocalOrderBook {
    private readonly bids = new Map<string, SpotDepthLevel>();
    private readonly asks = new Map<string, SpotDepthLevel>();
    private updateId = 0;
    private lastReceivedAt = 0;

    constructor(private readonly symbol: string) {}

    get lastUpdateId(): number {
        return this.updateId;
    }

    loadSnapshot(snapshot: SpotDepthSnapshot): void {
        if (snapshot.symbol.toUpperCase() !== this.symbol.toUpperCase()) {
            throw new Error(`Depth snapshot symbol mismatch: ${snapshot.symbol}`);
        }
        if (!Number.isSafeInteger(snapshot.lastUpdateId) || snapshot.lastUpdateId < 0) {
            throw new Error(`Invalid depth snapshot update ID: ${snapshot.lastUpdateId}`);
        }

        const nextBids = new Map<string, SpotDepthLevel>();
        const nextAsks = new Map<string, SpotDepthLevel>();
        for (const level of snapshot.bids) this.setLevel(nextBids, level);
        for (const level of snapshot.asks) this.setLevel(nextAsks, level);
        this.assertMapsValid(nextBids, nextAsks);

        this.bids.clear();
        this.asks.clear();
        for (const [key, level] of nextBids) this.bids.set(key, level);
        for (const [key, level] of nextAsks) this.asks.set(key, level);
        this.updateId = snapshot.lastUpdateId;
        this.lastReceivedAt = snapshot.receivedAt;
    }

    apply(update: SpotDepthUpdate): SpotDepthApplyResult {
        if (update.symbol.toUpperCase() !== this.symbol.toUpperCase()) {
            throw new Error(`Depth update symbol mismatch: ${update.symbol}`);
        }
        if (!Number.isSafeInteger(update.firstUpdateId) || !Number.isSafeInteger(update.finalUpdateId)) {
            throw new Error('Depth update IDs must be safe integers.');
        }
        if (update.firstUpdateId > update.finalUpdateId) {
            throw new Error('Depth update firstUpdateId exceeds finalUpdateId.');
        }

        if (update.finalUpdateId <= this.updateId) {
            return { status: 'IGNORED_STALE', updateId: this.updateId };
        }

        const expected = this.updateId + 1;
        if (update.firstUpdateId > expected) {
            return {
                status: 'GAP',
                expectedUpdateId: expected,
                firstUpdateId: update.firstUpdateId,
                finalUpdateId: update.finalUpdateId,
            };
        }

        // A valid bridging event can start before expected, as long as it reaches/passes expected.
        if (update.finalUpdateId < expected) {
            return { status: 'IGNORED_STALE', updateId: this.updateId };
        }

        const undo: Array<{ side: Map<string, SpotDepthLevel>; key: string; previous?: SpotDepthLevel }> = [];
        try {
            for (const level of update.bids) this.setLevelTransactional(this.bids, level, undo);
            for (const level of update.asks) this.setLevelTransactional(this.asks, level, undo);
            this.assertBookValid();
        } catch (error) {
            for (let i = undo.length - 1; i >= 0; i -= 1) {
                const item = undo[i];
                if (item.previous) item.side.set(item.key, item.previous);
                else item.side.delete(item.key);
            }
            throw error;
        }
        this.updateId = update.finalUpdateId;
        this.lastReceivedAt = update.receivedAt;
        return { status: 'APPLIED', updateId: this.updateId };
    }

    getSnapshot(levels = 20): SpotLocalOrderBookSnapshot {
        if (!Number.isInteger(levels) || levels <= 0) {
            throw new Error('Order-book snapshot levels must be a positive integer.');
        }
        const bids = this.sortedBids().slice(0, levels);
        const asks = this.sortedAsks().slice(0, levels);
        const metrics = this.calculateMetrics(levels);
        return {
            symbol: this.symbol.toUpperCase(),
            lastUpdateId: this.updateId,
            bids: bids.map((level) => ({ ...level })),
            asks: asks.map((level) => ({ ...level })),
            metrics,
            receivedAt: this.lastReceivedAt,
        };
    }

    calculateMetrics(levels = 10): SpotOrderBookMetrics {
        const bids = this.sortedBids().slice(0, levels);
        const asks = this.sortedAsks().slice(0, levels);
        if (bids.length === 0 || asks.length === 0) {
            throw new Error('Cannot calculate order-book metrics without both bid and ask levels.');
        }
        const bestBid = bids[0];
        const bestAsk = asks[0];
        if (bestBid.price >= bestAsk.price) {
            throw new Error('Crossed or locked local order book.');
        }
        const midPrice = (bestBid.price + bestAsk.price) / 2;
        const spread = bestAsk.price - bestBid.price;
        const bidDepth = bids.reduce((sum, level) => sum + level.quantity, 0);
        const askDepth = asks.reduce((sum, level) => sum + level.quantity, 0);
        const depthTotal = bidDepth + askDepth;
        const queueImbalance = depthTotal === 0 ? 0 : (bidDepth - askDepth) / depthTotal;
        const topQty = bestBid.quantity + bestAsk.quantity;
        const microPrice = topQty === 0
            ? midPrice
            : (bestAsk.price * bestBid.quantity + bestBid.price * bestAsk.quantity) / topQty;

        return {
            levels,
            bestBid: bestBid.price,
            bestBidQty: bestBid.quantity,
            bestAsk: bestAsk.price,
            bestAskQty: bestAsk.quantity,
            midPrice,
            spread,
            spreadBps: (spread / midPrice) * 10_000,
            microPrice,
            bidDepth,
            askDepth,
            queueImbalance,
        };
    }

    private setLevel(side: Map<string, SpotDepthLevel>, level: SpotDepthLevel): void {
        const key = priceKey(level.price);
        assertQuantity(level.quantity);
        if (level.quantity === 0) {
            side.delete(key);
            return;
        }
        side.set(key, { price: level.price, quantity: level.quantity });
    }

    private setLevelTransactional(
        side: Map<string, SpotDepthLevel>,
        level: SpotDepthLevel,
        undo: Array<{ side: Map<string, SpotDepthLevel>; key: string; previous?: SpotDepthLevel }>,
    ): void {
        const key = priceKey(level.price);
        assertQuantity(level.quantity);
        const previous = side.get(key);
        undo.push({ side, key, previous: previous ? { ...previous } : undefined });
        if (level.quantity === 0) side.delete(key);
        else side.set(key, { price: level.price, quantity: level.quantity });
    }

    private sortedBids(): SpotDepthLevel[] {
        return Array.from(this.bids.values()).sort((a, b) => b.price - a.price);
    }

    private sortedAsks(): SpotDepthLevel[] {
        return Array.from(this.asks.values()).sort((a, b) => a.price - b.price);
    }

    private assertBookValid(): void {
        this.assertMapsValid(this.bids, this.asks);
    }

    private assertMapsValid(bids: Map<string, SpotDepthLevel>, asks: Map<string, SpotDepthLevel>): void {
        const bestBid = Array.from(bids.values()).sort((a, b) => b.price - a.price)[0];
        const bestAsk = Array.from(asks.values()).sort((a, b) => a.price - b.price)[0];
        if (!bestBid || !bestAsk) {
            throw new Error('Local order book must contain both bid and ask liquidity.');
        }
        if (bestBid.price >= bestAsk.price) {
            throw new Error('Crossed or locked local order book.');
        }
    }
}
