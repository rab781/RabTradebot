## 2025-05-18 - [Restrict Overly Permissive CORS]
**Vulnerability:** The web server component (`src/webServer.ts`) exposed its APIs and WebSocket via `app.use(cors())` (which defaults to `*`) and explicitly `origin: '*'`. This allowed any external domain to make cross-origin requests, read sensitive dashboard data, and potentially hijack bot operations if a user visited a malicious site.
**Learning:** This codebase lacked a centralized security configuration for the dashboard, leading to default permissive settings during initial development.
**Prevention:** Always restrict CORS `origin` to intended clients (e.g., `localhost` or specific domains via environment variables like `CORS_ORIGIN`). Do not use `origin: '*'` in applications that handle authenticated or sensitive user state.
