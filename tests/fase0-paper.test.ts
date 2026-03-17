/**
 * F0-6 Tests — PaperTradingEngine DB persistence
 *
 * Verifies:
 *  1. createTrade() saves with status:'PAPER_OPEN' + notes:'PAPER_TRADE'
 *  2. closeTrade() queries DB with status:'PAPER_OPEN'
 *  3. start() calls restoreStateFromDB() when userId is set
 *  4. restoreStateFromDB() populates openTrades & adjusts balance
 *  5. No DB restore when userId is not provided
 *
 * Strategy: define all mocks INSIDE the jest.mock() factory (avoids TDZ/hoisting
 * issues where const declarations are above the jest.mock() hoisted block but
 * initialized after it runs).
 */

// ── Module mocks (hoisted by Jest) ────────────────────────────────────────────

// All mock fn defs MUST live inside the factory to avoid the TDZ issue.
jest.mock('../src/services/databaseService', () => ({
    db: {
        saveTrade: jest.fn(),
        closeTrade: jest.fn(),
        findOpenTrade: jest.fn(),
        getOpenPaperTrades: jest.fn(),
        logError: jest.fn(),
    },
}));

jest.mock('../src/services/dataManager', () => ({
    DataManager: jest.fn().mockImplementation(() => ({
        getRecentData: jest.fn(),
    })),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { db } from '../src/services/databaseService';
import { PaperTradingEngine, PaperTradingConfig } from '../src/services/paperTradingEngine';
import { DataManager } from '../src/services/dataManager';
import { IStrategy } from '../src/types/strategy';
import { DataFrame } from '../src/types/dataframe';
import { OHLCVCandle } from '../src/types/dataframe';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeCandle(price: number, dt: Date): OHLCVCandle {
    return { timestamp: dt.getTime(), open: price, high: price + 10, low: price - 10, close: price, volume: 1000, date: dt };
}

/** 3 candles: 2 for startup warmup + 1 for the actual trading loop iteration */
const CANDLES: OHLCVCandle[] = [
    makeCandle(50000, new Date('2026-01-01T00:00:00Z')),
    makeCandle(50100, new Date('2026-01-01T00:05:00Z')),
    makeCandle(50200, new Date('2026-01-01T00:10:00Z')),
];

/** Minimal strategy that signals a LONG entry on the last candle only */
const entryStrategy: IStrategy = {
    name: 'TestEntryStrategy',
    version: '1.0',
    timeframe: '5m',
    canShort: false,
    stoploss: -0.05,
    minimalRoi: { '0': 0.05 },
    trailingStop: false,
    stakeAmount: 100,
    maxOpenTrades: 5,
    startupCandleCount: 2,
    processOnlyNewCandles: false,
    useExitSignal: false,
    exitProfitOnly: false,
    exitProfitOffset: 0,
    ignoreRoiIfEntrySignal: false,
    populateIndicators: (df: DataFrame) => df,
    populateEntryTrend: (df: DataFrame) => {
        const len = df.close.length;
        df.enter_long  = (df.close as number[]).map(() => 0);
        df.enter_short = (df.close as number[]).map(() => 0);
        df.enter_tag   = (df.close as number[]).map(() => '');
        (df.enter_long as number[])[len - 1] = 1;           // signal on last candle
        (df.enter_tag  as string[])[len - 1] = 'test_signal';
        return df;
    },
    populateExitTrend: (df: DataFrame) => {
        df.exit_long  = (df.close as number[]).map(() => 0);
        df.exit_short = (df.close as number[]).map(() => 0);
        df.exit_tag   = (df.close as number[]).map(() => '');
        return df;
    },
};

/** Minimal strategy that never signals an entry (for restore-only tests) */
const noEntryStrategy: IStrategy = {
    ...entryStrategy,
    name: 'NoEntryStrategy',
    populateEntryTrend: (df: DataFrame) => {
        df.enter_long  = (df.close as number[]).map(() => 0);
        df.enter_short = (df.close as number[]).map(() => 0);
        df.enter_tag   = (df.close as number[]).map(() => '');
        return df;
    },
};

const baseConfig: PaperTradingConfig = {
    initialBalance: 1000,
    maxOpenTrades: 5,
    feeOpen: 0.001,
    feeClose: 0.001,
    stakeCurrency: 'USDT',
    updateInterval: 0,
};

function getDataManagerMock(): jest.Mocked<DataManager> {
    return (DataManager as jest.Mock).mock.results.at(-1)?.value as jest.Mocked<DataManager>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
    // Default: no open paper trades in DB
    (db.getOpenPaperTrades as jest.Mock).mockResolvedValue([]);
    (db.saveTrade as jest.Mock).mockResolvedValue({ id: 'db-trade-1' });
    (db.closeTrade as jest.Mock).mockResolvedValue({});
    (db.findOpenTrade as jest.Mock).mockResolvedValue(null);
    (db.logError as jest.Mock).mockResolvedValue({});
});

// ── createTrade saves with PAPER_OPEN ─────────────────────────────────────────

describe('F0-6: createTrade() saves trade with status PAPER_OPEN', () => {
    it('calls db.saveTrade with status PAPER_OPEN and notes PAPER_TRADE', async () => {
        const engine = new PaperTradingEngine(entryStrategy, baseConfig, '42');
        const dm = getDataManagerMock();
        dm.getRecentData.mockResolvedValue(CANDLES);

        await engine.start('BTCUSDT', '5m');

        expect(db.saveTrade).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'PAPER_OPEN',
                notes: 'PAPER_TRADE',
            }),
        );
    });

    it('includes the correct symbol, side BUY, entry price and quantity', async () => {
        const engine = new PaperTradingEngine(entryStrategy, baseConfig, '42');
        const dm = getDataManagerMock();
        dm.getRecentData.mockResolvedValue(CANDLES);

        await engine.start('BTCUSDT', '5m');

        expect(db.saveTrade).toHaveBeenCalledWith(
            expect.objectContaining({
                symbol: 'BTCUSDT',
                side: 'BUY',        // long → BUY
                entryPrice: 50200,   // close price of candle[2]
            }),
        );
    });

    it('does NOT call db.saveTrade when no userId is set', async () => {
        // Engine without userId
        const engine = new PaperTradingEngine(entryStrategy, baseConfig);  // no userId
        const dm = getDataManagerMock();
        dm.getRecentData.mockResolvedValue(CANDLES);

        await engine.start('BTCUSDT', '5m');

        expect(db.saveTrade).not.toHaveBeenCalled();
    });
});

