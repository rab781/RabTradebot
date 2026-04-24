/**
 * LSTM Model Manager
 * Handles model creation, training, prediction, and persistence
 */

import * as tf from '@tensorflow/tfjs';
import * as fs from 'fs';
import * as path from 'path';
import { getDatabase } from '../database/database';
import { FeatureSet } from '../services/featureEngineering';
import { logger } from '../utils/logger';

export interface ModelConfig {
  inputShape: number;
  sequenceLength: number;
  lstmUnits: number[];
  dropout: number;
  learningRate: number;
  epochs: number;
  batchSize: number;
}

export interface PredictionResult {
  direction: number; // -1 to 1 (bearish to bullish)
  confidence: number; // 0 to 1
  priceChange: number; // Predicted price change percentage
}

export interface TrainingResult {
  finalLoss: number;
  finalAccuracy: number;
  trainingTime: number;
  epochs: number;
}

export class LSTMModelManager {
  private model: tf.LayersModel | null = null;
  private config: ModelConfig;
  private modelName: string;
  private version: string;

  constructor(
    modelName: string = 'LSTM_PricePredictor',
    version: string = '1.0.0',
    config?: Partial<ModelConfig>
  ) {
    this.modelName = modelName;
    this.version = version;

    // Default configuration - optimized for pure TensorFlow.js
    this.config = {
      inputShape: 60, // Number of features
      sequenceLength: 20, // Look back 20 candles
      lstmUnits: [64, 32, 16], // Reduced for performance
      dropout: 0.3, // Higher dropout for regularization
      learningRate: 0.0005, // Lower learning rate for stability
      epochs: 30, // Reduced epochs
      batchSize: 16, // Smaller batches for stability
      ...config,
    };
  }

