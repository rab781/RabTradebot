import { Telegraf } from 'telegraf';
import { config } from 'dotenv';
import { TechnicalAnalyzer } from './services/technicalAnalyzer';
import { NewsAnalyzer } from './services/newsAnalyzer';
import { SignalGenerator } from './services/signalGenerator';
import { AdvancedAnalyzer } from './services/advancedAnalyzer';
import { PriceAlertManager } from './services/priceAlertManager';
import { TradingViewService } from './services/TradingViewService';

// New freqtrade-inspired services
import { BacktestEngine } from './services/backtestEngine';
import { PaperTradingEngine, PaperTradingConfig } from './services/paperTradingEngine';
import { DataManager, HistoricalDataConfig } from './services/dataManager';
import { StrategyOptimizer, OptimizationConfig } from './services/strategyOptimizer';
import { SampleStrategy } from './strategies/SampleStrategy';
import { OpenClawStrategy } from './strategies/OpenClawStrategy';
import { IStrategy } from './types/strategy';

// ML & Advanced Analytics
import { SimpleGRUModel } from './ml/simpleGRUModel';
import { FeatureEngineeringService } from './services/featureEngineering';
import { PublicCryptoService } from './services/publicCryptoService';
import { BinanceService } from './services/binanceService';
import { OHLCVCandle } from './types/dataframe';

import { ImageChartService } from './services/imageChartService';
import { ChutesService } from './services/chutesService';

// Database Service
import { db } from './services/databaseService';

// Prediction Verifier
import { predictionVerifier } from './services/predictionVerifier';

// Web Dashboard
import { startWebServer, stateManager } from './webServer';
import BotStateManager from './services/botStateManager';

// Load environment variables
config();

// Initialize bot and existing services with extended timeout
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!, {
  handlerTimeout: 600000, // 10 minutes timeout for long-running operations
});
const technicalAnalyzer = new TechnicalAnalyzer();
const newsAnalyzer = new NewsAnalyzer(); // Keep for backwards compatibility
const priceAlertManager = new PriceAlertManager();
const advancedAnalyzer = new AdvancedAnalyzer();

// Initialize TradingView service
const tradingViewService = new TradingViewService({
  theme: 'dark',
  interval: '5m',
  symbol: 'BINANCE:BTCUSDT',
  containerId: 'analysis-chart',
});

// Initialize new freqtrade-inspired services
const dataManager = new DataManager();
const strategy = new SampleStrategy();
const openClawStrategy = new OpenClawStrategy();
const publicCryptoService = new PublicCryptoService();

// Initialize ML services
const mlModel = new SimpleGRUModel();
const featureService = new FeatureEngineeringService(false); // No DB caching for bot

// ML model state
let mlModelLoaded = false;
const mlModelPath = './models/GRU_Production';

// Initialize Binance API service (health checks + authenticated account info)
const binanceService = new BinanceService();

// Initialize Chutes AI service (must be before SignalGenerator)
const chutesService = new ChutesService();
const imageChartService = new ImageChartService();

// Initialize SignalGenerator with Chutes
const signalGenerator = new SignalGenerator(technicalAnalyzer, chutesService);

// Import comprehensive analyzer
import { SimpleComprehensiveAnalyzer } from './services/simpleComprehensiveAnalyzer';
const comprehensiveAnalyzer = new SimpleComprehensiveAnalyzer();

// State management for paper trading and backtesting
const userSessions = new Map<
  number,
  {
    paperTrading?: PaperTradingEngine;
    lastBacktest?: any;
    strategy?: IStrategy;
  }
>();

// Helper function to get or create user session
function getUserSession(userId: number) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {});
  }
  return userSessions.get(userId)!;
}

// Helper function to ensure user exists in database
async function ensureUser(ctx: any) {
  const telegramId = ctx.message.from.id;
  const userData = {
    username: ctx.message.from.username,
    firstName: ctx.message.from.first_name,
    lastName: ctx.message.from.last_name,
  };

  const user = await db.getOrCreateUser(telegramId, userData);
  return user;
}

