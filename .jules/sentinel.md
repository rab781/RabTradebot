
## 2025-02-14 - [Missing Authorization on Sensitive Commands]
**Vulnerability:** Several sensitive Telegram commands (`/orders`, `/cancelorder`, `/liveportfolio`, `/livetrade`) and their corresponding inline actions lack admin authorization checks.
**Learning:** In Telegraf bots, missing explicit authorization on commands enables anyone to trigger actions. Both the text command `bot.command` and their inline callback actions `bot.action` must enforce admin authorization.
**Prevention:** Explicitly verify `ctx.chat?.id` against `process.env.ADMIN_CHAT_ID` at the start of all sensitive command/action handlers using fail-closed logic.
## 2026-08-20 - Fix authorization bypass in sensitive inline actions
**Vulnerability:** Telegram inline callbacks (bot.action) for sensitive actions like livetrade and cancelorder were missing admin authorization checks that were present in the text commands (bot.command).
**Learning:** In Telegram bots, both text commands and inline callbacks must enforce authorization checks independently. Protecting only the text command leaves a bypass via inline buttons.
**Prevention:** Always verify that both UI paths (text commands and inline callbacks) for sensitive features implement identical authorization logic.
