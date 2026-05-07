# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Retail traders often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. You waste time and fragment your workflow when navigating multiple platforms for technical indicators, news sentiment, and strategy backtesting. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single, accessible Telegram interface—leveling the playing field for you without the cost of premium subscriptions.

## Quick Start

You can get the bot up and running in under 2 minutes:

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
- Node.js 20.19+
- npm 9+
- A Telegram Bot Token (get it from [@BotFather](https://t.me/BotFather))

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

To get a complete market analysis for a specific pair, you send:

```
/analyze BTCUSDT
```

**What you get:**
- **Technical Analysis**: RSI, MACD, Bollinger Bands, Moving Averages
- **Multi-timeframe Analysis**: 1H, 4H, 1D trends
- **Backtesting Results**: 30-day strategy performance
- **Recommendations**: Entry/exit levels with reasoning

### Advanced Usage

You can execute complex trading workflows, including simulated trading and strategy optimization.

**Start a Paper Trading Session:**
```
/papertrade ETHUSDT
```
*Starts a virtual trading session with a $1000 simulated balance using real market data. You track it using `/portfolio`.*

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

## Configuration

You configure the bot by editing the `.env` file.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `DATABASE_URL` | `string` | `"file:./prisma/dev.db"` | **Required.** Database connection string |
| `DATABASE_POOL_MAX` | `number` | `10` | PostgreSQL pool maximum connections |
| `DATABASE_POOL_TIMEOUT_SEC` | `number` | `5` | PostgreSQL pool timeout in seconds |
| `PGBOUNCER_ENABLED` | `boolean` | `true` | Enable PgBouncer pooling |
| `SQLITE_DATABASE_URL` | `string` | `"file:./prisma/dev.db"` | Source SQLite database URL for migration |
| `POSTGRES_DATABASE_URL` | `string` | | Target PostgreSQL database URL for migration |
| `MIGRATION_DRY_RUN` | `boolean` | `true` | Run migration script in dry-run mode |
| `MIGRATION_TRUNCATE_TARGET` | `boolean` | `false` | Truncate target tables before migration |
| `MIGRATION_BATCH_SIZE` | `number` | `500` | Number of records to process per batch during migration |
| `TELEGRAM_BOT_TOKEN` | `string` | | **Required.** Your Telegram bot token from @BotFather |
| `BINANCE_API_KEY` | `string` | | Binance API Key (required for live trading and better rate limits, bot falls back to public API if not provided) |
| `BINANCE_API_SECRET` | `string` | | Binance API Secret (required for live trading and better rate limits) |
| `BINANCE_TESTNET` | `boolean` | `true` | Enable Binance Spot Testnet |
| `BINANCE_TESTNET_URL` | `string` | `https://testnet.binance.vision` | Explicit Testnet URL |
| `BINANCE_BASE_URL` | `string` | `https://api.binance.com` | Override for region-specific endpoint |
| `BINANCE_RECV_WINDOW` | `number` | `5000` | Order service tuning: receive window |
| `BINANCE_ORDER_TIMEOUT_MS` | `number` | `12000` | Order service tuning: timeout in ms |
| `BINANCE_MAX_WEIGHT_PER_MINUTE` | `number` | `1200` | Rate limit override |
| `BINANCE_PROXY_URL` | `string` | `http://127.0.0.1:8080` | Outbound proxy URL when server IP is blocked |
| `BINANCE_CA_CERT_PATH` | `string` | `/etc/ssl/certs/ca-certificates.crt` | TLS settings: CA certificate path |
| `BINANCE_TLS_INSECURE` | `boolean` | `false` | TLS settings: disable verification |
| `TWITTER_API_KEY` | `string` | | Twitter API Key (for social media analysis) |
| `TWITTER_API_KEY_SECRET` | `string` | | Twitter API Key Secret |
| `TWITTER_ACCESS_TOKEN` | `string` | | Twitter Access Token |
| `TWITTER_ACCESS_TOKEN_SECRET` | `string` | | Twitter Access Token Secret |
| `TWITTER_BEARER_TOKEN` | `string` | | Twitter Bearer Token |
| `CHUTES_API_KEY` | `string` | | Chutes API Key (enables advanced AI-powered news analysis and price impact predictions) |

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
