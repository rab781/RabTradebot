
# API Reference

The RabTradebot provides a REST API for accessing trading state, portfolio data, signals, and news.

## Authentication
Currently, the REST API does not require authentication. It is intended to be run locally or within a trusted network.

## Rate Limiting
Requests are limited to 100 per minute per IP address. If this limit is exceeded, the server returns a `429 Too Many Requests` response.

## Pagination
Endpoints that return lists of items (e.g., `/api/trades`, `/api/signals`, `/api/news`) support pagination via a `limit` query parameter.

## Endpoints

### Get Dashboard Data
Returns an overview of the bot's state.
- **URL**: `/api/dashboard`
- **Method**: `GET`
- **Example**:
  ```bash
  curl http://localhost:3000/api/dashboard
  ```
- **Response Payload**:
  ```json
  {
    "trades": [
      {
        "id": "uuid",
        "symbol": "BTCUSDT",
        "action": "BUY",
        "price": 50000,
        "quantity": 0.1,
        "timestamp": "2023-01-01T00:00:00.000Z",
        "status": "CLOSED",
        "profit": 150
      }
    ],
    "signals": [
      {
        "symbol": "BTCUSDT",
        "action": "BUY",
        "price": 50000,
        "confidence": 0.85,
        "timestamp": "2023-01-01T00:00:00.000Z",
        "indicators": {
          "rsi": 45
        }
      }
    ],
    "news": [
      {
        "symbol": "BTCUSDT",
        "title": "Bitcoin surges",
        "sentiment": "BULLISH",
        "impact": "HIGH",
        "timestamp": "2023-01-01T00:00:00.000Z"
      }
    ],
    "portfolio": {
      "totalValue": 10000,
      "positions": [
        {
          "symbol": "BTCUSDT",
          "quantity": 0.1,
          "averagePrice": 45000,
          "currentPrice": 50000,
          "pnl": 500,
          "pnlPercentage": 11.1
        }
      ],
      "performance": {
        "totalPnl": 0,
        "totalPnlPercentage": 0,
        "winRate": 0,
        "totalTrades": 0
      }
    },
    "stats": {
      "uptime": 3600000,
      "totalCommands": 100,
      "activeUsers": 5,
      "lastUpdate": "2023-01-01T01:00:00.000Z"
    },
    "openTrades": []
  }
  ```

### Get Trades
Returns a list of recent trades.
- **URL**: `/api/trades`
- **Method**: `GET`
- **Query Parameters**:
  - `limit` (optional): Maximum number of trades to return (default: 50).
- **Example**:
  ```bash
  curl http://localhost:3000/api/trades?limit=10
  ```
- **Response Payload**:
  ```json
  [
    {
      "id": "uuid",
      "symbol": "BTCUSDT",
      "action": "BUY",
      "price": 50000,
      "quantity": 0.1,
      "timestamp": "2023-01-01T00:00:00.000Z",
      "status": "CLOSED",
      "profit": 150
    }
  ]
  ```

### Get Open Trades
Returns a list of currently open trades.
- **URL**: `/api/trades/open`
- **Method**: `GET`
- **Example**:
  ```bash
  curl http://localhost:3000/api/trades/open
  ```
- **Response Payload**:
  ```json
  [
    {
      "id": "uuid",
      "symbol": "ETHUSDT",
      "action": "BUY",
      "price": 3000,
      "quantity": 1,
      "timestamp": "2023-01-01T00:00:00.000Z",
      "status": "OPEN"
    }
  ]
  ```

### Get Signals
Returns a list of recent trading signals.
- **URL**: `/api/signals`
- **Method**: `GET`
- **Query Parameters**:
  - `limit` (optional): Maximum number of signals to return (default: 20).
- **Example**:
  ```bash
  curl http://localhost:3000/api/signals?limit=5
  ```
- **Response Payload**:
  ```json
  [
    {
      "symbol": "BTCUSDT",
      "action": "BUY",
      "price": 50000,
      "confidence": 0.85,
      "timestamp": "2023-01-01T00:00:00.000Z",
      "indicators": {
        "rsi": 45
      }
    }
  ]
  ```

### Get News
Returns a list of recent news items and their sentiment analysis.
- **URL**: `/api/news`
- **Method**: `GET`
- **Query Parameters**:
  - `limit` (optional): Maximum number of news items to return (default: 20).
- **Example**:
  ```bash
  curl http://localhost:3000/api/news?limit=10
  ```
- **Response Payload**:
  ```json
  [
    {
      "symbol": "BTCUSDT",
      "title": "Bitcoin surges",
      "sentiment": "BULLISH",
      "impact": "HIGH",
      "timestamp": "2023-01-01T00:00:00.000Z"
    }
  ]
  ```

### Get Portfolio
Returns the current paper trading portfolio balance and statistics.
- **URL**: `/api/portfolio`
- **Method**: `GET`
- **Example**:
  ```bash
  curl http://localhost:3000/api/portfolio
  ```
- **Response Payload**:
  ```json
  {
    "totalValue": 10000,
    "positions": [
      {
        "symbol": "BTCUSDT",
        "quantity": 0.5,
        "averagePrice": 40000,
        "currentPrice": 45000,
        "pnl": 2500,
        "pnlPercentage": 6.25
      }
    ],
    "performance": {
      "totalPnl": 2500,
      "totalPnlPercentage": 25,
      "winRate": 0.75,
      "totalTrades": 10
    }
  }
  ```

### Get Bot Stats
Returns general statistics about the bot's operation.
- **URL**: `/api/stats`
- **Method**: `GET`
- **Example**:
  ```bash
  curl http://localhost:3000/api/stats
  ```
- **Response Payload**:
  ```json
  {
    "uptime": 3600000,
    "totalCommands": 100,
    "activeUsers": 5,
    "lastUpdate": "2023-01-01T01:00:00.000Z"
  }
  ```

### Health Check (External Monitoring)
Returns the current health status of the API server.
- **URL**: `/health`
- **Method**: `GET`
- **Example**:
  ```bash
  curl http://localhost:3000/health
  ```
- **Response Payload**:
  ```json
  {
    "status": "ok",
    "timestamp": "2023-01-01T00:00:00.000Z",
    "uptime": 3600,
    "memoryUsageMb": 150,
    "requestCount": 100,
    "components": {
      "database": {
        "status": "ok",
        "lastCheck": 1672531200000,
        "message": "Connected",
        "details": {}
      }
    }
  }
  ```

### Internal Health Check
Returns basic API server status.
- **URL**: `/api/health`
- **Method**: `GET`
- **Example**:
  ```bash
  curl http://localhost:3000/api/health
  ```
- **Response Payload**:
  ```json
  {
    "status": "OK",
    "timestamp": "2023-01-01T00:00:00.000Z",
    "uptime": 3600
  }
  ```

## Error Handling
In case of a general server error, the API will return a `500 Internal Server Error` status with the following JSON format:
```json
{
  "error": "An internal server error occurred"
}
```
If the rate limit is exceeded, a `429 Too Many Requests` status is returned with:
```json
{
  "error": "Too many requests, please try again later."
}
```
