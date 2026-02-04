/**
 * Test script for database functionality
 */

import { getDatabase, closeDatabase } from '../src/database/database';

console.log('🧪 Testing Database Functionality...\n');

try {
    // Initialize database
    const db = getDatabase('./data/trading_test.db');
    console.log('✅ Database initialized');

    // Test inserting a trade
    const tradeId = db.insertTrade({
        symbol: 'BTCUSDT',
        strategy: 'OpenClawStrategy',
        action: 'BUY',
        entryPrice: 50000,
        quantity: 0.1,
        entryTime: Date.now(),
        reason: 'Test trade'
    });
    console.log(`✅ Trade inserted with ID: ${tradeId}`);

    // Test retrieving trade
    const trade = db.getTrade(tradeId);
    console.log('✅ Trade retrieved:', trade?.symbol, trade?.action);

    // Test inserting backtest result
    const backtestId = db.insertBacktestResult({
        strategy: 'OpenClawStrategy',
        symbol: 'BTCUSDT',
        startDate: Date.now() - 86400000 * 180,
        endDate: Date.now(),
        initialBalance: 10000,
        finalBalance: 15000,
        totalProfit: 5000,
        totalProfitPct: 50,
        totalTrades: 100,
        winningTrades: 60,
        losingTrades: 40,
        winRate: 0.6,
        maxDrawdown: -1000,
        maxDrawdownPct: -10,
        sharpeRatio: 2.5,
        sortinoRatio: 3.0,
        calmarRatio: 5.0,
        profitFactor: 2.2,
        parameters: JSON.stringify({ rsiPeriod: 14 }),
        createdAt: Date.now()
    });
    console.log(`✅ Backtest result inserted with ID: ${backtestId}`);

    // Test inserting model version
    const modelId = db.insertModelVersion({
        modelName: 'LSTM_V1',
        version: '1.0.0',
        architecture: '3-layer LSTM',
        accuracy: 0.65,
        mae: 0.02,
        rmse: 0.03,
        directionalAccuracy: 0.60,
        trainedOn: 'BTCUSDT',
        trainingPeriod: '2024-08-01 to 2025-02-01',
        filePath: './models/lstm_v1.json',
        metadata: JSON.stringify({ layers: 3, units: [128, 64, 32] }),
        createdAt: Date.now()
    });
    console.log(`✅ Model version inserted with ID: ${modelId}`);

    // Test feature cache
    const featureId = db.insertFeatureCache({
        symbol: 'BTCUSDT',
        timestamp: Date.now(),
        features: JSON.stringify({ rsi: 45, macd: 0.02, volume: 1000000 }),
        createdAt: Date.now()
    });
    console.log(`✅ Feature cache inserted with ID: ${featureId}`);

    // Get database stats
    const stats = db.getStats();
    console.log('\n📊 Database Stats:');
    console.log(`   Total Trades: ${stats.totalTrades}`);
    console.log(`   Total Backtests: ${stats.totalBacktests}`);
    console.log(`   Total Models: ${stats.totalModels}`);
    console.log(`   Total Cached Features: ${stats.totalCachedFeatures}`);
    console.log(`   Database Size: ${(stats.dbSize / 1024).toFixed(2)} KB`);

    // Cleanup
    closeDatabase();
    console.log('\n✅ All database tests passed!');

} catch (error) {
    console.error('❌ Database test failed:', error);
    process.exit(1);
}
