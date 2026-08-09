import { BacktestEngine } from '../src/services/backtestEngine';
import { DataFrame, OHLCVCandle } from '../src/types/dataframe';
import { IStrategy, StrategyMetadata } from '../src/types/strategy';
import {
    BacktestExecutionConfig,
    BacktestExecutionTrade,
} from '../src/types/backtestExecution';

const HOUR = 60 * 60 * 1000;

function candles(prices: number[], start = Date.UTC(2026, 0, 1)): OHLCVCandle[] {
    return prices.map((price, i) => {
        const timestamp = start + i * HOUR;
        return {
            timestamp,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 1_000,
            date: new Date(timestamp),
        };
    });
}

function config(overrides: Partial<BacktestExecutionConfig> = {}): BacktestExecutionConfig {
    return {
        strategy: 'p0.3-test',
        timerange: '2026-01-01::2026-01-10',
        timeframe: '1h',
        maxOpenTrades: 2,
        stakeAmount: 100,
        startingBalance: 1_000,
        feeOpen: 0,
        feeClose: 0,
        enableProtections: false,
        dryRunWallet: 1_000,
        ...overrides,
    };
}

interface SignalSpec {
    longEntries?: number[];
    shortEntries?: number[];
    longExits?: number[];
    shortExits?: number[];
    stakeAmount?: number | 'unlimited';
    canShort?: boolean;
}

function strategy(spec: SignalSpec): IStrategy {
    const longEntries = spec.longEntries ?? [];
    const shortEntries = spec.shortEntries ?? [];
    const longExits = spec.longExits ?? [];
    const shortExits = spec.shortExits ?? [];

    const applySignals = (frame: DataFrame): DataFrame => {
        const n = frame.close.length;
        const enterLong = new Array<number>(n).fill(0);
        const enterShort = new Array<number>(n).fill(0);
        const exitLong = new Array<number>(n).fill(0);
        const exitShort = new Array<number>(n).fill(0);
        const enterTag = new Array<string>(n).fill('p0.3-entry');
        const exitTag = new Array<string>(n).fill('p0.3-exit');

        for (const i of longEntries) if (i >= 0 && i < n) enterLong[i] = 1;
        for (const i of shortEntries) if (i >= 0 && i < n) enterShort[i] = 1;
        for (const i of longExits) if (i >= 0 && i < n) exitLong[i] = 1;
        for (const i of shortExits) if (i >= 0 && i < n) exitShort[i] = 1;

        return {
            ...frame,
            enter_long: enterLong,
            enter_short: enterShort,
            exit_long: exitLong,
            exit_short: exitShort,
            enter_tag: enterTag,
            exit_tag: exitTag,
        };
    };

    return {
        name: 'P03ExecutionStrategy',
        version: '1.0.0',
        timeframe: '1h',
        canShort: spec.canShort ?? false,
        stoploss: -0.50,
        minimalRoi: {},
        trailingStop: false,
        stakeAmount: spec.stakeAmount ?? 100,
        maxOpenTrades: 2,
        startupCandleCount: 0,
        processOnlyNewCandles: false,
        useExitSignal: true,
        exitProfitOnly: false,
        exitProfitOffset: 0,
        ignoreRoiIfEntrySignal: false,
        populateIndicators(frame: DataFrame, _metadata: StrategyMetadata): DataFrame {
            return frame;
        },
        populateEntryTrend(frame: DataFrame, _metadata: StrategyMetadata): DataFrame {
            return applySignals(frame);
        },
        populateExitTrend(frame: DataFrame, _metadata: StrategyMetadata): DataFrame {
            return applySignals(frame);
        },
    };
}

describe('BacktestEngine P0.3 capital reservation', () => {
    it('does not over-allocate capital even when maxOpenTrades still has a free slot', async () => {
        const engine = new BacktestEngine(
            strategy({
                longEntries: [0],
                shortEntries: [0],
                stakeAmount: 600,
                canShort: true,
            }),
            config({ maxOpenTrades: 2 })
        );

        const result = await engine.runBacktest(candles([100, 100, 100]));

        // The first position reserves 600. Only 400 remains, therefore a second
        // 600 position must be rejected even though maxOpenTrades=2.
        expect(result.totalTrades).toBe(1);
        expect((result.trades[0] as BacktestExecutionTrade).stakeAmount).toBe(600);
        expect(result.finalBalance).toBeCloseTo(1_000, 12);
        expect(result.maxDrawdown).toBeCloseTo(0, 12); // reservation is not an equity loss
    });

    it('includes entry fees when checking whether another position can be funded', async () => {
        const engine = new BacktestEngine(
            strategy({
                longEntries: [0],
                shortEntries: [0],
                stakeAmount: 500,
                canShort: true,
            }),
            config({ maxOpenTrades: 2, feeOpen: 0.01 })
        );

        const result = await engine.runBacktest(candles([100, 100, 100]));

        // Each entry needs 500 reserve + 5 fee. Two would require 1010.
        expect(result.totalTrades).toBe(1);
        expect(result.totalProfit).toBeCloseTo(-5, 12);
        expect(result.finalBalance).toBeCloseTo(995, 12);
    });

    it('releases reserved capital when a position closes before processing new entries', async () => {
        const engine = new BacktestEngine(
            strategy({
                longEntries: [0, 1],
                longExits: [1],
                stakeAmount: 800,
            }),
            config({ maxOpenTrades: 2 })
        );

        const result = await engine.runBacktest(candles([100, 100, 100, 100]));

        // signal(1) closes the first trade at open(2), then the same signal is
        // allowed to open the next trade because the 800 reserve has been freed.
        expect(result.totalTrades).toBe(2);
        expect(result.trades[0].exitReason).toBe('exit_signal');
        expect(result.trades[1].exitReason).toBe('backtest_end');
    });
});

