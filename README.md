# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![npm version](https://badge.fury.io/js/advanced-crypto-trading-bot.svg)](https://badge.fury.io/js/advanced-crypto-trading-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Retail traders often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. Navigating multiple platforms for technical indicators, news sentiment, and strategy backtesting is time-consuming and fragmented. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single, accessible Telegram interface.

## Quick Start

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install
cp .env.example .env
# Edit .env and set TELEGRAM_BOT_TOKEN
npx prisma generate
npx prisma migrate dev
npm run build
npm start
```

## Installation

**Prerequisites**: Node.js 18+, npm 9+, and a Telegram Bot Token (from [@BotFather](https://t.me/BotFather)).

```bash
# 1. Clone the repository
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env to add your TELEGRAM_BOT_TOKEN and other API keys

# 4. Generate the database client and run migrations
npx prisma generate
npx prisma migrate dev

# 5. Build and start the bot
npm run build
npm start
```

## Configuration

You configure the bot by editing the `.env` file before you start the application.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | none | **Required**. Your Telegram bot token from @BotFather |
| `BINANCE_API_KEY` | `string` | none | Required for live trading and better rate limits |
| `BINANCE_API_SECRET` | `string` | none | Required for live trading and better rate limits |
| `CHUTES_API_KEY` | `string` | none | Required for AI-powered news analysis and impact predictions |

## Usage

You interact with the bot via Telegram commands.

### Basic Example

To get a complete market analysis for a specific pair, send the following command:

```text
/analyze BTCUSDT
```

You receive a response containing:
- **Technical Analysis**: RSI, MACD, Bollinger Bands, Moving Averages
- **Multi-timeframe Analysis**: 1H, 4H, 1D trends
- **Backtesting Results**: 30-day strategy performance
- **Recommendations**: Entry/exit levels with reasoning

### Advanced Usage

You can start a virtual paper trading session using real market data:

```text
/papertrade ETHUSDT
```

Track your simulated portfolio using `/portfolio`. You can also backtest strategies over historical data:

```text
/backtest SOLUSDT 30
```

## Architecture & Tech Stack

- **Language**: TypeScript
- **Bot Framework**: Telegraf
- **Database**: Prisma ORM with SQLite
- **Market Data**: Binance REST & WebSocket APIs
- **AI/ML**: TensorFlow.js (GRU models), Chutes AI (News Sentiment)

## API Reference

The application operates as a Telegram bot rather than exposing a traditional REST API. You use the following Telegram commands to access its features.

### Basic Analysis
- `/signal [symbol]` - Get trading signals
- `/volume [symbol]` - Analyze volume data
- `/sr [symbol]` - Calculate support and resistance levels
- `/chart [symbol]` - Generate interactive candlestick charts

### Advanced Trading
- `/backtest [symbol] [days]` - Run strategy backtesting
- `/papertrade [symbol]` - Start a paper trading simulation
- `/portfolio` - View current simulated positions and balance
- `/performance` - View detailed trading performance metrics
- `/optimize [symbol] [days]` - Optimize strategy parameters

### Data & Status
- `/download [symbol] [days]` - Download historical market data
- `/datainfo [symbol]` - Check data quality and summary statistics
- `/strategies` - List available trading strategies
- `/apistatus` - Check Binance API connectivity

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT © [rab781](https://github.com/rab781)
