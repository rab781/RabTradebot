import { Telegraf, Markup } from 'telegraf';
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
import { binanceOrderService } from './services/binanceOrderService';
import { realTradingEngine, RiskParams } from './services/realTradingEngine';
import { riskMonitorLoop } from './services/riskMonitorLoop';
import { connectionManager } from './services/connectionManager';
import { OHLCVCandle } from './types/dataframe';

import { ImageChartService } from './services/imageChartService';
import { ChutesService } from './services/chutesService';

// Database Service
import { db } from './services/databaseService';

// Prediction Verifier
import { predictionVerifier } from './services/predictionVerifier';
import { healthMonitor } from './services/healthMonitor';
import { rateLimiter } from './services/rateLimiter';
import { logger, withLogContext } from './utils/logger';

// Web Dashboard
import { startWebServer, stateManager } from './webServer';
import BotStateManager from './services/botStateManager';
import { getPrisma } from './services/databaseService';

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

// Inject ChutesService into NewsAnalyzer so scraped data is analysed by AI
newsAnalyzer.setChutesService(chutesService);

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
    liveTrading?: {
      active: boolean;
      symbol: string;
      strategy: IStrategy;
      userDbId: number;
      timer?: NodeJS.Timeout;
      startedAt: Date;
    };
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

const ACTIVE_SYMBOL_PREF_KEY = 'active_symbol';
const DEFAULT_ACTIVE_SYMBOL = 'BTCUSDT';
const COMMON_QUOTES = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'BTC', 'ETH'];

const healthRuntime = {
  usdtBalance: 0,
  peakUsdtBalance: 0,
  modelAccuracy: 1,
};

function normalizeSymbolInput(rawInput: string): string {
  const cleaned = rawInput.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) {
    throw new Error('Symbol kosong');
  }

  const hasKnownQuote = COMMON_QUOTES.some((quote) => cleaned.endsWith(quote));
  const normalized = hasKnownQuote ? cleaned : `${cleaned}USDT`;

  if (!/^[A-Z0-9]{5,20}$/.test(normalized)) {
    throw new Error('Format symbol tidak valid');
  }

  return normalized;
}

async function getActiveSymbol(userId: number): Promise<string> {
  const pref = await db.getUserPreference(userId, ACTIVE_SYMBOL_PREF_KEY);
  return (pref || DEFAULT_ACTIVE_SYMBOL).toUpperCase();
}

async function setActiveSymbol(userId: number, symbol: string): Promise<void> {
  await db.setUserPreference(userId, ACTIVE_SYMBOL_PREF_KEY, symbol.toUpperCase());
}

// ── INLINE KEYBOARD MENU SYSTEM ──────────────────────────────────────────────

async function ensureUserFromCallback(ctx: any) {
  const from = ctx.from;
  if (!from) return null;
  return db.getOrCreateUser(from.id, {
    username: from.username,
    firstName: from.first_name,
    lastName: from.last_name,
  });
}

function buildMainMenuInline(symbol: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📊 Analysis', 'cat:analysis'),
      Markup.button.callback('📰 News', 'cat:news'),
      Markup.button.callback('📈 Sim', 'cat:sim'),
    ],
    [
      Markup.button.callback('🔴 Live (Real $)', 'cat:live'),
      Markup.button.callback('🗂 Orders', 'cat:orders'),
      Markup.button.callback('🧪 Backtest', 'cat:backtest'),
    ],
    [
      Markup.button.callback('⚙️ System', 'cat:data'),
      Markup.button.callback(`🪙 ${symbol}`, 'coin:prompt'),
      Markup.button.callback('❓ Help', 'run:help'),
    ],
  ]);
}

function buildCategoryMenuInline(symbol: string, category: string) {
  const back = [
    Markup.button.callback('🏠 Home', 'home'),
    Markup.button.callback(`🪙 ${symbol}`, 'coin:prompt'),
  ];

  switch (category) {
    case 'analysis':
      return Markup.inlineKeyboard([
        [
          Markup.button.callback('📊 Signal', 'run:signal'),
          Markup.button.callback('🔬 Analyze', 'run:analyze'),
          Markup.button.callback('🌐 Full Analysis', 'run:fullanalysis'),
        ],
        [
          Markup.button.callback('🦅 OpenClaw', 'run:openclaw'),
          Markup.button.callback('🧠 ML Predict', 'run:mlpredict'),
          Markup.button.callback('📈 Chart 1h', 'run:chart'),
        ],
        [
          Markup.button.callback('📦 Volume', 'run:volume'),
          Markup.button.callback('⚡ S/R Levels', 'run:sr'),
        ],
        back,
      ]);
    case 'news':
      return Markup.inlineKeyboard([
        [
          Markup.button.callback('🤖 AI News', 'run:pnews'),
          Markup.button.callback('⚡ Impact', 'run:impact'),
          Markup.button.callback('📰 Basic News', 'run:news'),
        ],
        [Markup.button.callback('🌐 Full Analysis', 'run:fullanalysis')],
        back,
      ]);
    case 'sim':
      return Markup.inlineKeyboard([
        [
          Markup.button.callback('▶️ Start Paper', 'run:papertrade'),
          Markup.button.callback('⏹ Stop Trading', 'run:stoptrading'),
        ],
        [
          Markup.button.callback('💼 Portfolio', 'run:portfolio'),
          Markup.button.callback('📈 Performance', 'run:performance'),
          Markup.button.callback('🗂 Strategies', 'run:strategies'),
        ],
        back,
      ]);
    case 'live':
      return Markup.inlineKeyboard([
        [
          Markup.button.callback('🔴 Start Live Trade (Real $)', 'run:livestart'),
          Markup.button.callback('⏹️ Stop Live', 'run:livestop'),
        ],
        [Markup.button.callback('💼 Live Portfolio (Real $)', 'run:liveportfolio')],
        back,
      ]);
    case 'orders':
      return Markup.inlineKeyboard([
        [
          Markup.button.callback('📋 Open Orders', 'run:orders'),
          Markup.button.callback('💼 Live Portfolio (Real $)', 'run:liveportfolio'),
        ],
        back,
      ]);
    case 'backtest':
      return Markup.inlineKeyboard([
        [
          Markup.button.callback('🧪 Backtest 30d', 'run:backtest'),
          Markup.button.callback('🔧 Optimize 60d', 'run:optimize'),
        ],
        [
          Markup.button.callback('⬇️ Download Data', 'run:download'),
          Markup.button.callback('📊 Data Info', 'run:datainfo'),
        ],
        back,
      ]);
    default: // 'data'
      return Markup.inlineKeyboard([
        [
          Markup.button.callback('🌐 API Status', 'run:apistatus'),
          Markup.button.callback('🩺 Healthcheck', 'run:healthcheck'),
          Markup.button.callback('🤖 AI Status', 'run:pstatus'),
          Markup.button.callback('🧠 ML Status', 'run:mlstatus'),
        ],
        [
          Markup.button.callback('⬇️ Download Data', 'run:download'),
          Markup.button.callback('📊 Data Info', 'run:datainfo'),
        ],
        back,
      ]);
  }
}

async function replyMainMenu(ctx: any, userId: number, title?: string) {
  const activeSymbol = await getActiveSymbol(userId);
  const header = title || '📌 Main Menu';
  return ctx.reply(
    `${header} — Coin: ${activeSymbol}\nPilih kategori:`,
    buildMainMenuInline(activeSymbol),
  );
}

function stopLiveTradingSession(session: {
  active: boolean;
  symbol: string;
  strategy: IStrategy;
  userDbId: number;
  timer?: NodeJS.Timeout;
  startedAt: Date;
}) {
  session.active = false;
  if (session.timer) {
    clearInterval(session.timer);
    session.timer = undefined;
  }
}

const notifyByDbUserId = async (message: string, dbUserId?: number): Promise<void> => {
  if (!dbUserId) return;
  const user = await db.getUserById(dbUserId);
  if (!user) return;
  await bot.telegram.sendMessage(Number(user.telegramId), message);
};

realTradingEngine.setNotifier(async (message, dbUserId) => {
  try {
    await notifyByDbUserId(message, dbUserId);
  } catch (error) {
    withLogContext({ service: 'enhancedBot', userId: dbUserId }).error({ err: error }, 'Live notifier error');
  }
});

riskMonitorLoop.setNotifier(async (message, dbUserId) => {
  try {
    await notifyByDbUserId(message, dbUserId);
  } catch (error) {
    withLogContext({ service: 'enhancedBot', userId: dbUserId }).error({ err: error }, 'Risk monitor notifier error');
  }
});

async function executeLiveSignal(userDbId: number, symbol: string, strategyToUse: IStrategy): Promise<void> {
  const openTrades = await db.getOpenLiveTrades(userDbId, symbol);
  if (openTrades.length > 0) {
    return;
  }

  const signal = await signalGenerator.generateSignal(symbol);
  if (signal.action === 'HOLD') {
    return;
  }

  const stats = await db.getUserTradeStats(userDbId, symbol);
  const historicalWinRate = stats.totalTrades > 0 ? stats.winRate / 100 : 0.52;

  const riskParams: RiskParams = {
    riskPerTrade: parseFloat(process.env.LIVE_RISK_PER_TRADE || '0.01'),
    maxPositionSize: parseFloat(process.env.LIVE_MAX_POSITION_SIZE || '0.15'),
    minPositionSize: parseFloat(process.env.LIVE_MIN_POSITION_SIZE || '0.01'),
    maxOpenTrades: strategyToUse.maxOpenTrades,
    stopLossPctFallback: Math.abs(strategyToUse.stoploss || -0.03),
    expectedWinRate: historicalWinRate,
    rewardRiskRatio: parseFloat(process.env.LIVE_RR_RATIO || '2'),
  };

  await realTradingEngine.executeEntry({
    userId: userDbId,
    symbol,
    signal,
    strategy: strategyToUse,
    riskParams,
  });
}

bot.command('coin', async (ctx) => {
  const input = ctx.message.text.split(' ')[1];

  if (!input) {
    const user = await ensureUser(ctx);
    if (!user) return ctx.reply('❌ Gagal menyiapkan user session.');
    const symbol = await getActiveSymbol(user.id);
    return ctx.reply(
      `🪙 Coin aktif: ${symbol}\nGanti: /coin BTC atau /coin ETHUSDT`,
      buildMainMenuInline(symbol),
    );
  }

  try {
    const user = await ensureUser(ctx);
    if (!user) return ctx.reply('❌ Gagal menyiapkan user session.');
    const symbol = normalizeSymbolInput(input);
    await setActiveSymbol(user.id, symbol);
    return ctx.reply(
      `✅ Coin aktif: ${symbol}\nTap kategori untuk aksi:`,
      buildMainMenuInline(symbol),
    );
  } catch (error) {
    return ctx.reply(`❌ Gagal set coin: ${(error as Error).message}`);
  }
});

