## 2025-05-18 - [node_modules tracked in git]
**Learning:** This repository tracks portions of `node_modules` in git. `npm install` modifies these files, causing them to appear as staged/dirty.
**Action:** Always use `git checkout HEAD node_modules` (and `.package-lock.json`) before committing to avoid accidental changes to these files.
## 2025-05-18 - [Optimized Feature Extraction loops]
**Learning:** Inside high-frequency code paths iterating over large datasets (like `extractVolumeFeatures` and statistical helpers in `FeatureEngineeringService`), using `Array.prototype.reduce` and `Array.prototype.slice` causes significant overhead due to callback execution and memory reallocation. Replacing them with direct index-accessed `for` loops yields huge performance wins.
**Action:** Avoid `.reduce()` and `.slice()` when calculating statistical values (mean, stdDev, skewness, kurtosis, correlation, etc.) inside tight loops. Use standard `for` loops and index arithmetic instead.
