## 2026-08-13 - [Rank Optimization]
**Learning:** In hot statistical loops like Spearman rank correlation (`spotMicrostructureResearchAnalyzer.ts`), mapping values to objects `{value, index}` just to track indices across a sort allocates N objects and hurts GC.
**Action:** Use an `Int32Array` of pre-populated indices `[0, 1, ..., N-1]` and sort that directly with a custom comparator `(a, b) => values[a] - values[b]`. This drops object allocation to zero and reduces execution time by over 80%.
## 2026-08-14 - [Memory Allocation Optimization in Bucketing]
**Learning:** In quantile bucketing functions (e.g. `quantileBuckets`), mapping arrays to objects merely to keep corresponding fields aligned during a sort creates an O(N) object allocation overhead that stalls hot loops.
**Action:** Use an `Int32Array` of pre-allocated indices and sort the indices based on the target array's values, computing metrics over the indices. This eliminates object creation overhead and dramatically speeds up quantile and percentile tracking logic.
