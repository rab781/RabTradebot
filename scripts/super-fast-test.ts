/**
 * Super Fast Training Test
 * Uses lightweight GRU model for quick results
 */

import { SimpleGRUModel } from '../src/ml/simpleGRUModel';
import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { PublicCryptoService } from '../src/services/publicCryptoService';
import { OHLCVCandle } from '../src/types/dataframe';

async function superFastTest() {
    console.log('⚡ Super Fast ML Training Test\n');

    try {
        // Fetch minimal data
        console.log('1. Fetching data...');
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

        console.log(`   ✓ ${candles.length} candles\n`);

        // Extract features
        console.log('2. Extracting features...');
        const featureService = new FeatureEngineeringService(false);
        const features = featureService.extractFeatures(candles, 'BTCUSDT');
        console.log(`   ✓ ${features.length} features\n`);

        // Prepare targets
        console.log('3. Preparing targets...');
        const targets = features.map((_, i) => {
            const idx = i + 200;
            if (idx >= candles.length - 1) return 0;
            const change = ((candles[idx + 1].close - candles[idx].close) / candles[idx].close) * 100;
            return Math.max(-1, Math.min(1, change * 50));
        });
        console.log(`   ✓ ${targets.length} targets\n`);

        // Build and train
        console.log('4. Building GRU model...');
        const model = new SimpleGRUModel();
        model.buildModel();
        console.log('');

        console.log('5. Training...');
        await model.quickTrain(features, targets);
        console.log('');

        // Test prediction
        console.log('6. Testing prediction...');
        const prediction = await model.predict(features);
        const latestPrice = candles[candles.length - 1].close;

        console.log('\n📊 RESULT:');
        console.log(`   Price: $${latestPrice.toFixed(2)}`);
        console.log(`   Direction: ${prediction.direction > 0 ? '📈 UP' : '📉 DOWN'}`);
        console.log(`   Change: ${prediction.priceChange.toFixed(2)}%`);
        console.log(`   Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);

        console.log('\n✅ SUPER FAST TEST COMPLETE!');

    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    }
}

superFastTest();
