## 2024-05-24 - [Hardcoded API Key Removed in TradingViewService]
**Vulnerability:** A hardcoded API key placeholder (`YOUR_FREE_API_KEY`) was present directly in the source code of `TradingViewService.ts`.
**Learning:** Hardcoding credentials, even placeholders, creates a risk of developers accidentally committing real keys if they overwrite the placeholder locally and commit the file.
**Prevention:** Always use environment variables (e.g., `process.env.ALPHAVANTAGE_API_KEY`) with fallback defaults for configurable secrets instead of embedding placeholders directly in code.
## 2024-05-24 - [SQL Injection Risk in Object Mapping for Update Queries]
**Vulnerability:** The `updateTrade` method in `src/database/database.ts` constructed SQL `UPDATE` queries dynamically using `Object.keys(updates)`. This meant any malicious property passed into the `updates` object could directly inject into the query structure, e.g., enabling arbitrary schema modifications.
**Learning:** Even when using parameterized variables (`@${key}`) for values in SQLite, dynamically generating column names straight from user-provided objects introduces a significant vector for SQL injection on the structure of the query itself.
**Prevention:** Always use explicit, hardcoded allowed lists (whitelist arrays) for column names when dynamically building queries, filtering out any keys that do not belong to the allowed schema prior to query construction.
