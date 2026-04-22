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

# Generate the Prisma client and run migrations
npx prisma generate
npx prisma migrate dev

# Build the project (generates the dist/ directory)
npm run build

# Start the bot
npm start
```

Open Telegram, find your bot, and send `/start`.

## Installation

**Prerequisites**: Node.js 20.19+, npm 9+, and a Telegram Bot Token from [@BotFather](https://t.me/BotFather)

```bash
# 1. Clone the repository
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot

# 2. Install dependencies
npm install

# 3. Configure the environment
cp .env.example .env
# Edit .env to include your TELEGRAM_BOT_TOKEN and other settings

# 4. Generate the database schema and apply migrations
npx prisma generate
npx prisma migrate dev

# 5. Build the application
npm run build
```

## Usage

Interact with the bot via Telegram commands.

### Basic Example

To get a complete market analysis for a specific pair, send:

```
/analyze BTCUSDT
```

You receive:
- **Technical Analysis**: RSI, MACD, Bollinger Bands, Moving Averages
- **Multi-timeframe Analysis**: 1H, 4H, 1D trends
- **Backtesting Results**: 30-day strategy performance
- **Recommendations**: Entry/exit levels with reasoning

### Advanced Usage

You can use the bot for complex trading workflows, including simulated trading and strategy optimization.

**Start a Paper Trading Session:**
```
/papertrade ETHUSDT
```
You start a virtual trading session with a $1000 simulated balance using real market data. Track it using `/portfolio`.

**Backtest a Strategy:**
```
/backtest SOLUSDT 30
```
You test the default strategy's performance over the last 30 days and receive the win rate, drawdown, and total profit.

**Optimize Strategy Parameters:**
```
/optimize ADAUSDT 60
```
You run an optimization over a 60-day period to find the best parameters for maximum profit.

### Run With PM2 (Persistent)

You can run the bot persistently using the included PM2 scripts and bootstrap wrapper. This ensures startup does not depend on a hardcoded nvm Node version path.

```bash
# Start or recover the bot with PM2
npm run pm2:bootstrap

# Check status and logs
npm run pm2:status
npm run pm2:logs
```

## Configuration

Configure the bot by editing the `.env` file.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `DATABASE_URL` | `string` | `file:./prisma/dev.db` | Development SQLite database URL or Production PostgreSQL URL |
| `DATABASE_POOL_MAX` | `number` | - | PostgreSQL pool tuning max size |
| `DATABASE_POOL_TIMEOUT_SEC` | `number` | - | PostgreSQL pool timeout in seconds |
| `PGBOUNCER_ENABLED` | `boolean` | - | Enable PgBouncer for PostgreSQL |
| `SQLITE_DATABASE_URL` | `string` | - | SQLite source URL for PostgreSQL migration script |
| `POSTGRES_DATABASE_URL` | `string` | - | PostgreSQL target URL for migration script |
| `MIGRATION_DRY_RUN` | `boolean` | - | Enable dry run for database migration |
| `MIGRATION_TRUNCATE_TARGET` | `boolean` | - | Truncate target tables before migration |
| `MIGRATION_BATCH_SIZE` | `number` | - | Batch size for migration script |
| `TELEGRAM_BOT_TOKEN` | `string` | - | Your Telegram bot token from @BotFather |
| `BINANCE_API_KEY` | `string` | - | Binance API Key (required for live trading and better rate limits) |
| `BINANCE_API_SECRET` | `string` | - | Binance API Secret |
| `BINANCE_TESTNET` | `boolean` | - | Enable Binance Spot Testnet (recommended for Fase 1 development) |
| `BINANCE_TESTNET_URL` | `string` | - | Optional explicit Testnet URL |
| `BINANCE_BASE_URL` | `string` | - | Optional override for region-specific endpoint |
| `BINANCE_RECV_WINDOW` | `number` | - | Optional order service tuning for receive window |
| `BINANCE_ORDER_TIMEOUT_MS` | `number` | - | Optional order service tuning for timeout in ms |
| `BINANCE_MAX_WEIGHT_PER_MINUTE` | `number` | - | Optional tuning for maximum API weight per minute |
| `BINANCE_PROXY_URL` | `string` | - | Optional outbound proxy when server IP is blocked by Binance |
| `BINANCE_CA_CERT_PATH` | `string` | - | Optional TLS settings for custom CA/proxy inspection |
| `BINANCE_TLS_INSECURE` | `boolean` | - | Optional TLS setting to bypass insecure certificates |
| `TWITTER_API_KEY` | `string` | - | Twitter API Key for social media analysis |
| `TWITTER_API_KEY_SECRET` | `string` | - | Twitter API Key Secret |
| `TWITTER_ACCESS_TOKEN` | `string` | - | Twitter Access Token |
| `TWITTER_ACCESS_TOKEN_SECRET` | `string` | - | Twitter Access Token Secret |
| `TWITTER_BEARER_TOKEN` | `string` | - | Twitter Bearer Token |
| `CHUTES_API_KEY` | `string` | - | Required for AI-powered news analysis and impact predictions via Chutes AI |

## Command Reference

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT © [RabTradebot Contributors](https://github.com/rab781/RabTradebot)
