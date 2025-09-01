/**
 * Ensemble Strategy Service
 * Combines multiple ML models for improved predictions
 */

import { EnsembleResult, StrategySignal, StrategyWeights, MetaLearningResult } from '../types/mlTypes';
import { RandomForestService } from './randomForestService';
import { LSTMPredictionService } from './lstmPredictionService';
import { AdvancedSentimentService } from './advancedSentimentService';
import { Candle } from '../types/trading';

export class EnsembleStrategyService {
  private randomForest: RandomForestService;
  private lstmService: LSTMPredictionService;
  private sentimentService: AdvancedSentimentService;
  private isInitialized: boolean = false;

  // Current strategy weights
  private strategyWeights: StrategyWeights = {
    'RandomForest': 0.4,
    'LSTM': 0.35,
    'Sentiment': 0.25
  };

  // Performance tracking
  private performanceHistory: Map<string, Array<{
    timestamp: Date;
    strategy: string;
    prediction: number;
    actual?: number;
    accuracy?: number;
  }>> = new Map();

  // Market regime detection
  private currentRegime: 'trending' | 'ranging' | 'volatile' = 'ranging';

  constructor() {
    this.randomForest = new RandomForestService();
    this.lstmService = new LSTMPredictionService();
    this.sentimentService = new AdvancedSentimentService();

    console.log('🎯 Ensemble Strategy Service initialized');
  }

  /**
   * Initialize all ML services
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing Ensemble Strategy Service...');

      // Initialize all component services
      await Promise.all([
        this.randomForest.initialize(),
        this.lstmService.initialize()
      ]);

      this.isInitialized = true;
      console.log('✅ Ensemble Strategy Service initialized successfully');

    } catch (error) {
      console.error('❌ Ensemble Strategy Service initialization failed:', error);
      throw error;
    }
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return this.isInitialized &&
           this.randomForest.isConfigured() &&
           this.lstmService.isConfigured() &&
           this.sentimentService.isConfigured();
  }

  /**
   * Generate ensemble prediction
   */
  async generateEnsembleSignal(
    symbol: string,
    candles: Candle[],
    newsTexts: string[] = [],
    socialTexts: string[] = []
  ): Promise<EnsembleResult> {
    if (!this.isInitialized) {
      throw new Error('Ensemble service not initialized');
    }

    try {
      console.log(`🎯 Generating ensemble signal for ${symbol}...`);

      // Get individual strategy signals
      const signals = await this.getIndividualSignals(symbol, candles, newsTexts, socialTexts);

      // Calculate weighted ensemble decision
      const ensembleDecision = this.calculateEnsembleDecision(signals);

      // Assess market regime
      await this.assessMarketRegime(candles);

      // Adjust for market regime
      const regimeAdjustedDecision = this.adjustForMarketRegime(ensembleDecision);

      // Calculate risk-adjusted position size
      const riskAdjustedSize = this.calculateRiskAdjustedSize(
        regimeAdjustedDecision.confidence,
        candles
      );

      const result: EnsembleResult = {
        symbol,
        final_signal: regimeAdjustedDecision.signal,
        confidence: regimeAdjustedDecision.confidence,
        individual_signals: signals,
        weighted_score: regimeAdjustedDecision.weightedScore,
        risk_adjusted_size: riskAdjustedSize,
        timestamp: new Date()
      };

      // Track performance
      this.trackPrediction(symbol, result);

      console.log(`🎯 Ensemble signal for ${symbol}:`, {
        signal: result.final_signal,
        confidence: (result.confidence * 100).toFixed(1) + '%',
        size: (result.risk_adjusted_size * 100).toFixed(1) + '%'
      });

      return result;

    } catch (error) {
      console.error(`❌ Ensemble signal generation failed for ${symbol}:`, error);

      // Return neutral signal on error
      return {
        symbol,
        final_signal: 'HOLD',
        confidence: 0.5,
        individual_signals: [],
        weighted_score: 0,
        risk_adjusted_size: 0.01, // 1% fallback size
        timestamp: new Date()
      };
    }
  }

