/**
 * Feature Engineering Service
 * Transforms raw market data into ML-ready features
 */

import { MLFeatures, FeatureSet, FeatureImportance } from '../types/mlTypes';
import { Candle } from '../types/trading';
import { RSI, MACD, BollingerBands, SMA, EMA } from 'technicalindicators';

export class FeatureEngineeringService {
  private featureCache: Map<string, FeatureSet[]> = new Map();
  private featureImportance: Map<string, FeatureImportance[]> = new Map();

  constructor() {
    console.log('🔧 Feature Engineering Service initialized');
  }

  /**
   * Extract comprehensive features from candle data
   */
  async extractFeatures(
    symbol: string,
    candles: Candle[],
    timeframe: string,
    includeSentiment: boolean = false
  ): Promise<FeatureSet> {
    if (candles.length < 50) {
      throw new Error('Insufficient data for feature extraction. Need at least 50 candles.');
    }

    const prices = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    // Technical Indicators
    const technicalFeatures = await this.calculateTechnicalIndicators(prices, highs, lows, volumes);

    // Price Features
    const priceFeatures = this.calculatePriceFeatures(candles);

    // Market Features
    const marketFeatures = this.calculateMarketFeatures(candles);

    // Sentiment Features (if requested)
    let sentimentFeatures;
    if (includeSentiment) {
      sentimentFeatures = await this.calculateSentimentFeatures(symbol);
    }

    const features: MLFeatures = {
      technical_indicators: technicalFeatures,
      price_features: priceFeatures,
      market_features: marketFeatures,
      sentiment_features: sentimentFeatures
    };

    const featureSet: FeatureSet = {
      symbol,
      timeframe,
      features,
      timestamp: new Date()
    };

    // Cache features
    this.cacheFeatures(symbol, featureSet);

    return featureSet;
  }

