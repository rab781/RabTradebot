import { Telegraf } from 'telegraf';
import { config } from 'dotenv';
import { TechnicalAnalyzer } from './services/technicalAnalyzer';
import { NewsAnalyzer } from './services/newsAnalyzer';
import { SignalGenerator } from './services/signalGenerator';
import { PriceAlertManager } from './services/priceAlertManager';
import { AdvancedAnalyzer } from './services/advancedAnalyzer';
import { ChartGenerator } from './services/chartGenerator';

// New freqtrade-inspired services
import { BacktestEngine } from './services/backtestEngine';
import { PaperTradingEngine, PaperTradingConfig } from './services/paperTradingEngine';
import { DataManager, HistoricalDataConfig } from './services/dataManager';
import { StrategyOptimizer, OptimizationConfig } from './services/strategyOptimizer';
import { SampleStrategy } from './strategies/SampleStrategy';
import { IStrategy } from './types/strategy';

// Load environment variables
config();

// Initialize bot and existing services
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
const technicalAnalyzer = new TechnicalAnalyzer();
const newsAnalyzer = new NewsAnalyzer();
const signalGenerator = new SignalGenerator(technicalAnalyzer, newsAnalyzer);
const priceAlertManager = new PriceAlertManager();
const advancedAnalyzer = new AdvancedAnalyzer();
const chartGenerator = new ChartGenerator();

// Initialize new freqtrade-inspired services
const dataManager = new DataManager();
const strategy = new SampleStrategy();

// State management for paper trading and backtesting
const userSessions = new Map<number, {
    paperTrading?: PaperTradingEngine;
    lastBacktest?: any;
    strategy?: IStrategy;
}>();

// Helper function to get or create user session
function getUserSession(userId: number) {
    if (!userSessions.has(userId)) {
        userSessions.set(userId, {});
    }
    return userSessions.get(userId)!;
}

// Start command
bot.command('start', (ctx) => {
    const username = ctx.message.from.username || ctx.message.from.first_name || 'Unknown';
    const userId = ctx.message.from.id;
    console.log(`[${new Date().toISOString()}] New user started bot: ${username} (${userId})`);
    ctx.reply(`Welcome to Advanced Crypto Signal Bot! 🚀

This bot now includes powerful freqtrade-inspired features:

📊 BASIC ANALYSIS:
/signal [symbol] - Get trading signals
/volume [symbol] - Volume analysis
/sr [symbol] - Support & resistance levels
/chart [symbol] - Generate price chart

🎯 ADVANCED TRADING:
/backtest [symbol] [days] - Run strategy backtest
/papertrade [symbol] - Start paper trading
/stoptrading - Stop paper trading
/portfolio - View paper trading portfolio
/performance - View trading performance

🔧 STRATEGY OPTIMIZATION:
/optimize [symbol] [days] - Optimize strategy parameters
/strategies - List available strategies

📈 DATA MANAGEMENT:
/download [symbol] [days] - Download historical data
/datainfo [symbol] - Data quality info

Use /help for detailed command descriptions.`);
});

// Help command (updated)
bot.command('help', (ctx) => {
    const helpMessage = `
🔹 BASIC ANALYSIS COMMANDS:
/signal [symbol] - Get trading signals for a cryptocurrency
/volume [symbol] - Analyze volume patterns and anomalies
/sr [symbol] - Find support and resistance levels
/timeframes [symbol] - Multi-timeframe analysis
/chart [symbol] - Generate interactive price chart

🔹 ADVANCED TRADING COMMANDS:
/backtest [symbol] [days] - Run strategy backtest
   Example: /backtest BTCUSDT 30
/papertrade [symbol] - Start paper trading simulation
/stoptrading - Stop current paper trading session
/portfolio - View current positions and balance
/performance - Detailed performance metrics

🔹 STRATEGY & OPTIMIZATION:
/optimize [symbol] [days] - Optimize strategy parameters
   Example: /optimize BTCUSDT 60
/strategies - List all available trading strategies

🔹 DATA MANAGEMENT:
/download [symbol] [days] - Download historical data
   Example: /download BTCUSDT 90
/datainfo [symbol] - Check data quality and summary

🔹 PRICE ALERTS:
/alert [symbol] [price] [above/below] - Set price alert
/alerts - List your active price alerts
/delalert [symbol] - Delete price alert

All commands support major cryptocurrencies (BTCUSDT, ETHUSDT, etc.)
`;
    ctx.reply(helpMessage);
});

