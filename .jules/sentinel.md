## 2024-05-24 - [Hardcoded API Key Removed in TradingViewService]
**Vulnerability:** A hardcoded API key placeholder (`YOUR_FREE_API_KEY`) was present directly in the source code of `TradingViewService.ts`.
**Learning:** Hardcoding credentials, even placeholders, creates a risk of developers accidentally committing real keys if they overwrite the placeholder locally and commit the file.
**Prevention:** Always use environment variables (e.g., `process.env.ALPHAVANTAGE_API_KEY`) with fallback defaults for configurable secrets instead of embedding placeholders directly in code.
## 2024-05-24 - [SQL Injection via Dynamic ORDER BY]
**Vulnerability:** The `getBestBacktestResult` function in `database.ts` used a dynamic `ORDER BY ${metric}` clause. Although `metric` was restricted via a TypeScript union (`'sharpeRatio' | 'totalProfitPct' | 'winRate'`), this type constraint is erased at runtime, allowing potential SQL injection if malicious runtime input reaches the function.
**Learning:** Relying solely on TypeScript type unions for SQL identifier safety is insufficient because TypeScript provides no runtime safety.
**Prevention:** Always enforce runtime whitelisting for dynamic SQL identifiers to prevent injection, even when TypeScript types seemingly restrict the possible values.
## 2024-05-24 - [Authorization Bypass on Logs Command]
**Vulnerability:** The `/logs` bot command in `enhancedBot.ts` allowed unauthorized users to fetch arbitrary log files/data because the Telegraf command handler lacked an `ADMIN_CHAT_ID` environment variable check.
**Learning:** Telegraf executes the first registered command handler for a given command. If an overlapping handler lacks authorization, any user can execute it, circumventing intended security restrictions on sensitive bot endpoints.
**Prevention:** Always verify that every command handler, especially those exposing system state or logs, strictly validates the requester's identity (e.g., against an `ADMIN_CHAT_ID`) before processing.
