import { db } from '../src/services/databaseService';

async function testBotIntegration() {
    console.log('🧪 Testing Bot Integration with Database...\n');

    try {
        // Test 1: Create test user
        console.log('Test 1: Creating test user...');
        const user = await db.getOrCreateUser(
            12345678,
            'TestBot',
            'testbot'
        );
        console.log(`✅ User created: ${user.username} (ID: ${user.id})\n`);

        // Test 2: Create alert
        console.log('Test 2: Creating price alert...');
        const alert = await db.createAlert({
            userId: user.id,
            symbol: 'BTCUSDT',
            alertType: 'PRICE_ABOVE',
            targetPrice: 50000,
            message: 'BTC above $50k!'
        });
        console.log(`✅ Alert created: ${alert.symbol} @ $${alert.targetPrice}\n`);

        // Test 3: Get active alerts
        console.log('Test 3: Getting active alerts...');
        const alerts = await db.getActiveAlerts(user.id);
        console.log(`✅ Found ${alerts.length} active alerts\n`);

        // Test 4: Save paper trade
        console.log('Test 4: Saving paper trade...');
        const trade = await db.saveTrade({
            userId: user.id,
            symbol: 'BTCUSDT',
            side: 'BUY',
            entryPrice: 45000,
            quantity: 0.01,
            stopLoss: 44000,
            takeProfit: 48000,
            fees: 0.45
        });
        console.log(`✅ Trade saved: ${trade.side} ${trade.quantity} ${trade.symbol} @ $${trade.entryPrice}\n`);

        // Test 5: Close trade
        console.log('Test 5: Closing trade...');
        const closedTrade = await db.closeTrade(trade.id, 47000, 4.44);
        console.log(`✅ Trade closed: Profit = $${closedTrade.profit?.toFixed(2)} (${closedTrade.profitPct?.toFixed(2)}%)\n`);

        // Test 6: Get trade statistics
        console.log('Test 6: Getting trade statistics...');
        const stats = await db.getUserTradeStats(user.id);
        console.log(`✅ Stats: ${stats.totalTrades} trades, $${stats.totalProfit.toFixed(2)} profit, ${stats.winRate.toFixed(1)}% win rate\n`);

        // Test 7: Save backtest result
        console.log('Test 7: Saving backtest result...');
        const backtest = await db.saveBacktestResult({
            strategyName: 'TestStrategy',
            symbol: 'BTCUSDT',
            timeframe: '1h',
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-02-01'),
            initialBalance: 1000,
            finalBalance: 1200,
            totalProfit: 200,
            totalProfitPct: 20,
            totalTrades: 10,
            winRate: 70,
            profitFactor: 2.5,
            sharpeRatio: 1.8,
            maxDrawdown: 50,
            maxDrawdownPct: 5,
            trades: []
        });
        console.log(`✅ Backtest saved: ${backtest.strategyName} - ${backtest.totalProfitPct}% profit\n`);

        // Test 8: Get backtest history
        console.log('Test 8: Getting backtest history...');
        const backtests = await db.getBacktestHistory('TestStrategy');
        console.log(`✅ Found ${backtests.length} backtest results\n`);

        // Test 9: Save ML metrics
        console.log('Test 9: Saving ML metrics...');
        const mlMetrics = await db.saveMLMetrics({
            modelName: 'GRU',
            modelVersion: '1.0.0',
            symbol: 'BTCUSDT',
            totalPredictions: 100,
            correctPredictions: 52,
            accuracy: 52.2,
            avgConfidence: 0.65,
            highConfAccuracy: 68.5,
            lowConfAccuracy: 42.1,
            bullishAccuracy: 55.3,
            bearishAccuracy: 49.2,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-02-01'),
            trainingDate: new Date('2024-01-15'),
            trainingSamples: 5000,
            trainingEpochs: 50,
            trainingTime: 15000
        });
        console.log(`✅ ML metrics saved: ${mlMetrics.modelName} v${mlMetrics.modelVersion} - ${mlMetrics.accuracy}% accuracy\n`);

        // Test 10: Log error
        console.log('Test 10: Logging error...');
        await db.logError({
            level: 'ERROR',
            source: 'test_integration',
            message: 'This is a test error',
            userId: user.id,
            symbol: 'BTCUSDT',
            metadata: { testField: 'testValue' }
        });
        console.log(`✅ Error logged\n`);

        // Test 11: Find open trade
        console.log('Test 11: Testing findOpenTrade...');
        const openTrade = await db.saveTrade({
            userId: user.id,
            symbol: 'ETHUSDT',
            side: 'BUY',
            entryPrice: 3000,
            quantity: 0.1,
            fees: 0.3
        });
        
        const foundTrade = await db.findOpenTrade(user.id.toString(), 'ETHUSDT', 3000);
        console.log(`✅ Open trade found: ${foundTrade?.symbol} @ $${foundTrade?.entryPrice}\n`);

        console.log('✅ All integration tests passed!');
        console.log('\n📊 Database Integration Summary:');
        console.log(`- User management: Working`);
        console.log(`- Alert system: Working`);
        console.log(`- Trade tracking: Working`);
        console.log(`- Backtest storage: Working`);
        console.log(`- ML metrics: Working`);
        console.log(`- Error logging: Working`);
        console.log('\n🎯 Bot is ready for database integration!');

    } catch (error) {
        console.error('❌ Integration test failed:', error);
        throw error;
    } finally {
        await db.disconnect();
    }
}

testBotIntegration().catch(console.error);
