# RabTradebot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, and backtesting directly in your chat.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Retail traders often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. Navigating multiple platforms for technical indicators, news sentiment, and strategy backtesting is time-consuming and fragmented. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single, accessible Telegram interface—leveling the playing field without the cost of premium subscriptions.

## Quick Start

Get the bot running in under 2 minutes.

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install

cp .env.example .env
# Edit .env and set TELEGRAM_BOT_TOKEN=your_token_here

npx prisma generate
npx prisma migrate dev

npm run build
npm start
```

Open Telegram, find your bot, and send `/start`.

## Installation

**Prerequisites**: Node.js 18+, npm 9+

You need a Telegram Bot Token to run the application. You get it from [@BotFather](https://t.me/BotFather).

```bash
# 1. Clone the repository
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Open .env and add your TELEGRAM_BOT_TOKEN

# 4. Initialize the database
npx prisma generate
npx prisma migrate dev

# 5. Build and run
npm run build
npm start
```

## Usage

You interact with the bot using Telegram commands.

### Basic Example

To get a complete market analysis for a specific pair, send:

```text
/analyze BTCUSDT
```

**What you receive:**

- **Technical Analysis**: RSI, MACD, Bollinger Bands, Moving Averages
- **Multi-timeframe Analysis**: 1H, 4H, 1D trends
- **Backtesting Results**: 30-day strategy performance
- **Recommendations**: Entry/exit levels with reasoning

### Configuration

You configure the bot by editing the `.env` file.

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | `string` | **Yes** | Your Telegram bot token from @BotFather |
| `BINANCE_API_KEY` | `string` | No | Required for live trading and better rate limits |
| `BINANCE_API_SECRET` | `string` | No | Required for live trading and better rate limits |
| `CHUTES_API_KEY` | `string` | No | Required for AI-powered news analysis and impact predictions |

> **Note**: The bot automatically falls back to the public Binance API if you do not provide private credentials.

### Advanced Usage

You run simulated trading sessions and optimize strategies without risking capital.

**Start a Paper Trading Session:**

```text
/papertrade ETHUSDT
```

This command starts a virtual trading session with a $1000 simulated balance using real market data. You track it using `/portfolio`.

**Optimize Strategy Parameters:**

```text
/optimize ADAUSDT 60
```

This command runs an optimization over a 60-day period to find the best parameters for maximum profit.

## Command Reference

### Basic Analysis

- `/analyze [symbol]` - Get complete market analysis
- `/signal [symbol]` - Get trading signals
- `/volume [symbol]` - Analyze volume
- `/sr [symbol]` - View support and resistance levels
- `/chart [symbol]` - Generate interactive charts

### Advanced Trading

- `/backtest [symbol] [days]` - Run strategy backtesting
- `/papertrade [symbol]` - Start a paper trading simulation
- `/portfolio` - View current simulated positions and balance
- `/performance` - View detailed performance metrics
- `/optimize [symbol] [days]` - Optimize strategy parameters
- `/livetrade` - Enter live trading interface
- `/liveportfolio` - View live trading portfolio
- `/orders` - View active orders
- `/cancelorder [id]` - Cancel a specific order
- `/stoptrading` - Stop all active paper trading sessions

### Market Intelligence & ML

- `/news [symbol]` - Get AI-analyzed news sentiment
- `/impact [symbol]` - Get news impact predictions
- `/fullanalysis [symbol]` - Complete market & news analysis
- `/mlpredict [symbol]` - Get ML-based price predictions
- `/mlstatus` - Check ML model training status
- `/trainmodel [symbol]` - Train a new ML model

### Alerts & Monitoring

- `/alert [symbol] [price]` - Set a price alert
- `/alerts` - List active alerts
- `/delalert [id]` - Delete a specific alert
- `/healthcheck` - Run system health diagnostics
- `/apistatus` - Check Binance API connectivity
- `/logs` - View recent system logs

### Data & System

- `/download [symbol] [days]` - Download historical data
- `/datainfo [symbol]` - Check data quality and summary
- `/strategies` - List available trading strategies
- `/stats` - View global system statistics
- `/strategystats` - View performance across strategies
- `/leaderboard` - View top performing paper trading accounts

## Architecture & Tech Stack

- **Language**: TypeScript
- **Bot Framework**: Telegraf
- **Database**: Prisma ORM with SQLite
- **Market Data**: Binance REST & WebSocket APIs
- **AI/ML**: TensorFlow.js (GRU models), Chutes AI (News Sentiment)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

MIT © RabTradebot Contributors
