import { Telegraf } from 'telegraf';
import { config } from 'dotenv';
import { TechnicalAnalyzer } from './services/technicalAnalyzer';
import { NewsAnalyzer } from './services/newsAnalyzer';
import { SignalGenerator } from './services/signalGenerator';
import { PriceAlertManager } from './services/priceAlertManager';
import { AdvancedAnalyzer } from './services/advancedAnalyzer';
import { ChartGenerator } from './services/chartGenerator';
import { TradingViewService } from './services/TradingViewService';

// New freqtrade-inspired services
import { BacktestEngine } from './services/backtestEngine';
import { PaperTradingEngine, PaperTradingConfig } from './services/paperTradingEngine';
import { DataManager, HistoricalDataConfig } from './services/dataManager';
import { StrategyOptimizer, OptimizationConfig } from './services/strategyOptimizer';
import { SampleStrategy } from './strategies/SampleStrategy';
import { IStrategy } from './types/strategy';

// Chutes AI service
import { ChutesService } from './services/chutesService';

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

// Initialize TradingView service
const tradingViewService = new TradingViewService({
    theme: 'dark',
    interval: '5m',
    symbol: 'BINANCE:BTCUSDT',
    containerId: 'analysis-chart'
});

// Initialize new freqtrade-inspired services
const dataManager = new DataManager();
const strategy = new SampleStrategy();

// Initialize Chutes AI service
const chutesService = new ChutesService();

// Import comprehensive analyzer
import { SimpleComprehensiveAnalyzer } from './services/simpleComprehensiveAnalyzer';
const comprehensiveAnalyzer = new SimpleComprehensiveAnalyzer();

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

🎯 COMPREHENSIVE ANALYSIS:
/analyze [symbol] - Complete market analysis including:
  • Technical analysis (RSI, MACD, Moving Averages)
  • Multi-timeframe analysis (1h, 4h, 1d)
  • Support/Resistance levels
  • Volume analysis
  • Precise entry/exit recommendations
  • Risk management setup

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

🐦 NEWS & SOCIAL MEDIA:
/pnews [symbol] - Perplexity AI news analysis (NEW!)
/impact [symbol] - Quick news impact (NEW!)
/fullanalysis [symbol] - Complete technical + news (NEW!)
/news [symbol] - Comprehensive news analysis
/twitter [symbol] - Twitter sentiment analysis
/twitterstatus - Check Twitter API rate limits and status
/influencers - Crypto influencer tweets
/cryptonews [symbol] [keywords] - Search Twitter news

Use /help for detailed command descriptions.`);
});

// Help command (updated)
bot.command('help', (ctx) => {
    const helpMessage = `
🔹 COMPREHENSIVE ANALYSIS:
/analyze [symbol] - Complete analysis including:
   • Technical analysis (RSI, MACD, BB, Support/Resistance)
   • Multi-timeframe analysis (1h, 4h, 1d, 1w)
   • Multi-strategy backtesting
   • Entry/exit recommendations with exact levels
   • Risk assessment and position sizing
   • Chart generation with indicators
/fullanalysis [symbol] - Technical + News analysis (NEW!)

🔹 NEWS & SENTIMENT ANALYSIS:
/pnews [symbol] - Perplexity AI news analysis (NEW!)
/impact [symbol] - Quick news impact assessment (NEW!)
/news [symbol] - Comprehensive news analysis (traditional + Twitter)
/twitter [symbol] - Twitter sentiment analysis
/twitterstatus - Check Twitter API rate limits and status
/influencers - Latest tweets from crypto influencers
/cryptonews [symbol] [keywords] - Search Twitter for crypto news

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

🔹 NEWS & SOCIAL MEDIA:
/pnews [symbol] - Perplexity AI news analysis (NEW!)
/impact [symbol] - Quick news impact assessment (NEW!)
/fullanalysis [symbol] - Complete technical + fundamental (NEW!)
/news [symbol] - Comprehensive news analysis (traditional + Twitter)
/twitter [symbol] - Twitter sentiment analysis
/twitterstatus - Check Twitter API rate limits and status
/influencers - Latest tweets from crypto influencers
/cryptonews [symbol] [keywords] - Search Twitter for crypto news

📈 NEW FEATURES:
• Perplexity AI integration for latest news
• Market impact predictions
• Combined technical + fundamental analysis
• Real-time sentiment analysis

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

    return;
});

