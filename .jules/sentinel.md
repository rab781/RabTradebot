## 2024-05-10 - [Fix Authorization Bypass in `/logs` command]
**Vulnerability:** The `/logs` command in `src/enhancedBot.ts` lacked an authorization check, allowing any user to read system PM2 logs, which is a severe authorization bypass and information disclosure vulnerability.
**Learning:** In Telegraf, if multiple `bot.command('name', ...)` handlers are defined for the same command, the first one registered will match and execute, masking any subsequent definitions.
**Prevention:** Always ensure the very first handler registered for a command includes all necessary authorization checks (like `process.env.ADMIN_CHAT_ID` verification).
## 2026-07-30 - [Fix Authorization Bypass in sensitive Telegram actions]
**Vulnerability:** The `/orders`, `/cancelorder`, `/liveportfolio`, and `/livetrade` commands in `src/enhancedBot.ts`, as well as their corresponding inline callback queries, lacked an authorization check, allowing any Telegram user to execute real-money trades and view portfolio balances if they discovered the bot.
**Learning:** In Telegram bots (like Telegraf), sensitive features are often accessible via multiple vectors: text commands (`bot.command`) and inline button callbacks (`bot.action`). Securing only one vector leaves the other exploitable.
**Prevention:** Always identify all entry points to a sensitive feature (commands, callbacks, middleware) and enforce authorization checks uniformly across all vectors using fail-closed logic.
