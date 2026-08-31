# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Retail traders often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. You waste time navigating multiple platforms for technical indicators, news sentiment, and strategy backtesting. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single, accessible Telegram interface—leveling the playing field without the cost of premium subscriptions.

## Quick Start

You get the bot up and running in under 5 minutes.

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install

# Copy the environment template
cp .env.example .env
# Edit .env and set TELEGRAM_BOT_TOKEN=your_token_here

# Initialize the database
npx prisma generate
npx prisma migrate dev

# Build the project
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

# 3. Configure environment variables
cp .env.example .env
# Edit .env with your credentials

# 4. Initialize the database
npx prisma generate
npx prisma migrate dev
```

## Usage

You interact with the bot via Telegram commands.

### Basic Analysis

To get a complete market analysis for a specific pair, you send:

```text
/analyze BTCUSDT
```

**What you receive:**
- **Technical Analysis**: RSI, MACD, Bollinger Bands, Moving Averages
- **Multi-timeframe Analysis**: 1H, 4H, 1D trends
- **Backtesting Results**: 30-day strategy performance
- **Recommendations**: Entry/exit levels with reasoning

### Advanced Trading

You start a virtual trading session with a $1000 simulated balance using real market data. You track your progress using `/portfolio`.

```text
/papertrade ETHUSDT
```

You test the default strategy's performance over the last 30 days and receive win rate, drawdown, and total profit metrics.

```text
/backtest SOLUSDT 30
```

You run an optimization over a 60-day period to find the best parameters for maximum profit.

```text
/optimize ADAUSDT 60
```

## Configuration

You configure the bot by editing the `.env` file.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `DATABASE_URL` | `string` | `"file:./prisma/dev.db"` | Database connection string (SQLite or PostgreSQL) |
| `TELEGRAM_BOT_TOKEN` | `string` | `undefined` | Your Telegram bot token from @BotFather |
| `BINANCE_API_KEY` | `string` | `undefined` | Required for live trading and better rate limits |
| `BINANCE_API_SECRET` | `string` | `undefined` | Required for live trading and better rate limits |
| `BINANCE_TESTNET` | `boolean` | `true` | Enable Binance Spot Testnet |
| `CHUTES_API_KEY` | `string` | `undefined` | Required for AI-powered news analysis and impact predictions |
| `TWITTER_API_KEY` | `string` | `undefined` | Optional Twitter API key for social media analysis |

> **Note**: The bot automatically falls back to the public Binance API if private credentials are not provided.

### Run With PM2 (Persistent)

You use PM2 to run the bot persistently. This project includes PM2 scripts and a bootstrap wrapper so startup does not depend on a hardcoded nvm Node version path.

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

You use systemd to configure the bot to start automatically on reboot.

```bash
# 1) Install service file (adjust username/path if needed)
sudo cp deploy/rabtradebot.service /etc/systemd/system/rabtradebot.service

# 2) Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable --now rabtradebot.service

# 3) Verify
systemctl status rabtradebot.service
npm run pm2:status
```

The service launches `scripts/pm2-startup-wrapper.sh`, which loads nvm, uses `.nvmrc`, and runs `pm2 resurrect` (or starts `ecosystem.config.js` if no dump is present).

## Telegram Command Reference

### Basic Analysis
- `/signal [symbol]` - Retrieve trading signals
- `/volume [symbol]` - Analyze trading volume
- `/sr [symbol]` - View support and resistance levels
- `/chart [symbol]` - Generate interactive charts

### Advanced Trading
- `/backtest [symbol] [days]` - Backtest strategies
- `/papertrade [symbol]` - Start a paper trading simulation
- `/portfolio` - View current positions and balance
- `/performance` - Check detailed performance metrics
- `/optimize [symbol] [days]` - Optimize strategy parameters

### Data & Status
- `/download [symbol] [days]` - Download historical data
- `/datainfo [symbol]` - Check data quality and summary
- `/strategies` - List available trading strategies
- `/apistatus` - Check Binance API connectivity

## Architecture & Tech Stack

- **Language**: TypeScript
- **Bot Framework**: Telegraf
- **Database**: Prisma ORM with SQLite or PostgreSQL
- **Market Data**: Binance REST & WebSocket APIs
- **AI/ML**: TensorFlow.js (GRU models), Chutes AI (News Sentiment)

## Contributing

You contribute by reviewing [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
