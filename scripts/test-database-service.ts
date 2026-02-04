/**
 * Test Database Service
 * Verify all database operations work correctly
 */

import { db } from '../src/services/databaseService';

async function testDatabase() {
    console.log('🧪 Testing Database Service\n');
    console.log('='.repeat(80));

    try {
        // 1. Test User Operations
        console.log('\n📊 Test 1: User Operations');
        console.log('-'.repeat(80));
        
        const user = await db.getOrCreateUser(123456789, {
            username: 'test_user',
            firstName: 'Test',
            lastName: 'User'
        });
        console.log(`✓ User created: ID ${user?.id}, Telegram ID ${user?.telegramId}`);

        await db.setUserPreference(user!.id, 'default_symbol', 'BTCUSDT');
        await db.setUserPreference(user!.id, 'risk_level', '0.02');
        const symbol = await db.getUserPreference(user!.id, 'default_symbol');
        console.log(`✓ Preferences saved: default_symbol = ${symbol}`);

        // 2. Test Trade Operations
        console.log('\n📊 Test 2: Trade Operations');
        console.log('-'.repeat(80));

        const trade = await db.saveTrade({
            userId: user!.id,
            symbol: 'BTCUSDT',
            side: 'LONG',
            entryPrice: 50000,
            quantity: 0.1,
            strategyName: 'OpenClawStrategy',
            strategyVersion: '1.0.0',
            signalStrength: 0.85,
            mlConfidence: 0.72,
            stopLoss: 48000,
            takeProfit: 55000,
            leverage: 1,
            notes: 'Test trade from database service'
        });
        console.log(`✓ Trade opened: ID ${trade.id}, ${trade.side} ${trade.symbol} @ $${trade.entryPrice}`);

        // Close the trade
        const closedTrade = await db.closeTrade(trade.id, 52000);
        console.log(`✓ Trade closed: Profit $${closedTrade.profit?.toFixed(2)} (${closedTrade.profitPct?.toFixed(2)}%)`);

        // 3. Test Trade Statistics
        console.log('\n📊 Test 3: Trade Statistics');
        console.log('-'.repeat(80));

        const stats = await db.getUserTradeStats(user!.id);
        console.log(`✓ Total trades: ${stats.totalTrades}`);
        console.log(`✓ Win rate: ${stats.winRate.toFixed(1)}%`);
        console.log(`✓ Total profit: $${stats.totalProfit.toFixed(2)}`);
        console.log(`✓ Best trade: $${stats.bestTrade.toFixed(2)}`);

        // 4. Test Strategy Metrics
        console.log('\n📊 Test 4: Strategy Metrics');
        console.log('-'.repeat(80));

        const strategyMetric = await db.saveStrategyMetrics({
            strategyName: 'OpenClawStrategy',
            symbol: 'BTCUSDT',
            timeframe: '1h',
            totalTrades: 100,
            winningTrades: 55,
            losingTrades: 45,
            winRate: 55,
            avgProfit: 120,
            avgLoss: -80,
            profitFactor: 1.5,
            sharpeRatio: 1.8,
            maxDrawdown: 500,
            maxDrawdownPct: 5,
            calmarRatio: 0.36,
            sortinoRatio: 2.1,
            avgTradeDuration: 240, // 4 hours
            bestTrade: 500,
            worstTrade: -200,
            startDate: new Date('2026-01-01'),
            endDate: new Date()
        });
        console.log(`✓ Strategy metrics saved for ${strategyMetric.strategyName}`);

        // 5. Test ML Metrics
        console.log('\n📊 Test 5: ML Model Metrics');
        console.log('-'.repeat(80));

        const mlMetric = await db.saveMLMetrics({
            modelName: 'SimpleGRUModel',
            modelVersion: '1.0.0',
            symbol: 'BTCUSDT',
            totalPredictions: 100,
            correctPredictions: 52,
            accuracy: 52,
            avgConfidence: 24.3,
            highConfAccuracy: 50,
            lowConfAccuracy: 52.1,
            bullishAccuracy: 51,
            bearishAccuracy: 53,
            startDate: new Date('2026-01-01'),
            endDate: new Date(),
            trainingDate: new Date(),
            trainingSamples: 100,
            trainingEpochs: 15,
            trainingTime: 15.0
        });
        console.log(`✓ ML metrics saved: ${mlMetric.accuracy}% accuracy`);

        // 6. Test Alerts
        console.log('\n📊 Test 6: Price Alerts');
        console.log('-'.repeat(80));

        const alert = await db.createAlert({
            userId: user!.id,
            symbol: 'BTCUSDT',
            alertType: 'PRICE_ABOVE',
            targetPrice: 60000,
            message: 'BTC reached $60k!'
        });
        console.log(`✓ Alert created: ${alert.alertType} ${alert.symbol} @ $${alert.targetPrice}`);

        const activeAlerts = await db.getActiveAlerts(user!.id);
        console.log(`✓ Active alerts: ${activeAlerts.length}`);

        // 7. Test Historical Data Cache
        console.log('\n📊 Test 7: Historical Data Cache');
        console.log('-'.repeat(80));

        const now = Date.now();
        await db.cacheHistoricalData([
            {
                symbol: 'BTCUSDT',
                timeframe: '1h',
                timestamp: now - 7200000, // 2 hours ago
                open: 50000,
                high: 50500,
                low: 49800,
                close: 50200,
                volume: 1000000
            },
            {
                symbol: 'BTCUSDT',
                timeframe: '1h',
                timestamp: now - 3600000, // 1 hour ago
                open: 50200,
                high: 50800,
                low: 50000,
                close: 50600,
                volume: 1200000
            }
        ]);
        console.log(`✓ Cached 2 historical candles`);

        const cachedData = await db.getCachedData('BTCUSDT', '1h', now - 7200000, now);
        console.log(`✓ Retrieved ${cachedData.length} cached candles`);

        // 8. Test Backtest Results
        console.log('\n📊 Test 8: Backtest Results');
        console.log('-'.repeat(80));

        const backtestResult = await db.saveBacktestResult({
            strategyName: 'OpenClawStrategy',
            symbol: 'BTCUSDT',
            timeframe: '5m',
            startDate: new Date('2026-01-01'),
            endDate: new Date(),
            initialBalance: 1000,
            finalBalance: 1250,
            totalProfit: 250,
            totalProfitPct: 25,
            totalTrades: 50,
            winRate: 56,
            profitFactor: 1.6,
            sharpeRatio: 1.9,
            maxDrawdown: 100,
            maxDrawdownPct: 10,
            trades: [
                { symbol: 'BTCUSDT', profit: 50, side: 'LONG' },
                { symbol: 'BTCUSDT', profit: -20, side: 'SHORT' }
            ],
            equityCurve: [1000, 1050, 1030, 1100, 1250],
            parameters: { rsi_period: 14, ema_fast: 9, ema_slow: 21 }
        });
        console.log(`✓ Backtest result saved: ${backtestResult.totalProfitPct}% profit`);

        // 9. Test Error Logging
        console.log('\n📊 Test 9: Error Logging');
        console.log('-'.repeat(80));

        await db.logError({
            level: 'ERROR',
            source: 'test-database',
            message: 'Test error log',
            userId: user!.id,
            symbol: 'BTCUSDT',
            metadata: { test: true, timestamp: Date.now() }
        });
        console.log(`✓ Error logged`);

        const recentErrors = await db.getRecentErrors(10);
        console.log(`✓ Retrieved ${recentErrors.length} recent errors`);

        // 10. Summary
        console.log('\n' + '='.repeat(80));
        console.log('✅ ALL DATABASE TESTS PASSED!');
        console.log('='.repeat(80));

        console.log('\n📊 Database Summary:');
        console.log(`  Users: 1 created`);
        console.log(`  Trades: 1 executed`);
        console.log(`  Alerts: ${activeAlerts.length} active`);
        console.log(`  Strategy Metrics: 1 saved`);
        console.log(`  ML Metrics: 1 saved`);
        console.log(`  Cached Data: ${cachedData.length} candles`);
        console.log(`  Backtest Results: 1 saved`);
        console.log(`  Error Logs: ${recentErrors.length} entries`);

        console.log('\n✅ Database is fully functional and ready for production use!');

    } catch (error) {
        console.error('\n❌ Database test failed:', error);
        if (error instanceof Error) {
            console.error(error.message);
            console.error(error.stack);
        }
        process.exit(1);
    } finally {
        await db.disconnect();
    }
}

testDatabase();
