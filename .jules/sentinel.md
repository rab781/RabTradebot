## 2024-05-24 - [Hardcoded API Key Removed in TradingViewService]
**Vulnerability:** A hardcoded API key placeholder (`YOUR_FREE_API_KEY`) was present directly in the source code of `TradingViewService.ts`.
**Learning:** Hardcoding credentials, even placeholders, creates a risk of developers accidentally committing real keys if they overwrite the placeholder locally and commit the file.
**Prevention:** Always use environment variables (e.g., `process.env.ALPHAVANTAGE_API_KEY`) with fallback defaults for configurable secrets instead of embedding placeholders directly in code.
## 2024-05-24 - [SQL Injection in better-sqlite3 String Interpolation]
**Vulnerability:** The `getBestBacktestResult` method dynamically interpolated a variable (`metric`) directly into the `ORDER BY` clause using template literals (``), enabling potential SQL injection since column names cannot be parameterized.
**Learning:** TypeScript type narrowing (`'sharpeRatio' | 'totalProfitPct' | 'winRate'`) is erased at runtime. If malicious inputs bypass compile-time checks, template literals in SQL queries become vulnerable, even if parameterized queries are used elsewhere.
**Prevention:** When dynamically ordering or selecting columns in SQL, explicitly validate the dynamic input against a hardcoded array of allowed column names (whitelist) before inserting it into the query string.
