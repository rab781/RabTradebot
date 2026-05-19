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

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | `string` | `-` | **Required.** Your Telegram bot token from @BotFather |
| `BINANCE_API_KEY` | `string` | `-` | Required for live trading and better rate limits |
| `BINANCE_API_SECRET` | `string` | `-` | Required for live trading and better rate limits |
| `CHUTES_API_KEY` | `string` | `-` | Required for AI-powered news analysis and impact predictions |

> **Note**: The bot automatically falls back to the public Binance API if private credentials are not provided.

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

## API Reference

The bot includes a web server to power real-time dashboards and monitoring. The API is served on the configured port.

### Authentication
Currently, the REST API endpoints are protected by CORS constraints (`CORS_ORIGIN`), which default to local loopback addresses if not explicitly configured.

### Rate Limiting
All `/api/*` endpoints are rate-limited per IP to prevent abuse.
- **Limit:** 100 requests per 1-minute window
- **Error Response:** `429 Too Many Requests`

### Error Handling
If an internal server error occurs, endpoints standardize their response with a `500` status and a JSON body:
```json
{
  "error": "An internal server error occurred"
}
```

### Endpoints

#### Dashboard Data
Retrieves overview data for the main dashboard.
- **GET** `/api/dashboard`
- **Response**: `200 OK` (JSON)

#### Trades History
Retrieves recent trades.
- **GET** `/api/trades`
- **Query Params**:
  - `limit` (number): Number of trades to return (default: `50`)
- **Response**: `200 OK` (JSON array of trades)

#### Open Trades
Retrieves currently open trades from the state manager.
- **GET** `/api/trades/open`
- **Response**: `200 OK` (JSON array of open trades)

#### Signals
Retrieves recent trading signals generated by the bot.
- **GET** `/api/signals`
- **Query Params**:
  - `limit` (number): Number of signals to return (default: `20`)
- **Response**: `200 OK` (JSON array of signals)

#### News Analysis
Retrieves recent AI-powered news analysis.
- **GET** `/api/news`
- **Query Params**:
  - `limit` (number): Number of news items to return (default: `20`)
- **Response**: `200 OK` (JSON array of news items)

#### Portfolio Status
Retrieves current simulated portfolio status (balance and positions).
- **GET** `/api/portfolio`
- **Response**: `200 OK` (JSON)

#### Bot Statistics
Retrieves internal bot metrics like total commands processed.
- **GET** `/api/stats`
- **Response**: `200 OK` (JSON)

#### API Health Check
Basic health check for the web server API.
- **GET** `/api/health`
- **Response**: `200 OK` (JSON indicating status and uptime)

#### External Monitoring Health
Comprehensive health metrics including memory usage and components status, suitable for external load balancers and system monitoring.
- **GET** `/health`
- **Response**: `200 OK` (if healthy) or `503 Service Unavailable` (if unhealthy). Returns JSON with snapshot data.

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
