# REST API Reference

The REST API allows you to retrieve trading bot state, including dashboard data, open positions, recent signals, and portfolio status.

## Authentication
This API currently requires no authentication. All endpoints are public.

## Rate Limiting
Requests are limited to 100/minute per IP address. Rate limit headers are not currently exposed.

## Pagination
For endpoints returning lists (e.g., `/api/trades`, `/api/signals`, `/api/news`), you can use the `limit` query parameter to control the number of returned items.
- Trades default limit: 50
- Signals default limit: 20
- News default limit: 20

## Error Handling
Most endpoints return standard HTTP status codes:
- `200 OK`: Successful request.
- `429 Too Many Requests`: Rate limit exceeded. Returns `{ "error": "Too many requests, please try again later." }`.
- `500 Internal Server Error`: Server encountered an error. Returns `{ "error": "An internal server error occurred" }`.

## Endpoints

### `GET /api/dashboard`
Retrieves high-level dashboard data.

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/dashboard
```

**Example Response:**
```json
{
  "totalBalance": 1000,
  "openPositions": 2,
  "unrealizedPnL": 50.25,
  "dailyProfit": 12.5,
  "activeSignals": 3
}
```

### `GET /api/trades`
Retrieves recent trades.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | `number` | `50` | Maximum number of trades to return |

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/trades?limit=10"
```

**Example Response:**
```json
[
  {
    "id": "trade_123",
    "symbol": "BTCUSDT",
    "side": "BUY",
    "entryPrice": 65000,
    "exitPrice": 66000,
    "profit": 1000,
    "status": "CLOSED",
    "createdAt": "2024-03-20T10:00:00Z"
  }
]
```

### `GET /api/trades/open`
Retrieves currently open trades.

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/trades/open
```

**Example Response:**
```json
[
  {
    "id": "trade_124",
    "symbol": "ETHUSDT",
    "side": "BUY",
    "entryPrice": 3500,
    "currentPrice": 3550,
    "unrealizedPnL": 50,
    "status": "OPEN",
    "createdAt": "2024-03-20T11:00:00Z"
  }
]
```

### `GET /api/signals`
Retrieves recent trading signals.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | `number` | `20` | Maximum number of signals to return |

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/signals?limit=5"
```

**Example Response:**
```json
[
  {
    "id": "sig_123",
    "symbol": "SOLUSDT",
    "action": "BUY",
    "confidence": 0.85,
    "reasoning": "Strong bullish momentum on 4h timeframe",
    "createdAt": "2024-03-20T11:30:00Z"
  }
]
```

### `GET /api/news`
Retrieves recent news articles.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | `number` | `20` | Maximum number of news items to return |

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/news?limit=10"
```

**Example Response:**
```json
[
  {
    "id": "news_123",
    "title": "Bitcoin Surges Past 70k",
    "source": "CoinDesk",
    "sentiment": 0.9,
    "url": "https://example.com/news/123",
    "publishedAt": "2024-03-20T12:00:00Z"
  }
]
```

### `GET /api/portfolio`
Retrieves current portfolio status, including balances and unrealized PnL.

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/portfolio
```

**Example Response:**
```json
{
  "totalValue": 5050.25,
  "freeBalance": 2000,
  "lockedBalance": 3000,
  "unrealizedPnL": 50.25,
  "assets": [
    {
      "asset": "USDT",
      "free": 2000,
      "locked": 0
    },
    {
      "asset": "ETH",
      "free": 0.85,
      "locked": 0.85
    }
  ]
}
```

### `GET /api/stats`
Retrieves bot statistics, such as total commands executed.

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/stats
```

**Example Response:**
```json
{
  "totalCommands": 1500,
  "activeUsers": 25,
  "uptime": 86400,
  "successfulTrades": 120,
  "failedTrades": 5
}
```

### `GET /api/health`
Retrieves simple API health status.

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/health
```

**Example Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-03-20T12:30:00Z",
  "uptime": 86400
}
```

### `GET /health`
Retrieves comprehensive component health snapshot.

**Example Request:**
```bash
curl -X GET http://localhost:3000/health
```

**Example Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-03-20T12:30:00Z",
  "uptime": 86400,
  "memoryUsageMb": 125.5,
  "requestCount": 1500,
  "components": {
    "database": "up",
    "binance": "up",
    "chutesAi": "up"
  }
}
```
