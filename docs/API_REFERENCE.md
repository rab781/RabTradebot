# Trading Bot API Reference

The Trading Bot provides a REST API for accessing real-time trading data, signals, portfolio status, and system health.

## Authentication
The API is currently **unauthenticated** by default and designed for local network access. It relies on CORS restrictions configured via the `CORS_ORIGIN` environment variable.

## Rate Limiting
All endpoints under the `/api/*` prefix are rate-limited to **100 requests per minute** per IP address. Exceeding this limit will result in a `429 Too Many Requests` response.

## Endpoints

### 1. Get Dashboard Data
Retrieves a consolidated view of the bot's current state.

**Endpoint:** `GET /api/dashboard`

**Example Request:**
```bash
curl http://localhost:3000/api/dashboard
```

**Example Response (200 OK):**
```json
{
  "trades": [
    {
      "id": "1",
      "symbol": "BTC/USDT",
      "action": "BUY",
      "price": 50000,
      "quantity": 0.1,
      "timestamp": "2023-10-27T10:00:00.000Z",
      "status": "CLOSED",
      "profit": 50
    }
  ],
  "signals": [],
  "news": [],
  "portfolio": {
    "totalValue": 10050,
    "positions": [],
    "performance": {
      "totalPnl": 50,
      "totalPnlPercentage": 0.5,
      "winRate": 1,
      "totalTrades": 1
    }
  },
  "stats": {
    "uptime": 3600000,
    "totalCommands": 10,
    "activeUsers": 1,
    "lastUpdate": "2023-10-27T11:00:00.000Z"
  },
  "openTrades": []
}
```

### 2. Get Trades
Retrieves historical trades.

**Endpoint:** `GET /api/trades`

**Query Parameters:**
- `limit` (optional, integer): Maximum number of trades to return. Defaults to 50.

**Example Request:**
```bash
curl "http://localhost:3000/api/trades?limit=10"
```

**Example Response (200 OK):**
```json
[
  {
    "id": "1",
    "symbol": "BTC/USDT",
    "action": "BUY",
    "price": 50000,
    "quantity": 0.1,
    "timestamp": "2023-10-27T10:00:00.000Z",
    "status": "CLOSED",
    "profit": 50
  }
]
```

### 3. Get Open Trades
Retrieves currently open trades.

**Endpoint:** `GET /api/trades/open`

**Example Request:**
```bash
curl http://localhost:3000/api/trades/open
```

**Example Response (200 OK):**
```json
[
  {
    "id": "2",
    "symbol": "ETH/USDT",
    "action": "BUY",
    "price": 2000,
    "quantity": 1,
    "timestamp": "2023-10-27T11:30:00.000Z",
    "status": "OPEN"
  }
]
```

### 4. Get Signals
Retrieves recent trading signals.

**Endpoint:** `GET /api/signals`

**Query Parameters:**
- `limit` (optional, integer): Maximum number of signals to return. Defaults to 20.

**Example Request:**
```bash
curl "http://localhost:3000/api/signals?limit=5"
```

**Example Response (200 OK):**
```json
[
  {
    "symbol": "BTC/USDT",
    "action": "BUY",
    "price": 51000,
    "confidence": 0.85,
    "timestamp": "2023-10-27T12:00:00.000Z",
    "indicators": {
      "rsi": 35,
      "macd": { "value": 1.5, "signal": 1.2 },
      "bbands": { "upper": 52000, "middle": 51000, "lower": 50000 }
    }
  }
]
```

### 5. Get News
Retrieves recent market news.

**Endpoint:** `GET /api/news`

**Query Parameters:**
- `limit` (optional, integer): Maximum number of news items to return. Defaults to 20.

**Example Request:**
```bash
curl "http://localhost:3000/api/news?limit=5"
```

**Example Response (200 OK):**
```json
[
  {
    "symbol": "BTC",
    "title": "Bitcoin Surges Past 50k",
    "sentiment": "BULLISH",
    "impact": "HIGH",
    "timestamp": "2023-10-27T09:00:00.000Z"
  }
]
```

### 6. Get Portfolio
Retrieves current portfolio status and performance metrics.

**Endpoint:** `GET /api/portfolio`

**Example Request:**
```bash
curl http://localhost:3000/api/portfolio
```

**Example Response (200 OK):**
```json
{
  "totalValue": 10050,
  "positions": [
    {
      "symbol": "ETH/USDT",
      "quantity": 1,
      "averagePrice": 2000,
      "currentPrice": 2050,
      "pnl": 50,
      "pnlPercentage": 2.5
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

### 7. Get Bot Stats
Retrieves general statistics about the bot's operation.

**Endpoint:** `GET /api/stats`

**Example Request:**
```bash
curl http://localhost:3000/api/stats
```

**Example Response (200 OK):**
```json
{
  "uptime": 3600000,
  "totalCommands": 10,
  "activeUsers": 1,
  "lastUpdate": "2023-10-27T11:00:00.000Z"
}
```

### 8. API Health Check
Simple health check for the API wrapper.

**Endpoint:** `GET /api/health`

**Example Request:**
```bash
curl http://localhost:3000/api/health
```

**Example Response (200 OK):**
```json
{
  "status": "OK",
  "timestamp": "2023-10-27T11:00:00.000Z",
  "uptime": 3600
}
```

### 9. External Monitoring Health Check
Detailed health check suitable for external monitoring tools (e.g., Prometheus/Grafana or uptime monitors). This endpoint is un-prefixed.

**Endpoint:** `GET /health`

**Example Request:**
```bash
curl http://localhost:3000/health
```

**Example Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2023-10-27T11:00:00.000Z",
  "uptime": 3600,
  "memoryUsageMb": 150,
  "requestCount": 10,
  "components": {
    "binanceWs": {
      "status": "ok",
      "lastCheck": 1698404400000,
      "message": "WebSocket healthy (1 streams)",
      "details": {
        "streamCount": 1
      }
    }
  }
}
```

## General Error Handling
Internal server errors return a `500` status code with a standard JSON structure:
```json
{
  "error": "An internal server error occurred"
}
```
Rate limit errors return a `429` status code:
```json
{
  "error": "Too many requests, please try again later."
}
```