  /**
   * Get signals from individual strategies
   */
  private async getIndividualSignals(
    symbol: string,
    candles: Candle[],
    newsTexts: string[],
    socialTexts: string[]
  ): Promise<StrategySignal[]> {
    const signals: StrategySignal[] = [];

    try {
      // Random Forest Signal
      const rfPrediction = await this.randomForest.predict(symbol, candles, '1h');
      signals.push({
        strategy_name: 'RandomForest',
        signal: rfPrediction.direction === 'up' ? 'BUY' :
                rfPrediction.direction === 'down' ? 'SELL' : 'HOLD',
        confidence: rfPrediction.confidence,
        weight: this.strategyWeights['RandomForest'],
        reasoning: `Technical analysis indicates ${rfPrediction.direction} movement with ${(rfPrediction.confidence * 100).toFixed(1)}% confidence`,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Random Forest signal error:', error);
      signals.push(this.createFallbackSignal('RandomForest'));
    }

    try {
      // LSTM Signal
      const lstmPrediction = await this.lstmService.predict(symbol, candles, '1h');
      signals.push({
        strategy_name: 'LSTM',
        signal: lstmPrediction.direction === 'up' ? 'BUY' :
                lstmPrediction.direction === 'down' ? 'SELL' : 'HOLD',
        confidence: lstmPrediction.confidence,
        weight: this.strategyWeights['LSTM'],
        reasoning: `Time series analysis suggests ${lstmPrediction.direction} trend with ${(lstmPrediction.confidence * 100).toFixed(1)}% confidence`,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('LSTM signal error:', error);
      signals.push(this.createFallbackSignal('LSTM'));
    }

    try {
      // Sentiment Signal
      const allTexts = [...newsTexts, ...socialTexts];
      if (allTexts.length > 0) {
        const sentimentResult = await this.sentimentService.analyzeSentiment(symbol, allTexts, newsTexts.length > 0);

        let sentimentSignal: 'BUY' | 'SELL' | 'HOLD';
        if (sentimentResult.overall_sentiment > 0.1 && sentimentResult.sentiment_strength > 0.3) {
          sentimentSignal = 'BUY';
        } else if (sentimentResult.overall_sentiment < -0.1 && sentimentResult.sentiment_strength > 0.3) {
          sentimentSignal = 'SELL';
        } else {
          sentimentSignal = 'HOLD';
        }

        signals.push({
          strategy_name: 'Sentiment',
          signal: sentimentSignal,
          confidence: sentimentResult.sentiment_strength,
          weight: this.strategyWeights['Sentiment'],
          reasoning: `Market sentiment is ${sentimentResult.sentiment_trend} with ${(sentimentResult.sentiment_strength * 100).toFixed(1)}% strength`,
          timestamp: new Date()
        });
      } else {
        signals.push(this.createFallbackSignal('Sentiment'));
      }

    } catch (error) {
      console.error('Sentiment signal error:', error);
      signals.push(this.createFallbackSignal('Sentiment'));
    }

    return signals;
  }

  /**
   * Create fallback signal when strategy fails
   */
  private createFallbackSignal(strategyName: string): StrategySignal {
    return {
      strategy_name: strategyName,
      signal: 'HOLD',
      confidence: 0.5,
      weight: this.strategyWeights[strategyName] || 0.33,
      reasoning: `${strategyName} analysis unavailable, using neutral signal`,
      timestamp: new Date()
    };
  }

  /**
   * Calculate ensemble decision from individual signals
   */
  private calculateEnsembleDecision(signals: StrategySignal[]): {
    signal: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    weightedScore: number;
  } {
    let buyScore = 0;
    let sellScore = 0;
    let holdScore = 0;
    let totalConfidence = 0;
    let totalWeight = 0;

    // Calculate weighted scores
    signals.forEach(signal => {
      const weightedConfidence = signal.confidence * signal.weight;

      switch (signal.signal) {
        case 'BUY':
          buyScore += weightedConfidence;
          break;
        case 'SELL':
          sellScore += weightedConfidence;
          break;
        case 'HOLD':
          holdScore += weightedConfidence;
          break;
      }

      totalConfidence += weightedConfidence;
      totalWeight += signal.weight;
    });

    // Normalize scores
    const totalScore = buyScore + sellScore + holdScore;
    if (totalScore > 0) {
      buyScore /= totalScore;
      sellScore /= totalScore;
      holdScore /= totalScore;
    }

    // Determine final signal
    let finalSignal: 'BUY' | 'SELL' | 'HOLD';
    let maxScore: number;

    if (buyScore > sellScore && buyScore > holdScore) {
      finalSignal = 'BUY';
      maxScore = buyScore;
    } else if (sellScore > buyScore && sellScore > holdScore) {
      finalSignal = 'SELL';
      maxScore = sellScore;
    } else {
      finalSignal = 'HOLD';
      maxScore = holdScore;
    }

    // Calculate ensemble confidence
    const avgConfidence = totalWeight > 0 ? totalConfidence / totalWeight : 0.5;
    const consensusBonus = maxScore > 0.6 ? 0.1 : 0; // Bonus for strong consensus
    const finalConfidence = Math.min(0.95, avgConfidence + consensusBonus);

    const weightedScore = buyScore - sellScore; // Range: -1 to 1

    return {
      signal: finalSignal,
      confidence: finalConfidence,
      weightedScore
    };
  }

  /**
   * Assess current market regime
   */
  private async assessMarketRegime(candles: Candle[]): Promise<void> {
    if (candles.length < 20) return;

    const prices = candles.slice(-20).map(c => c.close);
    const volumes = candles.slice(-20).map(c => c.volume);

    // Calculate volatility (standard deviation of returns)
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);

    // Calculate trend strength
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const trendStrength = Math.abs((lastPrice - firstPrice) / firstPrice);

    // Determine regime
    if (volatility > 0.03) { // High volatility threshold
      this.currentRegime = 'volatile';
    } else if (trendStrength > 0.05) { // Strong trend threshold
      this.currentRegime = 'trending';
    } else {
      this.currentRegime = 'ranging';
    }
  }

  /**
   * Adjust decision based on market regime
   */
  private adjustForMarketRegime(decision: {
    signal: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    weightedScore: number;
  }): typeof decision {
    let adjustedConfidence = decision.confidence;
    let adjustedSignal = decision.signal;

    switch (this.currentRegime) {
      case 'volatile':
        // Reduce confidence in volatile markets
        adjustedConfidence *= 0.8;
        // Prefer neutral in high volatility
        if (decision.confidence < 0.7) {
          adjustedSignal = 'HOLD';
        }
        break;

      case 'trending':
        // Boost confidence in trending markets
        adjustedConfidence = Math.min(0.95, adjustedConfidence * 1.1);
        break;

      case 'ranging':
        // Standard confidence in ranging markets
        // Look for stronger signals
        if (decision.confidence < 0.6) {
          adjustedSignal = 'HOLD';
        }
        break;
    }

    return {
      signal: adjustedSignal,
      confidence: adjustedConfidence,
      weightedScore: decision.weightedScore
    };
  }

  /**
   * Calculate risk-adjusted position size
   */
  private calculateRiskAdjustedSize(confidence: number, candles: Candle[]): number {
    const baseSize = 0.1; // 10% base position size
    const maxSize = 0.2;  // 20% maximum position size
    const minSize = 0.01; // 1% minimum position size

    // Adjust for confidence
    let adjustedSize = baseSize * confidence;

    // Adjust for volatility
    if (candles.length >= 10) {
      const prices = candles.slice(-10).map(c => c.close);
      const returns = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push(Math.abs((prices[i] - prices[i-1]) / prices[i-1]));
      }
      const avgVolatility = returns.reduce((sum, r) => sum + r, 0) / returns.length;

      // Reduce size in high volatility
      if (avgVolatility > 0.02) { // 2% threshold
        adjustedSize *= 0.7;
      }
    }

    // Adjust for market regime
    switch (this.currentRegime) {
      case 'volatile':
        adjustedSize *= 0.6;
        break;
      case 'trending':
        adjustedSize *= 1.2;
        break;
      case 'ranging':
        adjustedSize *= 0.8;
        break;
    }

    return Math.max(minSize, Math.min(maxSize, adjustedSize));
  }

  /**
   * Track prediction for performance analysis
   */
  private trackPrediction(symbol: string, result: EnsembleResult): void {
    if (!this.performanceHistory.has(symbol)) {
      this.performanceHistory.set(symbol, []);
    }

    const history = this.performanceHistory.get(symbol)!;

    // Add new prediction
    history.push({
      timestamp: new Date(),
      strategy: 'Ensemble',
      prediction: result.weighted_score,
      // actual and accuracy will be updated later when we know the outcome
    });

    // Keep only last 100 predictions per symbol
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  /**
   * Update strategy weights based on performance
   */
  async updateStrategyWeights(symbol: string): Promise<MetaLearningResult> {
    const history = this.performanceHistory.get(symbol) || [];

    if (history.length < 10) {
      return {
        recommended_weights: this.strategyWeights,
        performance_forecast: 0.5,
        confidence: 0.3,
        market_regime: this.currentRegime,
        adaptation_reason: 'Insufficient historical data for weight optimization'
      };
    }

    // Simple weight adjustment based on recent performance
    // In production, this would use more sophisticated meta-learning
    const recentPerformance = history.slice(-20);
    const avgAccuracy = recentPerformance
      .filter(p => p.accuracy !== undefined)
      .reduce((sum, p) => sum + (p.accuracy || 0), 0) / recentPerformance.length;

    let newWeights = { ...this.strategyWeights };
    let adaptationReason = '';

    if (avgAccuracy > 0.7) {
      // Good performance - slight boost to current weights
      adaptationReason = 'Performance above 70%, maintaining current strategy weights';
    } else if (avgAccuracy < 0.4) {
      // Poor performance - rebalance weights
      newWeights = {
        'RandomForest': 0.5,  // Boost technical analysis
        'LSTM': 0.3,          // Reduce time series weight
        'Sentiment': 0.2      // Reduce sentiment weight
      };
      adaptationReason = 'Performance below 40%, rebalancing towards technical analysis';
    }

    // Apply regime-specific adjustments
    switch (this.currentRegime) {
      case 'trending':
        newWeights['LSTM'] *= 1.2;
        newWeights['RandomForest'] *= 0.9;
        adaptationReason += ' | Trending market: boosting LSTM weight';
        break;
      case 'volatile':
        newWeights['Sentiment'] *= 0.7;
        newWeights['RandomForest'] *= 1.1;
        adaptationReason += ' | Volatile market: reducing sentiment weight';
        break;
    }

    // Normalize weights
    const totalWeight = Object.values(newWeights).reduce((sum, w) => sum + w, 0);
    Object.keys(newWeights).forEach(key => {
      newWeights[key] /= totalWeight;
    });

    const result: MetaLearningResult = {
      recommended_weights: newWeights,
      performance_forecast: Math.max(0.4, avgAccuracy + 0.1),
      confidence: history.length > 50 ? 0.8 : 0.5,
      market_regime: this.currentRegime,
      adaptation_reason: adaptationReason
    };

    console.log(`🧠 Meta-learning update for ${symbol}:`, {
      regime: this.currentRegime,
      forecast: (result.performance_forecast * 100).toFixed(1) + '%',
      newWeights: Object.entries(newWeights).map(([k, v]) => `${k}: ${(v * 100).toFixed(1)}%`).join(', ')
    });

    return result;
  }

  /**
   * Apply new strategy weights
   */
  applyStrategyWeights(newWeights: StrategyWeights): void {
    this.strategyWeights = { ...newWeights };
    console.log('⚖️ Strategy weights updated:', this.strategyWeights);
  }

  /**
   * Get current strategy weights
   */
  getCurrentWeights(): StrategyWeights {
    return { ...this.strategyWeights };
  }

  /**
   * Get ensemble statistics
   */
  getEnsembleStats(): {
    totalPredictions: number;
    symbolsCovered: number;
    avgConfidence: number;
    currentRegime: string;
    weights: StrategyWeights;
  } {
    let totalPredictions = 0;
    let totalConfidence = 0;

    for (const history of this.performanceHistory.values()) {
      totalPredictions += history.length;
      // Confidence would be tracked separately in full implementation
    }

    return {
      totalPredictions,
      symbolsCovered: this.performanceHistory.size,
      avgConfidence: totalPredictions > 0 ? totalConfidence / totalPredictions : 0.5,
      currentRegime: this.currentRegime,
      weights: this.strategyWeights
    };
  }

  /**
   * Clear performance history
   */
  clearHistory(symbol?: string): void {
    if (symbol) {
      this.performanceHistory.delete(symbol);
    } else {
      this.performanceHistory.clear();
    }
    console.log(`🧹 Performance history cleared ${symbol ? `for ${symbol}` : 'for all symbols'}`);
  }
}
