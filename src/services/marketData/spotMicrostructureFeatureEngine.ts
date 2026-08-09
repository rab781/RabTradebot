import { SpotAggregateTrade } from './spotMarketDataTypes';
import { SpotDepthLevel, SpotLocalOrderBookSnapshot } from './spotDepthTypes';
import {
    SPOT_MICROSTRUCTURE_SCHEMA_VERSION,
    SPOT_MICROSTRUCTURE_WINDOW_MS,
    SpotDepthFeatureSource,
    SpotDepthLevelFeatures,
    SpotDepthWindowFeatures,
    SpotMarketDataFeatureSource,
    SpotMicrostructureFlatVector,
    SpotMicrostructureQuality,
    SpotMicrostructureSnapshot,
    SpotMicrostructureWindow,
    SpotTradeWindowFeatures,
} from './spotMicrostructureTypes';

interface SignedTradeSample {
    id: number;
    at: number;
    price: number;
    quantity: number;
    quoteQuantity: number;
    side: 'BUY' | 'SELL';
    signedBase: number;
    signedQuote: number;
}

interface DepthFlowSample {
    at: number;
    ofi: number;
    topDepth: number;
    bidAdd: number;
    bidRemove: number;
    askAdd: number;
    askRemove: number;
}

export interface SpotMicrostructureFeatureEngineOptions {
    symbol: string;
    maxTradeAgeMs?: number;
    maxDepthAgeMs?: number;
    visibleDepthLevels?: number;
}

function sum(values: number[]): number {
    return values.reduce((acc, value) => acc + value, 0);
}

function safeRatio(numerator: number, denominator: number): number {
    return denominator === 0 ? 0 : numerator / denominator;
}

function imbalance(positive: number, negative: number): number {
    return safeRatio(positive - negative, positive + negative);
}

function cloneLevels(levels: SpotDepthLevel[]): SpotDepthLevel[] {
    return levels.map((level) => ({ ...level }));
}

function levelMap(levels: SpotDepthLevel[]): Map<number, number> {
    return new Map(levels.map((level) => [level.price, level.quantity]));
}

function sideVisibleDelta(previous: SpotDepthLevel[], current: SpotDepthLevel[]): { add: number; remove: number } {
    const prev = levelMap(previous);
    const next = levelMap(current);
    const prices = new Set<number>([...prev.keys(), ...next.keys()]);
    let add = 0;
    let remove = 0;
    for (const price of prices) {
        const delta = (next.get(price) ?? 0) - (prev.get(price) ?? 0);
        if (delta > 0) add += delta;
        else if (delta < 0) remove += -delta;
    }
    return { add, remove };
}

/**
 * Cont-Kukanov-Stoikov top-of-book OFI increment.
 * Positive values represent net bid-side pressure / ask-side depletion.
 */
export function calculateTopOfBookOfiIncrement(
    previous: SpotLocalOrderBookSnapshot,
    current: SpotLocalOrderBookSnapshot,
): number {
    const prevBid = previous.bids[0];
    const prevAsk = previous.asks[0];
    const bid = current.bids[0];
    const ask = current.asks[0];
    if (!prevBid || !prevAsk || !bid || !ask) return 0;

    let value = 0;
    if (bid.price >= prevBid.price) value += bid.quantity;
    if (bid.price <= prevBid.price) value -= prevBid.quantity;
    if (ask.price <= prevAsk.price) value -= ask.quantity;
    if (ask.price >= prevAsk.price) value += prevAsk.quantity;
    return value;
}

export function signAggregateTrade(trade: SpotAggregateTrade): SignedTradeSample {
    // Binance m=true => buyer is maker => seller is taker/aggressor.
    const side: 'BUY' | 'SELL' = trade.buyerIsMaker ? 'SELL' : 'BUY';
    const direction = side === 'BUY' ? 1 : -1;
    const quoteQuantity = trade.price * trade.quantity;
    return {
        id: trade.id,
        at: trade.tradeTime,
        price: trade.price,
        quantity: trade.quantity,
        quoteQuantity,
        side,
        signedBase: direction * trade.quantity,
        signedQuote: direction * quoteQuantity,
    };
}