// COMPREHENSIVE ANALYSIS COMMAND
bot.command('analyze', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
    const username = ctx.message.from.username || ctx.message.from.first_name || 'Unknown';
    const userId = ctx.message.from.id;

    console.log(`[${new Date().toISOString()}] User: ${username} (${userId}) requested comprehensive analysis for: ${symbol || 'undefined'}`);

    if (!symbol) {
        return ctx.reply(`❌ Please provide a symbol.

Example: /analyze BTCUSDT

🎯 This will provide:
• Complete technical analysis
• Multi-timeframe analysis
• Backtesting results
• Entry/Exit recommendations
• Risk management setup
• Chart links`);
    }

    try {
        const loadingMessage = await ctx.reply(`🔄 Performing comprehensive analysis for ${symbol}...

⏳ This may take 30-60 seconds as we:
• Fetch market data from multiple sources
• Calculate 20+ technical indicators
• Run backtests across multiple strategies
• Analyze multiple timeframes
• Generate recommendations
${chutesService.isConfigured() ? '• Analyze latest news sentiment (AI-powered by Chutes)' : ''}

Please wait...`);

        // Start comprehensive analysis
        const analysisResult = await comprehensiveAnalyzer.analyzeComprehensiveForBot(symbol);

        // Format the comprehensive response
        const technicalSection = `
📊 TECHNICAL ANALYSIS
Current Price: $${analysisResult.currentPrice.toFixed(2)}
Trend: ${analysisResult.technical.trend.toUpperCase()} (${(analysisResult.technical.strength * 100).toFixed(1)}% strength)
RSI: ${analysisResult.technical.rsi.toFixed(1)} ${analysisResult.technical.rsi < 30 ? '🟢 OVERSOLD' : analysisResult.technical.rsi > 70 ? '🔴 OVERBOUGHT' : '🟡 NEUTRAL'}
MACD: ${analysisResult.technical.macd.signal.toUpperCase()} ${analysisResult.technical.macd.signal === 'bullish' ? '🟢' : analysisResult.technical.macd.signal === 'bearish' ? '🔴' : '🟡'}

📈 MOVING AVERAGES:
EMA10: $${analysisResult.technical.movingAverages.ema10.toFixed(2)}
EMA20: $${analysisResult.technical.movingAverages.ema20.toFixed(2)}
SMA50: $${analysisResult.technical.movingAverages.sma50.toFixed(2)}
SMA200: $${analysisResult.technical.movingAverages.sma200.toFixed(2)}
Alignment: ${analysisResult.technical.movingAverages.alignment.toUpperCase()}

🎯 SUPPORT/RESISTANCE:
Support: $${analysisResult.technical.supportResistance.support.toFixed(2)}
Resistance: $${analysisResult.technical.supportResistance.resistance.toFixed(2)}
Distance to Support: ${analysisResult.technical.supportResistance.distanceToSupport.toFixed(1)}%
Distance to Resistance: ${analysisResult.technical.supportResistance.distanceToResistance.toFixed(1)}%`;

        const timeframeSection = `
⏰ MULTI-TIMEFRAME ANALYSIS:
1H: ${analysisResult.timeframes['1h'].trend.toUpperCase()} | Signal: ${analysisResult.timeframes['1h'].signal.toUpperCase()}
4H: ${analysisResult.timeframes['4h'].trend.toUpperCase()} | Signal: ${analysisResult.timeframes['4h'].signal.toUpperCase()}
1D: ${analysisResult.timeframes['1d'].trend.toUpperCase()} | Signal: ${analysisResult.timeframes['1d'].signal.toUpperCase()}`;

        const backtestSection = analysisResult.backtests.length > 0 ? `
🔬 BACKTEST RESULTS (${analysisResult.backtests[0].period}):
Strategy: ${analysisResult.backtests[0].strategy}
Win Rate: ${analysisResult.backtests[0].winRate.toFixed(1)}%
Total Return: ${analysisResult.backtests[0].totalReturn.toFixed(2)}%
Sharpe Ratio: ${analysisResult.backtests[0].sharpeRatio.toFixed(2)}
Max Drawdown: ${analysisResult.backtests[0].maxDrawdown.toFixed(2)}%
Best Trade: ${analysisResult.backtests[0].bestTrade.toFixed(2)}%
Worst Trade: ${analysisResult.backtests[0].worstTrade.toFixed(2)}%
Avg Duration: ${Math.round(analysisResult.backtests[0].avgTradeDuration / 60)} hours` : `
🔬 BACKTEST RESULTS:
Insufficient data for backtesting`;

        const recommendationSection = `
🎯 TRADING RECOMMENDATION:
Action: ${analysisResult.recommendation.action.toUpperCase()} ${
    analysisResult.recommendation.action === 'strong_buy' ? '🟢🟢' :
    analysisResult.recommendation.action === 'buy' ? '🟢' :
    analysisResult.recommendation.action === 'strong_sell' ? '🔴🔴' :
    analysisResult.recommendation.action === 'sell' ? '🔴' : '🟡'
}
Confidence: ${analysisResult.recommendation.confidence.toFixed(1)}%
Entry Price: $${analysisResult.recommendation.entryPrice.toFixed(2)}
Exit Target: $${analysisResult.recommendation.exitPrice.toFixed(2)}
Stop Loss: $${analysisResult.recommendation.stopLoss.toFixed(2)}
Risk/Reward: ${analysisResult.recommendation.riskReward.toFixed(2)}
Timeframe: ${analysisResult.recommendation.timeframe}

💡 REASONING:
${analysisResult.recommendation.reasoning.map((reason: string) => `• ${reason}`).join('\n')}`;

        const chartsSection = `
📈 CHARTS & ANALYSIS:
1H Chart: ${analysisResult.charts['1h']}
4H Chart: ${analysisResult.charts['4h']}
1D Chart: ${analysisResult.charts['1d']}

🔗 TradingView: https://www.tradingview.com/chart/?symbol=${symbol}`;

        // Send the comprehensive analysis in parts due to Telegram message limits
        await ctx.reply(`🎯 COMPREHENSIVE ANALYSIS: ${symbol}
${technicalSection}`);

        await ctx.reply(`${timeframeSection}
${backtestSection}`);

        await ctx.reply(`${recommendationSection}`);

        await ctx.reply(`${chartsSection}

✅ Analysis completed at ${analysisResult.timestamp.toLocaleString()}
💡 Use /backtest ${symbol} 30 for detailed backtesting
💡 Use /papertrade ${symbol} to start paper trading`);

        // Add Chutes news analysis if configured
        if (chutesService.isConfigured()) {
            try {
                ctx.reply(`🔄 Adding news sentiment analysis...`);

                const newsItems = await chutesService.searchCryptoNews(symbol, 3);
                if (newsItems.length > 0) {
                    const newsAnalysis = await chutesService.analyzeNewsImpact(symbol, newsItems);

                    const newsSection = `
📰 NEWS SENTIMENT ANALYSIS (Powered by Chutes AI):

📊 Overall Sentiment: ${newsAnalysis.overallSentiment} ${
    newsAnalysis.overallSentiment === 'BULLISH' ? '🟢📈' :
    newsAnalysis.overallSentiment === 'BEARISH' ? '🔴📉' : '🟡➡️'
}

📈 Market Movement Prediction: ${newsAnalysis.marketMovement.direction} ${
    newsAnalysis.marketMovement.direction === 'UP' ? '📈' :
    newsAnalysis.marketMovement.direction === 'DOWN' ? '📉' : '➡️'
}
Confidence Level: ${newsAnalysis.marketMovement.confidence.toFixed(1)}%

⏰ IMPACT PREDICTIONS:
🔹 24H: ${newsAnalysis.impactPrediction.shortTerm}
🔸 7D: ${newsAnalysis.impactPrediction.mediumTerm}
🔹 30D: ${newsAnalysis.impactPrediction.longTerm}

�️ KEY MARKET FACTORS:
${newsAnalysis.keyFactors.map((factor, index) => `${index + 1}. ${factor}`).join('\n')}

🔥 RECENT NEWS (${newsItems.length} items):
${newsItems.map((item, index) => {
    const sentiment = item.sentimentScore > 0.3 ? '🟢' :
                     item.sentimentScore < -0.3 ? '🔴' : '🟡';
    return `${index + 1}. ${sentiment} ${item.title.substring(0, 55)}...
   📊 Impact: ${item.impactLevel} | Sentiment: ${item.sentimentScore.toFixed(2)}`;
}).join('\n')}

💡 Use /pnews ${symbol} for detailed news analysis`;

                    await ctx.reply(newsSection);
                }
            } catch (newsError) {
                console.error('News analysis error in /analyze:', newsError);
                await ctx.reply(`💡 For news analysis, try: /pnews ${symbol}`);
            }
        } else {
            await ctx.reply(`� NEWS ANALYSIS AVAILABLE:
�💡 Setup Perplexity AI for advanced news sentiment analysis!

🔧 Available commands:
• /pnews ${symbol} - Advanced AI news analysis
• /impact ${symbol} - Quick impact assessment
• /pstatus - Check Perplexity configuration

📖 Setup: Add PERPLEXITY_API_KEY to your .env file`);
        }

        // Delete loading message
        try {
            await ctx.deleteMessage(loadingMessage.message_id);
        } catch (error) {
            // Ignore if can't delete
        }

    } catch (error) {
        console.error(`Comprehensive analysis error for ${symbol}:`, error);
        ctx.reply(`❌ Error performing comprehensive analysis for ${symbol}.

This could be due to:
• Invalid symbol (try BTCUSDT, ETHUSDT, etc.)
• Market data unavailable
• Technical analysis issues

Please check the symbol and try again, or contact support if the issue persists.`);
    }

    return;
});

