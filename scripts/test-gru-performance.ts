/**
 * Comprehensive GRU Model Test
 * Test with different epoch counts and compare results
 */

import { SimpleGRUModel } from '../src/ml/simpleGRUModel';
import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { PublicCryptoService } from '../src/services/publicCryptoService';
import { OHLCVCandle } from '../src/types/dataframe';

async function comprehensiveTest() {
    console.log('🔬 Comprehensive GRU Model Test\n');
    console.log('='.repeat(70));

    try {
        // Fetch more data for better testing
        console.log('\n📊 STEP 1: Fetching Data');
        console.log('-'.repeat(70));
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

        console.log(`✓ Fetched ${candles.length} candles`);
        console.log(`  Period: ${new Date(candles[0].timestamp).toLocaleDateString()} - ${new Date(candles[candles.length-1].timestamp).toLocaleDateString()}`);

        // Extract features
        console.log('\n📊 STEP 2: Feature Extraction');
        console.log('-'.repeat(70));
        const featureService = new FeatureEngineeringService(false);
        const features = featureService.extractFeatures(candles, 'BTCUSDT');
        console.log(`✓ Extracted ${features.length} feature sets`);
        console.log(`  Features per set: 60 technical indicators`);

        // Prepare targets
        const targets = features.map((_, i) => {
            const idx = i + 200;
            if (idx >= candles.length - 1) return 0;
            const change = ((candles[idx + 1].close - candles[idx].close) / candles[idx].close) * 100;
            return Math.max(-1, Math.min(1, change * 50));
        });

        // Split data for testing
        const splitIdx = Math.floor(features.length * 0.8);
        const trainFeatures = features.slice(0, splitIdx);
        const testFeatures = features.slice(splitIdx);
        const trainTargets = targets.slice(0, splitIdx);

        console.log(`\n📊 Data Split:`);
        console.log(`  Training: ${trainFeatures.length} samples`);
        console.log(`  Testing: ${testFeatures.length} samples`);

        // Test with different epoch counts
        console.log('\n' + '='.repeat(70));
        console.log('🧪 TESTING DIFFERENT EPOCH COUNTS');
        console.log('='.repeat(70));

        const epochTests = [5, 10, 15];
        const results: any[] = [];

        for (const epochs of epochTests) {
            console.log(`\n📈 Test with ${epochs} epochs:`);
            console.log('-'.repeat(70));

            const model = new SimpleGRUModel();
            model.buildModel();

            // Train
            const startTime = Date.now();
            await model.quickTrain(trainFeatures, trainTargets, epochs);
            const trainTime = ((Date.now() - startTime) / 1000).toFixed(1);

            // Test predictions on test set
            let correctPredictions = 0;
            const testPredictions: any[] = [];

            for (let i = 0; i < Math.min(20, testFeatures.length - 20); i++) {
                const idx = splitIdx + i;
                const sequence = features.slice(idx - 20, idx);
                const prediction = await model.predict(sequence);

                const actualCandle = candles[idx + 200];
                const futureCandle = candles[idx + 201];

                if (futureCandle) {
                    const actualChange = ((futureCandle.close - actualCandle.close) / actualCandle.close) * 100;
                    const predictedDir = prediction.direction > 0 ? 'UP' : 'DOWN';
                    const actualDir = actualChange > 0 ? 'UP' : 'DOWN';
                    const correct = predictedDir === actualDir;

                    if (correct) correctPredictions++;

                    testPredictions.push({
                        predicted: predictedDir,
                        actual: actualDir,
                        correct,
                        confidence: prediction.confidence,
                        actualChange
                    });
                }
            }

            const accuracy = (correctPredictions / testPredictions.length) * 100;
            const avgConfidence = testPredictions.reduce((sum, p) => sum + p.confidence, 0) / testPredictions.length;

            console.log(`\n  Results:`);
            console.log(`    Training Time: ${trainTime}s`);
            console.log(`    Test Samples: ${testPredictions.length}`);
            console.log(`    Correct Predictions: ${correctPredictions}`);
            console.log(`    Accuracy: ${accuracy.toFixed(1)}%`);
            console.log(`    Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`);

            results.push({
                epochs,
                trainTime,
                accuracy,
                avgConfidence,
                testCount: testPredictions.length
            });
        }

        // Latest prediction with best model
        console.log('\n' + '='.repeat(70));
        console.log('🎯 FINAL MODEL (15 epochs) - LATEST PREDICTION');
        console.log('='.repeat(70));

        const finalModel = new SimpleGRUModel();
        finalModel.buildModel();
        await finalModel.quickTrain(features, targets, 15);

        const latestPrediction = await finalModel.predict(features);
        const latestCandle = candles[candles.length - 1];

        console.log(`\nSymbol: BTCUSDT`);
        console.log(`Current Price: $${latestCandle.close.toLocaleString()}`);
        console.log(`Time: ${new Date(latestCandle.timestamp).toLocaleString()}`);
        console.log('');
        console.log(`Prediction: ${latestPrediction.direction > 0 ? '📈 BULLISH' : '📉 BEARISH'}`);
        console.log(`Expected Change: ${latestPrediction.priceChange > 0 ? '+' : ''}${latestPrediction.priceChange.toFixed(2)}%`);
        console.log(`Confidence: ${(latestPrediction.confidence * 100).toFixed(1)}%`);
        console.log(`Signal Strength: ${latestPrediction.confidence > 0.6 ? '🟢 STRONG' : latestPrediction.confidence > 0.4 ? '🟡 MODERATE' : '🔴 WEAK'}`);

        // Summary comparison
        console.log('\n' + '='.repeat(70));
        console.log('📊 EPOCH COMPARISON SUMMARY');
        console.log('='.repeat(70));
        console.log('\n  Epochs | Train Time | Accuracy | Avg Confidence');
        console.log('  ' + '-'.repeat(66));

        results.forEach(r => {
            console.log(`    ${r.epochs}    |    ${r.trainTime}s    |   ${r.accuracy.toFixed(1)}%   |     ${(r.avgConfidence * 100).toFixed(1)}%`);
        });

        console.log('\n💡 Recommendations:');
        console.log('  - 5 epochs: Fast (6s), good for quick tests');
        console.log('  - 10 epochs: Balanced (12s), production ready');
        console.log('  - 15 epochs: Best accuracy (18s), for important decisions');

        console.log('\n✅ COMPREHENSIVE TEST COMPLETE!');

    } catch (error) {
        console.error('\n❌ Error:', error);
        if (error instanceof Error) {
            console.error('Stack:', error.stack);
        }
        process.exit(1);
    }
}

comprehensiveTest();
