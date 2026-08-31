# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

As a retail trader, you often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. You navigate multiple platforms for technical indicators, news sentiment, and strategy backtesting, which is time-consuming and fragmented. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single, accessible Telegram interface. You get to level the playing field without the cost of premium subscriptions.

## Quick Start

You start the bot in under 2 minutes:

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

You open Telegram, find your bot, and send `/start`.

## Installation

**Prerequisites**:
- Node.js 20.19+
- npm 9+
- A Telegram Bot Token (you get it from [@BotFather](https://t.me/BotFather))

You install the project dependencies after cloning the repository:

```bash
# 1. Clone the repository
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot

# 2. Install dependencies
npm install
```

## Usage

You interact with the bot via Telegram commands.

### Basic Example

You get a complete market analysis for a specific pair by sending:

```
/analyze BTCUSDT
```

**What you receive:**
- **Technical Analysis**: RSI, MACD, Bollinger Bands, Moving Averages
- **Multi-timeframe Analysis**: 1H, 4H, 1D trends
- **Backtesting Results**: 30-day strategy performance
- **Recommendations**: Entry/exit levels with reasoning

### Advanced Usage

You use the bot for complex trading workflows, including simulated trading and strategy optimization.

**Start a Paper Trading Session:**
```
/papertrade ETHUSDT
```
*You start a virtual trading session with a $1000 simulated balance using real market data. You track it using `/portfolio`.*

**Backtest a Strategy:**
```
/backtest SOLUSDT 30
```
*You test the default strategy's performance over the last 30 days. The bot returns the win rate, drawdown, and total profit.*

**Optimize Strategy Parameters:**
```
/optimize ADAUSDT 60
```
*You run an optimization over a 60-day period to find the best parameters for maximum profit.*

## Configuration

You configure the bot by editing the `.env` file.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | `undefined` | **Required.** Your Telegram bot token from @BotFather |
| `BINANCE_API_KEY` | `string` | `undefined` | Required for live trading and better rate limits |
| `BINANCE_API_SECRET` | `string` | `undefined` | Required for live trading and better rate limits |
| `CHUTES_API_KEY` | `string` | `undefined` | Required for AI-powered news analysis and impact predictions |

> **Note**: The bot automatically falls back to the public Binance API if you do not provide private credentials.

## Run With PM2 (Persistent)

You keep the bot running persistently using the included PM2 scripts and a bootstrap wrapper. This ensures startup does not depend on a hardcoded nvm Node version path.

```bash
# Build first
npm run build

# Start or recover with PM2
npm run pm2:bootstrap

# Check status and logs
npm run pm2:status
npm run pm2:logs
```

### Auto Start On Reboot (systemd)

You configure the bot to start automatically on system reboot:

```bash
# 1) Install the service file (you adjust the username/path if needed)
sudo cp deploy/rabtradebot.service /etc/systemd/system/rabtradebot.service

# 2) Reload systemd and enable the service
sudo systemctl daemon-reload
sudo systemctl enable --now rabtradebot.service

# 3) Verify the service status
systemctl status rabtradebot.service
npm run pm2:status
```

The service launches `scripts/pm2-startup-wrapper.sh`. This script loads nvm, uses `.nvmrc`, and runs `pm2 resurrect` (or starts `ecosystem.config.js` if you have no dump present).

## Telegram Command Reference

### Basic Analysis
- `/signal [symbol]` - You receive trading signals
- `/volume [symbol]` - You receive volume analysis
- `/sr [symbol]` - You receive support and resistance levels
- `/chart [symbol]` - You generate interactive charts

### Advanced Trading
- `/backtest [symbol] [days]` - You run strategy backtesting
- `/papertrade [symbol]` - You start a paper trading simulation
- `/portfolio` - You view your current positions and balance
- `/performance` - You view detailed performance metrics
- `/optimize [symbol] [days]` - You optimize strategy parameters

### Data & Status
- `/download [symbol] [days]` - You download historical data
- `/datainfo [symbol]` - You check data quality and summary
- `/strategies` - You list available trading strategies
- `/apistatus` - You check Binance API connectivity

## Architecture & Tech Stack

- **Language**: TypeScript
- **Bot Framework**: Telegraf
- **Database**: Prisma ORM with SQLite
- **Market Data**: Binance REST & WebSocket APIs
- **AI/ML**: TensorFlow.js (GRU models), Chutes AI (News Sentiment)

## Contributing

We welcome contributions! You see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License. You see the [LICENSE](LICENSE) file for details.