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

# Build the project (generates the dist/ directory)
npm run build

# Start the bot
npm start
```

Open Telegram, find your bot, and send `/start`.

## Running with PM2 (Recommended for Production)

[PM2](https://pm2.keymetrics.io/) keeps the bot running continuously, restarts it automatically on crashes, and survives server reboots.

### 1. Install PM2 globally

```bash
npm install -g pm2
```

### 2. Clone, install, and configure

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install
cp .env.example .env
# Edit .env and set at least TELEGRAM_BOT_TOKEN=your_token_here
```

### 3. Build the project

```bash
npm run build
```

### 4. Start with PM2

```bash
# Production mode (recommended)
npm run pm2:start

# Development mode
npm run pm2:start:dev
```

The PM2 configuration is in `ecosystem.config.js`. The bot runs as a **single fork** instance (cluster mode is not supported — Telegram long-polling maintains one persistent connection to the API, so running multiple instances would cause every incoming message to be processed multiple times).

### 5. Persist across reboots

```bash
# Save the current process list
pm2 save

# Generate and install startup script
pm2 startup
```

PM2 will print a command (e.g. `sudo env PATH=... pm2 startup systemd -u $USER --hp $HOME`). **Copy-paste that exact command and run it with elevated privileges** (`sudo`). If automatic init-system detection fails, specify yours explicitly (e.g. `pm2 startup systemd`). Run `pm2 save` again after the startup script is installed to make the saved process list effective.

### PM2 management commands

| Task | Command |
|------|---------|
| View status | `npm run pm2:status` |
| Tail logs | `npm run pm2:logs` |
| Restart bot | `npm run pm2:restart` |
| Stop bot | `npm run pm2:stop` |
| Remove from PM2 | `npm run pm2:delete` |

### Deploy updates

Pull the latest code, rebuild, and restart in one step:

```bash
npm run deploy
```

### Log rotation (optional)

PM2 writes logs to the `logs/` directory. To automatically rotate them:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
```

## Installation

**Prerequisites**:
- Node.js 20+
- npm 9+
- A Telegram Bot Token (get it from [@BotFather](https://t.me/BotFather))

```bash
# 1. Clone the repository
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot

# 2. Install dependencies
npm install
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

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
