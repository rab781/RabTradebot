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

npx prisma generate
npx prisma migrate dev

npm run build
npm start
```

## Installation

**Prerequisites**: Node.js 18+, npm 9+, and a Telegram Bot Token (get it from [@BotFather](https://t.me/BotFather))

```bash
# 1. Clone the repository
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot

# 2. Install dependencies
npm install

# 3. Configure your environment
cp .env.example .env
# Open .env and add your TELEGRAM_BOT_TOKEN

# 4. Set up the database
npx prisma generate
npx prisma migrate dev

# 5. Build the project
npm run build
```

> **Tip**: If `npm install` halts or warns about unbuilt dependencies, run `pnpm approve-builds` to explicitly authorize and execute their post-install scripts.

## Usage

### Basic Example

Interact with the bot via Telegram commands. To get a complete market analysis for a specific pair:

```text
/analyze BTCUSDT
```

The bot returns:
- **Technical Analysis**: RSI, MACD, Bollinger Bands, Moving Averages
- **Multi-timeframe Analysis**: 1H, 4H, 1D trends
- **Backtesting Results**: 30-day strategy performance
- **Recommendations**: Entry/exit levels with reasoning

### Configuration

You configure the bot by editing the `.env` file.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | **Yes** | Your Telegram bot token from @BotFather |
| `BINANCE_API_KEY` | `string` | No | Required for live trading and better rate limits |
| `BINANCE_API_SECRET` | `string` | No | Required for live trading and better rate limits |
| `CHUTES_API_KEY` | `string` | No | Required for AI-powered news analysis and impact predictions |

> **Note**: The bot automatically falls back to the public Binance API if you do not provide private credentials.

### Advanced Usage

You can use the bot for complex trading workflows, including simulated trading and strategy optimization.

**Start a Paper Trading Session:**
```text
/papertrade ETHUSDT
```
This starts a virtual trading session with a $1000 simulated balance using real market data. Track your progress using the `/portfolio` command.

**Optimize Strategy Parameters:**
```text
/optimize ADAUSDT 60
```
This runs an optimization over a 60-day period to find the best parameters for maximum profit.

## Command Reference

### Basic Analysis
- `/signal [symbol]` - Retrieve trading signals
- `/volume [symbol]` - Analyze market volume
- `/sr [symbol]` - Identify support and resistance levels
- `/chart [symbol]` - Generate interactive price charts

### Advanced Trading
- `/backtest [symbol] [days]` - Run strategy backtesting
- `/papertrade [symbol]` - Start paper trading simulation
- `/portfolio` - View current positions and simulated balance
- `/performance` - Check detailed performance metrics
- `/optimize [symbol] [days]` - Optimize strategy parameters

### Data & Status
- `/download [symbol] [days]` - Download historical market data
- `/datainfo [symbol]` - Check data quality and summary
- `/strategies` - List available trading strategies
- `/apistatus` - Check Binance API connectivity

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT © [Advanced Crypto Trading Bot Contributors](https://github.com/rab781/RabTradebot)
