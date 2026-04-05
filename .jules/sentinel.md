## 2024-05-24 - [Hardcoded API Key Removed in TradingViewService]
**Vulnerability:** A hardcoded API key placeholder (`YOUR_FREE_API_KEY`) was present directly in the source code of `TradingViewService.ts`.
**Learning:** Hardcoding credentials, even placeholders, creates a risk of developers accidentally committing real keys if they overwrite the placeholder locally and commit the file.
**Prevention:** Always use environment variables (e.g., `process.env.ALPHAVANTAGE_API_KEY`) with fallback defaults for configurable secrets instead of embedding placeholders directly in code.

## 2025-02-23 - [Information Disclosure via Raw Error Messages in Express Handlers]
**Vulnerability:** API endpoints in `src/webServer.ts` were returning raw `error.message` strings directly to the client (e.g., `res.status(500).json({ error: error.message });`).
**Learning:** Returning unhandled exception messages to the client can leak sensitive application details, stack traces, or internal server configurations.
**Prevention:** Always log the detailed error internally (e.g., using `withLogContext().error()`) and return a generic, user-facing error message like `"Internal server error"` to the client.
