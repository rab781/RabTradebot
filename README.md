# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Retail traders often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. Navigating multiple platforms for technical indicators, news sentiment, and strategy backtesting is time-consuming and fragmented. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single, accessible Telegram interface—leveling the playing field without the cost of premium subscriptions.

## Quick Start

You can get the bot up and running in under 5 minutes.

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install

# Copy the environment template and configure your secrets
cp .env.example .env

# Generate Prisma client and migrate the database
npx prisma generate
npx prisma migrate dev

# Build the project
npm run build

# Start the bot
npm start
```

Once running, open Telegram, find your bot, and send `/start`.

## Installation

**Prerequisites**:
- Node.js 18+
- npm 9+
- A Telegram Bot Token (get it from [@BotFather](https://t.me/BotFather))

Follow these steps to install the project locally:

1. **Clone the repository**
   ```bash
   git clone https://github.com/rab781/RabTradebot.git
   cd RabTradebot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up the database**
   The bot uses Prisma as its ORM with SQLite (or PostgreSQL for production). You must generate the Prisma client and apply migrations before building the project.
   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

## Configuration

Configure the bot by editing the `.env` file you created during setup.

### Required Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | none | Your Telegram bot token from @BotFather. |

### Optional Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `BINANCE_API_KEY` | `string` | none | Required for live trading and better rate limits. |
| `BINANCE_API_SECRET` | `string` | none | Required for live trading and better rate limits. |
| `CHUTES_API_KEY` | `string` | none | Required for AI-powered news analysis and impact predictions. |
| `DATABASE_URL` | `string` | `file:./prisma/dev.db` | Database connection string. Use `postgresql://...` for production. |

> **Note**: The bot automatically falls back to the public Binance API if you do not provide private credentials.

## Usage

### Basic Usage

Interact with the bot via Telegram commands. To get a complete market analysis for a specific pair, send:

```
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
```
/papertrade ETHUSDT
```
*Starts a virtual trading session with a $1000 simulated balance using real market data. Track your progress using `/portfolio`.*

**Backtest a Strategy:**
```
/backtest SOLUSDT 30
```
*Tests the default strategy's performance over the last 30 days and returns your win rate, drawdown, and total profit.*

**Optimize Strategy Parameters:**
```
/optimize ADAUSDT 60
```
*Runs optimization over a 60-day period to find the best parameters for maximum profit.*

## API Reference

The web dashboard and APIs use standard REST endpoints and WebSocket for real-time updates. Check the API specifications in the dashboard once started, or run the application and visit the dashboard at `http://localhost:3000/api`.

### Telegram Commands

**Basic Analysis**
- `/signal [symbol]` - Trading signals
- `/volume [symbol]` - Volume analysis
- `/sr [symbol]` - Support/resistance levels
- `/chart [symbol]` - Generate interactive charts

**Advanced Trading**
- `/backtest [symbol] [days]` - Strategy backtesting
- `/papertrade [symbol]` - Start paper trading simulation
- `/portfolio` - View current positions and balance
- `/performance` - Detailed performance metrics
- `/optimize [symbol] [days]` - Optimize strategy parameters

**Data & Status**
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

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
