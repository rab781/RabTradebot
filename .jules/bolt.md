## 2025-05-18 - [node_modules tracked in git]
**Learning:** This repository tracks portions of `node_modules` in git. `npm install` modifies these files, causing them to appear as staged/dirty.
**Action:** Always use `git checkout HEAD node_modules` (and `.package-lock.json`) before committing to avoid accidental changes to these files.

## 2025-05-22 - Backtest Engine ROI Optimization
**Learning:** `Object.entries()` and `parseInt()` inside tight loops (like `checkRoi` in backtesting) can be surprisingly expensive, especially when strategies have complex ROI configurations. Pre-calculating and sorting these structures in the constructor yielded a ~3x performance improvement in heavy load scenarios.
**Action:** Always look for static configuration data that is being processed repeatedly in hot loops. Pre-process it in the constructor or initialization phase.
