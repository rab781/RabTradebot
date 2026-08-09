import { BacktestEngine } from '../src/services/backtestEngine';
import { DataFrame, OHLCVCandle } from '../src/types/dataframe';
import { BacktestConfig, IStrategy, StrategyMetadata } from '../src/types/strategy';

const HOUR = 60 * 60 * 1000;

function makeCandles(prices: number[], start = Date.UTC(2026, 0, 1)): OHLCVCandle[] {
    return prices.map((close, i) => {
        const timestamp = start + i * HOUR;
        return {
            timestamp,
            open: close,
            high: close,
            low: close,
            close,
            volume: 1_000,
            date: new Date(timestamp),
        };
    });
}

function makeConfig(overrides: Partial<BacktestConfig> = {}): BacktestConfig {
    return {
        strategy: 'p0-test',
        timerange: '2026-01-01::2026-01-10',
        timeframe: '1h',
        maxOpenTrades: 1,
        stakeAmount: 100,
        startingBalance: 1_000,
        feeOpen: 0,
        feeClose: 0,
        enableProtections: false,
        dryRunWallet: 1_000,
        ...overrides,
    };
}

function makeStrategy(entryIndexes: number[], exitIndexes: number[], stakeAmount = 100): IStrategy {
    const addSignals = (frame: DataFrame): DataFrame => {
        const n = frame.close.length;
        const enterLong = new Array<number>(n).fill(0);
        const enterShort = new Array<number>(n).fill(0);
        const exitLong = new Array<number>(n).fill(0);
        const exitShort = new Array<number>(n).fill(0);
        const enterTag = new Array<string>(n).fill('p0-entry');
        const exitTag = new Array<string>(n).fill('p0-exit');

        entryIndexes.forEach(i => { if (i >= 0 && i < n) enterLong[i] = 1; });
        exitIndexes.forEach(i => { if (i >= 0 && i < n) exitLong[i] = 1; });

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
        name: 'P0AccountingStrategy',
        version: '1.0.0',
        timeframe: '1h',
        canShort: false,
        stoploss: -0.50,
        minimalRoi: {},
        trailingStop: false,
        stakeAmount,
        maxOpenTrades: 1,
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
            return addSignals(frame);
        },
        populateExitTrend(frame: DataFrame, _metadata: StrategyMetadata): DataFrame {
            return addSignals(frame);
        },
    };
}

describe('BacktestEngine P0 accounting invariants', () => {
    it('charges both entry and exit fees in net PnL', async () => {
        const engine = new BacktestEngine(
            makeStrategy([0], [2]),
            makeConfig({ feeOpen: 0.001, feeClose: 0.001 })
        );

        const result = await engine.runBacktest(makeCandles([100, 100, 105, 110]));
        expect(result.totalTrades).toBe(1);
        expect(result.trades[0].fee).toBeCloseTo(0.10, 10);
        expect(result.trades[0].profit).toBeCloseTo(9.79, 10);
        expect(result.totalProfit).toBeCloseTo(9.79, 10);
        expect(result.finalBalance).toBeCloseTo(1009.79, 10);
    });

    it('keeps realized losses in the equity path and drawdown', async () => {
        const engine = new BacktestEngine(
            makeStrategy([0, 2], [1, 4]),
            makeConfig()
        );

        // Trade 1: 100 -> 90 = -10. Trade 2: 100 -> 105 = +5.
        // The realized -10 must remain in account equity after trade 1 closes.
        const result = await engine.runBacktest(makeCandles([100, 100, 90, 100, 105, 105]));
        expect(result.totalProfit).toBeCloseTo(-5, 10);
        expect(result.finalBalance).toBeCloseTo(995, 10);
        expect(result.maxDrawdown).toBeCloseTo(10, 10);
        expect(result.maxDrawdownPct).toBeCloseTo(1, 10);
    });

    it('calculates Profit Factor from gross profits divided by gross losses', async () => {
        const engine = new BacktestEngine(
            makeStrategy([0, 2, 4], [1, 3, 5]),
            makeConfig()
        );

        // +10, +10, -10 => PF = 20 / 10 = 2.
        const result = await engine.runBacktest(makeCandles([100, 100, 110, 100, 110, 100, 90]));
        expect(result.profitFactor).toBeCloseTo(2, 10);
    });

    it('does not count breakeven trades as losses', async () => {
        const engine = new BacktestEngine(
            makeStrategy([0, 2], [1, 3]),
            makeConfig()
        );

        const result = await engine.runBacktest(makeCandles([100, 100, 100, 100, 90]));
        expect(result.totalTrades).toBe(2);
        expect(result.profitableTrades).toBe(0);
        expect(result.lossTrades).toBe(1);
    });

    it('computes daily percentage returns, not dollar PnL', () => {
        const engine = new BacktestEngine(makeStrategy([], []), makeConfig());
        const calculateDailyReturns = (engine as any).calculateDailyReturns.bind(engine);

        const base = Date.UTC(2026, 0, 1);
        const curveA = [
            { date: new Date(base), equity: 1010 },
            { date: new Date(base + 24 * HOUR), equity: 1005 },
        ];
        const curveB = [
            { date: new Date(base), equity: 10100 },
            { date: new Date(base + 24 * HOUR), equity: 10050 },
        ];

        const returnsA = calculateDailyReturns(curveA, 1000);
        const returnsB = calculateDailyReturns(curveB, 10000);
        expect(returnsA[0]).toBeCloseTo(0.01, 12);
        expect(returnsA[1]).toBeCloseTo(-5 / 1010, 12);
        expect(returnsA).toHaveLength(returnsB.length);
        returnsA.forEach((value: number, i: number) => {
            expect(value).toBeCloseTo(returnsB[i], 12);
        });
    });
});

