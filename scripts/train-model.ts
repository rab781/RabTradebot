/**
 * Train LSTM Model Script
 * Downloads historical data and trains the LSTM price prediction model
 */

import { DataManager } from '../src/services/dataManager';
import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { LSTMModelManager } from '../src/ml/lstmModel';


async function trainModel() {
    console.log('🤖 LSTM Model Training Script\n');
    console.log('='.repeat(60));

    const symbol = process.argv[2] || 'BTCUSDT';
    const days = parseInt(process.argv[3]) || 180;

    console.log(`📊 Symbol: ${symbol}`);
    console.log(`📅 Training Period: ${days} days`);
    console.log('='.repeat(60) + '\n');

    try {
        // Step 1: Download historical data
        console.log('📥 Step 1/5: Downloading historical data...');
        const dataManager = new DataManager();
        const data = await dataManager.getRecentData(symbol, '1h', days * 24);
        console.log(`   ✅ Downloaded ${data.length} candles`);

        // Step 2: Extract features
        console.log('\n🔧 Step 2/5: Extracting features...');
        const featureService = new FeatureEngineeringService(true);
        const features = featureService.extractFeatures(data, symbol);
        console.log(`   ✅ Extracted ${features.length} feature sets`);

        // Step 3: Prepare targets (future price changes)
        console.log('\n🎯 Step 3/5: Preparing training targets...');
        const targets: number[] = [];

        for (let i = 0; i < features.length - 1; i++) {
            // Target: Normalized price change for next candle
            const currentPrice = data[i + 200].close;
            const nextPrice = data[i + 201].close;
            const priceChange = (nextPrice - currentPrice) / currentPrice;

            // Normalize to [-1, 1] range (assuming max 2% change)
            const normalizedChange = Math.max(-1, Math.min(1, priceChange * 50));
            targets.push(normalizedChange);
        }

        // Add last target (use same as previous)
        targets.push(targets[targets.length - 1]);

        console.log(`   ✅ Prepared ${targets.length} targets`);
        console.log(`   📊 Target stats:`);
        console.log(`      Mean: ${(targets.reduce((a, b) => a + b, 0) / targets.length).toFixed(6)}`);
        console.log(`      Min: ${Math.min(...targets).toFixed(6)}`);
        console.log(`      Max: ${Math.max(...targets).toFixed(6)}`);

        // Check for NaN in targets
        const nanCount = targets.filter(t => !isFinite(t) || isNaN(t)).length;
        if (nanCount > 0) {
            console.warn(`   ⚠️  Warning: ${nanCount} NaN/Infinity values in targets!`);
        }
        // Step 4: Create and train model
        console.log('\n🧠 Step 4/5: Training LSTM model...');
        const model = new LSTMModelManager('LSTM_PricePredictor', '1.0.0', {
            inputShape: 60,
            sequenceLength: 20,
            lstmUnits: [64, 32, 16], // Reduced units to prevent overfitting
            dropout: 0.3,
            learningRate: 0.0005, // Lower learning rate for stability
            epochs: 30, // Reduced epochs for testing
            batchSize: 32
        });

        const trainingResult = await model.train(features, targets, 0.2);

        console.log('\n📊 Training Results:');
        console.log(`   Final Loss: ${trainingResult.finalLoss.toFixed(6)}`);
        console.log(`   Final Accuracy: ${(trainingResult.finalAccuracy * 100).toFixed(2)}%`);
        console.log(`   Training Time: ${(trainingResult.trainingTime / 1000).toFixed(2)}s`);
        console.log(`   Epochs: ${trainingResult.epochs}`);

        // Step 5: Save model
        console.log('\n💾 Step 5/5: Saving model...');

        try {
            const modelPath = await model.saveModel('./models');

            // Save metadata to database
            const startDate = new Date(data[0].timestamp);
            const endDate = new Date(data[data.length - 1].timestamp);
            const trainingPeriod = `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`;

            await model.saveMetadataToDatabase(trainingResult, symbol, trainingPeriod);

            console.log('='.repeat(60));
            console.log('✅ Model training completed successfully!');
            console.log(`📁 Model saved to: ${modelPath}`);
            console.log('='.repeat(60));
        } catch (saveError: unknown) {
            console.log('='.repeat(60));
            console.warn('⚠️  Model save skipped (requires @tensorflow/tfjs-node)');
            console.log('✅ Model training completed successfully!');
            console.warn('💡 Model trained but not persisted to disk');
            console.warn('📝 To enable: install Visual Studio + @tensorflow/tfjs-node');
            console.log('='.repeat(60));
        }

        // Test prediction on last sequence
        console.log('\n🧪 Testing prediction on latest data...');
        const testFeatures = features.slice(-20);
        const prediction = await model.predict(testFeatures);

        console.log(`   Direction: ${prediction.direction > 0 ? '📈 Bullish' : '📉 Bearish'}`);
        console.log(`   Confidence: ${(prediction.confidence * 100).toFixed(2)}%`);
        console.log(`   Predicted Change: ${prediction.priceChange.toFixed(2)}%`);

        // Cleanup
        model.dispose();
        featureService.clearCache();

    } catch (error) {
        console.error('\n❌ Training failed:', error);
        process.exit(1);
    }
}

// Run training
trainModel();
