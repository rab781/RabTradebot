import { BacktestEngine } from '../src/services/backtestEngine';
import { OHLCVCandle, DataFrame } from '../src/types/dataframe';
import { BacktestConfig, IStrategy, StrategyMetadata } from '../src/types/strategy';

function makeCandles(prices: number[]): OHLCVCandle[] {
    const baseTime = 1_700_000_000_000;
    return prices.map((close, idx) => {
        const timestamp = baseTime + idx * 60 * 60 * 1000;
        return {
            timestamp,
            open: close - 0.1,
            high: close + 0.3,
            low: close - 0.4,
            close,
            volume: 1000 + idx * 5,
            date: new Date(timestamp),
        };
    });
}

function makeConfig(): BacktestConfig {
    return {
        strategy: 'test',
        timerange: '2024-01-01::2024-01-10',
        timeframe: '1h',
        maxOpenTrades: 1,
        stakeAmount: 100,
        startingBalance: 1000,
        feeOpen: 0,
        feeClose: 0,
        enableProtections: false,
        dryRunWallet: 1000,
    };
}

function makeStrategy(entryIndexes: number[], exitIndexes: number[], stoploss = -0.05): IStrategy {
    const setSignals = (frame: DataFrame, entries: number[], exits: number[]): DataFrame => {
        const length = frame.close.length;
        const enterLong = new Array<number>(length).fill(0);
        const enterShort = new Array<number>(length).fill(0);
        const exitLong = new Array<number>(length).fill(0);
        const exitShort = new Array<number>(length).fill(0);
        const enterTag = new Array<string>(length).fill('entry');
        const exitTag = new Array<string>(length).fill('exit');

        for (const index of entries) {
            if (index >= 0 && index < length) {
                enterLong[index] = 1;
            }
        }

        for (const index of exits) {
            if (index >= 0 && index < length) {
                exitLong[index] = 1;
            }
        }

        return {
            ...frame,
            enter_long: enterLong,
            enter_short: enterShort,
            enter_tag: enterTag,
            exit_long: exitLong,
            exit_short: exitShort,
            exit_tag: exitTag,
        };
    };

    return {
        name: 'TestStrategy',
        version: '1.0.0',
        timeframe: '1h',
        canShort: false,
        stoploss,
        minimalRoi: {},
        trailingStop: false,
        stakeAmount: 100,
        maxOpenTrades: 1,
        startupCandleCount: 2,
        processOnlyNewCandles: false,
        useExitSignal: true,
        exitProfitOnly: false,
        exitProfitOffset: 0,
        ignoreRoiIfEntrySignal: false,
        populateIndicators(dataframe: DataFrame, _metadata: StrategyMetadata): DataFrame {
            return dataframe;
        },
        populateEntryTrend(dataframe: DataFrame, _metadata: StrategyMetadata): DataFrame {
            return setSignals(dataframe, entryIndexes, []);
        },
        populateExitTrend(dataframe: DataFrame, _metadata: StrategyMetadata): DataFrame {
            return setSignals(dataframe, entryIndexes, exitIndexes);
        },
    };
}

function makeOhlcCandles(
    rows: Array<{
        open: number;
        high?: number;
        low?: number;
        close: number;
    }>
): OHLCVCandle[] {
    const baseTime = 1_710_000_000_000;

    return rows.map((row, index) => {
        const timestamp = baseTime + index * 60 * 60 * 1000;

        return {
            timestamp,
            open: row.open,
            high: row.high ?? Math.max(row.open, row.close) + 1,
            low: row.low ?? Math.min(row.open, row.close) - 1,
            close: row.close,
            volume: 1000,
            date: new Date(timestamp),
        };
    });
}

