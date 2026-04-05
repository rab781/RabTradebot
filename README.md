# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Retail traders often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. Navigating multiple platforms for technical indicators, news sentiment, and strategy backtesting is time-consuming and fragmented. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single, accessible Telegram interface—leveling the playing field without the cost of premium subscriptions.

## Quick Start

Get the bot up and running in under 2 minutes:

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install

# Copy the environment template and add your Telegram bot token
cp .env.example .env
# Edit .env and set TELEGRAM_BOT_TOKEN=your_token_here

# Initialize the database
npx prisma generate
npx prisma migrate dev

# Build the project (generates the dist/ directory)
npm run build

# Start the bot
npm start
```

Open Telegram, find your bot, and send `/start`.

## Installation

**Prerequisites**:
- Node.js 18+
- npm 9+
- A Telegram Bot Token (get it from [@BotFather](https://t.me/BotFather))

```bash
# 1. Clone the repository
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot

# 2. Install dependencies
npm install

# 3. Setup the environment
cp .env.example .env

# 4. Generate the Prisma client and run migrations
npx prisma generate
npx prisma migrate dev

# 5. Build and start the bot
npm run build
npm start
```

## Configuration

Configure the bot by editing the `.env` file. You must set the `TELEGRAM_BOT_TOKEN` to start the bot.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | **Yes** | Your Telegram bot token from @BotFather. |
| `BINANCE_API_KEY` | `string` | No | Required for live trading and better rate limits. |
| `BINANCE_API_SECRET` | `string` | No | Required for live trading and better rate limits. |
| `CHUTES_API_KEY` | `string` | No | Required for AI-powered news analysis and impact predictions via Chutes AI. |
| `DATABASE_URL` | `string` | No | Connection string for your database (defaults to local SQLite if unset). |

> **Note**: The bot automatically falls back to the public Binance API if private credentials are not provided. Hardcoding secrets directly in the codebase is strictly prohibited.

## Usage

Interact with the bot via Telegram commands. Set your default coin first, or append the symbol to any command.

### Getting Started

```
/start
```
*Initializes the bot and displays the welcome message and available commands.*

```
/coin BTCUSDT
```
*Sets your active trading pair. You can then use the inline menu to perform actions without typing the symbol.*

```
/menu
```
*Opens the interactive inline keyboard menu for your active coin.*

### Basic Analysis

To get a complete market analysis for a specific pair:

```
/analyze BTCUSDT
```

**What you get:**
- **Technical Analysis**: RSI, MACD, Bollinger Bands, Moving Averages.
- **Multi-timeframe Analysis**: 1H, 4H, 1D trends.
- **Recommendations**: Entry/exit levels with reasoning.
- **News Sentiment**: Scraped data (enhanced by Chutes AI if configured).

### AI & News

```
/pnews BTCUSDT
```
*Uses Chutes AI to analyze the latest news, market sentiment, and predict price impact over 24H, 7D, and 30D.*

```
/impact BTCUSDT
```
*Provides a quick summary of news impact and sentiment.*

### Advanced Trading

The bot supports complex trading workflows, including simulated trading and strategy optimization.

**Start a Paper Trading Session:**
```
/papertrade ETHUSDT
```
*Starts a virtual trading session with a $1000 simulated balance using real market data. Track your progress using `/portfolio` and `/performance`.*

**Backtest a Strategy:**
```
/backtest SOLUSDT 30
```
*Tests the strategy's performance over the last 30 days and returns win rate, drawdown, total profit, and Sharpe ratio.*

**Optimize Strategy Parameters:**
```
/optimize ADAUSDT 60
```
*Runs optimization over a 60-day period to find the best parameters for maximum profit.*

**Live Trading:**
```
/livetrade start BTCUSDT confirm
```
*Starts live trading using real funds. **Warning: This uses real money.** Stop it using `/livetrade stop`.*

## Telegram Command Reference

### Basic Analysis
- `/signal [symbol]` - Trading signals
- `/volume [symbol]` - Volume analysis
- `/sr [symbol]` - Support/resistance levels
- `/chart [symbol]` - Generate interactive charts
- `/fullanalysis [symbol]` - Combined technical and news analysis

### Advanced Trading
- `/backtest [symbol] [days]` - Strategy backtesting
- `/papertrade [symbol]` - Start paper trading simulation
- `/stoptrading` - Stop current paper trading session
- `/portfolio` - View current positions and balance
- `/performance` - Detailed performance metrics
- `/optimize [symbol] [days]` - Optimize strategy parameters
- `/livetrade start [symbol] confirm` - Start live trading
- `/livetrade stop` - Stop live trading
- `/orders [symbol]` - View open Binance orders
- `/liveportfolio` - View live Binance balances and orders

### ML & OpenClaw
- `/openclaw [symbol]` - Advanced ML-powered analysis
- `/mlpredict [symbol]` - LSTM price prediction
- `/trainmodel [symbol] [days]` - Train ML model
- `/mlstatus` - Check ML model status

### News & Social
- `/pnews [symbol]` - AI news analysis (Chutes)
- `/impact [symbol]` - Quick news impact overview (Chutes)
- `/news [symbol]` - Comprehensive scraped news analysis

### Data & Status
- `/download [symbol] [days]` - Download historical data
- `/datainfo [symbol]` - Check data quality and summary
- `/strategies` - List available trading strategies
- `/apistatus` - Check Binance API connectivity
- `/healthcheck` - Full system health
- `/pstatus` - Check Chutes AI configuration

## Architecture & Tech Stack

- **Language**: TypeScript
- **Bot Framework**: Telegraf
- **Database**: Prisma ORM with SQLite (PostgreSQL supported)
- **Market Data**: Binance REST & WebSocket APIs
- **AI/ML**: TensorFlow.js (GRU models), Chutes AI (News Sentiment)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