// Existing commands (keeping them for backward compatibility)
bot.command('signal', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
    const username = ctx.message.from.username || ctx.message.from.first_name || 'Unknown';
    const userId = ctx.message.from.id;
    
    console.log(`[${new Date().toISOString()}] User: ${username} (${userId}) requested signal for: ${symbol || 'undefined'}`);
    
    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /signal BTCUSDT');
    }

    try {
        ctx.reply('🔄 Generating signal...');
        const signal = await signalGenerator.generateSignal(symbol);
        ctx.reply(signal);
    } catch (error) {
        console.error(`Error generating signal for ${symbol}:`, error);
        ctx.reply(`❌ Error generating signal for ${symbol}. Please check the symbol and try again.`);
    }
});

// NEW FREQTRADE-INSPIRED COMMANDS

// Backtest command
bot.command('backtest', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const symbol = args[1]?.toUpperCase();
    const days = parseInt(args[2]) || 30;
    
    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /backtest BTCUSDT 30');
    }

    if (days < 7 || days > 365) {
        return ctx.reply('Days must be between 7 and 365');
    }

    try {
        ctx.reply(`🔄 Starting backtest for ${symbol} over ${days} days...`);
        
        // Download historical data
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));
        
        const dataConfig: HistoricalDataConfig = {
            symbol: symbol,
            timeframe: '5m',
            startDate: startDate,
            endDate: endDate,
            limit: 1000
        };

        const historicalData = await dataManager.downloadHistoricalData(dataConfig);
        
        if (historicalData.length < 100) {
            return ctx.reply('❌ Insufficient historical data for backtesting');
        }

        // Configure and run backtest
        const backtestConfig = {
            strategy: strategy.name,
            timerange: `${startDate.toISOString().split('T')[0]}..${endDate.toISOString().split('T')[0]}`,
            timeframe: '5m',
            maxOpenTrades: 3,
            stakeAmount: 100,
            startingBalance: 1000,
            feeOpen: 0.001,
            feeClose: 0.001,
            enableProtections: false,
            dryRunWallet: 1000
        };

        const backtestEngine = new BacktestEngine(strategy, backtestConfig);
        const result = await backtestEngine.runBacktest(historicalData);

        // Store result in user session
        const session = getUserSession(ctx.message.from.id);
        session.lastBacktest = result;

        // Format results
        const resultMessage = `
📊 BACKTEST RESULTS for ${symbol}
Strategy: ${strategy.name}
Period: ${days} days (${result.startDate.toLocaleDateString()} - ${result.endDate.toLocaleDateString()})

💰 PERFORMANCE:
Starting Balance: $${backtestConfig.startingBalance}
Final Balance: $${result.finalBalance.toFixed(2)}
Total Profit: $${result.totalProfit.toFixed(2)} (${result.totalProfitPct.toFixed(2)}%)

📈 TRADE STATISTICS:
Total Trades: ${result.totalTrades}
Profitable: ${result.profitableTrades} (${result.winRate.toFixed(1)}%)
Losing: ${result.lossTrades}
Avg Profit: $${result.avgProfit.toFixed(2)} (${result.avgProfitPct.toFixed(2)}%)

📉 RISK METRICS:
Max Drawdown: ${result.maxDrawdownPct.toFixed(2)}%
Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}
Profit Factor: ${result.profitFactor.toFixed(2)}
Calmar Ratio: ${result.calmarRatio.toFixed(3)}

🏆 BEST/WORST TRADES:
Best: ${result.bestTrade ? `$${result.bestTrade.profit?.toFixed(2)} (${result.bestTrade.profitPct?.toFixed(2)}%)` : 'N/A'}
Worst: ${result.worstTrade ? `$${result.worstTrade.profit?.toFixed(2)} (${result.worstTrade.profitPct?.toFixed(2)}%)` : 'N/A'}

⏱️ TIMING:
Avg Trade Duration: ${(result.avgTradeDuration / 60).toFixed(1)} hours
        `;

        ctx.reply(resultMessage);

    } catch (error) {
        console.error('Backtest error:', error);
        ctx.reply(`❌ Error running backtest: ${(error as Error).message}`);
    }
});

