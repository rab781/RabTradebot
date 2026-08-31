## 2023-10-27 - Creating API documentation for the Web Server
**Learning:** Adding new documentation files in directories that are ignored by default in `.gitignore` requires modifying the `.gitignore` rule. Replacing `docs/` with `docs/*` and `!docs/API_REFERENCE.md` ensures the directory is still ignored except for the specific file we want to track.
**Action:** When adding documentation files (like API reference docs) to ignored directories, always check and update `.gitignore` explicitly to ensure the new files are correctly tracked by version control.