describe('BacktestEngine', () => {
    it('calculates profitable result on exit signal', async () => {
        const candles = makeCandles([100, 101, 102, 104, 106, 108, 110]);
        const strategy = makeStrategy([2], [5]);
        const engine = new BacktestEngine(strategy, makeConfig());

        const result = await engine.runBacktest(candles);

        expect(result.totalTrades).toBe(1);
        expect(result.profitableTrades).toBe(1);
        expect(result.lossTrades).toBe(0);
        expect(result.totalProfit).toBeGreaterThan(0);
        expect(result.winRate).toBe(100);
        expect(result.bestTrade?.exitReason).toBe('exit_signal');
    });

    it('triggers stoploss when price drops through stoploss rate', async () => {
        const candles = makeCandles([100, 101, 102, 100, 98, 95, 94]);
        const strategy = makeStrategy([2], [], -0.03);
        const engine = new BacktestEngine(strategy, makeConfig());

        const result = await engine.runBacktest(candles);

        expect(result.totalTrades).toBeGreaterThan(0);
        expect(result.lossTrades).toBeGreaterThan(0);
        expect(result.totalProfit).toBeLessThan(0);
        expect(result.worstTrade?.exitReason).toBe('stoploss');
        expect(result.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    });

    it('returns stable zero metrics when no trades are opened', async () => {
        const candles = makeCandles([100, 100.5, 101, 100.8, 101.2, 101.5]);
        const strategy = makeStrategy([], []);
        const engine = new BacktestEngine(strategy, makeConfig());

        const result = await engine.runBacktest(candles);

        expect(result.totalTrades).toBe(0);
        expect(result.totalProfit).toBe(0);
        expect(result.winRate).toBe(0);
        expect(result.profitFactor).toBe(0);
        expect(result.bestTrade).toBeNull();
        expect(result.worstTrade).toBeNull();
    });
    it('uses realized balance for sizing the next unlimited position', async () => {
        const candles = makeOhlcCandles([
            { open: 100, close: 100 }, // 0
            { open: 100, close: 100 }, // 1
            { open: 100, close: 100 }, // 2 -> entry signal #1
            { open: 100, close: 100 }, // 3 -> expected entry #1
            { open: 110, close: 110 }, // 4 -> exit signal #1
            { open: 110, close: 110 }, // 5 -> expected exit #1
            { open: 100, close: 100 }, // 6 -> entry signal #2
            { open: 100, close: 100 }, // 7 -> expected entry #2
            { open: 100, close: 100 }, // 8 -> exit signal #2
            { open: 100, close: 100 }, // 9 -> expected exit #2
        ]);

        const strategy = makeStrategy([2, 6], [4, 8], -0.50);
        strategy.stakeAmount = 'unlimited';

        const config = {
            ...makeConfig(),
            maxOpenTrades: 2,
            startingBalance: 1000,
        };

        const engine = new BacktestEngine(strategy, config);
        const result = await engine.runBacktest(candles);

        expect(result.totalTrades).toBe(2);

        const firstTrade = result.trades[0];
        const secondTrade = result.trades[1];

        const firstStake = firstTrade.amount * firstTrade.openRate;
        const secondStake = secondTrade.amount * secondTrade.openRate;

        // Starting balance $1000 / 2 slots
        expect(firstStake).toBeCloseTo(500, 6);

        // First trade earns:
        // $500 / $100 = 5 units
        // 5 * ($110 - $100) = +$50
        //
        // New balance = $1050
        // Second stake = $1050 / 2 = $525
        expect(secondStake).toBeCloseTo(525, 6);

        expect(result.finalBalance).toBeCloseTo(1050, 6);
    });
    it('deducts both entry fee and exit fee from net trade profit', async () => {
        const candles = makeOhlcCandles([
            { open: 100, close: 100 },
            { open: 100, close: 100 },
            { open: 100, close: 100 }, // entry signal
            { open: 100, close: 100 }, // entry
            { open: 100, close: 100 }, // exit signal
            { open: 100, close: 100 }, // exit
        ]);

        const strategy = makeStrategy([2], [4], -0.50);

        const config = {
            ...makeConfig(),

            // 1% entry + 1% exit
            feeOpen: 0.01,
            feeClose: 0.01,
        };

        const engine = new BacktestEngine(strategy, config);
        const result = await engine.runBacktest(candles);

        expect(result.totalTrades).toBe(1);

        const trade = result.trades[0];

        // Stake = $100
        // Gross PnL = $0
        // Entry fee = $1
        // Exit fee = $1
        // Net = -$2

        expect(trade.fee).toBeCloseTo(1, 6);
        expect(trade.profit).toBeCloseTo(-2, 6);
        expect(result.totalProfit).toBeCloseTo(-2, 6);
        expect(result.finalBalance).toBeCloseTo(998, 6);
    });
    it('executes an entry signal on the next candle open', async () => {
        const candles = makeOhlcCandles([
            { open: 100, close: 100 },
            { open: 100, close: 100 },

            // Candle N
            {
                open: 100,
                high: 101,
                low: 99,
                close: 100,
            },

            // Candle N+1 gaps higher
            {
                open: 110,
                high: 112,
                low: 109,
                close: 111,
            },

            {
                open: 111,
                close: 111,
            },

            {
                open: 111,
                close: 111,
            },
        ]);

        const strategy = makeStrategy([2], [4], -0.50);

        const engine = new BacktestEngine(strategy, makeConfig());
        const result = await engine.runBacktest(candles);

        expect(result.totalTrades).toBe(1);

        const trade = result.trades[0];

        // Signal known only after candle #2 closes.
        expect(trade.openDate.getTime())
            .toBe(candles[3].date.getTime());

        // Therefore fill at next candle OPEN,
        // not signal candle close.
        expect(trade.openRate).toBeCloseTo(110, 6);

        expect(trade.openRate).not.toBeCloseTo(
            candles[2].close,
            6
        );
    });
    it('triggers long stoploss when candle low crosses the stop even if close does not', async () => {
        const candles = makeOhlcCandles([
            { open: 100, close: 100 },
            { open: 100, close: 100 },

            // Entry signal
            {
                open: 100,
                high: 101,
                low: 99,
                close: 100,
            },

            // Trade enters here @ 100
            {
                open: 100,
                high: 101,
                low: 99,
                close: 100,
            },

            // Intrabar hits 94,
            // but candle CLOSE returns to 99.
            {
                open: 100,
                high: 102,
                low: 94,
                close: 99,
            },

            {
                open: 99,
                high: 100,
                low: 98,
                close: 99,
            },
        ]);

        const strategy = makeStrategy(
            [2],
            [],
            -0.05
        );

        const engine = new BacktestEngine(
            strategy,
            makeConfig()
        );

        const result = await engine.runBacktest(candles);

        expect(result.totalTrades).toBe(1);

        const trade = result.trades[0];

        expect(trade.exitReason).toBe('stoploss');

        // Entry 100, stoploss -5%
        expect(trade.closeRate).toBeCloseTo(95, 6);

        expect(trade.closeDate?.getTime())
            .toBe(candles[4].date.getTime());

        // Important:
        // close = 99 > stop 95
        // but low = 94 < stop 95
        expect(candles[4].close).toBeGreaterThan(95);
        expect(candles[4].low).toBeLessThan(95);
    });
    it('evaluates ROI using the current candle price instead of cached previous profit', async () => {
        const candles = makeOhlcCandles([
            { open: 100, close: 100 },
            { open: 100, close: 100 },

            // Entry signal
            { open: 100, close: 100 },

            // Entry @ open 100
            { open: 100, close: 100 },

            // Price reaches +6%.
            // ROI target = +5%.
            {
                open: 100,
                high: 107,
                low: 99,
                close: 106,
            },

            {
                open: 106,
                close: 106,
            },
        ]);

        const strategy = makeStrategy(
            [2],
            [],
            -0.50
        );

        strategy.minimalRoi = {
            '0': 0.05,
        };

        const engine = new BacktestEngine(
            strategy,
            makeConfig()
        );

        const result = await engine.runBacktest(candles);

        expect(result.totalTrades).toBe(1);

        const trade = result.trades[0];

        expect(trade.exitReason).toBe('roi');

        // ROI must trigger when candle #4 reaches +6%,
        // not one candle later.
        expect(trade.closeDate?.getTime())
            .toBe(candles[4].date.getTime());

        expect(trade.closeRate).toBeCloseTo(106, 6);
    });
    it('never exceeds maxOpenTrades when long and short signals occur together', async () => {
        const candles = makeOhlcCandles([
            { open: 100, close: 100 },
            { open: 100, close: 100 },
            { open: 100, close: 100 }, // long + short signal
            { open: 100, close: 100 },
            { open: 100, close: 100 },
        ]);

        const strategy = makeStrategy(
            [2],
            [],
            -0.50
        );

        strategy.canShort = true;

        const originalPopulateEntry =
            strategy.populateEntryTrend.bind(strategy);

        strategy.populateEntryTrend = (
            dataframe,
            metadata
        ) => {
            const result =
                originalPopulateEntry(dataframe, metadata);

            const shorts =
                new Array<number>(
                    dataframe.close.length
                ).fill(0);

            shorts[2] = 1;

            return {
                ...result,
                enter_short: shorts,
            };
        };

        const config = {
            ...makeConfig(),
            maxOpenTrades: 1,
        };

        const engine = new BacktestEngine(
            strategy,
            config
        );

        const result = await engine.runBacktest(candles);

        // Long is processed first.
        // Once it exists, short MUST NOT also open.
        expect(result.totalTrades).toBe(1);

        expect(result.trades[0].side).toBe('long');
    });
});