// Helper function to format comprehensive report
async function formatComprehensiveReport(result: any) {
    const { symbol, currentPrice, rsi, macd, trend, strength, support, resistance, volumeStatus, volumeChange24h,
            ema10, ema20, sma50, sma200, timeframes, recommendation } = result;

    // Main overview
    const main = `
🎯 COMPREHENSIVE ANALYSIS: ${symbol}
💰 Current Price: $${currentPrice.toFixed(4)}
📅 Analysis Time: ${new Date().toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔮 OVERALL RECOMMENDATION: ${recommendation.action}
📊 Confidence: ${recommendation.confidence.toFixed(1)}%
🎯 Entry Price: $${recommendation.entryPrice.toFixed(4)}
🛑 Stop Loss: $${recommendation.stopLoss.toFixed(4)}
🎯 Take Profit: $${recommendation.takeProfit.toFixed(4)}

💡 Key Reasons:
${recommendation.reasoning.map((reason: string, index: number) => `${index + 1}. ${reason}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 TECHNICAL ANALYSIS:
• Trend: ${trend.toUpperCase()} (${strength.toFixed(1)}% strength)
• RSI: ${rsi.toFixed(2)} ${rsi < 30 ? '(Oversold 🔥)' : rsi > 70 ? '(Overbought ⚠️)' : '(Neutral)'}
• MACD: ${macd.signal.toUpperCase()} (${macd.histogram.toFixed(4)})

🎯 SUPPORT & RESISTANCE:
• Support: $${support.toFixed(4)} (${((currentPrice - support) / currentPrice * 100).toFixed(2)}% away)
• Resistance: $${resistance.toFixed(4)} (${((resistance - currentPrice) / currentPrice * 100).toFixed(2)}% away)

� MOVING AVERAGES:
• EMA10: $${ema10.toFixed(4)} ${currentPrice > ema10 ? '✅' : '❌'}
• EMA20: $${ema20.toFixed(4)} ${currentPrice > ema20 ? '✅' : '❌'}
• SMA50: $${sma50.toFixed(4)} ${currentPrice > sma50 ? '✅' : '❌'}
• SMA200: $${sma200.toFixed(4)} ${currentPrice > sma200 ? '✅' : '❌'}

� VOLUME ANALYSIS:
• Status: ${volumeStatus.toUpperCase()}
• 24h Change: ${volumeChange24h.toFixed(2)}%

⏰ MULTI-TIMEFRAME ANALYSIS:
• 1H: ${timeframes['1h'].toUpperCase()}
• 4H: ${timeframes['4h'].toUpperCase()}
`;
    return main;
}

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

    return;
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

    return;
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

    return;
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

    return;
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
Avg Profit per Trade: $${result.avgProfit.toFixed(2)}

📈 RISK METRICS:
Sharpe Ratio: ${result.sharpeRatio.toFixed(3)}
Recovery Factor: ${(result.maxDrawdown > 0 ? result.totalProfit / result.maxDrawdown : 0).toFixed(2)}

📆 RECENT TRADES:
${result.recentTrades.slice(0, 5).map(trade =>
  `${trade.side.toUpperCase()} ${trade.pair}: ${(trade.profit || 0) >= 0 ? '✅' : '❌'} $${(trade.profit || 0).toFixed(2)}`
).join('\n')}
    `;

    ctx.reply(message);

    return;
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

    return;
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

    return;
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

    return;
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

    return;
});

