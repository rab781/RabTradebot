import TelegramBot from 'node-telegram-bot-api';
import { config } from 'dotenv';

// Load environment variables
config();

// Simple Trading Bot
class SimpleTradingBot {
    private bot: TelegramBot;

    constructor() {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
            throw new Error('TELEGRAM_BOT_TOKEN is required in .env file');
        }

        this.bot = new TelegramBot(token, { polling: true });
        this.setupCommands();
        this.setupErrorHandling();
    }

    private setupCommands() {
        // Start command
        this.bot.onText(/\/start/, (msg: any) => {
            const chatId = msg.chat.id;
            const welcomeMessage = `
🚀 **Crypto Trading Bot** 🚀

Selamat datang di bot trading cryptocurrency Anda!

**📊 Perintah Analisis:**
/price [symbol] - Cek harga terkini
/analyze [symbol] - Analisis teknikal dasar
/help - Bantuan

**Contoh:**
/price BTCUSDT
/analyze ETHUSDT

Bot sedang dalam tahap pengembangan. Fitur lengkap akan segera hadir!
            `;
            this.bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
        });

        // Help command
        this.bot.onText(/\/help/, (msg: any) => {
            const chatId = msg.chat.id;
            const helpMessage = `
📚 **Bantuan Bot Trading**

**Perintah Tersedia:**
• /start - Memulai bot
• /price [symbol] - Cek harga cryptocurrency
• /analyze [symbol] - Analisis teknikal
• /status - Status sistem
• /help - Tampilkan bantuan

**Format Symbol:**
Gunakan format Binance, contoh:
• BTCUSDT (Bitcoin)
• ETHUSDT (Ethereum)
• ADAUSDT (Cardano)

**Status:** 🟢 Bot aktif dan siap digunakan!
            `;
            this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
        });

        // Price command
        this.bot.onText(/\/price (.+)/, async (msg: any, match: any) => {
            const chatId = msg.chat.id;
            const symbol = match[1].toUpperCase();

            try {
                const loadingMsg = await this.bot.sendMessage(chatId, '🔄 Mengambil data harga...');

                // Simulate price fetch (replace with actual API call)
                await new Promise(resolve => setTimeout(resolve, 1000));

                const mockPrice = (Math.random() * 50000 + 10000).toFixed(2);
                const mockChangeNum = (Math.random() - 0.5) * 10;
                const mockChange = mockChangeNum.toFixed(2);

                const response = `
💰 **${symbol} Price**

**Harga Saat Ini:** $${mockPrice}
**Perubahan 24h:** ${mockChangeNum >= 0 ? '🟢' : '🔴'} ${mockChange}%
**Volume 24h:** ${(Math.random() * 1000000).toFixed(0)}

⚠️ *Data simulasi - Integrasi API Binance akan segera ditambahkan*

Gunakan /analyze ${symbol} untuk analisis lebih detail
                `;

                await this.bot.editMessageText(response, {
                    chat_id: chatId,
                    message_id: loadingMsg.message_id,
                    parse_mode: 'Markdown'
                });

            } catch (error: any) {
                console.error('Price error:', error);
                this.bot.sendMessage(chatId, `❌ Error mengambil harga ${symbol}: ${error.message}`);
            }
        });

        // Analyze command
        this.bot.onText(/\/analyze (.+)/, async (msg: any, match: any) => {
            const chatId = msg.chat.id;
            const symbol = match[1].toUpperCase();

            try {
                const loadingMsg = await this.bot.sendMessage(chatId, '🔄 Melakukan analisis...');

                // Simulate analysis (replace with actual analysis)
                await new Promise(resolve => setTimeout(resolve, 2000));

                const mockRSI = (Math.random() * 100).toFixed(1);
                const mockMACD = ((Math.random() - 0.5) * 0.1).toFixed(4);
                const signals = ['BUY', 'SELL', 'HOLD'];
                const mockSignal = signals[Math.floor(Math.random() * signals.length)];

                const response = `
📊 **${symbol} Analisis Teknikal**

**Indikator:**
🔸 RSI (14): ${mockRSI}
🔸 MACD: ${mockMACD}
🔸 Trend: ${Math.random() > 0.5 ? 'Bullish 📈' : 'Bearish 📉'}

**Signal:** ${mockSignal === 'BUY' ? '🟢' : mockSignal === 'SELL' ? '🔴' : '🟡'} ${mockSignal}

**Rekomendasi:**
${mockSignal === 'BUY' ? '✅ Potensi pembelian' :
  mockSignal === 'SELL' ? '⚠️ Pertimbangkan penjualan' :
  '⏳ Tunggu sinyal yang lebih jelas'}

⚠️ *Analisis simulasi - Integrasi indikator teknikal akan segera ditambahkan*
                `;

                await this.bot.editMessageText(response, {
                    chat_id: chatId,
                    message_id: loadingMsg.message_id,
                    parse_mode: 'Markdown'
                });

            } catch (error: any) {
                console.error('Analysis error:', error);
                this.bot.sendMessage(chatId, `❌ Error analisis ${symbol}: ${error.message}`);
            }
        });

        // Status command
        this.bot.onText(/\/status/, (msg: any) => {
            const chatId = msg.chat.id;
            const response = `
⚙️ **Status Sistem**

**Bot Status:** 🟢 Online
**Telegram API:** 🟢 Connected
**Database:** 🟡 Dalam pengembangan
**Binance API:** 🟡 Dalam pengembangan
**Analysis Engine:** 🟡 Dalam pengembangan

**Uptime:** ${process.uptime().toFixed(0)} detik
**Memory Usage:** ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB

**Versi:** 1.0.0 (Development)
**Last Update:** ${new Date().toLocaleString('id-ID')}
            `;
            this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        });

        // Catch unknown commands
        this.bot.on('message', (msg: any) => {
            const chatId = msg.chat.id;
            const text = msg.text;

            // Only respond to commands that start with / but are not handled above
            if (text && text.startsWith('/') && !text.match(/^\/(start|help|price|analyze|status)/)) {
                this.bot.sendMessage(chatId, '❓ Perintah tidak dikenal. Gunakan /help untuk melihat perintah yang tersedia.');
            }
        });
    }

    private setupErrorHandling() {
        this.bot.on('polling_error', (error: any) => {
            console.error('Polling error:', error.message);
        });

        this.bot.on('error', (error: any) => {
            console.error('Bot error:', error.message);
        });

        process.on('uncaughtException', (error: Error) => {
            console.error('Uncaught Exception:', error.message);
        });

        process.on('unhandledRejection', (reason: any) => {
            console.error('Unhandled Rejection:', reason);
        });
    }

    public start() {
        console.log('🚀 Simple Crypto Trading Bot is starting...');
        console.log('📱 Bot Token:', process.env.TELEGRAM_BOT_TOKEN ? 'Configured ✅' : 'Missing ❌');
        console.log('🔄 Polling for messages...');
        console.log('💡 Send /start in Telegram to begin!');
        console.log('');
        console.log('Bot is ready! 🎉');
    }
}

// Error handling for missing token
if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('❌ Error: TELEGRAM_BOT_TOKEN tidak ditemukan!');
    console.log('');
    console.log('🔧 Cara memperbaiki:');
    console.log('1. Pastikan file .env ada di root project');
    console.log('2. Tambahkan: TELEGRAM_BOT_TOKEN=your_bot_token');
    console.log('3. Restart bot');
    process.exit(1);
}

// Start the bot
try {
    const bot = new SimpleTradingBot();
    bot.start();
} catch (error: any) {
    console.error('❌ Failed to start bot:', error.message);
    process.exit(1);
}

export { SimpleTradingBot };