bot.command('menu', async (ctx) => {
  try {
    const user = await ensureUser(ctx);
    if (!user) return ctx.reply('❌ Gagal menyiapkan user session.');
    const provided = ctx.message.text.split(' ')[1];
    if (provided) {
      const normalized = normalizeSymbolInput(provided);
      await setActiveSymbol(user.id, normalized);
    }
    return replyMainMenu(ctx, user.id);
  } catch (error) {
    return ctx.reply(`❌ Gagal membuka menu: ${(error as Error).message}`);
  }
});

bot.command('go', async (ctx) => {
  const user = await ensureUser(ctx);
  if (!user) return ctx.reply('❌ Gagal menyiapkan user session.');
  return replyMainMenu(ctx, user.id, '🚀 Quick Menu');
});

bot.command('logs', async (ctx) => {
  const adminChat = process.env.ADMIN_CHAT_ID;
  const requesterChat = String(ctx.chat?.id || '');
  if (!adminChat || requesterChat !== adminChat) {
    return ctx.reply('❌ Unauthorized. Command ini khusus admin.');
  }

  const user = await ensureUser(ctx);
  if (!user) return ctx.reply('❌ Gagal menyiapkan user session.');
  
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const logPath = path.join(process.cwd(), 'logs', 'pm2-out.log');
    
    if (!fs.existsSync(logPath)) {
      return ctx.reply('❌ File log PM2 (logs/pm2-out.log) tidak ditemukan. Apakah PM2 berjalan?');
    }
    
    const stats = fs.statSync(logPath);
    const readSize = Math.min(stats.size, 4096);
    const buffer = Buffer.alloc(readSize);
    
    const fd = fs.openSync(logPath, 'r');
    fs.readSync(fd, buffer, 0, readSize, stats.size - readSize);
    fs.closeSync(fd);
    
    const lines = buffer.toString('utf-8').split('\n');
    const lastLines = lines.filter(l => l.trim().length > 0).slice(-20).join('\n');
    
    const escapedLogs = lastLines || 'Tidak ada log terbaru.';
    return ctx.reply(`📝 *Daftar Logs Terakhir:*\n\`\`\`\n${escapedLogs}\n\`\`\``, { parse_mode: 'Markdown' });
  } catch (error) {
    return ctx.reply(`❌ Gagal membaca log: ${(error as Error).message}`);
  }
});

// ── INLINE NAVIGATION ACTIONS ─────────────────────────────────────────────────

bot.action('home', async (ctx) => {
  await ctx.answerCbQuery();
  const user = await ensureUserFromCallback(ctx);
  if (!user) return;
  const symbol = await getActiveSymbol(user.id);
  await ctx.editMessageText(
    `📌 Main Menu — Coin: ${symbol}\nPilih kategori:`,
    buildMainMenuInline(symbol),
  );
});

bot.action(/^cat:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const category = ctx.match[1];
  const user = await ensureUserFromCallback(ctx);
  if (!user) return;
  const symbol = await getActiveSymbol(user.id);
  const labels: Record<string, string> = {
    analysis: '📊 Analysis',
    news: '📰 News',
    sim: '📈 Trading Sim',
    live: '🔴 Live Trading (Real $)',
    orders: '🗂 Orders & Portfolio',
    backtest: '🧪 Backtest & Optimize',
    data: '⚙️ Data & System',
  };
  await ctx.editMessageText(
    `${labels[category] || category} — Coin: ${symbol}\nPilih aksi:`,
    buildCategoryMenuInline(symbol, category),
  );
});

bot.action('coin:prompt', async (ctx) => {
  await ctx.answerCbQuery('Ketik /coin SYMBOL untuk ganti coin aktif');
  await ctx.reply('🪙 Ganti coin aktif:\nKetik /coin BTC atau /coin ETHUSDT');
});

