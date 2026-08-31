/**
 * Test OpenClawStrategy with backtesting
 */

import { DataManager } from '../src/services/dataManager';
import { BacktestEngine } from '../src/services/backtestEngine';
import { OpenClawStrategy } from '../src/strategies/OpenClawStrategy';
import { DataFrameBuilder } from '../src/types/dataframe';

async function testOpenClawStrategy() {
    console.log('🧪 Testing OpenClawStrategy with Backtest\n');
    console.log('='.repeat(70));

    const symbol = process.argv[2] || 'BTCUSDT';
    const days = parseInt(process.argv[3]) || 90;

    console.log(`📊 Symbol: ${symbol}`);
    console.log(`📅 Period: ${days} days`);
    console.log(`⏰ Timeframe: 1h`);
    console.log('='.repeat(70) + '\n');

    try {
        // Step 1: Download data
        console.log('📥 Step 1/4: Downloading historical data...');
        const dataManager = new DataManager();
        const candles = await dataManager.getRecentData(symbol, '1h', days * 24);
        console.log(`   ✅ Downloaded ${candles.length} candles`);

        // Step 2: Convert to DataFrame
        console.log('\n🔧 Step 2/4: Converting to DataFrame...');
        const dfBuilder = new DataFrameBuilder();
        const dataframe = dfBuilder.addCandles(candles).build();
        console.log(`   ✅ DataFrame created with ${dataframe.close.length} rows`);

        // Step 3: Initialize strategy
        console.log('\n🎯 Step 3/4: Initializing OpenClawStrategy...');
        const strategy = new OpenClawStrategy({
            useMachineLearning: false, // No ML model trained yet
            minSignalStrength: 0.15, // Aligned with internal default
            minConfidence: 0.5,
            regimeAdaptive: true
        });

        console.log(`   Strategy: ${strategy.name} v${strategy.version}`);
        console.log(`   Timeframe: ${strategy.timeframe}`);
        console.log(`   Can Short: ${strategy.canShort}`);
        console.log(`   Stop Loss: ${(strategy.stoploss * 100).toFixed(2)}%`);
        console.log(`   Max Open Trades: ${strategy.maxOpenTrades}`);

        // Step 4: Run backtest
        console.log('\n📈 Step 4/4: Running backtest...');
        console.log('   This may take a moment...\n');

        const config = {
            strategy: strategy.name,
            timerange: `${days} days`,
            timeframe: '1h',
            maxOpenTrades: strategy.maxOpenTrades,
            stakeAmount: 100,
            startingBalance: 10000,
            feeOpen: 0.001,
            feeClose: 0.001,
            enableProtections: false,
            dryRunWallet: 10000
        };

        const backtester = new BacktestEngine(strategy, config);
        const result = await backtester.runBacktest(candles);

        // Display results
        console.log('='.repeat(70));
        console.log('📊 BACKTEST RESULTS');
        console.log('='.repeat(70));

        console.log('\n💰 Performance Metrics:');
        console.log(`   Starting Balance:   $${config.startingBalance.toLocaleString()}`);
        console.log(`   Final Balance:      $${result.finalBalance.toLocaleString()}`);
        console.log(`   Total Profit:       $${result.totalProfit.toLocaleString()}`);
        console.log(`   Total Profit %:     ${result.totalProfitPct.toFixed(2)}%`);

        console.log('\n📈 Trade Statistics:');
        console.log(`   Total Trades:       ${result.totalTrades}`);
        console.log(`   Profitable Trades:  ${result.profitableTrades} (${result.winRate.toFixed(1)}%)`);
        console.log(`   Loss Trades:        ${result.lossTrades}`);
        console.log(`   Win Rate:           ${result.winRate.toFixed(2)}%`);

        console.log('\n💵 Profit Analysis:');
        console.log(`   Average Profit:     $${result.avgProfit.toFixed(2)}`);
        console.log(`   Best Trade:         $${(result.bestTrade && result.bestTrade.profit) ? result.bestTrade.profit.toFixed(2) : 'N/A'}`);
        console.log(`   Worst Trade:        $${(result.worstTrade && result.worstTrade.profit) ? result.worstTrade.profit.toFixed(2) : 'N/A'}`);
        console.log(`   Profit Factor:      ${result.profitFactor.toFixed(2)}`);

        console.log('\n📉 Risk Metrics:');
        console.log(`   Max Drawdown:       $${result.maxDrawdown.toFixed(2)}`);
        console.log(`   Max Drawdown %:     ${result.maxDrawdownPct.toFixed(2)}%`);
        console.log(`   Sharpe Ratio:       ${result.sharpeRatio.toFixed(2)}`);
        console.log(`   Sortino Ratio:      ${result.sortinoRatio.toFixed(2)}`);
        console.log(`   Calmar Ratio:       ${result.calmarRatio.toFixed(2)}`);

        console.log('\n⏱️  Time Analysis:');
        console.log(`   Avg Trade Duration: ${result.avgTradeDuration}`);

        console.log('\n' + '='.repeat(70));

        // Performance evaluation
        console.log('\n📊 Strategy Evaluation:');

        if (result.sharpeRatio > 2.0) {
            console.log('   ✅ EXCELLENT - Sharpe ratio > 2.0');
        } else if (result.sharpeRatio > 1.0) {
            console.log('   ✅ GOOD - Sharpe ratio > 1.0');
        } else if (result.sharpeRatio > 0) {
            console.log('   ⚠️  MODERATE - Sharpe ratio positive but < 1.0');
        } else {
            console.log('   ❌ POOR - Negative Sharpe ratio');
        }

        if (result.winRate > 55) {
            console.log('   ✅ GOOD WIN RATE - Above 55%');
        } else if (result.winRate > 45) {
            console.log('   ⚠️  MODERATE WIN RATE - 45-55%');
        } else {
            console.log('   ❌ LOW WIN RATE - Below 45%');
        }

        if (result.profitFactor > 2.0) {
            console.log('   ✅ EXCELLENT PROFIT FACTOR - > 2.0');
        } else if (result.profitFactor > 1.5) {
            console.log('   ✅ GOOD PROFIT FACTOR - > 1.5');
        } else if (result.profitFactor > 1.0) {
            console.log('   ⚠️  BREAK-EVEN PROFIT FACTOR - > 1.0');
        } else {
            console.log('   ❌ LOSING STRATEGY - Profit Factor < 1.0');
        }

        console.log('\n' + '='.repeat(70));

        // Sample trades
        if (result.trades.length > 0) {
            console.log('\n📝 Sample Trades (Last 5):');
            const sampleTrades = result.trades.slice(-5);

            sampleTrades.forEach((trade: unknown, idx: number) => {
                const profit = trade.profitPct || 0;
                const icon = profit > 0 ? '✅' : '❌';
                console.log(`\n   ${icon} Trade #${result.trades.length - 5 + idx + 1}:`);
                console.log(`      Entry: $${trade.openRate.toFixed(2)} @ ${trade.openDate.toISOString()}`);
                console.log(`      Exit:  $${trade.closeRate?.toFixed(2)} @ ${trade.closeDate?.toISOString()}`);
                console.log(`      Profit: ${profit > 0 ? '+' : ''}${profit.toFixed(2)}%`);
                console.log(`      Tag: ${trade.entryTag || 'N/A'} → ${trade.exitReason || 'N/A'}`);
            });
        }

        console.log('\n' + '='.repeat(70));
        console.log('✅ Backtest completed successfully!');
        console.log('='.repeat(70));

    } catch (error) {
        console.error('\n❌ Backtest failed:', error);
        process.exit(1);
    }
}

testOpenClawStrategy();
