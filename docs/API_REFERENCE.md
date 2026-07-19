# Advanced Crypto Trading Bot - API Reference

The REST API provides programmatic access to bot state, trades, signals, news, and portfolio data.

## Base URL
All API requests are relative to `http://localhost:<PORT>` (typically port 3000).

## Authentication
Currently, the REST API does not require authentication. All endpoints are accessible without API keys or Bearer tokens.

## Rate Limiting
Requests are limited to **100 requests per minute per IP address**.
When the rate limit is exceeded, the API responds with an HTTP 429 status code.

```json
// 429 Too Many Requests
{
  "error": "Too many requests, please try again later."
}
```

## Pagination
List endpoints support pagination via the `limit` query parameter.
- Trades default limit: `50`
- Signals and News default limit: `20`

## Error Handling
General server errors will result in an HTTP 500 response:
```json
{
  "error": "An internal server error occurred"
}
```

---

## Endpoints

### Get Dashboard Data
Retrieves an aggregated summary of the bot state, including trades, signals, news, portfolio, and stats.

**Endpoint:** `GET /api/dashboard`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/dashboard
```

**Response:**
```json
{
  "trades": [
    {
      "id": "trade_123",
      "symbol": "BTCUSDT",
      "action": "BUY",
      "price": 60000,
      "quantity": 0.1,
      "timestamp": "2023-10-27T10:00:00.000Z",
      "status": "CLOSED",
      "profit": 50
    }
  ],
  "signals": [
    {
      "symbol": "ETHUSDT",
      "action": "BUY",
      "price": 3000,
      "confidence": 0.85,
      "timestamp": "2023-10-27T10:05:00.000Z",
      "indicators": {
        "rsi": 30,
        "macd": { "value": 1.5, "signal": 1.0 },
        "bbands": { "upper": 3100, "middle": 3000, "lower": 2900 }
      }
    }
  ],
  "news": [
    {
      "symbol": "BTCUSDT",
      "title": "Bitcoin Surges on ETF Approval Hopes",
      "sentiment": "BULLISH",
      "impact": "HIGH",
      "timestamp": "2023-10-27T09:00:00.000Z"
    }
  ],
  "portfolio": {
    "totalValue": 10050,
    "positions": [
      {
        "symbol": "ETHUSDT",
        "quantity": 1,
        "averagePrice": 2950,
        "currentPrice": 3000,
        "pnl": 50,
        "pnlPercentage": 1.69
      }
    ],
    "performance": {
      "totalPnl": 50,
      "totalPnlPercentage": 0.5,
      "winRate": 1,
      "totalTrades": 1
    }
  },
  "stats": {
    "uptime": 3600000,
    "totalCommands": 15,
    "activeUsers": 2,
    "lastUpdate": "2023-10-27T10:10:00.000Z"
  },
  "openTrades": []
}
```

### Get Trades
Retrieves a list of recent trades.

**Endpoint:** `GET /api/trades`

**Query Parameters:**
- `limit` (optional, integer): Maximum number of trades to return. Defaults to 50.

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/trades?limit=10"
```

**Response:**
```json
[
  {
    "id": "trade_124",
    "symbol": "SOLUSDT",
    "action": "SELL",
    "price": 100,
    "quantity": 5,
    "timestamp": "2023-10-27T11:00:00.000Z",
    "status": "CLOSED",
    "profit": 20
  }
]
```

### Get Open Trades
Retrieves a list of trades that are currently open.

**Endpoint:** `GET /api/trades/open`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/trades/open
```

**Response:**
```json
[
  {
    "id": "trade_125",
    "symbol": "DOGEUSDT",
    "action": "BUY",
    "price": 0.15,
    "quantity": 1000,
    "timestamp": "2023-10-27T12:00:00.000Z",
    "status": "OPEN"
  }
]
```

### Get Signals
Retrieves recent trading signals.

**Endpoint:** `GET /api/signals`

**Query Parameters:**
- `limit` (optional, integer): Maximum number of signals to return. Defaults to 20.

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/signals?limit=5"
```

**Response:**
```json
[
  {
    "symbol": "LINKUSDT",
    "action": "HOLD",
    "price": 15,
    "confidence": 0.5,
    "timestamp": "2023-10-27T13:00:00.000Z",
    "indicators": {
      "rsi": 50,
      "macd": { "value": 0, "signal": 0 },
      "bbands": { "upper": 16, "middle": 15, "lower": 14 }
    }
  }
]
```

### Get News
Retrieves recent news items that may impact trading.

**Endpoint:** `GET /api/news`

**Query Parameters:**
- `limit` (optional, integer): Maximum number of news items to return. Defaults to 20.

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/news?limit=2"
```

**Response:**
```json
[
  {
    "symbol": "XRPUSDT",
    "title": "Regulatory Update Causes Market Fluctuation",
    "sentiment": "NEUTRAL",
    "impact": "MEDIUM",
    "timestamp": "2023-10-27T14:00:00.000Z"
  }
]
```

### Get Portfolio
Retrieves current portfolio value and performance metrics.

**Endpoint:** `GET /api/portfolio`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/portfolio
```

**Response:**
```json
{
  "totalValue": 10050,
  "positions": [
    {
      "symbol": "ETHUSDT",
      "quantity": 1,
      "averagePrice": 2950,
      "currentPrice": 3000,
      "pnl": 50,
      "pnlPercentage": 1.69
    }
  ],
  "performance": {
    "totalPnl": 50,
    "totalPnlPercentage": 0.5,
    "winRate": 1,
    "totalTrades": 1
  }
}
```

### Get Bot Stats
Retrieves bot performance and usage statistics.

**Endpoint:** `GET /api/stats`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/stats
```

**Response:**
```json
{
  "uptime": 7200000,
  "totalCommands": 20,
  "activeUsers": 3,
  "lastUpdate": "2023-10-27T15:00:00.000Z"
}
```

### Internal Health Check
Returns a simple HTTP 200 OK with timestamp for the web server API status.

**Endpoint:** `GET /api/health`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/health
```

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2023-10-27T16:00:00.000Z",
  "uptime": 7200
}
```

### External Health Monitor
Provides detailed system health, component statuses, and metrics. Used for external monitoring tools. Returns HTTP 503 if overall status is down.

**Endpoint:** `GET /health`

**Example Request:**
```bash
curl -X GET http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1698422700000,
  "overallStatus": "ok",
  "uptime": 7500,
  "memoryUsageMb": 120.5,
  "requestCount": 20,
  "components": {
    "database": {
      "status": "ok",
      "lastCheck": 1698422700000,
      "message": "Connected"
    },
    "binanceRest": {
      "status": "ok",
      "lastCheck": 1698422700000,
      "message": "Connected"
    },
    "binanceWs": {
      "status": "ok",
      "lastCheck": 1698422700000,
      "message": "Connected"
    },
    "modelAccuracy": {
      "status": "ok",
      "lastCheck": 1698422700000,
      "message": "Model accuracy: 75.0%",
      "details": {
        "accuracy": 0.75
      }
    },
    "accountDrawdown": {
      "status": "ok",
      "lastCheck": 1698422700000,
      "message": "Drawdown: 5.00%",
      "details": {
        "drawdown": 5
      }
    },
    "accountBalance": {
      "status": "ok",
      "lastCheck": 1698422700000,
      "message": "Balance: $1000.00",
      "details": {
        "balance": 1000
      }
    },
    "botProcess": {
      "status": "ok",
      "lastCheck": 1698422700000,
      "message": "Running (7500.0s, 120MB)",
      "details": {
        "uptime": 7500,
        "memory": 120
      }
    }
  }
}
```
