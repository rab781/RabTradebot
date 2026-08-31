# RabTradebot API Reference

The RabTradebot API allows you to programmatically access dashboard data, trades, signals, news, and system status.

## Authentication
The REST API runs locally by default without authentication. If deployed publicly, you are strongly advised to secure access via an upstream proxy (e.g., NGINX with Basic Auth) or VPN.

## Rate Limiting
Requests to `/api/*` are rate-limited per IP address:
- **Limit:** 100 requests per 60 seconds
- **Behavior:** Exceeding this limit will return a `429 Too Many Requests` status code with the JSON response:
  ```json
  { "error": "Too many requests, please try again later." }
  ```

## Pagination
Endpoints that return lists support pagination via the `limit` query parameter.
- `/api/trades` (default limit: 50)
- `/api/signals` (default limit: 20)
- `/api/news` (default limit: 20)

## Error Handling
If an internal error occurs during request processing on `/api/*` routes, the API returns a `500 Internal Server Error` status code:
```json
{ "error": "An internal server error occurred" }
```

## Endpoints

### Get Dashboard Data
Retrieves an overview of the bot's current state.

**Request:**
`GET /api/dashboard`

**Response (200 OK):**
Returns a JSON object containing aggregated dashboard metrics.

### Get Trades
Retrieves a list of recent trades.

**Request:**
`GET /api/trades`

**Query Parameters:**
- `limit` (number, default: 50): Maximum number of trades to return.

**Response (200 OK):**
Returns a JSON array of trade objects.

### Get Open Trades
Retrieves a list of currently open trades.

**Request:**
`GET /api/trades/open`

**Response (200 OK):**
Returns a JSON array of open trade objects.

### Get Signals
Retrieves a list of recent trading signals.

**Request:**
`GET /api/signals`

**Query Parameters:**
- `limit` (number, default: 20): Maximum number of signals to return.

**Response (200 OK):**
Returns a JSON array of signal objects.

### Get News
Retrieves a list of recent news articles analyzed by the bot.

**Request:**
`GET /api/news`

**Query Parameters:**
- `limit` (number, default: 20): Maximum number of news items to return.

**Response (200 OK):**
Returns a JSON array of news objects.

### Get Portfolio
Retrieves the current portfolio state and balances.

**Request:**
`GET /api/portfolio`

**Response (200 OK):**
Returns a JSON object detailing current asset balances and portfolio value.

### Get Bot Stats
Retrieves overall performance statistics for the bot.

**Request:**
`GET /api/stats`

**Response (200 OK):**
Returns a JSON object with statistical metrics (e.g., total commands).

### General Health Check
Simple endpoint to verify the API is running.

**Request:**
`GET /api/health`

**Response (200 OK):**
```json
{
  "status": "OK",
  "timestamp": "2023-10-25T12:00:00.000Z",
  "uptime": 3600
}
```

### External Monitoring Health Check
Detailed health check intended for external monitoring tools (e.g., load balancers). Note: this endpoint is at `/health`, not `/api/health`.

**Request:**
`GET /health`

**Response (200 OK or 503 Service Unavailable):**
Returns detailed component status. If any critical component is down, returns 503.
```json
{
  "status": "up",
  "timestamp": "2023-10-25T12:00:00.000Z",
  "uptime": 3600,
  "memoryUsageMb": 150.5,
  "requestCount": 42,
  "components": {}
}
```
