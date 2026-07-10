# REST API Reference

> Complete API reference for the Advanced Crypto Trading Bot, providing real-time access to dashboard stats, trades, signals, and portfolio data.

## Base URL
All API requests should be prefixed with the server's base URL and port (default is `http://localhost:3000`).
```
http://localhost:3000/api
```

## Authentication
Currently, the REST API endpoints are public and do not require authentication headers.

## Rate Limiting
Requests are limited to **100 requests per minute** per IP address.
If the limit is exceeded, the server responds with a `429 Too Many Requests` status and the following JSON payload:
```json
{
  "error": "Too many requests, please try again later."
}
```

## Pagination
Endpoints returning lists of items (e.g., Trades, Signals, News) support a `limit` query parameter.
Example: `GET /api/trades?limit=10`

## Endpoints

### 1. Get Dashboard Data
Returns an aggregated view of all bot data including trades, signals, news, portfolio, and stats.

- **URL:** `/api/dashboard`
- **Method:** `GET`
- **Success Response:** `200 OK`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/dashboard
```

**Example Response:**
```json
{
  "trades": [
    {
      "id": "trade_123",
      "symbol": "BTCUSDT",
      "action": "BUY",
      "price": 45000,
      "quantity": 0.1,
      "timestamp": "2023-10-27T10:00:00.000Z",
      "profit": 0,
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
    "uptime": 120000,
    "totalCommands": 5,
    "activeUsers": 1,
    "lastUpdate": "2023-10-27T10:05:00.000Z"
  },
  "openTrades": []
}
```

### 2. Get Trades
Retrieves recent trades.

- **URL:** `/api/trades`
- **Method:** `GET`
- **Query Parameters:** `limit` (default: 50)
- **Success Response:** `200 OK`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/trades?limit=5
```

**Example Response:**
```json
[
  {
    "id": "trade_123",
    "symbol": "BTCUSDT",
    "action": "BUY",
    "price": 45000,
    "quantity": 0.1,
    "timestamp": "2023-10-27T10:00:00.000Z",
    "status": "OPEN"
  }
]
```

### 3. Get Open Trades
Retrieves all currently open trades.

- **URL:** `/api/trades/open`
- **Method:** `GET`
- **Success Response:** `200 OK`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/trades/open
```

**Example Response:**
```json
[
  {
    "id": "trade_123",
    "symbol": "BTCUSDT",
    "action": "BUY",
    "price": 45000,
    "quantity": 0.1,
    "timestamp": "2023-10-27T10:00:00.000Z",
    "status": "OPEN"
  }
]
```

### 4. Get Signals
Retrieves recent trading signals.

- **URL:** `/api/signals`
- **Method:** `GET`
- **Query Parameters:** `limit` (default: 20)
- **Success Response:** `200 OK`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/signals?limit=5
```

**Example Response:**
```json
[
  {
    "symbol": "BTCUSDT",
    "action": "BUY",
    "price": 44500,
    "confidence": 0.85,
    "timestamp": "2023-10-27T09:55:00.000Z",
    "indicators": {
      "rsi": 35,
      "macd": { "value": 1.5, "signal": 1.0 },
      "bbands": { "upper": 46000, "middle": 45000, "lower": 44000 }
    }
  }
]
```

### 5. Get News
Retrieves recent news items impacting the market.

- **URL:** `/api/news`
- **Method:** `GET`
- **Query Parameters:** `limit` (default: 20)
- **Success Response:** `200 OK`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/news?limit=2
```

**Example Response:**
```json
[
  {
    "symbol": "BTC",
    "title": "Bitcoin Surges Past 45k",
    "sentiment": "BULLISH",
    "impact": "HIGH",
    "timestamp": "2023-10-27T08:00:00.000Z"
  }
]
```

### 6. Get Portfolio
Retrieves current portfolio value and performance metrics.

- **URL:** `/api/portfolio`
- **Method:** `GET`
- **Success Response:** `200 OK`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/portfolio
```

**Example Response:**
```json
{
  "totalValue": 10500,
  "positions": [
    {
      "symbol": "BTCUSDT",
      "quantity": 0.1,
      "averagePrice": 40000,
      "currentPrice": 45000,
      "pnl": 500,
      "pnlPercentage": 12.5
    }
  ],
  "performance": {
    "totalPnl": 500,
    "totalPnlPercentage": 5.0,
    "winRate": 0.75,
    "totalTrades": 20
  }
}
```

### 7. Get Bot Stats
Retrieves operational statistics for the bot.

- **URL:** `/api/stats`
- **Method:** `GET`
- **Success Response:** `200 OK`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/stats
```

**Example Response:**
```json
{
  "uptime": 3600000,
  "totalCommands": 150,
  "activeUsers": 5,
  "lastUpdate": "2023-10-27T10:15:00.000Z"
}
```

### 8. System Health
External monitoring endpoint for service health. Note this endpoint is not prefixed with `/api`.

- **URL:** `/health`
- **Method:** `GET`
- **Success Response:** `200 OK` (or `503 Service Unavailable` if down)

**Example Request:**
```bash
curl -X GET http://localhost:3000/health
```

**Example Response:**
```json
{
  "status": "ok",
  "timestamp": "2023-10-27T10:15:00.000Z",
  "uptime": 3600,
  "memoryUsageMb": 150.5,
  "requestCount": 150,
  "components": {
    "database": {
      "status": "ok",
      "lastCheck": 1698401700000,
      "message": "Connected"
    },
    "binanceRest": {
      "status": "ok",
      "lastCheck": 1698401700000,
      "message": "API responding normally"
    },
    "binanceWs": {
      "status": "ok",
      "lastCheck": 1698401700000,
      "message": "WebSocket healthy"
    },
    "modelAccuracy": {
      "status": "ok",
      "lastCheck": 1698401700000,
      "message": "Model accuracy: 80.0%"
    },
    "accountDrawdown": {
      "status": "ok",
      "lastCheck": 1698401700000,
      "message": "Drawdown: 2.5%"
    },
    "accountBalance": {
      "status": "ok",
      "lastCheck": 1698401700000,
      "message": "Balance: $10500"
    },
    "botProcess": {
      "status": "ok",
      "lastCheck": 1698401700000,
      "message": "Running"
    }
  }
}
```

## Error Handling
Internal server errors return a `500 Internal Server Error` status with the following structure:
```json
{
  "error": "An internal server error occurred"
}
```
