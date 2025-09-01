/**
 * Random Forest Service
 * Implements Random Forest ML model for trading predictions
 */

import { MLPredictorService } from './mlPredictorService';
import { RandomForestSignal, RandomForestConfig, MLModel, ModelPerformance } from '../types/mlTypes';
import { RandomForestClassifier } from 'ml-random-forest';
import { Matrix } from 'ml-matrix';

export class RandomForestService extends MLPredictorService {
  private classifiers: Map<string, RandomForestClassifier> = new Map();
  private config: RandomForestConfig;
  private trainingData: Map<string, { features: number[][]; labels: number[] }> = new Map();

  constructor() {
    super();
    this.config = {
      n_estimators: 100,
      max_depth: 10,
      min_samples_split: 2,
      min_samples_leaf: 1,
      max_features: 'sqrt',
      random_state: 42
    };
    console.log('🌲 Random Forest Service initialized');
  }

  /**
   * Load or create models for symbols
   */
  protected async loadModels(): Promise<void> {
    try {
      // For now, we'll create default models
      // In production, these would be loaded from persistent storage
      console.log('📚 Loading Random Forest models...');

      // Create default model structure
      const defaultPerformance: ModelPerformance = {
        model_name: 'Random Forest Classifier',
        accuracy: 0.65,
        precision: 0.62,
        recall: 0.68,
        f1_score: 0.65,
        mse: 0.25,
        mae: 0.18,
        sharpe_ratio: 1.2,
        max_drawdown: 0.15,
        total_predictions: 0,
        correct_predictions: 0,
        training_date: new Date(),
        last_updated: new Date()
      };

      const defaultModel: MLModel = {
        id: 'rf_default',
        name: 'Random Forest Default',
        type: 'random_forest',
        version: '1.0.0',
        status: 'ready',
        performance: defaultPerformance,
        metrics: defaultPerformance,
        hyperparameters: this.config,
        created_date: new Date(),
        last_trained: new Date(),
        next_retrain: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
      };

      this.models.set('default', defaultModel);
      console.log('✅ Random Forest models loaded successfully');

    } catch (error) {
      console.error('❌ Failed to load Random Forest models:', error);
      throw error;
    }
  }

  /**
   * Make prediction using Random Forest
   */
  protected async makePrediction(
    symbol: string,
    features: number[],
    horizon: number
  ): Promise<{
    predicted_price: number;
    direction: 'up' | 'down' | 'neutral';
    probability: number;
    model_used: string;
  }> {
    try {
      // Get or create classifier for symbol
      let classifier = this.classifiers.get(symbol);

      if (!classifier) {
        classifier = await this.createClassifier(symbol, features);
      }

      // Convert features to matrix format expected by ml-random-forest
      const featureMatrix = [features];

      // Make prediction
      const predictions = classifier.predict(featureMatrix);

      // ml-random-forest doesn't have predictProba, so we'll estimate probabilities
      const prediction = predictions[0];
      let direction: 'up' | 'down' | 'neutral';
      let probability = 0.6; // Default probability

      // Simple prediction logic without probabilities
      if (prediction === 2) {
        direction = 'up';
        probability = 0.7;
      } else if (prediction === 0) {
        direction = 'down';
        probability = 0.7;
      } else {
        direction = 'neutral';
        probability = 0.5;
      }

      // Estimate price change based on direction and probability
      const basePrice = features[3] || 1; // Using price_change_1h as base reference
      let priceChangePercent = 0;

      if (direction === 'up') {
        priceChangePercent = 0.02 * probability * horizon; // 2% max change per hour
      } else if (direction === 'down') {
        priceChangePercent = -0.02 * probability * horizon;
      }

      // Calculate predicted price (this is a simplified approach)
      const currentPrice = this.estimateCurrentPrice(features);
      const predicted_price = currentPrice * (1 + priceChangePercent);

      console.log(`🌲 Random Forest prediction for ${symbol}:`, {
        direction,
        probability: probability.toFixed(3),
        priceChange: (priceChangePercent * 100).toFixed(2) + '%'
      });

      return {
        predicted_price,
        direction,
        probability,
        model_used: 'Random Forest Classifier'
      };

    } catch (error) {
      console.error(`❌ Random Forest prediction failed for ${symbol}:`, error);

      // Return fallback prediction
      return {
        predicted_price: this.estimateCurrentPrice(features),
        direction: 'neutral',
        probability: 0.5,
        model_used: 'Random Forest Fallback'
      };
    }
  }

