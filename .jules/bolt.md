## 2025-05-18 - [node_modules tracked in git]
**Learning:** This repository tracks portions of `node_modules` in git. `npm install` modifies these files, causing them to appear as staged/dirty.
**Action:** Always use `git checkout HEAD node_modules` (and `.package-lock.json`) before committing to avoid accidental changes to these files.

## 2025-05-18 - [Feature Engineering Optimization]
**Learning:** `FeatureEngineeringService` had O(N*M) complexity due to repeated `slice` and `reduce` calls inside the loop. Pre-calculating rolling statistics in O(N) reduced feature extraction time by ~42% (511ms -> 295ms).
**Action:** Always look for sliding window optimizations when processing time-series data. Pre-calculate rolling stats (mean, stdDev) when possible.
