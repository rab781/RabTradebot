
## 2025-02-14 - [Missing Authorization on Sensitive Commands]
**Vulnerability:** Several sensitive Telegram commands (`/orders`, `/cancelorder`, `/liveportfolio`, `/livetrade`) and their corresponding inline actions lack admin authorization checks.
**Learning:** In Telegraf bots, missing explicit authorization on commands enables anyone to trigger actions. Both the text command `bot.command` and their inline callback actions `bot.action` must enforce admin authorization.
**Prevention:** Explicitly verify `ctx.chat?.id` against `process.env.ADMIN_CHAT_ID` at the start of all sensitive command/action handlers using fail-closed logic.