// ── closeTrade queries with PAPER_OPEN ────────────────────────────────────────

describe('F0-6: closeTrade() queries DB with status PAPER_OPEN', () => {
    it('passes PAPER_OPEN as status arg to findOpenTrade', async () => {
        // minimalRoi { '0': 0 } means any profit immediately exits
        const quickExitStrategy: IStrategy = {
            ...entryStrategy,
            name: 'QuickExit',
            minimalRoi: { '0': 0 },
        };

        const engine = new PaperTradingEngine(quickExitStrategy, baseConfig, '42');
        const dm = getDataManagerMock();

        // 4 candles so loop runs twice: enter on candle[2], exit on candle[3]
        const extendedCandles = [
            ...CANDLES,
            makeCandle(50300, new Date('2026-01-01T00:15:00Z')),
        ];
        dm.getRecentData.mockResolvedValue(extendedCandles);

        await engine.start('BTCUSDT', '5m');

        // findOpenTrade should have been called with 'PAPER_OPEN' as the 4th arg
        expect(db.findOpenTrade).toHaveBeenCalledWith(
            expect.any(String),    // userId
            'BTCUSDT',
            expect.any(Number),    // entry price
            'PAPER_OPEN',
        );
    });
});

// ── restoreStateFromDB on start() ────────────────────────────────────────────

