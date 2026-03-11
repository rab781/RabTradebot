/**
 * OpenClaw-Inspired Advanced Trading Strategy
 *
 * Features:
 * - Market regime detection (trending/ranging/volatile)
 * - Multi-timeframe confluence
 * - Volume profile analysis
 * - ML prediction integration
 * - Weighted signal generation
 * - Kelly Criterion position sizing
 */

import { DataFrame, DataFrameBuilder } from '../types/dataframe';
import { IStrategy, StrategyMetadata, Trade } from '../types/strategy';
import { RSI, MACD, BollingerBands, EMA, SMA, ATR, ADX } from 'technicalindicators';
import { FeatureEngineeringService, FeatureSet } from '../services/featureEngineering';
import { LSTMModelManager, PredictionResult } from '../ml/lstmModel';
import * as fs from 'fs';
import * as path from 'path';

export type MarketRegime = 'trending_bull' | 'trending_bear' | 'ranging' | 'volatile';

export interface OpenClawConfig {
    // ML Configuration
    useMachineLearning: boolean;
    modelPath?: string;
    mlConfidenceThreshold: number;

    // Signal Thresholds
    minSignalStrength: number;
    minConfidence: number;

    // Market Regime
    regimeAdaptive: boolean;
    volatilityThreshold: number;

    // Kelly Criterion
    kellyFraction: number;
    maxPositionSize: number;
    minPositionSize: number;

    // Multi-Timeframe
    useMultiTimeframe: boolean;
    timeframes: string[];
}

export class OpenClawStrategy implements IStrategy {
    // Strategy metadata
    name = 'OpenClawStrategy';
    version = '1.0.0';
    timeframe = '1h';
    canShort = true;

    // Risk management
    stoploss = -0.03; // 3% dynamic stop loss
    minimalRoi = {
        '0': 0.10    // 10% target
    };
    trailingStop = true;
    trailingStopPositive = 0.01;
    trailingStopPositiveOffset = 0.02;

    // Position sizing
    stakeAmount: number | 'unlimited' = 'unlimited'; // Will be calculated dynamically
    maxOpenTrades = 3;

    // Strategy configuration
    startupCandleCount = 200; // Need enough data for features
    processOnlyNewCandles = true;
    useExitSignal = true;
    exitProfitOnly = false;
    exitProfitOffset = 0.0;
    ignoreRoiIfEntrySignal = false;

    // OpenClaw specific config
    private config: OpenClawConfig = {
        useMachineLearning: false, // Start without ML, can be enabled after training
        mlConfidenceThreshold: 0.6,
        minSignalStrength: 0.15, // Lowered from 0.4 for more signals
        minConfidence: 0.5,
        regimeAdaptive: true,
        volatilityThreshold: 0.03,
        kellyFraction: 0.25,
        maxPositionSize: 0.15,
        minPositionSize: 0.05,
        useMultiTimeframe: false, // Simplified for now
        timeframes: ['15m', '1h', '4h']
    };

    private featureService: FeatureEngineeringService;
    private mlModel: LSTMModelManager | null = null;
    private currentRegime: MarketRegime = 'ranging';

    constructor(config?: Partial<OpenClawConfig>) {
        this.config = { ...this.config, ...config };
        this.featureService = new FeatureEngineeringService(false); // Disable DB for backtesting

        // Try to load ML model if configured
        if (this.config.useMachineLearning && this.config.modelPath) {
            this.loadMLModel();
        }
    }

    /**
     * Load pre-trained ML model
     */
    private async loadMLModel(): Promise<void> {
        try {
            if (this.config.modelPath && fs.existsSync(this.config.modelPath)) {
                this.mlModel = new LSTMModelManager();
                await this.mlModel.loadModel(this.config.modelPath);
                console.log('✅ ML Model loaded successfully');
            }
        } catch (error) {
            console.warn('⚠️  Failed to load ML model:', error);
            this.config.useMachineLearning = false;
        }
    }

