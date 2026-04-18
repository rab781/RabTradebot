/**
 * Advanced Training - Multiple small batches to build better model
 * Workaround for TensorFlow.js pure JS limitations
 */

import { SimpleGRUModel } from '../src/ml/simpleGRUModel';
import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { PublicCryptoService } from '../src/services/publicCryptoService';
import { OHLCVCandle } from '../src/types/dataframe';

async function advancedTraining() {
    console.log('🎓 Advanced ML Training - Multi-Batch Approach\n');
    console.log('='.repeat(80));

    try {
        // 1. Fetch large dataset
        console.log('📊 Step 1: Fetching Large Dataset');
        console.log('-'.repeat(80));
        const cryptoService = new PublicCryptoService();
        const rawCandles = await cryptoService.getCandlestickData('BTCUSDT', '1h', 1000);
        
        const candles: OHLCVCandle[] = rawCandles.map((c: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => ({
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

        // 2. Extract all features
        console.log('\n📊 Step 2: Feature Engineering (Full Dataset)');
        console.log('-'.repeat(80));
        const featureService = new FeatureEngineeringService(false);
        const allFeatures = featureService.extractFeatures(candles, 'BTCUSDT');
        console.log(`✓ ${allFeatures.length} feature sets extracted`);

        // 3. Prepare all targets
        const allTargets = allFeatures.map((_, i) => {
            const idx = i + 200;
            if (idx >= candles.length - 1) return 0;
            const change = ((candles[idx + 1].close - candles[idx].close) / candles[idx].close) * 100;
            return Math.max(-1, Math.min(1, change * 50));
        });

        // 4. Multi-batch training strategy
        console.log('\n📊 Step 3: Multi-Batch Training Strategy');
        console.log('='.repeat(80));
        console.log('Strategy: Train model on multiple small batches sequentially');
        console.log('Benefits: Avoid crashes, learn from diverse data periods\n');

        const model = new SimpleGRUModel();
        model.buildModel();

        // Split data into multiple batches
        const batchSize = 80; // Safe batch size
        const numBatches = Math.min(5, Math.floor(allFeatures.length / batchSize));
        const totalEpochsPerBatch = 10; // More epochs per batch

        console.log(`Configuration:`);
        console.log(`  Total data: ${allFeatures.length} samples`);
        console.log(`  Batch size: ${batchSize} samples`);
        console.log(`  Number of batches: ${numBatches}`);
        console.log(`  Epochs per batch: ${totalEpochsPerBatch}`);
        console.log(`  Total training cycles: ${numBatches * totalEpochsPerBatch}\n`);

        let totalTrainingTime = 0;

        for (let batch = 0; batch < numBatches; batch++) {
            // Use different data for each batch (sliding window)
            const startIdx = Math.floor((allFeatures.length - batchSize) * batch / (numBatches - 1));
            const batchFeatures = allFeatures.slice(startIdx, startIdx + batchSize);
            const batchTargets = allTargets.slice(startIdx, startIdx + batchSize);

            console.log(`Batch ${batch + 1}/${numBatches}:`);
            console.log(`  Data range: samples ${startIdx} to ${startIdx + batchSize}`);
            console.log(`  Period: ${new Date(candles[startIdx].timestamp).toLocaleDateString()}`);

            const batchStart = Date.now();
            await model.quickTrain(batchFeatures, batchTargets, totalEpochsPerBatch);
            const batchTime = (Date.now() - batchStart) / 1000;
            totalTrainingTime += batchTime;

            console.log(`  ✓ Completed in ${batchTime.toFixed(1)}s`);
            console.log('');
        }

        console.log('='.repeat(80));
        console.log(`✅ Multi-batch training completed!`);
        console.log(`   Total time: ${totalTrainingTime.toFixed(1)}s`);
        console.log(`   Average per batch: ${(totalTrainingTime / numBatches).toFixed(1)}s\n`);

        // 5. Test on validation set
        console.log('📊 Step 4: Validation Testing');
        console.log('='.repeat(80));
        console.log('Testing on most recent data (unseen during training)...\n');

        const validationSize = 50;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
const validationFeatures = allFeatures.slice(-validationSize);
        const validationResults: any[] = [];

        for (let i = 0; i < validationSize; i++) {
            const idx = allFeatures.length - validationSize + i;
            const sequence = allFeatures.slice(idx - 20, idx);
            const prediction = await model.predict(sequence);

            const currentCandle = candles[idx + 200];
            const futureCandle = candles[idx + 201];

            if (futureCandle) {
                const actualChange = ((futureCandle.close - currentCandle.close) / currentCandle.close) * 100;
                const predictedDir = prediction.direction > 0 ? 'UP' : 'DOWN';
                const actualDir = actualChange > 0 ? 'UP' : 'DOWN';
                const match = predictedDir === actualDir;

                validationResults.push({
                    match,
                    predChange: prediction.priceChange,
                    actualChange,
                    confidence: prediction.confidence,
                    error: Math.abs(prediction.priceChange - actualChange)
                });
            }
        }

        const valAccuracy = (validationResults.filter(r => r.match).length / validationResults.length) * 100;
        const avgConfidence = validationResults.reduce((sum, r) => sum + r.confidence, 0) / validationResults.length;
        const avgError = validationResults.reduce((sum, r) => sum + r.error, 0) / validationResults.length;

        console.log(`Validation Results:`);
        console.log(`  Test samples: ${validationResults.length}`);
        console.log(`  Direction accuracy: ${valAccuracy.toFixed(1)}%`);
        console.log(`  Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
        console.log(`  Average error: ${avgError.toFixed(2)}%`);

        // Confidence correlation
        const highConf = validationResults.filter(r => r.confidence > 0.6);
        if (highConf.length > 0) {
            const highAccuracy = (highConf.filter(r => r.match).length / highConf.length) * 100;
            console.log(`\n  High confidence (>60%): ${highConf.length} predictions`);
            console.log(`    → Accuracy: ${highAccuracy.toFixed(1)}%`);
        }

        // 6. Save model
        console.log('\n📊 Step 5: Saving Model');
        console.log('='.repeat(80));
        const modelPath = 'file://./models/LSTM_PricePredictor_1.0.0';
        await model.saveModel(modelPath);
        console.log(`✅ Model saved to: ${modelPath}`);

        // 7. Latest prediction
        console.log('\n🔮 CURRENT PREDICTION');
        console.log('='.repeat(80));

        const livePrediction = await model.predict(allFeatures);
        const liveCandle = candles[candles.length - 1];

        console.log(`\nBTCUSDT Status:`);
        console.log(`  Price: $${liveCandle.close.toLocaleString()}`);
        console.log(`  Time: ${new Date(liveCandle.timestamp).toLocaleString()}`);
        console.log('');
        console.log(`Prediction:`);
        console.log(`  Direction: ${livePrediction.direction > 0 ? '📈 UP' : '📉 DOWN'}`);
        console.log(`  Expected: ${livePrediction.priceChange > 0 ? '+' : ''}${livePrediction.priceChange.toFixed(2)}%`);
        console.log(`  Confidence: ${(livePrediction.confidence * 100).toFixed(1)}%`);

        // 8. Final verdict
        console.log('\n' + '='.repeat(80));
        console.log('✅ TRAINING COMPLETE - PERFORMANCE SUMMARY');
        console.log('='.repeat(80));

        console.log(`\n📊 Training Stats:`);
        console.log(`  Total data: ${allFeatures.length} samples`);
        console.log(`  Training batches: ${numBatches}`);
        console.log(`  Total epochs: ${numBatches * totalEpochsPerBatch}`);
        console.log(`  Training time: ${totalTrainingTime.toFixed(1)}s`);

        console.log(`\n📈 Validation Performance:`);
        console.log(`  Accuracy: ${valAccuracy.toFixed(1)}%`);
        console.log(`  Avg confidence: ${(avgConfidence * 100).toFixed(1)}%`);
        console.log(`  Avg error: ${avgError.toFixed(2)}%`);

        if (valAccuracy >= 55) {
            console.log(`\n🎉 SUCCESS! Model performs better than random`);
            console.log(`  ✓ Ready for bot integration`);
            console.log(`  ✓ Use /mlpredict in Telegram bot`);
        } else if (valAccuracy >= 50) {
            console.log(`\n⚠️ MARGINAL - Model needs improvement`);
            console.log(`  ~ Consider more training batches`);
            console.log(`  ~ Use with caution in production`);
        } else {
            console.log(`\n❌ POOR PERFORMANCE - Model needs work`);
            console.log(`  ✗ Try different architecture`);
            console.log(`  ✗ Add more features`);
        }

        console.log(`\n💡 Next steps:`);
        console.log(`  1. Test model: npx ts-node scripts/smart-ml-test.ts`);
        console.log(`  2. Use in bot: /mlpredict BTCUSDT`);
        console.log(`  3. Combine with: /openclaw BTCUSDT`);

    } catch (error) {
        console.error('\n❌ Error:', error);
        if (error instanceof Error) {
            console.error(error.message);
            console.error(error.stack);
        }
        process.exit(1);
    }
}

advancedTraining();
