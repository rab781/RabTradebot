# RabTradebot

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

## Configuration

Configure the bot by editing the `.env` file.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | **Yes** | Your Telegram bot token from @BotFather |
| `BINANCE_API_KEY` | `string` | No | Required for live trading and better rate limits |
| `BINANCE_API_SECRET` | `string` | No | Required for live trading and better rate limits |
| `CHUTES_API_KEY` | `string` | No | Required for AI-powered news analysis and impact predictions |

> **Note**: The bot automatically falls back to the public Binance API if private credentials are not provided.

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

## Usage

Interact with the bot via Telegram commands.

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

## Architecture & Tech Stack

- **Language**: TypeScript
- **Bot Framework**: Telegraf
- **Database**: Prisma ORM with SQLite
- **Market Data**: Binance REST & WebSocket APIs
- **AI/ML**: TensorFlow.js (GRU models), Chutes AI (News Sentiment)



## API Reference

The RabTradebot includes a REST API providing real-time state management and data access via the built-in web server (default port 3000).

### Authentication
Currently, the REST API does not require authentication and is intended for local or trusted network access.

### Rate Limiting
Requests are rate-limited to 100 requests per minute per IP address. Exceeding this limit returns a `429 Too Many Requests` response.

### Pagination
Endpoints returning lists (`/api/trades`, `/api/signals`, `/api/news`) support pagination via the `limit` query parameter.
*   `/api/trades` defaults to 50 items.
*   `/api/signals` defaults to 20 items.
*   `/api/news` defaults to 20 items.

### Endpoints

#### `GET /api/dashboard`
Retrieve overall dashboard data.

**Example Request:**
```bash
curl http://localhost:3000/api/dashboard
```

**Example Response:**
```json
{
  "trades": [
    {
      "id": "1",
      "symbol": "BTCUSDT",
      "action": "BUY",
      "price": 60000,
      "quantity": 0.01,
      "timestamp": "2023-10-27T10:00:00.000Z",
      "status": "OPEN"
    }
  ],
  "signals": [],
  "news": [],
  "portfolio": {
    "totalValue": 10000,
    "positions": [],
    "performance": {
      "totalPnl": 0,
      "totalPnlPercentage": 0,
      "winRate": 0,
      "totalTrades": 0
    }
  },
  "stats": {
    "uptime": 3600,
    "totalCommands": 150,
    "activeUsers": 5,
    "lastUpdate": "2023-10-27T10:00:00.000Z"
  },
  "openTrades": []
}
```

#### `GET /api/trades`
Retrieve a list of trades.
*Query Parameters:*
*   `limit` (optional): Number of trades to return (default: 50).

**Example Request:**
```bash
curl "http://localhost:3000/api/trades?limit=2"
```

**Example Response:**
```json
[
  {
    "id": "1",
    "symbol": "BTCUSDT",
    "action": "BUY",
    "price": 60000,
    "quantity": 0.01,
    "timestamp": "2023-10-27T10:00:00.000Z",
    "profit": 150.0,
    "status": "CLOSED"
  }
]
```

#### `GET /api/trades/open`
Retrieve currently open trades.

**Example Request:**
```bash
curl http://localhost:3000/api/trades/open
```

**Example Response:**
```json
[
  {
    "id": "2",
    "symbol": "ETHUSDT",
    "action": "SELL",
    "price": 3000,
    "quantity": 1.0,
    "timestamp": "2023-10-27T10:00:00.000Z",
    "status": "OPEN"
  }
]
```

#### `GET /api/signals`
Retrieve trading signals.
*Query Parameters:*
*   `limit` (optional): Number of signals to return (default: 20).

**Example Request:**
```bash
curl "http://localhost:3000/api/signals?limit=1"
```

**Example Response:**
```json
[
  {
    "symbol": "SOLUSDT",
    "action": "BUY",
    "price": 100,
    "confidence": 0.85,
    "timestamp": "2023-10-27T10:00:00.000Z",
    "indicators": {
      "rsi": 30
    }
  }
]
```

#### `GET /api/news`
Retrieve news items.
*Query Parameters:*
*   `limit` (optional): Number of news items to return (default: 20).

**Example Request:**
```bash
curl "http://localhost:3000/api/news?limit=1"
```

**Example Response:**
```json
[
  {
    "symbol": "BTC",
    "title": "Crypto Market Surges",
    "sentiment": "BULLISH",
    "impact": "HIGH",
    "timestamp": "2023-10-27T10:00:00.000Z"
  }
]
```

#### `GET /api/portfolio`
Retrieve portfolio information.

**Example Request:**
```bash
curl http://localhost:3000/api/portfolio
```

**Example Response:**
```json
{
  "totalValue": 10000,
  "positions": [],
  "performance": {
    "totalPnl": 0,
    "totalPnlPercentage": 0,
    "winRate": 0,
    "totalTrades": 0
  }
}
```

#### `GET /api/stats`
Retrieve bot statistics.

**Example Request:**
```bash
curl http://localhost:3000/api/stats
```

**Example Response:**
```json
{
  "uptime": 3600,
  "totalCommands": 150,
  "activeUsers": 5,
  "lastUpdate": "2023-10-27T10:00:00.000Z"
}
```

#### `GET /api/health`
Internal health check endpoint.

**Example Request:**
```bash
curl http://localhost:3000/api/health
```

**Example Response:**
```json
{
  "status": "OK",
  "timestamp": "2023-10-27T10:00:00.000Z",
  "uptime": 3600
}
```

#### `GET /health`
External monitoring health check.

**Example Request:**
```bash
curl http://localhost:3000/health
```

**Example Response:**
```json
{
  "status": "ok",
  "timestamp": "2023-10-27T10:00:00.000Z",
  "uptime": 3600,
  "memoryUsageMb": 150.5,
  "requestCount": 150,
  "components": {
     "database": "ok",
     "binanceRest": "ok"
  }
}
```

#### Errors
Example 429 Error Response (Rate Limit Exceeded):
```json
{
  "error": "Too many requests, please try again later."
}
```
Example 500 Error Response (Internal Server Error):
```json
{
  "error": "An internal server error occurred"
}
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
