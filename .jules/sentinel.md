## 2024-05-24 - [Hardcoded API Key Removed in TradingViewService]
**Vulnerability:** A hardcoded API key placeholder (`YOUR_FREE_API_KEY`) was present directly in the source code of `TradingViewService.ts`.
**Learning:** Hardcoding credentials, even placeholders, creates a risk of developers accidentally committing real keys if they overwrite the placeholder locally and commit the file.
**Prevention:** Always use environment variables (e.g., `process.env.ALPHAVANTAGE_API_KEY`) with fallback defaults for configurable secrets instead of embedding placeholders directly in code.
## 2024-05-24 - [SQL Injection via Dynamic ORDER BY]
**Vulnerability:** The `getBestBacktestResult` function in `database.ts` used a dynamic `ORDER BY ${metric}` clause. Although `metric` was restricted via a TypeScript union (`'sharpeRatio' | 'totalProfitPct' | 'winRate'`), this type constraint is erased at runtime, allowing potential SQL injection if malicious runtime input reaches the function.
**Learning:** Relying solely on TypeScript type unions for SQL identifier safety is insufficient because TypeScript provides no runtime safety.
**Prevention:** Always enforce runtime whitelisting for dynamic SQL identifiers to prevent injection, even when TypeScript types seemingly restrict the possible values.
## 2024-05-24 - [Rate Limiting Middleware Placement]
**Vulnerability:** A custom rate limiter middleware placed before `cors` will return a `429` status on exceeding the limit, but without the appropriate CORS headers. If the frontend is on a different origin, this leads to generic CORS errors rather than properly readable rate limit statuses and headers like `Retry-After`. If placed globally before `express.static`, legitimate static asset requests also consume rate limits.
**Learning:** Proper middleware placement is critical. CORS headers must be added *before* rate limit blocks execution. Rate limits on API routes should not unintentionally rate limit static assets unless explicitly intended.
**Prevention:** Apply CORS middleware and static asset serving *before* generic custom rate limiting, or restrict the rate limiter to specific `/api` routes.
