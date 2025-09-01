/**
 * Machine Learning Types for Phase 2 Implementation
 * Contains interfaces and types for ML-powered trading features
 */

// Prediction Models
export interface PredictionResult {
  symbol: string;
  predicted_price: number;
  predictedPrice: number; // For backward compatibility
  confidence: number;
  direction: 'up' | 'down' | 'neutral';
  probability: number;
  timeframe: string;
  horizon: number;
  prediction_type: 'lstm' | 'random_forest' | 'ensemble';
  features_used: string[];
  model_used: string;
  timestamp: Date;
}

export interface MLFeatures {
  technical_indicators: {
    rsi: number;
    macd: number;
    bollinger_bands: { upper: number; middle: number; lower: number };
    sma_20: number;
    ema_12: number;
    volume_sma: number;
  };
  price_features: {
    price_change_1h: number;
    price_change_24h: number;
    price_volatility: number;
    price_momentum: number;
  };
  market_features: {
    volume_change: number;
    market_cap_rank?: number;
    correlation_btc: number;
  };
  sentiment_features?: {
    news_sentiment: number;
    social_sentiment: number;
    fear_greed_index: number;
  };
}

export interface ModelPerformance {
  model_name: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  mse: number; // Mean Squared Error for regression
  mae: number; // Mean Absolute Error
  sharpe_ratio: number;
  max_drawdown: number;
  total_predictions: number;
  correct_predictions: number;
  training_date: Date;
  last_updated: Date;
}

// Add ModelMetrics alias for compatibility
export type ModelMetrics = ModelPerformance;

// Sentiment Analysis
export interface SentimentResult {
  symbol: string;
  overall_sentiment: number; // -1 to 1
  sentiment_strength: number; // 0 to 1
  news_sentiment: number;
  social_sentiment: number;
  sources: {
    news_articles: number;
    social_posts: number;
    analysis_date: Date;
  };
  key_phrases: string[];
  sentiment_trend: 'bullish' | 'bearish' | 'neutral';
}

export interface NewsAnalysis {
  title: string;
  content: string;
  source: string;
  sentiment_score: number;
  impact_score: number; // 0 to 1
  keywords: string[];
  entities: string[];
  published_date: Date;
  relevance_score: number;
}

// Ensemble Trading
export interface StrategySignal {
  strategy_name: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  weight: number;
  reasoning: string;
  timestamp: Date;
}

export interface EnsembleResult {
  symbol: string;
  final_signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  individual_signals: StrategySignal[];
  weighted_score: number;
  risk_adjusted_size: number;
  timestamp: Date;
}

export interface StrategyWeights {
  [strategy_name: string]: number;
}

export interface MetaLearningResult {
  recommended_weights: StrategyWeights;
  performance_forecast: number;
  confidence: number;
  market_regime: 'trending' | 'ranging' | 'volatile';
  adaptation_reason: string;
}

// Feature Engineering
export interface FeatureSet {
  symbol: string;
  timeframe: string;
  features: MLFeatures;
  target?: number; // For supervised learning
  timestamp: Date;
}

export interface FeatureImportance {
  feature_name: string;
  importance: number;
  category: 'technical' | 'price' | 'market' | 'sentiment';
}

// Model Management
export interface MLModel {
  id: string;
  name: string;
  type: 'lstm' | 'random_forest' | 'ensemble' | 'sentiment';
  version: string;
  status: 'training' | 'ready' | 'outdated' | 'error';
  performance: ModelPerformance;
  metrics: ModelPerformance; // Alias for compatibility
  hyperparameters: Record<string, any>;
  created_date: Date;
  last_trained: Date;
  next_retrain: Date;
}

export interface TrainingConfig {
  model_type: 'lstm' | 'random_forest' | 'ensemble';
  features: string[];
  target: string;
  train_size: number;
  validation_size: number;
  hyperparameters: Record<string, any>;
  retrain_frequency: 'daily' | 'weekly' | 'monthly';
}

// LSTM specific types
export interface LSTMConfig {
  sequence_length: number;
  hidden_units: number;
  num_layers: number;
  dropout_rate: number;
  learning_rate: number;
  batch_size: number;
  epochs: number;
}

export interface LSTMPrediction {
  symbol: string;
  predicted_prices: number[];
  prediction_intervals: Array<{ lower: number; upper: number }>;
  confidence_intervals: number[];
  time_horizon: number; // hours ahead
  model_confidence: number;
  timestamp: Date;
}

// Random Forest specific types
export interface RandomForestConfig {
  n_estimators: number;
  max_depth: number;
  min_samples_split: number;
  min_samples_leaf: number;
  max_features: string | number;
  random_state: number;
}

export interface RandomForestSignal {
  symbol: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  probability: { BUY: number; SELL: number; HOLD: number };
  feature_importance: FeatureImportance[];
  decision_path: string[];
  confidence: number;
  timestamp: Date;
}

// Market Regime Detection
export interface MarketRegime {
  regime: 'bull_trending' | 'bear_trending' | 'sideways' | 'high_volatility';
  confidence: number;
  regime_strength: number;
  duration_days: number;
  key_indicators: string[];
  regime_change_probability: number;
  timestamp: Date;
}

// Real-time ML Pipeline
export interface MLPipelineStatus {
  pipeline_id: string;
  status: 'running' | 'paused' | 'error' | 'maintenance';
  last_prediction: Date;
  predictions_today: number;
  accuracy_today: number;
  error_rate: number;
  processing_time_ms: number;
  queue_size: number;
}

export interface PredictionRequest {
  symbol: string;
  timeframe: '1h' | '4h' | '1d';
  model_types: Array<'lstm' | 'random_forest' | 'ensemble'>;
  include_sentiment: boolean;
  horizon_hours: number;
  confidence_level: number;
}

export interface PredictionResponse {
  request_id: string;
  symbol: string;
  predictions: PredictionResult[];
  ensemble_result?: EnsembleResult;
  sentiment_analysis?: SentimentResult;
  market_regime?: MarketRegime;
  processing_time_ms: number;
  timestamp: Date;
}
