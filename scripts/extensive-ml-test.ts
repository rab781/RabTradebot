/**
 * Extensive GRU Model Testing
 * Test multiple predictions to validate model performance
 */

import { SimpleGRUModel } from '../src/ml/simpleGRUModel';
import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { PublicCryptoService } from '../src/services/publicCryptoService';
import { OHLCVCandle } from '../src/types/dataframe';

async function extensiveTest() {
    console.log('🔬 Extensive GRU Model Testing\n');
    console.log('='.repeat(80));

    try {
        // 1. Fetch sufficient data
        console.log('\n📊 Step 1: Data Collection');
        console.log('-'.repeat(80));
        const cryptoService = new PublicCryptoService();
        const rawCandles = await cryptoService.getCandlestickData('BTCUSDT', '1h', 600);

        const candles: OHLCVCandle[] = rawCandles.map((c: any) => ({
            timestamp: c[0],
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5]),
            date: new Date(c[0])
        }));

        console.log(`✓ Fetched ${candles.length} candles`);
        console.log(`  Date range: ${new Date(candles[0].timestamp).toLocaleDateString()} - ${new Date(candles[candles.length-1].timestamp).toLocaleDateString()}`);
        console.log(`  Current price: $${candles[candles.length-1].close.toLocaleString()}`);

        // 2. Extract features
        console.log('\n📊 Step 2: Feature Engineering');
        console.log('-'.repeat(80));
        const featureService = new FeatureEngineeringService(false);
        const features = featureService.extractFeatures(candles, 'BTCUSDT');
        console.log(`✓ Extracted ${features.length} feature sets (60 indicators each)`);

        // 3. Prepare data
        console.log('\n📊 Step 3: Data Preparation');
        console.log('-'.repeat(80));

        const targets = features.map((_, i) => {
            const idx = i + 200;
            if (idx >= candles.length - 1) return 0;
            const change = ((candles[idx + 1].close - candles[idx].close) / candles[idx].close) * 100;
            return Math.max(-1, Math.min(1, change * 50));
        });

        // Split: 70% train, 30% test
        const splitIdx = Math.floor(features.length * 0.7);
        const trainFeatures = features.slice(0, splitIdx);
        const testFeatures = features.slice(splitIdx);
        const trainTargets = targets.slice(0, splitIdx);

        console.log(`  Training samples: ${trainFeatures.length}`);
        console.log(`  Testing samples: ${testFeatures.length}`);
        console.log(`  Features per sample: 60`);

        // 4. Train model
        console.log('\n📊 Step 4: Model Training');
        console.log('-'.repeat(80));
        const model = new SimpleGRUModel();
        model.buildModel();

        const trainStart = Date.now();
        await model.quickTrain(trainFeatures, trainTargets, 5);
        const trainTime = ((Date.now() - trainStart) / 1000).toFixed(1);
        console.log(`  Total training time: ${trainTime}s`);

        // 5. Test predictions
        console.log('\n📊 Step 5: Testing Predictions (30 tests)');
        console.log('='.repeat(80));

        const testResults: any[] = [];
        const testCount = Math.min(30, testFeatures.length - 20);

        for (let i = 0; i < testCount; i++) {
            const testIdx = splitIdx + i;
            const sequence = features.slice(testIdx - 20, testIdx);
            const prediction = await model.predict(sequence);

            const currentCandle = candles[testIdx + 200];
            const futureCandle = candles[testIdx + 201];

            if (futureCandle) {
                const actualChange = ((futureCandle.close - currentCandle.close) / currentCandle.close) * 100;
                const predictedDir = prediction.direction > 0 ? 'UP' : 'DOWN';
                const actualDir = actualChange > 0 ? 'UP' : 'DOWN';
                const directionMatch = predictedDir === actualDir;

                // Calculate error
                const predChange = prediction.priceChange;
                const error = Math.abs(predChange - actualChange);

                testResults.push({
                    testNum: i + 1,
                    date: new Date(currentCandle.timestamp).toLocaleString(),
                    price: currentCandle.close,
                    predictedDir,
                    actualDir,
                    directionMatch,
                    predictedChange: predChange,
                    actualChange,
                    error,
                    confidence: prediction.confidence
                });

                // Print every 5th test
                if ((i + 1) % 5 === 0 || i < 3) {
                    const icon = directionMatch ? '✅' : '❌';
                    console.log(`\n${icon} Test #${i + 1} | ${new Date(currentCandle.timestamp).toLocaleDateString()}`);
                    console.log(`  Price: $${currentCandle.close.toFixed(2)}`);
                    console.log(`  Predicted: ${predictedDir} ${predChange.toFixed(2)}% (confidence: ${(prediction.confidence * 100).toFixed(1)}%)`);
                    console.log(`  Actual: ${actualDir} ${actualChange.toFixed(2)}%`);
                    console.log(`  Match: ${directionMatch ? 'YES' : 'NO'} | Error: ${error.toFixed(2)}%`);
                }
            }
        }

        // 6. Calculate metrics
        console.log('\n' + '='.repeat(80));
        console.log('📊 PERFORMANCE METRICS');
        console.log('='.repeat(80));

        const directionAccuracy = (testResults.filter(r => r.directionMatch).length / testResults.length) * 100;
        const avgError = testResults.reduce((sum, r) => sum + r.error, 0) / testResults.length;
        const avgConfidence = testResults.reduce((sum, r) => sum + r.confidence, 0) / testResults.length;

        // Confidence brackets
        const highConfidence = testResults.filter(r => r.confidence > 0.6);
        const medConfidence = testResults.filter(r => r.confidence > 0.3 && r.confidence <= 0.6);
        const lowConfidence = testResults.filter(r => r.confidence <= 0.3);

        const highConfAccuracy = highConfidence.length > 0
            ? (highConfidence.filter(r => r.directionMatch).length / highConfidence.length) * 100
            : 0;

        console.log(`\n📈 Overall Performance:`);
        console.log(`  Total Tests: ${testResults.length}`);
        console.log(`  Direction Accuracy: ${directionAccuracy.toFixed(1)}% (${testResults.filter(r => r.directionMatch).length}/${testResults.length} correct)`);
        console.log(`  Average Error: ${avgError.toFixed(2)}%`);
        console.log(`  Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`);

        console.log(`\n🎯 Confidence Analysis:`);
        console.log(`  High (>60%): ${highConfidence.length} tests, ${highConfAccuracy.toFixed(1)}% accuracy`);
        console.log(`  Medium (30-60%): ${medConfidence.length} tests`);
        console.log(`  Low (<30%): ${lowConfidence.length} tests`);

        // Best and worst predictions
        const sortedByAccuracy = [...testResults].sort((a, b) => a.error - b.error);
        const best = sortedByAccuracy.slice(0, 3);
        const worst = sortedByAccuracy.slice(-3).reverse();

        console.log(`\n🏆 Best Predictions (lowest error):`);
        best.forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.date.split(',')[0]}: Error ${r.error.toFixed(2)}%, Predicted ${r.predictedChange.toFixed(2)}%, Actual ${r.actualChange.toFixed(2)}%`);
        });

        console.log(`\n❌ Worst Predictions (highest error):`);
        worst.forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.date.split(',')[0]}: Error ${r.error.toFixed(2)}%, Predicted ${r.predictedChange.toFixed(2)}%, Actual ${r.actualChange.toFixed(2)}%`);
        });

        // 7. Latest live prediction
        console.log('\n' + '='.repeat(80));
        console.log('🔮 LATEST LIVE PREDICTION');
        console.log('='.repeat(80));

        const latestPrediction = await model.predict(features);
        const latestCandle = candles[candles.length - 1];

        console.log(`\nSymbol: BTCUSDT`);
        console.log(`Current Price: $${latestCandle.close.toLocaleString()}`);
        console.log(`Time: ${new Date(latestCandle.timestamp).toLocaleString()}`);
        console.log('');
        console.log(`Prediction: ${latestPrediction.direction > 0 ? '📈 BULLISH' : '📉 BEARISH'}`);
        console.log(`Expected Change: ${latestPrediction.priceChange > 0 ? '+' : ''}${latestPrediction.priceChange.toFixed(2)}%`);
        console.log(`Confidence: ${(latestPrediction.confidence * 100).toFixed(1)}%`);

        const signal = latestPrediction.confidence > 0.6 ? '🟢 STRONG' :
                      latestPrediction.confidence > 0.3 ? '🟡 MODERATE' : '🔴 WEAK';
        console.log(`Signal Strength: ${signal}`);

        if (latestPrediction.confidence > 0.6) {
            const targetPrice = latestCandle.close * (1 + latestPrediction.priceChange / 100);
            console.log(`\n💡 Trading Suggestion:`);
            console.log(`  Action: ${latestPrediction.direction > 0 ? 'LONG' : 'SHORT'}`);
            console.log(`  Target: $${targetPrice.toFixed(2)}`);
            console.log(`  Based on: ${directionAccuracy.toFixed(1)}% historical accuracy`);
        }

        // Summary
        console.log('\n' + '='.repeat(80));
        console.log('✅ TESTING COMPLETE');
        console.log('='.repeat(80));
        console.log(`\n📊 Model Performance Summary:`);
        console.log(`  ✓ Direction Accuracy: ${directionAccuracy.toFixed(1)}%`);
        console.log(`  ✓ Training Time: ${trainTime}s (5 epochs)`);
        console.log(`  ✓ Model Size: 3,713 parameters`);
        console.log(`  ✓ Tests Completed: ${testResults.length}`);
        console.log(`  ✓ High Confidence Accuracy: ${highConfAccuracy.toFixed(1)}%`);

        console.log(`\n💡 Recommendation:`);
        if (directionAccuracy >= 60) {
            console.log(`  🟢 Model performance is GOOD - ready for production use`);
            console.log(`  🎯 Focus on high confidence signals (>60%) for best results`);
        } else if (directionAccuracy >= 50) {
            console.log(`  🟡 Model performance is DECENT - usable but with caution`);
            console.log(`  ⚠️  Combine with other indicators for confirmation`);
        } else {
            console.log(`  🔴 Model needs more training or feature engineering`);
            console.log(`  ⚠️  Consider increasing epochs or getting more data`);
        }

    } catch (error) {
        console.error('\n❌ Error:', error);
        if (error instanceof Error) {
            console.error('Details:', error.message);
            console.error('Stack:', error.stack);
        }
        process.exit(1);
    }
}

extensiveTest();