describe('BacktestEngine P0.3 deterministic execution costs', () => {
    it('applies half-spread plus adverse slippage to long entry and exit fills', async () => {
        const engine = new BacktestEngine(
            strategy({ longEntries: [0], longExits: [1], stakeAmount: 100 }),
            config({
                executionModel: {
                    spreadBps: 20,       // 10 bps each side
                    slippageBps: 5,      // +5 bps adverse each fill
                    randomSlippageBps: 0,
                    seed: 7,
                },
            })
        );

        const result = await engine.runBacktest(candles([100, 100, 110]));
        const trade = result.trades[0] as BacktestExecutionTrade;

        expect(trade.entryReferencePrice).toBe(100);
        expect(trade.openRate).toBeCloseTo(100.15, 12);
        expect(trade.actualEntryPrice).toBeCloseTo(100.15, 12);
        expect(trade.exitReferencePrice).toBe(110);
        expect(trade.closeRate).toBeCloseTo(109.835, 12);
        expect(trade.actualExitPrice).toBeCloseTo(109.835, 12);
        expect(trade.entrySlippage).toBeCloseTo(0.0015, 12);
        expect(trade.exitSlippage).toBeCloseTo(0.0015, 12);

        expect(result.totalSpreadCost).toBeGreaterThan(0);
        expect(result.totalSlippageCost).toBeGreaterThan(0);
        expect(result.totalExecutionCost).toBeCloseTo(
            result.totalSpreadCost + result.totalSlippageCost,
            12
        );
        expect(trade.executionCost).toBeCloseTo(result.totalExecutionCost, 12);
    });

    it('makes execution costs reduce PnL without double-subtracting the attribution fields', async () => {
        const baseStrategy = () => strategy({ longEntries: [0], longExits: [1], stakeAmount: 100 });
        const zeroCost = await new BacktestEngine(baseStrategy(), config()).runBacktest(
            candles([100, 100, 110])
        );
        const withCost = await new BacktestEngine(
            baseStrategy(),
            config({ executionModel: { spreadBps: 20, slippageBps: 5, seed: 1 } })
        ).runBacktest(candles([100, 100, 110]));

        expect(withCost.totalProfit).toBeLessThan(zeroCost.totalProfit);
        expect(withCost.totalExecutionCost).toBeGreaterThan(0);

        // Ledger invariant remains exact: execution friction is already encoded
        // in fill prices and therefore must not be subtracted a second time.
        expect(withCost.finalBalance).toBeCloseTo(1_000 + withCost.totalProfit, 10);
    });

    it('applies adverse execution direction correctly to short positions', async () => {
        const engine = new BacktestEngine(
            strategy({
                shortEntries: [0],
                shortExits: [1],
                stakeAmount: 100,
                canShort: true,
            }),
            config({ executionModel: { spreadBps: 20, slippageBps: 5 } })
        );

        const result = await engine.runBacktest(candles([100, 100, 90]));
        const trade = result.trades[0] as BacktestExecutionTrade;

        // Short entry is a SELL => adverse fill below reference.
        expect(trade.openRate).toBeCloseTo(99.85, 12);
        // Short exit is a BUY => adverse fill above reference.
        expect(trade.closeRate).toBeCloseTo(90.135, 12);
        expect(trade.profit).toBeGreaterThan(0);
    });

    it('produces structurally identical results for the same data, config and seed', async () => {
        const makeEngine = () => new BacktestEngine(
            strategy({ longEntries: [0, 2], longExits: [1, 3], stakeAmount: 100 }),
            config({
                executionModel: {
                    spreadBps: 8,
                    slippageBps: 2,
                    randomSlippageBps: 12,
                    seed: 42,
                },
            })
        );
        const data = candles([100, 100, 105, 102, 108]);

        const first = await makeEngine().runBacktest(data);
        const second = await makeEngine().runBacktest(data);

        expect(JSON.stringify(first)).toBe(JSON.stringify(second));
        expect(first.trades.map(t => t.id)).toEqual(second.trades.map(t => t.id));
    });

    it('changes stochastic fills when the seed changes', async () => {
        const run = async (seed: number) => new BacktestEngine(
            strategy({ longEntries: [0], longExits: [1], stakeAmount: 100 }),
            config({ executionModel: { randomSlippageBps: 20, seed } })
        ).runBacktest(candles([100, 100, 110]));

        const seedOne = await run(1);
        const seedTwo = await run(2);

        expect(seedOne.trades[0].openRate).not.toBeCloseTo(seedTwo.trades[0].openRate, 12);
    });

    it('rejects invalid execution-cost configuration instead of silently producing nonsense fills', () => {
        expect(() => new BacktestEngine(
            strategy({}),
            config({ executionModel: { spreadBps: -1 } })
        )).toThrow(/executionModel\.spreadBps/);

        expect(() => new BacktestEngine(
            strategy({}),
            config({ executionModel: { spreadBps: 10_000, slippageBps: 5_001 } })
        )).toThrow(/worst-case adverse move/);
    });
});
