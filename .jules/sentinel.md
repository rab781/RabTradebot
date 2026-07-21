## 2024-05-10 - [Fix Authorization Bypass in `/logs` command]
**Vulnerability:** The `/logs` command in `src/enhancedBot.ts` lacked an authorization check, allowing any user to read system PM2 logs, which is a severe authorization bypass and information disclosure vulnerability.
**Learning:** In Telegraf, if multiple `bot.command('name', ...)` handlers are defined for the same command, the first one registered will match and execute, masking any subsequent definitions.
**Prevention:** Always ensure the very first handler registered for a command includes all necessary authorization checks (like `process.env.ADMIN_CHAT_ID` verification).
## 2024-05-24 - Fix duplicate handler masking security bypass
**Vulnerability:** Multiple `bot.command()` handlers for the same command (`logs`, `strategies`) masked the subsequent handlers in Telegraf.
**Learning:** In Telegraf, if duplicate commands are registered, the first one matches and executes, masking the rest. This caused a security gap as the second `/logs` handler (database error log viewing) was unreachable, preventing admins from viewing important application logs.
**Prevention:** Always search for existing command handlers before registering new ones, and verify route registration logic in bot initialization.