describe('BacktestEngine P0 execution semantics', () => {
    function candle(
        hour: number,
        open: number,
        high: number,
        low: number,
        close: number
    ): OHLCVCandle {
        const timestamp = Date.UTC(2026, 0, 1, hour);
        return { timestamp, open, high, low, close, volume: 1_000, date: new Date(timestamp) };
    }

    it('executes close(t) signals at open(t+1), never at the same close', async () => {
        const engine = new BacktestEngine(makeStrategy([0], [1]), makeConfig());
        const result = await engine.runBacktest([
            candle(0, 100, 101, 99, 100),
            candle(1, 120, 126, 119, 125),
            candle(2, 130, 132, 127, 128),
        ]);

        expect(result.totalTrades).toBe(1);
        expect(result.trades[0].openRate).toBe(120);
        expect(result.trades[0].closeRate).toBe(130);
        expect(result.trades[0].openDate).toEqual(new Date(Date.UTC(2026, 0, 1, 1)));
        expect(result.trades[0].closeDate).toEqual(new Date(Date.UTC(2026, 0, 1, 2)));
        expect(result.trades[0].exitReason).toBe('exit_signal');
    });

    it('triggers a long stop from candle.low even when candle.close is above the stop', async () => {
        const strategy = makeStrategy([0], []);
        strategy.stoploss = -0.03;
        const engine = new BacktestEngine(strategy, makeConfig());

        const result = await engine.runBacktest([
            candle(0, 100, 101, 99, 100),
            candle(1, 100, 103, 96, 102),
        ]);

        expect(result.totalTrades).toBe(1);
        expect(result.trades[0].exitReason).toBe('stoploss');
        expect(result.trades[0].openRate).toBe(100);
        expect(result.trades[0].closeRate).toBeCloseTo(97, 12);
        expect(result.trades[0].profit).toBeCloseTo(-3, 12);
    });

    it('fills at the worse candle.open when price gaps through the stop', async () => {
        const strategy = makeStrategy([0], []);
        strategy.stoploss = -0.03;
        const engine = new BacktestEngine(strategy, makeConfig());

        const result = await engine.runBacktest([
            candle(0, 100, 101, 99, 100),
            candle(1, 100, 102, 98, 101),
            candle(2, 90, 92, 88, 91),
        ]);

        expect(result.trades[0].exitReason).toBe('stoploss');
        expect(result.trades[0].closeRate).toBe(90);
        expect(result.trades[0].profit).toBeCloseTo(-10, 12);
    });

    it('uses conservative stop-first ordering when stop and ROI are both touched', async () => {
        const strategy = makeStrategy([0], []);
        strategy.stoploss = -0.05;
        strategy.minimalRoi = { '0': 0.05 };
        const engine = new BacktestEngine(strategy, makeConfig());

        const result = await engine.runBacktest([
            candle(0, 100, 101, 99, 100),
            candle(1, 100, 106, 94, 102),
        ]);

        expect(result.trades[0].exitReason).toBe('stoploss');
        expect(result.trades[0].closeRate).toBe(95);
        expect(result.trades[0].profit).toBeCloseTo(-5, 12);
    });

    it('makes ROI thresholds fee-aware so target PnL is net of trading fees', async () => {
        const strategy = makeStrategy([0], []);
        strategy.stoploss = -0.50;
        strategy.minimalRoi = { '0': 0.05 };
        const engine = new BacktestEngine(
            strategy,
            makeConfig({ feeOpen: 0.001, feeClose: 0.001 })
        );

        const result = await engine.runBacktest([
            candle(0, 100, 101, 99, 100),
            candle(1, 100, 105.30, 100, 104),
        ]);

        expect(result.trades[0].exitReason).toBe('roi');
        expect(result.trades[0].profitPct).toBeCloseTo(5, 10);
    });

    it('does not execute a signal generated on the final candle', async () => {
        const strategy = makeStrategy([1], []);
        const engine = new BacktestEngine(strategy, makeConfig());
        const result = await engine.runBacktest([
            candle(0, 100, 101, 99, 100),
            candle(1, 100, 101, 99, 100),
        ]);

        expect(result.totalTrades).toBe(0);
    });
});
