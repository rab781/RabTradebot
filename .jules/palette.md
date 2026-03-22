## 2025-03-18 - [Add visual distinction to Live Trading vs Sim]
**Learning:** Telegram bots can benefit from visually distinct warning emojis for destructive/real-money actions (like starting a live trade) versus safe actions (like paper trading).
**Action:** Update the 'livestart' and related buttons to use explicit warning/real money indicators like 🔴 to ensure users understand they are using real funds.

## 2023-10-24 - Clean Up Loading Messages
**Learning:** Leaving "loading" or "analyzing" messages in chat-based interfaces clutters the conversation history, leading to a poorer UX.
**Action:** Always capture the ID of temporary/loading messages and use `deleteMessage` before delivering the final response to maintain a clean chat UI.
