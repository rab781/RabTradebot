# API Reference

The RabTradebot provides a REST API and WebSocket connection to interact with the bot programmatically and receive real-time updates.

## Authentication
Currently, the REST API endpoints provided do not require authentication, but restrict CORS origins based on the `CORS_ORIGIN` environment variable. Ensure this is configured securely in production to prevent unauthorized access.

## Rate Limiting
All `/api/*` endpoints are strictly rate-limited to prevent abuse:
- **Limit:** 100 requests per 60-second window per IP address.
- **Exceeded:** If the limit is exceeded, the server responds with a `429 Too Many Requests` status code and the following JSON payload:
  ```json
  { "error": "Too many requests, please try again later." }
  ```

## Pagination
Several endpoints return lists of data and support pagination via query parameters:
- `limit` (number): The maximum number of items to return. Defaults vary by endpoint.

## Error Handling
The API returns standard HTTP status codes:
- `200 OK`: Successful request.
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: An unexpected error occurred on the server. The response will include:
  ```json
  { "error": "An internal server error occurred" }
  ```
- `503 Service Unavailable`: Returned by the `/health` endpoint if the overall system status is down.

---

## REST API Endpoints

### Get Dashboard Data
Returns an aggregated summary of the bot's state for dashboard views.

**GET** `/api/dashboard`

**Response (200 OK)**
Returns a JSON object containing current dashboard metrics.

### Get Trades
Retrieves a list of recent trades.

**GET** `/api/trades`

**Query Parameters**
- `limit` (optional): Maximum number of trades to return. Defaults to `50`.

**Response (200 OK)**
Returns a JSON array of trade objects.

### Get Open Trades
Retrieves a list of currently open trades.

**GET** `/api/trades/open`

**Response (200 OK)**
Returns a JSON array of open trade objects.

### Get Signals
Retrieves a list of recent trading signals.

**GET** `/api/signals`

**Query Parameters**
- `limit` (optional): Maximum number of signals to return. Defaults to `20`.

**Response (200 OK)**
Returns a JSON array of signal objects.

### Get News
Retrieves a list of recent news items and their AI-analyzed sentiment.

**GET** `/api/news`

**Query Parameters**
- `limit` (optional): Maximum number of news items to return. Defaults to `20`.

**Response (200 OK)**
Returns a JSON array of news objects.

### Get Portfolio
Retrieves the current portfolio state, including balances and overall performance metrics.

**GET** `/api/portfolio`

**Response (200 OK)**
Returns a JSON object representing the portfolio.

### Get Bot Stats
Retrieves operational statistics about the bot (e.g., number of commands processed, start time).

**GET** `/api/stats`

**Response (200 OK)**
Returns a JSON object containing bot statistics.

### Get Health Status (Internal)
Basic health check endpoint.

**GET** `/api/health`

**Response (200 OK)**
```json
{
  "status": "OK",
  "timestamp": "2023-10-27T12:00:00.000Z",
  "uptime": 3600.5
}
```

### Get External Monitoring Status
Comprehensive health check endpoint intended for external monitoring services, checking component connectivity and memory usage.

**GET** `/health`

**Responses**
- **200 OK**: System is healthy.
- **503 Service Unavailable**: One or more critical components are down.

**Response Body Example**
```json
{
  "status": "up",
  "timestamp": "2023-10-27T12:00:00.000Z",
  "uptime": 3600.5,
  "memoryUsageMb": 150.2,
  "requestCount": 42,
  "components": {
    "binance": "up",
    "database": "up",
    "telegram": "up"
  }
}
```

---

## WebSockets
The server provides a WebSocket connection for real-time updates using Socket.IO.

**Connection**
Connect to the server using a Socket.IO client:
```javascript
import { io } from "socket.io-client";
const socket = io("http://localhost:3000"); // Or your server URL
```

### Events Received from Server

#### `dashboard`
Sent immediately upon connection to provide the initial dashboard state.
- **Payload:** Dashboard data object.

#### `trade`
Emitted when a new trade is executed or an existing trade is updated.
- **Payload:** Trade object.

#### `signal`
Emitted when a new trading signal is generated.
- **Payload:** Signal object.

#### `news`
Emitted when new market news is processed and analyzed.
- **Payload:** News object.

#### `portfolio`
Emitted when the portfolio balance or state changes.
- **Payload:** Portfolio object.
