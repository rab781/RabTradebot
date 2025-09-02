// import TelegramBot from 'node-telegram-bot-api';
// import { config } from 'dotenv';

// // Load environment variables
// config();

// // Import services
// import { RiskManagementService } from './services/riskManagementService';
// import { PerformanceMonitoringService } from './services/performanceMonitoringService';
// import { EnhancedDataManager } from './services/enhancedDataManager';
// import { PerplexityService } from './services/perplexityService';
// import { TwitterService } from './services/twitterService';
// import { PaperTradingEngine } from './services/paperTradingEngine';
// import { BacktestEngine } from './services/backtestEngine';
// import { SimpleComprehensiveAnalyzer } from './services/simpleComprehensiveAnalyzer';
// import { SignalGenerator } from './services/signalGenerator';
// import { PriceAlertManager } from './services/priceAlertManager';
// // Real-time services
// import { AdvancedDataAggregator } from './services/advancedDataAggregator';
// import { WhaleAlertService } from './services/whaleAlertService';
// import { FearGreedService } from './services/fearGreedService';

// // Types
// import { TradeSignal } from './types/trading';

// class EnhancedTradingBot {
//     private bot: TelegramBot;
//     private riskManager: RiskManagementService;
//     private performanceMonitor: PerformanceMonitoringService;
//     private dataManager: EnhancedDataManager;
//     private perplexityService: PerplexityService;
//     private twitterService: TwitterService;
//     private paperTradingEngine: PaperTradingEngine;
//     private backtestEngine: BacktestEngine;
//     private analyzer: SimpleComprehensiveAnalyzer;
//     private signalGenerator: SignalGenerator;
//     private alertManager: PriceAlertManager;

//     constructor() {
//         const token = process.env.TELEGRAM_BOT_TOKEN;
//         if (!token) {
//             throw new Error('TELEGRAM_BOT_TOKEN is required');
//         }

//         this.bot = new TelegramBot(token, { polling: true });

//         // Initialize services
//         this.riskManager = new RiskManagementService();
//         this.performanceMonitor = new PerformanceMonitoringService();
//         this.dataManager = new EnhancedDataManager();
//         this.perplexityService = new PerplexityService();
//         this.twitterService = new TwitterService();
//         // Initialize with default configurations
//         const defaultStrategy = new (require('./strategies/SampleStrategy').SampleStrategy)();
//         const paperConfig = { initialBalance: 10000, leverage: 1, commission: 0.001 };
//         const backtestConfig = {
//             startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
//             endDate: new Date(),
//             initialBalance: 10000,
//             commission: 0.001
//         };

//         this.paperTradingEngine = new PaperTradingEngine(defaultStrategy, paperConfig);
//         this.backtestEngine = new BacktestEngine(defaultStrategy, backtestConfig);
//         this.analyzer = new SimpleComprehensiveAnalyzer();
//         this.signalGenerator = new SignalGenerator(new (require('./services/technicalAnalyzer').TechnicalAnalyzer)(), this.dataManager);
//         this.alertManager = new PriceAlertManager();

//         this.setupCommands();
//         this.setupErrorHandling();
//     }

//     private setupCommands() {
//         // Welcome message
//         this.bot.onText(/\/start/, (msg) => {
//             const chatId = msg.chat.id;
//             const welcomeMessage = `
// 🚀 **Advanced Crypto Trading Bot** 🚀

// Welcome to your comprehensive cryptocurrency trading assistant!

// **🔍 Analysis Commands:**
// /analyze [symbol] - Comprehensive technical analysis
// /signal [symbol] - Trading signals with entry/exit points
// /sr [symbol] - Support and resistance levels
// /volume [symbol] - Volume analysis and trends

// **📰 News & Sentiment:**
// /pnews [symbol] - Perplexity AI news analysis
// /impact [symbol] - Quick news impact assessment
// /fullanalysis [symbol] - Technical + fundamental analysis
// /pstatus - Check Perplexity AI status

// **💹 Trading & Backtesting:**
// /backtest [symbol] [days] - Strategy backtesting
// /papertrade [symbol] - Start paper trading
// /portfolio - View current positions
// /performance - Trading performance metrics

// **🔧 Risk Management:**
// /risk [symbol] - Risk assessment
// /position [symbol] [amount] - Position sizing
// /riskmetrics - Portfolio risk metrics

