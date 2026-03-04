## 2025-05-18 - [node_modules tracked in git]
**Learning:** This repository tracks portions of `node_modules` in git. `npm install` modifies these files, causing them to appear as staged/dirty.
**Action:** Always use `git checkout HEAD node_modules` (and `.package-lock.json`) before committing to avoid accidental changes to these files.

## 2025-05-18 - [Optimizing Daily Returns Calculation in BacktestEngine]
**Learning:** `Array.reduce` inside of an `Array.from(Map.entries())` loop combined with `toISOString().split('T')[0]` inside a loop is incredibly slow when calculating daily returns for many trades. Creating arrays and splitting strings within iterations caused an O(n) task to be much slower than necessary (taking ~80ms instead of ~5ms for 50,000 trades).
**Action:** When grouping objects by day in a high-frequency or large dataset loop, bypass intermediate string operations and arrays. Use integer keys like `Math.floor(timestamp / 86400000)` combined with a single `Map` to accumulate values linearly.
## 2025-05-18 - [Hot-path Object.entries allocation overhead]
**Learning:** In backtesting and paper trading engines, calling `Object.entries(this.strategy.minimalRoi)` inside `checkRoi` created massive allocation overhead because it ran for every open trade on every simulated candle, slowing down evaluations significantly.
**Action:** Pre-compute and sort strategy configurations (like `minimalRoi`) in the constructor into a static array (`this.sortedRoi`), bypassing the repeated dynamic object allocation for a ~35x speedup in the evaluation method.