// Paper trading command
bot.command('papertrade', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
    
    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /papertrade BTCUSDT');
    }

    const session = getUserSession(ctx.message.from.id);
    
    // Check if already paper trading
    if (session.paperTrading && session.paperTrading.isActive()) {
        return ctx.reply('❌ Paper trading is already active. Use /stoptrading to stop current session.');
    }

    try {
        ctx.reply(`🔄 Starting paper trading for ${symbol}...`);

        const paperConfig: PaperTradingConfig = {
            initialBalance: 1000,
            maxOpenTrades: 3,
            feeOpen: 0.001,
            feeClose: 0.001,
            stakeCurrency: 'USDT',
            updateInterval: 5000 // 5 seconds
        };

        const paperEngine = new PaperTradingEngine(strategy, paperConfig);
        session.paperTrading = paperEngine;

        // Start paper trading
        await paperEngine.start(symbol, '5m', 500);

        ctx.reply(`✅ Paper trading started for ${symbol}!
💰 Initial balance: $${paperConfig.initialBalance}
📊 Strategy: ${strategy.name}
⚙️ Max open trades: ${paperConfig.maxOpenTrades}

Use /portfolio to check your positions
Use /performance to see detailed metrics
Use /stoptrading to stop trading`);

    } catch (error) {
        console.error('Paper trading error:', error);
        ctx.reply(`❌ Error starting paper trading: ${(error as Error).message}`);
    }
});

// Stop paper trading
bot.command('stoptrading', (ctx) => {
    const session = getUserSession(ctx.message.from.id);
    
    if (!session.paperTrading || !session.paperTrading.isActive()) {
        return ctx.reply('❌ No active paper trading session found.');
    }

    session.paperTrading.stop();
    const finalResult = session.paperTrading.getCurrentResult();

    const summary = `
📊 PAPER TRADING SESSION ENDED

💰 FINAL RESULTS:
Balance: $${finalResult.balance.toFixed(2)}
Total Profit: $${finalResult.totalProfit.toFixed(2)} (${finalResult.totalProfitPct.toFixed(2)}%)
Total Trades: ${finalResult.totalTrades}
Win Rate: ${finalResult.winRate.toFixed(1)}%
Open Positions: ${finalResult.openTrades}

Thanks for using paper trading! 🎯
    `;

    ctx.reply(summary);
});

// Portfolio command
bot.command('portfolio', (ctx) => {
    const session = getUserSession(ctx.message.from.id);
    
    if (!session.paperTrading) {
        return ctx.reply('❌ No paper trading session found. Start one with /papertrade [symbol]');
    }

    const result = session.paperTrading.getCurrentResult();
    const progress = session.paperTrading.getProgress();

    let message = `
📊 PORTFOLIO STATUS
${session.paperTrading.isActive() ? '🟢 Active' : '🔴 Stopped'} | Progress: ${progress.percentage.toFixed(1)}%

💰 BALANCE: $${result.balance.toFixed(2)}
Total Profit: $${result.totalProfit.toFixed(2)} (${result.totalProfitPct.toFixed(2)}%)

📈 OPEN POSITIONS (${result.openTrades}):
`;

    if (result.positions.length === 0) {
        message += "No open positions\n";
    } else {
        for (const position of result.positions) {
            const pnlEmoji = position.unrealizedPnl >= 0 ? '💚' : '💔';
            message += `${pnlEmoji} ${position.side.toUpperCase()} ${position.pair}
   Entry: $${position.entryPrice.toFixed(2)}
   Current: $${position.currentPrice.toFixed(2)}
   PnL: $${position.unrealizedPnl.toFixed(2)} (${position.unrealizedPnlPct.toFixed(2)}%)
`;
        }
    }

    message += `
📊 STATISTICS:
Total Trades: ${result.totalTrades}
Win Rate: ${result.winRate.toFixed(1)}%
Avg Profit: $${result.avgProfit.toFixed(2)}
Max Drawdown: $${result.maxDrawdown.toFixed(2)}
Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}
    `;

    ctx.reply(message);
});

