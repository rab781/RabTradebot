/**
 * Prediction Verification Service
 * Automatically verifies ML predictions after time has passed
 */

import { db } from './databaseService';
import { PublicCryptoService } from './publicCryptoService';
import { logger } from '../utils/logger';

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
            logger.info('⚠️ Prediction verification already running');
            return;
        }

        logger.info('🔍 Starting prediction verification service...');
        
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
            logger.info('⏹️ Prediction verification service stopped');
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
                logger.info('✅ No predictions to verify');
                return;
            }

            logger.info(`🔍 Verifying ${predictions.length} predictions...`);

            let verified = 0;
            let errors = 0;

            for (const prediction of predictions) {
                try {
                    await this.verifyPrediction(prediction);
                    verified++;
                } catch (error) {
                    logger.error({ err: error }, `Failed to verify prediction ${prediction.id}:`);
                    errors++;
                }
            }

            logger.info(`✅ Verified ${verified} predictions (${errors} errors)`);
        } catch (error) {
            logger.error({ err: error }, 'Prediction verification error:');
            await db.logError({
                level: 'ERROR',
                source: 'prediction_verification',
                message: `Verification failed: ${(error as Error).message}`,
                stackTrace: (error as Error).stack
            });
        }
    }

    /**
     * Verify a single prediction
     */
    private async verifyPrediction(prediction: any) {
        try {
            // Get current price for the symbol
            const candles = await this.publicCrypto.getCandlestickData(
                prediction.symbol,
                '1h',
                2
            );

            if (candles.length < 2) {
                throw new Error('Insufficient data for verification');
            }

            const latestCandle = candles[candles.length - 1];
            const actualPrice = parseFloat(latestCandle[4]); // close price

            // Calculate actual change
            const actualChange = ((actualPrice - prediction.currentPrice) / prediction.currentPrice) * 100;

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
                actualPrice
            });

            logger.info(`✅ Verified ${prediction.symbol}: Predicted ${prediction.predictedDirection}, Actual ${actualDirection}`);
        } catch (error) {
            logger.error({ err: error }, `Failed to verify prediction for ${prediction.symbol}:`);
            throw error;
        }
    }

    /**
     * Generate accuracy report for a model
     */
    async generateAccuracyReport(modelName: string = 'GRU', symbol?: string) {
        try {
            const stats = await db.getPredictionStats(modelName, symbol);
            
            logger.info(`
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
            logger.error({ err: error }, 'Failed to generate accuracy report:');
            throw error;
        }
    }
}

// Export singleton instance
export const predictionVerifier = new PredictionVerificationService();
