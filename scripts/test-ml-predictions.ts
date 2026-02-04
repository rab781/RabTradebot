/**
 * Test ML Prediction Functionality
 * Tests LSTM model predictions with real market data
 */

import { LSTMModelManager } from '../src/ml/lstmModel';
import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { DataManager } from '../src/services/dataManager';
import { PublicCryptoService } from '../src/services/publicCryptoService';
import { OHLCVCandle } from '../src/types/dataframe';

async function testMLPredictions() {
    console.log('🧪 Starting ML Prediction Tests...\n');

    const symbol = process.argv[2] || 'BTCUSDT';
    const lookback = parseInt(process.argv[3]) || 30;

    try {
        // 1. Initialize services
        console.log('1️⃣ Initializing services...');
        const cryptoService = new PublicCryptoService();
        const featureService = new FeatureEngineeringService();
        const mlModel = new LSTMModelManager();

        // 2. Fetch recent data
        console.log(`2️⃣ Fetching ${lookback} days of data for ${symbol}...`);
        const dataManager = new DataManager();
        const rawCandles = await cryptoService.getCandlestickData(symbol, '1h', lookback * 24);

        // Convert to OHLCVCandle format
        const candles: OHLCVCandle[] = rawCandles.map((c: any) => ({
            timestamp: c[0],
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5]),
            date: new Date(c[0])
        }));

        console.log(`   ✓ Fetched ${candles.length} candles`);

        if (candles.length < 100) {
            throw new Error(`Not enough data. Need at least 100 candles, got ${candles.length}`);
        }

        // 3. Generate features
        console.log('3️⃣ Generating features...');
        const features = featureService.extractFeatures(candles, symbol);
        console.log(`   ✓ Generated ${features.length} feature sets`);
        console.log(`   ✓ Features per set: ${Object.keys(features[0]).length}`);
        console.log(`   ✓ Features per set: ${Object.keys(features[0]).length}`);

        // 4. Build and configure model
        console.log('4️⃣ Building LSTM model...');
        const featureCount = Object.keys(features[0]).length - 2; // Exclude timestamp and symbol
        mlModel.buildModel();
        console.log(`   ✓ Model built successfully (${featureCount} features)`);

        // 5. Prepare training data (use 80% for training)
        console.log('5️⃣ Preparing training data...');
        const splitIndex = Math.floor(features.length * 0.8);
        const trainFeatures = features.slice(0, splitIndex);
        const testFeatures = features.slice(splitIndex);

        // Calculate price changes as targets
        const trainTargets = trainFeatures.map((_: any, i: number) => {
            const candleIndex = i + 200; // Features start from index 200
            if (candleIndex >= candles.length - 1) return 0;
            const currentPrice = candles[candleIndex].close;
            const futurePrice = candles[candleIndex + 1].close;
            const priceChange = ((futurePrice - currentPrice) / currentPrice) * 100;
            return Math.max(-1, Math.min(1, priceChange * 50)); // Normalize to [-1, 1]
        });

        console.log(`   ✓ Training samples: ${trainFeatures.length}`);
        console.log(`   ✓ Test samples: ${testFeatures.length}`);

        // 6. Train model (quick training - 10 epochs)
        console.log('6️⃣ Training model (10 epochs)...');
        const startTime = Date.now();
        await mlModel.train(trainFeatures, trainTargets, 10);
        const trainingTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`   ✓ Training completed in ${trainingTime}s`);

        // 7. Test predictions
        console.log('\n7️⃣ Testing Predictions...');
        console.log('═══════════════════════════════════════════════════════════');

        const predictions: any[] = [];
        let correctPredictions = 0;
        let totalPredictions = 0;

        // Test on last 10 sequences
        const testCount = Math.min(10, testFeatures.length - 20);
        for (let i = 0; i < testCount; i++) {
            const idx = splitIndex + i;
            const sequenceEnd = idx + 20;

            if (sequenceEnd >= features.length) break;

            const sequence = features.slice(idx, sequenceEnd);
            const prediction = await mlModel.predict(sequence);

            // Get actual price change
            const actualCandle = candles[sequenceEnd];
            const futureCandle = candles[sequenceEnd + 1];

            if (!futureCandle) continue;

            const actualChange = ((futureCandle.close - actualCandle.close) / actualCandle.close) * 100;
            const predictedDirection = prediction.direction > 0 ? 'UP' : 'DOWN';
            const actualDirection = actualChange > 0 ? 'UP' : 'DOWN';
            const correct = predictedDirection === actualDirection;

            if (correct) correctPredictions++;
            totalPredictions++;

            predictions.push({
                candle: sequenceEnd,
                price: actualCandle.close,
                predicted: prediction.direction,
                predictedChange: prediction.priceChange,
                actual: actualChange,
                confidence: prediction.confidence,
                correct
            });

            const status = correct ? '✅' : '❌';
            console.log(`\nTest ${i + 1}/${testCount} ${status}`);
            console.log(`  Time: ${new Date(actualCandle.timestamp).toLocaleString()}`);
            console.log(`  Price: $${actualCandle.close.toFixed(2)}`);
            console.log(`  Predicted: ${predictedDirection} (${prediction.priceChange.toFixed(2)}%)`);
            console.log(`  Actual: ${actualDirection} (${actualChange.toFixed(2)}%)`);
            console.log(`  Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
            console.log(`  Direction Match: ${correct ? 'YES' : 'NO'}`);
        }

        // 8. Calculate metrics
        console.log('\n8️⃣ Performance Metrics:');
        console.log('═══════════════════════════════════════════════════════════');

        const accuracy = (correctPredictions / totalPredictions) * 100;
        const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;

        // Calculate MAE for price changes
        const mae = predictions.reduce((sum, p) => {
            return sum + Math.abs(p.predictedChange - p.actual);
        }, 0) / predictions.length;

        console.log(`Total Predictions: ${totalPredictions}`);
        console.log(`Correct Direction: ${correctPredictions}`);
        console.log(`Accuracy: ${accuracy.toFixed(2)}%`);
        console.log(`Average Confidence: ${(avgConfidence * 100).toFixed(2)}%`);
        console.log(`Mean Absolute Error: ${mae.toFixed(2)}%`);

        // 9. Test latest prediction
        console.log('\n9️⃣ Latest Live Prediction:');
        console.log('═══════════════════════════════════════════════════════════');

        const latestSequence = features.slice(-20);
        const latestPrediction = await mlModel.predict(latestSequence);
        const latestCandle = candles[candles.length - 1];

        console.log(`Symbol: ${symbol}`);
        console.log(`Current Price: $${latestCandle.close.toFixed(2)}`);
        console.log(`Prediction: ${latestPrediction.direction > 0 ? '📈 BULLISH' : '📉 BEARISH'}`);
        console.log(`Expected Change: ${latestPrediction.priceChange.toFixed(2)}%`);
        console.log(`Confidence: ${(latestPrediction.confidence * 100).toFixed(1)}%`);
        console.log(`Signal Strength: ${latestPrediction.confidence > 0.7 ? 'STRONG' : latestPrediction.confidence > 0.4 ? 'MODERATE' : 'WEAK'}`);

        // 10. Trading recommendation
        console.log('\n🎯 Trading Recommendation:');
        if (latestPrediction.confidence > 0.6) {
            if (latestPrediction.direction > 0) {
                console.log('✅ Consider LONG position');
                console.log(`   Target: $${(latestCandle.close * (1 + latestPrediction.priceChange / 100)).toFixed(2)}`);
            } else {
                console.log('✅ Consider SHORT position');
                console.log(`   Target: $${(latestCandle.close * (1 + latestPrediction.priceChange / 100)).toFixed(2)}`);
            }
        } else {
            console.log('⏸️ Low confidence - wait for better signal');
        }

        console.log('\n✅ ML Prediction Test Complete!');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        throw error;
    }
}

// Run test
testMLPredictions().catch(console.error);
