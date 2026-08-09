import { SpotAggregateTrade, SpotMarketDataHealth, SpotMarketDataSnapshot } from './spotMarketDataTypes';
import { SpotDepthHealth, SpotLocalOrderBookSnapshot } from './spotDepthTypes';

export const SPOT_MICROSTRUCTURE_SCHEMA_VERSION = 'spot-microstructure-v1' as const;

export type SpotMicrostructureWindow = '1s' | '5s' | '30s' | '60s';

export const SPOT_MICROSTRUCTURE_WINDOW_MS: Record<SpotMicrostructureWindow, number> = {
    '1s': 1_000,
    '5s': 5_000,
    '30s': 30_000,
    '60s': 60_000,
};

export interface SpotTradeWindowFeatures {
    aggTradeCount: number;
    aggTradeRatePerSecond: number;
    buyAggTradeCount: number;
    sellAggTradeCount: number;
    buyBaseVolume: number;
    sellBaseVolume: number;
    buyQuoteVolume: number;
    sellQuoteVolume: number;
    totalBaseVolume: number;
    totalQuoteVolume: number;
    signedBaseCvd: number;
    signedQuoteCvd: number;
    takerVolumeImbalance: number;
    avgAggTradeBaseSize: number;
    avgAggTradeQuoteSize: number;
}

export interface SpotDepthWindowFeatures {
    ofi: number;
    ofiNormalized: number;
    visibleBidAdd: number;
    visibleBidRemove: number;
    visibleAskAdd: number;
    visibleAskRemove: number;
    visibleLiquidityPressure: number;
}

export interface SpotDepthLevelFeatures {
    levels: number;
    bidDepthBase: number;
    askDepthBase: number;
    bidDepthQuote: number;
    askDepthQuote: number;
    queueImbalance: number;
    bidDepthDensityPerBps: number;
    askDepthDensityPerBps: number;
    depthDensityImbalance: number;
}

export interface SpotMicrostructureQuality {
    healthy: boolean;
    marketStatus: SpotMarketDataHealth['status'];
    depthStatus: SpotDepthHealth['status'];
    lastTradeAgeMs?: number;
    lastDepthAgeMs?: number;
    tradeSamples60s: number;
    ofiSamples60s: number;
    reasons: string[];
}

export interface SpotMicrostructureSnapshot {
    schemaVersion: typeof SPOT_MICROSTRUCTURE_SCHEMA_VERSION;
    symbol: string;
    generatedAt: number;

    midPrice: number;
    spreadBps: number;
    microPrice: number;
    microPriceDeviationBps: number;
    topQueueImbalance: number;

    depth1: SpotDepthLevelFeatures;
    depth5: SpotDepthLevelFeatures;
    depth10: SpotDepthLevelFeatures;
    depth20: SpotDepthLevelFeatures;

    trade1s: SpotTradeWindowFeatures;
    trade5s: SpotTradeWindowFeatures;
    trade30s: SpotTradeWindowFeatures;
    trade60s: SpotTradeWindowFeatures;

    depthFlow1s: SpotDepthWindowFeatures;
    depthFlow5s: SpotDepthWindowFeatures;
    depthFlow30s: SpotDepthWindowFeatures;
    depthFlow60s: SpotDepthWindowFeatures;

    quality: SpotMicrostructureQuality;
}

export interface SpotMarketDataFeatureSource {
    on(event: 'aggTrade', listener: (trade: SpotAggregateTrade) => void): this;
    off(event: 'aggTrade', listener: (trade: SpotAggregateTrade) => void): this;
    getSnapshot(): SpotMarketDataSnapshot;
    getHealth(): SpotMarketDataHealth;
}

export interface SpotDepthFeatureSource {
    on(event: 'depth', listener: (snapshot: SpotLocalOrderBookSnapshot) => void): this;
    off(event: 'depth', listener: (snapshot: SpotLocalOrderBookSnapshot) => void): this;
    getSnapshot(levels?: number): SpotLocalOrderBookSnapshot;
    getHealth(): SpotDepthHealth;
}

export interface SpotMicrostructureFlatVector {
    schemaVersion: typeof SPOT_MICROSTRUCTURE_SCHEMA_VERSION;
    names: string[];
    values: number[];
}
