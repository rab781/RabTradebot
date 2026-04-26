## 2024-05-01 - [Add CSP and disable x-powered-by headers]
**Vulnerability:** Missing Content-Security-Policy header and active `x-powered-by` header.
**Learning:** `src/webServer.ts` uses custom headers rather than `helmet`.
**Prevention:** Add security headers to the existing custom middleware, rather than adding a new dependency.
