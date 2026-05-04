# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides you with professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

As a retail trader, you often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. You spend too much time navigating fragmented platforms for technical indicators, news sentiment, and strategy backtesting. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single Telegram interface, saving you time and leveling your playing field without the cost of premium subscriptions.

## Quick Start

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install
cp .env.example .env

# Open .env and set TELEGRAM_BOT_TOKEN
npm run build
npm start
```

You open Telegram, find your bot, and send `/start`.

## Installation

**Prerequisites**: Node.js 20.19+, npm 9+, and a Telegram Bot Token (get it from [@BotFather](https://t.me/BotFather)).

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install
```

## Usage

You interact with the bot via Telegram commands.

### Basic Example

You get a complete market analysis for a specific pair by sending:

```
/analyze BTCUSDT
```

You receive:
- **Technical Analysis**: RSI, MACD, Bollinger Bands, Moving Averages
- **Multi-timeframe Analysis**: 1H, 4H, 1D trends
- **Backtesting Results**: 30-day strategy performance
- **Recommendations**: Entry/exit levels with reasoning

### Advanced Usage

You run complex trading workflows, including simulated trading and strategy optimization.

**Start a Paper Trading Session:**
```
/papertrade ETHUSDT
```
You start a virtual trading session with a $1000 simulated balance using real market data. You track it using `/portfolio`.

**Backtest a Strategy:**
```
/backtest SOLUSDT 30
```
You test the default strategy's performance over the last 30 days and receive the win rate, drawdown, and total profit.

**Optimize Strategy Parameters:**
```
/optimize ADAUSDT 60
```
You run optimization over a 60-day period to find the best parameters for maximum profit.

## Configuration

You configure the bot by editing the `.env` file.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | | **Required.** Your Telegram bot token from @BotFather. |
| `BINANCE_API_KEY` | `string` | | Required for live trading and better rate limits. |
| `BINANCE_API_SECRET` | `string` | | Required for live trading and better rate limits. |
| `CHUTES_API_KEY` | `string` | | Required for advanced AI-powered news analysis and price impact predictions. |
| `DATABASE_URL` | `string` | `file:./prisma/dev.db` | Development SQLite database URL or Production PostgreSQL URL. |
| `DATABASE_POOL_MAX` | `number` | `10` | PostgreSQL pool maximum connections. |
| `DATABASE_POOL_TIMEOUT_SEC` | `number` | `5` | PostgreSQL pool timeout in seconds. |
| `PGBOUNCER_ENABLED` | `boolean` | `false` | Enable PgBouncer for PostgreSQL. |
| `BINANCE_TESTNET` | `boolean` | `true` | Enable Binance Spot Testnet. |
| `BINANCE_TESTNET_URL` | `string` | `https://testnet.binance.vision` | Explicit Testnet URL. |
| `BINANCE_BASE_URL` | `string` | `https://api.binance.com` | Override for region-specific endpoint. |
| `BINANCE_RECV_WINDOW` | `number` | `5000` | Order service tuning: receive window. |
| `BINANCE_ORDER_TIMEOUT_MS` | `number` | `12000` | Order service tuning: order timeout in milliseconds. |
| `BINANCE_MAX_WEIGHT_PER_MINUTE` | `number` | `1200` | Order service tuning: max weight per minute. |
| `BINANCE_PROXY_URL` | `string` | | Outbound proxy when server IP is blocked by Binance. |
| `BINANCE_CA_CERT_PATH` | `string` | `/etc/ssl/certs/ca-certificates.crt` | TLS settings for environments with custom CA/proxy inspection. |
| `BINANCE_TLS_INSECURE` | `boolean` | `false` | Disable TLS certificate verification. |
| `TWITTER_API_KEY` | `string` | | Twitter API Key for social media analysis. |
| `TWITTER_API_KEY_SECRET` | `string` | | Twitter API Key Secret. |
| `TWITTER_ACCESS_TOKEN` | `string` | | Twitter Access Token. |
| `TWITTER_ACCESS_TOKEN_SECRET`| `string` | | Twitter Access Token Secret. |
| `TWITTER_BEARER_TOKEN` | `string` | | Twitter Bearer Token. |

> **Note**: The bot automatically falls back to the public Binance API if you do not provide private credentials.

## Telegram Command Reference

### Basic Analysis
- `/signal [symbol]` - You receive trading signals.
- `/volume [symbol]` - You analyze volume.
- `/sr [symbol]` - You identify support/resistance levels.
- `/chart [symbol]` - You generate interactive charts.

### Advanced Trading
- `/backtest [symbol] [days]` - You run strategy backtesting.
- `/papertrade [symbol]` - You start a paper trading simulation.
- `/portfolio` - You view your current positions and balance.
- `/performance` - You review detailed performance metrics.
- `/optimize [symbol] [days]` - You optimize strategy parameters.

### Data & Status
- `/download [symbol] [days]` - You download historical data.
- `/datainfo [symbol]` - You check data quality and summary.
- `/strategies` - You list available trading strategies.
- `/apistatus` - You check Binance API connectivity.

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

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
