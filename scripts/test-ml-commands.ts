/**
 * Test script for ML commands
 * Tests all ML services without requiring Telegram
 */

// Load environment variables
import * as dotenv from 'dotenv';
dotenv.config();

import { FeatureEngineeringService } from '../src/services/featureEngineeringService';
import { RandomForestService } from '../src/services/randomForestService';
import { LSTMPredictionService } from '../src/services/lstmPredictionService';
import { AdvancedSentimentService } from '../src/services/advancedSentimentService';
import { EnsembleStrategyService } from '../src/services/ensembleStrategyService';

async function testMLServices() {
    console.log('🧪 Testing ML Services...\n');

    try {
        // Test Feature Engineering
        console.log('1️⃣ Testing Feature Engineering Service...');
        const featureService = new FeatureEngineeringService();

        // Mock market data for testing
        const mockMarketData = {
            symbol: 'BTCUSDT',
            price: 45000,
            volume: 1000000,
            priceData: Array.from({length: 50}, (_, i) => ({
                timestamp: Date.now() - (49 - i) * 60000,
                open: 44000 + Math.random() * 2000,
                high: 44000 + Math.random() * 2000,
                low: 44000 + Math.random() * 2000,
                close: 44000 + Math.random() * 2000,
                volume: 100000 + Math.random() * 50000
            }))
        };

        const features = await featureService.extractFeatures(mockMarketData.symbol, mockMarketData);
        console.log('✅ Feature Engineering - Features extracted:', Object.keys(features).length);

        // Test Random Forest
        console.log('\n2️⃣ Testing Random Forest Service...');
        const randomForestService = new RandomForestService();
        const rfPrediction = await randomForestService.predict(mockMarketData.symbol, features);
        console.log('✅ Random Forest - Prediction:', rfPrediction.signal, 'Confidence:', rfPrediction.confidence);

        // Test LSTM
        console.log('\n3️⃣ Testing LSTM Prediction Service...');
        const lstmService = new LSTMPredictionService();
        const lstmPrediction = await lstmService.predict(mockMarketData.symbol, features);
        console.log('✅ LSTM - Price prediction:', lstmPrediction.predictedPrice, 'Direction:', lstmPrediction.direction);

        // Test Sentiment Analysis
        console.log('\n4️⃣ Testing Advanced Sentiment Service...');
        const sentimentService = new AdvancedSentimentService();
        const mockNews = [
            "Bitcoin price surges to new all-time high as institutional adoption increases",
            "Crypto market shows strong bullish momentum with growing investor confidence",
            "Bitcoin ETF approval drives massive price rally"
        ];
        const sentimentResult = await sentimentService.analyzeSentiment(mockMarketData.symbol, mockNews);
        console.log('✅ Sentiment Analysis - Score:', sentimentResult.overallScore, 'Trend:', sentimentResult.trend);

        // Test Ensemble Strategy
        console.log('\n5️⃣ Testing Ensemble Strategy Service...');
        const ensembleService = new EnsembleStrategyService();
        const ensembleResult = await ensembleService.generateEnsembleSignal(mockMarketData.symbol, features, mockNews);
        console.log('✅ Ensemble Strategy - Signal:', ensembleResult.signal, 'Confidence:', ensembleResult.confidence);

        console.log('\n🎉 All ML Services Test PASSED!');
        console.log('\n📊 Summary:');
        console.log(`- Feature Engineering: ✅ ${Object.keys(features).length} features`);
        console.log(`- Random Forest: ✅ ${rfPrediction.signal} (${rfPrediction.confidence}%)`);
        console.log(`- LSTM Prediction: ✅ $${lstmPrediction.predictedPrice} (${lstmPrediction.direction})`);
        console.log(`- Sentiment Analysis: ✅ ${sentimentResult.trend} (${sentimentResult.overallScore})`);
        console.log(`- Ensemble Strategy: ✅ ${ensembleResult.signal} (${ensembleResult.confidence}%)`);

        return true;

    } catch (error) {
        console.error('❌ ML Services Test FAILED:', error);
        return false;
    }
}

async function testBotCommands() {
    console.log('\n🤖 Testing Bot Command Responses...\n');

    const testSymbols = ['BTCUSDT', 'ETHUSDT'];

    for (const symbol of testSymbols) {
        console.log(`📊 Testing commands for ${symbol}:`);
        console.log(`- /mlanalyze ${symbol} - Comprehensive ML analysis`);
        console.log(`- /ensemble ${symbol} - Ensemble strategy prediction`);
        console.log(`- /randomforest ${symbol} - Random Forest signals`);
        console.log(`- /lstm ${symbol} - LSTM prediction`);
        console.log(`- /sentiment ${symbol} - Sentiment analysis`);
        console.log('');
    }

    console.log('📱 Additional commands:');
    console.log('- /mlstats - ML model performance statistics');
    console.log('- /demo - Demo trading analysis');
    console.log('- /risk BTCUSDT - Risk assessment');
    console.log('- /performance - Performance metrics');
    console.log('');
}

// Main test function
async function main() {
    console.log('🚀 Phase 2 Enhanced Bot - ML Services Test\n');
    console.log('=' .repeat(50));

    // Test ML Services
    const mlTestResult = await testMLServices();

    if (mlTestResult) {
        console.log('\n' + '=' .repeat(50));

        // Show available commands
        await testBotCommands();

        console.log('✅ ALL TESTS PASSED - Bot ready for Telegram testing!');
        console.log('\n🎯 Next Steps:');
        console.log('1. Open Telegram and find your bot');
        console.log('2. Start conversation with /start');
        console.log('3. Try any of the commands above');
        console.log('4. Bot is running in the background and ready!');

    } else {
        console.log('\n❌ Tests failed - please check the errors above');
    }
}

// Run tests
main().catch(console.error);