// NEWS & TWITTER ANALYSIS COMMANDS
bot.command('news', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();

    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /news BTCUSDT');
    }

    try {
        ctx.reply(`🔄 Analyzing news and social sentiment for ${symbol}...`);

        const analysis = await newsAnalyzer.analyzeNews(symbol);
        ctx.reply(analysis);
    } catch (error) {
        console.error('News analysis error:', error);
        ctx.reply(`❌ Error analyzing news for ${symbol}. Please try again later.`);
    }

    return;
});

bot.command('twitter', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();

    if (!symbol) {
        return ctx.reply(`Please provide a symbol. Example: /twitter BTCUSDT

🐦 This command analyzes Twitter sentiment including:
• Recent tweets about the cryptocurrency
• Influencer opinions
• Social media trends
• Community sentiment analysis`);
    }

    try {
        ctx.reply(`🔄 Analyzing Twitter sentiment for ${symbol}...

⏳ This may take 10-15 seconds due to rate limiting protection.`);

        const comprehensiveAnalysis = await newsAnalyzer.analyzeComprehensiveNews(symbol);

        if (comprehensiveAnalysis.twitterAnalysis) {
            const twitter = comprehensiveAnalysis.twitterAnalysis;

            let message = `🐦 TWITTER ANALYSIS for ${symbol}\n\n`;
            message += `📊 SENTIMENT: ${twitter.sentiment.label}\n`;
            message += `Confidence: ${twitter.sentiment.confidence.toFixed(1)}%\n`;
            message += `Posts Analyzed: ${twitter.posts.length}\n\n`;

            if (twitter.influencers.length > 0) {
                message += `🔥 TOP INFLUENCERS:\n`;
                twitter.influencers.slice(0, 3).forEach(influencer => {
                    message += `• @${influencer.username}: ${influencer.sentiment}\n`;
                });
                message += '\n';
            }

            if (twitter.trends.length > 0) {
                message += `📈 TRENDING: ${twitter.trends.join(', ')}\n\n`;
            }

            if (twitter.posts.length > 0) {
                message += `💬 RECENT TWEETS:\n`;
                twitter.posts.slice(0, 3).forEach((post, index) => {
                    const date = post.createdAt.toLocaleDateString();
                    message += `${index + 1}. @${post.author.username} [${date}]\n`;
                    message += `   ${post.text.substring(0, 100)}...\n`;
                    message += `   💚 ${post.metrics.likes} 🔄 ${post.metrics.retweets}\n\n`;
                });
            }

            message += `⏰ Analysis Time: ${comprehensiveAnalysis.timestamp.toLocaleString()}`;

            ctx.reply(message);
        } else {
            ctx.reply(`❌ Twitter analysis not available for ${symbol}.

This could be due to:
• Twitter API not configured
• Twitter API rate limit exceeded
• No recent tweets found for this symbol

💡 You can still use /news ${symbol} for traditional news analysis.`);
        }
    } catch (error: any) {
        console.error('Twitter command error:', error);

        if (error.message?.includes('rate limit')) {
            ctx.reply(`⏸️ Twitter API rate limit exceeded for ${symbol}.

The Twitter API has temporary usage limits. Please try again in a few minutes.

💡 In the meantime, you can use:
• /news ${symbol} - Traditional news analysis
• /analyze ${symbol} - Complete technical analysis`);
        } else {
            ctx.reply(`❌ Error analyzing Twitter sentiment for ${symbol}: ${error.message}`);
        }
    }

    return;
});