export function calculateDepthLevelFeatures(
    snapshot: SpotLocalOrderBookSnapshot,
    levels: number,
): SpotDepthLevelFeatures {
    const bids = snapshot.bids.slice(0, levels);
    const asks = snapshot.asks.slice(0, levels);
    if (bids.length === 0 || asks.length === 0) {
        throw new Error('Cannot calculate microstructure depth features without both book sides.');
    }
    const mid = (bids[0].price + asks[0].price) / 2;
    const bidDepthBase = sum(bids.map((item) => item.quantity));
    const askDepthBase = sum(asks.map((item) => item.quantity));
    const bidDepthQuote = sum(bids.map((item) => item.price * item.quantity));
    const askDepthQuote = sum(asks.map((item) => item.price * item.quantity));

    const bidDistanceBps = Math.max(((mid - bids[bids.length - 1].price) / mid) * 10_000, 1e-9);
    const askDistanceBps = Math.max(((asks[asks.length - 1].price - mid) / mid) * 10_000, 1e-9);
    const bidDepthDensityPerBps = bidDepthBase / bidDistanceBps;
    const askDepthDensityPerBps = askDepthBase / askDistanceBps;

    return {
        levels,
        bidDepthBase,
        askDepthBase,
        bidDepthQuote,
        askDepthQuote,
        queueImbalance: imbalance(bidDepthBase, askDepthBase),
        bidDepthDensityPerBps,
        askDepthDensityPerBps,
        depthDensityImbalance: imbalance(bidDepthDensityPerBps, askDepthDensityPerBps),
    };
}

export class SpotMicrostructureFeatureEngine {
    private readonly symbol: string;
    private readonly maxTradeAgeMs: number;
    private readonly maxDepthAgeMs: number;
    private readonly visibleDepthLevels: number;
    private running = false;
    private trades: SignedTradeSample[] = [];
    private depthFlows: DepthFlowSample[] = [];
    private latestDepth?: SpotLocalOrderBookSnapshot;
    private lastTradeId = -1;

    private readonly tradeListener = (trade: SpotAggregateTrade): void => this.handleTrade(trade);
    private readonly depthListener = (snapshot: SpotLocalOrderBookSnapshot): void => this.handleDepth(snapshot);

    constructor(
        private readonly market: SpotMarketDataFeatureSource,
        private readonly depth: SpotDepthFeatureSource,
        options: SpotMicrostructureFeatureEngineOptions,
    ) {
        this.symbol = options.symbol.toUpperCase();
        this.maxTradeAgeMs = options.maxTradeAgeMs ?? 5_000;
        this.maxDepthAgeMs = options.maxDepthAgeMs ?? 2_000;
        this.visibleDepthLevels = options.visibleDepthLevels ?? 20;
        if (!Number.isInteger(this.visibleDepthLevels) || this.visibleDepthLevels <= 0) {
            throw new Error('visibleDepthLevels must be a positive integer.');
        }
    }

    start(): void {
        if (this.running) return;
        const marketSnapshot = this.market.getSnapshot();
        if (marketSnapshot.symbol.toUpperCase() !== this.symbol) {
            throw new Error(`Market-data symbol mismatch: ${marketSnapshot.symbol}`);
        }
        const depthSnapshot = this.depth.getSnapshot(this.visibleDepthLevels);
        if (depthSnapshot.symbol.toUpperCase() !== this.symbol) {
            throw new Error(`Depth symbol mismatch: ${depthSnapshot.symbol}`);
        }

        this.trades = [];
        this.depthFlows = [];
        this.latestDepth = this.cloneDepthSnapshot(depthSnapshot);
        this.lastTradeId = -1;
        for (const trade of marketSnapshot.aggregateTrades) this.handleTrade(trade);
        const latestSeedTime = Math.max(
            depthSnapshot.receivedAt,
            marketSnapshot.aggregateTrades[marketSnapshot.aggregateTrades.length - 1]?.tradeTime ?? 0,
        );
        this.prune(latestSeedTime);

        this.market.on('aggTrade', this.tradeListener);
        this.depth.on('depth', this.depthListener);
        this.running = true;
    }

