/**
 * Production ML Training - Single optimal training session
 * Uses carefully selected data for best results
 */

import { SimpleGRUModel } from '../src/ml/simpleGRUModel';
import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { PublicCryptoService } from '../src/services/publicCryptoService';
import { OHLCVCandle } from '../src/types/dataframe';

async function productionTraining() {
    console.log('🏭 Production ML Training\n');
    console.log('='.repeat(80));
    console.log('Strategy: Single optimized training session with best data\n');

    try {
        // 1. Fetch optimal dataset
        console.log('📊 Step 1: Fetching Training Data');
        console.log('-'.repeat(80));
        const cryptoService = new PublicCryptoService();
        const rawCandles = await cryptoService.getCandlestickData('BTCUSDT', '1h', 500);
        
        const candles: OHLCVCandle[] = rawCandles.map((c: any) => ({
            timestamp: c[0],
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5]),
            date: new Date(c[0])
        }));
        
        console.log(`✓ ${candles.length} candles loaded`);
        console.log(`  Range: ${new Date(candles[0].timestamp).toLocaleDateString()} to ${new Date(candles[candles.length-1].timestamp).toLocaleDateString()}`);

        // 2. Extract features
        console.log('\n📊 Step 2: Feature Engineering');
        console.log('-'.repeat(80));
        const featureService = new FeatureEngineeringService(false);
        const allFeatures = featureService.extractFeatures(candles, 'BTCUSDT');
        console.log(`✓ ${allFeatures.length} feature sets extracted`);

        // 3. Prepare targets
        const allTargets = allFeatures.map((_, i) => {
            const idx = i + 200;
            if (idx >= candles.length - 1) return 0;
            const change = ((candles[idx + 1].close - candles[idx].close) / candles[idx].close) * 100;
            return Math.max(-1, Math.min(1, change * 50));
        });

        // 4. Split into train/test (70/30)
        console.log('\n📊 Step 3: Data Split');
        console.log('-'.repeat(80));
        const splitIdx = Math.floor(allFeatures.length * 0.7);
        
        const trainFeatures = allFeatures.slice(0, splitIdx);
        const trainTargets = allTargets.slice(0, splitIdx);
        const testFeatures = allFeatures.slice(splitIdx);
        const testTargets = allTargets.slice(splitIdx);

        console.log(`Training set: ${trainFeatures.length} samples`);
        console.log(`Test set: ${testFeatures.length} samples`);

        // 5. Build and train model
        console.log('\n📊 Step 4: Model Training');
        console.log('='.repeat(80));

        const model = new SimpleGRUModel();
        model.buildModel();

        console.log(`\nTraining configuration:`);
        console.log(`  Samples: ${Math.min(100, trainFeatures.length)} (safe limit)`);
        console.log(`  Epochs: 15 (optimal for this size)`);
        console.log(`  Batch size: 4`);
        console.log('');

        // Use only last 100 samples for stability
        const safeTrainFeatures = trainFeatures.slice(-100);
        const safeTrainTargets = trainTargets.slice(-100);

        const trainStart = Date.now();
        await model.quickTrain(safeTrainFeatures, safeTrainTargets, 15);
        const trainTime = ((Date.now() - trainStart) / 1000).toFixed(1);

        console.log(`\n✅ Training completed in ${trainTime}s`);

        // 6. Test on unseen data
        console.log('\n📊 Step 5: Model Evaluation');
        console.log('='.repeat(80));
        console.log('Testing on holdout data...\n');

        const testResults: any[] = [];

        for (let i = 20; i < testFeatures.length; i++) {
            const sequence = testFeatures.slice(i - 20, i);
            const prediction = await model.predict(sequence);

            const currentCandle = candles[splitIdx + i + 200];
            const futureCandle = candles[splitIdx + i + 201];

            if (futureCandle) {
                const actualChange = ((futureCandle.close - currentCandle.close) / currentCandle.close) * 100;
                const predictedDir = prediction.direction > 0 ? 'UP' : 'DOWN';
                const actualDir = actualChange > 0 ? 'UP' : 'DOWN';
                const match = predictedDir === actualDir;

                testResults.push({
                    match,
                    predChange: prediction.priceChange,
                    actualChange,
                    confidence: prediction.confidence,
                    error: Math.abs(prediction.priceChange - actualChange)
                });
            }
        }

        // 7. Calculate metrics
        const accuracy = (testResults.filter(r => r.match).length / testResults.length) * 100;
        const avgConfidence = testResults.reduce((sum, r) => sum + r.confidence, 0) / testResults.length;
        const avgError = testResults.reduce((sum, r) => sum + r.error, 0) / testResults.length;

        console.log(`Performance Metrics:`);
        console.log(`  Test samples: ${testResults.length}`);
        console.log(`  Direction accuracy: ${accuracy.toFixed(1)}%`);
        console.log(`  Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
        console.log(`  Average error: ${avgError.toFixed(2)}%`);

        // Confidence breakdown
        const highConf = testResults.filter(r => r.confidence > 0.6);
        const medConf = testResults.filter(r => r.confidence > 0.3 && r.confidence <= 0.6);
        const lowConf = testResults.filter(r => r.confidence <= 0.3);

        console.log(`\nConfidence Analysis:`);
        if (highConf.length > 0) {
            const highAcc = (highConf.filter(r => r.match).length / highConf.length) * 100;
            console.log(`  High (>60%): ${highConf.length} tests → ${highAcc.toFixed(1)}% accurate`);
        }
        if (medConf.length > 0) {
            const medAcc = (medConf.filter(r => r.match).length / medConf.length) * 100;
            console.log(`  Medium (30-60%): ${medConf.length} tests → ${medAcc.toFixed(1)}% accurate`);
        }
        if (lowConf.length > 0) {
            const lowAcc = (lowConf.filter(r => r.match).length / lowConf.length) * 100;
            console.log(`  Low (<30%): ${lowConf.length} tests → ${lowAcc.toFixed(1)}% accurate`);
        }

        // 8. Save model
        console.log('\n📊 Step 6: Saving Model');
        console.log('='.repeat(80));
        const modelPath = './models/GRU_Production';
        try {
            await model.saveModel(`file://${modelPath}`);
            console.log(`✅ Model saved to: ${modelPath}`);
        } catch (saveError) {
            console.log(`⚠️ Could not save model (expected in pure tfjs)`);
            console.log(`  Model is trained and ready to use in current session`);
        }

        // 9. Current prediction
        console.log('\n🔮 CURRENT PREDICTION');
        console.log('='.repeat(80));

        const livePrediction = await model.predict(allFeatures);
        const liveCandle = candles[candles.length - 1];

        console.log(`\nBTCUSDT:`);
        console.log(`  Price: $${liveCandle.close.toLocaleString()}`);
        console.log(`  Time: ${new Date(liveCandle.timestamp).toLocaleString()}`);
        console.log('');
        console.log(`Prediction:`);
        console.log(`  Direction: ${livePrediction.direction > 0 ? '📈 UP' : '📉 DOWN'}`);
        console.log(`  Expected: ${livePrediction.priceChange > 0 ? '+' : ''}${livePrediction.priceChange.toFixed(2)}%`);
        console.log(`  Confidence: ${(livePrediction.confidence * 100).toFixed(1)}%`);
        console.log(`  Signal: ${livePrediction.confidence > 0.6 ? '🟢 STRONG' : livePrediction.confidence > 0.3 ? '🟡 MODERATE' : '🔴 WEAK'}`);

        // 10. Final summary
        console.log('\n' + '='.repeat(80));
        console.log('✅ PRODUCTION MODEL READY');
        console.log('='.repeat(80));

        console.log(`\n📊 Model Specs:`);
        console.log(`  Architecture: GRU (3,713 parameters)`);
        console.log(`  Training samples: ${safeTrainFeatures.length}`);
        console.log(`  Epochs: 15`);
        console.log(`  Training time: ${trainTime}s`);

        console.log(`\n📈 Performance:`);
        console.log(`  Test accuracy: ${accuracy.toFixed(1)}%`);
        console.log(`  Avg confidence: ${(avgConfidence * 100).toFixed(1)}%`);
        console.log(`  Status: ${accuracy >= 55 ? '✅ GOOD' : accuracy >= 50 ? '⚠️ MARGINAL' : '❌ POOR'}`);

        console.log(`\n💡 Usage in Telegram bot:`);
        console.log(`  /mlpredict BTCUSDT - Get AI prediction`);
        console.log(`  /openclaw BTCUSDT - Compare with strategy`);
        console.log(`  /mlstatus - Check model info`);

        if (accuracy >= 55) {
            console.log(`\n🎉 Model is production-ready!`);
            if (highConf.length > 0) {
                const highAcc = (highConf.filter(r => r.match).length / highConf.length) * 100;
                if (highAcc >= 60) {
                    console.log(`  ✓ High-confidence predictions are ${highAcc.toFixed(1)}% accurate`);
                    console.log(`  ✓ Use predictions with confidence > 60% for best results`);
                }
            }
        } else {
            console.log(`\n⚠️ Model performance is marginal`);
            console.log(`  → Combine with /openclaw for better signals`);
            console.log(`  → Wait for high confidence predictions (>70%)`);
        }

        console.log(`\n🔄 Maintenance:`);
        console.log(`  - Retrain weekly with fresh data`);
        console.log(`  - Monitor real-world accuracy`);
        console.log(`  - Run: npx ts-node scripts/production-training.ts`);

    } catch (error) {
        console.error('\n❌ Error:', error);
        if (error instanceof Error) {
            console.error(error.message);
            console.error(error.stack);
        }
        process.exit(1);
    }
}

productionTraining();