// Start command
bot.command('start', async (ctx) => {
  // Ensure user exists in database
  await ensureUser(ctx);

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

🔧 STATUS CHECKS:
/apistatus - Check Binance API connectivity & auth
/pstatus - Check Chutes AI configuration
/mlstatus - Check ML model status

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
/fullanalysis [symbol] - Technical + News analysis

🔹 🦅 OPENCLAW & ML (NEW!):
/openclaw [symbol] - Advanced ML-powered analysis
   • Market regime detection
   • Multi-indicator confluence
   • Smart entry/exit signals
/mlpredict [symbol] - LSTM price prediction
   • AI-powered forecast
   • Confidence scoring
/trainmodel [symbol] [days] - Train ML model
   Example: /trainmodel BTCUSDT 180
/mlstatus - Check ML model status

🔹 🐦 NEWS & SOCIAL MEDIA:
/pnews [symbol] - AI news analysis (Chutes - Real-time)
/impact [symbol] - Quick news impact overview (Chutes)
/news [symbol] - Comprehensive news analysis (Chutes - Real-time)

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

� 📊 ANALYTICS & PERFORMANCE:
/stats - Your trading statistics & ML performance
/mlstats [symbol] - ML prediction accuracy stats
/strategystats [symbol] - Compare strategy performance
/leaderboard - Top symbols & strategies leaderboard

🔧 STATUS CHECKS:
/apistatus - Check Binance API connectivity & authentication
   • Public API reachability & latency
   • Clock offset with Binance servers
   • Private API auth (if keys configured)
   • Account permissions & non-zero balances
   • Rate limit info
/pstatus - Check Chutes AI configuration
/mlstatus - Check ML model status

📈 NEW FEATURES:
• 🦅 OpenClaw strategy with ML integration
• 🧠 GRU price predictions with tracking
• 🤖 AI-powered market analysis
• 📊 Performance analytics & statistics
• 💾 Automatic data caching

All commands support major cryptocurrencies (BTCUSDT, ETHUSDT, etc.)
`;
  ctx.reply(helpMessage);
});

// Existing commands (keeping them for backward compatibility)
bot.command('signal', async (ctx) => {
  const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
  const username = ctx.message.from.username || ctx.message.from.first_name || 'Unknown';
  const userId = ctx.message.from.id;

  console.log(
    `[${new Date().toISOString()}] User: ${username} (${userId}) requested signal for: ${symbol || 'undefined'}`
  );

  // Track command
  stateManager.incrementCommandCount();

  if (!symbol) {
    return ctx.reply('Please provide a symbol. Example: /signal BTCUSDT');
  }

  try {
    ctx.reply('🔄 Generating signal...');
    const signal = await signalGenerator.generateSignal(symbol);

    // Add signal to dashboard
    stateManager.addSignal({
      symbol,
      action: signal.includes('BUY') ? 'BUY' : signal.includes('SELL') ? 'SELL' : 'HOLD',
      price: 0, // Will be updated with actual price
      confidence: 0.75, // Default confidence
      timestamp: new Date(),
      indicators: {},
    });

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

  console.log(
    `[${new Date().toISOString()}] User: ${username} (${userId}) requested comprehensive analysis for: ${symbol || 'undefined'}`
  );

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

    const backtestSection =
      analysisResult.backtests.length > 0
        ? `
🔬 BACKTEST RESULTS (${analysisResult.backtests[0].period}):
Strategy: ${analysisResult.backtests[0].strategy}
Win Rate: ${analysisResult.backtests[0].winRate.toFixed(1)}%
Total Return: ${analysisResult.backtests[0].totalReturn.toFixed(2)}%
Sharpe Ratio: ${analysisResult.backtests[0].sharpeRatio.toFixed(2)}
Max Drawdown: ${analysisResult.backtests[0].maxDrawdown.toFixed(2)}%
Best Trade: ${analysisResult.backtests[0].bestTrade.toFixed(2)}%
Worst Trade: ${analysisResult.backtests[0].worstTrade.toFixed(2)}%
Avg Duration: ${Math.round(analysisResult.backtests[0].avgTradeDuration / 60)} hours`
        : `
🔬 BACKTEST RESULTS:
Insufficient data for backtesting`;

    const recommendationSection = `
🎯 TRADING RECOMMENDATION:
Action: ${analysisResult.recommendation.action.toUpperCase()} ${
      analysisResult.recommendation.action === 'strong_buy'
        ? '🟢🟢'
        : analysisResult.recommendation.action === 'buy'
          ? '🟢'
          : analysisResult.recommendation.action === 'strong_sell'
            ? '🔴🔴'
            : analysisResult.recommendation.action === 'sell'
              ? '🔴'
              : '🟡'
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

        // Generate and send charts
        try {
            await ctx.reply('🔄 Generating charts...');
            const timeframes = ['1h', '4h', '1d'];

            for (const tf of timeframes) {
                try {
                    // Get data efficiently (limit to 100 candles)
                    const data = await dataManager.getRecentData(symbol, tf, 100);

                    if (!data || data.length === 0) {
                        console.warn(`[Analyze] No chart data available for ${symbol} ${tf}`);
                        continue;
                    }

                    // Convert data to format expected by ImageChartService
                    const chartData = data.map(d => ({
                        t: d.timestamp,
                        o: d.open,
                        h: d.high,
                        l: d.low,
                        c: d.close,
                        v: d.volume
                    }));

                    const chartResult = await imageChartService.generateCandlestickChart(symbol, tf, chartData);
                    const patternInfo = chartResult.patterns.length > 0
                        ? `\n📊 Patterns: ${chartResult.patterns.map(p => `${p.name} (${p.confidence}%)`).join(', ')}`
                        : '';
                    await ctx.replyWithPhoto({ source: chartResult.buffer }, { caption: `${symbol} ${tf} Chart${patternInfo}` });
                } catch (tfChartError) {
                    console.error(`Chart generation failed for ${symbol} ${tf}:`, tfChartError);
                }
            }
        } catch (chartError) {
            console.error('Chart generation error in /analyze:', chartError);
            await ctx.reply('⚠️ Could not generate chart images, but analysis continues...');
        }
      }
    } catch (chartError) {
      console.error('Chart generation error in /analyze:', chartError);
      await ctx.reply('⚠️ Could not generate chart images, but analysis continues...');
    }

    await ctx.reply(`${recommendationSection}`);

    await ctx.reply(`
✅ Analysis completed at ${analysisResult.timestamp.toLocaleString()}
💡 Use /backtest ${symbol} 30 for detailed backtesting
💡 Use /papertrade ${symbol} to start paper trading`);

    // Add Chutes news analysis if configured
    if (chutesService.isConfigured()) {
      try {
        ctx.reply(`🔄 Adding news sentiment analysis...`);

        const newsItems = await chutesService.searchCryptoNews(symbol, 5);
        if (newsItems.length > 0) {
          const newsAnalysis = await chutesService.analyzeNewsImpact(symbol, newsItems);

          const newsSection = `
📰 NEWS SENTIMENT ANALYSIS (Powered by Chutes AI):

📊 Overall Sentiment: ${newsAnalysis.overallSentiment} ${
            newsAnalysis.overallSentiment === 'BULLISH'
              ? '🟢📈'
              : newsAnalysis.overallSentiment === 'BEARISH'
                ? '🔴📉'
                : '🟡➡️'
          }

📈 Market Movement Prediction: ${newsAnalysis.marketMovement.direction} ${
            newsAnalysis.marketMovement.direction === 'UP'
              ? '📈'
              : newsAnalysis.marketMovement.direction === 'DOWN'
                ? '📉'
                : '➡️'
          }
Confidence Level: ${newsAnalysis.marketMovement.confidence.toFixed(1)}%

⏰ IMPACT PREDICTIONS:
🔹 24H: ${newsAnalysis.impactPrediction.shortTerm}
🔸 7D: ${newsAnalysis.impactPrediction.mediumTerm}
🔹 30D: ${newsAnalysis.impactPrediction.longTerm}

️ KEY MARKET FACTORS:
${newsAnalysis.keyFactors.map((factor, index) => `${index + 1}. ${factor}`).join('\n')}

🔥 RECENT NEWS (${newsItems.length} items):
${newsItems
  .map((item, index) => {
    const sentiment = item.sentimentScore > 0.3 ? '🟢' : item.sentimentScore < -0.3 ? '🔴' : '🟡';
    return `${index + 1}. ${sentiment} ${item.title.substring(0, 55)}...
   📊 Impact: ${item.impactLevel} | Sentiment: ${item.sentimentScore.toFixed(2)}`;
  })
  .join('\n')}

💡 Use /pnews ${symbol} for detailed news analysis`;

          await ctx.reply(newsSection);
        }
      } catch (newsError) {
        console.error('News analysis error in /analyze:', newsError);
        await ctx.reply(`💡 For news analysis, try: /pnews ${symbol}`);
      }
    } else {
      await ctx.reply(`📰 NEWS ANALYSIS AVAILABLE:
💡 Setup Chutes AI for advanced news sentiment analysis!

🔧 Available commands:
• /pnews ${symbol} - Advanced AI news analysis
• /impact ${symbol} - Quick impact check
• /pstatus - Check Chutes configuration

📖 Setup: Add CHUTES_API_KEY to your .env file`);
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
  const {
    symbol,
    currentPrice,
    rsi,
    macd,
    trend,
    strength,
    support,
    resistance,
    volumeStatus,
    volumeChange24h,
    ema10,
    ema20,
    sma50,
    sma200,
    timeframes,
    recommendation,
  } = result;

  // Extract new strategy fields
  const regime = recommendation.regime || 'UNKNOWN';
  const adx = recommendation.adx || 0;
  const atr = recommendation.atr || 0;

  // Determine directional bias from timeframes
  let bias = 'NEUTRAL';
  if (timeframes['4h'] === 'bullish' && timeframes['1d'] === 'bullish') bias = 'BULLISH 🟢';
  else if (timeframes['4h'] === 'bearish' && timeframes['1d'] === 'bearish') bias = 'BEARISH 🔴';
  else if (timeframes['4h'] === 'bullish') bias = 'BULLISH (Weak) 🟡';
  else if (timeframes['4h'] === 'bearish') bias = 'BEARISH (Weak) 🟡';

  // Main overview
  const main = `
🎯 COMPREHENSIVE ANALYSIS: ${symbol}
💰 Current Price: $${currentPrice.toFixed(4)}
📅 Analysis Time: ${new Date().toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🧠 MARKET CONTEXT:
• Regime: ${regime} ${regime === 'TRENDING' ? '📈' : '↔️'}
• ADX: ${adx.toFixed(1)} ${adx > 25 ? '(Strong Trend)' : '(Weak/Range)'}
• Directional Bias: ${bias}
• ATR (1H): $${atr.toFixed(4)} (Volatility Measure)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔮 OVERALL RECOMMENDATION: ${recommendation.action}
📊 Confidence: ${recommendation.confidence.toFixed(1)}%
🎯 Entry Price: $${recommendation.entryPrice.toFixed(4)}
🛑 Stop Loss: $${recommendation.stopLoss.toFixed(4)} (2x ATR)
🎯 Take Profit: $${recommendation.takeProfit.toFixed(4)} (3x ATR)
⚖️ Risk/Reward: 1:${recommendation.riskReward.toFixed(1)}

💡 Key Reasons:
${recommendation.reasoning.map((reason: string, index: number) => `${index + 1}. ${reason}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 TECHNICAL ANALYSIS:
• Trend: ${trend.toUpperCase()} (${strength.toFixed(1)}% strength)
• RSI: ${rsi.toFixed(2)} ${rsi < 30 ? '(Oversold 🔥)' : rsi > 70 ? '(Overbought ⚠️)' : '(Neutral)'}
• MACD: ${macd.signal.toUpperCase()} (${macd.histogram.toFixed(4)})

🎯 SUPPORT & RESISTANCE:
• Support: $${support.toFixed(4)} (${(((currentPrice - support) / currentPrice) * 100).toFixed(2)}% away)
• Resistance: $${resistance.toFixed(4)} (${(((resistance - currentPrice) / currentPrice) * 100).toFixed(2)}% away)

📈 MOVING AVERAGES:
• EMA10: $${ema10.toFixed(4)} ${currentPrice > ema10 ? '✅' : '❌'}
• EMA20: $${ema20.toFixed(4)} ${currentPrice > ema20 ? '✅' : '❌'}
• SMA50: $${sma50.toFixed(4)} ${currentPrice > sma50 ? '✅' : '❌'}
• SMA200: $${sma200.toFixed(4)} ${currentPrice > sma200 ? '✅' : '❌'}

📊 VOLUME ANALYSIS:
• Status: ${volumeStatus.toUpperCase()}
• 24h Change: ${volumeChange24h.toFixed(2)}%

⏰ MULTI-TIMEFRAME ANALYSIS:
• 1m: ${timeframes['1m']?.toUpperCase() || 'N/A'}
• 5m: ${timeframes['5m']?.toUpperCase() || 'N/A'}
• 15m: ${timeframes['15m']?.toUpperCase() || 'N/A'}
• 1H: ${timeframes['1h']?.toUpperCase() || 'N/A'}
• 4H: ${timeframes['4h']?.toUpperCase() || 'N/A'} ← HIGHER TF
• 1D: ${timeframes['1d']?.toUpperCase() || 'N/A'} ← HIGHER TF
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
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const dataConfig: HistoricalDataConfig = {
      symbol: symbol,
      timeframe: '5m',
      startDate: startDate,
      endDate: endDate,
      limit: 1000,
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
      dryRunWallet: 1000,
    };

    const backtestEngine = new BacktestEngine(strategy, backtestConfig);
    const result = await backtestEngine.runBacktest(historicalData);

    // Store result in user session
    const session = getUserSession(ctx.message.from.id);
    session.lastBacktest = result;

    // Save backtest result to database
    try {
      await db.saveBacktestResult({
        strategyName: strategy.name,
        symbol,
        timeframe: '1h',
        startDate: result.startDate,
        endDate: result.endDate,
        initialBalance: backtestConfig.startingBalance,
        finalBalance: result.finalBalance,
        totalProfit: result.totalProfit,
        totalProfitPct: result.totalProfitPct,
        totalTrades: result.totalTrades,
        winRate: result.winRate,
        profitFactor: result.profitFactor,
        sharpeRatio: result.sharpeRatio,
        maxDrawdown: result.maxDrawdownPct,
        maxDrawdownPct: result.maxDrawdownPct,
        trades: result.trades || [],
        equityCurve: [],
      });

      // Auto-save strategy metrics
      await db.saveStrategyMetricsFromBacktest({
        strategyName: strategy.name,
        symbol,
        timeframe: '1h',
        startDate: result.startDate,
        endDate: result.endDate,
        totalTrades: result.totalTrades,
        profitableTrades: result.profitableTrades,
        lossTrades: result.lossTrades,
        winRate: result.winRate,
        totalProfit: result.totalProfit,
        profitFactor: result.profitFactor,
        sharpeRatio: result.sharpeRatio,
        maxDrawdownPct: result.maxDrawdownPct,
        calmarRatio: result.calmarRatio,
        avgTradeDuration: result.avgTradeDuration,
        bestTrade: result.bestTrade?.profit,
        worstTrade: result.worstTrade?.profit,
      });
    } catch (dbError) {
      console.error('Error saving backtest to database:', dbError);
      await db.logError({
        level: 'ERROR',
        source: 'backtest_command',
        message: `Failed to save backtest result: ${(dbError as Error).message}`,
        stackTrace: (dbError as Error).stack,
        symbol,
      });
    }

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
    await db.logError({
      level: 'ERROR',
      source: 'backtest_command',
      message: `Backtest failed: ${(error as Error).message}`,
      stackTrace: (error as Error).stack,
      symbol,
    });
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
    return ctx.reply(
      '❌ Paper trading is already active. Use /stoptrading to stop current session.'
    );
  }

  try {
    ctx.reply(`🔄 Starting paper trading for ${symbol}...`);

    // Ensure user exists in database
    const user = await ensureUser(ctx);
    if (!user) {
      return ctx.reply('❌ Failed to create user session.');
    }

    const paperConfig: PaperTradingConfig = {
      initialBalance: 1000,
      maxOpenTrades: 3,
      feeOpen: 0.001,
      feeClose: 0.001,
      stakeCurrency: 'USDT',
      updateInterval: 5000, // 5 seconds
    };

    // Pass user ID to paper trading engine for database integration
    const paperEngine = new PaperTradingEngine(strategy, paperConfig, user.id.toString());
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
    await db.logError({
      level: 'ERROR',
      source: 'papertrade_command',
      message: `Failed to start paper trading: ${(error as Error).message}`,
      stackTrace: (error as Error).stack,
      symbol,
    });
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
    message += 'No open positions\n';
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

  const message = `
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
${result.recentTrades
  .slice(0, 5)
  .map(
    (trade) =>
      `${trade.side.toUpperCase()} ${trade.pair}: ${(trade.profit || 0) >= 0 ? '✅' : '❌'} $${(trade.profit || 0).toFixed(2)}`
  )
  .join('\n')}
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
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const dataConfig: HistoricalDataConfig = {
      symbol: symbol,
      timeframe: '5m',
      startDate: startDate,
      endDate: endDate,
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
      metric: 'total_profit',
    };

    const optimizationSpace = StrategyOptimizer.createDefaultOptimizationSpace();
    const optimizer = new StrategyOptimizer(
      strategy,
      historicalData,
      optimizationConfig,
      optimizationSpace
    );

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
  .sort(([, a], [, b]) => b - a)
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
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const dataConfig: HistoricalDataConfig = {
      symbol: symbol,
      timeframe: '5m',
      startDate: startDate,
      endDate: endDate,
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

// ============================================================================
// OPENCLAW & ML COMMANDS
// ============================================================================

// OpenClaw analysis command
bot.command('openclaw', async (ctx) => {
  const symbol = ctx.message.text.split(' ')[1]?.toUpperCase() || 'BTCUSDT';

  try {
    const loadingMsg = await ctx.reply(`🦅 Running OpenClaw analysis for ${symbol}...`);

    // Download data
    const candles = await publicCryptoService.getCandlestickData(symbol, '1h', 200);

    if (candles.length < 100) {
      return ctx.reply('❌ Insufficient data for analysis');
    }

    // Convert to OHLCV format
    const ohlcvCandles: OHLCVCandle[] = candles.map((c: any) => ({
      timestamp: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
      date: new Date(c[0]),
    }));

    // Create DataFrame and populate indicators
    const dataframe = {
      open: ohlcvCandles.map((c) => c.open),
      high: ohlcvCandles.map((c) => c.high),
      low: ohlcvCandles.map((c) => c.low),
      close: ohlcvCandles.map((c) => c.close),
      volume: ohlcvCandles.map((c) => c.volume),
      date: ohlcvCandles.map((c) => c.date),
    };

    const metadata = { pair: symbol, timeframe: '1h', stake_currency: 'USDT' };
    openClawStrategy.populateIndicators(dataframe, metadata);
    openClawStrategy.populateEntryTrend(dataframe, metadata);

    // Helper to safely access dynamic dataframe columns
    const getColumn = (df: any, columnName: string, index: number, defaultValue: any = 0): any => {
      const column = df[columnName];
      return Array.isArray(column) ? (column[index] ?? defaultValue) : defaultValue;
    };

    // Get latest signals
    const lastIdx = dataframe.close.length - 1;
    const enterLong = getColumn(dataframe, 'enter_long', lastIdx, 0);
    const enterShort = getColumn(dataframe, 'enter_short', lastIdx, 0);
    const enterTag = getColumn(dataframe, 'enter_tag', lastIdx, '');

    const currentPrice = dataframe.close[lastIdx];
    const rsi = getColumn(dataframe, 'rsi', lastIdx, 50);
    const macdHist = getColumn(dataframe, 'macd_histogram', lastIdx, 0);
    const adx = getColumn(dataframe, 'adx', lastIdx, 20);
    const bbPercentB = getColumn(dataframe, 'bb_percentb', lastIdx, 0.5);

    let signalEmoji = '⚪';
    let signalText = 'NEUTRAL';
    let signalStrength = 'No signal';

    if (enterLong === 1) {
      signalEmoji = '🟢';
      signalText = 'LONG';
      signalStrength = enterTag.replace('_long', '').toUpperCase();
    } else if (enterShort === 1) {
      signalEmoji = '🔴';
      signalText = 'SHORT';
      signalStrength = enterTag.replace('_short', '').toUpperCase();
    }

    const message = `
🦅 OPENCLAW ANALYSIS - ${symbol}

${signalEmoji} SIGNAL: ${signalText}
Market Regime: ${signalStrength}

💰 CURRENT PRICE: $${currentPrice.toLocaleString()}

📊 TECHNICAL INDICATORS:
RSI(14): ${rsi.toFixed(2)}
MACD Histogram: ${macdHist > 0 ? '+' : ''}${macdHist.toFixed(2)}
ADX: ${adx.toFixed(2)} ${adx > 25 ? '(Strong trend)' : '(Weak trend)'}
BB %B: ${bbPercentB.toFixed(2)} ${bbPercentB > 0.8 ? '(Overbought)' : bbPercentB < 0.2 ? '(Oversold)' : '(Neutral)'}

🎯 TRADING RECOMMENDATION:
${enterLong === 1 ? '✅ Consider LONG entry\n📈 Bullish momentum detected' : ''}${enterShort === 1 ? '✅ Consider SHORT entry\n📉 Bearish momentum detected' : ''}${enterLong === 0 && enterShort === 0 ? '⏸️ Wait for clearer signal\n📊 No strong trend detected' : ''}

⚙️ Strategy: OpenClawStrategy v${openClawStrategy.version}
⏰ Timeframe: 1h | Last Update: ${new Date().toLocaleTimeString()}
        `;

    try {
      await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
    } catch (e) {
      /* ignore */
    }

    ctx.reply(message);
  } catch (error) {
    console.error('OpenClaw error:', error);
    ctx.reply(`❌ Error: ${(error as Error).message}`);
  }

  return;
});

// ML Predict command
bot.command('mlpredict', async (ctx) => {
  const symbol = ctx.message.text.split(' ')[1]?.toUpperCase() || 'BTCUSDT';

  try {
    // Load model if not loaded
    if (!mlModelLoaded) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      if (fs.existsSync(mlModelPath)) {
        const loadingMsg = await ctx.reply('🧠 Loading ML model...');
        await mlModel.loadModel(mlModelPath);
        mlModelLoaded = true;
        try {
          await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
        } catch (e) {
          /* ignore */
        }
      } else {
        return ctx.reply(`❌ ML model not found. Train a model first with /trainmodel`);
      }
    }

    const loadingMsg = await ctx.reply(`🧠 Generating ML prediction for ${symbol}...`);

    // Download data (with caching)
    const candles = await publicCryptoService.getCandlestickData(symbol, '1h', 200);

    // Cache data to database
    try {
      const cacheData = candles.map((c: any) => ({
        symbol,
        timeframe: '1h',
        timestamp: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      }));
      await db.cacheHistoricalData(cacheData.slice(-100)); // Cache last 100 candles
    } catch (cacheError) {
      console.error('Failed to cache data:', cacheError);
    }

    if (candles.length < 100) {
      return ctx.reply('❌ Insufficient data for prediction');
    }

    // Convert to OHLCV format
    const ohlcvCandles: OHLCVCandle[] = candles.map((c: any) => ({
      timestamp: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
      date: new Date(c[0]),
    }));

    // Extract features
    const features = featureService.extractFeatures(ohlcvCandles, symbol);

    if (features.length < 20) {
      return ctx.reply('❌ Insufficient features for prediction (need at least 20)');
    }

    // Get prediction using last 20 feature sets
    const prediction = await mlModel.predict(features);

    const currentPrice = ohlcvCandles[ohlcvCandles.length - 1].close;
    const direction = prediction.direction > 0 ? 'UP' : 'DOWN';
    const changePrefix = prediction.priceChange > 0 ? '+' : '';
    const confidencePercent = (prediction.confidence * 100).toFixed(1);

    // Save prediction to database for accuracy tracking
    try {
      const user = await ensureUser(ctx);
      if (user) {
        await db.savePrediction({
          userId: user.id,
          symbol,
          predictedDirection: direction,
          confidence: prediction.confidence,
          predictedChange: prediction.priceChange,
          currentPrice,
          modelName: 'GRU',
          modelVersion: '1.0.0',
        });
      }
    } catch (dbError) {
      console.error('Failed to save prediction:', dbError);
    }

    let emoji = '⚪';
    let recommendation = 'HOLD';
    let signalStrength = 'WEAK';

    // GRU model is conservative, use lower thresholds
    if (prediction.confidence > 0.4) {
      signalStrength = 'STRONG';
      if (prediction.direction > 0) {
        emoji = '🟢';
        recommendation = 'BUY';
      } else {
        emoji = '🔴';
        recommendation = 'SELL';
      }
    } else if (prediction.confidence > 0.2) {
      signalStrength = 'MODERATE';
      if (prediction.direction > 0) {
        emoji = '🟡';
        recommendation = 'WATCH (Bullish)';
      } else {
        emoji = '🟠';
        recommendation = 'WATCH (Bearish)';
      }
    }

    const message = `
🧠 ML PRICE PREDICTION - ${symbol}

${emoji} PREDICTION: ${recommendation}
Direction: ${direction}
Confidence: ${confidencePercent}%

💰 CURRENT PRICE: $${currentPrice.toLocaleString()}

📈 FORECAST:
Expected Movement: ${changePrefix}${prediction.priceChange.toFixed(2)}%
Signal Strength: ${signalStrength}

🎯 TRADING SUGGESTION:
${prediction.confidence > 0.4 ? `✅ ${recommendation} position recommended` : prediction.confidence > 0.2 ? `⚠️ ${recommendation} - Monitor closely` : '⏸️ Low confidence - wait for better setup'}

⚙️ Model: GRU (3.7K parameters, fast & stable)
📊 Features: 60 technical indicators
📈 Accuracy: ~52% (better than random)
⏰ Last Update: ${new Date().toLocaleTimeString()}

💡 TIP: Combine with /openclaw for best results!
        `;

    try {
      await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
    } catch (e) {
      /* ignore */
    }

    ctx.reply(message);
  } catch (error) {
    console.error('ML Predict error:', error);
    ctx.reply(`❌ Error: ${(error as Error).message}`);
  }

  return;
});

// Train ML Model command
bot.command('trainmodel', async (ctx) => {
  const args = ctx.message.text.split(' ');
  const symbol = args[1]?.toUpperCase() || 'BTCUSDT';
  const epochs = parseInt(args[2]) || 15;

  if (epochs < 5 || epochs > 50) {
    return ctx.reply('❌ Epochs must be between 5 and 50');
  }

  try {
    const loadingMsg = await ctx.reply(
      `🧠 Training GRU model for ${symbol}...\n⏱️ This will take ~15-30 seconds...`
    );

    // Download training data
    const candles = await publicCryptoService.getCandlestickData(symbol, '1h', 300);

    if (candles.length < 200) {
      return ctx.reply(`❌ Insufficient data (${candles.length} candles). Need at least 200.`);
    }

    // Convert to OHLCV format
    const ohlcvCandles: OHLCVCandle[] = candles.map((c: any) => ({
      timestamp: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
      date: new Date(c[0]),
    }));

    // Extract features
    const features = featureService.extractFeatures(ohlcvCandles, symbol);

    if (features.length < 100) {
      return ctx.reply('❌ Insufficient features extracted');
    }

    // Prepare targets
    const targets = features.map((_, i) => {
      const idx = i + 200;
      if (idx >= ohlcvCandles.length - 1) return 0;
      const change =
        ((ohlcvCandles[idx + 1].close - ohlcvCandles[idx].close) / ohlcvCandles[idx].close) * 100;
      return Math.max(-1, Math.min(1, change * 50));
    });

    // Use last 100 samples for stability
    const trainFeatures = features.slice(-100);
    const trainTargets = targets.slice(-100);

    // Build and train
    mlModel.buildModel();
    const trainStart = Date.now();
    await mlModel.quickTrain(trainFeatures, trainTargets, epochs);
    const trainTime = ((Date.now() - trainStart) / 1000).toFixed(1);

    mlModelLoaded = true;

    const message = `
✅ ML MODEL TRAINING COMPLETE!

📊 TRAINING SUMMARY:
Symbol: ${symbol}
Training Samples: ${trainFeatures.length}
Epochs: ${epochs}
Training Time: ${trainTime}s

🧠 MODEL SPECS:
Architecture: Single-layer GRU
Parameters: 3,713 (ultra-lightweight)
Input Features: 60
Sequence Length: 20

🎯 READY TO USE:
• /mlpredict ${symbol} - Get price predictions
• /openclaw ${symbol} - Compare with strategy

⏰ Completed: ${new Date().toLocaleTimeString()}

💡 TIP: Model is conservative (low confidence) but 52%+ accurate
        `;

    try {
      await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
    } catch (e) {
      /* ignore */
    }

    ctx.reply(message);
  } catch (error) {
    console.error('Train model error:', error);
    ctx.reply(`❌ Training failed: ${(error as Error).message}`);
  }

  return;
});

// ML Status command
bot.command('mlstatus', async (ctx) => {
  const message = `
🧠 ML MODEL STATUS

📊 Model State: ${mlModelLoaded ? '✅ Loaded & Ready' : '⚠️ Not loaded (will build on first use)'}

🏗️ ARCHITECTURE:
Type: GRU (Gated Recurrent Unit)
Layers: Single-layer GRU(16) + Dense
Parameters: 3,713 (ultra-lightweight)
Input: 60 features × 20 timesteps
Output: Price direction + confidence

📈 PERFORMANCE:
Accuracy: ~52% (better than random 50%)
Confidence: Conservative (typically 20-40%)
Training Time: ~15 seconds
Stability: ✅ Fast & reliable

📊 FEATURES:
✅ 60 technical indicators
✅ Price direction prediction
✅ Confidence scoring
✅ Multi-timeframe analysis
✅ No crashes (stable training)

🎯 AVAILABLE COMMANDS:
• /trainmodel [SYMBOL] [EPOCHS] - Train model (default: 15 epochs)
• /mlpredict [SYMBOL] - Get AI prediction
• /openclaw [SYMBOL] - Compare with strategy

💡 TIPS:
• Model is conservative but consistent
• Use confidence >40% for strong signals
• Combine with /openclaw for best results
• Retrain weekly for fresh patterns

⏰ Status checked: ${new Date().toLocaleTimeString()}
    `;

  ctx.reply(message);

  return;
});

// Update strategies command to include OpenClaw
bot.command('strategies', (ctx) => {
  const message = `
📚 AVAILABLE TRADING STRATEGIES

🦅 OpenClawStrategy v1.0.0 ⭐ NEW!
- Timeframe: 1h
- Type: Long/Short
- Features: Market regime detection, ML integration
- Indicators: RSI(7,14,21), MACD, EMA(9,21,50,200), ADX, BB, ATR
- Entry: Regime-adaptive multi-indicator confluence
- Exit: Dynamic based on market conditions
- Stop Loss: 3% (ATR-based)
- Backtest: 2.55 profit factor, 26.9% win rate

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
✅ ML integration (OpenClaw)

💡 TIP: Use /optimize to find the best parameters for any strategy!
💡 TIP: Use /openclaw for advanced ML-powered analysis!
    `;

  return;
});

// NEWS & TWITTER ANALYSIS COMMANDS

bot.command('news', async (ctx) => {
  const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();

  if (!symbol) {
    return ctx.reply('Please provide a symbol. Example: /news BTCUSDT');
  }

  // Check if Chutes is configured
  if (!chutesService.isConfigured()) {
    return ctx.reply(
      '❌ Chutes API is not configured. Please set CHUTES_API_KEY in your environment variables.'
    );
  }

  try {
    const loadingMsg = await ctx.reply(`🔄 Analyzing real-time news for ${symbol}...`);

    // Get real-time news from Chutes
    const newsItems = await chutesService.searchCryptoNews(symbol, 10);

    if (newsItems.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
      return ctx.reply(`📰 No recent news found for ${symbol}`);
    }

    // Analyze news impact
    const analysis = await chutesService.analyzeNewsImpact(symbol, newsItems);

    // Format response
    const newsSection = `📰 LATEST NEWS for ${symbol}
━━━━━━━━━━━━━━━━━━━━━━━━━

${newsItems
  .slice(0, 5)
  .map(
    (item, idx) => `
${idx + 1}. ${item.title}
   🕒 ${new Date(item.publishedAt).toLocaleString()}
   📝 ${item.content.substring(0, 150)}${item.content.length > 150 ? '...' : ''}
   🔗 ${item.url}
`
  )
  .join('\n')}`;

    const analysisSection = `
━━━━━━━━━━━━━━━━━━━━━━━━━
📊 NEWS SENTIMENT ANALYSIS

📊 Overall Sentiment: ${analysis.overallSentiment} ${
      analysis.overallSentiment === 'BULLISH'
        ? '🟢📈'
        : analysis.overallSentiment === 'BEARISH'
          ? '🔴📉'
          : '🟡➡️'
    }

🎯 Price Impact Prediction:
Direction: ${analysis.marketMovement.direction} ${
      analysis.marketMovement.direction === 'UP'
        ? '📈'
        : analysis.marketMovement.direction === 'DOWN'
          ? '📉'
          : '➡️'
    }
Confidence: ${(analysis.marketMovement.confidence * 100).toFixed(1)}%
Expected Range: ${analysis.marketMovement.expectedRange.low.toFixed(1)}% to ${analysis.marketMovement.expectedRange.high.toFixed(1)}%

⏰ TIMEFRAME PREDICTIONS:
• 24H: ${analysis.impactPrediction.shortTerm}
• 7D: ${analysis.impactPrediction.mediumTerm}
• 30D: ${analysis.impactPrediction.longTerm}`;

    const factorsSection =
      analysis.keyFactors.length > 0
        ? `
🔑 KEY FACTORS:
${analysis.keyFactors.map((factor, index) => `${index + 1}. ${factor}`).join('\n')}`
        : '';

    // Send analysis
    await ctx.reply(newsSection);
    await ctx.reply(analysisSection + factorsSection);

    // Delete loading message
    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
  } catch (error) {
    console.error('News analysis error:', error);
    ctx.reply(`❌ Error analyzing news for ${symbol}. Please try again later.`);
  }

  return;
});

// PERPLEXITY AI NEWS ANALYSIS COMMANDS

// Perplexity references removed, using Chutes
bot.command('pnews', async (ctx) => {
  const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();

  if (!symbol) {
    return ctx.reply(`Please provide a symbol. Example: /pnews BTCUSDT

🔍 This command uses Chutes AI to:
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

  // Track command
  stateManager.incrementCommandCount();

  // Send initial loading message
  const loadingMsg = await ctx.reply(`🔄 Analyzing latest news for ${symbol} with Chutes AI...

⏳ This may take 2-3 minutes for detailed analysis:
• Searching latest news articles (30-60s)
• Analyzing market sentiment (60-90s)
• Predicting price impact (30-60s)
• Generating comprehensive insights

☕ Please be patient, quality analysis takes time...`);

  // Process in background without blocking
  (async () => {
    try {
      // Get latest news
      const newsItems = await chutesService.searchCryptoNews(symbol, 10);

      if (newsItems.length === 0) {
        await ctx.reply(`❌ No recent news found for ${symbol}.

Try:
• Different symbol (BTCUSDT, ETHUSDT, etc.)
• /news ${symbol} for basic analysis
• Check symbol spelling`);
        return;
      }

      // Analyze impact
      const analysis = await chutesService.analyzeNewsImpact(symbol, newsItems);

      // Add news to dashboard
      newsItems.slice(0, 5).forEach((item) => {
        stateManager.addNews({
          symbol,
          title: item.title,
          sentiment: analysis.overallSentiment,
          impact: item.impactLevel as 'HIGH' | 'MEDIUM' | 'LOW',
          timestamp: new Date(),
        });
      });

      // Format response
      const newsSection = `🔍 LATEST NEWS ANALYSIS: ${symbol}
📅 ${analysis.timestamp.toLocaleString()}

📰 FOUND ${newsItems.length} RECENT ARTICLES:
${newsItems
  .slice(0, 5)
  .map((item, index) => {
    const sentiment = item.sentimentScore > 0.3 ? '🟢' : item.sentimentScore < -0.3 ? '🔴' : '🟡';
    const impact =
      item.impactLevel === 'CRITICAL'
        ? '🚨'
        : item.impactLevel === 'HIGH'
          ? '🔥'
          : item.impactLevel === 'MEDIUM'
            ? '📊'
            : '📰';

    return `${index + 1}. ${impact} ${sentiment} ${item.title.substring(0, 80)}...
   Impact: ${item.impactLevel} | Sentiment: ${item.sentimentScore.toFixed(2)}
   Source: ${item.source}`;
  })
  .join('\n\n')}`;

      const analysisSection = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 MARKET IMPACT ANALYSIS:

📊 Overall Sentiment: ${analysis.overallSentiment} ${
        analysis.overallSentiment === 'BULLISH'
          ? '🟢📈'
          : analysis.overallSentiment === 'BEARISH'
            ? '🔴📉'
            : '🟡➡️'
      }

🎯 Price Movement Prediction:
Direction: ${analysis.marketMovement.direction} ${
        analysis.marketMovement.direction === 'UP'
          ? '📈'
          : analysis.marketMovement.direction === 'DOWN'
            ? '📉'
            : '➡️'
      }
Confidence: ${(analysis.marketMovement.confidence * 100).toFixed(1)}%
Expected Range: ${analysis.marketMovement.expectedRange.low.toFixed(1)}% to ${analysis.marketMovement.expectedRange.high.toFixed(1)}%

⏰ TIMEFRAME PREDICTIONS:
• 24H: ${analysis.impactPrediction.shortTerm}
• 7D: ${analysis.impactPrediction.mediumTerm}
• 30D: ${analysis.impactPrediction.longTerm}`;

      const factorsSection =
        analysis.keyFactors.length > 0
          ? `
🔑 KEY FACTORS:
${analysis.keyFactors.map((factor, index) => `${index + 1}. ${factor}`).join('\n')}`
          : '';

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
      console.error('Chutes news error:', error);

      if (error.message?.includes('API key')) {
        await ctx.reply(`❌ Chutes API authentication failed.

Please check:
• API key is valid
• Account has sufficient credits
• API key has proper permissions`);
      } else if (error.message?.includes('rate limit')) {
        await ctx.reply(`⏸️ Chutes API rate limit exceeded.

Please wait a few minutes before trying again.

💡 Alternative: /news ${symbol} for basic analysis`);
      } else {
        await ctx.reply(`❌ Error analyzing news for ${symbol}: ${error.message}

💡 Try: /news ${symbol} for basic analysis`);
      }
    }
  })(); // Execute immediately and don't wait

  // Return immediately to avoid timeout
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

    const newsItems = await chutesService.searchCryptoNews(symbol, 8);

    if (newsItems.length === 0) {
      return ctx.reply(`❌ No recent impactful news found for ${symbol}`);
    }

    const analysis = await chutesService.analyzeNewsImpact(symbol, newsItems);

    const quickSummary = `⚡ QUICK IMPACT: ${symbol}

📊 Sentiment: ${analysis.overallSentiment} ${
      analysis.overallSentiment === 'BULLISH'
        ? '🟢'
        : analysis.overallSentiment === 'BEARISH'
          ? '🔴'
          : '🟡'
    }

🎯 24H Prediction: ${analysis.impactPrediction.shortTerm}

📈 Expected Move: ${analysis.marketMovement.direction}
Range: ${analysis.marketMovement.expectedRange.low.toFixed(1)}% to ${analysis.marketMovement.expectedRange.high.toFixed(1)}%
Confidence: ${(analysis.marketMovement.confidence * 100).toFixed(1)}%

🔥 Top News Impact:
${newsItems
  .slice(0, 3)
  .map(
    (item, index) =>
      `${index + 1}. ${item.impactLevel === 'HIGH' || item.impactLevel === 'CRITICAL' ? '🚨' : '📰'} ${item.title.substring(0, 60)}...`
  )
  .join('\n')}

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
      chutesService.isConfigured()
        ? chutesService
            .searchCryptoNews(symbol, 8)
            .then((news) => chutesService.analyzeNewsImpact(symbol, news))
        : null,
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
      } else if (
        news.overallSentiment === 'BEARISH' &&
        technical.recommendation.action.includes('sell')
      ) {
        combinedConfidence = Math.min(95, combinedConfidence + 15);
      } else if (
        news.overallSentiment === 'BEARISH' &&
        technical.recommendation.action.includes('buy')
      ) {
        combinedConfidence = Math.max(30, combinedConfidence - 20);
        combinedRecommendation = 'hold';
      } else if (
        news.overallSentiment === 'BULLISH' &&
        technical.recommendation.action.includes('sell')
      ) {
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
      combinedConfidence > 75 ? '🟢 HIGH' : combinedConfidence > 50 ? '🟡 MEDIUM' : '🔴 LOW'
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
        news.overallSentiment === 'BULLISH'
          ? '🟢'
          : news.overallSentiment === 'BEARISH'
            ? '🔴'
            : '🟡'
      }
• News Impact: ${news.marketMovement.direction} (${(news.marketMovement.confidence * 100).toFixed(1)}% confidence)
• 24H Prediction: ${news.impactPrediction.shortTerm.substring(0, 100)}...
• Key Factors: ${news.keyFactors.slice(0, 2).join(', ')}`;
    } else {
      newsSection = `
📰 NEWS ANALYSIS: Not available (Chutes AI not configured)`;
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
${news.newsItems
  .slice(0, 3)
  .map((item, index) => {
    const sentiment = item.sentimentScore > 0.3 ? '🟢' : item.sentimentScore < -0.3 ? '🔴' : '🟡';
    return `${index + 1}. ${sentiment} ${item.title.substring(0, 70)}...
   Impact: ${item.impactLevel} | Source: ${item.source}`;
  })
  .join('\n\n')}

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

// ============================================================================
// BINANCE API STATUS COMMAND
// ============================================================================

bot.command('apistatus', async (ctx) => {
  try {
    const loadingMsg = await ctx.reply('🔄 Checking Binance API status...');

    const status = await binanceService.getFullHealthStatus();
    const report = binanceService.formatHealthReport(status);

    try {
      await ctx.deleteMessage(loadingMsg.message_id);
    } catch (e) {
      /* ignore */
    }

    await ctx.reply(report);
  } catch (error) {
    console.error('API status check error:', error);
    ctx.reply(`❌ Error checking API status: ${(error as Error).message}`);
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
    ctx.reply(
      `📊 Volume Analysis for ${symbol}:\n\n${analysis}\n\n💡 Use /analyze ${symbol} for comprehensive analysis.`
    );
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
    ctx.reply(
      `🎯 Support/Resistance for ${symbol}:\n\n${analysis}\n\n💡 Use /analyze ${symbol} for detailed levels.`
    );
  } catch (error) {
    console.error('Support/Resistance analysis error:', error);
    ctx.reply(`❌ Error analyzing support/resistance for ${symbol}. Please try again later.`);
  }

  return;
});

// Chart command
bot.command('chart', async (ctx) => {
  const args = ctx.message.text.split(' ');
  const symbol = args[1]?.toUpperCase();
  const timeframe = args[2]?.toLowerCase() || '1h'; // Default to 1h

  if (!symbol) {
    return ctx.reply('Please provide a symbol. Example: /chart BTCUSDT 4h');
  }

  try {
    ctx.reply(`🔄 Generating ${timeframe} chart for ${symbol}...`);

    // Get data
    const data = await dataManager.getRecentData(symbol, timeframe, 100);

    if (!data || data.length === 0) {
      return ctx.reply(`❌ No data found for ${symbol}`);
    }

    // Convert data needed for chart service
    const chartData = data.map((d) => ({
      t: d.timestamp,
      o: d.open,
      h: d.high,
      l: d.low,
      c: d.close,
      v: d.volume,
    }));

    const chartResult = await imageChartService.generateCandlestickChart(
      symbol,
      timeframe,
      chartData
    );
    const patternInfo =
      chartResult.patterns.length > 0
        ? `\n📊 Patterns: ${chartResult.patterns.map((p) => `${p.name} (${p.confidence}%)`).join(', ')}`
        : '';
    await ctx.replyWithPhoto(
      { source: chartResult.buffer },
      { caption: `📈 ${symbol} ${timeframe} Chart${patternInfo}` }
    );
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
    const user = await ensureUser(ctx);
    const username = ctx.message.from.username || ctx.message.from.first_name || 'Unknown';

    // Save to both old manager (for checking) and database
    await priceAlertManager.addAlert(
      ctx.message.from.id,
      symbol,
      price,
      direction as 'above' | 'below'
    );

    // Save to database
    await db.createAlert({
      userId: user!.id,
      symbol,
      alertType: direction === 'above' ? 'PRICE_ABOVE' : 'PRICE_BELOW',
      targetPrice: price,
      message: `${symbol} ${direction} $${price}`,
    });

    ctx.reply(`✅ Price alert set successfully!

🎯 Alert: ${symbol}
💰 Price: $${price}
📊 Direction: ${direction.toUpperCase()}
👤 User: ${username}

You'll be notified when ${symbol} reaches $${price} or ${direction}.`);
  } catch (error) {
    console.error('Alert creation error:', error);
    ctx.reply(`❌ Error creating alert: ${(error as Error).message}`);

    // Log error to database
    await db.logError({
      level: 'ERROR',
      source: 'alert_command',
      message: (error as Error).message,
      stackTrace: (error as Error).stack,
      symbol,
    });
  }

  return;
});

bot.command('alerts', async (ctx) => {
  try {
    const user = await ensureUser(ctx);

    // Get alerts from database
    const dbAlerts = await db.getActiveAlerts(user!.id);

    if (dbAlerts.length === 0) {
      return ctx.reply(
        '❌ No active alerts found. Create one with /alert [symbol] [price] [above/below]'
      );
    }

    let message = `🔔 YOUR ACTIVE ALERTS (${dbAlerts.length}):\n\n`;
    dbAlerts.forEach((alert: any, index: number) => {
      message += `${index + 1}. ${alert.symbol}\n`;
      message += `   💰 $${alert.targetPrice} (${alert.alertType})\n`;
      message += `   📅 Created: ${new Date(alert.createdAt).toLocaleDateString()}\n\n`;
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

// ============================================================================
// PERFORMANCE DASHBOARD COMMANDS
// ============================================================================

// Stats command - User trading statistics
bot.command('stats', async (ctx) => {
  try {
    const user = await ensureUser(ctx);
    if (!user) {
      return ctx.reply('❌ Failed to load user data.');
    }

    const loadingMsg = await ctx.reply('📊 Loading statistics...');

    // Get trade stats
    const tradeStats = await db.getUserTradeStats(user.id);

    // Get prediction stats
    const predictionStats = await db.getPredictionStats(undefined, undefined, user.id);

    // Get active alerts count
    const alerts = await db.getActiveAlerts(user.id);

    const statsMessage = `
📊 YOUR TRADING STATISTICS

👤 User: ${user.username || user.firstName || 'Anonymous'}
📅 Member since: ${user.createdAt.toLocaleDateString()}

💰 TRADING PERFORMANCE:
Total Trades: ${tradeStats.totalTrades}
Profitable: ${tradeStats.winningTrades || 0} (${tradeStats.winRate.toFixed(1)}%)
Total Profit: $${tradeStats.totalProfit.toFixed(2)}
Best Trade: $${tradeStats.bestTrade?.toFixed(2) || '0.00'}
Worst Trade: $${tradeStats.worstTrade?.toFixed(2) || '0.00'}

🤖 ML PREDICTIONS:
Total Predictions: ${predictionStats.total}
Correct: ${predictionStats.correct}
Accuracy: ${predictionStats.accuracy.toFixed(1)}%
Avg Confidence: ${(predictionStats.avgConfidence * 100).toFixed(1)}%

🔔 ALERTS:
Active Alerts: ${alerts.length}

Use /mlstats for detailed ML performance
Use /strategystats to compare strategies
        `;

    await ctx.reply(statsMessage);

    try {
      await ctx.deleteMessage(loadingMsg.message_id);
    } catch (e) {
      /* ignore */
    }
  } catch (error) {
    console.error('Stats error:', error);
    await db.logError({
      level: 'ERROR',
      source: 'stats_command',
      message: `Failed to load stats: ${(error as Error).message}`,
      stackTrace: (error as Error).stack,
    });
    ctx.reply(`❌ Error loading statistics: ${(error as Error).message}`);
  }

  return;
});

// ML Stats command - Detailed ML performance
bot.command('mlstats', async (ctx) => {
  const args = ctx.message.text.split(' ');
  const symbol = args[1]?.toUpperCase();

  try {
    const loadingMsg = await ctx.reply('🤖 Loading ML statistics...');

    // Get overall prediction stats
    const overallStats = await db.getPredictionStats();

    // Get symbol-specific stats if provided
    const symbolStats = symbol ? await db.getPredictionStats(undefined, symbol) : null;

    // Get GRU model stats
    const gruStats = await db.getPredictionStats('GRU');

    let statsMessage = `
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
        `;

    if (symbolStats && symbol) {
      statsMessage += `
📈 ${symbol} STATS:
Predictions: ${symbolStats.total}
Accuracy: ${symbolStats.accuracy.toFixed(1)}%
Confidence: ${(symbolStats.avgConfidence * 100).toFixed(1)}%
            `;
    }

    statsMessage += `
\n💡 Use /mlstats [SYMBOL] for symbol-specific stats
💡 Use /mlpredict to make new predictions
        `;

    await ctx.reply(statsMessage);

    try {
      await ctx.deleteMessage(loadingMsg.message_id);
    } catch (e) {
      /* ignore */
    }
  } catch (error) {
    console.error('ML stats error:', error);
    await db.logError({
      level: 'ERROR',
      source: 'mlstats_command',
      message: `Failed to load ML stats: ${(error as Error).message}`,
      stackTrace: (error as Error).stack,
      symbol,
    });
    ctx.reply(`❌ Error loading ML statistics: ${(error as Error).message}`);
  }

  return;
});

// Strategy Stats command - Compare strategy performance
bot.command('strategystats', async (ctx) => {
  const args = ctx.message.text.split(' ');
  const symbol = args[1]?.toUpperCase();

  try {
    const loadingMsg = await ctx.reply('📊 Loading strategy statistics...');

    // Get all strategy metrics
    const sampleMetrics = await db.getStrategyMetrics('SampleStrategy', symbol);
    const openclawMetrics = await db.getStrategyMetrics('OpenClawStrategy', symbol);

    if (sampleMetrics.length === 0 && openclawMetrics.length === 0) {
      await ctx.reply('❌ No strategy data found. Run some backtests first with /backtest');
      try {
        await ctx.deleteMessage(loadingMsg.message_id);
      } catch (e) {
        /* ignore */
      }
      return;
    }

    let statsMessage = `
📊 STRATEGY PERFORMANCE COMPARISON
${symbol ? `Symbol: ${symbol}` : 'All Symbols'}

`;

    if (sampleMetrics.length > 0) {
      const latest = sampleMetrics[0];
      statsMessage += `
🎯 SAMPLE STRATEGY:
Win Rate: ${latest.winRate.toFixed(1)}%
Total Trades: ${latest.totalTrades}
Profit Factor: ${latest.profitFactor.toFixed(2)}
Sharpe Ratio: ${latest.sharpeRatio.toFixed(2)}
Max Drawdown: ${latest.maxDrawdownPct.toFixed(2)}%
Best Trade: $${latest.bestTrade.toFixed(2)}
            `;
    }

    if (openclawMetrics.length > 0) {
      const latest = openclawMetrics[0];
      statsMessage += `
🦅 OPENCLAW STRATEGY:
Win Rate: ${latest.winRate.toFixed(1)}%
Total Trades: ${latest.totalTrades}
Profit Factor: ${latest.profitFactor.toFixed(2)}
Sharpe Ratio: ${latest.sharpeRatio.toFixed(2)}
Max Drawdown: ${latest.maxDrawdownPct.toFixed(2)}%
Best Trade: $${latest.bestTrade.toFixed(2)}
            `;
    }

    statsMessage += `
\n💡 Use /strategystats [SYMBOL] for symbol-specific comparison
💡 Use /backtest to run new backtests
        `;

    await ctx.reply(statsMessage);

    try {
      await ctx.deleteMessage(loadingMsg.message_id);
    } catch (e) {
      /* ignore */
    }
  } catch (error) {
    console.error('Strategy stats error:', error);
    await db.logError({
      level: 'ERROR',
      source: 'strategystats_command',
      message: `Failed to load strategy stats: ${(error as Error).message}`,
      stackTrace: (error as Error).stack,
      symbol,
    });
    ctx.reply(`❌ Error loading strategy statistics: ${(error as Error).message}`);
  }

  return;
});

// Leaderboard command - Best performing symbols
bot.command('leaderboard', async (ctx) => {
  try {
    const loadingMsg = await ctx.reply('🏆 Loading leaderboard...');

    // This would require aggregation queries - simplified version
    await ctx.reply(`
🏆 PERFORMANCE LEADERBOARD

📊 COMING SOON:
• Top performing symbols
• Best strategies per symbol
• Most accurate ML predictions
• Top traders (if multi-user)

💡 Use /stats to see your personal performance
💡 Use /strategystats to compare strategies
        `);

    try {
      await ctx.deleteMessage(loadingMsg.message_id);
    } catch (e) {
      /* ignore */
    }
  } catch (error) {
    console.error('Leaderboard error:', error);
    ctx.reply(`❌ Error loading leaderboard: ${(error as Error).message}`);
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
console.log('🔄 Bot initialization complete. Waiting for messages...');

// Start web server first
startWebServer();

// Start prediction verification service
predictionVerifier.start();

bot.launch({ dropPendingUpdates: true }).then(() => {
    console.log('✅ Bot started successfully!');
    console.log('🎯 Ready to receive commands...');
    console.log('💡 Send /start to see available commands');
    console.log('🔍 Prediction verification service active');
  })
  .catch((error) => {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  });

// Enable graceful stop
process.once('SIGINT', () => {
  console.log('🛑 Received SIGINT, stopping bot...');
  predictionVerifier.stop();
  bot.stop('SIGINT');
  db.disconnect();
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, stopping bot...');
  predictionVerifier.stop();
  bot.stop('SIGTERM');
  db.disconnect();
  process.exit(0);
});
