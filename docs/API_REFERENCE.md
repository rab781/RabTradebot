# REST API Reference

The RabTradebot includes a REST API for state management, trading data, and monitoring. The Web Dashboard UI is currently pending (Phase 8 of the roadmap) and there are no frontend web UI files or `public` directory in the repository.

## Authentication

Currently, the REST API runs without authentication by default. Ensure your environment restricts access via CORS or network-level firewalls.

## Rate Limiting

Requests are limited to **100 requests per minute per IP**.
When the limit is exceeded, the server returns an HTTP `429 Too Many Requests` status code.

## Pagination

Certain endpoints support pagination via the `limit` query parameter.
- Default limit for `/api/trades` is `50`.
- Default limit for `/api/signals` and `/api/news` is `20`.

## Error Handling

Standard error responses are returned for invalid parameters or server errors. Check the HTTP status code and any provided `error` object in the JSON response.

## Endpoints

### `GET /api/dashboard`
Returns the current dashboard data summary.

### `GET /api/trades`
Returns the recent trades. Supports `limit` parameter.

### `GET /api/trades/open`
Returns all currently open trades.

### `GET /api/signals`
Returns recent trading signals. Supports `limit` parameter.

### `GET /api/news`
Returns recent news sentiment analysis. Supports `limit` parameter.

### `GET /api/portfolio`
Returns the current portfolio balance and positions.

### `GET /api/stats`
Returns general trading statistics and performance metrics.

### `GET /api/health`
Returns the health status of the API and bot services.
