
## 2024-07-06 - [RabTradebot API Documentation]
**Learning:** Automatically ignored documentation folders (like `docs/` in `.gitignore`) can prevent API references from being committed unless explicitly removed from the ignore list. It's crucial to document implicit behaviors like rate limiting (e.g., 100 req/min/IP) and pagination defaults that are manually enforced via Express middleware.
**Action:** Always check `.gitignore` before attempting to create documentation folders, and ensure middleware-enforced rate limits and pagination logic are explicitly detailed with complete, working payload examples when authoring API references.