    stop(): void {
        if (!this.running) return;
        this.market.off('aggTrade', this.tradeListener);
        this.depth.off('depth', this.depthListener);
        this.running = false;
    }

    getSnapshot(now = Date.now()): SpotMicrostructureSnapshot {
        if (!this.latestDepth) {
            throw new Error('SpotMicrostructureFeatureEngine has no depth snapshot. Start the engine after market/depth bootstrap.');
        }
        this.prune(now);
        const depthSnapshot = this.latestDepth;
        const metrics = depthSnapshot.metrics;
        const microPriceDeviationBps = ((metrics.microPrice - metrics.midPrice) / metrics.midPrice) * 10_000;

        return {
            schemaVersion: SPOT_MICROSTRUCTURE_SCHEMA_VERSION,
            symbol: this.symbol,
            generatedAt: now,
            midPrice: metrics.midPrice,
            spreadBps: metrics.spreadBps,
            microPrice: metrics.microPrice,
            microPriceDeviationBps,
            topQueueImbalance: imbalance(metrics.bestBidQty, metrics.bestAskQty),
            depth1: calculateDepthLevelFeatures(depthSnapshot, 1),
            depth5: calculateDepthLevelFeatures(depthSnapshot, 5),
            depth10: calculateDepthLevelFeatures(depthSnapshot, 10),
            depth20: calculateDepthLevelFeatures(depthSnapshot, 20),
            trade1s: this.tradeWindow('1s', now),
            trade5s: this.tradeWindow('5s', now),
            trade30s: this.tradeWindow('30s', now),
            trade60s: this.tradeWindow('60s', now),
            depthFlow1s: this.depthWindow('1s', now),
            depthFlow5s: this.depthWindow('5s', now),
            depthFlow30s: this.depthWindow('30s', now),
            depthFlow60s: this.depthWindow('60s', now),
            quality: this.quality(now),
        };
    }

    toFlatVector(snapshot = this.getSnapshot()): SpotMicrostructureFlatVector {
        const entries: Array<[string, number]> = [
            ['midPrice', snapshot.midPrice],
            ['spreadBps', snapshot.spreadBps],
            ['microPriceDeviationBps', snapshot.microPriceDeviationBps],
            ['topQueueImbalance', snapshot.topQueueImbalance],
        ];

        for (const level of [1, 5, 10, 20] as const) {
            const value = snapshot[`depth${level}` as const];
            entries.push(
                [`depth${level}.bidDepthBase`, value.bidDepthBase],
                [`depth${level}.askDepthBase`, value.askDepthBase],
                [`depth${level}.bidDepthQuote`, value.bidDepthQuote],
                [`depth${level}.askDepthQuote`, value.askDepthQuote],
                [`depth${level}.queueImbalance`, value.queueImbalance],
                [`depth${level}.bidDepthDensityPerBps`, value.bidDepthDensityPerBps],
                [`depth${level}.askDepthDensityPerBps`, value.askDepthDensityPerBps],
                [`depth${level}.depthDensityImbalance`, value.depthDensityImbalance],
            );
        }

        for (const window of ['1s', '5s', '30s', '60s'] as const) {
            const trade = snapshot[`trade${window}` as const];
            entries.push(
                [`trade${window}.aggTradeRatePerSecond`, trade.aggTradeRatePerSecond],
                [`trade${window}.buyBaseVolume`, trade.buyBaseVolume],
                [`trade${window}.sellBaseVolume`, trade.sellBaseVolume],
                [`trade${window}.buyQuoteVolume`, trade.buyQuoteVolume],
                [`trade${window}.sellQuoteVolume`, trade.sellQuoteVolume],
                [`trade${window}.signedBaseCvd`, trade.signedBaseCvd],
                [`trade${window}.signedQuoteCvd`, trade.signedQuoteCvd],
                [`trade${window}.takerVolumeImbalance`, trade.takerVolumeImbalance],
                [`trade${window}.avgAggTradeBaseSize`, trade.avgAggTradeBaseSize],
                [`trade${window}.avgAggTradeQuoteSize`, trade.avgAggTradeQuoteSize],
            );
            const flow = snapshot[`depthFlow${window}` as const];
            entries.push(
                [`depthFlow${window}.ofi`, flow.ofi],
                [`depthFlow${window}.ofiNormalized`, flow.ofiNormalized],
                [`depthFlow${window}.visibleBidAdd`, flow.visibleBidAdd],
                [`depthFlow${window}.visibleBidRemove`, flow.visibleBidRemove],
                [`depthFlow${window}.visibleAskAdd`, flow.visibleAskAdd],
                [`depthFlow${window}.visibleAskRemove`, flow.visibleAskRemove],
                [`depthFlow${window}.visibleLiquidityPressure`, flow.visibleLiquidityPressure],
            );
        }

        const names = entries.map(([name]) => name);
        const values = entries.map(([, value]) => value);
        if (!values.every(Number.isFinite)) {
            throw new Error('Microstructure feature vector contains non-finite values.');
        }
        return { schemaVersion: SPOT_MICROSTRUCTURE_SCHEMA_VERSION, names, values };
    }

