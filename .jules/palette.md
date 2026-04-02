## 2025-03-18 - [Add visual distinction to Live Trading vs Sim]
**Learning:** Telegram bots can benefit from visually distinct warning emojis for destructive/real-money actions (like starting a live trade) versus safe actions (like paper trading).
**Action:** Update the 'livestart' and related buttons to use explicit warning/real money indicators like 🔴 to ensure users understand they are using real funds.
## 2024-03-26 - Delete Transient Async Loading Messages in Telegraf Bots
**Learning:** In Telegram bot interfaces, leaving async status messages (e.g., "🔄 Analyzing...", "🔄 Calculating S/R...") permanently in the chat history clutters the conversation flow and degrades the readability of the final result. Users prefer the temporary message to be replaced or deleted once the true data arrives.
**Action:** Always capture the `message_id` of temporary loading prompts (e.g., `const loading = await ctx.reply(...)`) and safely delete them (`try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) {}`) before sending the final result or handling errors in inline actions. Ensure this is done in a `finally` block or on both success and error paths.
## 2025-04-02 - [Differentiate Safe Actions from High-Risk Actions]
**Learning:** In Telegram bots, visually grouping a safe cancellation action (like stopping a trade) with the same high-risk warning emojis (like 🔴 and "Real $") as the initiation action causes cognitive friction and makes users hesitate to click it. Safe actions should look safe.
**Action:** Use neutral, standard cancellation icons (like ⏹️) for "stop" actions, clearly distinguishing them from the destructive or high-risk "start" actions.
