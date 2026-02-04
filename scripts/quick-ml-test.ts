/**
 * Quick ML Prediction Test
 * Simplified test untuk debug ML model
 */

import { LSTMModelManager } from '../src/ml/lstmModel';
import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { PublicCryptoService } from '../src/services/publicCryptoService';
import { OHLCVCandle } from '../src/types/dataframe';

async function quickTest() {
    console.log('🧪 Quick ML Test\n');

    try {
        // 1. Fetch data
        console.log('1. Fetching BTCUSDT data...');
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
        
        console.log(`✓ Fetched ${candles.length} candles\n`);

        // 2. Extract features
        console.log('2. Extracting features...');
        const featureService = new FeatureEngineeringService(false); // No database
        const features = featureService.extractFeatures(candles, 'BTCUSDT');
        console.log(`✓ Generated ${features.length} feature sets\n`);

        // 3. Build small model
        console.log('3. Building lightweight LSTM...');
        const mlModel = new LSTMModelManager('QuickTest', '1.0.0', {
            lstmUnits: [32, 16, 8], // Much smaller
            epochs: 5, // Just 5 epochs
            batchSize: 16,
            dropout: 0.2,
            learningRate: 0.001
        });
        
        mlModel.buildModel();
        console.log('✓ Model built\n');

        // 4. Prepare mini training set
        console.log('4. Preparing training data...');
        const trainSize = Math.min(100, Math.floor(features.length * 0.7));
        const trainFeatures = features.slice(0, trainSize);
        
        const trainTargets = trainFeatures.map((_, i) => {
            const candleIdx = i + 200;
            if (candleIdx >= candles.length - 1) return 0;
            const change = ((candles[candleIdx + 1].close - candles[candleIdx].close) / candles[candleIdx].close) * 100;
            return Math.max(-1, Math.min(1, change * 50));
        });
        
        console.log(`✓ Training samples: ${trainSize}\n`);

        // 5. Quick training
        console.log('5. Training (5 epochs)...');
        await mlModel.train(trainFeatures, trainTargets, 0.2);
        console.log('✓ Training done\n');

        // 6. Test prediction
        console.log('6. Testing prediction...');
        const testSequence = features.slice(-20);
        const prediction = await mlModel.predict(testSequence);
        
        const latestPrice = candles[candles.length - 1].close;
        console.log(`\n📊 PREDICTION RESULT:`);
        console.log(`Current Price: $${latestPrice.toFixed(2)}`);
        console.log(`Direction: ${prediction.direction > 0 ? '📈 UP' : '📉 DOWN'}`);
        console.log(`Expected Change: ${prediction.priceChange.toFixed(2)}%`);
        console.log(`Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
        console.log(`\n✅ ML Prediction Test PASSED!`);

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        if (error instanceof Error) {
            console.error('Stack:', error.stack);
        }
    }
}

quickTest();
