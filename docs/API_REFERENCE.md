# RabTradebot API Reference

The RabTradebot includes a REST API that provides read-only access to bot state, trades, signals, and system health. The Web Dashboard UI is currently pending (Phase 8 of the roadmap).

## Authentication

By default, the REST API runs without authentication. All endpoints are publicly accessible.

## Rate Limiting

Requests are limited to **100 requests per minute per IP address**.
If you exceed this limit, the API will respond with an HTTP `429 Too Many Requests` status code.

## Pagination

Endpoints that return lists of items support pagination via the `limit` query parameter.

- `limit`: The maximum number of items to return.

Default limits vary by endpoint:
- `/api/trades`: default `limit=50`
- `/api/signals`: default `limit=20`
- `/api/news`: default `limit=20`

## Error Handling

Standard HTTP response codes are used to indicate the success or failure of an API request.

- `200 OK`: The request was successful.
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: An unexpected error occurred on the server.

Error responses return a JSON object with an `error` key containing the error message.
```json
{
  "error": "An internal server error occurred"
}
```

## Endpoints

### Get Dashboard Data
Returns an overview of the bot's current state and key metrics.

**GET** `/api/dashboard`

**Response (200):**
```json
{
  "trades": [],
  "signals": [],
  "news": [],
  "portfolio": {
    "totalValue": 10500.5,
    "positions": [],
    "performance": {
      "daily": 5.2,
      "weekly": 12.1,
      "monthly": 25.5
    }
  },
  "stats": {
    "uptime": 86400,
    "totalCommands": 150,
    "activeUsers": 5,
    "lastUpdate": "2023-10-25T12:00:00.000Z"
  },
  "openTrades": []
}
```

### Get Trades
Retrieves a list of recent trades.

**GET** `/api/trades`

**Query Parameters:**
- `limit` (optional): Maximum number of trades to return (default: 50).

**Response (200):**
```json
[
  {
    "id": "1",
    "symbol": "BTCUSDT",
    "action": "BUY",
    "price": 65000,
    "quantity": 0.1,
    "timestamp": "2023-10-25T12:00:00.000Z",
    "status": "CLOSED",
    "profit": 150.5
  }
]
```

### Get Open Trades
Retrieves a list of currently open trades.

**GET** `/api/trades/open`

**Response (200):**
```json
[
  {
    "id": "2",
    "symbol": "ETHUSDT",
    "action": "BUY",
    "price": 3500,
    "quantity": 2.5,
    "timestamp": "2023-10-25T12:00:00.000Z",
    "status": "OPEN"
  }
]
```

### Get Signals
Retrieves a list of recent trading signals.

**GET** `/api/signals`

**Query Parameters:**
- `limit` (optional): Maximum number of signals to return (default: 20).

**Response (200):**
```json
[
  {
    "symbol": "SOLUSDT",
    "action": "BUY",
    "price": 105.5,
    "confidence": 0.85
  }
]
```

### Get News
Retrieves a list of recent market news and sentiment analysis.

**GET** `/api/news`

**Query Parameters:**
- `limit` (optional): Maximum number of news items to return (default: 20).

**Response (200):**
```json
[
  {
    "symbol": "BTC",
    "title": "Bitcoin Surges Past $65k",
    "sentiment": "BULLISH",
    "impact": "HIGH",
    "timestamp": "2023-10-25T12:00:00.000Z"
  }
]
```

### Get Portfolio
Retrieves the current portfolio balance and asset allocation.

**GET** `/api/portfolio`

**Response (200):**
```json
{
  "totalValue": 10500.5,
  "positions": [
    {
      "symbol": "BTCUSDT",
      "quantity": 0.1,
      "averagePrice": 60000,
      "currentPrice": 65000,
      "pnl": 500,
      "pnlPercentage": 8.33
    }
  ],
  "performance": {
    "daily": 5.2,
    "weekly": 12.1,
    "monthly": 25.5
  }
}
```

### Get Bot Statistics
Retrieves performance statistics and operational metrics of the bot.

**GET** `/api/stats`

**Response (200):**
```json
{
  "uptime": 86400,
  "totalCommands": 150,
  "activeUsers": 5,
  "lastUpdate": "2023-10-25T12:00:00.000Z"
}
```

### Get API Health
Internal API health check endpoint.

**GET** `/api/health`

**Response (200):**
```json
{
  "status": "OK",
  "timestamp": "2023-10-25T12:00:00.000Z",
  "uptime": 3600
}
```

### Get System Health
External monitoring endpoint providing an overview of system health and snapshot status.

**GET** `/health`

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2023-10-25T12:00:00.000Z",
  "uptime": 3600,
  "memoryUsageMb": 150,
  "requestCount": 150,
  "components": {
    "database": "up"
  }
}
```