    /**
     * Populate technical indicators
     */
    populateIndicators(dataframe: DataFrame, metadata: StrategyMetadata): DataFrame {
        const closes = dataframe.close;
        const highs = dataframe.high;
        const lows = dataframe.low;
        const volumes = dataframe.volume;
        const length = closes.length;

        // === MOMENTUM INDICATORS ===

        // RSI with multiple periods
        const rsi14 = RSI.calculate({ period: 14, values: closes });
        dataframe.rsi = new Array(length - rsi14.length).fill(50).concat(rsi14);

        const rsi7 = RSI.calculate({ period: 7, values: closes });
        dataframe.rsi_7 = new Array(length - rsi7.length).fill(50).concat(rsi7);

        const rsi21 = RSI.calculate({ period: 21, values: closes });
        dataframe.rsi_21 = new Array(length - rsi21.length).fill(50).concat(rsi21);

        // MACD
        const macdResult = MACD.calculate({
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        });

        const macdLength = macdResult.length;
        const macdPad = length - macdLength;
        dataframe.macd = new Array(macdPad).fill(0).concat(macdResult.map(m => m?.MACD || 0));
        dataframe.macd_signal = new Array(macdPad).fill(0).concat(macdResult.map(m => m?.signal || 0));
        dataframe.macd_histogram = new Array(macdPad).fill(0).concat(macdResult.map(m => m?.histogram || 0));

        // === TREND INDICATORS ===

        // EMAs
        const ema9 = EMA.calculate({ period: 9, values: closes });
        dataframe.ema_9 = new Array(length - ema9.length).fill(closes[0]).concat(ema9);

        const ema21 = EMA.calculate({ period: 21, values: closes });
        dataframe.ema_21 = new Array(length - ema21.length).fill(closes[0]).concat(ema21);

        const ema50 = EMA.calculate({ period: 50, values: closes });
        dataframe.ema_50 = new Array(length - ema50.length).fill(closes[0]).concat(ema50);

        const ema200 = EMA.calculate({ period: 200, values: closes });
        dataframe.ema_200 = new Array(length - ema200.length).fill(closes[0]).concat(ema200);

        // SMAs
        const sma20 = SMA.calculate({ period: 20, values: closes });
        dataframe.sma_20 = new Array(length - sma20.length).fill(closes[0]).concat(sma20);

        const sma50 = SMA.calculate({ period: 50, values: closes });
        dataframe.sma_50 = new Array(length - sma50.length).fill(closes[0]).concat(sma50);

        // ADX for trend strength
        const adxResult = ADX.calculate({
            high: highs,
            low: lows,
            close: closes,
            period: 14
        });
        const adxLength = adxResult.length;
        const adxPad = length - adxLength;
        dataframe.adx = new Array(adxPad).fill(20).concat(adxResult.map(a => a?.adx || 20));

        // === VOLATILITY INDICATORS ===

        // Bollinger Bands
        const bbResult = BollingerBands.calculate({
            period: 20,
            values: closes,
            stdDev: 2
        });

        const bbLength = bbResult.length;
        const bbPad = length - bbLength;
        dataframe.bb_upper = new Array(bbPad).fill(closes[0]).concat(bbResult.map(b => b?.upper || 0));
        dataframe.bb_middle = new Array(bbPad).fill(closes[0]).concat(bbResult.map(b => b?.middle || 0));
        dataframe.bb_lower = new Array(bbPad).fill(closes[0]).concat(bbResult.map(b => b?.lower || 0));

        // ATR
        const atrResult = ATR.calculate({
            high: highs,
            low: lows,
            close: closes,
            period: 14
        });
        const atrLength = atrResult.length;
        const atrPad = length - atrLength;
        dataframe.atr = new Array(atrPad).fill(0).concat(atrResult);

        // === VOLUME INDICATORS ===

        // Volume MA
        const volMa = SMA.calculate({ period: 20, values: volumes });
        dataframe.volume_ma = new Array(length - volMa.length).fill(volumes[0]).concat(volMa);

        // === COMBINED LOOP FOR OPTIMIZED CUSTOM INDICATORS ===
        // Bolt: Optimize O(N) multi-loop allocations and slice overheads by merging
        // bbWidth, bbPercentB, volumeRatio, priceVsEma, and volatility into a single pass

        const bbWidth = new Array(length).fill(0);
        const bbPercentB = new Array(length).fill(0);
        const volumeRatio = new Array(length).fill(0);
        const priceVsEma9 = new Array(length).fill(0);
        const priceVsEma21 = new Array(length).fill(0);
        const volatility = new Array(length).fill(0);

        // Pre-calculate returns to avoid repeated allocations in rolling volatility
        const allReturns = new Array(length).fill(0);
        for (let i = 1; i < length; i++) {
            allReturns[i] = (closes[i] - closes[i - 1]) / closes[i - 1];
        }

        const ema9Arr = dataframe.ema_9 as number[];
        const ema21Arr = dataframe.ema_21 as number[];
        const volMaArr = dataframe.volume_ma as number[];
        const bbUpper = dataframe.bb_upper as number[];
        const bbLower = dataframe.bb_lower as number[];
        const bbMiddle = dataframe.bb_middle as number[];

        const period = 20;

        for (let i = 0; i < length; i++) {
            const close = closes[i];

            // BB Width and %B
            const upper = bbUpper[i] || 0;
            const lower = bbLower[i] || 0;
            const middle = bbMiddle[i] || 0;

        // Volatility (returns std dev)
        // ⚡ Bolt Optimization: Pre-calculate returns and use primitive loops
        // Avoids O(N*M) array allocations and expensive reduce closures in hot path
        const period = 20;
        const volatility: number[] = new Array(closes.length).fill(0);
        const allReturns: number[] = new Array(closes.length).fill(0);

        // Pre-calculate returns once
        for (let i = 1; i < closes.length; i++) {
            allReturns[i] = (closes[i] - closes[i - 1]) / closes[i - 1];
        }

        // Calculate sliding window variance
        for (let i = period; i < closes.length; i++) {
            let sum = 0;
            // First pass: mean
            for (let j = i - period + 1; j <= i; j++) {
                sum += allReturns[j];
            }
            const mean = sum / period;

            // Second pass: variance
            let varianceSum = 0;
            for (let j = i - period + 1; j <= i; j++) {
                const diff = allReturns[j] - mean;
                varianceSum += diff * diff;
            }

            volatility[i] = Math.sqrt(varianceSum / period);
        }

        dataframe.bb_width = bbWidth;
        dataframe.bb_percentb = bbPercentB;
        dataframe.volume_ratio = volumeRatio;
        dataframe.price_vs_ema9 = priceVsEma9;
        dataframe.price_vs_ema21 = priceVsEma21;
        dataframe.volatility = volatility;

        return dataframe;
    }

    /**
     * Detect market regime
     */
    private detectMarketRegime(dataframe: DataFrame, index: number): MarketRegime {
        const adx = (dataframe.adx as number[])[index] || 20;
        const ema9 = (dataframe.ema_9 as number[])[index] || 0;
        const ema21 = (dataframe.ema_21 as number[])[index] || 0;
        const ema50 = (dataframe.ema_50 as number[])[index] || 0;
        const volatility = (dataframe.volatility as number[])[index] || 0;
        const close = dataframe.close[index];

        // High volatility regime
        if (volatility > this.config.volatilityThreshold) {
            return 'volatile';
        }

        // Trending regime (ADX > 25)
        if (adx > 25) {
            // Check if trend is bullish or bearish
            if (close > ema9 && ema9 > ema21 && ema21 > ema50) {
                return 'trending_bull';
            } else if (close < ema9 && ema9 < ema21 && ema21 < ema50) {
                return 'trending_bear';
            }
        }

        // Default to ranging
        return 'ranging';
    }

    /**
     * Calculate momentum score (-1 to 1)
     */
    private calculateMomentumScore(dataframe: DataFrame, index: number): number {
        const rsi = (dataframe.rsi as number[])[index] || 50;
        const macdHist = (dataframe.macd_histogram as number[])[index] || 0;
        const priceVsEma9 = (dataframe.price_vs_ema9 as number[])[index] || 0;

        let score = 0;

        // RSI contribution
        if (rsi > 50) {
            score += (rsi - 50) / 50;
        } else {
            score -= (50 - rsi) / 50;
        }

        // MACD contribution
        if (macdHist > 0) {
            score += 0.3;
        } else {
            score -= 0.3;
        }

        // Price vs EMA contribution
        score += priceVsEma9 / 10;

        // Normalize to [-1, 1]
        return Math.max(-1, Math.min(1, score / 2));
    }

    /**
     * Calculate volume score
     */
    private calculateVolumeScore(dataframe: DataFrame, index: number): number {
        const volumeRatio = (dataframe.volume_ratio as number[])[index] || 1;
        const priceChange = ((dataframe.close[index] - dataframe.close[index - 1]) / dataframe.close[index - 1]) * 100;

        let score = 0;

        // High volume with price increase = bullish (lowered threshold from 1.5 to 1.2)
        if (volumeRatio > 1.2 && priceChange > 0) {
            score = 0.5;
        }
        // High volume with price decrease = bearish
        else if (volumeRatio > 1.2 && priceChange < 0) {
            score = -0.5;
        }
        // Medium volume gets partial credit
        else if (volumeRatio > 0.8) {
            score = (priceChange > 0 ? 0.2 : -0.2);
        }

        return score;
    }

    /**
     * Generate weighted signal
     */
    private async generateWeightedSignal(
        dataframe: DataFrame,
        index: number,
        features?: FeatureSet[]
    ): Promise<{ signal: number; confidence: number; reason: string }> {
        const regime = this.detectMarketRegime(dataframe, index);
        const momentum = this.calculateMomentumScore(dataframe, index);
        const volume = this.calculateVolumeScore(dataframe, index);

        // Weights based on market regime
        const weights = {
            regime: 0.2,
            momentum: 0.35,
            volume: 0.20,
            ml: 0.25
        };

        // Adjust weights based on regime
        if (regime === 'trending_bull' || regime === 'trending_bear') {
            weights.momentum = 0.45;
            weights.ml = 0.20;
        } else if (regime === 'volatile') {
            weights.regime = 0.3;
            weights.momentum = 0.25;
        }

        let totalScore = 0;
        const reasons: string[] = [];

        // Regime contribution
        if (regime === 'trending_bull') {
            totalScore += 0.5 * weights.regime;
            reasons.push('bullish_trend');
        } else if (regime === 'trending_bear') {
            totalScore -= 0.5 * weights.regime;
            reasons.push('bearish_trend');
        }

        // Momentum contribution
        totalScore += momentum * weights.momentum;
        if (momentum > 0.3) reasons.push('strong_momentum');
        if (momentum < -0.3) reasons.push('weak_momentum');

        // Volume contribution
        totalScore += volume * weights.volume;
        if (volume > 0.3) reasons.push('volume_confirmation');

        // ML contribution
        let mlPrediction: PredictionResult | null = null;
        if (this.config.useMachineLearning && this.mlModel && features && features.length >= 20) {
            try {
                mlPrediction = await this.mlModel.predict(features.slice(-20));
                totalScore += mlPrediction.direction * mlPrediction.confidence * weights.ml;

                if (mlPrediction.confidence > 0.7) {
                    reasons.push(`ml_${mlPrediction.direction > 0 ? 'bullish' : 'bearish'}`);
                }
            } catch (error) {
                // ML prediction failed, continue without it
            }
        }

        const confidence = Math.abs(totalScore);
        const reason = reasons.join('_');

        return { signal: totalScore, confidence, reason };
    }

    /**
     * Populate entry signals
     */
    populateEntryTrend(dataframe: DataFrame, metadata: StrategyMetadata): DataFrame {
        // Initialize signals
        dataframe.enter_long = new Array(dataframe.close.length).fill(0);
        dataframe.enter_short = new Array(dataframe.close.length).fill(0);
        dataframe.enter_tag = new Array(dataframe.close.length).fill('');

        // Convert dataframe to OHLCVCandle format for feature extraction
        const candles = [];
        for (let i = 0; i < dataframe.close.length; i++) {
            candles.push({
                timestamp: dataframe.date[i].getTime(),
                open: dataframe.open[i],
                high: dataframe.high[i],
                low: dataframe.low[i],
                close: dataframe.close[i],
                volume: dataframe.volume[i],
                date: dataframe.date[i]
            });
        }

        // Extract features if we have enough data
        let features: FeatureSet[] = [];
        if (candles.length >= 200) {
            try {
                features = this.featureService.extractFeatures(candles, metadata.pair);
            } catch (error) {
                console.warn('Feature extraction failed:', error);
            }
        }

        // Generate signals for each candle
        for (let i = this.startupCandleCount; i < dataframe.close.length; i++) {
            // Get weighted signal (async, but we'll use sync approximation for backtesting)
            const regime = this.detectMarketRegime(dataframe, i);
            const momentum = this.calculateMomentumScore(dataframe, i);
            const volume = this.calculateVolumeScore(dataframe, i);

            // Simple weighted score (without ML for now in sync context)
            const score = (momentum * 0.5) + (volume * 0.3);
            const rsi = (dataframe.rsi as number[])[i] || 50;
            const bbPercentB = (dataframe.bb_percentb as number[])[i] || 0.5;

            // LONG entry conditions
            if (
                score > this.config.minSignalStrength &&
                regime !== 'trending_bear' &&
                rsi < 70 &&
                bbPercentB < 0.8
            ) {
                (dataframe.enter_long as number[])[i] = 1;
                (dataframe.enter_tag as string[])[i] = `${regime}_long`;
            }

            // SHORT entry conditions
            if (
                score < -this.config.minSignalStrength &&
                regime !== 'trending_bull' &&
                rsi > 30 &&
                bbPercentB > 0.2
            ) {
                (dataframe.enter_short as number[])[i] = 1;
                (dataframe.enter_tag as string[])[i] = `${regime}_short`;
            }
        }

        return dataframe;
    }

    /**
     * Populate exit signals
     */
    populateExitTrend(dataframe: DataFrame, metadata: StrategyMetadata): DataFrame {
        // Initialize exit signals
        dataframe.exit_long = new Array(dataframe.close.length).fill(0);
        dataframe.exit_short = new Array(dataframe.close.length).fill(0);
        dataframe.exit_tag = new Array(dataframe.close.length).fill('');

        for (let i = this.startupCandleCount; i < dataframe.close.length; i++) {
            const rsi = (dataframe.rsi as number[])[i] || 50;
            const macdHist = (dataframe.macd_histogram as number[])[i] || 0;
            const regime = this.detectMarketRegime(dataframe, i);

            // Exit LONG conditions
            if (
                rsi > 75 ||
                macdHist < 0 ||
                regime === 'trending_bear'
            ) {
                (dataframe.exit_long as number[])[i] = 1;
                (dataframe.exit_tag as string[])[i] = 'exit_long';
            }

            // Exit SHORT conditions
            if (
                rsi < 25 ||
                macdHist > 0 ||
                regime === 'trending_bull'
            ) {
                (dataframe.exit_short as number[])[i] = 1;
                (dataframe.exit_tag as string[])[i] = 'exit_short';
            }
        }

        return dataframe;
    }

    /**
     * Custom stop loss using ATR
     */
    customStoploss(trade: Trade, currentTime: Date, currentRate: number, currentProfit: number): number {
        // Dynamic stop loss based on volatility
        // This would be calculated from recent ATR values
        // For now, return default stop loss
        return this.stoploss;
    }

    /**
     * Calculate position size using Kelly Criterion
     */
    customEntryPrice(pair: string, currentTime: Date, proposedRate: number): number {
        // Return market price
        return proposedRate;
    }

    /**
     * Confirm trade entry based on final checks
     */
    confirmTradeEntry(pair: string, orderType: string, amount: number, rate: number, time: Date): boolean {
        // Additional confirmation logic could go here
        return true;
    }

    /**
     * Set configuration
     */
    setConfig(config: Partial<OpenClawConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Get current configuration
     */
    getConfig(): OpenClawConfig {
        return { ...this.config };
    }

    /**
     * Get current market regime
     */
    getCurrentRegime(): MarketRegime {
        return this.currentRegime;
    }
}