// **🚨 Alerts & Utilities:**
// /alert [symbol] [price] [above/below] - Set price alerts
// /alerts - List active alerts
// /strategies - Available strategies
// /help - Show this help message

// Example: /analyze BTCUSDT
// `;
//             this.bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
//         });

//         // Help command
//         this.bot.onText(/\/help/, (msg) => {
//             this.bot.sendMessage(msg.chat.id, 'Use /start to see all available commands');
//         });

//         // Analysis command
//         this.bot.onText(/\/analyze (.+)/, async (msg, match) => {
//             const chatId = msg.chat.id;
//             const symbol = match![1].toUpperCase();

//             try {
//                 const loadingMsg = await this.bot.sendMessage(chatId, '🔄 Analyzing...');

//                 const analysis = await this.analyzer.analyzeSymbol(symbol);
//                 const news = await this.perplexityService.getNewsAnalysis(symbol);

//                 const response = `
// 📊 **${symbol} Analysis**

// **Technical Analysis:**
// 🔸 Price: $${analysis.price}
// 🔸 RSI: ${analysis.rsi.toFixed(2)}
// 🔸 MACD: ${analysis.macd.histogram.toFixed(4)}
// 🔸 Bollinger: ${analysis.bollinger.position}
// 🔸 Volume: ${analysis.volume.relative}x average

// **News Sentiment:** ${news.sentiment || 'Neutral'}
// **Recommendation:** ${analysis.recommendation}

// Use /signal ${symbol} for trading signals
//                 `;

//                 await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
//                 await this.bot.deleteMessage(chatId, loadingMsg.message_id);

//             } catch (error) {
//                 console.error('Analysis error:', error);
//                 this.bot.sendMessage(chatId, `❌ Error analyzing ${symbol}: ${error.message}`);
//             }
//         });

//         // Signal command
//         this.bot.onText(/\/signal (.+)/, async (msg, match) => {
//             const chatId = msg.chat.id;
//             const symbol = match![1].toUpperCase();

//             try {
//                 const loadingMsg = await this.bot.sendMessage(chatId, '🔄 Generating signals...');

//                 const signals = await this.signalGenerator.generateSignals(symbol);
//                 const riskAssessment = await this.riskManager.assessRisk(symbol);

//                 const response = `
// 🎯 **${symbol} Trading Signals**

// **Signal:** ${signals.action}
// **Strength:** ${signals.strength}/10
// **Entry:** $${signals.entry}
// **Stop Loss:** $${signals.stopLoss}
// **Take Profit:** $${signals.takeProfit}

// **Risk Assessment:**
// 🔸 Risk Level: ${riskAssessment.level}
// 🔸 Max Position: ${riskAssessment.maxPosition}%
// 🔸 VaR (24h): ${riskAssessment.var24h}%

// Use /papertrade ${symbol} to test this signal
//                 `;

//                 await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
//                 await this.bot.deleteMessage(chatId, loadingMsg.message_id);

//             } catch (error) {
//                 console.error('Signal error:', error);
//                 this.bot.sendMessage(chatId, `❌ Error generating signals for ${symbol}: ${error.message}`);
//             }
//         });

//         // Risk assessment command
//         this.bot.onText(/\/risk (.+)/, async (msg, match) => {
//             const chatId = msg.chat.id;
//             const symbol = match![1].toUpperCase();

//             try {
//                 const loadingMsg = await this.bot.sendMessage(chatId, '🔄 Assessing risk...');

//                 const riskMetrics = await this.riskManager.calculateRiskMetrics(symbol);

//                 const response = `
// ⚠️ **${symbol} Risk Assessment**

// **Value at Risk (VaR):**
// 🔸 95% Confidence: ${riskMetrics.var95}%
// 🔸 99% Confidence: ${riskMetrics.var99}%

// **Risk Metrics:**
// 🔸 Volatility: ${riskMetrics.volatility.toFixed(2)}%
// 🔸 Sharpe Ratio: ${riskMetrics.sharpeRatio.toFixed(2)}
// 🔸 Max Drawdown: ${riskMetrics.maxDrawdown.toFixed(2)}%

// **Position Sizing:**
// 🔸 Recommended: ${riskMetrics.recommendedPosition}%
// 🔸 Max Safe Size: ${riskMetrics.maxSafeSize}%
//                 `;

