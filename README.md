# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Retail traders often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. Navigating multiple platforms for technical indicators, news sentiment, and strategy backtesting is time-consuming and fragmented. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single, accessible Telegram interface—leveling the playing field without the cost of premium subscriptions.

## Quick Start

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install
cp .env.example .env

# Edit .env to add your TELEGRAM_BOT_TOKEN
npx prisma generate
npx prisma migrate dev
npm run build
npm start
```

## Installation

**Prerequisites**:
- Node.js 18+
- npm 9+
- A Telegram Bot Token (get it from [@BotFather](https://t.me/BotFather))

1. Clone the repository
```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
```

2. Install dependencies
```bash
npm install
# Note: The project internally uses pnpm, but npm is fully supported for user setup.
```

3. Set up the database
```bash
npx prisma generate
npx prisma migrate dev
```

## Usage

Interact with the bot via Telegram commands or the built-in web dashboard.

### Configuration

Configure the bot by editing the `.env` file.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | *(None)* | **Required.** Your Telegram bot token from @BotFather |
| `BINANCE_API_KEY` | `string` | *(None)* | Required for live trading and better rate limits |
| `BINANCE_API_SECRET` | `string` | *(None)* | Required for live trading and better rate limits |
| `CHUTES_API_KEY` | `string` | *(None)* | Required for AI-powered news analysis and predictions |
| `DATABASE_URL` | `string` | `file:./prisma/dev.db` | Connection string for Prisma database |
| `WEB_PORT` | `number` | `3000` | Port for the web dashboard |

> **Note**: The bot automatically falls back to the public Binance API if private credentials are not provided.

### Basic Example

To get a complete market analysis for a specific pair, send this command to the bot:

```text
/analyze BTCUSDT
```

**What you get:**
- **Technical Analysis**: RSI, MACD, Bollinger Bands, Moving Averages
- **Multi-timeframe Analysis**: 1H, 4H, 1D trends
- **Backtesting Results**: 30-day strategy performance
- **Recommendations**: Entry/exit levels with reasoning

### Advanced Usage

The bot supports complex trading workflows, including simulated trading and strategy optimization.

**Start a Paper Trading Session:**
```text
/papertrade ETHUSDT
```
*Starts a virtual trading session with a $1000 simulated balance using real market data. Track it using `/portfolio`.*

**Backtest a Strategy:**
```text
/backtest SOLUSDT 30
```
*Tests the default strategy's performance over the last 30 days and returns win rate, drawdown, and total profit.*

**Optimize Strategy Parameters:**
```text
/optimize ADAUSDT 60
```
*Runs optimization over a 60-day period to find the best parameters for maximum profit.*

## API Reference

The bot commands serve as the primary interface. See the full command list below.

### Telegram Command Reference

**Analysis & Signals:**
- `/analyze [symbol]` - Complete market analysis
- `/fullanalysis [symbol]` - Combined technical and news analysis
- `/signal [symbol]` - Quick trading signals
- `/chart [symbol] [timeframe]` - Generate interactive candlestick charts
- `/volume [symbol]` - Volume analysis
- `/sr [symbol]` - Support/resistance levels

**AI & News (Requires Chutes AI):**
- `/pnews [symbol]` - Comprehensive AI news analysis
- `/impact [symbol]` - Quick AI impact prediction
- `/news [symbol]` - Basic news analysis

**Trading & Simulation:**
- `/papertrade [symbol]` - Start paper trading simulation
- `/stoptrading` - Stop current paper trading session
- `/portfolio` - View current paper trading positions and balance
- `/performance` - Detailed performance metrics
- `/livetrade start [symbol] confirm` - Start live trading (real funds)
- `/livetrade stop` - Stop live trading
- `/orders [symbol]` - View open Binance orders
- `/liveportfolio` - View real balances and open orders

**Strategy & Backtesting:**
- `/backtest [symbol] [days]` - Strategy backtesting
- `/optimize [symbol] [days]` - Optimize strategy parameters
- `/strategies` - List available trading strategies
- `/strategystats [symbol]` - Compare strategy performance

**System & Data:**
- `/datainfo [symbol]` - Check data quality and summary
- `/download [symbol] [days]` - Download historical data
- `/healthcheck` - Full system health report
- `/apistatus` - Check Binance API connectivity
- `/pstatus` - Check Chutes AI status
- `/mlstatus` - Check ML model status

### Web Dashboard

A local web dashboard is automatically started with the bot.

- **URL**: `http://localhost:3000` (configurable via `WEB_PORT`)
- **API Endpoints**: Available under `/api/` (e.g., `/api/portfolio`, `/api/health`)
- **WebSocket**: Real-time updates emitted for `trade`, `signal`, `news`, and `portfolio` events.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT © [rab781](https://github.com/rab781)
