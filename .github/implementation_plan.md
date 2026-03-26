# Phase 5 — Strategy Optimization yang Robust

## 🏛️ Architecture Overview (Software Architect Perspective)

Phase 5 adds 4 advanced optimization capabilities + 3 anti-overfitting safeguards to the existing [StrategyOptimizer](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/services/strategyOptimizer.ts#24-365) class, evolving it from a simple grid search tool into a **rigorous anti-overfitting optimization framework**.

> [!IMPORTANT]
> **Core philosophy:** The enemy of quant trading bukan "mencari parameter terbaik" — tapi **overfitting**. Setiap fitur di Phase 5 dirancang untuk **mendeteksi dan mencegah overfitting**, bukan hanya optimize.

### ADR: Monolithic StrategyOptimizer vs Separate Classes

**Decision:** Create `BayesianOptimizer` as a standalone class (`bayesianOptimizer.ts`), while WFO, Monte Carlo, and Pareto methods are added as methods on the existing [StrategyOptimizer](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/services/strategyOptimizer.ts#24-365). This keeps related backtest-based optimizations co-located while isolating the TPE algorithm (which is a fundamentally different optimization paradigm).

**Trade-off:** Slightly larger [StrategyOptimizer](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/services/strategyOptimizer.ts#24-365) class (~600 lines total) but avoids over-engineering with separate file for each statistical method. TPE needs its own class due to internal state (kernel density models, evaluation history).

### Key Design Decisions
- **No external ML library** for TPE — implement in pure TypeScript using `mathjs` (already in deps) for gaussian KDE, avoiding npm dependency bloat for a single algorithm
- **Monte Carlo is stateless** — pure function on trade array, no persistence needed
- **Pareto uses non-dominated sorting** — O(n²) acceptable since candidate set is small (<100 results)

---

## Proposed Changes

### Sprint 1 — Walk-Forward Optimization (WFO) [F5-1, F5-2, F5-3, F5-4]

> **Goal:** Validate strategy parameter robustness by testing on rolling out-of-sample data windows.

#### [MODIFY] [strategyOptimizer.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/services/strategyOptimizer.ts)

Add 3 new methods + 2 interfaces:

```typescript
// New interfaces
interface WFOWindowResult {
  window: number;
  inSampleScore: number;
  outOfSampleScore: number;
  stabilityRatio: number;  // OOS/IS (closer to 1.0 = less overfit)
  bestParams: Record<string, any>;
  backtestResult: BacktestResult;
}

interface WFOResult {
  windows: WFOWindowResult[];
  bestStableParams: Record<string, any>;
  avgStabilityRatio: number;
  summary: string;
}
```

**`walkForwardOptimize(data, inSampleRatio, numWindows)`** — Splits data into `numWindows` rolling windows, runs grid optimization on in-sample portion, and validates on out-of-sample. Selects parameters with highest stability ratio (OOS/IS score ≈ 1.0).

**`findStableParams(windows)`** — Picks parameter set with highest median OOS score across windows.

**`formatWFOSummary(result)`** — Returns formatted string for Telegram `/optimize` display.

---

**`deflatedSharpeRatio(observedSR, totalTrials, skewness, kurtosis)`** [NEW — F5-12] — Corrects Sharpe Ratio for multiple testing bias using Bailey & Lopez de Prado (2014) formula. When you test 100+ parameter combos, the "best" Sharpe is statistically inflated. DSR gives the **probability that the observed Sharpe is genuine, not luck**.

```typescript
// Key formula: adjusts for number of trials, skewness, kurtosis of returns
P(DSR) = normalCDF((SR_observed * √n) / √(1 - γ₃*SR + ((γ₄-1)/4)*SR²))
// P(DSR) > 0.95 → confident the Sharpe is real, not from data mining
```

#### [NEW] [fase5-walk-forward-optimize.test.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/tests/fase5-walk-forward-optimize.test.ts)

~21 tests covering:
- Data splitting logic (correct ratios per window)
- Stability ratio calculation (OOS/IS)
- Best parameter selection (most stable, not highest IS score)
- Edge cases: single window, empty data, all windows negative
- WFO summary formatting validation
- Integration: full WFO pipeline with mock strategy
- **DSR: more trials → higher penalty (lower DSR probability)**
- **DSR: negative skewness → higher penalty**
- **DSR: output always in [0, 1]**

---

### Sprint 2 — Bayesian Optimization with TPE [F5-5, F5-6, F5-7, F5-8]

> **Goal:** Replace brute-force grid search with intelligent parameter exploration using Tree Parzen Estimator.

#### [NEW] [bayesianOptimizer.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/services/bayesianOptimizer.ts)

New class `BayesianOptimizer`:

```typescript
class BayesianOptimizer {
  // TPE Core
  sampleNextParams(space, evaluationHistory): Record<string, any>
  splitGoodBad(history, gamma): { good, bad }  // gamma=0.25 default
  kernelDensityEstimate(samples, point): number  // Gaussian KDE
  expectedImprovement(good, bad, point): number  // p(good)/p(bad)
  
  // Main optimization loop
  async optimize(strategy, data, space, config): Promise<OptimizationResult[]>
  
  // Comparison utility
  getEfficiencyReport(bayesianResults, gridResults): string
}
```

**TPE Algorithm:** 
1. Initial random exploration (10 evals)
2. Split results into good (top 25%) and bad (bottom 75%)
3. Fit Gaussian KDE to both groups
4. Sample next point maximizing [l(x)/g(x)](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/types/dataframe.ts#130-133) ratio
5. Repeat until `maxEvals` reached

#### [MODIFY] [strategyOptimizer.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/services/strategyOptimizer.ts)

Add `optimizeMethod` option to [OptimizationConfig](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/services/strategyOptimizer.ts#5-13):

```diff
 export interface OptimizationConfig {
     maxEvals: number;
+    method: 'grid' | 'bayesian';  // default = 'bayesian'
     // ...existing fields
 }
```

#### [NEW] [fase5-bayesian-optimizer.test.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/tests/fase5-bayesian-optimizer.test.ts)

~16 tests covering:
- Good/bad split with correct gamma ratio (25%/75%)
- Gaussian KDE produces valid density values
- KDE handles single point, edge cases
- Expected improvement: p(good)/p(bad) ratio computation
- TPE converges better than random sampling
- Full Bayesian optimization loop with mock objective
- Efficiency comparison report formatting
- Parameter space handling (int, real, categorical)

---

### Sprint 3 — Monte Carlo Robustness Test [F5-9, F5-10]

> **Goal:** Stress-test strategy profitability under randomized trade ordering.

#### [MODIFY] [strategyOptimizer.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/services/strategyOptimizer.ts)

Add 2 new methods:

```typescript
interface MonteCarloResult {
  simulations: number;
  profitDistribution: { p5: number; p25: number; median: number; p75: number; p95: number };
  drawdownDistribution: { p5: number; p25: number; median: number; p75: number; p95: number };
  sharpeDistribution: { p5: number; p25: number; median: number; p75: number; p95: number };
  summary: string;
}
```

**`monteCarloTest(trades, numSimulations)`** — Fisher-Yates shuffles trade array N times, recomputes equity curve/drawdown/Sharpe for each. Returns percentile distribution.

**`formatMonteCarloSummary(result)`** — Human-readable output:
> "Dalam 95% skenario, max drawdown < 12.5%"  
> "Dalam 5% skenario terburuk, profit = -3.2%"

#### [NEW] [fase5-monte-carlo.test.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/tests/fase5-monte-carlo.test.ts)

~12 tests covering:
- Single trade → no variance in distribution
- Known trades → percentile bounds are valid (P5 < P25 < median < P75 < P95)
- All profitable trades → P5 profit is still > 0
- Empty trades array → graceful handling
- Large simulation count → stable results (within tolerance)
- Summary text formatting validation
- Profit/drawdown/Sharpe calculations correctness

---

### Sprint 4 — Multi-Objective Pareto + Anti-Overfitting [F5-11, F5-13, F5-14] + Integration

> **Goal:** Pareto trade-offs + parameter sensitivity + overfitting probability score.

#### [MODIFY] [strategyOptimizer.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/services/strategyOptimizer.ts)

**A) Pareto frontier method:**

```typescript
interface ParetoPoint {
  params: Record<string, any>;
  objectives: { returnPct: number; drawdownPct: number; winRate: number; profitFactor: number };
  isDominated: boolean;
}

interface ParetoResult {
  frontier: ParetoPoint[];    // non-dominated solutions only
  allPoints: ParetoPoint[];   // all evaluated points
  frontierSize: number;
  summary: string;
}
```

**`computeParetoFrontier(results, objectives)`** — Non-dominated sorting across optimization results. Shows Return vs Drawdown and WinRate vs ProfitFactor trade-offs.

**`formatParetoSummary(result)`** — Display frontier points and trade-off insights.

**B) Parameter Sensitivity Analysis [F5-13]:**

```typescript
interface SensitivityResult {
  paramName: string;
  sensitivityScore: number;  // std/mean of neighborhood performance (lower = more robust)
  isRobust: boolean;         // sensitivityScore < 0.3 threshold
  neighborhoodPerformance: number[];  // performance at ±10% of optimal value
}
```

**`parameterSensitivity(results, bestParams)`** — For each parameter, evaluates performance at ±10% of optimal value. If performance drops >30% → parameter is fragile ("spike"). If stable → "plateau" (robust).

**C) Overfitting Probability (PBO) [F5-14]:**

```typescript
// From WFO results: what fraction of windows have IS rank ≠ OOS rank?
PBO = count(windows where bestISParams ≠ bestOOSParams) / totalWindows
// PBO > 0.5 → strategy is likely overfit
```

**`computeOverfittingProbability(wfoResults)`** — Simple but powerful: if the "best" in-sample params consistently fail out-of-sample, the strategy is overfit. Returns probability [0, 1].

#### [MODIFY] [enhancedBot.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/src/enhancedBot.ts)

Update `/optimize` command handler to include WFO + DSR + Monte Carlo + Pareto + PBO in output.

#### [NEW] [fase5-pareto-optimization.test.ts](file:///d:/Project%20Pribadi/bot%20trading%20tele/RabTradebot/tests/fase5-pareto-optimization.test.ts)

~16 tests covering:
- Single point → always non-dominated
- Clear dominance: A > B in all objectives → B is dominated
- True Pareto frontier with 2 objectives (Return vs Drawdown)
- No duplicates in frontier
- Frontier summary formatting
- Edge case: all points identical → all on frontier
- **Sensitivity: "plateau" param → low score**
- **Sensitivity: "spike" param → high score (fragile)**
- **PBO with perfect correlation (IS = OOS) → PBO = 0**
- **PBO with random correlation → PBO ≈ 0.5**

---

## Verification Plan

### Automated Tests

Tests akan dijalankan per sprint dan secara keseluruhan:

```bash
# Sprint 1: Walk-Forward Optimization
npx jest tests/fase5-walk-forward-optimize.test.ts --verbose

# Sprint 2: Bayesian Optimizer
npx jest tests/fase5-bayesian-optimizer.test.ts --verbose

# Sprint 3: Monte Carlo
npx jest tests/fase5-monte-carlo.test.ts --verbose

# Sprint 4: Pareto
npx jest tests/fase5-pareto-optimization.test.ts --verbose

# Full Phase 5 suite
npx jest tests/fase5-* --verbose

# TypeScript compilation check (no emit)
npx tsc --noEmit
```

**Expected results per sprint:**
| Sprint | Test File | Expected Tests |
|--------|-----------|---------------|
| S1 — WFO + DSR | `fase5-walk-forward-optimize.test.ts` | ~21 tests |
| S2 — Bayesian | `fase5-bayesian-optimizer.test.ts` | ~16 tests |
| S3 — Monte Carlo | `fase5-monte-carlo.test.ts` | ~12 tests |
| S4 — Pareto + Sensitivity + PBO | `fase5-pareto-optimization.test.ts` | ~16 tests |
| **Total** | **4 test files** | **~65 tests** |

### Release Readiness Criteria (Test Results Analyzer)
- ✅ All tests pass (0 failures)
- ✅ TypeScript: 0 compile errors
- ✅ No NaN/Infinity in statistical calculations
- ✅ Edge cases handled: empty data, single element, zero variance
- ✅ DSR probability always in [0, 1]
- ✅ PBO always in [0, 1]
- ✅ Parameter sensitivity detects known "spike" vs "plateau" params
- ✅ Monte Carlo distributions are statistically valid (P5 ≤ P25 ≤ median ≤ P75 ≤ P95)
- ✅ Pareto frontier is correct (no dominated points in frontier)

### Code Review Checklist (Engineering Code Reviewer)
- 🔴 No division by zero in statistical methods
- 🔴 Fisher-Yates shuffle is correct (no bias)
- 🟡 KDE bandwidth selection is reasonable
- 🟡 Memory usage for 1000 Monte Carlo simulations
- 💭 Consistent coding style with existing fase4 tests
