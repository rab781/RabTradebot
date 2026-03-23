## 2025-03-18 - [Add visual distinction to Live Trading vs Sim]
**Learning:** Telegram bots can benefit from visually distinct warning emojis for destructive/real-money actions (like starting a live trade) versus safe actions (like paper trading).
**Action:** Update the 'livestart' and related buttons to use explicit warning/real money indicators like 🔴 to ensure users understand they are using real funds.

## 2025-03-18 - [Reduce chat clutter with loading state cleanup]
**Learning:** In conversational UIs (like Telegram bots), leaving transient async status messages (e.g., "🔄 Analyzing...") in the chat history clutters the interface and degrades the UX. Users only care about the final result.
**Action:** Always capture the message ID of loading messages and safely delete them (`try { await bot.telegram.deleteMessage(chatId, loading.message_id); } catch (_) {}`) before sending the final response.