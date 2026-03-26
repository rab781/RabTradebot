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
});