  /**
   * Calculate technical indicators
   */
  private async calculateTechnicalIndicators(
    prices: number[],
    highs: number[],
    lows: number[],
    volumes: number[]
  ) {
    // RSI
    const rsiValues = RSI.calculate({ values: prices, period: 14 });
    const rsi = rsiValues[rsiValues.length - 1] || 50;

    // MACD
    const macdValues = MACD.calculate({
      values: prices,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    const macd = macdValues[macdValues.length - 1]?.MACD || 0;

    // Bollinger Bands
    const bbValues = BollingerBands.calculate({
      values: prices,
      period: 20,
      stdDev: 2
    });
    const bb = bbValues[bbValues.length - 1] || { upper: 0, middle: 0, lower: 0 };

    // Simple Moving Averages
    const sma20Values = SMA.calculate({ values: prices, period: 20 });
    const sma_20 = sma20Values[sma20Values.length - 1] || prices[prices.length - 1];

    // Exponential Moving Average
    const ema12Values = EMA.calculate({ values: prices, period: 12 });
    const ema_12 = ema12Values[ema12Values.length - 1] || prices[prices.length - 1];

    // Volume SMA
    const volumeSmaValues = SMA.calculate({ values: volumes, period: 20 });
    const volume_sma = volumeSmaValues[volumeSmaValues.length - 1] || volumes[volumes.length - 1];

    return {
      rsi,
      macd,
      bollinger_bands: bb,
      sma_20,
      ema_12,
      volume_sma
    };
  }

  /**
   * Calculate price-based features
   */
  private calculatePriceFeatures(candles: Candle[]) {
    const prices = candles.map(c => c.close);
    const currentPrice = prices[prices.length - 1];

    // Price changes
    const price_change_1h = candles.length >= 1 ?
      (currentPrice - prices[prices.length - 2]) / prices[prices.length - 2] : 0;

    const price_change_24h = candles.length >= 24 ?
      (currentPrice - prices[prices.length - 24]) / prices[prices.length - 24] : 0;

    // Price volatility (standard deviation of returns)
    const returns = [];
    for (let i = 1; i < Math.min(prices.length, 20); i++) {
      returns.push((prices[prices.length - i] - prices[prices.length - i - 1]) / prices[prices.length - i - 1]);
    }
    const price_volatility = this.standardDeviation(returns);

    // Price momentum (rate of change)
    const price_momentum = candles.length >= 10 ?
      (currentPrice - prices[prices.length - 10]) / prices[prices.length - 10] : 0;

    return {
      price_change_1h,
      price_change_24h,
      price_volatility,
      price_momentum
    };
  }

  /**
   * Calculate market-based features
   */
  private calculateMarketFeatures(candles: Candle[]) {
    const volumes = candles.map(c => c.volume);
    const currentVolume = volumes[volumes.length - 1];

    // Volume change
    const avgVolume = volumes.slice(-20).reduce((sum, vol) => sum + vol, 0) / 20;
    const volume_change = (currentVolume - avgVolume) / avgVolume;

    // Correlation with BTC (placeholder - would need actual BTC data)
    const correlation_btc = 0.7; // This would be calculated with real BTC data

    return {
      volume_change,
      correlation_btc
    };
  }

  /**
   * Calculate sentiment features (placeholder implementation)
   */
  private async calculateSentimentFeatures(symbol: string) {
    // This would integrate with news APIs and social media sentiment
    // For now, returning mock data
    return {
      news_sentiment: 0.1, // Slightly positive
      social_sentiment: 0.05,
      fear_greed_index: 55 // Neutral
    };
  }

  /**
   * Create feature vector for ML models
   */
  createFeatureVector(featureSet: FeatureSet): number[] {
    const features = featureSet.features;

    return [
      features.technical_indicators.rsi / 100,
      features.technical_indicators.macd,
      (features.technical_indicators.bollinger_bands.upper - features.technical_indicators.bollinger_bands.lower) / features.technical_indicators.bollinger_bands.middle,
      features.price_features.price_change_1h,
      features.price_features.price_change_24h,
      features.price_features.price_volatility,
      features.price_features.price_momentum,
      features.market_features.volume_change,
      features.market_features.correlation_btc,
      ...(features.sentiment_features ? [
        features.sentiment_features.news_sentiment,
        features.sentiment_features.social_sentiment,
        features.sentiment_features.fear_greed_index / 100
      ] : [])
    ];
  }

  /**
   * Get feature names for interpretability
   */
  getFeatureNames(includeSentiment: boolean = false): string[] {
    const baseFeatures = [
      'rsi_normalized',
      'macd',
      'bollinger_width_ratio',
      'price_change_1h',
      'price_change_24h',
      'price_volatility',
      'price_momentum',
      'volume_change',
      'correlation_btc'
    ];

    if (includeSentiment) {
      baseFeatures.push('news_sentiment', 'social_sentiment', 'fear_greed_index');
    }

    return baseFeatures;
  }

  /**
   * Update feature importance scores
   */
  updateFeatureImportance(symbol: string, importance: FeatureImportance[]): void {
    this.featureImportance.set(symbol, importance);
  }

  /**
   * Get feature importance for a symbol
   */
  getFeatureImportance(symbol: string): FeatureImportance[] {
    return this.featureImportance.get(symbol) || [];
  }

  /**
   * Cache features for reuse
   */
  private cacheFeatures(symbol: string, featureSet: FeatureSet): void {
    if (!this.featureCache.has(symbol)) {
      this.featureCache.set(symbol, []);
    }

    const cache = this.featureCache.get(symbol)!;
    cache.push(featureSet);

    // Keep only last 1000 feature sets
    if (cache.length > 1000) {
      cache.splice(0, cache.length - 1000);
    }
  }

  /**
   * Get cached features
   */
  getCachedFeatures(symbol: string, count: number = 100): FeatureSet[] {
    const cache = this.featureCache.get(symbol) || [];
    return cache.slice(-count);
  }

  /**
   * Normalize features for ML models
   */
  normalizeFeatures(featureVector: number[]): number[] {
    // Min-max normalization
    return featureVector.map(value => {
      if (Math.abs(value) > 10) {
        return Math.tanh(value / 10); // Bounded between -1 and 1
      }
      return value;
    });
  }

  /**
   * Calculate standard deviation
   */
  private standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

    return Math.sqrt(variance);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { symbols: number; totalFeatures: number; memoryUsage: string } {
    let totalFeatures = 0;
    for (const cache of this.featureCache.values()) {
      totalFeatures += cache.length;
    }

    const memoryUsage = `${(JSON.stringify([...this.featureCache.entries()]).length / 1024 / 1024).toFixed(2)} MB`;

    return {
      symbols: this.featureCache.size,
      totalFeatures,
      memoryUsage
    };
  }

  /**
   * Clear cache for memory management
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      this.featureCache.delete(symbol);
      this.featureImportance.delete(symbol);
    } else {
      this.featureCache.clear();
      this.featureImportance.clear();
    }
  }
}
