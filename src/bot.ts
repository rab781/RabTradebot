import { Telegraf } from 'telegraf';
import { config } from 'dotenv';
import { TechnicalAnalyzer } from './services/technicalAnalyzer';
import { NewsAnalyzer } from './services/newsAnalyzer';
import { SignalGenerator } from './services/signalGenerator';
import { PriceAlertManager } from './services/priceAlertManager';
import { AdvancedAnalyzer } from './services/advancedAnalyzer';
import { ChartGenerator } from './services/chartGenerator';

// Load environment variables
config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
const technicalAnalyzer = new TechnicalAnalyzer();
const newsAnalyzer = new NewsAnalyzer();
const signalGenerator = new SignalGenerator(technicalAnalyzer, newsAnalyzer);
const priceAlertManager = new PriceAlertManager();
const advancedAnalyzer = new AdvancedAnalyzer();
const chartGenerator = new ChartGenerator();

// Start command
bot.command('start', (ctx) => {
    const username = ctx.message.from.username || ctx.message.from.first_name || 'Unknown';
    const userId = ctx.message.from.id;
    console.log(`[${new Date().toISOString()}] New user started bot: ${username} (${userId})`);
    ctx.reply('Welcome to Crypto Signal Bot! 🚀\nUse /help to see available commands.');
});

// Help command
bot.command('help', (ctx) => {
    const username = ctx.message.from.username || ctx.message.from.first_name || 'Unknown';
    console.log(`[${new Date().toISOString()}] User: ${username} requested help`);
    const helpMessage = `
Available commands:
Basic Commands:
/signal [symbol] - Get trading signals for a cryptocurrency (e.g., /signal BTCUSDT)
/watch [symbol] - Start watching a cryptocurrency for signals
/unwatch [symbol] - Stop watching a cryptocurrency
/list - List all cryptocurrencies being watched

Advanced Analysis:
/volume [symbol] - Get volume analysis
/sr [symbol] - Get support and resistance levels
/timeframes [symbol] - Analyze multiple timeframes
/depth [symbol] - Get order book depth analysis
/chart [symbol] - Generate interactive price chart

Price Alerts:
/alert [symbol] [price] [above/below] - Set price alert
/alerts - List your active price alerts
/delalert [symbol] - Delete price alert

Help:
/help - Show this message
    `;
    ctx.reply(helpMessage);
});

// Signal command
bot.command('signal', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
    const username = ctx.message.from.username || ctx.message.from.first_name || 'Unknown';
    const userId = ctx.message.from.id;
    
    console.log(`[${new Date().toISOString()}] User: ${username} (${userId}) requested signal for: ${symbol || 'undefined'}`);
    
    if (!symbol) {
        console.log(`[${new Date().toISOString()}] Error: No symbol provided by user ${username}`);
        return ctx.reply('Please provide a symbol. Example: /signal BTCUSDT');
    }

    try {
        console.log(`[${new Date().toISOString()}] Processing signal request for ${symbol}...`);
        const signal = await signalGenerator.generateSignal(symbol);
        console.log(`[${new Date().toISOString()}] Successfully generated signal for ${symbol}`);
        ctx.reply(signal);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error generating signal for ${symbol}:`, error);
        ctx.reply(`❌ Error generating signal for ${symbol}. This might be due to:\n- Invalid symbol name\n- API rate limits\n- Network issues\n\nPlease try again in a few moments or check if the symbol is correct.`);
    }
});

// Volume Analysis Command
bot.command('volume', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
    const username = ctx.message.from.username || ctx.message.from.first_name || 'Unknown';
    const userId = ctx.message.from.id;
    
    console.log(`[${new Date().toISOString()}] User: ${username} (${userId}) requested volume analysis for: ${symbol || 'undefined'}`);
    
    if (!symbol) {
        console.log(`[${new Date().toISOString()}] Error: No symbol provided for volume analysis by user ${username}`);
        return ctx.reply('Please provide a symbol. Example: /volume BTCUSDT');
    }

    try {
        console.log(`[${new Date().toISOString()}] Processing volume analysis for ${symbol}...`);
        const analysis = await advancedAnalyzer.analyzeVolume(symbol);
        let message = `📊 Volume Analysis for ${symbol}:\n\n`;
        message += `24h Volume Change: ${analysis.volumeChange24h.toFixed(2)}%\n`;
        message += `Volume Status: ${analysis.unusualVolume ? '🚨 Unusual Volume Detected' : '📊 Normal Volume'}\n`;
        message += `Recommendation: ${analysis.recommendation}`;
        
        console.log(`[${new Date().toISOString()}] Successfully generated volume analysis for ${symbol}`);
        ctx.reply(message);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error analyzing volume for ${symbol}:`, error);
        ctx.reply(`❌ Error analyzing volume for ${symbol}. ${(error as Error).message}`);
    }
});

// Support/Resistance Command
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
        console.error(error);
    }
});

// Multiple Timeframe Analysis Command
bot.command('timeframes', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /timeframes BTCUSDT');
    }

    try {
        const analysis = await advancedAnalyzer.analyzeMultipleTimeframes(symbol);
        ctx.reply(analysis);
    } catch (error) {
        ctx.reply('Error analyzing timeframes. Please try again later.');
        console.error(error);
    }
});

// Chart command
bot.command('chart', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /chart BTCUSDT');
    }

    try {
        // Get candlestick data
        const candlesData = await advancedAnalyzer['binance'].candlesticks(symbol, '1h', { limit: 100 });
        const chartData = candlesData.map((candle: any) => ({
            timestamp: candle[0],
            open: parseFloat(candle[1]),
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
            volume: parseFloat(candle[5])
        }));

        // Generate chart
        const chartPath = await chartGenerator.generateChart(symbol, chartData);
        ctx.reply(`Chart generated for ${symbol}. You can view it at: file://${chartPath}`);

    } catch (error) {
        ctx.reply('Error generating chart. Please try again later.');
        console.error(error);
    }
});

// Price Alert Commands
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
        console.error(error);
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
}, 60000); // Check every minute

// Start the bot
console.log(`[${new Date().toISOString()}] Starting Crypto Signal Bot...`);
console.log(`[${new Date().toISOString()}] Checking environment variables...`);

if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error(`[${new Date().toISOString()}] ERROR: TELEGRAM_BOT_TOKEN not found in environment variables`);
    process.exit(1);
}

if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
    console.warn(`[${new Date().toISOString()}] WARNING: Binance API credentials not found, will use public API only`);
} else {
    console.log(`[${new Date().toISOString()}] Binance API credentials found`);
}

console.log(`[${new Date().toISOString()}] Environment variables validated`);
console.log(`[${new Date().toISOString()}] Initializing services...`);

bot.launch().then(() => {
    console.log(`[${new Date().toISOString()}] ✅ Crypto Signal Bot is running successfully!`);
    console.log(`[${new Date().toISOString()}] Bot is ready to receive commands...`);
    console.log(`[${new Date().toISOString()}] Available commands: /start, /help, /signal, /volume, /sr, /timeframes, /alert`);
}).catch((error) => {
    console.error(`[${new Date().toISOString()}] ❌ Error starting bot:`, error);
    process.exit(1);
});

// Enable graceful stop
process.once('SIGINT', () => {
    console.log(`[${new Date().toISOString()}] Received SIGINT, shutting down gracefully...`);
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    console.log(`[${new Date().toISOString()}] Received SIGTERM, shutting down gracefully...`);
    bot.stop('SIGTERM');
});
