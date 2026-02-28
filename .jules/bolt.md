## 2025-05-18 - [node_modules tracked in git]
**Learning:** This repository tracks portions of `node_modules` in git. `npm install` modifies these files, causing them to appear as staged/dirty.
**Action:** Always use `git checkout HEAD node_modules` (and `.package-lock.json`) before committing to avoid accidental changes to these files.

## 2025-05-18 - [Array.reduce overhead in hot paths]
**Learning:** `Array.prototype.reduce()`, `map()`, and `filter()` add significant overhead (allocation and callback latency) when used inside inner loops (like per-candle backtest evaluations or feature extraction).
**Action:** Use single-pass `for` loops instead of array iteration methods for math reductions in performance-critical code paths to minimize overhead.
