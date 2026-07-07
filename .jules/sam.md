
## 2026-07-07 - [API Reference Documentation]
**Learning:** Automatically generating comprehensive API docs requires mapping exact payload interfaces (like Trade, Signal, Portfolio, BotStats, HealthSnapshot) and route definitions (like /api/trades, /health, /api/health) to ensure accuracy, alongside documenting implicit features like unauthenticated access and custom memory-based rate limiting.
**Action:** Always inspect the actual interface definitions and middleware code (e.g., rate limits) directly in source files before writing API reference docs to avoid hallucinating structures.
