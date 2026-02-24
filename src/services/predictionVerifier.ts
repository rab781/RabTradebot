/**
 * Prediction Verification Service
 * Automatically verifies ML predictions after time has passed
 */

import { db } from './databaseService';
import { PublicCryptoService } from './publicCryptoService';

export class PredictionVerificationService {
  private publicCrypto: PublicCryptoService;
  private intervalId: NodeJS.Timeout | null = null;
  private verificationInterval = 3600000; // 1 hour

  constructor() {
    this.publicCrypto = new PublicCryptoService();
  }

  /**
   * Start automatic prediction verification
   */
  start() {
    if (this.intervalId) {
      console.log('⚠️ Prediction verification already running');
      return;
    }

    console.log('🔍 Starting prediction verification service...');

    // Run immediately
    this.verifyPredictions();

    // Then run every hour
    this.intervalId = setInterval(() => {
      this.verifyPredictions();
    }, this.verificationInterval);
  }

  /**
   * Stop verification service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('⏹️ Prediction verification service stopped');
    }
  }

  /**
   * Verify all unverified predictions
   */
  async verifyPredictions() {
    try {
      // Get predictions older than 1 hour that haven't been verified
      const predictions = await db.getUnverifiedPredictions();

      if (predictions.length === 0) {
        console.log('✅ No predictions to verify');
        return;
      }

      console.log(`🔍 Verifying ${predictions.length} predictions...`);

      let verified = 0;
      let errors = 0;

      for (const prediction of predictions) {
        try {
          await this.verifyPrediction(prediction);
          verified++;
        } catch (error) {
          console.error(`Failed to verify prediction ${prediction.id}:`, error);
          errors++;
        }
      }

      console.log(`✅ Verified ${verified} predictions (${errors} errors)`);
    } catch (error) {
      console.error('Prediction verification error:', error);
      await db.logError({
        level: 'ERROR',
        source: 'prediction_verification',
        message: `Verification failed: ${(error as Error).message}`,
        stackTrace: (error as Error).stack,
      });
    }
  }

  /**
   * Verify a single prediction
   */
  private async verifyPrediction(prediction: any) {
    try {
      // Get current price for the symbol
      const candles = await this.publicCrypto.getCandlestickData(prediction.symbol, '1h', 2);

      if (candles.length < 2) {
        throw new Error('Insufficient data for verification');
      }

      const latestCandle = candles[candles.length - 1];
      const actualPrice = parseFloat(latestCandle[4]); // close price

      // Calculate actual change
      const actualChange =
        ((actualPrice - prediction.currentPrice) / prediction.currentPrice) * 100;

      // Determine actual direction
      let actualDirection = 'NEUTRAL';
      if (actualChange > 0.5) {
        actualDirection = 'UP';
      } else if (actualChange < -0.5) {
        actualDirection = 'DOWN';
      }

      // Update prediction with actual results
      await db.verifyPrediction(prediction.id, {
        actualDirection,
        actualChange,
        actualPrice,
      });

      console.log(
        `✅ Verified ${prediction.symbol}: Predicted ${prediction.predictedDirection}, Actual ${actualDirection}`
      );
    } catch (error) {
      console.error(`Failed to verify prediction for ${prediction.symbol}:`, error);
      throw error;
    }
  }

  /**
   * Generate accuracy report for a model
   */
  async generateAccuracyReport(modelName: string = 'GRU', symbol?: string) {
    try {
      const stats = await db.getPredictionStats(modelName, symbol);

      console.log(`
📊 PREDICTION ACCURACY REPORT
Model: ${modelName}
${symbol ? `Symbol: ${symbol}` : 'All Symbols'}

Total Predictions: ${stats.total}
Correct: ${stats.correct}
Accuracy: ${stats.accuracy.toFixed(2)}%
Avg Confidence: ${(stats.avgConfidence * 100).toFixed(2)}%
            `);

      return stats;
    } catch (error) {
      console.error('Failed to generate accuracy report:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const predictionVerifier = new PredictionVerificationService();
