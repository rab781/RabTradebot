## 2024-05-10 - [Fix Authorization Bypass in `/logs` command]
**Vulnerability:** The `/logs` command in `src/enhancedBot.ts` lacked an authorization check, allowing any user to read system PM2 logs, which is a severe authorization bypass and information disclosure vulnerability.
**Learning:** In Telegraf, if multiple `bot.command('name', ...)` handlers are defined for the same command, the first one registered will match and execute, masking any subsequent definitions.
**Prevention:** Always ensure the very first handler registered for a command includes all necessary authorization checks (like `process.env.ADMIN_CHAT_ID` verification).

## 2024-05-18 - Remove insecure file-system log reading
**Vulnerability:** The bot had a duplicate `/logs` command that read `pm2-out.log` directly from the filesystem using `fs.readFileSync` and sent its contents via Telegram, which is an insecure practice that exposes server internals.
**Learning:** Duplicate commands can bypass intended data-access layers (like the database log table) and expose file system details directly.
**Prevention:** Always read logs through a controlled, sanitized data access layer (like the `db.getRecentErrors` method used in the remaining `/logs` command) rather than raw file access.