// Performance command
bot.command('performance', (ctx) => {
    const session = getUserSession(ctx.message.from.id);
    
    if (!session.paperTrading) {
        return ctx.reply('❌ No paper trading session found. Start one with /papertrade [symbol]');
    }

    const result = session.paperTrading.getCurrentResult();

    let message = `
📈 DETAILED PERFORMANCE ANALYSIS

💰 FINANCIAL METRICS:
Current Balance: $${result.balance.toFixed(2)}
Total Profit: $${result.totalProfit.toFixed(2)}
Total Return: ${result.totalProfitPct.toFixed(2)}%
Max Drawdown: $${result.maxDrawdown.toFixed(2)}

📊 TRADING METRICS:
Total Trades: ${result.totalTrades}
Open Trades: ${result.openTrades}
Win Rate: ${result.winRate.toFixed(1)}%
Average Profit per Trade: $${result.avgProfit.toFixed(2)}
Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}

📋 RECENT TRADES:
`;

    if (result.recentTrades.length === 0) {
        message += "No completed trades yet\n";
    } else {
        for (const trade of result.recentTrades.slice(-5)) {
            const profitEmoji = (trade.profit || 0) >= 0 ? '💚' : '💔';
            message += `${profitEmoji} ${trade.side.toUpperCase()} ${trade.pair} | ${trade.exitReason}
   Profit: $${trade.profit?.toFixed(2)} (${trade.profitPct?.toFixed(2)}%)
   Duration: ${Math.round((trade.closeDate!.getTime() - trade.openDate.getTime()) / (1000 * 60))}min
`;
        }
    }

    ctx.reply(message);
});

// Strategy optimization command
bot.command('optimize', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const symbol = args[1]?.toUpperCase();
    const days = parseInt(args[2]) || 60;
    
    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /optimize BTCUSDT 60');
    }

    if (days < 14 || days > 365) {
        return ctx.reply('Days must be between 14 and 365');
    }

    try {
        ctx.reply(`🔄 Starting strategy optimization for ${symbol}...
This may take several minutes. ⏳`);

        // Download historical data
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));
        
        const dataConfig: HistoricalDataConfig = {
            symbol: symbol,
            timeframe: '5m',
            startDate: startDate,
            endDate: endDate
        };

        const historicalData = await dataManager.downloadHistoricalData(dataConfig);
        
        if (historicalData.length < 200) {
            return ctx.reply('❌ Insufficient historical data for optimization');
        }

        // Configure optimization
        const optimizationConfig: OptimizationConfig = {
            maxEvals: 50, // Limit to prevent timeout
            timerange: `${startDate.toISOString().split('T')[0]}..${endDate.toISOString().split('T')[0]}`,
            timeframe: '5m',
            metric: 'total_profit'
        };

        const optimizationSpace = StrategyOptimizer.createDefaultOptimizationSpace();
        const optimizer = new StrategyOptimizer(strategy, historicalData, optimizationConfig, optimizationSpace);

        // Run optimization
        const results = await optimizer.optimize();
        
        if (results.length === 0) {
            return ctx.reply('❌ No valid optimization results found');
        }

        const analysis = StrategyOptimizer.analyzeResults(results);
        const bestResult = results[0];

        const message = `
🎯 STRATEGY OPTIMIZATION RESULTS

📊 BEST PARAMETERS:
${Object.entries(analysis.bestParams)
    .map(([param, value]) => `${param}: ${value}`)
    .join('\n')}

💰 BEST PERFORMANCE:
Total Profit: ${bestResult.backtestResult.totalProfitPct.toFixed(2)}%
Win Rate: ${bestResult.backtestResult.winRate.toFixed(1)}%
Sharpe Ratio: ${bestResult.backtestResult.sharpeRatio.toFixed(3)}
Max Drawdown: ${bestResult.backtestResult.maxDrawdownPct.toFixed(2)}%
Total Trades: ${bestResult.backtestResult.totalTrades}

🔍 PARAMETER IMPORTANCE:
${Object.entries(analysis.parameterImportance)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([param, importance]) => `${param}: ${importance.toFixed(3)}`)
    .join('\n')}

Tested ${results.length} parameter combinations.
        `;

        ctx.reply(message);

    } catch (error) {
        console.error('Optimization error:', error);
        ctx.reply(`❌ Error during optimization: ${(error as Error).message}`);
    }
});

