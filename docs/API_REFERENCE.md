# API Reference

The RabTradebot includes a REST API for accessing bot state and metrics.

## Authentication
No authentication is required by default. The API is designed for internal dashboard use.

## Rate Limiting
Requests are limited to 100 requests per minute per IP address. Exceeding this limit will result in a `429 Too Many Requests` response.

## Pagination
Some endpoints support pagination via the `limit` query parameter.
- Trades default limit: 50
- Signals default limit: 20
- News default limit: 20

## Error Handling
Errors return a standard JSON response with an `error` key and a descriptive message.
- `400 Bad Request`: Invalid request parameters.
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: An unexpected server error occurred.

## Endpoints

### `GET /api/dashboard`
Retrieves the overall dashboard data.

### `GET /api/trades`
Retrieves trade history.
- **Query Parameters**: `limit` (optional, default 50)

### `GET /api/trades/open`
Retrieves currently open trades.

### `GET /api/signals`
Retrieves recent trading signals.
- **Query Parameters**: `limit` (optional, default 20)

### `GET /api/news`
Retrieves recent news and sentiment analysis.
- **Query Parameters**: `limit` (optional, default 20)

### `GET /api/portfolio`
Retrieves portfolio summary and balance.

### `GET /api/stats`
Retrieves bot statistics.

### `GET /api/health`
Retrieves basic health status and uptime.

### `GET /health`
Retrieves comprehensive system health snapshot (used for external monitoring).
