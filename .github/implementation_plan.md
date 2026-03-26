# Phase 6 — Production Infrastructure (DevOps & Reliability)

## 🏗️ Architecture Overview (Software Architect & DevOps Perspective)

Phase 6 marks the transition from a research/testing bot to a **production-grade financial system**. The focus shifts entirely to **reliability, observability, and scale**.

> [!IMPORTANT]
> **DevOps Philosophy:** "No manual processes, zero silent failures." We are moving from SQLite (development) to PostgreSQL (production), adding Token Bucket rate limiting to prevent Binance IP bans, and introducing structured JSON logging for auditability.

### Key Architectural Decisions
1. **Database:** SQLite is insufficient for high-concurrency production deployments (write locks). We migrate to **PostgreSQL**.
2. **Logging:** `console.log` is replaced by `pino` (fast, structured JSON logger) to allow external scraping (e.g., Datadog/Grafana).
3. **Rate Limiting:** A centralized "Token Bucket" algorithm replaces scattered `sleep()` calls to handle Binance's complex weight limits.
4. **Monitoring:** A dedicated loop monitors bot health, account equity, and websocket streams, alerting admins instantly on degradation.

---

## Proposed Changes

### Sprint 1 — Database Migration & Structured Logging [F6-1 to F6-4, F6-12 to F6-15]

> **Goal:** Establish a robust persistence layer and auditable logging system.

#### [NEW] [prisma/schema.postgres.prisma](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/prisma/schema.postgres.prisma)
- Duplicate existing schema but change `provider = "postgresql"`
- Use `@db.JsonB` for `trades`, `equityCurve`, and `parameters` arrays.
- Setup connection pool parameters in DATABASE_URL.

#### [NEW] [scripts/migrate-sqlite-to-postgres.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/scripts/migrate-sqlite-to-postgres.ts)
- Script to extract all active Trades, Orders, and user preferences from SQLite and insert them into the new Postgres schema.

#### [NEW] [src/utils/logger.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/utils/logger.ts)
- Implements `pino` logger.
- Configures environments: DEV gets `pino-pretty` (readable console), PROD gets raw JSON.
- Methods: `logger.info`, `logger.warn`, `logger.error`, `logger.debug`.

#### [MODIFY] [all src/ files]
- Replace all `console.log` and `console.error` with the new structured logger.

---

### Sprint 2 — Centalized Rate Limiter & Health Monitoring [F6-5 to F6-11]

> **Goal:** Prevent API bans and ensure the bot is always alive and healthy.

#### [NEW] [src/services/rateLimiter.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/services/rateLimiter.ts)
- **Token Bucket Algorithm Implementation.**
- Manages three separate buckets:
  1. `REST_API`: 1200 weight / minute.
  2. `ORDER`: 10 / second, 100k / day.
  3. `WS`: Max 5 streams per connection.
- Features `waitForToken(weight)` that delays execution if buckets are empty.

#### [MODIFY] [src/services/binance/binanceOrderService.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/services/binance/binanceOrderService.ts)
- Wrap all API calls (create order, cancel order, get balance) with `rateLimiter.waitForToken()`.
- Parse `X-MBX-USED-WEIGHT` header from Binance to sync local token counts with the server.

#### [NEW] [src/services/healthMonitor.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/services/healthMonitor.ts)
- Periodic loop (e.g., every 5 mins) checking:
  - WebSocket connection status.
  - Binance REST API latency.
  - Current account drawdown > threshold?
  - Model accuracy drop?
- Emits Telegram alerts to ADMIN_CHAT_ID on failures.

#### [MODIFY] [src/enhancedBot.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/enhancedBot.ts)
- Implement `/healthcheck` command.

---

### Sprint 3 — Process Management & Deployment [F6-16 to F6-20]

> **Goal:** Automate deployments and ensure the Node.js process auto-restarts on crash.

#### [NEW] [ecosystem.config.js](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/ecosystem.config.js)
- PM2 configuration.
- `max_memory_restart: '512M'`, `autorestart: true`.
- Log rotation settings.

#### [NEW] [scripts/deploy.sh](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/scripts/deploy.sh)
- Zero-touch deployment bash script: `git pull`, `npm ci`, `prisma migrate`, `npm run build`, `pm2 restart`.

#### [NEW] [Dockerfile](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/Dockerfile) (Optional but Recommended)
- Multi-stage build for containerized deployments.

---

### Sprint 4 — Comprehensive Unit Testing to 80% Coverage [F6-20 to F6-24]

> **Goal:** Reach production-ready test coverage thresholds.

#### [NEW] Test Files
1. `tests/fase6-binanceOrderService.test.ts`: Mock HTTP calls, check signature generation, step size rounding, error mapping.
2. `tests/fase6-riskMonitorLoop.test.ts`: Test SL/TP triggers, trailing stop tracking, circuit breakers without hitting real API.
3. `tests/fase6-rateLimiter.test.ts`: Validate Token Bucket refilling logic, delay calculations.
4. `tests/fase6-featureEngineering.test.ts`: Matrix dimension checks, NaN handling.

---

## 🛡️ Verification & QA Plan (Testing Analyzer & Code Reviewer)

### 🔴 Mandatory Security Rules (Code Reviewer)
- **Secrets:** Logs (`logger.ts`) MUST explicitly redact API keys, Secret keys, and JWT tokens.
- **Transactions:** Any database write for trades must be wrapped in transactions (or logical equivalents) to prevent partial fills causing DB state corruption.

### 📊 Quality Assurance (Test Results Analyzer)
1. **Coverage Standard:** Execute `npm test -- --coverage`. Minimum acceptance criteria is **80% Line and Branch coverage** for core services (`binanceOrderService`, `rateLimiter`, `riskMonitorLoop`).
2. **Rate Limiter Benchmark:** Test Token Bucket under 50 concurrent requests to ensure it correctly queues and processes without exceeding the rate limit.
3. **Recovery Test:** Simulate a network disconnect and verify `healthMonitor.ts` fires the Telegram alert and attempts reconnection.
