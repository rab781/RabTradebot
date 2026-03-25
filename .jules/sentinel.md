## 2024-05-24 - [Hardcoded API Key Removed in TradingViewService]
**Vulnerability:** A hardcoded API key placeholder (`YOUR_FREE_API_KEY`) was present directly in the source code of `TradingViewService.ts`.
**Learning:** Hardcoding credentials, even placeholders, creates a risk of developers accidentally committing real keys if they overwrite the placeholder locally and commit the file.
**Prevention:** Always use environment variables (e.g., `process.env.ALPHAVANTAGE_API_KEY`) with fallback defaults for configurable secrets instead of embedding placeholders directly in code.
## 2024-03-25 - Missing Security Headers in Express App
**Vulnerability:** Missing basic HTTP security headers (X-Powered-By leakage, X-Frame-Options, X-Content-Type-Options) in the web dashboard server.
**Learning:** The Express app was left vulnerable to basic fingerprinting and clickjacking attacks. Using `helmet` is standard, but due to constraints on modifying `node_modules`, manual middleware is required.
**Prevention:** Implement custom middleware to set security headers and disable `x-powered-by` by default on all Express instances.