bot.action(/^run:(.+)$/, async (ctx) => {
  const action = ctx.match![1];
  const user = await ensureUserFromCallback(ctx);
  if (!user) {
    await ctx.answerCbQuery('❌ Session error');
    return;
  }
  const telegramId = ctx.from!.id;
  const symbol = await getActiveSymbol(user.id);
  const chatId = ctx.chat?.id;
  if (!chatId) { await ctx.answerCbQuery(); return; }
  await ctx.answerCbQuery(`⏳ ${symbol}...`);
  stateManager.incrementCommandCount();
  try {
    await handleInlineRun(ctx, action, symbol, chatId, telegramId, user.id);
  } catch (error) {
    await ctx.reply(`❌ Error: ${(error as Error).message}`);
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInlineRun(ctx: any, action: string, symbol: string, chatId: number, telegramId: number, dbUserId: number) {
  switch (action) {
    case 'signal': {
      const loading = await ctx.reply(`🔄 Generating signal for ${symbol}...`);
      const signal = await signalGenerator.generateSignal(symbol);
      stateManager.addSignal({ symbol, action: signal.action, price: signal.price, confidence: signal.confidence, timestamp: new Date(), indicators: {} });
      try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
      await ctx.reply(signal.text);
      break;
    }
    case 'volume': {
      const loading = await ctx.reply(`🔄 Analyzing volume for ${symbol}...`);
      const analysis = await technicalAnalyzer.analyzeSymbol(symbol);
      try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
      await ctx.reply(`📊 Volume Analysis — ${symbol}\n\n${analysis}`);
      break;
    }
    case 'sr': {
      const loading = await ctx.reply(`🔄 Calculating S/R for ${symbol}...`);
      const analysis = await technicalAnalyzer.analyzeSymbol(symbol);
      try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
      await ctx.reply(`🎯 Support/Resistance — ${symbol}\n\n${analysis}`);
      break;
    }
    case 'openclaw': {
      const loading = await ctx.reply(`🦅 Running OpenClaw for ${symbol}...`);
      const candles = await publicCryptoService.getCandlestickData(symbol, '1h', 200);
      if (candles.length < 100) { await ctx.reply('❌ Insufficient data'); break; }
      const ocCandles: OHLCVCandle[] = candles.map((c: any) => ({
        timestamp: c[0], open: parseFloat(c[1]), high: parseFloat(c[2]),
        low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5]), date: new Date(c[0]),
      }));
      const df: any = {
        open: ocCandles.map(c => c.open), high: ocCandles.map(c => c.high),
        low: ocCandles.map(c => c.low), close: ocCandles.map(c => c.close),
        volume: ocCandles.map(c => c.volume), date: ocCandles.map(c => c.date),
      };
      const meta = { pair: symbol, timeframe: '1h', stake_currency: 'USDT' };
      openClawStrategy.populateIndicators(df, meta);
      openClawStrategy.populateEntryTrend(df, meta);
      const getCol = (col: string, idx: number, def: any = 0) =>
        Array.isArray(df[col]) ? (df[col][idx] ?? def) : def;
      const lastIdx = df.close.length - 1;
      const eLong = getCol('enter_long', lastIdx, 0);
      const eShort = getCol('enter_short', lastIdx, 0);
      const eTag = getCol('enter_tag', lastIdx, '');
      const rsi = getCol('rsi', lastIdx, 50);
      const macdH = getCol('macd_histogram', lastIdx, 0);
      const adx = getCol('adx', lastIdx, 20);
      const bbPct = getCol('bb_percentb', lastIdx, 0.5);
      const sig = eLong === 1 ? '🟢 LONG' : eShort === 1 ? '🔴 SHORT' : '⚪ NEUTRAL';
      const tag = eLong === 1 ? eTag.replace('_long', '').toUpperCase() : eShort === 1 ? eTag.replace('_short', '').toUpperCase() : 'No signal';
      try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
      await ctx.reply(
        `🦅 OPENCLAW — ${symbol}\n\n${sig} | ${tag}\n💰 $${df.close[lastIdx].toLocaleString()}\n\nRSI: ${rsi.toFixed(2)} | MACD: ${macdH > 0 ? '+' : ''}${macdH.toFixed(2)} | ADX: ${adx.toFixed(2)} | BB%B: ${bbPct.toFixed(2)}\n\n⚙️ OpenClawStrategy v${openClawStrategy.version}`,
      );
      break;
    }
    case 'mlpredict': {
      const loading = await ctx.reply(`🧠 ML Predict for ${symbol}...`);
      if (!mlModelLoaded) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        if (fs.existsSync(mlModelPath)) {
          await mlModel.loadModel(mlModelPath);
          mlModelLoaded = true;
        } else {
          try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
          await ctx.reply('❌ ML model not found. Train first with /trainmodel');
          break;
        }
      }
      const mlCandles = await publicCryptoService.getCandlestickData(symbol, '1h', 200);
      if (mlCandles.length < 100) {
        try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
        await ctx.reply('❌ Insufficient data'); break;
      }
      const mlOhlcv: OHLCVCandle[] = mlCandles.map((c: any) => ({
        timestamp: c[0], open: parseFloat(c[1]), high: parseFloat(c[2]),
        low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5]), date: new Date(c[0]),
      }));
      const features = featureService.extractFeatures(mlOhlcv, symbol);
      if (features.length < 20) {
        try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
        await ctx.reply('❌ Insufficient features'); break;
      }
      const prediction = await mlModel.predict(features);
      const currentPrice = mlOhlcv[mlOhlcv.length - 1].close;
      const direction = prediction.direction > 0 ? 'UP 📈' : 'DOWN 📉';
      const mlEmoji = prediction.confidence > 0.4 ? (prediction.direction > 0 ? '🟢' : '🔴') : prediction.confidence > 0.2 ? '🟡' : '⚪';
      const rec = prediction.confidence > 0.4 ? (prediction.direction > 0 ? 'BUY' : 'SELL') : prediction.confidence > 0.2 ? 'WATCH' : 'HOLD';
      try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
      await ctx.reply(
        `🧠 ML PREDICT — ${symbol}\n\n${mlEmoji} ${rec} | ${direction}\nConfidence: ${(prediction.confidence * 100).toFixed(1)}%\nExpected: ${prediction.priceChange > 0 ? '+' : ''}${prediction.priceChange.toFixed(2)}%\nPrice: $${currentPrice.toLocaleString()}`,
      );
      break;
    }
    case 'chart': {
      const loading = await ctx.reply(`🔄 Generating chart for ${symbol} 1h...`);
      const chartData = await dataManager.getRecentData(symbol, '1h', 100);
      if (!chartData || chartData.length === 0) {
        try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
        await ctx.reply(`❌ No data for ${symbol}`);
        break;
      }
      const mapped = chartData.map(d => ({ t: d.timestamp, o: d.open, h: d.high, l: d.low, c: d.close, v: d.volume }));
      const chartResult = await imageChartService.generateCandlestickChart(symbol, '1h', mapped as any);
      const patternInfo = chartResult.patterns.length > 0
        ? `\nPatterns: ${chartResult.patterns.map((p: any) => p.name).join(', ')}`
        : '';
      try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
      await bot.telegram.sendPhoto(chatId, { source: chartResult.buffer }, { caption: `📈 ${symbol} 1h Chart${patternInfo}` });
      break;
    }
    case 'analyze': {
      const loading = await ctx.reply(`🔄 Analyzing ${symbol}... (30-60s)`);
      const result = await comprehensiveAnalyzer.analyzeComprehensiveForBot(symbol);
      try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
      await ctx.reply(
        `📊 ANALYZE — ${symbol}\n\nPrice: $${result.currentPrice.toFixed(2)}\nTrend: ${result.technical.trend.toUpperCase()} (${(result.technical.strength * 100).toFixed(1)}%)\nRSI: ${result.technical.rsi.toFixed(1)} ${result.technical.rsi < 30 ? '🟢' : result.technical.rsi > 70 ? '🔴' : '🟡'}\nMACD: ${result.technical.macd.signal.toUpperCase()}\n\nSupport: $${result.technical.supportResistance.support.toFixed(2)}\nResistance: $${result.technical.supportResistance.resistance.toFixed(2)}\n\n⏰ 1H: ${result.timeframes['1h'].trend} | 4H: ${result.timeframes['4h'].trend} | 1D: ${result.timeframes['1d'].trend}`,
      );
      break;
    }
    case 'fullanalysis': {
      const loading = await ctx.reply(`🔄 Full analysis for ${symbol}...`);
      const [techRes, newsRes] = await Promise.allSettled([
        comprehensiveAnalyzer.analyzeComprehensiveForBot(symbol),
        newsAnalyzer.analyzeComprehensiveNews(symbol).then(r => r.aiAnalysis ?? null),
      ]);
      try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
      if (techRes.status === 'rejected') { await ctx.reply(`❌ Analysis failed`); break; }
      const t = techRes.value;
      const n = newsRes.status === 'fulfilled' ? newsRes.value : null;
      const newsLine = n
        ? `\n📰 News: ${n.overallSentiment} | ${n.marketMovement.direction} (${n.marketMovement.confidence.toFixed(1)}%)`
        : '\n📰 News: N/A';
      await ctx.reply(
        `🌐 FULL ANALYSIS — ${symbol}\n\nPrice: $${t.currentPrice.toFixed(2)}\nTrend: ${t.technical.trend.toUpperCase()} (${(t.technical.strength * 100).toFixed(1)}%)\nRSI: ${t.technical.rsi.toFixed(1)} | MACD: ${t.technical.macd.signal.toUpperCase()}\n\n1H: ${t.timeframes['1h'].signal} | 4H: ${t.timeframes['4h'].signal} | 1D: ${t.timeframes['1d'].signal}${newsLine}\n\nAction: ${t.recommendation.action.toUpperCase()} | Conf: ${t.recommendation.confidence.toFixed(1)}%`,
      );
      break;
    }
    case 'pnews': {
      if (!chutesService.isConfigured()) { await ctx.reply('❌ Chutes AI not configured. Add CHUTES_API_KEY to .env'); break; }
      const loading = await ctx.reply(`🔄 AI news analysis for ${symbol}... (2-3 min)`);
      (async () => {
        try {
          const result = await newsAnalyzer.analyzeComprehensiveNews(symbol);
          const articles = result.traditionalNews.articles;
          const ai = result.aiAnalysis;
          if (!ai) { await ctx.reply('❌ AI analysis not available (check CHUTES_API_KEY)'); return; }
          const sent = ai.overallSentiment === 'BULLISH' ? '🟢 BULLISH' : ai.overallSentiment === 'BEARISH' ? '🔴 BEARISH' : '🟡 NEUTRAL';
          const dir = ai.marketMovement.direction === 'UP' ? '📈' : ai.marketMovement.direction === 'DOWN' ? '📉' : '➡️';
          const headlines = articles.slice(0, 3).map((a: any, i: number) => `${i + 1}. ${a.title.substring(0, 70)}...`).join('\n');
          try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
          await ctx.reply(`🤖 AI NEWS — ${symbol}\n\n${sent}\n${dir} ${ai.marketMovement.direction} | Conf: ${ai.marketMovement.confidence.toFixed(1)}%\nRange: ${ai.marketMovement.expectedRange.low.toFixed(1)}% ~ ${ai.marketMovement.expectedRange.high.toFixed(1)}%\n\n24H: ${ai.impactPrediction.shortTerm}\n\nTop News:\n${headlines}`);
        } catch (e: any) { await ctx.reply(`❌ News error: ${e.message}`); }
      })();
      break;
    }
    case 'impact': {
      const loading = await ctx.reply(`🔄 Quick impact for ${symbol}...`);
      const result = await newsAnalyzer.analyzeComprehensiveNews(symbol);
      const ai = result.aiAnalysis;
      try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
      if (!ai) { await ctx.reply(`⚡ IMPACT — ${symbol}\n\nSentiment: ${result.combinedSentiment.label}\nConf: ${result.combinedSentiment.confidence.toFixed(1)}%`); break; }
      const sent = ai.overallSentiment === 'BULLISH' ? '🟢' : ai.overallSentiment === 'BEARISH' ? '🔴' : '🟡';
      await ctx.reply(`⚡ IMPACT — ${symbol}\n\n${sent} ${ai.overallSentiment}\n24H: ${ai.impactPrediction.shortTerm}\nExpected: ${ai.marketMovement.direction} ${ai.marketMovement.expectedRange.low.toFixed(1)}~${ai.marketMovement.expectedRange.high.toFixed(1)}%\nConf: ${ai.marketMovement.confidence.toFixed(1)}%`);
      break;
    }
    case 'news': {
      const loading = await ctx.reply(`🔄 Basic news for ${symbol}...`);
      const result = await newsAnalyzer.analyzeComprehensiveNews(symbol);
      const articles = result.traditionalNews.articles;
      try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
      if (articles.length === 0) { await ctx.reply(`❌ No news found for ${symbol}`); break; }
      const headlines = articles.slice(0, 5).map((a: any, i: number) => `${i + 1}. ${a.title.substring(0, 80)}...`).join('\n');
      await ctx.reply(`📰 NEWS — ${symbol}\n\nSentiment: ${result.combinedSentiment.label}\n\n${headlines}`);
      break;
    }
    case 'papertrade': {
      const ptSession = getUserSession(telegramId);
      if (ptSession.paperTrading?.isActive()) { await ctx.reply('📈 Paper trading already active.\nUse /stoptrading to stop.'); break; }
      const ptConfig: PaperTradingConfig = { initialBalance: 1000, maxOpenTrades: 3, feeOpen: 0.001, feeClose: 0.001, stakeCurrency: 'USDT', updateInterval: 5000 };
      const paperEngine = new PaperTradingEngine(strategy, ptConfig, String(dbUserId));
      ptSession.paperTrading = paperEngine;
      await paperEngine.start(symbol, '5m', 500);
      await ctx.reply(`✅ Paper trading started — ${symbol}\n💰 Balance: $1000 | Strategy: ${strategy.name}\n\nUse 💼 Portfolio to monitor.`);
      break;
    }
    case 'stoptrading': {
      const ptSession = getUserSession(telegramId);
      if (!ptSession.paperTrading?.isActive()) { await ctx.reply('❌ No active paper trading session.'); break; }
      ptSession.paperTrading.stop();
      const r = ptSession.paperTrading.getCurrentResult();
      await ctx.reply(`⏹ Paper trading stopped.\n\n💰 Final: $${r.balance.toFixed(2)}\nP&L: $${r.totalProfit.toFixed(2)} (${r.totalProfitPct.toFixed(2)}%)\nTrades: ${r.totalTrades} | Win: ${r.winRate.toFixed(1)}%`);
      break;
    }
    case 'portfolio': {
      const ptSession = getUserSession(telegramId);
      if (!ptSession.paperTrading) { await ctx.reply('❌ No paper trading session. Use ▶️ Start Paper to begin.'); break; }
      const r = ptSession.paperTrading.getCurrentResult();
      const posLines = r.positions.length > 0
        ? r.positions.map((p: any) => `${p.side.toUpperCase()} ${p.pair}: $${(p.unrealizedPnl || 0).toFixed(2)}`).join('\n')
        : 'No open positions';
      await ctx.reply(`💼 Portfolio\n\nBalance: $${r.balance.toFixed(2)}\nP&L: $${r.totalProfit.toFixed(2)} (${r.totalProfitPct.toFixed(2)}%)\nTrades: ${r.totalTrades} | Win: ${r.winRate.toFixed(1)}%\n\nPositions:\n${posLines}`);
      break;
    }
    case 'performance': {
      const ptSession = getUserSession(telegramId);
      if (!ptSession.paperTrading) { await ctx.reply('❌ No paper trading session.'); break; }
      const r = ptSession.paperTrading.getCurrentResult();
      const slippageCost = r.totalSlippageCost || 0;
      const spreadCost = r.totalSpreadCost || 0;
      const noFrictionProfit = r.profitWithoutSlippage || r.totalProfit;
      await ctx.reply(`📈 Performance\n\nBalance: $${r.balance.toFixed(2)}\nTotal P&L: $${r.totalProfit.toFixed(2)} (${r.totalProfitPct.toFixed(2)}%)\nNo-Friction P&L: $${noFrictionProfit.toFixed(2)}\nSlippage Cost: $${slippageCost.toFixed(2)}\nSpread Cost: $${spreadCost.toFixed(2)}\nTrades: ${r.totalTrades} | Win Rate: ${r.winRate.toFixed(1)}%\nSharpe: ${r.sharpeRatio.toFixed(3)} | Max DD: $${r.maxDrawdown.toFixed(2)}`);
      break;
    }
    case 'strategies': {
      await ctx.reply(`🗂 Available Strategies\n\n🦅 OpenClawStrategy v${openClawStrategy.version} (active)\n- Timeframe: 1h | Long/Short\n- Indicators: RSI, MACD, EMA, ADX, BB, ATR\n\n🎯 SampleStrategy v1.0.0\n- Timeframe: 5m\n- Indicators: RSI, MACD, BB, EMA\n\n💡 Use /optimize SYMBOL 60 to find best params!`);
      break;
    }
    case 'apistatus': {
      const loading = await ctx.reply('🔄 Checking Binance API...');
      const status = await binanceService.getFullHealthStatus();
      const report = binanceService.formatHealthReport(status);
      // F3-18: tambah info WebSocket streams
      const wsStatus = connectionManager.getStatus();
      const streamLines = wsStatus.streams.length > 0
        ? wsStatus.streams.map(s => `• ${s.type} [${s.symbol}${s.interval ? '/' + s.interval : ''}] — ${s.subscribers} subs`).join('\n')
        : '• No active streams';
      const wsReport = `\n\n📡 WebSocket Streams (${wsStatus.activeStreamCount}/${wsStatus.maxStreams}):\n${streamLines}`;
      try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
      await ctx.reply(report + wsReport);
      break;
    }
    case 'healthcheck': {
      await ctx.reply('💡 Run full health report:\n/healthcheck');
      break;
    }
    case 'pstatus': {
      const configured = chutesService.isConfigured();
      await ctx.reply(`🤖 Chutes AI: ${configured ? '✅ Configured & Ready\n/pnews SYMBOL — Full AI news\n/impact SYMBOL — Quick impact' : '❌ Not configured\nAdd CHUTES_API_KEY to .env'}`);
      break;
    }
    case 'mlstatus':
    case 'mlstats': {
      // F4-20: ML stats dengan Fase 4 WFV info (F4-3)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fsM = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pathM = require('path');
      const hyperPath = pathM.join(process.cwd(), 'models', 'training_hyperparams.json');
      const statusLine = mlModelLoaded ? '\u2705 Model dimuat (Fase 4)' : '\u26a0\ufe0f Belum dimuat';
      let hyperMsg = '';
      if (fsM.existsSync(hyperPath)) {
        try {
          const hp = JSON.parse(fsM.readFileSync(hyperPath, 'utf-8'));
          const wfvLine = hp.wfv
            ? '\n\n\ud83d\udcc8 WFV: ' + hp.wfv.windowCount + ' windows | Mean: ' + (hp.wfv.meanAccuracy * 100).toFixed(1) + '%'
            : '';
          hyperMsg = '\n\ud83d\udcca Training: ' + new Date(hp.trainedAt).toLocaleString() +
            '\nArsitektur: GRU(64)\u2192GRU(32)\u2192Dense(3,softmax)' +
            '\nTest Acc: ' + (hp.testAccuracy * 100).toFixed(1) + '% | Epoch: ' + hp.actualEpochs + wfvLine;
        } catch { hyperMsg = '\n(Error membaca training record)'; }
      } else {
        hyperMsg = '\n\ud83d\udca1 Belum ada training record. Jalankan /trainmodel';
      }
      await ctx.reply(
        '\ud83e\udde0 ML STATUS\n\n' + statusLine + hyperMsg +
        '\n\nCommands:\n\u2022 /mlpredict ' + symbol + ' \u2014 Prediksi AI\n\u2022 /trainmodel ' + symbol + ' 1h \u2014 Latih ulang',
      );
      break;
    }
    case 'liveportfolio': {
      if (!binanceOrderService.isConfigured()) { await ctx.reply('❌ Binance API keys not configured.'); break; }
      const loading = await ctx.reply('🔄 Fetching live portfolio...');
      const [balances, openOrders] = await Promise.all([binanceOrderService.getAccountBalance(), binanceOrderService.getOpenOrders()]);
      try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
      if (balances.length === 0) { await ctx.reply('📭 No non-zero balances.'); break; }
      const balLines = balances.slice(0, 15).map((b: any) => `• ${b.asset}: ${b.free} (locked: ${b.locked})`).join('\n');
      await ctx.reply(`💼 Live Portfolio\nOpen Orders: ${openOrders.length}\n\nBalances:\n${balLines}`);
      break;
    }
    case 'orders': {
      if (!binanceOrderService.isConfigured()) { await ctx.reply('❌ Binance API keys not configured.'); break; }
      const loading = await ctx.reply('🔄 Fetching open orders...');
      const orders = await binanceOrderService.getOpenOrders(symbol);
      try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) { /* ignore */ }
      if (orders.length === 0) { await ctx.reply(`✅ No open orders for ${symbol}.`); break; }
      const lines = orders.slice(0, 15).map((o: any) => `#${o.orderId} ${o.side} ${o.type}: ${o.executedQty}/${o.origQty} @ ${o.price}`).join('\n');
      await ctx.reply(`📋 Open Orders — ${symbol}\n\n${lines}`);
      break;
    }
    case 'backtest': {
      await ctx.reply(`💡 Run full backtest:\n/backtest ${symbol} 30`);
      break;
    }
    case 'optimize': {
      await ctx.reply(`💡 Run optimization:\n/optimize ${symbol} 60`);
      break;
    }
    case 'download': {
      await ctx.reply(`💡 Download historical data:\n/download ${symbol} 30`);
      break;
    }
    case 'datainfo': {
      await ctx.reply(`🔄 Checking data for ${symbol}...`);
      const recentData = await dataManager.getRecentData(symbol, '5m', 100);
      const summary = dataManager.getDataSummary(recentData);
      const quality = dataManager.validateDataQuality(recentData);
      const lastClose = recentData[recentData.length - 1]?.close ?? 0;
      await ctx.reply(`📊 Data Info — ${symbol}\n\nLatest: $${lastClose.toFixed(2)}\nRange: $${summary.priceRange.min.toFixed(2)} - $${summary.priceRange.max.toFixed(2)}\nQuality: ${quality.isValid ? '✅ Valid' : '❌ Issues'} | Gaps: ${quality.gaps.length}`);
      break;
    }
    case 'livestart': {
      await ctx.reply(
        `🚀 Live Trading — ${symbol}\n\n⚠️ This uses REAL funds!\n\nConfirm:`,
        Markup.inlineKeyboard([
          [Markup.button.callback(`🔴 Confirm Start (${symbol}) (Real $)`, 'run:livestart_confirm')],
          [Markup.button.callback('❌ Cancel', 'home')],
        ]),
      );
      break;
    }
    case 'livestart_confirm': {
      const liveSession = getUserSession(telegramId);
      if (liveSession.liveTrading?.active) { await ctx.reply(`❌ Live trading already active for ${liveSession.liveTrading.symbol}.`); break; }
      if (!binanceOrderService.isConfigured()) { await ctx.reply('❌ Binance API keys not configured.'); break; }
      const strategyToUse = openClawStrategy;
      const intervalMs = parseInt(process.env.LIVE_SIGNAL_INTERVAL_MS || '300000', 10);
      liveSession.liveTrading = { active: true, symbol, strategy: strategyToUse, userDbId: dbUserId, startedAt: new Date() };
      await riskMonitorLoop.start();
      const runSig = async () => {
        if (!liveSession.liveTrading?.active) return;
        try { await executeLiveSignal(dbUserId, symbol, strategyToUse); } catch (_) { /* logged by callee */ }
      };
      await runSig();
      liveSession.liveTrading.timer = setInterval(() => {
        runSig().catch((error) => {
          withLogContext({ service: 'enhancedBot', userId: telegramId, symbol }).error(
            { err: error },
            'livetrade interval execution error',
          );
        });
      }, intervalMs);
      await ctx.reply(`✅ Live trading started — ${symbol}\nStrategy: ${strategyToUse.name}\nInterval: ${(intervalMs / 1000).toFixed(0)}s\n\nUse ⛔ Stop Live to stop.`);
      break;
    }
    case 'livestop': {
      const liveSession = getUserSession(telegramId);
      if (!liveSession.liveTrading?.active) { await ctx.reply('❌ No active live trading session.'); break; }
      stopLiveTradingSession(liveSession.liveTrading);
      liveSession.liveTrading = undefined;
      await ctx.reply('✅ Live trading stopped.');
      break;
    }
    case 'help': {
      await ctx.reply(`❓ Quick Help\n\n/coin BTC — Set active coin\n/menu — Open menu\n/signal BTCUSDT — Trading signal\n/analyze BTCUSDT — Full analysis\n/papertrade BTCUSDT — Paper trading\n/backtest BTCUSDT 30 — Backtest\n/help — Full command list`);
      const activeSymbol = await getActiveSymbol(dbUserId);
      await ctx.reply(`📌 Menu — Coin: ${activeSymbol}`, buildMainMenuInline(activeSymbol));
      break;
    }
    default: {
      await ctx.reply(`❓ Unknown action: ${action}`);
    }
  }
}

