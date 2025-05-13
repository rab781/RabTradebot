# Crypto Signal Bot

A Telegram bot that provides cryptocurrency trading signals based on technical analysis and news sentiment.

## Features

- Technical Analysis using multiple indicators (RSI, MACD)
- News sentiment analysis from major crypto news sources
- Real-time price monitoring
- Customizable alerts
- Easy-to-use Telegram commands

## Setup

1. Create a `.env` file in the root directory with the following variables:
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   BINANCE_API_KEY=your_binance_api_key_here
   BINANCE_API_SECRET=your_binance_api_secret_here
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the bot:
   ```bash
   npm start
   ```

## Available Commands

- `/start` - Start the bot
- `/help` - Show available commands
- `/signal [symbol]` - Get trading signals for a cryptocurrency (e.g., `/signal BTCUSDT`)
- `/watch [symbol]` - Start watching a cryptocurrency for signals
- `/unwatch [symbol]` - Stop watching a cryptocurrency
- `/list` - List all cryptocurrencies being watched

## Requirements

- Node.js v16 or higher
- Telegram Bot Token (get it from @BotFather)
- Binance API credentials (if using Binance data)

## Development

To run in development mode with hot reloading:
```bash
npm run dev
```

## Tech Stack

- TypeScript
- Node.js
- Telegraf (Telegram Bot Framework)
- Technical Indicators
- Binance API
- Cheerio (Web Scraping)
- Axios (HTTP Client)
