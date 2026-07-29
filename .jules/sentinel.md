## 2024-05-10 - [Fix Authorization Bypass in `/logs` command]
**Vulnerability:** The `/logs` command in `src/enhancedBot.ts` lacked an authorization check, allowing any user to read system PM2 logs, which is a severe authorization bypass and information disclosure vulnerability.
**Learning:** In Telegraf, if multiple `bot.command('name', ...)` handlers are defined for the same command, the first one registered will match and execute, masking any subsequent definitions.
**Prevention:** Always ensure the very first handler registered for a command includes all necessary authorization checks (like `process.env.ADMIN_CHAT_ID` verification).
## 2026-07-29 - [Fix Missing Auth on Sensitive Trading Commands]
**Vulnerability:** The `/orders`, `/cancelorder`, `/liveportfolio`, and `/livetrade` commands in `src/enhancedBot.ts` lacked authorization checks, allowing any user interacting with the bot to view or modify live trading data.
**Learning:** Always explicitly enforce admin authorization logic within each individual sensitive command handler, as global middleware or implicit assumptions are easily bypassed.
**Prevention:** Use a fail-closed pattern like `if (!adminChat || ctx.chat?.id.toString() !== adminChat)` for all commands that interact with real API keys or sensitive financial data.