// ── QUICK COIN INPUT ──────────────────────────────────────────────────────────

bot.hears(/^[A-Za-z]{2,5}(USDT|USDC|BUSD|FDUSD|BTC|ETH)?$/i, async (ctx) => {
  if (!ctx.message || !('text' in ctx.message)) return;
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;

  const reserved = new Set(['START', 'HELP', 'MENU']);
  const upper = text.toUpperCase();
  if (reserved.has(upper)) return;

  try {
    const user = await ensureUser(ctx);
    if (!user) return;
    const symbol = normalizeSymbolInput(text);
    await setActiveSymbol(user.id, symbol);
    await ctx.reply(
      `✅ Coin aktif: ${symbol}\nTap kategori untuk aksi:`,
      buildMainMenuInline(symbol),
    );
  } catch {
    // Ignore non-symbol casual messages
  }
});

// Start command
bot.command('start', async (ctx) => {
  // Ensure user exists in database
  await ensureUser(ctx);

  const username = ctx.message.from.username || ctx.message.from.first_name || 'Unknown';
  const userId = ctx.message.from.id;
  withLogContext({ service: 'enhancedBot', userId }).info({ username }, 'New user started bot');
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
/livetrade start [symbol] confirm - Start live trading (real funds)
/livetrade stop - Stop live trading
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
/healthcheck - Check full system health
/logs [N] - Show recent system logs (admin only)
/orders [symbol] - View open Binance orders
/cancelorder <orderId> [symbol] - Cancel live order
/liveportfolio - View non-zero balances + open orders
/pstatus - Check Chutes AI configuration
/mlstatus - Check ML model status

⚡ QUICK MENU (NEW):
/coin BTCUSDT - Set coin aktif sekali
/menu - Tampilkan keyboard semua fitur pakai coin aktif
/go - Quick open menu

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
/livetrade start [symbol] confirm - Start live trading (real funds)
/livetrade stop - Stop live trading
/stoptrading - Stop current paper trading session
/portfolio - View current positions and balance
/performance - Detailed performance metrics
/orders [symbol] - View open Binance orders
/cancelorder <orderId> [symbol] - Cancel live order
/liveportfolio - View non-zero balances + open orders

🔹 STRATEGY & OPTIMIZATION:
/optimize [symbol] [days] - Optimize strategy parameters
   Example: /optimize BTCUSDT 60
/strategies - List all available trading strategies

🔹 DATA MANAGEMENT:
/download [symbol] [days] - Download historical data
   Example: /download BTCUSDT 90
/datainfo [symbol] - Check data quality and summary

⚡ QUICK MENU (NEW):
/coin [symbol] - Set coin aktif (contoh: /coin BTC)
/menu [optional-symbol] - Buka keyboard fitur dengan coin aktif
/go - Quick open menu
Tip: setelah set coin, cukup tap tombol command tanpa ngetik ulang symbol.

🔹 PRICE ALERTS:
/alert [symbol] [price] [above/below] - Set price alert
/alerts - List your active price alerts
/delalert [symbol] - Delete price alert

📊 ANALYTICS & PERFORMANCE:
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
/healthcheck - Full system health (DB, REST, WS, ML, process)
/logs [N] - Show recent ErrorLog rows (admin only)
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

  logger.info(
    `[${new Date().toISOString()}] User: ${username} (${userId}) requested signal for: ${symbol || 'undefined'}`
  );

  // Track command
  stateManager.incrementCommandCount();

  if (!symbol) {
    return ctx.reply('Please provide a symbol. Example: /signal BTCUSDT');
  }

  let loadingMsg: any;
  try {
    loadingMsg = await ctx.reply('🔄 Generating signal...');
    const signal = await signalGenerator.generateSignal(symbol);

    // Add signal to dashboard using structured data from SignalResult
    stateManager.addSignal({
      symbol,
      action: signal.action,
      price: signal.price,
      confidence: signal.confidence,
      timestamp: new Date(),
      indicators: {},
    });

    ctx.reply(signal.text);
  } catch (error) {
    logger.error({ err: error }, `Error generating signal for ${symbol}:`);
    ctx.reply(`❌ Error generating signal for ${symbol}. Please check the symbol and try again.`);
  } finally {
    if (loadingMsg) {
      try { await ctx.deleteMessage(loadingMsg.message_id); } catch (e) { /* ignore */ }
    }
  }

  return;
});