//                 await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
//                 await this.bot.deleteMessage(chatId, loadingMsg.message_id);

//             } catch (error) {
//                 console.error('Risk assessment error:', error);
//                 this.bot.sendMessage(chatId, `❌ Error assessing risk for ${symbol}: ${error.message}`);
//             }
//         });

//         // News analysis command
//         this.bot.onText(/\/pnews (.+)/, async (msg, match) => {
//             const chatId = msg.chat.id;
//             const symbol = match![1].toUpperCase();

//             if (!this.perplexityService.isConfigured()) {
//                 return this.bot.sendMessage(chatId, '❌ Perplexity API not configured. Please set PERPLEXITY_API_KEY in .env');
//             }

//             try {
//                 const loadingMsg = await this.bot.sendMessage(chatId, '🔄 Analyzing news...');

//                 const newsAnalysis = await this.perplexityService.getNewsAnalysis(symbol);

//                 const response = `
// 📰 **${symbol} News Analysis**

// **Sentiment:** ${newsAnalysis.sentiment}
// **Impact:** ${newsAnalysis.impact}
// **Confidence:** ${newsAnalysis.confidence}%

// **Key Points:**
// ${newsAnalysis.keyPoints.map(point => `• ${point}`).join('\n')}

// **Summary:**
// ${newsAnalysis.summary}

// **Sources:** ${newsAnalysis.sources.length} articles analyzed
//                 `;

//                 await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
//                 await this.bot.deleteMessage(chatId, loadingMsg.message_id);

//             } catch (error) {
//                 console.error('News analysis error:', error);
//                 this.bot.sendMessage(chatId, `❌ Error analyzing news for ${symbol}: ${error.message}`);
//             }
//         });

//         // Portfolio command
//         this.bot.onText(/\/portfolio/, async (msg) => {
//             const chatId = msg.chat.id;

//             try {
//                 const portfolio = await this.paperTradingEngine.getPortfolio();
//                 const performance = await this.performanceMonitor.getPerformanceMetrics();

//                 const response = `
// 💼 **Portfolio Overview**

// **Balance:** $${portfolio.balance.toFixed(2)}
// **Total Value:** $${portfolio.totalValue.toFixed(2)}
// **P&L:** ${portfolio.pnl >= 0 ? '🟢' : '🔴'} $${portfolio.pnl.toFixed(2)}

// **Performance:**
// 🔸 Total Return: ${performance.totalReturn.toFixed(2)}%
// 🔸 Win Rate: ${performance.winRate.toFixed(1)}%
// 🔸 Avg Win: $${performance.avgWin.toFixed(2)}
// 🔸 Avg Loss: $${performance.avgLoss.toFixed(2)}

// **Active Positions:** ${portfolio.positions.length}
// ${portfolio.positions.map(pos =>
//     `• ${pos.symbol}: ${pos.quantity} @ $${pos.entryPrice}`
// ).join('\n')}
//                 `;

//                 await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });

//             } catch (error) {
//                 console.error('Portfolio error:', error);
//                 this.bot.sendMessage(chatId, `❌ Error retrieving portfolio: ${error.message}`);
//             }
//         });

//         // Backtest command
//         this.bot.onText(/\/backtest (.+) (.+)/, async (msg, match) => {
//             const chatId = msg.chat.id;
//             const symbol = match![1].toUpperCase();
//             const days = parseInt(match![2]);

//             if (isNaN(days) || days <= 0) {
//                 return this.bot.sendMessage(chatId, '❌ Please provide a valid number of days');
//             }

//             try {
//                 const loadingMsg = await this.bot.sendMessage(chatId, '🔄 Running backtest...');

//                 const results = await this.backtestEngine.runBacktest(symbol, days);

//                 const response = `
// 📈 **${symbol} Backtest Results (${days} days)**

// **Performance:**
// 🔸 Total Return: ${results.totalReturn.toFixed(2)}%
// 🔸 Win Rate: ${results.winRate.toFixed(1)}%
// 🔸 Total Trades: ${results.totalTrades}
// 🔸 Sharpe Ratio: ${results.sharpeRatio.toFixed(2)}

// **Risk Metrics:**
// 🔸 Max Drawdown: ${results.maxDrawdown.toFixed(2)}%
// 🔸 Volatility: ${results.volatility.toFixed(2)}%
// 🔸 Best Trade: ${results.bestTrade.toFixed(2)}%
// 🔸 Worst Trade: ${results.worstTrade.toFixed(2)}%

