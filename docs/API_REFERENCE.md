# Advanced Crypto Trading Bot API Reference

> REST API for real-time trading metrics, signals, and portfolio status.

## Overview

The Advanced Crypto Trading Bot exposes a public REST API under the `/api` route (default port 3000).
Additionally, there is a global `/health` endpoint for external monitoring.

## Authentication
This API does not require authentication headers.

## Rate Limiting
Requests to `/api` routes are globally limited to 100 requests per minute per IP. Rate limit responses return a 429 status code.

## Endpoints

### Get Dashboard Data
Returns all current dashboard data including trades, signals, news, portfolio, stats, and open trades.

**GET** `/api/dashboard`

**Example Request:**
```bash
curl http://localhost:3000/api/dashboard
```

**Response Schema:**
```json
{
  "trades": [],
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
    "uptime": 123456,
    "totalCommands": 0,
    "activeUsers": 0,
    "lastUpdate": "2023-10-27T10:00:00.000Z"
  },
  "openTrades": []
}
```

### Get Trades
Retrieve the latest trades.

**GET** `/api/trades`

**Query Parameters:**
- `limit` (optional, type: integer): Number of trades to return (default: 50)

**Example Request:**
```bash
curl "http://localhost:3000/api/trades?limit=5"
```

**Response Schema (Array of Trades):**
```json
[
  {
    "id": "trade-123",
    "symbol": "BTC/USDT",
    "action": "BUY",
    "price": 30000,
    "quantity": 0.1,
    "timestamp": "2023-10-27T10:00:00.000Z",
    "profit": 150.5,
    "status": "CLOSED"
  }
]
```

### Get Open Trades
Retrieve currently open trades.

**GET** `/api/trades/open`

**Example Request:**
```bash
curl http://localhost:3000/api/trades/open
```

**Response Schema (Array of Trades):**
```json
[
  {
    "id": "trade-124",
    "symbol": "ETH/USDT",
    "action": "BUY",
    "price": 1800,
    "quantity": 1.5,
    "timestamp": "2023-10-27T10:05:00.000Z",
    "status": "OPEN"
  }
]
```

### Get Signals
Retrieve the latest trading signals.

**GET** `/api/signals`

**Query Parameters:**
- `limit` (optional, type: integer): Number of signals to return (default: 20)

**Example Request:**
```bash
curl "http://localhost:3000/api/signals?limit=2"
```

**Response Schema (Array of Signals):**
```json
[
  {
    "symbol": "BTC/USDT",
    "action": "BUY",
    "price": 30000,
    "confidence": 0.85,
    "timestamp": "2023-10-27T10:00:00.000Z",
    "indicators": {
      "rsi": 35.5,
      "macd": {
        "value": 150.2,
        "signal": 140.5
      },
      "bbands": {
        "upper": 31000,
        "middle": 30500,
        "lower": 29000
      }
    }
  }
]
```

### Get News
Retrieve the latest news items affecting trading.

**GET** `/api/news`

**Query Parameters:**
- `limit` (optional, type: integer): Number of news items to return (default: 20)

**Example Request:**
```bash
curl "http://localhost:3000/api/news?limit=2"
```

**Response Schema (Array of News Items):**
```json
[
  {
    "symbol": "BTC",
    "title": "Bitcoin reaches new ATH",
    "sentiment": "BULLISH",
    "impact": "HIGH",
    "timestamp": "2023-10-27T10:00:00.000Z"
  }
]
```

### Get Portfolio
Retrieve the current portfolio state and performance metrics.

**GET** `/api/portfolio`

**Example Request:**
```bash
curl http://localhost:3000/api/portfolio
```

**Response Schema:**
```json
{
  "totalValue": 10500,
  "positions": [
    {
      "symbol": "BTC/USDT",
      "quantity": 0.1,
      "averagePrice": 30000,
      "currentPrice": 31000,
      "pnl": 100,
      "pnlPercentage": 3.33
    }
  ],
  "performance": {
    "totalPnl": 500,
    "totalPnlPercentage": 5,
    "winRate": 0.75,
    "totalTrades": 20
  }
}
```

### Get Stats
Retrieve bot statistics including uptime and activity.

**GET** `/api/stats`

**Example Request:**
```bash
curl http://localhost:3000/api/stats
```

**Response Schema:**
```json
{
  "uptime": 3600000,
  "totalCommands": 150,
  "activeUsers": 5,
  "lastUpdate": "2023-10-27T10:00:00.000Z"
}
```

### Get API Health
Check the health status of the web server API.

**GET** `/api/health`

**Example Request:**
```bash
curl http://localhost:3000/api/health
```

**Response Schema:**
```json
{
  "status": "OK",
  "timestamp": "2023-10-27T10:00:00.000Z",
  "uptime": 3600
}
```

### Get Global Health
External monitoring endpoint for overall system health. Includes component statuses.

**GET** `/health`

**Example Request:**
```bash
curl http://localhost:3000/health
```

**Response Schema:**
```json
{
  "status": "ok",
  "timestamp": "2023-10-27T10:00:00.000Z",
  "uptime": 3600,
  "memoryUsageMb": 150.5,
  "requestCount": 150,
  "components": {}
}
```

## Error Handling
In case of an internal error (500), the API returns a standard JSON error response:

```json
{
  "error": "An internal server error occurred"
}
```

For rate limit violations (429):
```json
{
  "error": "Too many requests, please try again later."
}
```