// COMPREHENSIVE ANALYSIS COMMAND
bot.command('analyze', async (ctx) => {
  const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
  const username = ctx.message.from.username || ctx.message.from.first_name || 'Unknown';
  const userId = ctx.message.from.id;

  logger.info(
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

  let loadingMessage: any;
  try {
    loadingMessage = await ctx.reply(`🔄 Performing comprehensive analysis for ${symbol}...

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
    let loadingChartsMsg: any;
    try {
      loadingChartsMsg = await ctx.reply('🔄 Generating charts...');
      const timeframes = ['1h', '4h', '1d'];

      for (const tf of timeframes) {
        try {
          // Get data efficiently (limit to 100 candles)
          const data = await dataManager.getRecentData(symbol, tf, 100);

          if (!data || data.length === 0) {
            logger.warn(`[Analyze] No chart data available for ${symbol} ${tf}`);
            continue;
          }

          // Convert data to format expected by ImageChartService
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
            tf,
            chartData
          );
          const patternInfo =
            chartResult.patterns.length > 0
              ? `\n📊 Patterns: ${chartResult.patterns.map((p) => `${p.name} (${p.confidence}%)`).join(', ')}`
              : '';
          await ctx.replyWithPhoto(
            { source: chartResult.buffer },
            { caption: `${symbol} ${tf} Chart${patternInfo}` }
          );
        } catch (tfChartError) {
          logger.error({ err: tfChartError }, `Chart generation failed for ${symbol} ${tf}:`);
        }
      }
    } catch (chartError) {
      logger.error({ err: chartError }, 'Chart generation error in /analyze:');
      await ctx.reply('⚠️ Could not generate chart images, but analysis continues...');
    } finally {
      if (loadingChartsMsg) {
        try { await ctx.deleteMessage(loadingChartsMsg.message_id); } catch (e) { /* ignore */ }
      }
    }

    await ctx.reply(`${recommendationSection}`);

    await ctx.reply(`
✅ Analysis completed at ${analysisResult.timestamp.toLocaleString()}
💡 Use /backtest ${symbol} 30 for detailed backtesting
💡 Use /papertrade ${symbol} to start paper trading`);

    // Add scraped news analysis (and AI if configured)
    try {
      logger.info(`[SCRAPE] [/analyze] news-enrichment start symbol=${symbol}`);
      await ctx.reply(`🔄 Adding scraped news sentiment analysis...`);
      const newsResult = await newsAnalyzer.analyzeComprehensiveNews(symbol, analysisResult.currentPrice);
      logger.info(
        `[SCRAPE] [/analyze] news-enrichment result symbol=${symbol} articles=${newsResult.traditionalNews.articles.length} reddit=${newsResult.redditSentiment.posts.length} ai=${newsResult.aiAnalysis ? 'yes' : 'no'}`
      );

      if (
        newsResult.traditionalNews.articles.length === 0 &&
        newsResult.redditSentiment.posts.length === 0
      ) {
        await ctx.reply(`📰 No recent scraped news found for ${symbol}`);
      } else if (newsResult.aiAnalysis) {
        const ai = newsResult.aiAnalysis;
        const newsSection = `
📰 NEWS SENTIMENT ANALYSIS (Scraped Data + Chutes AI):

📊 Overall Sentiment: ${ai.overallSentiment} ${
          ai.overallSentiment === 'BULLISH'
            ? '🟢📈'
            : ai.overallSentiment === 'BEARISH'
              ? '🔴📉'
              : '🟡➡️'
        }

📈 Market Movement Prediction: ${ai.marketMovement.direction} ${
          ai.marketMovement.direction === 'UP'
            ? '📈'
            : ai.marketMovement.direction === 'DOWN'
              ? '📉'
              : '➡️'
        }
Confidence Level: ${ai.marketMovement.confidence.toFixed(1)}%

⏰ IMPACT PREDICTIONS:
🔹 24H: ${ai.impactPrediction.shortTerm}
🔸 7D: ${ai.impactPrediction.mediumTerm}
🔹 30D: ${ai.impactPrediction.longTerm}

🔥 SCRAPED NEWS (${newsResult.traditionalNews.articles.length} items):
${newsResult.traditionalNews.articles
  .slice(0, 5)
  .map((item, index) => `${index + 1}. [${item.source}] ${item.title.substring(0, 70)}...`)
  .join('\n')}

💬 REDDIT SIGNALS (${newsResult.redditSentiment.posts.length} posts): ${newsResult.redditSentiment.label}

💡 Use /pnews ${symbol} for detailed news analysis`;

        await ctx.reply(newsSection);
      } else {
        await ctx.reply(`
📰 NEWS SENTIMENT ANALYSIS (Scraped Data):

News Sentiment: ${newsResult.traditionalNews.sentiment}
Reddit Sentiment: ${newsResult.redditSentiment.label}
Combined: ${newsResult.combinedSentiment.label}
Confidence: ${newsResult.combinedSentiment.confidence.toFixed(1)}%

💡 Set CHUTES_API_KEY to enable AI deep analysis from this scraped data.`);
      }
    } catch (newsError) {
      logger.error({ err: newsError }, 'News analysis error in /analyze:');
      await ctx.reply(`💡 For news analysis, try: /pnews ${symbol}`);
    }

  } catch (error) {
    logger.error({ err: error }, `Comprehensive analysis error for ${symbol}:`);
    ctx.reply(`❌ Error performing comprehensive analysis for ${symbol}.

This could be due to:
• Invalid symbol (try BTCUSDT, ETHUSDT, etc.)
• Market data unavailable
• Technical analysis issues

Please check the symbol and try again, or contact support if the issue persists.`);
  } finally {
    // Delete loading message
    if (loadingMessage) {
      try {
        await ctx.deleteMessage(loadingMessage.message_id);
      } catch (error) {
        // Ignore if can't delete
      }
    }
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
      logger.error({ err: dbError }, 'Error saving backtest to database:');
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
    logger.error({ err: error }, 'Backtest error:');
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
    logger.error({ err: error }, 'Paper trading error:');
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
bot.command('performance', async (ctx) => {
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

💸 EXECUTION COSTS:
Slippage Cost: $${(result.totalSlippageCost || 0).toFixed(2)}
Spread Cost: $${(result.totalSpreadCost || 0).toFixed(2)}
P&L Without Friction: $${(result.profitWithoutSlippage || result.totalProfit).toFixed(2)}

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

  try {
    const equityData = result.performance.map((metric) => ({
      timestamp: metric.timestamp,
      balance: metric.balance
    }));

    const equityChart = await imageChartService.generateEquityCurveChart('Paper Trading', equityData);
    await ctx.replyWithPhoto(
      { source: equityChart.buffer },
      { caption: '📉 Equity Curve (Paper Trading)' }
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to generate/send equity curve chart:');
  }

  await ctx.reply(message);

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
    logger.error({ err: error }, 'Optimization error:');
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
    logger.error({ err: error }, 'Download error:');
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
    logger.error({ err: error }, 'Data info error:');
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
    logger.error({ err: error }, 'OpenClaw error:');
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
      logger.error({ err: cacheError }, 'Failed to cache data:');
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
      logger.error({ err: dbError }, 'Failed to save prediction:');
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
    logger.error({ err: error }, 'ML Predict error:');
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
    logger.error({ err: error }, 'Train model error:');
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

  try {
    logger.info(`[SCRAPE] [/news] request symbol=${symbol} user=${ctx.message.from.id}`);
    const loadingMsg = await ctx.reply(`🔄 Scraping latest news + community posts for ${symbol}...`);

    // Always use real scraped pipeline
    const result = await newsAnalyzer.analyzeComprehensiveNews(symbol);
    logger.info(
      `[SCRAPE] [/news] result symbol=${symbol} articles=${result.traditionalNews.articles.length} reddit=${result.redditSentiment.posts.length} ai=${result.aiAnalysis ? 'yes' : 'no'}`
    );

    if (result.traditionalNews.articles.length === 0 && result.redditSentiment.posts.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
      return ctx.reply(`📰 No recent scraped news/posts found for ${symbol}`);
    }

    const articles = result.traditionalNews.articles;
    const redditPosts = result.redditSentiment.posts;
    const ai = result.aiAnalysis;

    // Format response from scraped data
    const newsSection = `📰 SCRAPED NEWS for ${symbol}
━━━━━━━━━━━━━━━━━━━━━━━━━

${articles
  .slice(0, 5)
  .map(
    (item, idx) => `
${idx + 1}. ${item.title}
   🕒 ${new Date(item.publishedAt).toLocaleString()}
   📝 ${item.summary.substring(0, 150)}${item.summary.length > 150 ? '...' : ''}
   🔗 ${item.url}
`
  )
  .join('\n')}

👥 REDDIT SIGNAL (${redditPosts.length} posts):
${redditPosts
  .slice(0, 3)
  .map((p, idx) => `${idx + 1}. [r/${p.subreddit}] ${p.title.substring(0, 80)}... (↑${p.score})`)
  .join('\n') || 'No relevant Reddit posts found.'}`;

    const analysisSection = ai
      ? `
━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 AI ANALYSIS (from REAL scraped data)

📊 Overall Sentiment: ${ai.overallSentiment} ${
      ai.overallSentiment === 'BULLISH'
        ? '🟢📈'
        : ai.overallSentiment === 'BEARISH'
          ? '🔴📉'
          : '🟡➡️'
    }

🎯 Price Impact Prediction:
Direction: ${ai.marketMovement.direction} ${
      ai.marketMovement.direction === 'UP'
        ? '📈'
        : ai.marketMovement.direction === 'DOWN'
          ? '📉'
          : '➡️'
    }
Confidence: ${ai.marketMovement.confidence.toFixed(1)}%
Expected Range: ${ai.marketMovement.expectedRange.low.toFixed(1)} to ${ai.marketMovement.expectedRange.high.toFixed(1)}

⏰ TIMEFRAME PREDICTIONS:
• 24H: ${ai.impactPrediction.shortTerm}
• 7D: ${ai.impactPrediction.mediumTerm}
• 30D: ${ai.impactPrediction.longTerm}`
      : `
━━━━━━━━━━━━━━━━━━━━━━━━━
📊 BASE SENTIMENT (keyword model)

News Sentiment: ${result.traditionalNews.sentiment}
Reddit Sentiment: ${result.redditSentiment.label}
Combined: ${result.combinedSentiment.label}
Confidence: ${result.combinedSentiment.confidence.toFixed(1)}%

💡 Tip: set CHUTES_API_KEY to enable deep AI analysis over scraped data.`;

    const factorsSection =
      ai && ai.keyFactors.length > 0
        ? `
🔑 KEY FACTORS:
${ai.keyFactors.map((factor, index) => `${index + 1}. ${factor}`).join('\n')}`
        : '';

    // Send analysis
    await ctx.reply(newsSection);
    await ctx.reply(analysisSection + factorsSection);

    // Delete loading message
    await ctx.deleteMessage(loadingMsg.message_id).catch(() => {});
  } catch (error) {
    logger.error({ err: error }, 'News analysis error:');
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
      logger.info(`[AI] [/pnews] request symbol=${symbol} user=${ctx.message.from.id}`);
      // Get scraped news + AI analysis from real data
      const result = await newsAnalyzer.analyzeComprehensiveNews(symbol);
      const newsItems = result.traditionalNews.articles;
      const analysis = result.aiAnalysis;
      logger.info(
        `[AI] [/pnews] result symbol=${symbol} articles=${newsItems.length} reddit=${result.redditSentiment.posts.length} ai=${analysis ? 'yes' : 'no'}`
      );

      if (newsItems.length === 0 && result.redditSentiment.posts.length === 0) {
        await ctx.reply(`❌ No recent news found for ${symbol}.

Try:
• Different symbol (BTCUSDT, ETHUSDT, etc.)
• /news ${symbol} for basic analysis
• Check symbol spelling`);
        return;
      }

      if (!analysis) {
        await ctx.reply(`❌ AI analysis not available for ${symbol} right now.

💡 Scraping works, but CHUTES_API_KEY may be missing/invalid.
Try /news ${symbol} for scraped sentiment.`);
        return;
      }

      // Add news to dashboard
      newsItems.slice(0, 5).forEach((item) => {
        stateManager.addNews({
          symbol,
          title: item.title,
          sentiment: analysis.overallSentiment,
          impact: 'MEDIUM',
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
    return `${index + 1}. 📰 ${item.title.substring(0, 80)}...
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
Confidence: ${analysis.marketMovement.confidence.toFixed(1)}%
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
      logger.error({ err: error }, 'Chutes news error:');

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

  try {
    logger.info(`[AI] [/impact] request symbol=${symbol} user=${ctx.message.from.id}`);
    ctx.reply(`🔄 Quick impact analysis for ${symbol}...`);

    const result = await newsAnalyzer.analyzeComprehensiveNews(symbol);
    const newsItems = result.traditionalNews.articles;
    const analysis = result.aiAnalysis;
    logger.info(
      `[AI] [/impact] result symbol=${symbol} articles=${newsItems.length} reddit=${result.redditSentiment.posts.length} ai=${analysis ? 'yes' : 'no'}`
    );

    if (newsItems.length === 0 && result.redditSentiment.posts.length === 0) {
      return ctx.reply(`❌ No recent impactful news found for ${symbol}`);
    }

    if (!analysis) {
      return ctx.reply(`⚡ QUICK IMPACT: ${symbol}

📊 Combined Sentiment: ${result.combinedSentiment.label}
Confidence: ${result.combinedSentiment.confidence.toFixed(1)}%

💡 Tip: Configure CHUTES_API_KEY for AI-powered 24H/7D/30D impact prediction.`);
    }

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
Confidence: ${analysis.marketMovement.confidence.toFixed(1)}%

🔥 Top News Impact:
${newsItems
  .slice(0, 3)
  .map(
    (item, index) =>
      `${index + 1}. 📰 ${item.title.substring(0, 60)}...`
  )
  .join('\n')}

💡 Use /pnews ${symbol} for detailed analysis`;

    ctx.reply(quickSummary);
  } catch (error) {
    logger.error({ err: error }, 'Quick impact error:');
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

    // Run technical + scraped news analyses in parallel
    const [technicalResult, newsAnalysis] = await Promise.allSettled([
      comprehensiveAnalyzer.analyzeComprehensiveForBot(symbol),
      newsAnalyzer.analyzeComprehensiveNews(symbol).then((result) => result.aiAnalysis ?? null),
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
• News Impact: ${news.marketMovement.direction} (${news.marketMovement.confidence.toFixed(1)}% confidence)
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
    logger.error({ err: error }, 'Full analysis error:');
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
    logger.error({ err: error }, 'Chutes status error:');
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
    logger.error({ err: error }, 'API status check error:');
    ctx.reply(`❌ Error checking API status: ${(error as Error).message}`);
  }

  return;
});

bot.command('healthcheck', async (ctx) => {
  try {
    const loadingMsg = await ctx.reply('🔄 Running full health check...');

    const stats = stateManager.getStats();

    // DB health probe
    try {
      await getPrisma().$queryRawUnsafe('SELECT 1');
      healthMonitor.setExternalComponentStatus('database', 'ok', 'Database reachable');
    } catch (error) {
      healthMonitor.setExternalComponentStatus('database', 'down', `Database unreachable: ${(error as Error).message}`);
    }

    const snapshot = await healthMonitor.runFullHealthCheck();

    const statusIcon = snapshot.overallStatus === 'ok' ? '✅' : snapshot.overallStatus === 'degraded' ? '⚠️' : '🚨';
    const comp = snapshot.components;

    const fmt = (name: string, c: { status: string; message: string }) => {
      const icon = c.status === 'ok' ? '✅' : c.status === 'degraded' ? '⚠️' : '🚨';
      return `${icon} ${name}: ${c.message}`;
    };

    const message = [
      `🩺 HEALTHCHECK ${statusIcon}`,
      `Overall: ${snapshot.overallStatus.toUpperCase()}`,
      '',
      fmt('Database', comp.database),
      fmt('Binance REST', comp.binanceRest),
      fmt('WebSocket', comp.binanceWs),
      fmt('ML Model', comp.modelAccuracy),
      fmt('Drawdown', comp.accountDrawdown),
      fmt('Balance', comp.accountBalance),
      fmt('Process', comp.botProcess),
      '',
      `⏱ Uptime: ${(snapshot.uptime / 60).toFixed(1)} min`,
      `🧠 Memory: ${snapshot.memoryUsageMb.toFixed(0)} MB`,
      `📨 Request Count: ${stats.totalCommands}`,
      `🔌 WS Streams: ${connectionManager.getActiveStreamCount()}`,
    ].join('\n');

    try {
      await ctx.deleteMessage(loadingMsg.message_id);
    } catch (e) {
      /* ignore */
    }

    await ctx.reply(message);
  } catch (error) {
    withLogContext({ service: 'enhancedBot', userId: ctx.message?.from?.id }).error({ err: error }, 'healthcheck command error');
    await ctx.reply(`❌ Error running health check: ${(error as Error).message}`);
  }
});

bot.command('logs', async (ctx) => {
  try {
    const adminChat = process.env.ADMIN_CHAT_ID;
    const requesterChat = String(ctx.chat?.id || '');
    if (!adminChat || requesterChat !== adminChat) {
      return ctx.reply('❌ Unauthorized. Command ini khusus admin.');
    }

    const arg = Number(ctx.message.text.split(' ')[1] || 20);
    const limit = Number.isFinite(arg) ? Math.min(Math.max(Math.trunc(arg), 1), 100) : 20;
    const rows = await db.getRecentErrors(limit);

    if (!rows || rows.length === 0) {
      return ctx.reply('📭 No logs found.');
    }

    const lines = rows.map((row: any, idx: number) => {
      const ts = new Date(row.createdAt).toISOString();
      const src = row.source || 'unknown';
      const lvl = (row.level || 'INFO').toUpperCase();
      const sym = row.symbol ? ` ${row.symbol}` : '';
      return `${idx + 1}. [${lvl}] ${ts} ${src}${sym}\n${row.message}`;
    });

    const chunks: string[] = [];
    let current = '📜 Recent Logs\n\n';
    for (const line of lines) {
      if ((current + line + '\n\n').length > 3500) {
        chunks.push(current.trim());
        current = '';
      }
      current += `${line}\n\n`;
    }
    if (current.trim()) chunks.push(current.trim());

    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  } catch (error) {
    withLogContext({ service: 'enhancedBot', userId: ctx.message?.from?.id }).error({ err: error }, 'logs command error');
    return ctx.reply(`❌ Error loading logs: ${(error as Error).message}`);
  }

  return;
});

// ============================================================================
// LIVE ORDER COMMANDS (FASE 1)
// ============================================================================

bot.command('orders', async (ctx) => {
  try {
    if (!binanceOrderService.isConfigured()) {
      return ctx.reply('❌ Binance API key/secret belum diset. Isi BINANCE_API_KEY dan BINANCE_API_SECRET dulu.');
    }

    const symbolArg = ctx.message.text.split(' ')[1]?.toUpperCase();
    const loadingMsg = await ctx.reply('🔄 Fetching open orders from Binance...');

    const orders = await binanceOrderService.getOpenOrders(symbolArg);

    try {
      await ctx.deleteMessage(loadingMsg.message_id);
    } catch (e) {
      /* ignore */
    }

    if (orders.length === 0) {
      return ctx.reply(`✅ Tidak ada open order${symbolArg ? ` untuk ${symbolArg}` : ''}.`);
    }

    const preview = orders.slice(0, 15);
    let message = `📋 Open Orders${symbolArg ? ` (${symbolArg})` : ''}\n\n`;

    for (const order of preview) {
      message += `• #${order.orderId} ${order.symbol} ${order.side} ${order.type}\n`;
      message += `  Qty: ${order.executedQty}/${order.origQty} | Price: ${order.price}\n`;
      message += `  Status: ${order.status}\n\n`;
    }

    if (orders.length > preview.length) {
      message += `...dan ${orders.length - preview.length} order lainnya.`;
    }

    return ctx.reply(message.trim());
  } catch (error) {
    logger.error({ err: error }, 'orders command error:');
    return ctx.reply(`❌ Gagal ambil open orders: ${(error as Error).message}`);
  }
});

bot.command('cancelorder', async (ctx) => {
  try {
    if (!binanceOrderService.isConfigured()) {
      return ctx.reply('❌ Binance API key/secret belum diset. Isi BINANCE_API_KEY dan BINANCE_API_SECRET dulu.');
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      return ctx.reply('Usage:\n/cancelorder <orderId> [symbol]\nContoh: /cancelorder 123456 BTCUSDT');
    }

    const orderId = Number(args[0]);
    if (!Number.isFinite(orderId)) {
      return ctx.reply('❌ orderId tidak valid. Contoh: /cancelorder 123456 BTCUSDT');
    }

    let symbol = args[1]?.toUpperCase();
    if (!symbol) {
      const allOpen = await binanceOrderService.getOpenOrders();
      const targetOrder = allOpen.find((o) => o.orderId === orderId);
      if (!targetOrder) {
        return ctx.reply('❌ Order tidak ditemukan di open orders. Tambahkan symbol jika order baru saja berubah status.');
      }
      symbol = targetOrder.symbol;
    }

    const loadingMsg = await ctx.reply(`🔄 Cancelling order #${orderId} (${symbol})...`);
    const result = await binanceOrderService.cancelOrder(symbol, orderId);

    try {
      await ctx.deleteMessage(loadingMsg.message_id);
    } catch (e) {
      /* ignore */
    }

    return ctx.reply(`✅ Order berhasil dibatalkan.\nSymbol: ${symbol}\nOrder ID: ${orderId}\nStatus: ${(result.status as string) || 'CANCELED'}`);
  } catch (error) {
    logger.error({ err: error }, 'cancelorder command error:');
    return ctx.reply(`❌ Gagal cancel order: ${(error as Error).message}`);
  }
});

// ── F3-14: /subscribe <symbol> [interval] ─────────────────────────────────────
// Register user to receive auto-signal notifications from kline close
bot.command('subscribe', async (ctx) => {
  try {
    const user = await ensureUser(ctx);
    if (!user) return;

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      return ctx.reply(
        '📡 **Cara pakai /subscribe:**\n' +
        '/subscribe BTCUSDT        — subscribe ke signal 1h (default)\n' +
        '/subscribe ETHUSDT 4h    — subscribe ke signal 4h\n\n' +
        'Bot akan mengirim notifikasi otomatis saat ada sinyal BUY/SELL dari kline close.',
      );
    }

    const symbol = args[0].toUpperCase();
    const interval = (args[1] || '1h').toLowerCase();
    const userId = user.id;

    // Register signal subscriber in connectionManager
    connectionManager.addSignalSubscriber(userId, symbol, async (sym, action, confidence, reason) => {
      const emoji = action === 'BUY' ? '🟢' : '🔴';
      const confPct = (confidence * 100).toFixed(0);
      try {
        await bot.telegram.sendMessage(
          ctx.chat.id,
          `${emoji} **AUTO-SIGNAL — ${sym}**\n\n` +
          `Action: **${action}**\n` +
          `Confidence: ${confPct}%\n` +
          `Reason: ${reason}\n\n` +
          `⏰ Interval: ${interval}`,
        );
      } catch (_) { /* chat might be closed */ }
    });

    return ctx.reply(
      `✅ Berhasil subscribe signal **${symbol}** (${interval})\n` +
      `Bot akan kirim notifikasi otomatis saat ada sinyal BUY/SELL dari kline close.\n\n` +
      `Gunakan /unsubscribe ${symbol} untuk berhenti.`,
    );
  } catch (error) {
    return ctx.reply(`❌ Error: ${(error as Error).message}`);
  }
});

// ── F3-15: /unsubscribe <symbol> ──────────────────────────────────────────────
// Remove user from auto-signal notifications
bot.command('unsubscribe', async (ctx) => {
  try {
    const user = await ensureUser(ctx);
    if (!user) return;

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      return ctx.reply('Usage: /unsubscribe BTCUSDT');
    }

    const symbol = args[0].toUpperCase();
    const userId = user.id;

    const noMoreSubs = connectionManager.removeSignalSubscriber(userId, symbol);

    const msg = noMoreSubs
      ? `✅ Unsubscribe dari ${symbol} berhasil. Stream dihentikan (tidak ada subscriber lain).`
      : `✅ Unsubscribe dari ${symbol} berhasil.`;

    return ctx.reply(msg);
  } catch (error) {
    return ctx.reply(`❌ Error: ${(error as Error).message}`);
  }
});

