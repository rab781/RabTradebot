## 2024-05-24 - [Hardcoded API Key Removed in TradingViewService]
**Vulnerability:** A hardcoded API key placeholder (`YOUR_FREE_API_KEY`) was present directly in the source code of `TradingViewService.ts`.
**Learning:** Hardcoding credentials, even placeholders, creates a risk of developers accidentally committing real keys if they overwrite the placeholder locally and commit the file.
**Prevention:** Always use environment variables (e.g., `process.env.ALPHAVANTAGE_API_KEY`) with fallback defaults for configurable secrets instead of embedding placeholders directly in code.
## 2024-05-24 - [SQL Injection via Dynamic ORDER BY]
**Vulnerability:** The `getBestBacktestResult` function in `database.ts` used a dynamic `ORDER BY ${metric}` clause. Although `metric` was restricted via a TypeScript union (`'sharpeRatio' | 'totalProfitPct' | 'winRate'`), this type constraint is erased at runtime, allowing potential SQL injection if malicious runtime input reaches the function.
**Learning:** Relying solely on TypeScript type unions for SQL identifier safety is insufficient because TypeScript provides no runtime safety.
**Prevention:** Always enforce runtime whitelisting for dynamic SQL identifiers to prevent injection, even when TypeScript types seemingly restrict the possible values.
## 2024-05-24 - [Express Information Disclosure and Missing Security Headers]
**Vulnerability:** The web server was leaking information via the default `X-Powered-By` header and lacked essential security headers like `X-XSS-Protection`, `Content-Security-Policy`, and `Referrer-Policy`.
**Learning:** Default Express configurations are not secure out-of-the-box and can aid attackers in reconnaissance.
**Prevention:** Always disable the `x-powered-by` header and implement comprehensive security headers (CSP, XSS protection, Referrer Policy) using custom middleware when external tools like `helmet` are intentionally excluded.
