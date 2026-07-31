## 2024-05-10 - [Fix Authorization Bypass in `/logs` command]
**Vulnerability:** The `/logs` command in `src/enhancedBot.ts` lacked an authorization check, allowing any user to read system PM2 logs, which is a severe authorization bypass and information disclosure vulnerability.
**Learning:** In Telegraf, if multiple `bot.command('name', ...)` handlers are defined for the same command, the first one registered will match and execute, masking any subsequent definitions.
**Prevention:** Always ensure the very first handler registered for a command includes all necessary authorization checks (like `process.env.ADMIN_CHAT_ID` verification).
## 2025-02-14 - Fix authorization bypass in Telegram bot commands
**Vulnerability:** Missing authorization on sensitive Telegram commands (/orders, /cancelorder, /liveportfolio, /livetrade) and their inline equivalents, allowing any user to trigger real-money trading or expose PII/sensitive data.
**Learning:** Both text commands (`bot.command`) and inline button callbacks (`bot.action`) can execute the same sensitive actions but often lack uniform authorization checks. Missing checks on inline handlers (`bot.action(/^run:(.+)$/)`) act as a backdoor if only the text commands are protected.
**Prevention:** Ensure all sensitive features enforce admin authorization using fail-closed logic by explicitly checking if `ctx.chat?.id` matches `process.env.ADMIN_CHAT_ID`, regardless of whether the action is triggered via text command or inline button.
