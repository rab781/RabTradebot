# Advanced Crypto Trading Bot

> A comprehensive Telegram bot that provides professional-grade cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities directly in your chat.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Retail traders often lack access to the institutional-grade tools necessary to make data-driven decisions in volatile crypto markets. You waste time navigating multiple platforms for technical indicators, news sentiment, and strategy backtesting. This bot consolidates multi-timeframe analysis, AI-powered news sentiment (via Chutes AI), and risk management into a single, accessible Telegram interface—leveling the playing field for you without the cost of premium subscriptions.

## Quick Start

You can get the bot up and running in under 2 minutes.

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install
cp .env.example .env

# Edit .env and set TELEGRAM_BOT_TOKEN
# Initialize the database
npx prisma generate
npx prisma migrate dev

npm run build
npm start
```

## Installation

**Prerequisites**:
- Node.js 18+
- npm 9+
- A Telegram Bot Token (get it from [@BotFather](https://t.me/BotFather))

Clone the repository and install dependencies:

```bash
git clone https://github.com/rab781/RabTradebot.git
cd RabTradebot
npm install
```

Set up your environment variables:

```bash
cp .env.example .env
```

Initialize the database:

```bash
npx prisma generate
npx prisma migrate dev
```

Build the application:

```bash
npm run build
```

Start the bot:

```bash
npm start
```

## Usage

You interact with the bot via Telegram commands. Once the bot is running, open Telegram, find your bot, and send `/start`.

### Basic Example

Get a complete market analysis for a specific pair:

```
/analyze BTCUSDT
```

This command returns:
- **Technical Analysis**: RSI, MACD, Bollinger Bands, Moving Averages
- **Multi-timeframe Analysis**: 1H, 4H, 1D trends
- **Backtesting Results**: 30-day strategy performance
- **Recommendations**: Entry/exit levels with reasoning

### Advanced Usage

You can use the bot for complex trading workflows, including simulated trading and strategy optimization.

Start a virtual trading session with a $1000 simulated balance using real market data:

```
/papertrade ETHUSDT
```

Test the default strategy's performance over the last 30 days to see win rate, drawdown, and total profit:

```
/backtest SOLUSDT 30
```

Run optimization over a 60-day period to find the best parameters for maximum profit:

```
/optimize ADAUSDT 60
```

## Configuration

You configure the bot by editing the `.env` file. The bot automatically falls back to the public Binance API if you do not provide private credentials.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | `""` | Your Telegram bot token from @BotFather (Required) |
| `BINANCE_API_KEY` | `string` | `""` | Binance API key for live trading and higher limits |
| `BINANCE_API_SECRET` | `string` | `""` | Binance API secret for live trading and higher limits |
| `CHUTES_API_KEY` | `string` | `""` | Chutes AI API key for news analysis and impact predictions |

## Command Reference

### Basic Analysis
- `/signal [symbol]` - Get trading signals
- `/volume [symbol]` - View volume analysis
- `/sr [symbol]` - Find support and resistance levels
- `/chart [symbol]` - Generate interactive charts

### Advanced Trading
- `/backtest [symbol] [days]` - Run strategy backtesting
- `/papertrade [symbol]` - Start a paper trading simulation
- `/portfolio` - View your current positions and balance
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
- **Database**: Prisma ORM with SQLite
- **Market Data**: Binance REST & WebSocket APIs
- **AI/ML**: TensorFlow.js (GRU models), Chutes AI (News Sentiment)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
