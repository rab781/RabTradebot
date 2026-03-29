## 2024-05-24 - [Hardcoded API Key Removed in TradingViewService]
**Vulnerability:** A hardcoded API key placeholder (`YOUR_FREE_API_KEY`) was present directly in the source code of `TradingViewService.ts`.
**Learning:** Hardcoding credentials, even placeholders, creates a risk of developers accidentally committing real keys if they overwrite the placeholder locally and commit the file.
**Prevention:** Always use environment variables (e.g., `process.env.ALPHAVANTAGE_API_KEY`) with fallback defaults for configurable secrets instead of embedding placeholders directly in code.
## 2024-05-24 - [Information Disclosure in API Error Handling]
**Vulnerability:** The Express routes in `src/webServer.ts` were catching exceptions and directly returning `error.message` in the 500 response JSON (e.g., `res.status(500).json({ error: error.message })`).
**Learning:** Returning unhandled exception messages directly to clients can inadvertently leak sensitive internal details, database queries, database constraints, or file paths that an attacker could use to escalate attacks or glean infrastructure secrets.
**Prevention:** Always log the actual detailed error locally using a structured logger (`withLogContext`) for debugging, and return a sanitized, generic error message (e.g., "An internal server error occurred") to external consumers in API responses.
