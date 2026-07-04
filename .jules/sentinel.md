## 2024-05-10 - [Fix Authorization Bypass in `/logs` command]
**Vulnerability:** The `/logs` command in `src/enhancedBot.ts` lacked an authorization check, allowing any user to read system PM2 logs, which is a severe authorization bypass and information disclosure vulnerability.
**Learning:** In Telegraf, if multiple `bot.command('name', ...)` handlers are defined for the same command, the first one registered will match and execute, masking any subsequent definitions.
**Prevention:** Always ensure the very first handler registered for a command includes all necessary authorization checks (like `process.env.ADMIN_CHAT_ID` verification).

## 2026-07-04 - [Missing Content-Security-Policy Header]
**Vulnerability:** The Express web server (`src/webServer.ts`) was missing the `Content-Security-Policy` (CSP) and `X-XSS-Protection` headers, which could leave the frontend or dashboard vulnerable to Cross-Site Scripting (XSS) or data injection attacks.
**Learning:** Even though CORS was configured properly, other baseline security headers were missing from the Express configuration. While `Strict-Transport-Security` was present, CSP is essential for robust defense against content injection.
**Prevention:** In the future, ensure that `helmet` or manual header configurations systematically include CSP, X-Frame-Options, and X-XSS-Protection for all web server implementations serving API or web content.