    private handleTrade(trade: SpotAggregateTrade): void {
        if (trade.symbol.toUpperCase() !== this.symbol) return;
        if (trade.id <= this.lastTradeId) return;
        const signed = signAggregateTrade(trade);
        this.trades.push(signed);
        this.lastTradeId = trade.id;
        this.prune(trade.tradeTime);
    }

    private handleDepth(snapshot: SpotLocalOrderBookSnapshot): void {
        if (snapshot.symbol.toUpperCase() !== this.symbol) return;
        const current = this.cloneDepthSnapshot(snapshot);
        const previous = this.latestDepth;
        if (previous) {
            const bidDelta = sideVisibleDelta(
                previous.bids.slice(0, this.visibleDepthLevels),
                current.bids.slice(0, this.visibleDepthLevels),
            );
            const askDelta = sideVisibleDelta(
                previous.asks.slice(0, this.visibleDepthLevels),
                current.asks.slice(0, this.visibleDepthLevels),
            );
            const topDepth = previous.metrics.bestBidQty + previous.metrics.bestAskQty;
            this.depthFlows.push({
                at: current.receivedAt,
                ofi: calculateTopOfBookOfiIncrement(previous, current),
                topDepth,
                bidAdd: bidDelta.add,
                bidRemove: bidDelta.remove,
                askAdd: askDelta.add,
                askRemove: askDelta.remove,
            });
        }
        this.latestDepth = current;
        this.prune(current.receivedAt);
    }

    private tradeWindow(window: SpotMicrostructureWindow, now: number): SpotTradeWindowFeatures {
        const ms = SPOT_MICROSTRUCTURE_WINDOW_MS[window];
        const selected = this.trades.filter((item) => item.at > now - ms && item.at <= now);
        const buys = selected.filter((item) => item.side === 'BUY');
        const sells = selected.filter((item) => item.side === 'SELL');
        const buyBaseVolume = sum(buys.map((item) => item.quantity));
        const sellBaseVolume = sum(sells.map((item) => item.quantity));
        const buyQuoteVolume = sum(buys.map((item) => item.quoteQuantity));
        const sellQuoteVolume = sum(sells.map((item) => item.quoteQuantity));
        const totalBaseVolume = buyBaseVolume + sellBaseVolume;
        const totalQuoteVolume = buyQuoteVolume + sellQuoteVolume;
        return {
            aggTradeCount: selected.length,
            aggTradeRatePerSecond: selected.length / (ms / 1_000),
            buyAggTradeCount: buys.length,
            sellAggTradeCount: sells.length,
            buyBaseVolume,
            sellBaseVolume,
            buyQuoteVolume,
            sellQuoteVolume,
            totalBaseVolume,
            totalQuoteVolume,
            signedBaseCvd: sum(selected.map((item) => item.signedBase)),
            signedQuoteCvd: sum(selected.map((item) => item.signedQuote)),
            takerVolumeImbalance: imbalance(buyBaseVolume, sellBaseVolume),
            avgAggTradeBaseSize: safeRatio(totalBaseVolume, selected.length),
            avgAggTradeQuoteSize: safeRatio(totalQuoteVolume, selected.length),
        };
    }

