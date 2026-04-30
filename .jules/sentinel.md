## 2024-05-24 - [Hardcoded API Key Removed in TradingViewService]
**Vulnerability:** A hardcoded API key placeholder (`YOUR_FREE_API_KEY`) was present directly in the source code of `TradingViewService.ts`.
**Learning:** Hardcoding credentials, even placeholders, creates a risk of developers accidentally committing real keys if they overwrite the placeholder locally and commit the file.
**Prevention:** Always use environment variables (e.g., `process.env.ALPHAVANTAGE_API_KEY`) with fallback defaults for configurable secrets instead of embedding placeholders directly in code.
## 2024-05-24 - [SQL Injection via Dynamic ORDER BY]
**Vulnerability:** The `getBestBacktestResult` function in `database.ts` used a dynamic `ORDER BY ${metric}` clause. Although `metric` was restricted via a TypeScript union (`'sharpeRatio' | 'totalProfitPct' | 'winRate'`), this type constraint is erased at runtime, allowing potential SQL injection if malicious runtime input reaches the function.
**Learning:** Relying solely on TypeScript type unions for SQL identifier safety is insufficient because TypeScript provides no runtime safety.
**Prevention:** Always enforce runtime whitelisting for dynamic SQL identifiers to prevent injection, even when TypeScript types seemingly restrict the possible values.
## 2026-04-30 - [Added Security Headers and Disabled x-powered-by]
**Vulnerability:** Missing security headers (CSP, X-XSS-Protection) and exposed backend technology stack via x-powered-by header in Express app.
**Learning:** Adding custom security headers manually is required when external dependencies (like Helmet) are deliberately avoided in the setup. Default Express setup leaves 'x-powered-by' enabled, disclosing framework info.
**Prevention:** Explicitly use app.disable('x-powered-by') and configure custom middleware to attach comprehensive security headers for robust defense-in-depth.
