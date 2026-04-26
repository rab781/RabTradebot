## 2025-03-18 - [Add visual distinction to Live Trading vs Sim]
**Learning:** Telegram bots can benefit from visually distinct warning emojis for destructive/real-money actions (like starting a live trade) versus safe actions (like paper trading).
**Action:** Update the 'livestart' and related buttons to use explicit warning/real money indicators like 🔴 to ensure users understand they are using real funds.
## 2024-03-26 - Delete Transient Async Loading Messages in Telegraf Bots
**Learning:** In Telegram bot interfaces, leaving async status messages (e.g., "🔄 Analyzing...", "🔄 Calculating S/R...") permanently in the chat history clutters the conversation flow and degrades the readability of the final result. Users prefer the temporary message to be replaced or deleted once the true data arrives.
**Action:** Always capture the `message_id` of temporary loading prompts (e.g., `const loading = await ctx.reply(...)`) and safely delete them (`try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) {}`) before sending the final result or handling errors in inline actions. Ensure this is done in a `finally` block or on both success and error paths.
## 2024-05-18 - Fix Layout Jumping
**Learning:** Telegram chat history can jump jarringly if we reply after deleting a loading message from a finally block because the finally block runs last. We should define a `responseText` variable, set it during `try`/`catch`, and reply with it *after* the `try...catch...finally` completes, allowing the deletion to happen beforehand.
**Action:** Always send final replies after temporary message deletion blocks (or after `finally` blocks where deletions occur) to prevent layout jumping.
