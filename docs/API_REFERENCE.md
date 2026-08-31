# REST API Reference

The Web Dashboard REST API provides real-time access to the bot's state, including trading signals, portfolio performance, and system health.

## Authentication

By default, the REST API runs **without authentication**. It is designed to be accessed locally or within a trusted network.
If exposing this API to the public internet, you must implement a reverse proxy (like Nginx) with authentication.

## Rate Limiting

To prevent abuse and ensure stability, all `/api/*` endpoints are rate-limited.

- **Limit**: 100 requests per minute per IP address.
- **Behavior**: When the limit is exceeded, the API returns an HTTP `429 Too Many Requests` status code.
- **Error Format**: `{"error": "Too many requests, please try again later."}`

## Pagination

Endpoints that return lists (like trades or news) support pagination via the `limit` query parameter.

- **`limit`**: Maximum number of items to return.
- **Default for Trades**: `50`
- **Default for Signals/News**: `20`

## Error Handling

Standard HTTP status codes are used to indicate success or failure.

- **200 OK**: The request was successful.
- **400 Bad Request**: Invalid input parameters.
- **429 Too Many Requests**: Rate limit exceeded.
- **500 Internal Server Error**: An internal server error occurred. Error responses include a JSON payload: `{"error": "An internal server error occurred"}`.
- **503 Service Unavailable**: The service is down (used by the `/health` endpoint).

---

## State Endpoints

### Get Dashboard Data

Retrieves the aggregated dashboard statistics.

**Endpoint**: `GET /api/dashboard`

**Response Example (200 OK)**:
```json
{
  "totalTrades": 150,
  "winRate": 0.65,
  "currentBalance": 1050.25
}
```

### Get Trades

Retrieves a list of recent trades.

**Endpoint**: `GET /api/trades`

**Query Parameters**:
- `limit` (optional): Number of trades to return. Defaults to `50`.

### Get Open Trades

Retrieves a list of currently open trades.

**Endpoint**: `GET /api/trades/open`

### Get Signals

Retrieves recent trading signals.

**Endpoint**: `GET /api/signals`

**Query Parameters**:
- `limit` (optional): Number of signals to return. Defaults to `20`.

### Get News

Retrieves recent AI-analyzed crypto news.

**Endpoint**: `GET /api/news`

**Query Parameters**:
- `limit` (optional): Number of news items to return. Defaults to `20`.

### Get Portfolio

Retrieves the current portfolio state, including balances and total value.

**Endpoint**: `GET /api/portfolio`

---

## System Endpoints

### Get Bot Stats

Retrieves internal bot statistics, such as command execution counts.

**Endpoint**: `GET /api/stats`

### API Health Check

Verifies that the API service is responsive.

**Endpoint**: `GET /api/health`

**Response Example (200 OK)**:
```json
{
  "status": "OK",
  "timestamp": "2023-10-25T12:00:00.000Z",
  "uptime": 3600
}
```

### System Health Monitoring

Returns a detailed health snapshot of the overall bot and its internal components.

**Endpoint**: `GET /health`

**Responses**:
- **200 OK**: The system is healthy (`overallStatus` is 'up' or 'degraded').
- **503 Service Unavailable**: Critical components are down.

**Response Example (200 OK)**:
```json
{
  "status": "up",
  "timestamp": "2023-10-25T12:00:00.000Z",
  "uptime": 3600,
  "memoryUsageMb": 150,
  "requestCount": 42,
  "components": {
    "binance": "up",
    "database": "up"
  }
}
```
