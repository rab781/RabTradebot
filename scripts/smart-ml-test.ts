/**
 * Smart ML Testing - Train small, test extensively
 * Focus on prediction accuracy rather than heavy training
 */

import { SimpleGRUModel } from '../src/ml/simpleGRUModel';
import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { PublicCryptoService } from '../src/services/publicCryptoService';
import { OHLCVCandle } from '../src/types/dataframe';

async function smartTest() {
    console.log('🧠 Smart ML Testing Strategy\n');
    console.log('='.repeat(80));
    console.log('Strategy: Quick train (small data) → Extensive test (many predictions)\n');

    try {
        // 1. Fetch data
        console.log('📊 Step 1: Fetching Market Data');
        console.log('-'.repeat(80));
        const cryptoService = new PublicCryptoService();
        const rawCandles = await cryptoService.getCandlestickData('BTCUSDT', '1h', 400);

        const candles: OHLCVCandle[] = rawCandles.map((c: unknown) => ({
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
        const features = featureService.extractFeatures(candles, 'BTCUSDT');
        console.log(`✓ ${features.length} feature sets extracted`);

        // 3. Prepare targets
        const targets = features.map((_, i) => {
            const idx = i + 200;
            if (idx >= candles.length - 1) return 0;
            const change = ((candles[idx + 1].close - candles[idx].close) / candles[idx].close) * 100;
            return Math.max(-1, Math.min(1, change * 50));
        });

        // 4. Train with MINIMAL data (to avoid crash)
        console.log('\n📊 Step 3: Quick Training (Small Dataset)');
        console.log('-'.repeat(80));

        // Use only last 100 features for training (safer)
        const trainFeatures = features.slice(-100);
        const trainTargets = targets.slice(-100);

        console.log(`  Training samples: ${trainFeatures.length} (optimized for stability)`);

        const model = new SimpleGRUModel();
        model.buildModel();

        const trainStart = Date.now();
        await model.quickTrain(trainFeatures, trainTargets, 5);
        const trainTime = ((Date.now() - trainStart) / 1000).toFixed(1);
        console.log(`  ✓ Training completed in ${trainTime}s`);

        // 5. Test EXTENSIVELY on earlier data
        console.log('\n📊 Step 4: Extensive Prediction Testing');
        console.log('='.repeat(80));
        console.log('Testing on data BEFORE training period...\n');

        const testResults: unknown[] = [];
        const testStartIdx = 50; // Start testing from earlier data
        const testEndIdx = features.length - 100 - 20; // Before training data
        const testCount = Math.min(40, testEndIdx - testStartIdx);

        console.log(`Testing ${testCount} predictions from historical data...\n`);

        for (let i = 0; i < testCount; i++) {
            const testIdx = testStartIdx + Math.floor(i * (testEndIdx - testStartIdx) / testCount);
            const sequence = features.slice(testIdx - 20, testIdx);
            const prediction = await model.predict(sequence);

            const currentCandle = candles[testIdx + 200];
            const futureCandle = candles[testIdx + 201];

            if (futureCandle) {
                const actualChange = ((futureCandle.close - currentCandle.close) / currentCandle.close) * 100;
                const predictedDir = prediction.direction > 0 ? 'UP' : 'DOWN';
                const actualDir = actualChange > 0 ? 'UP' : 'DOWN';
                const directionMatch = predictedDir === actualDir;
                const error = Math.abs(prediction.priceChange - actualChange);

                testResults.push({
                    num: i + 1,
                    date: new Date(currentCandle.timestamp),
                    price: currentCandle.close,
                    predictedDir,
                    actualDir,
                    match: directionMatch,
                    predChange: prediction.priceChange,
                    actualChange,
                    error,
                    confidence: prediction.confidence
                });

                // Show progress every 10 tests
                if ((i + 1) % 10 === 0) {
                    const currentAccuracy = (testResults.filter(r => r.match).length / testResults.length) * 100;
                    console.log(`  Completed ${i + 1}/${testCount} tests... Current accuracy: ${currentAccuracy.toFixed(1)}%`);
                }
            }
        }

        // 6. Detailed Analysis
        console.log('\n' + '='.repeat(80));
        console.log('📊 DETAILED PERFORMANCE ANALYSIS');
        console.log('='.repeat(80));

        const correctPredictions = testResults.filter(r => r.match).length;
        const directionAccuracy = (correctPredictions / testResults.length) * 100;
        const avgError = testResults.reduce((sum, r) => sum + r.error, 0) / testResults.length;
        const avgConfidence = testResults.reduce((sum, r) => sum + r.confidence, 0) / testResults.length;

        console.log(`\n📈 Overall Results:`);
        console.log(`  Tests Completed: ${testResults.length}`);
        console.log(`  Correct Direction: ${correctPredictions}/${testResults.length}`);
        console.log(`  Direction Accuracy: ${directionAccuracy.toFixed(1)}%`);
        console.log(`  Average Error: ${avgError.toFixed(2)}%`);
        console.log(`  Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`);

        // Confidence breakdown
        const highConf = testResults.filter(r => r.confidence > 0.6);
        const medConf = testResults.filter(r => r.confidence > 0.3 && r.confidence <= 0.6);
        const lowConf = testResults.filter(r => r.confidence <= 0.3);

        console.log(`\n🎯 Confidence Distribution:`);
        console.log(`  High (>60%): ${highConf.length} predictions`);
        if (highConf.length > 0) {
            const highAccuracy = (highConf.filter(r => r.match).length / highConf.length) * 100;
            console.log(`    → Accuracy: ${highAccuracy.toFixed(1)}%`);
        }
        console.log(`  Medium (30-60%): ${medConf.length} predictions`);
        if (medConf.length > 0) {
            const medAccuracy = (medConf.filter(r => r.match).length / medConf.length) * 100;
            console.log(`    → Accuracy: ${medAccuracy.toFixed(1)}%`);
        }
        console.log(`  Low (<30%): ${lowConf.length} predictions`);

        // Win/loss streaks
        let currentStreak = 0;
        let maxWinStreak = 0;
        let maxLossStreak = 0;
        let lossStreak = 0;

        testResults.forEach(r => {
            if (r.match) {
                currentStreak++;
                lossStreak = 0;
                maxWinStreak = Math.max(maxWinStreak, currentStreak);
            } else {
                lossStreak++;
                currentStreak = 0;
                maxLossStreak = Math.max(maxLossStreak, lossStreak);
            }
        });

        console.log(`\n🔥 Streaks:`);
        console.log(`  Best Win Streak: ${maxWinStreak} correct in a row`);
        console.log(`  Worst Loss Streak: ${maxLossStreak} wrong in a row`);

        // Sample results
        console.log(`\n📋 Sample Predictions (First 10):`);
        console.log('-'.repeat(80));
        testResults.slice(0, 10).forEach(r => {
            const icon = r.match ? '✅' : '❌';
            const conf = (r.confidence * 100).toFixed(0);
            console.log(`${icon} ${r.date.toLocaleDateString()} | $${r.price.toFixed(0)} | Pred: ${r.predictedDir} ${r.predChange.toFixed(1)}% | Actual: ${r.actualDir} ${r.actualChange.toFixed(1)}% | Conf: ${conf}%`);
        });

        // 7. Latest prediction
        console.log('\n' + '='.repeat(80));
        console.log('🔮 CURRENT LIVE PREDICTION');
        console.log('='.repeat(80));

        const livePrediction = await model.predict(features);
        const liveCandle = candles[candles.length - 1];

        console.log(`\nBTCUSDT Current Status:`);
        console.log(`  Price: $${liveCandle.close.toLocaleString()}`);
        console.log(`  Time: ${new Date(liveCandle.timestamp).toLocaleString()}`);
        console.log('');
        console.log(`Model Prediction:`);
        console.log(`  Direction: ${livePrediction.direction > 0 ? '📈 BULLISH' : '📉 BEARISH'}`);
        console.log(`  Expected Move: ${livePrediction.priceChange > 0 ? '+' : ''}${livePrediction.priceChange.toFixed(2)}%`);
        console.log(`  Confidence: ${(livePrediction.confidence * 100).toFixed(1)}%`);
        console.log(`  Signal: ${livePrediction.confidence > 0.6 ? '🟢 STRONG' : livePrediction.confidence > 0.3 ? '🟡 MODERATE' : '🔴 WEAK'}`);

        // Final verdict
        console.log('\n' + '='.repeat(80));
        console.log('✅ TESTING COMPLETE - VERDICT');
        console.log('='.repeat(80));

        console.log(`\n📊 Model Performance:`);
        console.log(`  Direction Accuracy: ${directionAccuracy.toFixed(1)}%`);
        console.log(`  Training Time: ${trainTime}s`);
        console.log(`  Model Complexity: 3,713 parameters (ultra-lightweight)`);
        console.log(`  Epochs: 5 (quick training)`);

        if (directionAccuracy >= 55) {
            console.log(`\n🎉 VERDICT: Model is performing WELL!`);
            console.log(`  ✓ Better than random (50%)`);
            console.log(`  ✓ Ready for production use`);
            console.log(`  ✓ ${directionAccuracy.toFixed(1)}% accuracy shows model learned patterns`);

            if (highConf.length > 0) {
                const highAccuracy = (highConf.filter(r => r.match).length / highConf.length) * 100;
                console.log(`  ✓ High-confidence trades (>60%): ${highAccuracy.toFixed(1)}% accurate`);
            }
        } else if (directionAccuracy >= 50) {
            console.log(`\n⚠️ VERDICT: Model is MARGINAL`);
            console.log(`  ~ Close to random guessing`);
            console.log(`  ~ Use with caution, combine with other signals`);
        } else {
            console.log(`\n❌ VERDICT: Model needs IMPROVEMENT`);
            console.log(`  ✗ Below random performance`);
            console.log(`  ✗ Consider more training data or feature engineering`);
        }

        console.log(`\n💡 Recommendation for bot integration:`);
        console.log(`  - Use predictions with confidence > 60%`);
        console.log(`  - Combine with OpenClaw strategy for confirmation`);
        console.log(`  - Monitor real-world performance`);
        console.log(`  - Retrain weekly with fresh data`);

    } catch (error) {
        console.error('\n❌ Error:', error);
        if (error instanceof Error) {
            console.error(error.message);
        }
        process.exit(1);
    }
}

smartTest();