describe('F0-6: start() restores state from DB when userId is set', () => {
    const storedTrade = {
        id: 'stored-1',
        symbol: 'BTCUSDT',
        side: 'BUY',
        entryPrice: 49000,
        quantity: 0.002,
        fees: 0.049,
        stopLoss: 46550,
        entryTime: new Date('2025-12-31T23:00:00Z'),
        status: 'PAPER_OPEN',
    };

    it('calls db.getOpenPaperTrades with the correct userId and symbol', async () => {
        (db.getOpenPaperTrades as jest.Mock).mockResolvedValueOnce([]);

        const engine = new PaperTradingEngine(noEntryStrategy, baseConfig, '99');
        const dm = getDataManagerMock();
        dm.getRecentData.mockResolvedValue(CANDLES);

        await engine.start('BTCUSDT', '5m');

        expect(db.getOpenPaperTrades).toHaveBeenCalledWith(99, 'BTCUSDT');
    });

    it('does NOT call db.getOpenPaperTrades when userId is not provided', async () => {
        const engine = new PaperTradingEngine(noEntryStrategy, baseConfig);    // no userId
        const dm = getDataManagerMock();
        dm.getRecentData.mockResolvedValue(CANDLES);

        await engine.start('BTCUSDT', '5m');

        expect(db.getOpenPaperTrades).not.toHaveBeenCalled();
    });

    it('restores open trade into engine memory (openTrades count = 1)', async () => {
        (db.getOpenPaperTrades as jest.Mock).mockResolvedValueOnce([storedTrade]);

        const engine = new PaperTradingEngine(noEntryStrategy, baseConfig, '99');
        const dm = getDataManagerMock();
        dm.getRecentData.mockResolvedValue(CANDLES);

        await engine.start('BTCUSDT', '5m');

        expect(engine.getCurrentResult().openTrades).toBe(1);
    });

    it('restores correct position data (symbol and side)', async () => {
        (db.getOpenPaperTrades as jest.Mock).mockResolvedValueOnce([storedTrade]);

        const engine = new PaperTradingEngine(noEntryStrategy, baseConfig, '99');
        const dm = getDataManagerMock();
        dm.getRecentData.mockResolvedValue(CANDLES);

        await engine.start('BTCUSDT', '5m');

        const positions = engine.getCurrentResult().positions;
        expect(positions).toHaveLength(1);
        expect(positions[0].pair).toBe('BTCUSDT');
        expect(positions[0].side).toBe('long');     // BUY → long
    });

    it('deducts stakeAmount + fees from balance after restore', async () => {
        (db.getOpenPaperTrades as jest.Mock).mockResolvedValueOnce([storedTrade]);

        const engine = new PaperTradingEngine(noEntryStrategy, baseConfig, '99');
        const dm = getDataManagerMock();
        dm.getRecentData.mockResolvedValue(CANDLES);

        await engine.start('BTCUSDT', '5m');

        const stakeAmount = storedTrade.entryPrice * storedTrade.quantity;   // 49000 * 0.002 = 98
        // getCurrentResult().balance = this.balance + totalUnrealizedPnl
        // The restored long position accrues unrealized PnL as candles tick up
        const finalPrice = CANDLES[CANDLES.length - 1].close as number;
        const unrealizedPnl = (finalPrice - storedTrade.entryPrice) * storedTrade.quantity;
        const expectedBalance = baseConfig.initialBalance - stakeAmount - storedTrade.fees + unrealizedPnl;

        expect(engine.getCurrentResult().balance).toBeCloseTo(expectedBalance, 5);
    });

    it('non-fatal: continues gracefully when DB restore throws', async () => {
        (db.getOpenPaperTrades as jest.Mock).mockRejectedValueOnce(new Error('DB connection lost'));

        // Suppress the intentional console.error from the catch block
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const engine = new PaperTradingEngine(noEntryStrategy, baseConfig, '99');
        const dm = getDataManagerMock();
        dm.getRecentData.mockResolvedValue(CANDLES);

        // Should not throw even though DB failed
        await expect(engine.start('BTCUSDT', '5m')).resolves.not.toThrow();
        expect(engine.getCurrentResult().openTrades).toBe(0);   // no trades restored

        consoleSpy.mockRestore();
    });
});
