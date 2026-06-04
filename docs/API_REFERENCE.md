# Web Server API Reference

The REST API allows you to retrieve trading state and bot health information.

## Authentication
By default, the REST API runs without authentication.

## Rate Limiting
Requests to the `/api/*` routes are limited to 100 requests per minute per IP. When the limit is exceeded, a `429 Too Many Requests` response is returned.

## Pagination
Endpoints that return lists (like `/api/trades`, `/api/signals`, `/api/news`) support a `limit` query parameter to restrict the number of results.

## Error Handling
In case of errors, the API returns a `500 Internal Server Error` with a JSON response: `{"error": "An internal server error occurred"}`. Rate limit errors return `429` with `{"error": "Too many requests, please try again later."}`.

## Endpoints

### `GET /api/dashboard`
Returns the current dashboard data.

### `GET /api/trades`
Returns recent trades.
- **Parameters:**
  - `limit` (optional, default 50): Number of trades to return.

### `GET /api/trades/open`
Returns currently open trades.

### `GET /api/signals`
Returns recent trading signals.
- **Parameters:**
  - `limit` (optional, default 20): Number of signals to return.

### `GET /api/news`
Returns recent news items.
- **Parameters:**
  - `limit` (optional, default 20): Number of news items to return.

### `GET /api/portfolio`
Returns the current portfolio balance and positions.

### `GET /api/stats`
Returns overall bot statistics.

### `GET /api/health`
Returns basic health check information.

### `GET /health`
Returns detailed health monitoring information, including overall status, uptime, memory usage, and component statuses. If any component is down, returns a `503 Service Unavailable` status code.
