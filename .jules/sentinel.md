## 2026-07-27 - Auth Bypass in Telegram Bot Commands
**Vulnerability:** Live trading and sensitive Telegram bot commands (`/orders`, `/cancelorder`, `/liveportfolio`, `/livetrade`) were lacking proper authorization checks to ensure the requesting user matches the `ADMIN_CHAT_ID`.
**Learning:** This allowed anyone interacting with the bot on Telegram to view the portfolio, view orders, cancel orders, or start/stop live trading if the Binance API keys were configured, as the check was completely missing in those route handlers.
**Prevention:** All handlers for sensitive commands in `src/enhancedBot.ts` should explicitly verify `ctx.chat?.id.toString() === process.env.ADMIN_CHAT_ID` before proceeding.

## 2026-07-27 - Auth Bypass in Telegram Bot Commands
**Vulnerability:** Live trading and sensitive Telegram bot commands (`/orders`, `/cancelorder`, `/liveportfolio`, `/livetrade`) were lacking proper authorization checks to ensure the requesting user matches the `ADMIN_CHAT_ID`.
**Learning:** This allowed anyone interacting with the bot on Telegram to view the portfolio, view orders, cancel orders, or start/stop live trading if the Binance API keys were configured. When implementing the fix, a "fail-open" logic was initially used (`if (adminChat && ...)`), which is insecure.
**Prevention:** All handlers for sensitive commands in `src/enhancedBot.ts` should explicitly verify `!adminChat || ctx.chat?.id.toString() !== adminChat` before proceeding. Always use fail-closed logic for security checks.