    private depthWindow(window: SpotMicrostructureWindow, now: number): SpotDepthWindowFeatures {
        const ms = SPOT_MICROSTRUCTURE_WINDOW_MS[window];
        const selected = this.depthFlows.filter((item) => item.at > now - ms && item.at <= now);
        const ofi = sum(selected.map((item) => item.ofi));
        const avgTopDepth = safeRatio(sum(selected.map((item) => item.topDepth)), selected.length);
        const visibleBidAdd = sum(selected.map((item) => item.bidAdd));
        const visibleBidRemove = sum(selected.map((item) => item.bidRemove));
        const visibleAskAdd = sum(selected.map((item) => item.askAdd));
        const visibleAskRemove = sum(selected.map((item) => item.askRemove));
        const bullishVisibleChange = visibleBidAdd + visibleAskRemove;
        const bearishVisibleChange = visibleBidRemove + visibleAskAdd;
        return {
            ofi,
            ofiNormalized: safeRatio(ofi, avgTopDepth),
            visibleBidAdd,
            visibleBidRemove,
            visibleAskAdd,
            visibleAskRemove,
            visibleLiquidityPressure: imbalance(bullishVisibleChange, bearishVisibleChange),
        };
    }

    private quality(now: number): SpotMicrostructureQuality {
        const marketHealth = this.market.getHealth();
        const depthHealth = this.depth.getHealth();
        const latestTrade = this.trades[this.trades.length - 1];
        const tradeAge = latestTrade ? Math.max(0, now - latestTrade.at) : undefined;
        const depthAge = this.latestDepth ? Math.max(0, now - this.latestDepth.receivedAt) : undefined;
        const reasons: string[] = [];
        if (marketHealth.status !== 'LIVE') reasons.push(`market:${marketHealth.status}`);
        if (depthHealth.status !== 'LIVE') reasons.push(`depth:${depthHealth.status}`);
        if (tradeAge === undefined || tradeAge > this.maxTradeAgeMs) reasons.push('trade-stale');
        if (depthAge === undefined || depthAge > this.maxDepthAgeMs) reasons.push('depth-stale');
        return {
            healthy: reasons.length === 0,
            marketStatus: marketHealth.status,
            depthStatus: depthHealth.status,
            lastTradeAgeMs: tradeAge,
            lastDepthAgeMs: depthAge,
            tradeSamples60s: this.trades.filter((item) => item.at > now - 60_000 && item.at <= now).length,
            ofiSamples60s: this.depthFlows.filter((item) => item.at > now - 60_000 && item.at <= now).length,
            reasons,
        };
    }

    private prune(now: number): void {
        const threshold = now - SPOT_MICROSTRUCTURE_WINDOW_MS['60s'];
        this.trades = this.trades.filter((item) => item.at > threshold);
        this.depthFlows = this.depthFlows.filter((item) => item.at > threshold);
    }

    private cloneDepthSnapshot(snapshot: SpotLocalOrderBookSnapshot): SpotLocalOrderBookSnapshot {
        return {
            ...snapshot,
            bids: cloneLevels(snapshot.bids),
            asks: cloneLevels(snapshot.asks),
            metrics: { ...snapshot.metrics },
        };
    }
}
