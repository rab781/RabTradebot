## 2025-05-18 - [node_modules tracked in git]
**Learning:** This repository tracks portions of `node_modules` in git. `npm install` modifies these files, causing them to appear as staged/dirty.
**Action:** Always use `git checkout HEAD node_modules` (and `.package-lock.json`) before committing to avoid accidental changes to these files.

## 2025-05-23 - [Feature Extraction Optimization]
**Learning:** `FeatureEngineeringService` performs heavy calculations (O(N) * M features) inside a loop. The repeated use of `Array.slice()` for each feature calculation creates significant GC pressure and overhead.
**Action:** Replace `slice()` with direct index access and length passing to helper functions. This yields ~25-30% performance improvement by avoiding array allocations in the hot loop.