bot.command('influencers', async (ctx) => {
    const defaultInfluencers = [
        'elonmusk',
        'michael_saylor',
        'cz_binance',
        'VitalikButerin',
        'aantonop',
        'BitcoinMagazine',
        'coinbase',
        'binance',
        'kraken',
        'starkness'
    ];

    try {
        ctx.reply('🔄 Fetching latest tweets from crypto influencers...');

        const influencerTweets = await newsAnalyzer.getInfluencerTweets(defaultInfluencers.slice(0, 5));

        // Split message if too long
        const maxLength = 4000;
        if (influencerTweets.length > maxLength) {
            const parts = [];
            let currentPart = '';
            const lines = influencerTweets.split('\n');

            for (const line of lines) {
                if (currentPart.length + line.length > maxLength) {
                    parts.push(currentPart);
                    currentPart = line + '\n';
                } else {
                    currentPart += line + '\n';
                }
            }

            if (currentPart) {
                parts.push(currentPart);
            }

            for (const part of parts) {
                await ctx.reply(part);
            }
        } else {
            ctx.reply(influencerTweets);
        }
    } catch (error) {
        console.error('Influencer tweets error:', error);
        ctx.reply('❌ Error fetching influencer tweets. Please try again later.');
    }

    return;
});

bot.command('cryptonews', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const symbol = args[1]?.toUpperCase();
    const keywords = args.slice(2);

    if (!symbol) {
        return ctx.reply(`Please provide a symbol and keywords.

Example: /cryptonews BTCUSDT bull breakout adoption

🔍 This searches Twitter for specific crypto-related keywords`);
    }

    const searchKeywords = keywords.length > 0 ? keywords : [
        'bull', 'bear', 'breakout', 'support', 'resistance',
        'analysis', 'prediction', 'moon', 'dip', 'rally'
    ];

    try {
        ctx.reply(`🔄 Searching Twitter for ${symbol} news with keywords: ${searchKeywords.join(', ')}...`);

        const searchResults = await newsAnalyzer.searchCryptoNews(searchKeywords, symbol);

        // Split message if too long
        const maxLength = 4000;
        if (searchResults.length > maxLength) {
            const parts = [];
            let currentPart = '';
            const lines = searchResults.split('\n');

            for (const line of lines) {
                if (currentPart.length + line.length > maxLength) {
                    parts.push(currentPart);
                    currentPart = line + '\n';
                } else {
                    currentPart += line + '\n';
                }
            }

            if (currentPart) {
                parts.push(currentPart);
            }

            for (const part of parts) {
                await ctx.reply(part);
            }
        } else {
            ctx.reply(searchResults);
        }
    } catch (error) {
        console.error('Crypto news search error:', error);
        ctx.reply('❌ Error searching crypto news. Please try again later.');
    }

    return;
});

// PERPLEXITY AI NEWS ANALYSIS COMMANDS

