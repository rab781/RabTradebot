## 2025-05-18 - [node_modules tracked in git]
**Learning:** This repository tracks portions of `node_modules` in git. `npm install` modifies these files, causing them to appear as staged/dirty.
**Action:** Always use `git checkout HEAD node_modules` (and `.package-lock.json`) before committing to avoid accidental changes to these files.

## 2025-05-18 - [Hot-path Object.entries allocation overhead]
**Learning:** In backtesting and paper trading engines, calling `Object.entries(this.strategy.minimalRoi)` inside `checkRoi` created massive allocation overhead because it ran for every open trade on every simulated candle, slowing down evaluations significantly.
**Action:** Pre-compute and sort strategy configurations (like `minimalRoi`) in the constructor into a static array (`this.sortedRoi`), bypassing the repeated dynamic object allocation for a ~35x speedup in the evaluation method.