// **Strategy:** ${results.strategy}
//                 `;

//                 await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
//                 await this.bot.deleteMessage(chatId, loadingMsg.message_id);

//             } catch (error) {
//                 console.error('Backtest error:', error);
//                 this.bot.sendMessage(chatId, `❌ Error running backtest: ${error.message}`);
//             }
//         });

//         // Paper trading command
//         this.bot.onText(/\/papertrade (.+)/, async (msg, match) => {
//             const chatId = msg.chat.id;
//             const symbol = match![1].toUpperCase();

//             try {
//                 const signal = await this.signalGenerator.generateSignals(symbol);
//                 const result = await this.paperTradingEngine.executeTrade(signal);

//                 const response = `
// 📝 **Paper Trade Executed**

// **Symbol:** ${symbol}
// **Action:** ${result.action}
// **Quantity:** ${result.quantity}
// **Price:** $${result.price}
// **Value:** $${result.value.toFixed(2)}

// **Updated Portfolio:**
// 🔸 Balance: $${result.newBalance.toFixed(2)}
// 🔸 Total Value: $${result.totalValue.toFixed(2)}
// 🔸 P&L: ${result.pnl >= 0 ? '🟢' : '🔴'} $${result.pnl.toFixed(2)}
//                 `;

//                 await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });

//             } catch (error) {
//                 console.error('Paper trading error:', error);
//                 this.bot.sendMessage(chatId, `❌ Error executing paper trade: ${error.message}`);
//             }
//         });

//         // Status commands
//         this.bot.onText(/\/pstatus/, async (msg) => {
//             const chatId = msg.chat.id;
//             const perplexityStatus = this.perplexityService.isConfigured() ? '🟢 Connected' : '🔴 Not configured';
//             const twitterStatus = this.twitterService.isConfigured() ? '🟢 Connected' : '🔴 Not configured';

//             const response = `
// ⚙️ **System Status**

// **APIs:**
// 🔸 Perplexity AI: ${perplexityStatus}
// 🔸 Twitter: ${twitterStatus}
// 🔸 Binance: 🟢 Connected
// 🔸 Paper Trading: 🟢 Active

// **Services:**
// 🔸 Risk Management: 🟢 Online
// 🔸 Performance Monitor: 🟢 Online
// 🔸 Data Manager: 🟢 Online
// 🔸 Alert Manager: 🟢 Online

// **Bot Status:** 🟢 All systems operational
//             `;

//             await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
//         });

//         // Alerts command
//         this.bot.onText(/\/alerts/, async (msg) => {
//             const chatId = msg.chat.id;

//             try {
//                 const alerts = await this.alertManager.getActiveAlerts();

//                 if (alerts.length === 0) {
//                     return this.bot.sendMessage(chatId, '📭 No active alerts');
//                 }

//                 const response = `
// 🚨 **Active Alerts**

// ${alerts.map(alert =>
//     `• ${alert.symbol}: ${alert.condition} $${alert.price} (${alert.status})`
// ).join('\n')}

// Use /alert [symbol] [price] [above/below] to set new alerts
//                 `;

//                 await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });

//             } catch (error) {
//                 console.error('Alerts error:', error);
//                 this.bot.sendMessage(chatId, `❌ Error retrieving alerts: ${error.message}`);
//             }
//         });
//     }

//     private setupErrorHandling() {
//         this.bot.on('polling_error', (error) => {
//             console.error('Polling error:', error);
//         });

//         process.on('uncaughtException', (error) => {
//             console.error('Uncaught Exception:', error);
//         });

//         process.on('unhandledRejection', (reason, promise) => {
//             console.error('Unhandled Rejection at:', promise, 'reason:', reason);
//         });
//     }

//     public start() {
//         console.log('🚀 Enhanced Crypto Trading Bot is starting...');
//         console.log('🔄 Initializing services...');

//         // Initialize services
//         this.performanceMonitor.startMonitoring();
//         this.alertManager.startMonitoring();

//         console.log('✅ All services initialized successfully');
//         console.log('📱 Bot is ready and listening for commands');
//         console.log('💡 Send /start to begin trading');
//     }
// }

// // Start the bot
// const bot = new EnhancedTradingBot();
// bot.start();

// export { EnhancedTradingBot };
