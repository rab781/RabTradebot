# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Retail traders often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. Navigating multiple platforms for technical indicators, news sentiment, and strategy backtesting is time-consuming and fragmented. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single, accessible Telegram interface—leveling the playing field without the cost of premium subscriptions.

## Quick Start

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install

cp .env.example .env
# Edit .env and set TELEGRAM_BOT_TOKEN=your_token_here

npm run build
npm start
```

## Installation

**Prerequisites**: Node.js 20.19+, npm 9+, and a Telegram Bot Token (from [@BotFather](https://t.me/BotFather)).

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install
```

## Usage

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

### Configuration

Configure the bot by editing the `.env` file.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `DATABASE_URL` | `string` | `"file:./prisma/dev.db"` | Database connection string. Use SQLite for dev, PostgreSQL for production. |
| `DATABASE_POOL_MAX` | `number` | `10` | PostgreSQL connection pool maximum size |
| `DATABASE_POOL_TIMEOUT_SEC` | `number` | `5` | PostgreSQL connection pool timeout |
| `PGBOUNCER_ENABLED` | `boolean` | `true` | Enable PgBouncer compatibility |
| `SQLITE_DATABASE_URL` | `string` | `"file:./prisma/dev.db"` | Source SQLite DB for migration |
| `POSTGRES_DATABASE_URL` | `string` | `""` | Target PostgreSQL DB for migration |
| `MIGRATION_DRY_RUN` | `boolean` | `true` | Run migration in dry-run mode |
| `MIGRATION_TRUNCATE_TARGET` | `boolean` | `false` | Truncate target PostgreSQL tables before migration |
| `MIGRATION_BATCH_SIZE` | `number` | `500` | Batch size for migration inserts |
| `TELEGRAM_BOT_TOKEN` | `string` | `""` | **Required.** Your Telegram bot token from @BotFather |
| `BINANCE_API_KEY` | `string` | `""` | Binance API key for live trading and better rate limits |
| `BINANCE_API_SECRET` | `string` | `""` | Binance API secret for live trading and better rate limits |
| `BINANCE_TESTNET` | `boolean` | `true` | Enable Binance Spot Testnet (recommended for development) |
| `BINANCE_TESTNET_URL` | `string` | `"https://testnet.binance.vision"` | Explicit Testnet URL |
| `BINANCE_BASE_URL` | `string` | `"https://api.binance.com"` | Override for region-specific Binance endpoint |
| `BINANCE_RECV_WINDOW` | `number` | `5000` | Order service tuning receive window |
| `BINANCE_ORDER_TIMEOUT_MS` | `number` | `12000` | Order service tuning timeout |
| `BINANCE_MAX_WEIGHT_PER_MINUTE`| `number` | `1200` | Max weight per minute for Binance API |
| `BINANCE_PROXY_URL` | `string` | `""` | Outbound proxy when server IP is blocked by Binance |
| `BINANCE_CA_CERT_PATH` | `string` | `""` | TLS settings for environments with custom CA/proxy inspection |
| `BINANCE_TLS_INSECURE` | `boolean` | `false` | Ignore TLS cert verification errors |
| `TWITTER_API_KEY` | `string` | `""` | Twitter API key |
| `TWITTER_API_KEY_SECRET` | `string` | `""` | Twitter API key secret |
| `TWITTER_ACCESS_TOKEN` | `string` | `""` | Twitter Access token |
| `TWITTER_ACCESS_TOKEN_SECRET` | `string` | `""` | Twitter Access token secret |
| `TWITTER_BEARER_TOKEN` | `string` | `""` | Twitter Bearer token |
| `CHUTES_API_KEY` | `string` | `""` | Chutes AI API key for advanced news analysis |

> **Note**: The bot automatically falls back to the public Binance API if private credentials are not provided.

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