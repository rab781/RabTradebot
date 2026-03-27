# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![npm version](https://badge.fury.io/js/advanced-crypto-trading-bot.svg)](https://badge.fury.io/js/advanced-crypto-trading-bot)
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

1. Clone the repository

   ```bash
   git clone https://github.com/rab781/RabTradebot.git
   cd RabTradebot
   ```

2. Install dependencies

   ```bash
   npm install
   ```

3. Configure your environment variables

   ```bash
   cp .env.example .env
   ```

## Configuration

Configure the bot by editing the `.env` file.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | **Yes** | Your Telegram bot token from @BotFather |
| `BINANCE_API_KEY` | `string` | No | Required for live trading and better rate limits |
| `BINANCE_API_SECRET` | `string` | No | Required for live trading and better rate limits |
| `CHUTES_API_KEY` | `string` | No | Required for AI-powered news analysis and impact predictions |

> **Note**: The bot automatically falls back to the public Binance API if private credentials are not provided.

## Usage

Interact with the bot via Telegram commands.

### Basic Example

To get a complete market analysis for a specific pair:

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
*Starts a virtual trading session with $1000 simulated balance using real market data. Track it using `/portfolio`.*

**Backtest a Strategy:**
```
/backtest SOLUSDT 30
```
*Tests the default strategy's performance over the last 30 days and returns win rate, drawdown, and total profit.*

**Optimize Strategy Parameters:**
```
/optimize ADAUSDT 60
```
*Runs optimization over a 60-day period to find the best parameters for maximum profit.*

## Telegram Command Reference

### Basic Analysis
- `/signal [symbol]` - Trading signals
- `/volume [symbol]` - Volume analysis
- `/sr [symbol]` - Support/resistance levels
- `/chart [symbol] [timeframe]` - Generate interactive charts (e.g., `/chart BTCUSDT 1h`)
- `/analyze [symbol]` - Complete technical and multi-timeframe analysis
- `/fullanalysis [symbol]` - Technical + AI news analysis
- `/openclaw [symbol]` - Advanced ML-powered analysis

### ML & AI
- `/mlpredict [symbol]` - GRU-based price prediction
- `/trainmodel [symbol] [epochs]` - Train ML model (e.g., `/trainmodel BTCUSDT 15`)
- `/mlstatus` - Check ML model status
- `/pnews [symbol]` - AI news analysis (Powered by Chutes AI)
- `/impact [symbol]` - Quick news impact overview (Powered by Chutes AI)
- `/news [symbol]` - Comprehensive news analysis

### Advanced Trading
- `/backtest [symbol] [days]` - Strategy backtesting
- `/papertrade [symbol]` - Start paper trading simulation
- `/livetrade start [symbol] confirm` - Start live trading (real funds)
- `/livetrade stop` - Stop live trading
- `/stoptrading` - Stop current paper trading session
- `/portfolio` - View current paper trading positions and balance
- `/performance` - Detailed performance metrics
- `/orders [symbol]` - View open Binance orders
- `/cancelorder <orderId> [symbol]` - Cancel live order
- `/liveportfolio` - View non-zero balances + open orders
- `/optimize [symbol] [days]` - Optimize strategy parameters

### Data & Status
- `/download [symbol] [days]` - Download historical data
- `/datainfo [symbol]` - Check data quality and summary
- `/strategies` - List available trading strategies
- `/apistatus` - Check Binance API connectivity
- `/pstatus` - Check Chutes AI configuration
- `/stats` - Your trading statistics & ML performance
- `/strategystats [symbol]` - Compare strategy performance

### Price Alerts
- `/alert [symbol] [price] [above/below]` - Set price alert
- `/alerts` - List your active price alerts
- `/delalert [symbol]` - Delete price alert

### UI & Navigation
- `/coin [symbol]` - Set active coin
- `/menu [optional-symbol]` - Open feature keyboard with active coin
- `/go` - Quick open menu

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
