import { BacktestConfig, BacktestResult, Trade } from './strategy';

/**
 * Synthetic execution-cost model used by the candle backtester.
 *
 * All values are deliberately expressed in basis points so the model remains
 * transparent and deterministic. The spread is the FULL quoted bid/ask spread;
 * the engine applies half of it on each side of the mid/reference price.
 */
export interface BacktestExecutionModelConfig {
    /** Full bid/ask spread in basis points. 10 bps = 0.10% total spread. */
    spreadBps?: number;

    /** Fixed adverse slippage applied to every fill, in basis points. */
    slippageBps?: number;

    /**
     * Optional additional adverse slippage sampled uniformly in [0, value].
     * Sampling uses the seeded PRNG below, so the same seed and event sequence
     * always produce exactly the same fills.
     */
    randomSlippageBps?: number;

    /** Seed for the deterministic PRNG used by randomSlippageBps. */
    seed?: number;
}

/** Backwards-compatible extension: existing BacktestConfig values remain valid. */
export interface BacktestExecutionConfig extends BacktestConfig {
    executionModel?: BacktestExecutionModelConfig;
}

/**
 * Additional audit fields emitted by the backtester. They intentionally live in
 * a backtest-specific type so the shared Trade contract does not need a breaking
 * migration during P0.
 */
export interface BacktestExecutionTrade extends Trade {
    /** Quote capital reserved while the position is open. */
    stakeAmount: number;

    /** Nominal market/reference price before spread and slippage. */
    entryReferencePrice: number;
    exitReferencePrice?: number;

    /** Quote-currency execution costs attributable to each friction component. */
    entrySpreadCost: number;
    entrySlippageCost: number;
    exitSpreadCost?: number;
    exitSlippageCost?: number;
    executionCost: number;
}

/** Backtest-level execution-cost attribution for reporting and regression tests. */
export interface BacktestExecutionResult extends BacktestResult {
    totalSpreadCost: number;
    totalSlippageCost: number;
    totalExecutionCost: number;
}
