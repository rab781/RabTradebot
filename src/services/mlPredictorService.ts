/**
 * ML Predictor Service
 * Base class for machine learning predictions
 */

import { PredictionResult, MLFeatures, MLModel, ModelMetrics } from '../types/mlTypes';
import { FeatureEngineeringService } from './featureEngineeringService';
import { Candle } from '../types/trading';

export abstract class MLPredictorService {
  protected featureEngineer: FeatureEngineeringService;
  protected models: Map<string, MLModel> = new Map();
  protected isInitialized: boolean = false;

  constructor() {
    this.featureEngineer = new FeatureEngineeringService();
    console.log('🤖 ML Predictor Service initialized');
  }

  /**
   * Initialize the ML service
   */
  async initialize(): Promise<void> {
    try {
      await this.loadModels();
      this.isInitialized = true;
      console.log('✅ ML Predictor Service initialized successfully');
    } catch (error) {
      console.error('❌ ML Predictor Service initialization failed:', error);
      throw error;
    }
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return this.isInitialized;
  }

  /**
   * Make prediction for a symbol
   */
  async predict(
    symbol: string,
    candles: Candle[],
    timeframe: string = '1h',
    horizon: number = 1
  ): Promise<PredictionResult> {
    if (!this.isInitialized) {
      throw new Error('ML Predictor Service not initialized');
    }

    if (candles.length < 50) {
      throw new Error('Insufficient data for prediction');
    }

    try {
      // Extract features
      const featureSet = await this.featureEngineer.extractFeatures(
        symbol,
        candles,
        timeframe,
        true // Include sentiment
      );

      // Create feature vector
      const featureVector = this.featureEngineer.createFeatureVector(featureSet);
      const normalizedFeatures = this.featureEngineer.normalizeFeatures(featureVector);

      // Make prediction using specific implementation
      const prediction = await this.makePrediction(symbol, normalizedFeatures, horizon);

      // Calculate confidence based on model metrics
      const confidence = await this.calculateConfidence(symbol, normalizedFeatures);

      const result: PredictionResult = {
        symbol,
        predicted_price: prediction.predicted_price,
        predictedPrice: prediction.predicted_price, // Compatibility
        confidence,
        direction: prediction.direction,
        probability: prediction.probability,
        timeframe,
        horizon,
        prediction_type: 'ensemble' as const,
        features_used: this.featureEngineer.getFeatureNames(true),
        model_used: prediction.model_used,
        timestamp: new Date()
      };

      console.log(`🔮 Prediction for ${symbol}:`, {
        price: result.predicted_price.toFixed(4),
        direction: result.direction,
        confidence: (result.confidence * 100).toFixed(1) + '%'
      });

      return result;

    } catch (error) {
      console.error(`❌ Prediction failed for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Abstract method to be implemented by specific ML models
   */
  protected abstract makePrediction(
    symbol: string,
    features: number[],
    horizon: number
  ): Promise<{
    predicted_price: number;
    direction: 'up' | 'down' | 'neutral';
    probability: number;
    model_used: string;
  }>;

  /**
   * Load models (to be implemented by subclasses)
   */
  protected abstract loadModels(): Promise<void>;

  /**
   * Calculate prediction confidence
   */
  protected async calculateConfidence(symbol: string, features: number[]): Promise<number> {
    const model = this.models.get(symbol);
    if (!model?.metrics) {
      return 0.5; // Default confidence
    }

    // Base confidence on model accuracy and feature quality
    const baseConfidence = model.metrics.accuracy || 0.5;

    // Adjust confidence based on feature stability
    const featureStability = this.assessFeatureStability(features);

    return Math.min(0.95, baseConfidence * featureStability);
  }

  /**
   * Assess feature stability
   */
  private assessFeatureStability(features: number[]): number {
    // Check for extreme values or NaN
    const hasExtremes = features.some(f => Math.abs(f) > 5 || isNaN(f));
    if (hasExtremes) return 0.7;

    // Check for reasonable feature distribution
    const featureVariance = this.calculateVariance(features);
    if (featureVariance < 0.01) return 0.8; // Too little variance
    if (featureVariance > 2) return 0.8; // Too much variance

    return 1.0; // Features look stable
  }

  /**
   * Calculate variance of features
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

    return variance;
  }

  /**
   * Update model for a symbol
   */
  async updateModel(symbol: string, model: MLModel): Promise<void> {
    this.models.set(symbol, model);
    console.log(`📊 Model updated for ${symbol}`);
  }

  /**
   * Get model metrics
   */
  getModelMetrics(symbol: string): ModelMetrics | null {
    const model = this.models.get(symbol);
    return model?.metrics || null;
  }

  /**
   * Get all available models
   */
  getAvailableModels(): string[] {
    return Array.from(this.models.keys());
  }

  /**
   * Validate prediction result
   */
  protected validatePrediction(result: PredictionResult): boolean {
    // Check for valid price
    if (!result.predicted_price || result.predicted_price <= 0) {
      return false;
    }

    // Check for valid confidence
    if (result.confidence < 0 || result.confidence > 1) {
      return false;
    }

    // Check for valid probability
    if (result.probability < 0 || result.probability > 1) {
      return false;
    }

    return true;
  }

  /**
   * Get service statistics
   */
  getServiceStats(): {
    modelsLoaded: number;
    featuresCount: number;
    cacheStats: any;
    isInitialized: boolean;
  } {
    return {
      modelsLoaded: this.models.size,
      featuresCount: this.featureEngineer.getFeatureNames(true).length,
      cacheStats: this.featureEngineer.getCacheStats(),
      isInitialized: this.isInitialized
    };
  }

  /**
   * Clear model cache
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      this.models.delete(symbol);
      this.featureEngineer.clearCache(symbol);
    } else {
      this.models.clear();
      this.featureEngineer.clearCache();
    }
  }
}
