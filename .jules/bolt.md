## 2025-05-18 - [node_modules tracked in git]
**Learning:** This repository tracks portions of `node_modules` in git. `npm install` modifies these files, causing them to appear as staged/dirty.
**Action:** Always use `git checkout HEAD node_modules` (and `.package-lock.json`) before committing to avoid accidental changes to these files.

## 2025-05-18 - [Optimizing Daily Returns Calculation in BacktestEngine]
**Learning:** `Array.reduce` inside of an `Array.from(Map.entries())` loop combined with `toISOString().split('T')[0]` inside a loop is incredibly slow when calculating daily returns for many trades. Creating arrays and splitting strings within iterations caused an O(n) task to be much slower than necessary (taking ~80ms instead of ~5ms for 50,000 trades).
**Action:** When grouping objects by day in a high-frequency or large dataset loop, bypass intermediate string operations and arrays. Use integer keys like `Math.floor(timestamp / 86400000)` combined with a single `Map` to accumulate values linearly.
## 2025-05-18 - [Hot-path Object.entries allocation overhead]
**Learning:** In backtesting and paper trading engines, calling `Object.entries(this.strategy.minimalRoi)` inside `checkRoi` created massive allocation overhead because it ran for every open trade on every simulated candle, slowing down evaluations significantly.
**Action:** Pre-compute and sort strategy configurations (like `minimalRoi`) in the constructor into a static array (`this.sortedRoi`), bypassing the repeated dynamic object allocation for a ~35x speedup in the evaluation method.

## 2026-03-05 - [Parallelizing Independent API Calls]
**Learning:** In services orchestrating multiple distinct external API requests (e.g., fetching data from different timeframes or pulling separate datasets like order books vs historical candles), doing them sequentially creates a waterfall effect that drastically hurts performance due to cumulative network latency.
**Action:** Always inspect sequential asynchronous calls (`await a(); await b();`). If they do not depend on each other's output, wrap them in `Promise.all([a(), b()])` to fetch data concurrently.

## 2024-05-24 - [Avoid Array.slice() inside hot paths]
**Learning:** Calling `Array.prototype.slice()` and creating new arrays during tight iteration loops (like inside `extractFeatures` which processes large data arrays) introduces massive garbage collection and allocation overhead in Node.js.
**Action:** When creating statistical or data-extraction helper methods, design signatures to accept optional `startIndex` and `length` bound parameters and iterate using standard `for` loops. This enables traversing slices of existing pre-allocated arrays (in an SoA manner) without reallocating intermediate arrays for every sliding window calculation.

## 2025-05-18 - [Optimizing Multiple Custom Indicator Loops in Strategies]
**Learning:** In strategy files like `OpenClawStrategy.ts`, calculating multiple custom indicators (like `bbWidth`, `volumeRatio`, `volatility`, etc.) in separate iterative loops that use `Array.push` and nested array calculations (`Array.slice`, `Array.reduce`) creates massive allocation overhead and O(N*M) time complexity.
**Action:** Consolidate these iterations into a single, pre-allocated `for` loop (`new Array(length).fill(0)`), pre-calculate variables like `returns` once to avoid repeated slices/reduces inside rolling windows, and combine the index lookups to reduce garbage collection pressure. This can yield a >3x speedup on custom indicator population in strategies.
## 2025-05-24 - [O(N*M) Allocation bottlenecks in Indicator Calculations]
**Learning:** In `OpenClawStrategy.ts`, calculating rolling volatility (standard deviation) over a dataset by using nested loops that repeatedly instantiate arrays (`const returns = []`), push to them, and then compute metrics via `.reduce()` creates massive O(N*M) overhead from closure creation and garbage collection.
**Action:** Optimize rolling indicator loops by pre-allocating result arrays (`new Array(len).fill(0)`), pre-calculating the base unit (e.g., all step-to-step returns) in a single O(N) pass, and then using a rolling loop of primitive variables to compute the sum and variance.

## 2025-05-24 - [O(N) vs O(N*M) in Sliding Window Calculations]
**Learning:** In `DataFrameBuilder.getSMA`, calculating a simple moving average by using `.slice().reduce()` inside a loop over the entire dataset creates a massive O(N * K) overhead (where K is the period). By maintaining a sliding window sum (adding the new value and subtracting the old value as the window moves), the time complexity is reduced to O(N), resulting in a ~4x speedup for a period of 200.
**Action:** Always look for opportunities to replace nested loops or higher-order array methods (like `.slice().reduce()`) with a sliding window approach for calculations over a rolling period.

## 2025-05-24 - [Pre-allocating Arrays vs Array.push()]
**Learning:** In `DataFrameBuilder` helper methods (`getTypicalPrice`, `getPercentageChange`, `getEMA`, `crossedAbove`, `crossedBelow`), dynamically resizing arrays using `.push()` or creating new arrays with `.map()` is significantly slower than pre-allocating an array of the exact required size (`new Array(len)`) and using a standard `for` loop to fill it.
**Action:** When the output array size is known in advance (which is almost always the case for indicator/feature calculations), pre-allocate the array and use direct index assignment for maximum performance in Node.js.

## 2025-05-25 - [Object.entries overhead in hot loops]
**Learning:** In `DataFrameBuilder.slice`, replacing `Object.entries(this.data)` with a `for...of` loop over a cached `columnNames` array significantly reduces object allocation and iteration overhead, yielding ~30% faster slicing in performance-critical paths.
**Action:** Slicing happens frequently in rolling indicators. Caching `Object.keys()` prevents repeated array allocation and iteration overhead from `Object.entries()` in hot loops.

## 2025-05-25 - [Pre-allocating columnar arrays]
**Learning:** In `DataFrameBuilder.fromCandles`, using a single-pass `for` loop with pre-allocated arrays (`new Array(len)`) is significantly faster (~3-4x speedup) for columnar data generation than using iterative `.push()` inside `.forEach()` callbacks.
**Action:** If a dataframe is empty during initialization, pre-allocate arrays and fill them using a single loop. This avoids the overhead of repeated `Array.push()` calls and callback closures.

## 2025-05-25 - [Math.max/min spread operator stack overflow on large arrays]
**Learning:** Using `Math.max(...array)` or `Math.min(...array)` on very large arrays (e.g., > 65,535 elements) throws a `RangeError: Maximum call stack size exceeded` because the V8 engine has a hard limit on the number of arguments passed to a function. In `DataManager.getDataSummary`, combining `flatMap` with `Math.max` on datasets of ~200k items caused crashes and enormous memory allocation overhead.
**Action:** When finding min/max values in potentially large arrays (like historical datasets), always use a manual `for` loop to accumulate the min/max values linearly without spreading.