// Data download command
bot.command('download', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const symbol = args[1]?.toUpperCase();
    const days = parseInt(args[2]) || 30;
    
    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /download BTCUSDT 30');
    }

    if (days < 1 || days > 365) {
        return ctx.reply('Days must be between 1 and 365');
    }

    try {
        ctx.reply(`🔄 Downloading ${days} days of data for ${symbol}...`);

        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));
        
        const dataConfig: HistoricalDataConfig = {
            symbol: symbol,
            timeframe: '5m',
            startDate: startDate,
            endDate: endDate
        };

        const historicalData = await dataManager.downloadHistoricalData(dataConfig);
        const summary = dataManager.getDataSummary(historicalData);
        const quality = dataManager.validateDataQuality(historicalData);

        const message = `
✅ DATA DOWNLOAD COMPLETE

📊 SUMMARY:
Symbol: ${symbol}
Timeframe: 5m
Period: ${days} days
Total Candles: ${summary.count}
Date Range: ${summary.startDate.toLocaleDateString()} - ${summary.endDate.toLocaleDateString()}

💰 PRICE RANGE:
Min: $${summary.priceRange.min.toFixed(2)}
Max: $${summary.priceRange.max.toFixed(2)}
Avg Volume: ${summary.avgVolume.toLocaleString()}

✅ DATA QUALITY:
Status: ${quality.isValid ? 'Valid' : 'Issues Found'}
${quality.issues.length > 0 ? `Issues: ${quality.issues.length}` : ''}
${quality.gaps.length > 0 ? `Gaps: ${quality.gaps.length}` : ''}

Data cached for future use. 💾
        `;

        ctx.reply(message);

    } catch (error) {
        console.error('Download error:', error);
        ctx.reply(`❌ Error downloading data: ${(error as Error).message}`);
    }
});

// Data info command
bot.command('datainfo', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
    
    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /datainfo BTCUSDT');
    }

    try {
        ctx.reply(`🔄 Checking data quality for ${symbol}...`);

        // Get recent data for analysis
        const recentData = await dataManager.getRecentData(symbol, '5m', 100);
        const summary = dataManager.getDataSummary(recentData);
        const quality = dataManager.validateDataQuality(recentData);

        const message = `
📊 DATA QUALITY REPORT for ${symbol}

📈 RECENT DATA (100 candles):
Latest Price: $${recentData[recentData.length - 1].close.toFixed(2)}
Price Range: $${summary.priceRange.min.toFixed(2)} - $${summary.priceRange.max.toFixed(2)}
Avg Volume: ${summary.avgVolume.toLocaleString()}
Last Update: ${summary.endDate.toLocaleString()}

✅ QUALITY CHECK:
Status: ${quality.isValid ? '✅ Valid' : '❌ Issues Found'}
Data Gaps: ${quality.gaps.length}
Issues Found: ${quality.issues.length}

📊 CACHE INFO:
Cached Datasets: ${dataManager.getCacheSize()}

${quality.issues.length > 0 ? `\n⚠️ ISSUES:\n${quality.issues.slice(0, 3).join('\n')}` : ''}
        `;

        ctx.reply(message);

    } catch (error) {
        console.error('Data info error:', error);
        ctx.reply(`❌ Error checking data: ${(error as Error).message}`);
    }
});

// Strategies list command
bot.command('strategies', (ctx) => {
    const message = `
📚 AVAILABLE TRADING STRATEGIES

🎯 SampleStrategy v1.0.0
- Timeframe: 5m
- Type: Long/Short (configurable)
- Indicators: RSI, MACD, Bollinger Bands, EMA
- Entry: RSI cross above 30 + MACD positive + price above EMA10
- Exit: RSI cross above 70 + MACD negative
- Stop Loss: 5%
- Risk Management: Position sizing, ROI targets

📊 STRATEGY FEATURES:
✅ Technical indicators
✅ Risk management
✅ Position sizing
✅ Entry/exit signals
✅ Backtesting compatible
✅ Optimization ready

💡 TIP: Use /optimize to find the best parameters for any strategy!
    `;
    
    ctx.reply(message);
});

