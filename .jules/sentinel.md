
## 2025-02-14 - [Missing Authorization on Sensitive Commands]
**Vulnerability:** Several sensitive Telegram commands (`/orders`, `/cancelorder`, `/liveportfolio`, `/livetrade`) and their corresponding inline actions lack admin authorization checks.
**Learning:** In Telegraf bots, missing explicit authorization on commands enables anyone to trigger actions. Both the text command `bot.command` and their inline callback actions `bot.action` must enforce admin authorization.
**Prevention:** Explicitly verify `ctx.chat?.id` against `process.env.ADMIN_CHAT_ID` at the start of all sensitive command/action handlers using fail-closed logic.
## 2026-08-14 - Fix authorization bypass in API
**Vulnerability:** Sensitive inline button actions (`cancelorder`, `livetrade`) were accessible to any user because they were missing from the `sensitiveActions` array in the inline button callback router (`bot.action(/^run:(.+)$/)`).
**Learning:** In Telegraf, authorization logic applied only to text commands (`bot.command`) does not automatically apply to corresponding inline button callbacks (`bot.action`). Both must enforce authorization independently.
**Prevention:** Always verify that all interaction vectors (text commands, inline callbacks, callback queries) that trigger sensitive logic explicitly check user authorization before executing.
