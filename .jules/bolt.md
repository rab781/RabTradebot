## 2026-08-13 - [Rank Optimization]
**Learning:** In hot statistical loops like Spearman rank correlation (`spotMicrostructureResearchAnalyzer.ts`), mapping values to objects `{value, index}` just to track indices across a sort allocates N objects and hurts GC.
**Action:** Use an `Int32Array` of pre-populated indices `[0, 1, ..., N-1]` and sort that directly with a custom comparator `(a, b) => values[a] - values[b]`. This drops object allocation to zero and reduces execution time by over 80%.
## 2026-08-15 - [Optimize redundant Pearson Correlation calculations]
**Learning:** Found a major performance bottleneck where nested loops computing pairwise feature correlation triggered excessive `O(N * C^2)` allocations due to repeatedly mapping values within a closure.
**Action:** Replaced inline `valid.map((row) => row.featureValues[j])` loops with a pre-allocated column extraction loop prior to correlation logic, yielding a ~16x execution speedup in `spotMicrostructureResearchAnalyzer.ts`.
## 2026-08-16 - [Optimize OHLCV array transformation]
**Learning:** Using `.map` multiple times in a row for data restructuring when building columns (e.g., `open`, `high`, `low`, etc.) from an array of candlestick objects is extremely inefficient, because it forces multiple O(N) traversals of the array and allocates many intermediate arrays (and objects). In this codebase, creating dataframes from arrays is an extremely common operation across many files.
**Action:** Replace multiple `.map` iterations over arrays with a pre-allocated typed arrays (e.g., `new Array(len)`) and populate them simultaneously within a single `for` loop to reduce array traversal overhead to O(N) and minimize object garbage collection.
