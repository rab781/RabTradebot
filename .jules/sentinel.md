## 2024-05-24 - [Hardcoded API Key Removed in TradingViewService]
**Vulnerability:** A hardcoded API key placeholder (`YOUR_FREE_API_KEY`) was present directly in the source code of `TradingViewService.ts`.
**Learning:** Hardcoding credentials, even placeholders, creates a risk of developers accidentally committing real keys if they overwrite the placeholder locally and commit the file.
**Prevention:** Always use environment variables (e.g., `process.env.ALPHAVANTAGE_API_KEY`) with fallback defaults for configurable secrets instead of embedding placeholders directly in code.
## 2024-05-24 - [Information Disclosure in Express Error Handlers]
**Vulnerability:** API routes were returning raw `error.message` to clients in 500 error responses, which could leak sensitive internal information (e.g. database schema details, file paths, or third-party API keys).
**Learning:** Returning raw error messages directly to the client exposes internal workings and increases the attack surface.
**Prevention:** In Express route error handlers, prevent Information Disclosure vulnerabilities by avoiding returning raw `error.message` to clients. Instead, log the specific error internally using `withLogContext` and return a generic user-facing message like 'An internal server error occurred'.
