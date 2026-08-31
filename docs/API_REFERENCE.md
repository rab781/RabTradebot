
# REST API Reference

The Advanced Crypto Trading Bot provides a REST API to access real-time trading data, signals, and portfolio status.

## Authentication
Currently, the REST API does not require authentication.

## Rate Limiting
Requests are limited to 100 per minute per IP address. Rate limiting is enforced across all `/api/*` endpoints.
If the limit is exceeded, the server responds with a `429 Too Many Requests` error.

## Pagination
List endpoints (`/api/trades`, `/api/signals`, `/api/news`) support pagination via the `limit` query parameter.
- Trades default limit: 50
- Signals and News default limit: 20

## Error Handling
Standard error responses return a JSON object with an `error` field:
```json
{
  "error": "An internal server error occurred"
}
```

---

## Endpoints

### Get Dashboard Data
Returns an aggregated view of the system's current state, including recent trades, signals, news, portfolio, and stats.

- **URL:** `/api/dashboard`
- **Method:** `GET`
- **Example Request:**
  ```bash
  curl http://localhost:3000/api/dashboard
  ```
- **Response:**
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
      "uptime": 12345,
      "totalCommands": 0,
      "activeUsers": 0,
      "lastUpdate": "2023-10-27T12:00:00Z"
    }
  }
  ```

### Get Trades
Retrieves a list of recent trades.

- **URL:** `/api/trades`
- **Method:** `GET`
- **Query Parameters:**
  - `limit` (optional): Number of trades to return (default: 50)
- **Example Request:**
  ```bash
  curl "http://localhost:3000/api/trades?limit=10"
  ```
- **Response:**
  ```json
  [
    {
      "id": "trade_123",
      "symbol": "BTCUSDT",
      "action": "BUY",
      "price": 60000,
      "quantity": 0.1,
      "timestamp": "2023-10-27T12:00:00Z",
      "status": "CLOSED",
      "profit": 150
    }
  ]
  ```

### Get Open Trades
Retrieves a list of currently open trades.

- **URL:** `/api/trades/open`
- **Method:** `GET`
- **Example Request:**
  ```bash
  curl http://localhost:3000/api/trades/open
  ```
- **Response:**
  ```json
  [
    {
      "id": "trade_456",
      "symbol": "ETHUSDT",
      "action": "BUY",
      "price": 3000,
      "quantity": 1.5,
      "timestamp": "2023-10-27T12:15:00Z",
      "status": "OPEN"
    }
  ]
  ```

### Get Signals
Retrieves a list of recent trading signals.

- **URL:** `/api/signals`
- **Method:** `GET`
- **Query Parameters:**
  - `limit` (optional): Number of signals to return (default: 20)
- **Example Request:**
  ```bash
  curl "http://localhost:3000/api/signals?limit=5"
  ```
- **Response:**
  ```json
  [
    {
      "symbol": "SOLUSDT",
      "action": "BUY",
      "price": 100,
      "confidence": 0.85,
      "timestamp": "2023-10-27T12:30:00Z",
      "indicators": {
        "rsi": 45,
        "macd": { "value": 1.2, "signal": 1.0 },
        "bbands": { "upper": 105, "middle": 100, "lower": 95 }
      }
    }
  ]
  ```

### Get News
Retrieves a list of recent news items and their predicted impact.

- **URL:** `/api/news`
- **Method:** `GET`
- **Query Parameters:**
  - `limit` (optional): Number of news items to return (default: 20)
- **Example Request:**
  ```bash
  curl "http://localhost:3000/api/news?limit=5"
  ```
- **Response:**
  ```json
  [
    {
      "symbol": "BTCUSDT",
      "title": "Bitcoin reaches new ATH",
      "sentiment": "BULLISH",
      "impact": "HIGH",
      "timestamp": "2023-10-27T12:45:00Z"
    }
  ]
  ```

### Get Portfolio
Retrieves the current portfolio state and performance metrics.

- **URL:** `/api/portfolio`
- **Method:** `GET`
- **Example Request:**
  ```bash
  curl http://localhost:3000/api/portfolio
  ```
- **Response:**
  ```json
  {
    "totalValue": 10500,
    "positions": [
      {
        "symbol": "BTCUSDT",
        "quantity": 0.1,
        "averagePrice": 55000,
        "currentPrice": 60000,
        "pnl": 500,
        "pnlPercentage": 9.09
      }
    ],
    "performance": {
      "totalPnl": 500,
      "totalPnlPercentage": 5,
      "winRate": 0.65,
      "totalTrades": 20
    }
  }
  ```

### Get Stats
Retrieves general statistics about the bot.

- **URL:** `/api/stats`
- **Method:** `GET`
- **Example Request:**
  ```bash
  curl http://localhost:3000/api/stats
  ```
- **Response:**
  ```json
  {
    "uptime": 86400000,
    "totalCommands": 150,
    "activeUsers": 5,
    "lastUpdate": "2023-10-27T13:00:00Z"
  }
  ```

### Health Check (API)
Returns the health status of the API service.

- **URL:** `/api/health`
- **Method:** `GET`
- **Example Request:**
  ```bash
  curl http://localhost:3000/api/health
  ```
- **Response:**
  ```json
  {
    "status": "OK",
    "timestamp": "2023-10-27T13:10:00.000Z",
    "uptime": 86400
  }
  ```

### Health Check (System)
Returns an extensive system health snapshot, including memory usage and component statuses.

- **URL:** `/health`
- **Method:** `GET`
- **Example Request:**
  ```bash
  curl http://localhost:3000/health
  ```
- **Response:**
  ```json
  {
    "status": "operational",
    "timestamp": "2023-10-27T13:15:00.000Z",
    "uptime": 86400,
    "memoryUsageMb": 150.5,
    "requestCount": 150,
    "components": [
      {
        "name": "Binance WebSocket",
        "status": "operational"
      }
    ]
  }
  ```
