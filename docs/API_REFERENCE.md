# RabTradebot API Reference

The RabTradebot Web Dashboard provides a REST API to access the state of the bot, trading statistics, and market signals.

## Authentication
By default, the Web Dashboard API runs without authentication, as it's designed to run locally or within a secure internal network. Ensure you use appropriate firewall rules or restrict CORS via the `CORS_ORIGIN` environment variable if exposing it publicly.

## Rate Limiting
Requests to the API are limited to **100 requests per minute** per IP address. Rate limit status is evaluated continuously. Exceeding this limit will result in an HTTP `429 Too Many Requests` error with the response:
```json
{
  "error": "Too many requests, please try again later."
}
```

## Pagination
Several endpoints support pagination using the `limit` query parameter:
- `/api/trades` (default: 50)
- `/api/signals` (default: 20)
- `/api/news` (default: 20)

## Error Handling
In case of an internal server error, the API will return an HTTP `500 Internal Server Error` with the response:
```json
{
  "error": "An internal server error occurred"
}
```

## Endpoints

### Get Dashboard Data
Retrieves the summarized dashboard data.

**Request**
```bash
curl http://localhost:3000/api/dashboard
```

**Response (200 OK)**
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
    "uptime": 3600,
    "totalCommands": 50,
    "activeUsers": 2,
    "lastUpdate": "2023-10-01T12:00:00.000Z"
  },
  "openTrades": []
}
```

### Get Trades
Retrieves trading history.

**Request**
```bash
curl "http://localhost:3000/api/trades?limit=10"
```

**Response (200 OK)**
```json
[
  {
    "id": "1",
    "symbol": "BTCUSDT",
    "action": "BUY",
    "price": 60000,
    "quantity": 0.1,
    "timestamp": "2023-10-01T12:00:00.000Z",
    "status": "CLOSED",
    "profit": 150
  }
]
```

### Get Open Trades
Retrieves currently open trades.

**Request**
```bash
curl http://localhost:3000/api/trades/open
```

**Response (200 OK)**
```json
[
  {
    "id": "2",
    "symbol": "ETHUSDT",
    "action": "BUY",
    "price": 3000,
    "quantity": 1,
    "timestamp": "2023-10-01T12:00:00.000Z",
    "status": "OPEN"
  }
]
```

### Get Signals
Retrieves recent trading signals.

**Request**
```bash
curl "http://localhost:3000/api/signals?limit=5"
```

**Response (200 OK)**
```json
[
  {
    "symbol": "SOLUSDT",
    "action": "BUY",
    "price": 25.5,
    "confidence": 0.85,
    "timestamp": "2023-10-01T12:00:00.000Z",
    "indicators": {
      "rsi": 30,
      "macd": { "value": 0.5, "signal": 0.2 },
      "bbands": { "upper": 26, "middle": 25, "lower": 24 }
    }
  }
]
```

### Get News
Retrieves recent market news and sentiment analysis.

**Request**
```bash
curl "http://localhost:3000/api/news?limit=5"
```

**Response (200 OK)**
```json
[
  {
    "symbol": "BTC",
    "title": "Fed announces rate cut",
    "sentiment": "BULLISH",
    "impact": "HIGH",
    "timestamp": "2023-10-01T12:00:00.000Z"
  }
]
```

### Get Portfolio
Retrieves current portfolio balances and asset distribution.

**Request**
```bash
curl http://localhost:3000/api/portfolio
```

**Response (200 OK)**
```json
{
  "totalValue": 10500,
  "positions": [
    {
      "symbol": "BTCUSDT",
      "quantity": 0.1,
      "averagePrice": 50000,
      "currentPrice": 60000,
      "pnl": 1000,
      "pnlPercentage": 20
    }
  ],
  "performance": {
    "totalPnl": 500,
    "totalPnlPercentage": 5,
    "winRate": 0.65,
    "totalTrades": 10
  }
}
```

### Get Stats
Retrieves bot operational statistics.

**Request**
```bash
curl http://localhost:3000/api/stats
```

**Response (200 OK)**
```json
{
  "uptime": 86400,
  "totalCommands": 150,
  "activeUsers": 5,
  "lastUpdate": "2023-10-01T12:00:00.000Z"
}
```

### Health Check (Internal)
Internal API health check endpoint.

**Request**
```bash
curl http://localhost:3000/api/health
```

**Response (200 OK)**
```json
{
  "status": "OK",
  "timestamp": "2023-10-01T12:00:00.000Z",
  "uptime": 86400
}
```

### Health Monitor (External)
External monitoring endpoint providing detailed system health.

**Request**
```bash
curl http://localhost:3000/health
```

**Response (200 OK / 503 Service Unavailable)**
```json
{
  "status": "ok",
  "timestamp": "2023-10-01T12:00:00.000Z",
  "uptime": 86400,
  "memoryUsageMb": 128,
  "requestCount": 150,
  "components": {
    "database": {
      "status": "ok",
      "lastCheck": 1696118400000,
      "message": "Ping successful"
    },
    "binanceRest": {
      "status": "ok",
      "lastCheck": 1696118400000,
      "message": "Latency: 45ms"
    },
    "binanceWs": {
      "status": "ok",
      "lastCheck": 1696118400000,
      "message": "Connected"
    }
  }
}
```
