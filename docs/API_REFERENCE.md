# API Reference

The RabTradebot provides a REST API for accessing trading state, portfolio metrics, and system health.

## Authentication

By default, the REST API runs without authentication. All endpoints are accessible directly over HTTP.

## Rate Limiting

The API enforces rate limiting to protect the server:
- **Limit**: 100 requests per minute per IP address.
- **Exceeded limit**: Returns HTTP `429 Too Many Requests` with a JSON payload containing an `error` message.

## Pagination

Endpoints that return lists (such as trades, signals, and news) support pagination via the `limit` query parameter.
- `limit` (number): The maximum number of items to return. Defaults vary by endpoint.

## Error Handling

Standard HTTP status codes are used to indicate success or failure:
- `200 OK`: Successful request.
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: An internal error occurred.

Error responses use a standard JSON format:
```json
{
  "error": "An internal server error occurred"
}
```

## Endpoints

### Get Dashboard Data

Retrieves current dashboard metrics.

```bash
curl http://localhost:3000/api/dashboard
```

### Get Trades

Retrieves historical trades.

**Query Parameters:**
- `limit` (number): Defaults to 50.

```bash
curl "http://localhost:3000/api/trades?limit=50"
```

### Get Open Trades

Retrieves currently open trades.

```bash
curl http://localhost:3000/api/trades/open
```

### Get Signals

Retrieves recent trading signals.

**Query Parameters:**
- `limit` (number): Defaults to 20.

```bash
curl "http://localhost:3000/api/signals?limit=20"
```

### Get News

Retrieves recent AI-analyzed news.

**Query Parameters:**
- `limit` (number): Defaults to 20.

```bash
curl "http://localhost:3000/api/news?limit=20"
```

### Get Portfolio

Retrieves the current portfolio balance and positions.

```bash
curl http://localhost:3000/api/portfolio
```

### Get Statistics

Retrieves overall bot statistics.

```bash
curl http://localhost:3000/api/stats
```

### API Health

Retrieves the basic health status of the API.

```bash
curl http://localhost:3000/api/health
```

### External Health Monitor

Retrieves a detailed snapshot of system health.

```bash
curl http://localhost:3000/health
```
