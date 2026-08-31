# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Retail traders often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. Navigating multiple platforms for technical indicators, news sentiment, and strategy backtesting is time-consuming and fragmented. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single, accessible Telegram interface—leveling the playing field without the cost of premium subscriptions.

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

First, clone the repository:
```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
```

Next, install the dependencies:
```bash
npm install
```

## Usage

You interact with the bot via Telegram commands.

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
*You start a virtual trading session with a $1000 simulated balance using real market data. You track it using `/portfolio`.*

**Backtest a Strategy:**
```
/backtest SOLUSDT 30
```
*You test the default strategy's performance over the last 30 days and receive win rate, drawdown, and total profit.*

**Optimize Strategy Parameters:**
```
/optimize ADAUSDT 60
```
*You run optimization over a 60-day period to find the best parameters for maximum profit.*

## Configuration

You configure the bot by editing the `.env` file in the project root.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | `""` | **Required.** Your Telegram bot token from @BotFather. |
| `BINANCE_API_KEY` | `string` | `""` | Required for live trading and better rate limits. |
| `BINANCE_API_SECRET` | `string` | `""` | Required for live trading and better rate limits. |
| `CHUTES_API_KEY` | `string` | `""` | Required for AI-powered news analysis and impact predictions. |

> **Note**: The bot automatically falls back to the public Binance API if you do not provide private credentials.

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

## Architecture & Tech Stack

- **Language**: TypeScript
- **Bot Framework**: Telegraf
- **Database**: Prisma ORM with SQLite
- **Market Data**: Binance REST & WebSocket APIs
- **AI/ML**: TensorFlow.js (GRU models), Chutes AI (News Sentiment)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project uses the MIT License - see the [LICENSE](LICENSE) file for details.