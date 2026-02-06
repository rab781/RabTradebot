## 2026-02-06 - [Optimization of Technical Indicator Calculation]
**Learning:** `calculateAllIndicators` from `technicalindicators` processes the entire dataset every time, which is extremely expensive (O(N*M)). Even with caching, unconditionally running this function negates the benefits of the cache.
**Action:** Always check if the required outputs are already cached before invoking heavy calculation functions, especially when they operate on the full dataset. Added a "warm-up" cache check loop to skip calculation if full coverage exists.
