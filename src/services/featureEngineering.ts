/**
 * Feature Engineering Service
 * Extracts 50+ features from OHLCV data for ML model training and prediction
 */

import { OHLCVCandle } from '../types/dataframe';
import {
    RSI,
    MACD,
    BollingerBands,
    EMA,
    SMA,
    ATR,
    ADX,
    Stochastic,
    OBV,
    ROC,
    CCI,
    WilliamsR,
    MFI
} from 'technicalindicators';
import { getDatabase } from '../database/database';

const MIN_CANDLES_FOR_FEATURES = 200;

export interface FeatureSet {
    // Price-based features (9)
    returns: number;
    logReturns: number;
    priceChange: number;
    priceChangePercent: number;
    highLowRange: number;
    openCloseRange: number;
    upperShadow: number;
    lowerShadow: number;
    bodyToRangeRatio: number;

    // Technical Indicators - Momentum (14)
    rsi_7: number;
    rsi_14: number;
    rsi_21: number;
    roc_10: number;
    roc_20: number;
    stoch_k: number;
    stoch_d: number;
    williams_r: number;
    cci: number;
    mfi: number;
    macd: number;
    macdSignal: number;
    macdHistogram: number;
    macdCrossover: number;

    // Technical Indicators - Trend (10)
    ema_9: number;
    ema_21: number;
    ema_50: number;
    sma_20: number;
    sma_50: number;
    sma_200: number;
    adx: number;
    priceVsEMA9: number;
    priceVsEMA21: number;
    priceVsSMA50: number;

    // Technical Indicators - Volatility (7)
    atr_14: number;
    atrPercent: number;
    bb_upper: number;
    bb_middle: number;
    bb_lower: number;
    bb_width: number;
    bb_percentB: number;

    // Volume-based features (7)
    volumeRatio: number;
    volumeMA_20: number;
    obv: number;
    obvSlope: number;
    volumePriceCorrelation: number;
    volumeWeightedPrice: number;
    moneyFlowIndex: number;

    // Statistical features (8)
    volatility_20: number;
    volatility_50: number;
    skewness_20: number;
    kurtosis_20: number;
    autocorrelation_1: number;
    autocorrelation_5: number;
    returns_mean_20: number;
    returns_std_20: number;

    // Market microstructure (5)
    spreadApprox: number;
    volumeImbalance: number;
    priceEfficiency: number;
    marketDepthProxy: number;
    liquidityScore: number;

    // Metadata
    timestamp: number;
    symbol: string;
}

export class FeatureEngineeringService {
    private cache: Map<string, FeatureSet> = new Map();
    private useDatabase: boolean;

    constructor(useDatabase: boolean = true) {
        this.useDatabase = useDatabase;
    }