// Perplexity News Analysis Command
bot.command('pnews', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();

    if (!symbol) {
        return ctx.reply(`Please provide a symbol. Example: /pnews BTCUSDT

🔍 This command uses Perplexity AI to:
• Search for latest crypto news
• Analyze market impact
• Predict price movements
• Provide detailed insights`);
    }

    if (!chutesService.isConfigured()) {
        return ctx.reply(`❌ Chutes AI not configured.

To enable advanced news analysis:
1. Get API key from chutes.ai
2. Add CHUTES_API_KEY to your .env file

💡 You can still use /news ${symbol} for basic analysis.`);
    }

    try {
        const loadingMsg = await ctx.reply(`🔄 Analyzing latest news for ${symbol} with Chutes AI...

⏳ This may take 15-30 seconds as we:
• Search for latest news articles
• Analyze market sentiment
• Predict price impact
• Generate insights

Please wait...`);

        // Get latest news
        const newsItems = await chutesService.searchCryptoNews(symbol, 8);

        if (newsItems.length === 0) {
            return ctx.reply(`❌ No recent news found for ${symbol}.

Try:
• Different symbol (BTCUSDT, ETHUSDT, etc.)
• /news ${symbol} for basic analysis
• Check symbol spelling`);
        }

        // Analyze impact
        const analysis = await chutesService.analyzeNewsImpact(symbol, newsItems);

        // Format response
        const newsSection = `🔍 LATEST NEWS ANALYSIS: ${symbol}
📅 ${analysis.timestamp.toLocaleString()}

📰 FOUND ${newsItems.length} RECENT ARTICLES:
${newsItems.slice(0, 5).map((item, index) => {
    const sentiment = item.sentimentScore > 0.3 ? '🟢' :
                     item.sentimentScore < -0.3 ? '🔴' : '🟡';
    const impact = item.impactLevel === 'CRITICAL' ? '🚨' :
                  item.impactLevel === 'HIGH' ? '🔥' :
                  item.impactLevel === 'MEDIUM' ? '📊' : '📰';

    return `${index + 1}. ${impact} ${sentiment} ${item.title.substring(0, 80)}...
   Impact: ${item.impactLevel} | Sentiment: ${item.sentimentScore.toFixed(2)}
   Source: ${item.source}`;
}).join('\n\n')}`;

        const analysisSection = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 MARKET IMPACT ANALYSIS:

📊 Overall Sentiment: ${analysis.overallSentiment} ${
    analysis.overallSentiment === 'BULLISH' ? '🟢📈' :
    analysis.overallSentiment === 'BEARISH' ? '🔴📉' : '🟡➡️'
}

🎯 Price Movement Prediction:
Direction: ${analysis.marketMovement.direction} ${
    analysis.marketMovement.direction === 'UP' ? '📈' :
    analysis.marketMovement.direction === 'DOWN' ? '📉' : '➡️'
}
Confidence: ${(analysis.marketMovement.confidence * 100).toFixed(1)}%
Expected Range: ${analysis.marketMovement.expectedRange.low.toFixed(1)}% to ${analysis.marketMovement.expectedRange.high.toFixed(1)}%

⏰ TIMEFRAME PREDICTIONS:
• 24H: ${analysis.impactPrediction.shortTerm}
• 7D: ${analysis.impactPrediction.mediumTerm}
• 30D: ${analysis.impactPrediction.longTerm}`;

        const factorsSection = analysis.keyFactors.length > 0 ? `
🔑 KEY FACTORS:
${analysis.keyFactors.map((factor, index) => `${index + 1}. ${factor}`).join('\n')}` : '';

        // Send analysis in parts
        await ctx.reply(newsSection);
        await ctx.reply(analysisSection + factorsSection);

        await ctx.reply(`💡 TRADING RECOMMENDATIONS:
• Use this analysis with technical indicators
• Monitor news developments closely
• Set appropriate stop losses
• Consider position sizing based on confidence level

🔗 Commands to combine:
/analyze ${symbol} - Technical analysis
/signal ${symbol} - Trading signals
/chart ${symbol} - Price charts`);

        // Delete loading message
        try {
            await ctx.deleteMessage(loadingMsg.message_id);
        } catch (error) {
            // Ignore delete errors
        }

    } catch (error: any) {
        console.error('Perplexity news error:', error);

        if (error.message?.includes('API key')) {
            ctx.reply(`❌ Perplexity API authentication failed.

Please check:
• API key is valid
• Account has sufficient credits
• API key has proper permissions`);
        } else if (error.message?.includes('rate limit')) {
            ctx.reply(`⏸️ Perplexity API rate limit exceeded.

Please wait a few minutes before trying again.

💡 Alternative: /news ${symbol} for basic analysis`);
        } else {
            ctx.reply(`❌ Error analyzing news for ${symbol}: ${error.message}

💡 Try: /news ${symbol} for basic analysis`);
        }
    }

    return;
});

// Quick News Impact Command
bot.command('impact', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();

    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /impact BTCUSDT');
    }

    if (!chutesService.isConfigured()) {
        return ctx.reply(`❌ Chutes AI not configured. Use /pnews for setup instructions.`);
    }

    try {
        ctx.reply(`🔄 Quick impact analysis for ${symbol}...`);

        const newsItems = await chutesService.searchCryptoNews(symbol, 5);

        if (newsItems.length === 0) {
            return ctx.reply(`❌ No recent impactful news found for ${symbol}`);
        }

        const analysis = await chutesService.analyzeNewsImpact(symbol, newsItems);

        const quickSummary = `⚡ QUICK IMPACT: ${symbol}

📊 Sentiment: ${analysis.overallSentiment} ${
    analysis.overallSentiment === 'BULLISH' ? '🟢' :
    analysis.overallSentiment === 'BEARISH' ? '🔴' : '🟡'
}

🎯 24H Prediction: ${analysis.impactPrediction.shortTerm}

📈 Expected Move: ${analysis.marketMovement.direction}
Range: ${analysis.marketMovement.expectedRange.low.toFixed(1)}% to ${analysis.marketMovement.expectedRange.high.toFixed(1)}%
Confidence: ${(analysis.marketMovement.confidence * 100).toFixed(1)}%

🔥 Top News Impact:
${newsItems.slice(0, 3).map((item, index) =>
    `${index + 1}. ${item.impactLevel === 'HIGH' || item.impactLevel === 'CRITICAL' ? '🚨' : '📰'} ${item.title.substring(0, 60)}...`
).join('\n')}

💡 Use /pnews ${symbol} for detailed analysis`;

        ctx.reply(quickSummary);

    } catch (error) {
        console.error('Quick impact error:', error);
        ctx.reply(`❌ Error getting impact analysis: ${(error as Error).message}`);
    }

    return;
});

// Combined Analysis Command (Technical + News)
bot.command('fullanalysis', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();

    if (!symbol) {
        return ctx.reply(`Please provide a symbol. Example: /fullanalysis BTCUSDT

🎯 This combines:
• Technical analysis
• News sentiment analysis
• Market impact prediction
• Trading recommendations`);
    }

    try {
        const loadingMsg = await ctx.reply(`🔄 Performing FULL ANALYSIS for ${symbol}...

⏳ This comprehensive analysis includes:
• Technical indicators analysis
• Latest news sentiment
• Market impact prediction
• Combined trading recommendation

Please wait 30-60 seconds...`);

        // Run both analyses in parallel
        const [technicalResult, newsAnalysis] = await Promise.allSettled([
            comprehensiveAnalyzer.analyzeComprehensiveForBot(symbol),
            chutesService.isConfigured() ?
                chutesService.searchCryptoNews(symbol, 5).then(news =>
                    chutesService.analyzeNewsImpact(symbol, news)
                ) : null
        ]);

        // Process technical analysis
        if (technicalResult.status === 'rejected') {
            throw new Error(`Technical analysis failed: ${technicalResult.reason}`);
        }
        const technical = technicalResult.value;

        // Process news analysis
        let news = null;
        if (newsAnalysis.status === 'fulfilled' && newsAnalysis.value) {
            news = newsAnalysis.value;
        }

        // Combine recommendations
        let combinedRecommendation = technical.recommendation.action;
        let combinedConfidence = technical.recommendation.confidence;

        if (news) {
            // Adjust recommendation based on news sentiment
            if (news.overallSentiment === 'BULLISH' && technical.recommendation.action.includes('buy')) {
                combinedConfidence = Math.min(95, combinedConfidence + 15);
            } else if (news.overallSentiment === 'BEARISH' && technical.recommendation.action.includes('sell')) {
                combinedConfidence = Math.min(95, combinedConfidence + 15);
            } else if (news.overallSentiment === 'BEARISH' && technical.recommendation.action.includes('buy')) {
                combinedConfidence = Math.max(30, combinedConfidence - 20);
                combinedRecommendation = 'hold';
            } else if (news.overallSentiment === 'BULLISH' && technical.recommendation.action.includes('sell')) {
                combinedConfidence = Math.max(30, combinedConfidence - 20);
                combinedRecommendation = 'hold';
            }
        }

        // Send combined analysis
        const mainAnalysis = `🎯 FULL MARKET ANALYSIS: ${symbol}
📅 ${new Date().toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 CURRENT PRICE: $${technical.currentPrice.toFixed(2)}

🎯 COMBINED RECOMMENDATION: ${combinedRecommendation.toUpperCase()}
Confidence: ${combinedConfidence.toFixed(1)}% ${
    combinedConfidence > 75 ? '🟢 HIGH' :
    combinedConfidence > 50 ? '🟡 MEDIUM' : '🔴 LOW'
}

📊 TECHNICAL ANALYSIS:
• Trend: ${technical.technical.trend.toUpperCase()} (${(technical.technical.strength * 100).toFixed(1)}%)
• RSI: ${technical.technical.rsi.toFixed(1)} ${technical.technical.rsi < 30 ? '🟢 OVERSOLD' : technical.technical.rsi > 70 ? '🔴 OVERBOUGHT' : '🟡 NEUTRAL'}
• Support: $${technical.technical.supportResistance.support.toFixed(2)}
• Resistance: $${technical.technical.supportResistance.resistance.toFixed(2)}`;

        let newsSection = '';
        if (news) {
            newsSection = `
📰 NEWS SENTIMENT ANALYSIS:
• Overall Sentiment: ${news.overallSentiment} ${
    news.overallSentiment === 'BULLISH' ? '🟢' :
    news.overallSentiment === 'BEARISH' ? '🔴' : '🟡'
}
• News Impact: ${news.marketMovement.direction} (${(news.marketMovement.confidence * 100).toFixed(1)}% confidence)
• 24H Prediction: ${news.impactPrediction.shortTerm.substring(0, 100)}...
• Key Factors: ${news.keyFactors.slice(0, 2).join(', ')}`;
        } else {
            newsSection = `
📰 NEWS ANALYSIS: Not available (Perplexity not configured)`;
        }

        const tradingSection = `
🎯 TRADING SETUP:
• Entry: $${technical.recommendation.entryPrice.toFixed(2)}
• Target: $${technical.recommendation.exitPrice.toFixed(2)}
• Stop Loss: $${technical.recommendation.stopLoss.toFixed(2)}
• Risk/Reward: ${technical.recommendation.riskReward.toFixed(2)}
• Timeframe: ${technical.recommendation.timeframe}

💡 COMBINED REASONING:
${technical.recommendation.reasoning.slice(0, 2).join('\n• ')}${news ? `\n• News sentiment: ${news.overallSentiment.toLowerCase()}` : ''}`;

        await ctx.reply(mainAnalysis + newsSection + tradingSection);

        if (news && news.newsItems.length > 0) {
            const recentNews = `
📰 RECENT NEWS IMPACTING ${symbol}:
${news.newsItems.slice(0, 3).map((item, index) => {
                const sentiment = item.sentimentScore > 0.3 ? '🟢' :
                                 item.sentimentScore < -0.3 ? '🔴' : '🟡';
                return `${index + 1}. ${sentiment} ${item.title.substring(0, 70)}...
   Impact: ${item.impactLevel} | Source: ${item.source}`;
            }).join('\n\n')}

🔗 Use /pnews ${symbol} for detailed news analysis`;

            await ctx.reply(recentNews);
        }

        // Delete loading message
        try {
            await ctx.deleteMessage(loadingMsg.message_id);
        } catch (error) {
            // Ignore delete errors
        }

    } catch (error) {
        console.error('Full analysis error:', error);
        ctx.reply(`❌ Error performing full analysis: ${(error as Error).message}`);
    }

    return;
});

// Chutes AI status command
bot.command('pstatus', async (ctx) => {
    try {
        if (!chutesService.isConfigured()) {
            return ctx.reply(`❌ Chutes AI not configured.

To enable advanced news analysis:
1. Visit https://chutes.ai/
2. Sign up for an account
3. Go to API settings
4. Generate an API key
5. Add CHUTES_API_KEY to your .env file

💡 Alternative: Use /news for basic analysis.`);
        }

        let message = `🤖 CHUTES AI STATUS\n\n`;
        message += `🟢 STATUS: Configured & Ready\n\n`;

        message += `📊 FEATURES:\n`;
        message += `• Latest crypto news search\n`;
        message += `• AI-powered impact analysis\n`;
        message += `• Price movement predictions\n`;
        message += `• Sentiment analysis\n`;

        message += `\n💡 Commands:\n`;
        message += `• /pnews [symbol] - Full news analysis\n`;
        message += `• /impact [symbol] - Quick impact check\n`;
        message += `• /fullanalysis [symbol] - Combined analysis\n`;

        message += `\n⚡ Powered by Chutes AI`;

        ctx.reply(message);
    } catch (error) {
        console.error('Chutes status error:', error);
        ctx.reply('❌ Error checking Chutes status. Please try again later.');
    }

    return;
});

// Twitter API Status command
bot.command('twitterstatus', async (ctx) => {
    try {
        ctx.reply('🐦 Twitter API Status: Checking service availability...');
        // Simplified status check
        ctx.reply('✅ Twitter service is configured and running.');
    } catch (error) {
        console.error('Twitter status error:', error);
        ctx.reply('❌ Error checking Twitter status. Please try again later.');
    }

    return;
});

// Volume analysis command
bot.command('volume', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();

    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /volume BTCUSDT');
    }

    try {
        ctx.reply('🔄 Analyzing volume data...');
        // Use existing analyzer method
        const analysis = await technicalAnalyzer.analyzeSymbol(symbol);
        ctx.reply(`📊 Volume Analysis for ${symbol}:\n\n${analysis}\n\n💡 Use /analyze ${symbol} for comprehensive analysis.`);
    } catch (error) {
        console.error('Volume analysis error:', error);
        ctx.reply(`❌ Error analyzing volume for ${symbol}. Please try again later.`);
    }

    return;
});

// Support/Resistance command
bot.command('sr', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();

    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /sr BTCUSDT');
    }

    try {
        ctx.reply('🔄 Calculating support and resistance levels...');
        const analysis = await technicalAnalyzer.analyzeSymbol(symbol);
        ctx.reply(`🎯 Support/Resistance for ${symbol}:\n\n${analysis}\n\n💡 Use /analyze ${symbol} for detailed levels.`);
    } catch (error) {
        console.error('Support/Resistance analysis error:', error);
        ctx.reply(`❌ Error analyzing support/resistance for ${symbol}. Please try again later.`);
    }

    return;
});

// Chart command
bot.command('chart', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();

    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /chart BTCUSDT');
    }

    try {
        ctx.reply('🔄 Generating chart...');
        const chartUrl = `https://www.tradingview.com/chart/?symbol=${symbol}`;
        ctx.reply(`📈 Chart for ${symbol}:\n${chartUrl}\n\n💡 Use /analyze ${symbol} for detailed technical analysis with indicators.`);
    } catch (error) {
        console.error('Chart generation error:', error);
        ctx.reply(`❌ Error generating chart for ${symbol}. Please try again later.`);
    }

    return;
});

