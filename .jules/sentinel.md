## 2024-05-10 - [Fix Authorization Bypass in `/logs` command]
**Vulnerability:** The `/logs` command in `src/enhancedBot.ts` lacked an authorization check, allowing any user to read system PM2 logs, which is a severe authorization bypass and information disclosure vulnerability.
**Learning:** In Telegraf, if multiple `bot.command('name', ...)` handlers are defined for the same command, the first one registered will match and execute, masking any subsequent definitions.
**Prevention:** Always ensure the very first handler registered for a command includes all necessary authorization checks (like `process.env.ADMIN_CHAT_ID` verification).
## 2024-05-10 - [Fix Authorization Bypass in live trading and sensitive commands]
**Vulnerability:** Several sensitive commands (`/orders`, `/cancelorder`, `/liveportfolio`, `/livetrade`) in `src/enhancedBot.ts` lacked proper admin authorization checks, allowing any user to view or alter live trading configurations and balances.
**Learning:** High-impact commands that manage live executions and PII/sensitive data must always be protected with authorization checks (`process.env.ADMIN_CHAT_ID`), especially in an application with no overarching authorization middleware.
**Prevention:** Always mandate an authorization check block at the top of handler methods for commands performing high-privilege operations. Ensure to use fail-closed logic if `ADMIN_CHAT_ID` is omitted.