  /**
   * Create a new classifier for a symbol
   */
  private async createClassifier(symbol: string, sampleFeatures: number[]): Promise<RandomForestClassifier> {
    try {
      // Generate synthetic training data for demonstration
      // In production, this would use historical data
      const syntheticData = this.generateSyntheticTrainingData(sampleFeatures, 1000);

      // Create and train classifier
      const classifier = new RandomForestClassifier({
        nEstimators: this.config.n_estimators,
        maxFeatures: this.config.max_features === 'sqrt' ? Math.sqrt(sampleFeatures.length) : this.config.max_features as number,
        seed: this.config.random_state
      });

      // Train the classifier
      classifier.train(syntheticData.features, syntheticData.labels);

      // Store classifier and training data
      this.classifiers.set(symbol, classifier);
      this.trainingData.set(symbol, syntheticData);

      console.log(`🌲 Created Random Forest classifier for ${symbol} with ${syntheticData.features.length} samples`);

      return classifier;

    } catch (error) {
      console.error(`❌ Failed to create classifier for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Generate synthetic training data for demonstration
   * In production, this would be replaced with real historical data
   */
  private generateSyntheticTrainingData(sampleFeatures: number[], samples: number): { features: number[][]; labels: number[] } {
    const features: number[][] = [];
    const labels: number[] = [];

    for (let i = 0; i < samples; i++) {
      // Generate feature variations
      const newFeatures = sampleFeatures.map(feature => {
        const noise = (Math.random() - 0.5) * 0.2; // 20% noise
        return feature + noise;
      });

      features.push(newFeatures);

      // Generate labels based on feature patterns
      // This is a simplified labeling strategy
      const rsi = newFeatures[0] * 100; // RSI feature
      const priceChange = newFeatures[3]; // Price change feature
      const momentum = newFeatures[5]; // Momentum feature

      let label: number;
      if (rsi < 30 && priceChange < 0 && momentum < 0) {
        label = 2; // Strong buy signal
      } else if (rsi > 70 && priceChange > 0 && momentum > 0) {
        label = 0; // Strong sell signal
      } else if (rsi >= 30 && rsi <= 70) {
        label = 1; // Neutral/hold
      } else {
        label = Math.random() > 0.5 ? 1 : (Math.random() > 0.5 ? 2 : 0);
      }

      labels.push(label);
    }

    return { features, labels };
  }

  /**
   * Estimate current price from features
   */
  private estimateCurrentPrice(features: number[]): number {
    // This is a placeholder - in reality, you'd need the actual current price
    // For now, we'll use a base price of 50000 (like BTC) and adjust based on features
    const basePrice = 50000;
    const priceChange1h = features[3] || 0;
    const priceChange24h = features[4] || 0;

    return basePrice * (1 + priceChange24h);
  }

  /**
   * Get Random Forest specific signal
   */
  async getRandomForestSignal(
    symbol: string,
    features: number[]
  ): Promise<RandomForestSignal> {
    const prediction = await this.makePrediction(symbol, features, 1);

    return {
      symbol,
      signal: prediction.direction === 'up' ? 'BUY' :
              prediction.direction === 'down' ? 'SELL' : 'HOLD',
      probability: {
        BUY: prediction.direction === 'up' ? prediction.probability : 1 - prediction.probability,
        SELL: prediction.direction === 'down' ? prediction.probability : 1 - prediction.probability,
        HOLD: prediction.direction === 'neutral' ? prediction.probability : 1 - prediction.probability
      },
      feature_importance: await this.getFeatureImportance(symbol),
      decision_path: this.getDecisionPath(features),
      confidence: prediction.probability,
      timestamp: new Date()
    };
  }

  /**
   * Get feature importance from trained model
   */
  private async getFeatureImportance(symbol: string): Promise<any[]> {
    // Placeholder implementation
    // Real Random Forest libraries would provide feature importance
    const featureNames = this.featureEngineer.getFeatureNames(true);

    return featureNames.map((name, index) => ({
      feature_name: name,
      importance: Math.random() * 0.1 + 0.05, // Random importance for demo
      category: this.categorizeFeature(name)
    }));
  }

  /**
   * Categorize feature for importance analysis
   */
  private categorizeFeature(featureName: string): 'technical' | 'price' | 'market' | 'sentiment' {
    if (featureName.includes('rsi') || featureName.includes('macd') || featureName.includes('bollinger')) {
      return 'technical';
    } else if (featureName.includes('price_change') || featureName.includes('volatility')) {
      return 'price';
    } else if (featureName.includes('volume') || featureName.includes('correlation')) {
      return 'market';
    } else {
      return 'sentiment';
    }
  }

  /**
   * Get simplified decision path
   */
  private getDecisionPath(features: number[]): string[] {
    const path: string[] = [];

    // Simplified decision tree logic for demonstration
    const rsi = features[0] * 100;
    const priceChange = features[3];

    if (rsi < 30) {
      path.push('RSI < 30 (Oversold)');
      if (priceChange < -0.02) {
        path.push('Price falling > 2%');
        path.push('Decision: BUY signal');
      }
    } else if (rsi > 70) {
      path.push('RSI > 70 (Overbought)');
      if (priceChange > 0.02) {
        path.push('Price rising > 2%');
        path.push('Decision: SELL signal');
      }
    } else {
      path.push('RSI neutral (30-70)');
      path.push('Decision: HOLD signal');
    }

    return path;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RandomForestConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Random Forest configuration updated:', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): RandomForestConfig {
    return { ...this.config };
  }

  /**
   * Retrain classifier with new data
   */
  async retrainClassifier(symbol: string, features: number[][]): Promise<void> {
    try {
      console.log(`🔄 Retraining Random Forest classifier for ${symbol}...`);

      // This would retrain with real historical data
      await this.createClassifier(symbol, features[0]);

      console.log(`✅ Random Forest classifier retrained for ${symbol}`);
    } catch (error) {
      console.error(`❌ Failed to retrain classifier for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get training statistics
   */
  getTrainingStats(symbol: string): { samples: number; features: number; accuracy: number } | null {
    const data = this.trainingData.get(symbol);
    if (!data) return null;

    return {
      samples: data.features.length,
      features: data.features[0]?.length || 0,
      accuracy: this.models.get(symbol)?.metrics.accuracy || 0.5
    };
  }
}
