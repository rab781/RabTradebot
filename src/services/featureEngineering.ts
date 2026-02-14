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
        if (data.length < 200) {
            throw new Error('Need at least 200 candles for feature extraction');
        }

        const features: FeatureSet[] = [];

        // Lazy initialization variables
        let closes: number[] | null = null;
        let highs: number[] | null = null;
        let lows: number[] | null = null;
        let opens: number[] | null = null;
        let volumes: number[] | null = null;
        let indicators: any = null;
        let allReturns: number[] | null = null;

        const ensureData = () => {
            if (!closes) {
                 closes = data.map(d => d.close);
                 highs = data.map(d => d.high);
                 lows = data.map(d => d.low);
                 opens = data.map(d => d.open);
                 volumes = data.map(d => d.volume);
                 allReturns = this.calculateReturns(closes);
                 indicators = this.calculateAllIndicators(data, closes, highs!, lows!, opens!, volumes!);
            }
        };

        // Extract features for each candle (starting from index 200 to have enough history)
        for (let i = 200; i < data.length; i++) {
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

            // Ensure data is available for calculation
            ensureData();

            // Calculate features
            const featureSet: FeatureSet = {
                // Price features
                ...this.extractPriceFeatures(data, i),

                // Technical indicators
                ...this.extractMomentumIndicators(indicators, i),
                ...this.extractTrendIndicators(indicators, i, closes![i]),
                ...this.extractVolatilityIndicators(indicators, i, closes![i]),

                // Volume features
                ...this.extractVolumeFeatures(closes!, volumes!, indicators, i),

                // Statistical features
                ...this.extractStatisticalFeatures(closes!, allReturns!, i),

                // Market microstructure
                ...this.extractMarketMicrostructure(highs!, lows!, closes!, volumes!, i),

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
        const arrayIndex = index - 200;

        const macdValue = indicators.macd[arrayIndex] || { MACD: 0, signal: 0, histogram: 0 };
        const stochValue = indicators.stoch[arrayIndex] || { k: 50, d: 50 };

        return {
            rsi_7: indicators.rsi_7[arrayIndex] || 50,
            rsi_14: indicators.rsi_14[arrayIndex] || 50,
            rsi_21: indicators.rsi_21[arrayIndex] || 50,
            roc_10: indicators.roc_10[arrayIndex] || 0,
            roc_20: indicators.roc_20[arrayIndex] || 0,
            stoch_k: stochValue.k,
            stoch_d: stochValue.d,
            williams_r: indicators.williamsR[arrayIndex] || -50,
            cci: indicators.cci[arrayIndex] || 0,
            mfi: indicators.mfi[arrayIndex] || 50,
            macd: macdValue.MACD,
            macdSignal: macdValue.signal,
            macdHistogram: macdValue.histogram,
            macdCrossover: this.calculateMACDCrossover(indicators.macd, arrayIndex)
        };
    }

    private extractTrendIndicators(indicators: any, index: number, currentPrice: number) {
        const arrayIndex = index - 200;

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
        const arrayIndex = index - 200;
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
        const volSlice = volumes.slice(Math.max(0, index - 20), index + 1);
        const avgVolume = volSlice.reduce((a, b) => a + b, 0) / volSlice.length;
        const currentVolume = volumes[index];

        const arrayIndex = index - 200;
        const obv = indicators.obv[arrayIndex] || 0;
        const obvPrevious = indicators.obv[Math.max(0, arrayIndex - 1)] || 0;

        // Volume-price correlation
        const closeSlice = closes.slice(Math.max(0, index - 20), index + 1);
        const correlation = this.calculateCorrelation(closeSlice, volSlice);

        // Volume Weighted Price
        const vwp = closeSlice.reduce((sum, close, i) => sum + close * volSlice[i], 0) / volSlice.reduce((a, b) => a + b, 0);

        return {
            volumeRatio: currentVolume / avgVolume,
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
        // So slice(index - 20, index) gives returns for candles [index - 19] to [index]
        const returns20 = allReturns.slice(index - 20, index);
        const returns50 = allReturns.slice(index - 50, index);

        // Optimization: Pre-calculate stats for returns20
        let sum20 = 0;
        const len20 = returns20.length;
        for (let i = 0; i < len20; i++) sum20 += returns20[i];
        const mean20 = sum20 / len20;

        let sumSqDiff20 = 0;
        for (let i = 0; i < len20; i++) {
            const diff = returns20[i] - mean20;
            sumSqDiff20 += diff * diff;
        }
        const stdDev20 = Math.sqrt(sumSqDiff20 / len20);

        // Optimization: Pre-calculate stats for autocorrelation slice
        const autoCorrSlice = closes.slice(index - 20, index + 1);
        const lenAuto = autoCorrSlice.length;

        let sumAuto = 0;
        for (let i = 0; i < lenAuto; i++) sumAuto += autoCorrSlice[i];
        const meanAuto = sumAuto / lenAuto;

        let autoCorrDenominator = 0;
        for (let i = 0; i < lenAuto; i++) {
            const diff = autoCorrSlice[i] - meanAuto;
            autoCorrDenominator += diff * diff;
        }

        return {
            volatility_20: stdDev20,
            volatility_50: this.calculateStdDev(returns50),
            skewness_20: this.calculateSkewness(returns20, mean20, stdDev20),
            kurtosis_20: this.calculateKurtosis(returns20, mean20, stdDev20),
            autocorrelation_1: this.calculateAutocorrelation(autoCorrSlice, 1, meanAuto, autoCorrDenominator),
            autocorrelation_5: this.calculateAutocorrelation(autoCorrSlice, 5, meanAuto, autoCorrDenominator),
            returns_mean_20: mean20,
            returns_std_20: stdDev20
        };
    }

    private extractMarketMicrostructure(highs: number[], lows: number[], closes: number[], volumes: number[], index: number) {
        const high = highs[index];
        const low = lows[index];
        const close = closes[index];
        const volume = volumes[index];

        // Approximate bid-ask spread using high-low range
        const spreadApprox = ((high - low) / close) * 100;

        // Volume imbalance (proxy using close position in range)
        const volumeImbalance = (close - low) / (high - low);

        // Price efficiency (how directly price moved)
        const priceEfficiency = this.calculatePriceEfficiency(closes, index);

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

    private calculateStdDev(values: number[]): number {
        const len = values.length;
        if (len === 0) return 0;

        let sum = 0;
        for (let i = 0; i < len; i++) sum += values[i];
        const mean = sum / len;

        let sumSqDiff = 0;
        for (let i = 0; i < len; i++) {
            const diff = values[i] - mean;
            sumSqDiff += diff * diff;
        }

        return Math.sqrt(sumSqDiff / len);
    }

    private calculateSkewness(values: number[], mean?: number, stdDev?: number): number {
        const n = values.length;
        if (n < 3) return 0;

        let m = mean;
        if (m === undefined) {
             let sum = 0;
             for (let i = 0; i < n; i++) sum += values[i];
             m = sum / n;
        }

        let s = stdDev;
        if (s === undefined) {
            s = this.calculateStdDev(values);
        }

        if (s === 0) return 0;

        let sum = 0;
        for (let i = 0; i < n; i++) {
            sum += Math.pow((values[i] - m) / s, 3);
        }

        return (n / ((n - 1) * (n - 2))) * sum;
    }

    private calculateKurtosis(values: number[], mean?: number, stdDev?: number): number {
        const n = values.length;
        if (n < 4) return 0;

        let m = mean;
        if (m === undefined) {
             let sum = 0;
             for (let i = 0; i < n; i++) sum += values[i];
             m = sum / n;
        }

        let s = stdDev;
        if (s === undefined) {
            s = this.calculateStdDev(values);
        }

        if (s === 0) return 0;

        let sum = 0;
        for (let i = 0; i < n; i++) {
            sum += Math.pow((values[i] - m) / s, 4);
        }

        return (n * (n + 1) / ((n - 1) * (n - 2) * (n - 3))) * sum - (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
    }

    private calculateAutocorrelation(values: number[], lag: number, mean?: number, denominator?: number): number {
        const len = values.length;
        if (len <= lag) return 0;

        let m = mean;
        if (m === undefined) {
            let sum = 0;
            for (let i = 0; i < len; i++) sum += values[i];
            m = sum / len;
        }

        let d = denominator;
        if (d === undefined) {
            d = 0;
            for (let i = 0; i < len; i++) {
                const diff = values[i] - m;
                d += diff * diff;
            }
        }

        let numerator = 0;
        for (let i = 0; i < len - lag; i++) {
            numerator += (values[i] - m) * (values[i + lag] - m);
        }

        return d !== 0 ? numerator / d : 0;
    }

    private calculateCorrelation(x: number[], y: number[]): number {
        if (x.length !== y.length || x.length === 0) return 0;

        const n = x.length;
        const meanX = x.reduce((a, b) => a + b, 0) / n;
        const meanY = y.reduce((a, b) => a + b, 0) / n;

        let numerator = 0;
        let sumXSquared = 0;
        let sumYSquared = 0;

        for (let i = 0; i < n; i++) {
            const diffX = x[i] - meanX;
            const diffY = y[i] - meanY;
            numerator += diffX * diffY;
            sumXSquared += diffX * diffX;
            sumYSquared += diffY * diffY;
        }

        const denominator = Math.sqrt(sumXSquared * sumYSquared);
        return denominator !== 0 ? numerator / denominator : 0;
    }

    private calculatePriceEfficiency(closes: number[], index: number): number {
        if (index < 10) return 0;

        const recentCloses = closes.slice(index - 10, index + 1);
        const startPrice = recentCloses[0];
        const endPrice = recentCloses[recentCloses.length - 1];

        const directDistance = Math.abs(endPrice - startPrice);

        let totalDistance = 0;
        for (let i = 1; i < recentCloses.length; i++) {
            totalDistance += Math.abs(recentCloses[i] - recentCloses[i - 1]);
        }

        return totalDistance !== 0 ? directDistance / totalDistance : 0;
    }

    clearCache(): void {
        this.cache.clear();
    }

    getCacheSize(): number {
        return this.cache.size;
    }
}
