# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![npm version](https://badge.fury.io/js/advanced-crypto-trading-bot.svg)](https://badge.fury.io/js/advanced-crypto-trading-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Retail traders often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. Navigating multiple platforms for technical indicators, news sentiment, and strategy backtesting is time-consuming and fragmented. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single, accessible Telegram interface—leveling the playing field without the cost of premium subscriptions.

## Quick Start

You can get the bot up and running locally in under 2 minutes.

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install
```

Copy the environment template and configure your Telegram bot token:

```bash
cp .env.example .env
# Edit .env and set TELEGRAM_BOT_TOKEN to your bot token
```

Build and start the bot:

```bash
npm run build
npm start
```

Open Telegram, find your bot, and send `/start`.

## Installation

**Prerequisites**:
- Node.js 18+
- npm 9+
- A Telegram Bot Token (get it from [@BotFather](https://t.me/BotFather))

1. Clone the repository and navigate into the project directory:
   ```bash
   git clone https://github.com/rab781/RabTradebot.git
   cd RabTradebot
   ```
2. Install the required dependencies:
   ```bash
   npm install
   ```

> **Note**: While the repository tracks `node_modules` and uses `pnpm` internally for development scripts, standard `npm` is supported and recommended for external installation.

## Configuration

Configure the bot by editing the `.env` file in the root of your project.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | *(Required)* | Your Telegram bot token from [@BotFather](https://t.me/BotFather) |
| `DATABASE_URL` | `string` | `"file:./prisma/dev.db"` | Database connection string. Use SQLite for development or PostgreSQL for production. |
| `BINANCE_API_KEY` | `string` | *Empty* | Required for live trading. Provides better rate limits for market data. |
| `BINANCE_API_SECRET` | `string` | *Empty* | Required alongside `BINANCE_API_KEY` for live trading execution. |
| `CHUTES_API_KEY` | `string` | *Empty* | Required for advanced AI-powered news sentiment analysis and impact predictions. |
| `BINANCE_TESTNET` | `boolean` | `false` | Set to `true` to route orders through the Binance Spot Testnet. |

*If you do not provide Binance credentials, the bot automatically falls back to the public Binance API for market data.*

## Usage

Interact with the bot using standard Telegram commands. Use the built-in quick menu to simplify navigation.

### Basic Example

To get a complete market analysis for a specific pair, send:

```
/analyze BTCUSDT
```

**What you receive:**
- **Technical Analysis**: RSI, MACD, Bollinger Bands, Moving Averages.
- **Multi-timeframe Analysis**: 1H, 4H, and 1D trend alignments.
- **Backtesting Results**: 30-day strategy performance summary.
- **Recommendations**: Precise entry, exit, and stop-loss levels.

### Advanced Usage

The bot supports complex quantitative trading workflows, including simulated trading and strategy optimization.

**Start a Paper Trading Session:**
```
/papertrade ETHUSDT
```
*Starts a virtual trading session with a $1000 simulated balance using real market data. Track your progress using `/portfolio`.*

**Optimize Strategy Parameters:**
```
/optimize ADAUSDT 60
```
*Runs a walk-forward optimization over the last 60 days to find the best parameters for maximum profit.*

**Live Order Execution:**
```
/livetrade start SOLUSDT confirm
```
*Executes automated live trades using real funds via the Binance API based on active strategy signals.*

## API Reference

The primary interface is the Telegram command suite.

### Core Analysis
- `/signal [symbol]` - Generate trading signals.
- `/fullanalysis [symbol]` - Retrieve a comprehensive breakdown of technical and news sentiment data.
- `/openclaw [symbol]` - Run the ML-enhanced OpenClaw strategy for advanced market regime detection.
- `/mlpredict [symbol]` - Predict price direction utilizing the local GRU neural network.

### Trading & Simulation
- `/backtest [symbol] [days]` - Run strategy backtesting.
- `/papertrade [symbol]` - Start a paper trading simulation.
- `/livetrade start|stop [symbol] [confirm]` - Manage live trading sessions.
- `/portfolio` - View active paper trading positions and balances.
- `/liveportfolio` - View actual Binance account balances and open orders.

### System & Status
- `/apistatus` - Check Binance API connectivity, latency, and rate limits.
- `/healthcheck` - Run a comprehensive system health check (Database, REST, WS, ML).
- `/trainmodel [symbol] [epochs]` - Train the local machine learning model on historical data.

*For a full list of commands, send `/help` to the bot in Telegram.*

## Architecture & Tech Stack

- **Language**: TypeScript
- **Bot Framework**: Telegraf
- **Database**: Prisma ORM with SQLite (PostgreSQL supported for production)
- **Market Data**: Binance REST & WebSocket APIs
- **AI/ML**: TensorFlow.js (GRU models)
- **Sentiment Engine**: Chutes AI

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