// Keep existing commands for backward compatibility
bot.command('volume', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
    
    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /volume BTCUSDT');
    }

    try {
        const analysis = await advancedAnalyzer.analyzeVolume(symbol);
        let message = `📊 Volume Analysis for ${symbol}:\n\n`;
        message += `24h Volume Change: ${analysis.volumeChange24h.toFixed(2)}%\n`;
        message += `Volume Status: ${analysis.unusualVolume ? '🚨 Unusual Volume Detected' : '📊 Normal Volume'}\n`;
        message += `Recommendation: ${analysis.recommendation}`;
        
        ctx.reply(message);
    } catch (error) {
        ctx.reply(`❌ Error analyzing volume for ${symbol}. ${(error as Error).message}`);
    }
});

// Keep other existing commands...
bot.command('sr', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /sr BTCUSDT');
    }

    try {
        const levels = await advancedAnalyzer.findSupportResistance(symbol);
        let message = `Support & Resistance Levels for ${symbol}:\n\n`;
        message += `Current Price: ${levels.currentPrice}\n\n`;
        message += `Nearest Resistance: ${levels.nearestResistance}\n`;
        message += `Nearest Support: ${levels.nearestSupport}\n\n`;
        message += `Distance to Resistance: ${((levels.nearestResistance - levels.currentPrice) / levels.currentPrice * 100).toFixed(2)}%\n`;
        message += `Distance to Support: ${((levels.currentPrice - levels.nearestSupport) / levels.currentPrice * 100).toFixed(2)}%`;
        
        ctx.reply(message);
    } catch (error) {
        ctx.reply('Error finding support/resistance levels. Please try again later.');
    }
});

// Alert commands (keeping existing functionality)
bot.command('alert', (ctx) => {
    const [_, symbol, price, type] = ctx.message.text.split(' ');
    if (!symbol || !price || !type) {
        return ctx.reply('Please use format: /alert BTCUSDT 50000 above/below');
    }

    try {
        const targetPrice = parseFloat(price);
        if (isNaN(targetPrice)) {
            return ctx.reply('Invalid price value');
        }

        if (type !== 'above' && type !== 'below') {
            return ctx.reply('Type must be either "above" or "below"');
        }

        priceAlertManager.addAlert(ctx.message.from.id, symbol.toUpperCase(), targetPrice, type);
        ctx.reply(`Alert set for ${symbol} when price goes ${type} ${targetPrice}`);
    } catch (error) {
        ctx.reply('Error setting price alert. Please try again.');
    }
});

bot.command('alerts', (ctx) => {
    const alerts = priceAlertManager.getAlerts(ctx.message.from.id);
    if (alerts.length === 0) {
        return ctx.reply('You have no active alerts');
    }

    let message = 'Your active price alerts:\n\n';
    alerts.forEach((alert, index) => {
        message += `${index + 1}. ${alert.symbol}: ${alert.type} ${alert.targetPrice}\n`;
    });
    ctx.reply(message);
});

bot.command('delalert', (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /delalert BTCUSDT');
    }

    priceAlertManager.removeAlert(ctx.message.from.id, symbol);
    ctx.reply(`Alert removed for ${symbol}`);
});

// Start price alert checker
setInterval(async () => {
    try {
        const notifications = await priceAlertManager.checkAlerts();
        for (const notification of notifications) {
            bot.telegram.sendMessage(notification.userId, notification.message);
        }
    } catch (error) {
        console.error('Error checking price alerts:', error);
    }
}, 60000);

// Error handling
bot.catch((err, ctx) => {
    console.error('Telegram bot error:', err);
    ctx.reply('❌ An unexpected error occurred. Please try again later.');
});

// Start the bot
console.log(`[${new Date().toISOString()}] Starting Advanced Crypto Signal Bot...`);

if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('ERROR: TELEGRAM_BOT_TOKEN not found in environment variables');
    process.exit(1);
}

bot.launch().then(() => {
    console.log(`[${new Date().toISOString()}] ✅ Advanced Crypto Signal Bot is running!`);
    console.log(`[${new Date().toISOString()}] New features available:`);
    console.log(`   - Backtesting with /backtest`);
    console.log(`   - Paper trading with /papertrade`);
    console.log(`   - Strategy optimization with /optimize`);
    console.log(`   - Data management with /download`);
    console.log(`   - Portfolio tracking with /portfolio`);
}).catch((error) => {
    console.error(`❌ Error starting bot:`, error);
    process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('Shutting down gracefully...');
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    bot.stop('SIGTERM');
});
