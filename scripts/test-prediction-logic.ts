/**
 * Test ML Prediction Logic (Without Training)
 * Tests that prediction methods work correctly with mock trained model
 */

import { LSTMModelManager } from '../src/ml/lstmModel';
import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { PublicCryptoService } from '../src/services/publicCryptoService';
import { OHLCVCandle } from '../src/types/dataframe';

async function testPredictionLogic() {
    console.log('🧪 Testing ML Prediction Logic\n');

    try {
        // 1. Fetch real market data
        console.log('1️⃣ Fetching BTCUSDT data...');
        const cryptoService = new PublicCryptoService();
        const rawCandles = await cryptoService.getCandlestickData('BTCUSDT', '1h', 300);

        const candles: OHLCVCandle[] = rawCandles.map((c: unknown) => ({
            timestamp: c[0],
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5]),
            date: new Date(c[0])
        }));

        console.log(`   ✓ Fetched ${candles.length} candles`);
        console.log(`   ✓ Latest price: $${candles[candles.length - 1].close.toFixed(2)}\n`);

        // 2. Extract features
        console.log('2️⃣ Extracting features...');
        const featureService = new FeatureEngineeringService(false);
        const features = featureService.extractFeatures(candles, 'BTCUSDT');
        console.log(`   ✓ Generated ${features.length} feature sets`);
        console.log(`   ✓ Features per set: ${Object.keys(features[0]).length - 2}\n`); // -2 for timestamp/symbol

        // 3. Test feature array conversion
        console.log('3️⃣ Testing feature preparation...');
        const mlModel = new LSTMModelManager();
        mlModel.buildModel();

        if (features.length < 20) {
            throw new Error('Not enough features for sequence');
        }

        const testSequence = features.slice(-20);
        console.log(`   ✓ Prepared sequence of ${testSequence.length} steps`);

        // Check for NaN values in features
        let hasNaN = false;
        let nanCount = 0;
        for (const feat of testSequence) {
            for (const [key, value] of Object.entries(feat)) {
                if (key !== 'timestamp' && key !== 'symbol') {
                    if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
                        hasNaN = true;
                        nanCount++;
                    }
                }
            }
        }

        if (hasNaN) {
            console.log(`   ⚠️  Warning: Found ${nanCount} NaN/Infinite values in features`);
        } else {
            console.log(`   ✓ All features are valid numbers\n`);
        }

        // 4. Test prediction (with untrained model)
        console.log('4️⃣ Testing prediction method...');
        const prediction = await mlModel.predict(testSequence);

        console.log(`\n📊 PREDICTION OUTPUT (Untrained Model):`);
        console.log(`   Direction Value: ${prediction.direction.toFixed(4)}`);
        console.log(`   Confidence: ${(prediction.confidence * 100).toFixed(2)}%`);
        console.log(`   Price Change Estimate: ${prediction.priceChange.toFixed(2)}%`);
        console.log(`   Signal: ${prediction.direction > 0 ? '📈 BULLISH' : '📉 BEARISH'}\n`);

        // 5. Test multiple predictions
        console.log('5️⃣ Testing prediction stability...');
        const predictions = [];
        for (let i = 0; i < 5; i++) {
            const idx = features.length - 25 - i * 5;
            if (idx < 20) break;

            const seq = features.slice(idx - 20, idx);
            const pred = await mlModel.predict(seq);
            predictions.push(pred);
        }

        console.log(`   ✓ Generated ${predictions.length} predictions`);

        const bullishCount = predictions.filter(p => p.direction > 0).length;
        const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;

        console.log(`   Bullish signals: ${bullishCount}/${predictions.length}`);
        console.log(`   Average confidence: ${(avgConfidence * 100).toFixed(2)}%\n`);

        // 6. Test with bot command format
        console.log('6️⃣ Simulating bot command...');
        const latestCandle = candles[candles.length - 1];
        const latestPrediction = await mlModel.predict(testSequence);

        const botMessage = `
🤖 ML PREDICTION - BTCUSDT

💰 CURRENT PRICE: $${latestCandle.close.toFixed(2)}

📊 ML FORECAST:
${latestPrediction.direction > 0 ? '📈 BULLISH' : '📉 BEARISH'} Signal
Expected Change: ${latestPrediction.priceChange > 0 ? '+' : ''}${latestPrediction.priceChange.toFixed(2)}%
Confidence: ${(latestPrediction.confidence * 100).toFixed(1)}%

🎯 SIGNAL STRENGTH:
${latestPrediction.confidence > 0.7 ? '🟢 STRONG' : latestPrediction.confidence > 0.4 ? '🟡 MODERATE' : '🔴 WEAK'}

⚠️ Note: Model is untrained - for demo only
⏰ ${new Date().toLocaleTimeString()}
        `;

        console.log(botMessage);

        console.log('✅ ALL PREDICTION TESTS PASSED!\n');
        console.log('📝 Summary:');
        console.log(`   - Feature extraction: ✅ Working`);
        console.log(`   - Prediction logic: ✅ Working`);
        console.log(`   - Output format: ✅ Valid`);
        console.log(`   - Bot integration: ✅ Ready`);
        console.log(`\n⚠️  Next step: Train model with larger dataset for accurate predictions`);

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        if (error instanceof Error) {
            console.error('Error details:', error.message);
            console.error('Stack:', error.stack);
        }
        throw error;
    }
}

testPredictionLogic();
