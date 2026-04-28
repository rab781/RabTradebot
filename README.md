# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Retail traders often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. Navigating multiple platforms for technical indicators, news sentiment, and strategy backtesting is time-consuming and fragmented. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single, accessible Telegram interface—leveling the playing field without the cost of premium subscriptions.

## Quick Start

Get the bot up and running in under 2 minutes.

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install

cp .env.example .env
# Edit .env and set TELEGRAM_BOT_TOKEN=your_token_here

npm run build
npm start
```

Open Telegram, find your bot, and send `/start`.

## Installation

**Prerequisites**:
- Node.js 20.19+
- npm 9+
- A Telegram Bot Token (get it from [@BotFather](https://t.me/BotFather))

Clone the repository and install dependencies:

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot

npm install
```

## Configuration

You configure the bot by editing the `.env` file. Copy `.env.example` to `.env` to get started.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | | **Required.** Your Telegram bot token from @BotFather. |
| `DATABASE_URL` | `string` | `"file:./prisma/dev.db"` | Database connection string. Use SQLite for development and PostgreSQL for production. |
| `DATABASE_POOL_MAX` | `number` | | Maximum connection pool size for PostgreSQL. |
| `DATABASE_POOL_TIMEOUT_SEC` | `number` | | Connection pool timeout in seconds for PostgreSQL. |
| `PGBOUNCER_ENABLED` | `boolean` | | Set to `true` to enable PgBouncer support for PostgreSQL. |
| `SQLITE_DATABASE_URL` | `string` | | Source database URL for the SQLite to PostgreSQL migration script. |
| `POSTGRES_DATABASE_URL` | `string` | | Target database URL for the SQLite to PostgreSQL migration script. |
| `MIGRATION_DRY_RUN` | `boolean` | | Set to `true` to dry-run the migration without writing data. |
| `MIGRATION_TRUNCATE_TARGET` | `boolean` | | Set to `true` to truncate target tables before migrating data. |
| `MIGRATION_BATCH_SIZE` | `number` | | Number of records to process per batch during migration. |
| `BINANCE_API_KEY` | `string` | | Binance API Key. Required for live trading and better rate limits. The bot automatically falls back to the public Binance API if private credentials are not provided. |
| `BINANCE_API_SECRET` | `string` | | Binance API Secret. Required for live trading and better rate limits. |
| `BINANCE_TESTNET` | `boolean` | | Set to `true` to enable Binance Spot Testnet (recommended for development). |
| `BINANCE_TESTNET_URL` | `string` | | Explicit URL for the Binance Testnet. |
| `BINANCE_BASE_URL` | `string` | | Override for the region-specific Binance endpoint. |
| `BINANCE_RECV_WINDOW` | `number` | | Receive window for Binance order service tuning. |
| `BINANCE_ORDER_TIMEOUT_MS` | `number` | | Timeout in milliseconds for Binance order service. |
| `BINANCE_MAX_WEIGHT_PER_MINUTE` | `number` | | Maximum API weight limit per minute for Binance. |
| `BINANCE_PROXY_URL` | `string` | | Outbound proxy URL when your server IP is blocked by Binance (format: `http://user:pass@host:port`). |
| `BINANCE_CA_CERT_PATH` | `string` | | Path to a custom TLS CA certificate for environments with proxy inspection. |
| `BINANCE_TLS_INSECURE` | `boolean` | | Set to `true` to disable TLS verification. |
| `TWITTER_API_KEY` | `string` | | Twitter API Key for social media analysis. |
| `TWITTER_API_KEY_SECRET` | `string` | | Twitter API Key Secret. |
| `TWITTER_ACCESS_TOKEN` | `string` | | Twitter Access Token. |
| `TWITTER_ACCESS_TOKEN_SECRET` | `string` | | Twitter Access Token Secret. |
| `TWITTER_BEARER_TOKEN` | `string` | | Twitter Bearer Token. |
| `CHUTES_API_KEY` | `string` | | Chutes AI API key. Enables advanced AI-powered news analysis and price impact predictions. |

## Usage

You interact with the bot using Telegram commands.

### Basic Example

You can request a complete market analysis for a specific pair:

```
/analyze BTCUSDT
```

This provides:
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
Starts a virtual trading session with a $1000 simulated balance using real market data. You track it using `/portfolio`.

**Backtest a Strategy:**
```
/backtest SOLUSDT 30
```
Tests the default strategy's performance over the last 30 days and returns win rate, drawdown, and total profit.

**Optimize Strategy Parameters:**
```
/optimize ADAUSDT 60
```
Runs optimization over a 60-day period to find the best parameters for maximum profit.

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

## Run With PM2 (Persistent)

This project includes PM2 scripts and a bootstrap wrapper so startup does not depend on a hardcoded nvm Node version path.

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
