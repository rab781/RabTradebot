# Trading Bot Dashboard API Reference

Welcome to the Trading Bot Dashboard API. This API provides real-time state access to bot statistics, trades, signals, and health status.

## Authentication
No authentication is currently required for these endpoints. The API is intended to be accessed locally or securely behind a proxy within the host environment.

## Rate Limiting
Requests to `/api` are limited to 100 requests per minute per IP address. Exceeding this limit will result in a `429 Too Many Requests` error.

## Pagination
Endpoints like `/api/trades`, `/api/signals`, and `/api/news` support pagination via a `limit` query parameter (e.g., `?limit=50`). The default limit for trades is 50, and for signals and news is 20.

## General Error Handling
In the event of an error, the API will respond with an appropriate HTTP status code and a JSON object containing an `error` property.

- **429 Too Many Requests**: `{"error": "Too many requests, please try again later."}`
- **500 Internal Server Error**: `{"error": "An internal server error occurred"}`

---

## Endpoints

### 1. Get Dashboard Data
**GET** `/api/dashboard`

Returns aggregated data including trades, signals, news, portfolio status, bot stats, and currently open trades.

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/dashboard
```

**Example Response (200 OK):**
```json
{
    "trades": [
        {
            "id": "123",
            "symbol": "BTCUSDT",
            "action": "BUY",
            "price": 50000,
            "quantity": 0.1,
            "timestamp": "2023-10-01T12:00:00.000Z",
            "profit": 500,
            "status": "CLOSED"
        }
    ],
    "signals": [
        {
            "symbol": "BTCUSDT",
            "action": "BUY",
            "price": 49000,
            "confidence": 0.85,
            "timestamp": "2023-10-01T11:55:00.000Z",
            "indicators": {
                "rsi": 30,
                "macd": { "value": -10, "signal": -5 },
                "bbands": { "upper": 51000, "middle": 50000, "lower": 49000 }
            }
        }
    ],
    "news": [
        {
            "symbol": "BTCUSDT",
            "title": "Bitcoin ETF Approved",
            "sentiment": "BULLISH",
            "impact": "HIGH",
            "timestamp": "2023-10-01T10:00:00.000Z"
        }
    ],
    "portfolio": {
        "totalValue": 10500,
        "positions": [],
        "performance": {
            "totalPnl": 500,
            "totalPnlPercentage": 5,
            "winRate": 1,
            "totalTrades": 1
        }
    },
    "stats": {
        "uptime": 3600,
        "totalCommands": 15,
        "activeUsers": 1,
        "lastUpdate": "2023-10-01T12:00:00.000Z"
    },
    "openTrades": []
}
```

### 2. Get Trades
**GET** `/api/trades?limit={number}`

Returns a list of recent trades. Default limit is 50.

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/trades?limit=5"
```

**Example Response (200 OK):**
```json
[
    {
        "id": "123",
        "symbol": "BTCUSDT",
        "action": "BUY",
        "price": 50000,
        "quantity": 0.1,
        "timestamp": "2023-10-01T12:00:00.000Z",
        "profit": 500,
        "status": "CLOSED"
    }
]
```

### 3. Get Open Trades
**GET** `/api/trades/open`

Returns a list of currently open trades.

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/trades/open
```

**Example Response (200 OK):**
```json
[
    {
        "id": "124",
        "symbol": "ETHUSDT",
        "action": "SELL",
        "price": 3000,
        "quantity": 1,
        "timestamp": "2023-10-01T12:05:00.000Z",
        "status": "OPEN"
    }
]
```

### 4. Get Signals
**GET** `/api/signals?limit={number}`

Returns recent trading signals. Default limit is 20.

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/signals?limit=5"
```

**Example Response (200 OK):**
```json
[
    {
        "symbol": "BTCUSDT",
        "action": "BUY",
        "price": 49000,
        "confidence": 0.85,
        "timestamp": "2023-10-01T11:55:00.000Z",
        "indicators": {
            "rsi": 30,
            "macd": { "value": -10, "signal": -5 },
            "bbands": { "upper": 51000, "middle": 50000, "lower": 49000 }
        }
    }
]
```

### 5. Get News
**GET** `/api/news?limit={number}`

Returns recent news items analyzed by the bot. Default limit is 20.

**Example Request:**
```bash
curl -X GET "http://localhost:3000/api/news?limit=2"
```

**Example Response (200 OK):**
```json
[
    {
        "symbol": "BTCUSDT",
        "title": "Bitcoin ETF Approved",
        "sentiment": "BULLISH",
        "impact": "HIGH",
        "timestamp": "2023-10-01T10:00:00.000Z"
    }
]
```

### 6. Get Portfolio
**GET** `/api/portfolio`

Returns the current portfolio status and performance metrics.

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/portfolio
```

**Example Response (200 OK):**
```json
{
    "totalValue": 10500,
    "positions": [
        {
            "symbol": "ETHUSDT",
            "quantity": 1,
            "averagePrice": 2900,
            "currentPrice": 3000,
            "pnl": 100,
            "pnlPercentage": 3.45
        }
    ],
    "performance": {
        "totalPnl": 500,
        "totalPnlPercentage": 5,
        "winRate": 1,
        "totalTrades": 1
    }
}
```

### 7. Get Stats
**GET** `/api/stats`

Returns general bot statistics like uptime and total commands processed.

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/stats
```

**Example Response (200 OK):**
```json
{
    "uptime": 3600000,
    "totalCommands": 15,
    "activeUsers": 1,
    "lastUpdate": "2023-10-01T12:00:00.000Z"
}
```

### 8. Get Health Check (Internal)
**GET** `/api/health`

Simple health check returning basic status.

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/health
```

**Example Response (200 OK):**
```json
{
    "status": "OK",
    "timestamp": "2023-10-01T12:00:00.000Z",
    "uptime": 3600
}
```

### 9. Get Comprehensive Health Monitor Status
**GET** `/health`

Detailed health monitor snapshot including memory usage and individual component status. Responds with 200 OK or 503 Service Unavailable based on overall status.

**Example Request:**
```bash
curl -X GET http://localhost:3000/health
```

**Example Response (200 OK):**
```json
{
    "status": "ok",
    "timestamp": "2023-10-01T12:00:00.000Z",
    "uptime": 3600,
    "memoryUsageMb": 150.5,
    "requestCount": 15,
    "components": {
        "database": {
            "status": "ok",
            "lastCheck": 1696161600000,
            "message": "Database connected"
        }
    }
}
```
