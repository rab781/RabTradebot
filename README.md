# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Retail traders often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. Navigating multiple platforms for technical indicators, news sentiment, and strategy backtesting consumes time and fragments your focus. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single, accessible Telegram interface. It levels the playing field so you can trade without the cost of premium subscriptions.

## Quick Start

Get the bot up and running in under 2 minutes.

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install

# Copy the environment template and add your Telegram bot token
cp .env.example .env
# Edit .env and set TELEGRAM_BOT_TOKEN=your_token_here

# Generate Prisma client and run migrations
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
- Node.js 20.19+
- npm 9+
- A Telegram Bot Token (get it from [@BotFather](https://t.me/BotFather))

```bash
# 1. Clone the repository
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot

# 2. Install dependencies
npm install

# 3. Setup your environment variables
cp .env.example .env
# Open .env and populate your TELEGRAM_BOT_TOKEN

# 4. Generate the database client and apply migrations
npx prisma generate
npx prisma migrate dev
```

## Usage

You interact with the bot via Telegram commands.

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

### Advanced Usage

The bot supports complex trading workflows, including simulated trading and strategy optimization.

**Start a Paper Trading Session:**
```text
/papertrade ETHUSDT
```
*You start a virtual trading session with a $1000 simulated balance using real market data. Track your progress using `/portfolio`.*

**Backtest a Strategy:**
```text
/backtest SOLUSDT 30
```
*You test the default strategy's performance over the last 30 days. The bot returns win rate, drawdown, and total profit.*

**Optimize Strategy Parameters:**
```text
/optimize ADAUSDT 60
```
*You run an optimization over a 60-day period to find the best parameters for maximum profit.*

## Configuration

You configure the bot by editing the `.env` file in the root directory.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | *(None)* | Your Telegram bot token from @BotFather. **Required**. |
| `BINANCE_API_KEY` | `string` | *(None)* | Provides live trading capabilities and better rate limits. |
| `BINANCE_API_SECRET` | `string` | *(None)* | Provides live trading capabilities and better rate limits. |
| `CHUTES_API_KEY` | `string` | *(None)* | Enables AI-powered news analysis and impact predictions. |
| `DATABASE_URL` | `string` | `file:./prisma/dev.db` | The connection string for your database. |

> **Note**: The bot automatically falls back to the public Binance API if you do not provide private credentials.

## API Reference

You use these Telegram commands to interact with the bot.

### Basic Analysis
- `/signal [symbol]` - Retrieves trading signals
- `/volume [symbol]` - Analyzes trading volume
- `/sr [symbol]` - Calculates support and resistance levels
- `/chart [symbol]` - Generates interactive charts

### Advanced Trading
- `/backtest [symbol] [days]` - Backtests your strategy
- `/papertrade [symbol]` - Starts a paper trading simulation
- `/portfolio` - Views your current positions and balance
- `/performance` - Shows detailed performance metrics
- `/optimize [symbol] [days]` - Optimizes strategy parameters

### Data & Status
- `/download [symbol] [days]` - Downloads historical market data
- `/datainfo [symbol]` - Checks data quality and summary
- `/strategies` - Lists available trading strategies
- `/apistatus` - Checks Binance API connectivity

## Architecture & Tech Stack

- **Language**: TypeScript
- **Bot Framework**: Telegraf
- **Database**: Prisma ORM with SQLite
- **Market Data**: Binance REST & WebSocket APIs
- **AI/ML**: TensorFlow.js (GRU models), Chutes AI (News Sentiment)

## Run With PM2 (Persistent)

This project includes PM2 scripts and a bootstrap wrapper so your startup does not depend on a hardcoded nvm Node version path.

```bash
# Build first
npm run build

# Start/recover with PM2
npm run pm2:bootstrap

# Check status/logs
npm run pm2:status
npm run pm2:logs
```

### Auto Start On Reboot (systemd)

```bash
# 1) Install the service file (adjust username/path if needed)
sudo cp deploy/rabtradebot.service /etc/systemd/system/rabtradebot.service

# 2) Reload systemd and enable the service
sudo systemctl daemon-reload
sudo systemctl enable --now rabtradebot.service

# 3) Verify the service status
systemctl status rabtradebot.service
npm run pm2:status
```

The service launches `scripts/pm2-startup-wrapper.sh`, which loads nvm, uses `.nvmrc`, and runs `pm2 resurrect` (or starts `ecosystem.config.js` if you have no dump present).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT © [rab781](https://github.com/rab781)