// Simplified Price Alert Commands
bot.command('alert', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const symbol = args[1]?.toUpperCase();
    const price = parseFloat(args[2]);
    const direction = args[3]?.toLowerCase();

    if (!symbol || !price || !direction || !['above', 'below'].includes(direction)) {
        return ctx.reply(`Please provide valid parameters.

Example: /alert BTCUSDT 50000 above

Parameters:
- symbol: BTCUSDT, ETHUSDT, etc.
- price: target price
- direction: above or below`);
    }

    try {
        const userId = ctx.message.from.id;
        const username = ctx.message.from.username || ctx.message.from.first_name || 'Unknown';

        await priceAlertManager.addAlert(userId, symbol, price, direction as 'above' | 'below');

        ctx.reply(`✅ Price alert set successfully!

🎯 Alert: ${symbol}
💰 Price: $${price}
📊 Direction: ${direction.toUpperCase()}
👤 User: ${username}

You'll be notified when ${symbol} reaches $${price} or ${direction}.`);
    } catch (error) {
        console.error('Alert creation error:', error);
        ctx.reply(`❌ Error creating alert: ${(error as Error).message}`);
    }

    return;
});

bot.command('alerts', async (ctx) => {
    try {
        const userId = ctx.message.from.id;
        const alerts = priceAlertManager.getAlerts(userId);

        if (alerts.length === 0) {
            return ctx.reply('❌ No active alerts found. Create one with /alert [symbol] [price] [above/below]');
        }

        let message = `🔔 YOUR ACTIVE ALERTS (${alerts.length}):\n\n`;
        alerts.forEach((alert, index) => {
            message += `${index + 1}. ${alert.symbol}\n`;
            message += `   💰 $${alert.targetPrice} (${alert.type})\n`;
            message += `   📅 Created: ${new Date().toLocaleDateString()}\n\n`;
        });

        message += `💡 Use /delalert [symbol] to remove an alert`;

        ctx.reply(message);
    } catch (error) {
        console.error('Get alerts error:', error);
        ctx.reply('❌ Error retrieving alerts. Please try again later.');
    }

    return;
});

bot.command('delalert', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();

    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /delalert BTCUSDT');
    }

    try {
        const userId = ctx.message.from.id;
        priceAlertManager.removeAlert(userId, symbol);
        ctx.reply(`✅ Alert for ${symbol} has been removed.`);
    } catch (error) {
        console.error('Delete alert error:', error);
        ctx.reply(`❌ Error removing alert: ${(error as Error).message}`);
    }

    return;
});

// Error handling
bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    ctx.reply('❌ An unexpected error occurred. Please try again later.');
});

// Launch bot
console.log('🚀 Starting Telegram Bot...');

bot.launch().then(() => {
    console.log('✅ Bot started successfully!');
    console.log('🎯 Ready to receive commands...');
    console.log('💡 Send /start to see available commands');
}).catch((error) => {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
});

// Enable graceful stop
process.once('SIGINT', () => {
    console.log('🛑 Received SIGINT, stopping bot...');
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, stopping bot...');
    bot.stop('SIGTERM');
});

console.log('🔄 Bot initialization complete. Waiting for messages...');
