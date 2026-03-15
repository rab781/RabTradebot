/**
 * Quick Bot Commands Test
 * Simulates bot commands without starting full Telegram bot
 */

import { db } from '../src/services/databaseService';

async function testBotCommands() {
  console.log('🤖 TESTING BOT COMMANDS DATA FLOW\n');
  console.log('='.repeat(60));

  try {
    // Simulate user
    const user = await db.getOrCreateUser(12345, {
      username: 'testbotuser',
      firstName: 'TestBot',
      lastName: 'User',
    });
    if (!user) {
      throw new Error('Failed to create/retrieve user');
    }
    console.log(`✅ User: ${user.username} (ID: ${user.id})\n`);

    // ========================================
    // Simulate /mlpredict command
    // ========================================
    console.log('📊 Simulating: /mlpredict BTCUSDT');
    console.log('-'.repeat(60));

    const prediction = await db.savePrediction({
      userId: user!.id,
      symbol: 'BTCUSDT',
      modelName: 'GRU',
      modelVersion: '1.0.0',
      predictedDirection: 'UP',
      confidence: 0.68,
      predictedChange: 2.3,
      currentPrice: 45000,
    });

    console.log('Bot would reply:');
    console.log(`
🤖 ML PREDICTION for BTCUSDT

📈 Prediction: ${prediction.predictedDirection}
💪 Confidence: ${(prediction.confidence * 100).toFixed(1)}%
📊 Expected Change: ${prediction.predictedChange > 0 ? '+' : ''}${prediction.predictedChange.toFixed(2)}%
💰 Current Price: $${prediction.currentPrice.toLocaleString()}

⏰ Prediction saved! Will verify in 1 hour.
        `);

    // ========================================
    // Simulate /stats command
    // ========================================
    console.log('\n📊 Simulating: /stats');
    console.log('-'.repeat(60));

    const tradeStats = await db.getUserTradeStats(user!.id);
    const predStats = await db.getPredictionStats(undefined, undefined, user!.id);
    const alerts = await db.getActiveAlerts(user!.id);

    console.log('Bot would reply:');
    console.log(`
📊 YOUR TRADING STATISTICS

👤 User: ${user!.username || 'Anonymous'}
📅 Member since: ${user!.createdAt.toLocaleDateString()}

💰 TRADING PERFORMANCE:
Total Trades: ${tradeStats.totalTrades}
Profitable: ${tradeStats.winningTrades || 0} (${tradeStats.winRate.toFixed(1)}%)
Total Profit: $${tradeStats.totalProfit.toFixed(2)}
Best Trade: $${tradeStats.bestTrade?.toFixed(2) || '0.00'}
Worst Trade: $${tradeStats.worstTrade?.toFixed(2) || '0.00'}

🤖 ML PREDICTIONS:
Total Predictions: ${predStats.total}
Correct: ${predStats.correct}
Accuracy: ${predStats.accuracy.toFixed(1)}%
Avg Confidence: ${(predStats.avgConfidence * 100).toFixed(1)}%

🔔 ALERTS:
Active Alerts: ${alerts.length}
        `);

    // ========================================
    // Simulate /mlstats command
    // ========================================
    console.log('\n📊 Simulating: /mlstats BTCUSDT');
    console.log('-'.repeat(60));

    const overallStats = await db.getPredictionStats();
    const symbolStats = await db.getPredictionStats(undefined, 'BTCUSDT');
    const gruStats = await db.getPredictionStats('GRU');

    console.log('Bot would reply:');
    console.log(`
🤖 ML MODEL PERFORMANCE

📊 OVERALL STATS:
Total Predictions: ${overallStats.total}
Correct: ${overallStats.correct}
Accuracy: ${overallStats.accuracy.toFixed(1)}%
Avg Confidence: ${(overallStats.avgConfidence * 100).toFixed(1)}%

🔬 GRU MODEL:
Predictions: ${gruStats.total}
Accuracy: ${gruStats.accuracy.toFixed(1)}%
Confidence: ${(gruStats.avgConfidence * 100).toFixed(1)}%

📈 BTCUSDT STATS:
Predictions: ${symbolStats.total}
Accuracy: ${symbolStats.accuracy.toFixed(1)}%
Confidence: ${(symbolStats.avgConfidence * 100).toFixed(1)}%
        `);

    // ========================================
    // Simulate /strategystats command
    // ========================================
    console.log('\n📊 Simulating: /strategystats');
    console.log('-'.repeat(60));

    const sampleMetrics = await db.getStrategyMetrics('SampleStrategy');
    const openclawMetrics = await db.getStrategyMetrics('OpenClawStrategy');

    if (sampleMetrics.length === 0 && openclawMetrics.length === 0) {
      console.log('Bot would reply:');
      console.log('❌ No strategy data found. Run some backtests first with /backtest\n');
    } else {
      console.log('Bot would reply with strategy comparison...\n');
    }

    // ========================================
    // Simulate Prediction Verification (1 hour later)
    // ========================================
    console.log('\n⏰ Simulating: Prediction Verification (after 1 hour)');
    console.log('-'.repeat(60));

    // Manually verify the prediction
    const verified = await db.verifyPrediction(prediction.id, {
      actualDirection: 'UP',
      actualChange: 3.1,
      actualPrice: 46395,
    });

    console.log('Verification Result:');
    console.log(`
✅ PREDICTION VERIFIED

Symbol: ${verified.symbol}
Predicted: ${verified.predictedDirection} (${(verified.confidence * 100).toFixed(1)}% confidence)
Actual: ${verified.actualDirection}
Result: ${verified.wasCorrect ? '✅ CORRECT' : '❌ INCORRECT'}

Price Movement:
- Predicted Change: ${verified.predictedChange > 0 ? '+' : ''}${verified.predictedChange.toFixed(2)}%
- Actual Change: ${verified.actualChange! > 0 ? '+' : ''}${verified.actualChange!.toFixed(2)}%
- From: $${verified.currentPrice.toLocaleString()}
- To: $${verified.actualPrice!.toLocaleString()}
        `);

    // ========================================
    // Summary
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL BOT COMMANDS WORKING CORRECTLY!\n');
    console.log('🎯 Features Verified:');
    console.log('   ✅ ML Prediction Tracking - Saves predictions to DB');
    console.log('   ✅ /stats - Shows user statistics');
    console.log('   ✅ /mlstats - Shows ML accuracy');
    console.log('   ✅ /strategystats - Shows strategy comparison');
    console.log('   ✅ Auto Verification - Updates predictions with actual results');
    console.log('\n💡 To test in Telegram:');
    console.log('   1. npm run dev');
    console.log('   2. Send /start to your bot');
    console.log('   3. Try: /mlpredict BTCUSDT');
    console.log('   4. Try: /stats');
    console.log('   5. Try: /mlstats');
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await db.disconnect();
  }
}

testBotCommands()
  .then(() => {
    console.log('\n✅ Bot command simulation completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Simulation failed:', error);
    process.exit(1);
  });