  /**
   * Build the LSTM model architecture (Optimized for TensorFlow.js)
   */
  buildModel(): void {
    logger.info('🔨 Building optimized LSTM model...');

    const input = tf.input({
      shape: [this.config.sequenceLength, this.config.inputShape],
    });

    // Use glorotUniform instead of orthogonal for faster initialization
    // First LSTM layer
    let x = tf.layers
      .lstm({
        units: this.config.lstmUnits[0],
        returnSequences: this.config.lstmUnits.length > 1,
        kernelInitializer: 'glorotUniform',
        recurrentInitializer: 'glorotUniform', // Faster than orthogonal
        dropout: this.config.dropout,
        recurrentDropout: 0.0, // Disable for performance
      })
      .apply(input) as tf.SymbolicTensor;

    // Additional LSTM layers
    for (let i = 1; i < this.config.lstmUnits.length; i++) {
      const isLast = i === this.config.lstmUnits.length - 1;
      x = tf.layers
        .lstm({
          units: this.config.lstmUnits[i],
          returnSequences: !isLast,
          kernelInitializer: 'glorotUniform',
          recurrentInitializer: 'glorotUniform',
          dropout: this.config.dropout,
          recurrentDropout: 0.0,
        })
        .apply(x) as tf.SymbolicTensor;
    }

    // Dense layer for regression (predict price change)
    const output = tf.layers
      .dense({
        units: 1,
        activation: 'tanh', // Output between -1 and 1
        kernelInitializer: 'glorotUniform',
      })
      .apply(x) as tf.SymbolicTensor;

    this.model = tf.model({ inputs: input, outputs: output });

    // Compile model with optimized settings
    this.model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: 'meanSquaredError',
      metrics: ['mae'],
    });

    logger.info('✅ LSTM Model built successfully');
    this.model.summary();
  }

  /**
   * Train the model on feature data
   */
  async train(
    features: FeatureSet[],
    targets: number[],
    validationSplit: number = 0.2
  ): Promise<TrainingResult> {
    if (!this.model) {
      this.buildModel();
    }

    logger.info(`🚀 Training model on ${features.length} samples...`);
    const startTime = Date.now();

    // Prepare sequences
    const { X, y } = this.prepareSequences(features, targets);

    logger.info(`   Input shape: [${X.shape}]`);
    logger.info(`   Target shape: [${y.shape}]`);

    // Train the model
    const history = await this.model!.fit(X, y, {
      epochs: this.config.epochs,
      batchSize: this.config.batchSize,
      validationSplit,
      shuffle: true,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          const loss = logs?.loss || 0;
          const mae = logs?.mae || 0;
          const valLoss = logs?.val_loss;
          const valMae = logs?.val_mae;

          let logMsg = `   Epoch ${epoch + 1}/${this.config.epochs} - loss: ${loss.toFixed(4)} - mae: ${mae.toFixed(4)}`;

          if (valLoss !== undefined && valMae !== undefined) {
            logMsg += ` - val_loss: ${valLoss.toFixed(4)} - val_mae: ${valMae.toFixed(4)}`;
          }

          logger.info(logMsg);
        },
      },
    });

    // Cleanup tensors
    X.dispose();
    y.dispose();

    const trainingTime = Date.now() - startTime;
    const finalLoss = history.history.loss[history.history.loss.length - 1] as number;
    const finalMAE = history.history.mae[history.history.mae.length - 1] as number;

    logger.info(`✅ Training completed in ${(trainingTime / 1000).toFixed(2)}s`);
    logger.info(`   Final Loss: ${finalLoss.toFixed(6)}`);
    logger.info(`   Final MAE: ${finalMAE.toFixed(6)}`);

    return {
      finalLoss,
      finalAccuracy: 1 - finalMAE, // Approximation
      trainingTime,
      epochs: this.config.epochs,
    };
  }

  /**
   * Make a prediction on new data
   */
  async predict(features: FeatureSet[]): Promise<PredictionResult> {
    if (!this.model) {
      throw new Error('Model not loaded. Call buildModel() or loadModel() first.');
    }

    if (features.length < this.config.sequenceLength) {
      throw new Error(`Need at least ${this.config.sequenceLength} feature sets for prediction`);
    }

    // Take the last sequence
    const sequence = features.slice(-this.config.sequenceLength);

    // Prepare input tensor
    const X = this.prepareSequenceForPrediction(sequence);

    // Make prediction
    const prediction = this.model.predict(X) as tf.Tensor;
    const predictionValue = await prediction.data();

    // Cleanup
    X.dispose();
    prediction.dispose();

    // Convert output to prediction result
    const direction = predictionValue[0]; // Value between -1 and 1
    const confidence = Math.abs(direction); // Absolute value as confidence
    const priceChange = direction * 5; // Assume max 5% price change

    return {
      direction,
      confidence,
      priceChange,
    };
  }

  /**
   * Prepare sequences for training
   */
  private prepareSequences(
    features: FeatureSet[],
    targets: number[]
  ): { X: tf.Tensor3D; y: tf.Tensor2D } {
    if (features.length !== targets.length) {
      throw new Error('Features and targets must have same length');
    }

    const sequences: number[][][] = [];
    const labels: number[] = [];

    for (let i = this.config.sequenceLength; i < features.length; i++) {
      const sequence = features.slice(i - this.config.sequenceLength, i);
      const featureArray = this.featuresToArray(sequence);
      sequences.push(featureArray);
      labels.push(targets[i]);
    }

    const X = tf.tensor3d(sequences);
    const y = tf.tensor2d(labels, [labels.length, 1]);

    return { X, y };
  }

  /**
   * Prepare single sequence for prediction
   */
  private prepareSequenceForPrediction(sequence: FeatureSet[]): tf.Tensor3D {
    const featureArray = this.featuresToArray(sequence);
    return tf.tensor3d([featureArray]);
  }

  /**
   * Convert feature sets to numerical array with normalization
   */
  private featuresToArray(features: FeatureSet[]): number[][] {
    return features.map((f) => {
      // Extract all numeric features (exclude timestamp and symbol)
      const rawFeatures = [
        f.returns,
        f.logReturns,
        f.priceChange,
        f.priceChangePercent,
        f.highLowRange,
        f.highLowRange,
        f.upperShadow,
        f.lowerShadow,
        f.bodyToRangeRatio,
        f.rsi_7,
        f.rsi_14,
        f.rsi_21,
        f.roc_10,
        f.roc_20,
        f.stoch_k,
        f.stoch_d,
        f.williams_r,
        f.cci,
        f.mfi,
        f.macd,
        f.macdSignal,
        f.macdHistogram,
        f.macdCrossover,
        f.ema_9,
        f.ema_21,
        f.ema_50,
        f.sma_20,
        f.sma_50,
        f.sma_200,
        f.adx,
        f.priceVsEMA9,
        f.priceVsEMA21,
        f.priceVsSMA50,
        f.atr_14,
        f.atrPercent,
        f.bb_upper,
        f.bb_middle,
        f.bb_lower,
        f.bb_width,
        f.bb_percentB,
        f.volumeRatio,
        f.volumeMA_20,
        f.obv,
        f.obvSlope,
        f.volumePriceCorrelation,
        f.volumeWeightedPrice,
        f.moneyFlowIndex,
        f.volatility_20,
        f.volatility_50,
        f.skewness_20,
        f.kurtosis_20,
        f.autocorrelation_1,
        f.autocorrelation_5,
        f.returns_mean_20,
        f.returns_std_20,
        f.spreadApprox,
        f.volumeImbalance,
        f.priceEfficiency,
        f.marketDepthProxy,
        f.liquidityScore,
      ];

      // Replace NaN/Infinity with 0
      return rawFeatures.map((val) => {
        if (!isFinite(val) || isNaN(val)) return 0;
        // Clip extreme values to prevent gradient explosion
        return Math.max(-10, Math.min(10, val));
      });
    });
  }

  /**
   * Save model to disk (requires @tensorflow/tfjs-node)
   */
  async saveModel(dirPath: string = './models'): Promise<string> {
    throw new Error(
      'Model saving requires @tensorflow/tfjs-node which needs Visual Studio Build Tools. Model is trained and can be used in-memory.'
    );
  }

  /**
   * Load model from disk
   */
  async loadModel(modelPath: string): Promise<void> {
    try {
      this.model = await tf.loadLayersModel(`file://${modelPath}/model.json`);

      // Load config
      const configPath = path.join(modelPath, 'config.json');
      if (fs.existsSync(configPath)) {
        this.config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }

      logger.info(`✅ Model loaded from ${modelPath}`);
    } catch (error) {
      logger.error({ err: error }, '❌ Failed to load model:');
      throw error;
    }
  }

  /**
   * Save model metadata to database
   */
  async saveMetadataToDatabase(
    trainingResult: TrainingResult,
    symbol: string,
    trainingPeriod: string
  ): Promise<void> {
    const db = getDatabase();

    const modelPath = path.join('./models', `${this.modelName}_${this.version}`);

    await db.insertModelVersion({
      modelName: this.modelName,
      version: this.version,
      architecture: `LSTM ${this.config.lstmUnits.join('-')}`,
      accuracy: trainingResult.finalAccuracy,
      mae: 1 - trainingResult.finalAccuracy,
      rmse: Math.sqrt(trainingResult.finalLoss),
      directionalAccuracy: trainingResult.finalAccuracy,
      trainedOn: symbol,
      trainingPeriod,
      filePath: modelPath,
      metadata: JSON.stringify(this.config),
      createdAt: Date.now(),
    });

    logger.info('✅ Model metadata saved to database');
  }

  /**
   * Get model info
   */
  getModelInfo(): {
    name: string;
    version: string;
    config: ModelConfig;
    isLoaded: boolean;
  } {
    return {
      name: this.modelName,
      version: this.version,
      config: this.config,
      isLoaded: this.model !== null,
    };
  }

  /**
   * Dispose model and free memory
   */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
      logger.info('✅ Model disposed');
    }
  }
}
