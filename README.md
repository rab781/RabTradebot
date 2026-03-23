# RabTradebot (Advanced Crypto Trading Bot)

> A comprehensive Telegram bot that provides cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities using advanced AI and technical indicators.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Exists

Crypto traders struggle with context-switching between technical analysis tools, news sentiment platforms, and executing trades across different interfaces. RabTradebot consolidates complete market analysis—including multiple timeframes, AI-powered sentiment scoring, and automated backtesting—directly into a Telegram interface so you can analyze, simulate, and execute trades without leaving your chat window.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/crypto-signal-bot.git
cd crypto-signal-bot

# Install dependencies (pnpm is required)
pnpm install

# Set up environment variables
cp .env.example .env

# Start the bot
pnpm start
```

## Installation

**Prerequisites**: Node.js 20+, pnpm 9+

1. Create a Telegram Bot and get your token from [@BotFather](https://t.me/BotFather).
2. Clone the repository and install dependencies using `pnpm`:

```bash
git clone https://github.com/yourusername/crypto-signal-bot.git
cd crypto-signal-bot
pnpm install
```

3. Copy the example `.env` file and add your credentials:

```bash
cp .env.example .env
```

4. Edit the `.env` file. You must set at least `TELEGRAM_BOT_TOKEN`. (Binance, Twitter, and Chutes AI API keys are optional but unlock advanced features.)

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
DATABASE_URL="file:./prisma/dev.db"
# Optional:
# BINANCE_API_KEY=your_binance_api_key_here
# BINANCE_API_SECRET=your_binance_api_secret_here
# CHUTES_API_KEY=your_chutes_key
```

5. Initialize the database schema:

```bash
npx prisma generate
npx prisma db push
```

6. Start the bot:

```bash
pnpm start
```

## Usage

Interact with your bot via Telegram commands.

### Basic Example

To get a complete market analysis in one command, message your bot:

```
/analyze BTCUSDT
```

You receive a comprehensive analysis including:
- Technical indicators (RSI, MACD, Bollinger Bands, Moving Averages)
- Multi-timeframe trend analysis (1H, 4H, 1D)
- Backtesting results (30-day performance)
- Actionable recommendations (Entry price, Stop Loss, Take Profit)

### Trading Tools

| Command | Description | Example |
|---------|-------------|---------|
| `/signal` | Get a quick buy/sell trading signal | `/signal ETHUSDT` |
| `/backtest` | Test a strategy against historical data | `/backtest BTCUSDT 30` |
| `/papertrade` | Start a virtual trading simulation | `/papertrade SOLUSDT` |
| `/optimize` | Find optimal strategy parameters | `/optimize ADAUSDT 60` |
| `/portfolio` | View your current paper trading portfolio | `/portfolio` |

### Configuration

The bot relies on `.env` variables for setup. Key options include:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | *(Required)* | The token from @BotFather to run the bot. |
| `DATABASE_URL` | `string` | `file:./prisma/dev.db` | The connection string for the Prisma database. |
| `BINANCE_TESTNET` | `boolean` | `false` | Set to `true` for development and paper trading on Testnet. |
| `MAX_ACCOUNT_DRAWDOWN` | `number` | `0.15` | Maximum account drawdown (15%) before the circuit breaker stops trading. |
| `DEFAULT_RISK_PER_TRADE` | `number` | `0.01` | Default risk parameter (1%) for automated position sizing. |

### Advanced Usage

For comprehensive integration with Chutes AI (which provides AI-powered news analysis, sentiment scoring, and price predictions) or Twitter, see the dedicated guides:
- [Chutes AI Integration](CHUTES_SETUP.md)
- [Twitter Integration](TWITTER_SETUP.md)

## API Reference

The project uses modular services (`BinanceOrderService`, `PaperTradingEngine`, `RealTradingEngine`, etc.). Please refer to the inline JSDoc documentation or the `src/services/` directory for detailed references.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT © [Your Name](https://github.com/yourusername)
