import { Telegraf } from 'telegraf';
import { config } from 'dotenv';
import { TechnicalAnalyzer } from './services/technicalAnalyzer';
import { NewsAnalyzer } from './services/newsAnalyzer';
import { SignalGenerator } from './services/signalGenerator';

// Load environment variables
config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
const technicalAnalyzer = new TechnicalAnalyzer();
const newsAnalyzer = new NewsAnalyzer();
const signalGenerator = new SignalGenerator(technicalAnalyzer, newsAnalyzer);

// Start command
bot.command('start', (ctx) => {
    ctx.reply('Welcome to Crypto Signal Bot! 🚀\nUse /help to see available commands.');
});

// Help command
bot.command('help', (ctx) => {
    const helpMessage = `
Available commands:
/signal [symbol] - Get trading signals for a cryptocurrency (e.g., /signal BTCUSDT)
/watch [symbol] - Start watching a cryptocurrency for signals
/unwatch [symbol] - Stop watching a cryptocurrency
/list - List all cryptocurrencies being watched
/help - Show this help message
    `;
    ctx.reply(helpMessage);
});

// Signal command
bot.command('signal', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /signal BTCUSDT');
    }

    try {
        const signal = await signalGenerator.generateSignal(symbol);
        ctx.reply(signal);
    } catch (error) {
        ctx.reply('Error generating signal. Please try again later.');
        console.error(error);
    }
});

// Start the bot
bot.launch().then(() => {
    console.log('Bot is running...');
}).catch((error) => {
    console.error('Error starting bot:', error);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
