## 2024-05-24 - [Hardcoded API Key Removed in TradingViewService]
**Vulnerability:** A hardcoded API key placeholder (`YOUR_FREE_API_KEY`) was present directly in the source code of `TradingViewService.ts`.
**Learning:** Hardcoding credentials, even placeholders, creates a risk of developers accidentally committing real keys if they overwrite the placeholder locally and commit the file.
**Prevention:** Always use environment variables (e.g., `process.env.ALPHAVANTAGE_API_KEY`) with fallback defaults for configurable secrets instead of embedding placeholders directly in code.
## 2024-05-24 - [SQL Injection via Dynamic ORDER BY]
**Vulnerability:** The `getBestBacktestResult` function in `database.ts` used a dynamic `ORDER BY ${metric}` clause. Although `metric` was restricted via a TypeScript union (`'sharpeRatio' | 'totalProfitPct' | 'winRate'`), this type constraint is erased at runtime, allowing potential SQL injection if malicious runtime input reaches the function.
**Learning:** Relying solely on TypeScript type unions for SQL identifier safety is insufficient because TypeScript provides no runtime safety.
**Prevention:** Always enforce runtime whitelisting for dynamic SQL identifiers to prevent injection, even when TypeScript types seemingly restrict the possible values.
## 2024-05-24 - [Authorization Bypass in Overlapping Telegraf Commands]
**Vulnerability:** The `/logs` command in the Telegram bot had two `bot.command('logs', ...)` handlers. The first one lacked authorization checks, allowing any user to read system logs. Telegraf executes the first registered handler that matches, masking the second one which actually contained the `ADMIN_CHAT_ID` authorization logic.
**Learning:** In Telegraf, if multiple handlers are registered for the same command, the first one wins. If the first handler is missing security checks, an attacker can bypass authorization, even if a later handler implements them correctly.
**Prevention:** Always ensure the *very first* handler registered for a command includes all necessary authorization checks, or consolidate overlapping handlers into a single robust function.
