# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Retail traders often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. You spend hours navigating multiple platforms for technical indicators, news sentiment, and strategy backtesting, which is time-consuming and fragmented. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single, accessible Telegram interface, saving you time and improving your trading decisions without the cost of premium subscriptions.

## Quick Start

Get the bot up and running in under 2 minutes:

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install
cp .env.example .env

# Edit .env and set TELEGRAM_BOT_TOKEN=your_token_here

npm run build
npm start
```

## Installation

**Prerequisites**: Node.js 20.19+, npm 9+

Clone the repository and install dependencies:

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install
```

## Usage

Interact with the bot via Telegram commands.

### Basic Example

To get a complete market analysis for a specific pair, send the following command to your bot:

```
/analyze BTCUSDT
```

You receive:
- **Technical Analysis**: RSI, MACD, Bollinger Bands, Moving Averages
- **Multi-timeframe Analysis**: 1H, 4H, 1D trends
- **Backtesting Results**: 30-day strategy performance
- **Recommendations**: Entry/exit levels with reasoning

### Configuration

Configure the bot by editing the `.env` file in the root directory.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `DATABASE_URL` | `string` | `"file:./prisma/dev.db"` | Connection string for the database |
| `TELEGRAM_BOT_TOKEN` | `string` | `undefined` | Your Telegram bot token from @BotFather |
| `BINANCE_API_KEY` | `string` | `undefined` | Required for live trading and better rate limits |
| `BINANCE_API_SECRET` | `string` | `undefined` | Required for live trading and better rate limits |
| `BINANCE_TESTNET` | `boolean` | `true` | Enable Binance Spot Testnet |
| `TWITTER_API_KEY` | `string` | `undefined` | Required for social media analysis |
| `CHUTES_API_KEY` | `string` | `undefined` | Required for AI-powered news analysis and impact predictions |

### Advanced Usage

The bot supports complex trading workflows, including simulated trading and strategy optimization.

**Start a Paper Trading Session:**

```
/papertrade ETHUSDT
```

Starts a virtual trading session with a $1000 simulated balance using real market data. Track your progress using `/portfolio`.

**Backtest a Strategy:**

```
/backtest SOLUSDT 30
```

Tests the default strategy's performance over the last 30 days and returns win rate, drawdown, and total profit.

**Optimize Strategy Parameters:**

```
/optimize ADAUSDT 60
```

Runs optimization over a 60-day period to find the best parameters for maximum profit.

### Deploying With PM2

This project includes PM2 scripts and a bootstrap wrapper so startup does not depend on a hardcoded nvm Node version path.

```bash
# Build first
npm run build

# Start or recover with PM2
npm run pm2:bootstrap

# Check status or logs
npm run pm2:status
npm run pm2:logs
```

## Command Reference

### Basic Analysis
- `/signal [symbol]` - Trading signals
- `/volume [symbol]` - Volume analysis
- `/sr [symbol]` - Support/resistance levels
- `/chart [symbol]` - Generate interactive charts

### Advanced Trading
- `/backtest [symbol] [days]` - Strategy backtesting
- `/papertrade [symbol]` - Start paper trading simulation
- `/portfolio` - View current positions and balance
- `/performance` - Detailed performance metrics
- `/optimize [symbol] [days]` - Optimize strategy parameters

### Data & Status
- `/download [symbol] [days]` - Download historical data
- `/datainfo [symbol]` - Check data quality and summary
- `/strategies` - List available trading strategies
- `/apistatus` - Check Binance API connectivity

## Architecture & Tech Stack

- **Language**: TypeScript
- **Bot Framework**: Telegraf
- **Database**: Prisma ORM with SQLite
- **Market Data**: Binance REST & WebSocket APIs
- **AI/ML**: TensorFlow.js (GRU models), Chutes AI (News Sentiment)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT © RabTradebot