bot.command('liveportfolio', async (ctx) => {
  try {
    if (!binanceOrderService.isConfigured()) {
      return ctx.reply('❌ Binance API key/secret belum diset. Isi BINANCE_API_KEY dan BINANCE_API_SECRET dulu.');
    }

    const loadingMsg = await ctx.reply('🔄 Fetching live portfolio...');

    const [balances, openOrders] = await Promise.all([
      binanceOrderService.getAccountBalance(),
      binanceOrderService.getOpenOrders(),
    ]);

    try {
      await ctx.deleteMessage(loadingMsg.message_id);
    } catch (e) {
      /* ignore */
    }

    if (balances.length === 0) {
      return ctx.reply('📭 Tidak ada balance non-zero pada akun Binance saat ini.');
    }

    const topBalances = balances.slice(0, 20);
    let message = `💼 Live Portfolio (Binance)\n\n`;
    message += `📌 Open Orders: ${openOrders.length}\n\n`;
    message += `🪙 Non-zero Balances:\n`;

    for (const b of topBalances) {
      message += `• ${b.asset}: free=${b.free}, locked=${b.locked}\n`;
    }

    if (balances.length > topBalances.length) {
      message += `\n...dan ${balances.length - topBalances.length} asset lainnya.`;
    }

    return ctx.reply(message.trim());
  } catch (error) {
    logger.error({ err: error }, 'liveportfolio command error:');
    return ctx.reply(`❌ Gagal ambil live portfolio: ${(error as Error).message}`);
  }
});

