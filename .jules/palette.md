## 2025-03-22 - [Differentiate destructive vs safe actions in inline menus]
**Learning:** While it is important to add warning emojis (like 🔴) to destructive/real-money actions (like starting a live trade), it is equally important NOT to apply them to safe/cancellation actions (like stopping a trade or viewing a portfolio) within the same context. Overusing warning indicators causes cognitive dissonance and reduces their effectiveness.
**Action:** Ensure visually distinct warning emojis and labels are applied ONLY to actual destructive/risky actions, while using safe/neutral emojis (like ⏹️ or 💼) for non-destructive actions, even if they pertain to the live trading system.

## 2025-03-18 - [Add visual distinction to Live Trading vs Sim]
**Learning:** Telegram bots can benefit from visually distinct warning emojis for destructive/real-money actions (like starting a live trade) versus safe actions (like paper trading).
**Action:** Update the 'livestart' and related buttons to use explicit warning/real money indicators like 🔴 to ensure users understand they are using real funds.
## 2024-03-26 - Delete Transient Async Loading Messages in Telegraf Bots
**Learning:** In Telegram bot interfaces, leaving async status messages (e.g., "🔄 Analyzing...", "🔄 Calculating S/R...") permanently in the chat history clutters the conversation flow and degrades the readability of the final result. Users prefer the temporary message to be replaced or deleted once the true data arrives.
**Action:** Always capture the `message_id` of temporary loading prompts (e.g., `const loading = await ctx.reply(...)`) and safely delete them (`try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) {}`) before sending the final result or handling errors in inline actions. Ensure this is done in a `finally` block or on both success and error paths.
