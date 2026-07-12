
## 2024-07-12 - [API Reference Documentation]
**Learning:** The Express Web Server (`src/webServer.ts`) exposed critical real-time trading state but lacked documentation. Explicitly defining JSON response payloads (using `src/services/botStateManager.ts` and `src/services/healthMonitor.ts` for Groundedness) and including rate-limiting (100 req/min) prevents developers from hitting `429 Too Many Requests` unexpectedly.
**Action:** Always provide explicit JSON response schemas alongside curl examples and edge-case behaviors (like rate-limiting rules and pagination defaults) in API Docs, ensuring they reflect actual implementation state.