    /**
     * Extract all features from candle data
     */
    extractFeatures(data: OHLCVCandle[], symbol: string): FeatureSet[] {
        if (data.length < MIN_CANDLES_FOR_FEATURES) {
            throw new Error(`Need at least ${MIN_CANDLES_FOR_FEATURES} candles for feature extraction`);
        }

        // Optimization: Check if all required features are already in cache
        // This avoids expensive indicator calculation if we have everything cached
        const cachedFeatures: FeatureSet[] = [];
        let allCached = true;

        for (let i = MIN_CANDLES_FOR_FEATURES; i < data.length; i++) {
            const timestamp = data[i].timestamp;
            const cacheKey = `${symbol}_${timestamp}`;

            // Check memory cache
            let featureSet = this.cache.get(cacheKey);

            // Check database cache if not in memory
            if (!featureSet && this.useDatabase) {
                const db = getDatabase();
                const cached = db.getFeatureCache(symbol, timestamp);
                if (cached) {
                    featureSet = JSON.parse(cached.features) as FeatureSet;
                    // Update memory cache
                    this.cache.set(cacheKey, featureSet);
                }
            }

            if (featureSet) {
                cachedFeatures.push(featureSet);
            } else {
                allCached = false;
                break;
            }
        }

        if (allCached) {
            return cachedFeatures;
        }

        const features: FeatureSet[] = [];
        const len = data.length;

        // ⚡ Bolt Optimization: Replace 5 O(N) .map() calls and closure overhead
        // with a single pre-allocated O(N) loop for extracting OHLCV columns.
        const closes = new Array<number>(len);
        const highs = new Array<number>(len);
        const lows = new Array<number>(len);
        const opens = new Array<number>(len);
        const volumes = new Array<number>(len);

        for (let i = 0; i < len; i++) {
            const d = data[i];
            closes[i] = d.close;
            highs[i] = d.high;
            lows[i] = d.low;
            opens[i] = d.open;
            volumes[i] = d.volume;
        }

        // Pre-calculate indicators for all data points
        const indicators = this.calculateAllIndicators(data, closes, highs, lows, opens, volumes);

        // ⚡ Bolt Optimization: Replace expensive .slice(1).map() which creates
        // intermediate arrays with a single pre-allocated loop for returns.
        // allReturns[i] corresponds to the return for close[i+1] relative to close[i]
        const allReturns: number[] = new Array<number>(len > 0 ? len - 1 : 0);
        for (let i = 0; i < len - 1; i++) {
            allReturns[i] = (closes[i + 1] - closes[i]) / closes[i];
        }

        // Extract features for each candle (starting from index MIN_CANDLES_FOR_FEATURES to have enough history)
        for (let i = MIN_CANDLES_FOR_FEATURES; i < data.length; i++) {
            const timestamp = data[i].timestamp;

            // Check cache first
            const cacheKey = `${symbol}_${timestamp}`;
            if (this.cache.has(cacheKey)) {
                features.push(this.cache.get(cacheKey)!);
                continue;
            }

            // Check database cache
            if (this.useDatabase) {
                const db = getDatabase();
                const cached = db.getFeatureCache(symbol, timestamp);
                if (cached) {
                    const featureSet = JSON.parse(cached.features) as FeatureSet;
                    this.cache.set(cacheKey, featureSet);
                    features.push(featureSet);
                    continue;
                }
            }

            // Calculate features
            const featureSet: FeatureSet = {
                // Price features
                ...this.extractPriceFeatures(data, i),

                // Technical indicators
                ...this.extractMomentumIndicators(indicators, i),
                ...this.extractTrendIndicators(indicators, i, closes[i]),
                ...this.extractVolatilityIndicators(indicators, i, closes[i]),

                // Volume features
                ...this.extractVolumeFeatures(closes, volumes, indicators, i),

                // Statistical features
                ...this.extractStatisticalFeatures(closes, allReturns, i),

                // Market microstructure
                ...this.extractMarketMicrostructure(data, i),

                // Metadata
                timestamp,
                symbol
            };

            // Cache the features
            this.cache.set(cacheKey, featureSet);

            // Save to database if enabled
            if (this.useDatabase) {
                try {
                    const db = getDatabase();
                    db.insertFeatureCache({
                        symbol,
                        timestamp,
                        features: JSON.stringify(featureSet),
                        createdAt: Date.now()
                    });
                } catch (error) {
                    // Ignore cache save errors
                }
            }

            features.push(featureSet);
        }

        return features;
    }