bot.command('livetrade', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const action = (args[0] || '').toLowerCase();
  const session = getUserSession(ctx.message.from.id);

  if (!action || !['start', 'stop'].includes(action)) {
    return ctx.reply(
      'Usage:\n/livetrade start <symbol> confirm\n/livetrade stop\n\nContoh: /livetrade start BTCUSDT confirm'
    );
  }

  if (!binanceOrderService.isConfigured()) {
    return ctx.reply('❌ Live trading butuh BINANCE_API_KEY dan BINANCE_API_SECRET.');
  }

  if (action === 'stop') {
    if (!session.liveTrading || !session.liveTrading.active) {
      return ctx.reply('❌ Tidak ada sesi live trading aktif.');
    }

    stopLiveTradingSession(session.liveTrading);
    const elapsedMs = Date.now() - session.liveTrading.startedAt.getTime();
    const elapsedMin = (elapsedMs / 60000).toFixed(1);
    session.liveTrading = undefined;

    return ctx.reply(`🛑 Live trading dihentikan.\nDurasi sesi: ${elapsedMin} menit.`);
  }

  const symbol = (args[1] || '').toUpperCase();
  const confirmation = (args[2] || '').toLowerCase();

  if (!symbol) {
    return ctx.reply('❌ Symbol wajib diisi. Contoh: /livetrade start BTCUSDT confirm');
  }

  if (confirmation !== 'confirm') {
    return ctx.reply(
      `⚠️ LIVE TRADING menggunakan dana riil.\n` +
        `Untuk konfirmasi, jalankan ulang:\n/livetrade start ${symbol} confirm`
    );
  }

  if (session.liveTrading && session.liveTrading.active) {
    return ctx.reply(`❌ Live trading sudah aktif untuk ${session.liveTrading.symbol}. Gunakan /livetrade stop dulu.`);
  }

  try {
    const user = await ensureUser(ctx);
    if (!user) {
      return ctx.reply('❌ Gagal menyiapkan user session.');
    }

    await binanceOrderService.getSymbolInfo(symbol);
    await binanceOrderService.getCurrentPrice(symbol);

    const strategyToUse = openClawStrategy;
    const signalIntervalMs = parseInt(process.env.LIVE_SIGNAL_INTERVAL_MS || '300000', 10);

    session.liveTrading = {
      active: true,
      symbol,
      strategy: strategyToUse,
      userDbId: user.id,
      startedAt: new Date(),
    };

    await riskMonitorLoop.start();

    const runSignal = async () => {
      if (!session.liveTrading || !session.liveTrading.active) {
        return;
      }

      try {
        await executeLiveSignal(user.id, symbol, strategyToUse);
      } catch (error) {
        await db.logError({
          level: 'ERROR',
          source: 'livetrade_loop',
          message: `Live signal execution failed: ${(error as Error).message}`,
          stackTrace: (error as Error).stack,
          userId: user.id,
          symbol,
        });
        await notifyByDbUserId(
          `❌ Live trading error untuk ${symbol}: ${(error as Error).message}\nSesi tetap berjalan, cek log jika error berulang.`,
          user.id,
        );
      }
    };

    await runSignal();
    session.liveTrading.timer = setInterval(() => {
      runSignal().catch((error) => {
        logger.error({ err: error }, 'livetrade interval error:');
      });
    }, signalIntervalMs);

    return ctx.reply(
      `✅ Live trading aktif untuk ${symbol}\n` +
        `Strategy: ${strategyToUse.name}\n` +
        `Signal interval: ${(signalIntervalMs / 1000).toFixed(0)} detik\n\n` +
        `Gunakan /livetrade stop untuk menghentikan.`
    );
  } catch (error) {
    logger.error({ err: error }, 'livetrade start error:');
    await db.logError({
      level: 'ERROR',
      source: 'livetrade_command',
      message: `Failed to start live trading: ${(error as Error).message}`,
      stackTrace: (error as Error).stack,
      symbol,
    });

    const userId = ctx.message?.from?.id;
    if (userId) {
      const user = await db.getOrCreateUser(userId, {
        username: ctx.message.from.username,
        firstName: ctx.message.from.first_name,
        lastName: ctx.message.from.last_name,
      });
      if (user) {
        await notifyByDbUserId(`❌ Gagal start live trading ${symbol}: ${(error as Error).message}`, user.id);
      }
    }

    return ctx.reply(`❌ Gagal start live trading: ${(error as Error).message}`);
  }
});

