# Advanced Crypto Trading Bot API Reference

The Advanced Crypto Trading Bot Web Dashboard API provides access to real-time trading data, signals, and portfolio status.

## Authentication
This REST API currently runs without authentication by default. Access should be restricted at the network level (e.g., firewall, CORS, or private VPC).

## Rate Limiting
Requests are limited to 100 requests per minute per IP address. Exceeding this limit will result in a `429 Too Many Requests` response.

## Pagination
Endpoints returning lists (such as `/api/trades`, `/api/signals`, and `/api/news`) support a `limit` query parameter.
- Default for `/api/trades`: 50
- Default for `/api/signals` and `/api/news`: 20

## Error Handling
Standard error responses return a JSON object with an `error` key.
```json
{
  "error": "An internal server error occurred"
}
```
Rate limit errors return:
```json
{
  "error": "Too many requests, please try again later."
}
```

## Endpoints

### 1. Dashboard Data
Retrieves consolidated dashboard data including trades, signals, news, portfolio, stats, and open trades.

**GET** `/api/dashboard`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/dashboard
```

**Example Response:**
```json
{
  "trades": [
    {
      "id": "123",
      "symbol": "BTCUSDT",
      "action": "BUY",
      "price": 60000,
      "quantity": 0.1,
      "timestamp": "2023-10-01T12:00:00.000Z",
      "status": "CLOSED",
      "profit": 150
    }
  ],
  "signals": [],
  "news": [],
  "portfolio": {
    "totalValue": 10150,
    "positions": [],
    "performance": {
      "totalPnl": 150,
      "totalPnlPercentage": 1.5,
      "winRate": 1,
      "totalTrades": 1
    }
  },
  "stats": {
    "uptime": 3600000,
    "totalCommands": 15,
    "activeUsers": 1,
    "lastUpdate": "2023-10-01T13:00:00.000Z"
  },
  "openTrades": []
}
```

### 2. Get Trades
Retrieves a list of recent trades.

**GET** `/api/trades?limit=50`

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/trades?limit=5"
```

**Example Response:**
```json
[
  {
    "id": "123",
    "symbol": "BTCUSDT",
    "action": "BUY",
    "price": 60000,
    "quantity": 0.1,
    "timestamp": "2023-10-01T12:00:00.000Z",
    "status": "OPEN"
  }
]
```

### 3. Get Open Trades
Retrieves all currently open trades.

**GET** `/api/trades/open`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/trades/open
```

**Example Response:**
```json
[
  {
    "id": "123",
    "symbol": "BTCUSDT",
    "action": "BUY",
    "price": 60000,
    "quantity": 0.1,
    "timestamp": "2023-10-01T12:00:00.000Z",
    "status": "OPEN"
  }
]
```

### 4. Get Signals
Retrieves recent trading signals.

**GET** `/api/signals?limit=20`

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/signals?limit=1"
```

**Example Response:**
```json
[
  {
    "symbol": "ETHUSDT",
    "action": "BUY",
    "price": 3000,
    "confidence": 0.85,
    "timestamp": "2023-10-01T12:00:00.000Z",
    "indicators": {
      "rsi": 30.5,
      "macd": { "value": 1.5, "signal": 1.2 },
      "bbands": { "upper": 3100, "middle": 3000, "lower": 2900 }
    }
  }
]
```

### 5. Get News
Retrieves recent AI-analyzed news items.

**GET** `/api/news?limit=20`

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/news?limit=1"
```

**Example Response:**
```json
[
  {
    "symbol": "SOLUSDT",
    "title": "Network Upgrade Announced",
    "sentiment": "BULLISH",
    "impact": "HIGH",
    "timestamp": "2023-10-01T12:00:00.000Z"
  }
]
```

### 6. Get Portfolio
Retrieves the current portfolio value and performance metrics.

**GET** `/api/portfolio`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/portfolio
```

**Example Response:**
```json
{
  "totalValue": 10000,
  "positions": [
    {
      "symbol": "ETHUSDT",
      "quantity": 1,
      "averagePrice": 2900,
      "currentPrice": 3000,
      "pnl": 100,
      "pnlPercentage": 3.44
    }
  ],
  "performance": {
    "totalPnl": 0,
    "totalPnlPercentage": 0,
    "winRate": 0,
    "totalTrades": 0
  }
}
```

### 7. Get Bot Stats
Retrieves operational statistics for the bot.

**GET** `/api/stats`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/stats
```

**Example Response:**
```json
{
  "uptime": 86400000,
  "totalCommands": 150,
  "activeUsers": 5,
  "lastUpdate": "2023-10-01T12:00:00.000Z"
}
```

### 8. API Health
Retrieves simple API health status.

**GET** `/api/health`

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/health
```

**Example Response:**
```json
{
  "status": "OK",
  "timestamp": "2023-10-01T12:00:00.000Z",
  "uptime": 3600
}
```

### 9. External Monitoring Health
Retrieves detailed health snapshot of system components.

**GET** `/health`

**Example Request:**
```bash
curl -X GET http://localhost:3000/health
```

**Example Response:**
```json
{
  "status": "up",
  "timestamp": "2023-10-01T12:00:00.000Z",
  "uptime": 3600,
  "memoryUsageMb": 150.5,
  "requestCount": 150,
  "components": {
    "database": {
      "status": "ok",
      "lastCheck": 1696161600000,
      "message": "Not yet checked"
    },
    "binanceRest": {
      "status": "ok",
      "lastCheck": 1696161600000,
      "message": "Not yet checked"
    },
    "binanceWs": {
      "status": "ok",
      "lastCheck": 1696161600000,
      "message": "Not yet checked"
    },
    "modelAccuracy": {
      "status": "ok",
      "lastCheck": 1696161600000,
      "message": "Not yet checked"
    },
    "accountDrawdown": {
      "status": "ok",
      "lastCheck": 1696161600000,
      "message": "Not yet checked"
    },
    "accountBalance": {
      "status": "ok",
      "lastCheck": 1696161600000,
      "message": "Not yet checked"
    },
    "botProcess": {
      "status": "ok",
      "lastCheck": 1696161600000,
      "message": "Not yet checked"
    }
  }
}
```
