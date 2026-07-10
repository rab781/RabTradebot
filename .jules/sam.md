## 2024-05-24 - Documenting APIs with ignored directories
**Learning:** The `docs/` folder was fully ignored in `.gitignore` (`docs/`), which prevents Git from even looking inside it. Simply adding an exclusion rule like `!docs/API_REFERENCE.md` after the `docs/` rule does not work because Git never traverses the directory.
**Action:** When adding specific tracked files to an otherwise ignored directory, change the directory ignore rule to ignore its contents instead (e.g., change `docs/` to `docs/*`), then append the exclusion rule (`!docs/API_REFERENCE.md`).
## 2024-05-24 - Documenting APIs with ignored directories
**Learning:** The `docs/` folder was fully ignored in `.gitignore` (`docs/`), which prevents Git from even looking inside it. Simply adding an exclusion rule like `!docs/API_REFERENCE.md` after the `docs/` rule does not work because Git never traverses the directory.
**Action:** When adding specific tracked files to an otherwise ignored directory, change the directory ignore rule to ignore its contents instead (e.g., change `docs/` to `docs/*`), then append the exclusion rule (`!docs/API_REFERENCE.md`).
