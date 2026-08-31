
## 2026-07-27 - API Documentation Generation
**Learning:** Automatically ignored documentation directories in `.gitignore` (like `docs/`) prevent new reference files from being committed, unless explicitly excluded.
**Action:** Always verify repository ignore rules when creating new documentation files, and un-ignore targeted reference docs by modifying the rule to `docs/*` and appending `!docs/API_REFERENCE.md` to keep the directory clean while allowing vital docs.
