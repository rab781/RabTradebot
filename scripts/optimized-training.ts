/**
 * Optimized ML Training Script
 * Fast, stable training for TensorFlow.js pure JS
 */

import { LSTMModelManager } from '../src/ml/lstmModel';
import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { PublicCryptoService } from '../src/services/publicCryptoService';
import { OHLCVCandle } from '../src/types/dataframe';

async function optimizedTraining() {
    console.log('⚡ Optimized ML Training\n');
    console.log('=' .repeat(60));

    const symbol = process.argv[2] || 'BTCUSDT';
    const days = parseInt(process.argv[3]) || 30;

    console.log(`Symbol: ${symbol}`);
    console.log(`History: ${days} days`);
    console.log('');

    try {
        // 1. Fetch data (optimized amount)
        console.log('1️⃣ Fetching market data...');
        const cryptoService = new PublicCryptoService();
        const rawCandles = await cryptoService.getCandlestickData(symbol, '1h', days * 24);

        const candles: OHLCVCandle[] = rawCandles.map((c: unknown) => ({
            timestamp: c[0],
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5]),
            date: new Date(c[0])
        }));

        console.log(`   ✓ Fetched ${candles.length} candles\n`);

        // 2. Extract features (disable database for speed)
        console.log('2️⃣ Extracting features...');
        const featureService = new FeatureEngineeringService(false);
        const features = featureService.extractFeatures(candles, symbol);
        console.log(`   ✓ ${features.length} feature sets ready\n`);

        if (features.length < 100) {
            throw new Error('Not enough data. Need at least 300 candles for reliable training.');
        }

        // 3. Build lightweight model
        console.log('3️⃣ Building model...');
        const mlModel = new LSTMModelManager('OptimizedLSTM', '2.0.0', {
            lstmUnits: [32, 16], // 2-layer only for speed
            epochs: 10, // Quick training
            batchSize: 8, // Very small batches
            dropout: 0.2,
            learningRate: 0.001
        });

        mlModel.buildModel();
        console.log('   ✓ Model built\n');

        // 4. Prepare training data
        console.log('4️⃣ Preparing training data...');

        // Use recent data only (last 200 features)
        const recentFeatures = features.slice(-200);

        const targets = recentFeatures.map((_, i) => {
            const candleIdx = candles.length - recentFeatures.length + i;
            if (candleIdx >= candles.length - 1) return 0;

            const currentPrice = candles[candleIdx].close;
            const futurePrice = candles[candleIdx + 1].close;
            const priceChange = ((futurePrice - currentPrice) / currentPrice) * 100;

            // Normalize to [-1, 1]
            return Math.max(-1, Math.min(1, priceChange * 50));
        });

        console.log(`   ✓ ${recentFeatures.length} training samples\n`);

        // 5. Train model (fast mode)
        console.log('5️⃣ Training (10 epochs, no validation for speed)...');
        console.log('-'.repeat(60));

        const startTime = Date.now();

        await mlModel.train(recentFeatures, targets, 0); // 0 = no validation split

        const trainingTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log('-'.repeat(60));
        console.log(`   ✓ Training completed in ${trainingTime}s\n`);

        // 6. Test predictions
        console.log('6️⃣ Testing predictions...');
        console.log('='.repeat(60));

        // Test on last 3 sequences
        for (let i = 0; i < 3; i++) {
            const idx = features.length - 25 - i * 10;
            if (idx < 20) break;

            const sequence = features.slice(idx - 20, idx);
            const prediction = await mlModel.predict(sequence);

            const candle = candles[idx];
            const futureCandle = candles[idx + 1];

            if (futureCandle) {
                const actualChange = ((futureCandle.close - candle.close) / candle.close) * 100;
                const predMatch = (prediction.direction > 0 && actualChange > 0) ||
                                 (prediction.direction < 0 && actualChange < 0);

                console.log(`\nTest ${i + 1}:`);
                console.log(`  Time: ${new Date(candle.timestamp).toLocaleString()}`);
                console.log(`  Price: $${candle.close.toFixed(2)}`);
                console.log(`  Predicted: ${prediction.direction > 0 ? '📈 UP' : '📉 DOWN'} (${prediction.priceChange.toFixed(2)}%)`);
                console.log(`  Actual: ${actualChange > 0 ? '📈 UP' : '📉 DOWN'} (${actualChange.toFixed(2)}%)`);
                console.log(`  Match: ${predMatch ? '✅ YES' : '❌ NO'}`);
            }
        }

        // 7. Latest prediction
        console.log('\n' + '='.repeat(60));
        console.log('🔮 LATEST PREDICTION:');
        console.log('='.repeat(60));

        const latestPrediction = await mlModel.predict(features);
        const latestCandle = candles[candles.length - 1];

        console.log(`\nSymbol: ${symbol}`);
        console.log(`Current Price: $${latestCandle.close.toLocaleString()}`);
        console.log(`\nPrediction: ${latestPrediction.direction > 0 ? '📈 BULLISH' : '📉 BEARISH'}`);
        console.log(`Expected Change: ${latestPrediction.priceChange > 0 ? '+' : ''}${latestPrediction.priceChange.toFixed(2)}%`);
        console.log(`Confidence: ${(latestPrediction.confidence * 100).toFixed(1)}%`);
        console.log(`Signal: ${latestPrediction.confidence > 0.6 ? '🟢 STRONG' : latestPrediction.confidence > 0.3 ? '🟡 MODERATE' : '🔴 WEAK'}`);

        console.log('\n✅ Training & Testing Complete!');
        console.log('\n📊 Performance Summary:');
        console.log(`   Training Time: ${trainingTime}s`);
        console.log(`   Model Size: Lightweight (2-layer LSTM)`);
        console.log(`   Total Features: 60 technical indicators`);
        console.log(`   Sequence Length: 20 timesteps`);

    } catch (error) {
        console.error('\n❌ Error:', error);
        if (error instanceof Error) {
            console.error('Details:', error.message);
        }
        process.exit(1);
    }
}

// Run
optimizedTraining();