// Volume analysis command
bot.command('volume', async (ctx) => {
  const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();

  if (!symbol) {
    return ctx.reply('Please provide a symbol. Example: /volume BTCUSDT');
  }

  let loadingMsg: any;
  try {
    loadingMsg = await ctx.reply('🔄 Analyzing volume data...');
    // Use existing analyzer method
    const analysis = await technicalAnalyzer.analyzeSymbol(symbol);
    ctx.reply(
      `📊 Volume Analysis for ${symbol}:\n\n${analysis}\n\n💡 Use /analyze ${symbol} for comprehensive analysis.`
    );
  } catch (error) {
    logger.error({ err: error }, 'Volume analysis error:');
    ctx.reply(`❌ Error analyzing volume for ${symbol}. Please try again later.`);
  } finally {
    if (loadingMsg) {
      try { await ctx.deleteMessage(loadingMsg.message_id); } catch (e) { /* ignore */ }
    }
  }

  return;
});

// Support/Resistance command
bot.command('sr', async (ctx) => {
  const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();

  if (!symbol) {
    return ctx.reply('Please provide a symbol. Example: /sr BTCUSDT');
  }

  let loadingMsg: any;
  try {
    loadingMsg = await ctx.reply('🔄 Calculating support and resistance levels...');
    const analysis = await technicalAnalyzer.analyzeSymbol(symbol);
    ctx.reply(
      `🎯 Support/Resistance for ${symbol}:\n\n${analysis}\n\n💡 Use /analyze ${symbol} for detailed levels.`
    );
  } catch (error) {
    logger.error({ err: error }, 'Support/Resistance analysis error:');
    ctx.reply(`❌ Error analyzing support/resistance for ${symbol}. Please try again later.`);
  } finally {
    if (loadingMsg) {
      try { await ctx.deleteMessage(loadingMsg.message_id); } catch (e) { /* ignore */ }
    }
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

  let loadingMsg: any;
  try {
    loadingMsg = await ctx.reply(`🔄 Generating ${timeframe} chart for ${symbol}...`);

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
    logger.error({ err: error }, 'Chart generation error:');
    ctx.reply(`❌ Error generating chart for ${symbol}. Please try again later.`);
  } finally {
    if (loadingMsg) {
      try { await ctx.deleteMessage(loadingMsg.message_id); } catch (e) { /* ignore */ }
    }
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
    logger.error({ err: error }, 'Alert creation error:');
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
    logger.error({ err: error }, 'Get alerts error:');
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
    logger.error({ err: error }, 'Delete alert error:');
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

    try {
      await ctx.deleteMessage(loadingMsg.message_id);
    } catch (e) {
      /* ignore */
    }

    await ctx.reply(statsMessage);
  } catch (error) {
    logger.error({ err: error }, 'Stats error:');
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

    try {
      await ctx.deleteMessage(loadingMsg.message_id);
    } catch (e) {
      /* ignore */
    }

    await ctx.reply(statsMessage);
  } catch (error) {
    logger.error({ err: error }, 'ML stats error:');
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
      try {
        await ctx.deleteMessage(loadingMsg.message_id);
      } catch (e) {
        /* ignore */
      }

    await ctx.reply('❌ No strategy data found. Run some backtests first with /backtest');
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

    try {
      await ctx.deleteMessage(loadingMsg.message_id);
    } catch (e) {
      /* ignore */
    }

    await ctx.reply(statsMessage);
  } catch (error) {
    logger.error({ err: error }, 'Strategy stats error:');
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
  } catch (error) {
    logger.error({ err: error }, 'Leaderboard error:');
    ctx.reply(`❌ Error loading leaderboard: ${(error as Error).message}`);
  }

  return;
});

// Error handling
bot.catch((err, ctx) => {
  withLogContext({ service: 'enhancedBot', userId: ctx.message?.from?.id }).error({ err }, 'Bot error');
  ctx.reply('❌ An unexpected error occurred. Please try again later.');
});

// Launch bot
withLogContext({ service: 'enhancedBot' }).info('Starting Telegram Bot');
withLogContext({ service: 'enhancedBot' }).info('Bot initialization complete. Waiting for messages');

// Configure health monitor integrations.
healthMonitor.setServices({
  rateLimiter,
  wsService: {
    isHealthy: () => connectionManager.getActiveStreamCount() > 0,
    getStreamCount: () => connectionManager.getActiveStreamCount(),
  },
  tradingEngine: binanceOrderService.isConfigured()
    ? {
        getCurrentDrawdown: () => {
          if (healthRuntime.peakUsdtBalance <= 0) return 0;
          const dd = ((healthRuntime.peakUsdtBalance - healthRuntime.usdtBalance) / healthRuntime.peakUsdtBalance) * 100;
          return Math.max(0, dd);
        },
        getAccountBalance: () => healthRuntime.usdtBalance,
      }
    : undefined,
  mlModel: {
    getRecentAccuracy: () => healthRuntime.modelAccuracy,
  },
});

healthMonitor.setAlertCallback(async (message: string) => {
  const adminChat = process.env.ADMIN_CHAT_ID;
  if (!adminChat) return;
  await bot.telegram.sendMessage(Number(adminChat), message);
});

// Start web server first
startWebServer();

// Start prediction verification service
predictionVerifier.start();

setInterval(async () => {
  try {
    if (binanceOrderService.isConfigured()) {
      const balances = await binanceOrderService.getAccountBalance();
      const usdt = balances.find((b) => b.asset === 'USDT');
      const currentUsdt = usdt ? Number(usdt.free) + Number(usdt.locked) : 0;
      healthRuntime.usdtBalance = Number.isFinite(currentUsdt) ? currentUsdt : 0;
      healthRuntime.peakUsdtBalance = Math.max(healthRuntime.peakUsdtBalance, healthRuntime.usdtBalance);
    }

    try {
      const acc = await predictionVerifier.generateAccuracyReport('GRU');
      healthRuntime.modelAccuracy = Math.max(0, Math.min(1, (acc?.accuracy ?? 100) / 100));
    } catch {
      // keep previous value if no prediction stats yet
    }

    await healthMonitor.checkBinanceRest();
    await healthMonitor.checkWebSocketHealth();
    await healthMonitor.checkModelAccuracy();
    if (binanceOrderService.isConfigured()) {
      await healthMonitor.checkAccountDrawdown();
      await healthMonitor.checkAccountBalance();
    }
    await healthMonitor.checkBotProcess();
  } catch (error) {
    withLogContext({ service: 'enhancedBot' }).error({ err: error }, 'Health monitor loop error');
  }
}, parseInt(process.env.HEALTH_MONITOR_INTERVAL_MS || '300000', 10));

bot
  .launch({ dropPendingUpdates: true })
  .then(() => {
    withLogContext({ service: 'enhancedBot' }).info('Bot started successfully');
    withLogContext({ service: 'enhancedBot' }).info('Ready to receive commands');
    withLogContext({ service: 'enhancedBot' }).info('Send /start to see available commands');
    withLogContext({ service: 'enhancedBot' }).info('Prediction verification service active');
    riskMonitorLoop.start().catch((error) => {
      withLogContext({ service: 'enhancedBot' }).error({ err: error }, 'Failed to start risk monitor loop');
    });
  })
  .catch((error) => {
    withLogContext({ service: 'enhancedBot' }).error({ err: error }, 'Failed to start bot');
    process.exit(1);
  });

// Enable graceful stop
process.once('SIGINT', () => {
  withLogContext({ service: 'enhancedBot' }).warn('Received SIGINT, stopping bot');
  for (const session of userSessions.values()) {
    if (session.liveTrading?.active) {
      stopLiveTradingSession(session.liveTrading);
    }
  }
  riskMonitorLoop.stop();
  predictionVerifier.stop();
  bot.stop('SIGINT');
  db.disconnect();
  process.exit(0);
});

process.once('SIGTERM', () => {
  withLogContext({ service: 'enhancedBot' }).warn('Received SIGTERM, stopping bot');
  for (const session of userSessions.values()) {
    if (session.liveTrading?.active) {
      stopLiveTradingSession(session.liveTrading);
    }
  }
  riskMonitorLoop.stop();
  predictionVerifier.stop();
  bot.stop('SIGTERM');
  db.disconnect();
  process.exit(0);
});