    private calculateAllIndicators(
        data: OHLCVCandle[],
        closes: number[],
        highs: number[],
        lows: number[],
        opens: number[],
        volumes: number[]
    ) {
        return {
            rsi_7: RSI.calculate({ period: 7, values: closes }),
            rsi_14: RSI.calculate({ period: 14, values: closes }),
            rsi_21: RSI.calculate({ period: 21, values: closes }),
            macd: MACD.calculate({
                values: closes,
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9,
                SimpleMAOscillator: false,
                SimpleMASignal: false
            }),
            bb: BollingerBands.calculate({ period: 20, values: closes, stdDev: 2 }),
            ema_9: EMA.calculate({ period: 9, values: closes }),
            ema_21: EMA.calculate({ period: 21, values: closes }),
            ema_50: EMA.calculate({ period: 50, values: closes }),
            sma_20: SMA.calculate({ period: 20, values: closes }),
            sma_50: SMA.calculate({ period: 50, values: closes }),
            sma_200: SMA.calculate({ period: 200, values: closes }),
            atr: ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }),
            adx: ADX.calculate({ high: highs, low: lows, close: closes, period: 14 }),
            stoch: Stochastic.calculate({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 }),
            obv: OBV.calculate({ close: closes, volume: volumes }),
            roc_10: ROC.calculate({ period: 10, values: closes }),
            roc_20: ROC.calculate({ period: 20, values: closes }),
            cci: CCI.calculate({ high: highs, low: lows, close: closes, period: 20 }),
            williamsR: WilliamsR.calculate({ high: highs, low: lows, close: closes, period: 14 }),
            mfi: MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 })
        };
    }

    private extractPriceFeatures(data: OHLCVCandle[], index: number) {
        const current = data[index];
        const previous = data[index - 1];

        const close = current.close;
        const open = current.open;
        const high = current.high;
        const low = current.low;
        const prevClose = previous.close;

        const returns = (close - prevClose) / prevClose;
        const logReturns = Math.log(close / prevClose);
        const priceChange = close - prevClose;
        const priceChangePercent = returns * 100;
        const highLowRange = high - low;
        const openCloseRange = Math.abs(close - open);
        const upperShadow = high - Math.max(open, close);
        const lowerShadow = Math.min(open, close) - low;
        const bodyToRangeRatio = highLowRange > 0 ? openCloseRange / highLowRange : 0;

        return {
            returns,
            logReturns,
            priceChange,
            priceChangePercent,
            highLowRange,
            openCloseRange,
            upperShadow,
            lowerShadow,
            bodyToRangeRatio
        };
    }

    private extractMomentumIndicators(indicators: any, index: number) {
        const arrayIndex = index - MIN_CANDLES_FOR_FEATURES;

        const macdValue = indicators.macd[arrayIndex] || { MACD: 0, signal: 0, histogram: 0 };
        const stochValue = indicators.stoch[arrayIndex] || { k: 50, d: 50 };
        const macd = macdValue?.MACD ?? 0;
        const macdSignal = macdValue?.signal ?? 0;
        const macdHistogram = macdValue?.histogram ?? 0;
        const stochK = stochValue?.k ?? 50;
        const stochD = stochValue?.d ?? 50;

        return {
            rsi_7: indicators.rsi_7[arrayIndex] || 50,
            rsi_14: indicators.rsi_14[arrayIndex] || 50,
            rsi_21: indicators.rsi_21[arrayIndex] || 50,
            roc_10: indicators.roc_10[arrayIndex] || 0,
            roc_20: indicators.roc_20[arrayIndex] || 0,
            stoch_k: stochK,
            stoch_d: stochD,
            williams_r: indicators.williamsR[arrayIndex] || -50,
            cci: indicators.cci[arrayIndex] || 0,
            mfi: indicators.mfi[arrayIndex] || 50,
            macd,
            macdSignal,
            macdHistogram,
            macdCrossover: this.calculateMACDCrossover(indicators.macd, arrayIndex)
        };
    }

    private extractTrendIndicators(indicators: any, index: number, currentPrice: number) {
        const arrayIndex = index - MIN_CANDLES_FOR_FEATURES;

        const ema9 = indicators.ema_9[arrayIndex] || currentPrice;
        const ema21 = indicators.ema_21[arrayIndex] || currentPrice;
        const sma50 = indicators.sma_50[arrayIndex] || currentPrice;

        return {
            ema_9: ema9,
            ema_21: ema21,
            ema_50: indicators.ema_50[arrayIndex] || currentPrice,
            sma_20: indicators.sma_20[arrayIndex] || currentPrice,
            sma_50: sma50,
            sma_200: indicators.sma_200[arrayIndex] || currentPrice,
            adx: indicators.adx[arrayIndex]?.adx || 20,
            priceVsEMA9: ((currentPrice - ema9) / ema9) * 100,
            priceVsEMA21: ((currentPrice - ema21) / ema21) * 100,
            priceVsSMA50: ((currentPrice - sma50) / sma50) * 100
        };
    }

    private extractVolatilityIndicators(indicators: any, index: number, currentPrice: number) {
        const arrayIndex = index - MIN_CANDLES_FOR_FEATURES;
        const bb = indicators.bb[arrayIndex] || { upper: currentPrice, middle: currentPrice, lower: currentPrice };
        const atr = indicators.atr[arrayIndex] || 0;

        const bb_width = ((bb.upper - bb.lower) / bb.middle) * 100;
        const bb_percentB = bb.upper !== bb.lower ? (currentPrice - bb.lower) / (bb.upper - bb.lower) : 0.5;

        return {
            atr_14: atr,
            atrPercent: (atr / currentPrice) * 100,
            bb_upper: bb.upper,
            bb_middle: bb.middle,
            bb_lower: bb.lower,
            bb_width,
            bb_percentB
        };
    }

    private extractVolumeFeatures(closes: number[], volumes: number[], indicators: any, index: number) {
        const startIndex = Math.max(0, index - 20);
        const length = (index + 1) - startIndex;

        let sumVolume = 0;
        let sumVwpNumerator = 0;

        for (let i = startIndex; i < startIndex + length; i++) {
            sumVolume += volumes[i];
            sumVwpNumerator += closes[i] * volumes[i];
        }

        const avgVolume = sumVolume / length;
        const currentVolume = volumes[index];

        const arrayIndex = index - MIN_CANDLES_FOR_FEATURES;
        const obv = indicators.obv[arrayIndex] || 0;
        const obvPrevious = indicators.obv[Math.max(0, arrayIndex - 1)] || 0;

        // Volume-price correlation
        const correlation = this.calculateCorrelation(closes, volumes, startIndex, length);

        // Volume Weighted Price
        const vwp = sumVolume !== 0 ? sumVwpNumerator / sumVolume : 0;

        return {
            volumeRatio: avgVolume !== 0 ? currentVolume / avgVolume : 0,
            volumeMA_20: avgVolume,
            obv: obv,
            obvSlope: obv - obvPrevious,
            volumePriceCorrelation: correlation,
            volumeWeightedPrice: vwp,
            moneyFlowIndex: indicators.mfi[arrayIndex] || 50
        };
    }

    private extractStatisticalFeatures(closes: number[], allReturns: number[], index: number) {
        // allReturns is shifted by 1 relative to closes (allReturns[i] is return for candle i+1)
        // So a window ending at `index` corresponds to start index `Math.max(0, index - window)`
        // up to `index` (length = window).

        const returnStart20 = Math.max(0, index - 20);
        const returnLen20 = index - returnStart20;

        const returnStart50 = Math.max(0, index - 50);
        const returnLen50 = index - returnStart50;

        const closesStart = Math.max(0, index - 20);
        const closesLen = (index + 1) - closesStart;

        const stats20 = this.calculateAdvancedStats(allReturns, returnStart20, returnLen20);

        let sumCloses = 0;
        for (let i = closesStart; i < closesStart + closesLen; i++) {
            sumCloses += closes[i];
        }
        const closesMean = closesLen > 0 ? sumCloses / closesLen : 0;

        return {
            volatility_20: stats20.stdDev,
            volatility_50: this.calculateStdDev(allReturns, returnStart50, returnLen50),
            skewness_20: stats20.skewness,
            kurtosis_20: stats20.kurtosis,
            autocorrelation_1: this.calculateAutocorrelationWithMean(closes, 1, closesMean, closesStart, closesLen),
            autocorrelation_5: this.calculateAutocorrelationWithMean(closes, 5, closesMean, closesStart, closesLen),
            returns_mean_20: stats20.mean,
            returns_std_20: stats20.stdDev
        };
    }

    private extractMarketMicrostructure(data: OHLCVCandle[], index: number) {
        const current = data[index];
        const high = current.high;
        const low = current.low;
        const close = current.close;
        const volume = current.volume;

        // Approximate bid-ask spread using high-low range
        const spreadApprox = ((high - low) / close) * 100;

        // Volume imbalance (proxy using close position in range)
        const volumeImbalance = (close - low) / (high - low);

        // Price efficiency (how directly price moved)
        const priceEfficiency = this.calculatePriceEfficiency(data, index);

        // Market depth proxy (volume * range)
        const marketDepthProxy = volume * (high - low);

        // Liquidity score (combined metric)
        const liquidityScore = (volume / (high - low + 0.0001)) / close;

        return {
            spreadApprox,
            volumeImbalance: volumeImbalance || 0.5,
            priceEfficiency,
            marketDepthProxy,
            liquidityScore
        };
    }

    // ==================== HELPER FUNCTIONS ====================

    private calculateAdvancedStats(values: number[], startIndex: number = 0, length?: number) {
        const n = length !== undefined ? length : values.length;
        if (n === 0) return { mean: 0, stdDev: 0, skewness: 0, kurtosis: 0 };
        const end = startIndex + n;

        let sum = 0;
        for (let i = startIndex; i < end; i++) sum += values[i];
        const mean = sum / n;

        let sumSquaredDiff = 0;
        let sumCubedDiff = 0;
        let sumQuartDiff = 0;

        for (let i = startIndex; i < end; i++) {
            const diff = values[i] - mean;
            const sq = diff * diff;
            sumSquaredDiff += sq;
            sumCubedDiff += sq * diff;
            sumQuartDiff += sq * sq;
        }

        const variance = sumSquaredDiff / n;
        const stdDev = Math.sqrt(variance);

        let skewness = 0;
        let kurtosis = 0;

        if (stdDev !== 0) {
            if (n > 2) {
                skewness = (n / ((n - 1) * (n - 2))) * (sumCubedDiff / Math.pow(stdDev, 3));
            }
            if (n > 3) {
                kurtosis = (n * (n + 1) / ((n - 1) * (n - 2) * (n - 3))) * (sumQuartDiff / Math.pow(stdDev, 4)) - (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
            }
        }

        return { mean, stdDev, skewness, kurtosis };
    }

    private calculateAutocorrelationWithMean(values: number[], lag: number, mean: number, startIndex: number = 0, length?: number): number {
        const n = length !== undefined ? length : values.length;
        if (n <= lag) return 0;
        const end = startIndex + n;

        let numerator = 0;
        let denominator = 0;

        for (let i = startIndex; i < end - lag; i++) {
            numerator += (values[i] - mean) * (values[i + lag] - mean);
        }

        for (let i = startIndex; i < end; i++) {
            denominator += Math.pow(values[i] - mean, 2);
        }

        return denominator !== 0 ? numerator / denominator : 0;
    }

    private calculateMACDCrossover(macdArray: any[], index: number): number {
        if (index < 1) return 0;
        const current = macdArray[index];
        const previous = macdArray[index - 1];

        if (!current || !previous) return 0;

        // Bullish crossover
        if (current.MACD > current.signal && previous.MACD <= previous.signal) {
            return 1;
        }
        // Bearish crossover
        if (current.MACD < current.signal && previous.MACD >= previous.signal) {
            return -1;
        }
        return 0;
    }

    private calculateReturns(prices: number[]): number[] {
        const returns: number[] = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
        return returns;
    }

    private calculateStdDev(values: number[], startIndex: number = 0, length?: number): number {
        const n = length !== undefined ? length : values.length;
        if (n === 0) return 0;
        const end = startIndex + n;

        let sum = 0;
        for (let i = startIndex; i < end; i++) sum += values[i];
        const mean = sum / n;

        let sumSquaredDiff = 0;
        for (let i = startIndex; i < end; i++) {
            sumSquaredDiff += Math.pow(values[i] - mean, 2);
        }

        const variance = sumSquaredDiff / n;
        return Math.sqrt(variance);
    }

    private calculateSkewness(values: number[], startIndex: number = 0, length?: number): number {
        const n = length !== undefined ? length : values.length;
        if (n === 0) return 0;
        const end = startIndex + n;

        let sum = 0;
        for (let i = startIndex; i < end; i++) sum += values[i];
        const mean = sum / n;

        const stdDev = this.calculateStdDev(values, startIndex, n);

        if (stdDev === 0) return 0;

        let acc = 0;
        for (let i = startIndex; i < end; i++) {
            acc += Math.pow((values[i] - mean) / stdDev, 3);
        }
        return (n / ((n - 1) * (n - 2))) * acc;
    }

    private calculateKurtosis(values: number[], startIndex: number = 0, length?: number): number {
        const n = length !== undefined ? length : values.length;
        if (n === 0) return 0;
        const end = startIndex + n;

        let sum = 0;
        for (let i = startIndex; i < end; i++) sum += values[i];
        const mean = sum / n;

        const stdDev = this.calculateStdDev(values, startIndex, n);

        if (stdDev === 0) return 0;

        let acc = 0;
        for (let i = startIndex; i < end; i++) {
            acc += Math.pow((values[i] - mean) / stdDev, 4);
        }
        return (n * (n + 1) / ((n - 1) * (n - 2) * (n - 3))) * acc - (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
    }

    private calculateAutocorrelation(values: number[], lag: number, startIndex: number = 0, length?: number): number {
        const n = length !== undefined ? length : values.length;
        if (n <= lag) return 0;
        const end = startIndex + n;

        let sum = 0;
        for (let i = startIndex; i < end; i++) sum += values[i];
        const mean = sum / n;

        let numerator = 0;
        let denominator = 0;

        for (let i = startIndex; i < end - lag; i++) {
            numerator += (values[i] - mean) * (values[i + lag] - mean);
        }

        for (let i = startIndex; i < end; i++) {
            denominator += Math.pow(values[i] - mean, 2);
        }

        return denominator !== 0 ? numerator / denominator : 0;
    }

    private calculateCorrelation(x: number[], y: number[], startIndex: number = 0, length?: number): number {
        const n = length !== undefined ? length : Math.min(x.length, y.length);
        if (n === 0 || startIndex + n > x.length || startIndex + n > y.length) return 0;
        const end = startIndex + n;

        let sumX = 0;
        let sumY = 0;
        for (let i = startIndex; i < end; i++) {
            sumX += x[i];
            sumY += y[i];
        }
        const meanX = sumX / n;
        const meanY = sumY / n;

        let numerator = 0;
        let sumXSquared = 0;
        let sumYSquared = 0;

        for (let i = startIndex; i < end; i++) {
            const diffX = x[i] - meanX;
            const diffY = y[i] - meanY;
            numerator += diffX * diffY;
            sumXSquared += diffX * diffX;
            sumYSquared += diffY * diffY;
        }

        const denominator = Math.sqrt(sumXSquared * sumYSquared);
        return denominator !== 0 ? numerator / denominator : 0;
    }

    private calculatePriceEfficiency(data: OHLCVCandle[], index: number): number {
        if (index < 10) return 0;

        const startPrice = data[index - 10].close;
        const endPrice = data[index].close;

        const directDistance = Math.abs(endPrice - startPrice);

        let totalDistance = 0;
        for (let i = index - 9; i <= index; i++) {
            totalDistance += Math.abs(data[i].close - data[i - 1].close);
        }

        return totalDistance !== 0 ? directDistance / totalDistance : 0;
    }

    clearCache(): void {
        this.cache.clear();
    }

    getCacheSize(): number {
        return this.cache.size;
    }
    // ─ F4-14, F4-15: Multi-Timeframe Features ──────────────────────────────────

    /**
     * Tambah 8 multi-timeframe features ke FeatureSet array:
     * [F4-14] 15m: rsi_14_15m, macdHistogram_15m, bb_percentB_15m, volumeRatio_15m
     * [F4-15] 4h:  rsi_14_4h, ema50Trend_4h, priceVsEMA50_4h, atrPercent_4h
     * Total: 60 (1h) + 8 = 68 fitur. Update featureCount SimpleGRUModel → 68 (F4-16)
     */
    addMultiTimeframeFeatures(
        baseFeatures: FeatureSet[],
        candles15m: OHLCVCandle[],
        candles4h: OHLCVCandle[],
    ): MultiTFFeatureSet[] {
        // ⚡ Bolt Optimization: Replace 7 O(N) .map() calls with single-pass pre-allocated loops
        const len15m = candles15m.length;
        const closes15m = new Array<number>(len15m);
        const volumes15m = new Array<number>(len15m);
        const highs15m = new Array<number>(len15m);
        const lows15m = new Array<number>(len15m);
        for (let i = 0; i < len15m; i++) {
            const c = candles15m[i];
            closes15m[i] = c.close;
            volumes15m[i] = c.volume;
            highs15m[i] = c.high;
            lows15m[i] = c.low;
        }

        const len4h = candles4h.length;
        const closes4h = new Array<number>(len4h);
        const highs4h = new Array<number>(len4h);
        const lows4h = new Array<number>(len4h);
        for (let i = 0; i < len4h; i++) {
            const c = candles4h[i];
            closes4h[i] = c.close;
            highs4h[i] = c.high;
            lows4h[i] = c.low;
        }

        const rsi15m   = closes15m.length >= 15  ? RSI.calculate({ period: 14, values: closes15m }) : [];
        const macd15m  = closes15m.length >= 35  ? MACD.calculate({ values: closes15m, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false }) : [];
        const bb15m    = closes15m.length >= 20  ? BollingerBands.calculate({ period: 20, values: closes15m, stdDev: 2 }) : [];
        const volMA15m = volumes15m.length >= 20 ? SMA.calculate({ period: 20, values: volumes15m }) : [];

        const rsi4h    = closes4h.length >= 15  ? RSI.calculate({ period: 14, values: closes4h }) : [];
        const ema50_4h = closes4h.length >= 51  ? EMA.calculate({ period: 50, values: closes4h }) : [];
        const atr4h    = highs4h.length >= 15   ? ATR.calculate({ high: highs4h, low: lows4h, close: closes4h, period: 14 }) : [];

        const safe = <T>(arr: T[], i: number): T | undefined =>
            i >= 0 && arr.length > 0 ? arr[Math.min(i, arr.length - 1)] : undefined;

        return baseFeatures.map(base => {
            const ts  = base.timestamp;
            const i15 = this._findLatestBefore(candles15m, ts);
            const i4h = this._findLatestBefore(candles4h, ts);

            // 15m
            const rsi15mVal      = safe(rsi15m, i15) ?? 50;
            const macd15mHist    = (safe(macd15m, i15) as any)?.histogram ?? 0;
            const bbObj          = safe(bb15m, i15) as any;
            const c15            = i15 >= 0 ? closes15m[i15] : 0;
            const bb_pctB_15m    = bbObj && bbObj.upper !== bbObj.lower ? (c15 - bbObj.lower) / (bbObj.upper - bbObj.lower) : 0.5;
            const vma15          = safe(volMA15m, i15) ?? 1;
            const volRatio15m    = i15 >= 0 ? (volumes15m[i15] / ((vma15 as number) || 1)) : 1;

            // 4h
            const c4h            = i4h >= 0 ? closes4h[i4h] : (closes4h[closes4h.length - 1] ?? 0);
            const rsi4hVal       = safe(rsi4h, i4h) ?? 50;
            const ema50_4hV      = (safe(ema50_4h, i4h) as number) ?? c4h;
            const pVsEMA50       = ema50_4hV !== 0 ? ((c4h - ema50_4hV) / ema50_4hV) * 100 : 0;
            const ema50Trend     = pVsEMA50 > 0 ? 1 : pVsEMA50 < 0 ? -1 : 0;
            const atr4hV         = (safe(atr4h, i4h) as number) ?? 0;
            const atrPct4h       = c4h !== 0 ? (atr4hV / c4h) * 100 : 0;

            return {
                ...base,
                rsi_14_15m:        rsi15mVal,
                macdHistogram_15m: macd15mHist,
                bb_percentB_15m:   bb_pctB_15m,
                volumeRatio_15m:   volRatio15m,
                rsi_14_4h:         rsi4hVal,
                ema50Trend_4h:     ema50Trend,
                priceVsEMA50_4h:   pVsEMA50,
                atrPercent_4h:     atrPct4h,
            };
        });
    }

    private _findLatestBefore(candles: OHLCVCandle[], timestamp: number): number {
        let lo = 0, hi = candles.length - 1, result = -1;
        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (candles[mid].timestamp <= timestamp) { result = mid; lo = mid + 1; }
            else hi = mid - 1;
        }
        return result;
    }

}

// ─ F4-16: MultiTFFeatureSet (60 base + 8 multi-TF = 68 features) ───────────────

/** featureCount di SimpleGRUModel harus di-update ke 68 saat menggunakan multi-TF features */
export interface MultiTFFeatureSet extends FeatureSet {
    rsi_14_15m:        number;  // RSI 14 dari 15m
    macdHistogram_15m: number;  // MACD histogram dari 15m
    bb_percentB_15m:   number;  // BB %B dari 15m
    volumeRatio_15m:   number;  // Volume ratio vs MA-20 dari 15m
    rsi_14_4h:         number;  // RSI 14 dari 4h
    ema50Trend_4h:     number;  // +1=above EMA50, -1=below, 0=at
    priceVsEMA50_4h:   number;  // % dari harga vs EMA50 4h
    atrPercent_4h:     number;  // ATR% dari 4h (ukuran volatilitas)
}
