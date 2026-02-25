## 2024-05-22 - [Optimization] Pre-calculate Loop Constants
**Learning:** Pre-calculating static configuration (e.g., parsing `minimalRoi` object entries into a sorted array) in the constructor avoids repetitive object allocation and parsing in hot loops, yielding significant performance gains (e.g., ~56% in `BacktestEngine`).
**Action:** Always inspect hot loops for invariant calculations or object transformations that can be hoisted to initialization.
