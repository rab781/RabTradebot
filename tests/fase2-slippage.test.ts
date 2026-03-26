/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * F2-2: Slippage Integration Test
 * Tests the integration of slippage calculation into entry/exit fills
 * - volumeImpact modeling (0.1% per 1x average volume)
 * - random filler component (±0.05%)
 * - tracking in Trade and PaperTradingEngine
 */

jest.mock('../src/services/databaseService', () => ({
    db: {
        getOpenPaperTrades: jest.fn().mockResolvedValue([]),
        saveTrade: jest.fn().mockResolvedValue({ id: 'paper-trade-1' }),
        closeTrade: jest.fn().mockResolvedValue(undefined),
        findOpenTrade: jest.fn().mockResolvedValue(null),
        updateTradeRisk: jest.fn().mockResolvedValue(undefined),
        setUserPreference: jest.fn().mockResolvedValue(undefined),
        logError: jest.fn().mockResolvedValue(undefined),
    },
}));

import { PaperTradingEngine } from '../src/services/paperTradingEngine';

describe('F2-2: Slippage Integration', () => {
    let engine: PaperTradingEngine;
    let mockStrategy: any;
    let mockHistoricalData: any[];
    let randomSpy: jest.SpyInstance<number, []>;

    beforeEach(() => {
        // Keep slippage tests deterministic to avoid flaky CI runs
        randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.75);

        // Mock strategy with realistic parameters
        mockStrategy = {
            name: 'TestStrategy',
            enabled: true,
            stakeAmount: 100,
            canShort: false,
            stoploss: -0.05,
            tradeLimit: 5,
            tradableOnly: false,
            indicators: {},
            confirmTradeEntry: undefined,
            fillBuy: async (df: any) => 1,
            fillSell: async (df: any) => -1,
        } as any;

        // Initialize engine
        engine = new PaperTradingEngine(mockStrategy, {
            initialBalance: 1000,
            maxOpenTrades: 5,
            stakeCurrency: 'USDT',
            feeOpen: 0.001,
            feeClose: 0.001,
            updateInterval: 1000,
        });

        // Create mock historical data with realistic volumes
        mockHistoricalData = [];
        for (let i = 0; i < 50; i++) {
            mockHistoricalData.push({
                date: new Date(2024, 0, i + 1),
                open: 100 + Math.random() * 10,
                high: 110 + Math.random() * 10,
                low: 90 + Math.random() * 10,
                close: 100 + Math.random() * 10,
                volume: 10000 + Math.random() * 5000, // 10k-15k avg volume
            });
        }
    });

    afterEach(() => {
        randomSpy.mockRestore();
    });

    test('F2-1: calculateSlippage computes volume impact correctly', async () => {
        // Access the private method through reflection for testing
        const slippageMethod = (engine as any).calculateSlippage.bind(engine);

        // Test case 1: Small trade (minimal slippage)
        const smallTrade = slippageMethod(100, 'long', 1, 10000);
        expect(smallTrade.volumeImpact).toBeLessThan(0.0001); // 0.01% for 1 unit / 10k volume
        expect(smallTrade.fillPrice).toBeCloseTo(100 * (1 + smallTrade.totalSlippage), 8);

        // Test case 2: Large trade (significant slippage)
        const largeTrade = slippageMethod(100, 'long', 100, 10000);
        const expectedVolumeImpact = (100 / 10000) * 0.001; // 0.1% per 1x volume
        expect(largeTrade.volumeImpact).toBeCloseTo(expectedVolumeImpact, 4);

        // Test case 3: Verify fill price adjustment
        const mediumTrade = slippageMethod(100, 'short', 50, 10000);
        expect(mediumTrade.fillPrice).not.toBe(100); // Should be different due to slippage
    });

    test('F2-4: getSpreadRate returns expected category spreads', () => {
        const getSpreadRate = (engine as any).getSpreadRate.bind(engine);

        expect(getSpreadRate('BTCUSDT')).toBe(0.0001);
        expect(getSpreadRate('ETHUSDT')).toBe(0.00015);
        expect(getSpreadRate('BNBUSDT')).toBe(0.00015);
        expect(getSpreadRate('SOLUSDT')).toBe(0.0003);
        expect(getSpreadRate('RAREUSDT')).toBe(0.001);
    });

    test('F2-5: applySpread uses ask for buys and bid for sells', () => {
        const applySpread = (engine as any).applySpread.bind(engine);

        const buySpread = applySpread(100, 'long', 'BTCUSDT');
        const sellSpread = applySpread(100, 'short', 'BTCUSDT');

        expect(buySpread.adjustedPrice).toBeCloseTo(100.005, 6);
        expect(sellSpread.adjustedPrice).toBeCloseTo(99.995, 6);
        expect(buySpread.adjustedPrice).toBeGreaterThan(100);
        expect(sellSpread.adjustedPrice).toBeLessThan(100);
    });

    test('F2-7: applyLiquidityConstraint caps fills at 1% of avg volume', () => {
        const applyLiquidityConstraint = (engine as any).applyLiquidityConstraint.bind(engine);

        const liquidityData = applyLiquidityConstraint(250, 10000);
        expect(liquidityData.maxFillQuantity).toBe(100);
        expect(liquidityData.filledQuantity).toBe(100);
        expect(liquidityData.unfilledQuantity).toBe(150);
        expect(liquidityData.isPartialFill).toBe(true);
    });

    test('F2-2: Entry creates trade with actualEntryPrice reflecting slippage', async () => {
        // Mock the dataManager to return our historical data
        (engine as any).historicalData = mockHistoricalData;
        (engine as any).currentDataIndex = mockHistoricalData.length;

        // Create a simple entry signal
        const entry = {
            date: mockHistoricalData[mockHistoricalData.length - 1].date,
            close: 100, // Entry price
            volume: 12000,
        };

        // Call createTrade internally (it's private but we can access via reflection)
        const createTradeMethod = (engine as any).createTrade.bind(engine);

        // Prepare metadata
        const metadata = {
            pair: 'BTCUSDT',
            buyTag: 'test_entry',
        };

        // Execute trade creation
        await createTradeMethod('long', entry, 'test_entry', metadata);

        // Verify trade was created
        const trades = (engine as any).openTrades as any[];
        expect(trades.length).toBeGreaterThan(0);

        const createdTrade = trades[0];
        expect(createdTrade.pair).toBe('BTCUSDT');
        expect(createdTrade.side).toBe('long');
        expect(createdTrade.actualEntryPrice).toBeDefined();
        expect(createdTrade.entrySlippage).toBeDefined();

        // Verify slippage is small but non-zero
        expect(Math.abs(createdTrade.entrySlippage || 0)).toBeGreaterThan(0);
        expect(Math.abs(createdTrade.entrySlippage || 0)).toBeLessThan(0.01); // Less than 1%
    });

    test('F2-8: Entry uses partial fill when requested size exceeds liquidity cap', async () => {
        (engine as any).historicalData = mockHistoricalData;
        (engine as any).currentDataIndex = mockHistoricalData.length;
        (engine as any).balance = 50000;

        mockStrategy.stakeAmount = 25000; // Requested size => 250 qty at price 100

        const createTradeMethod = (engine as any).createTrade.bind(engine);
        const metadata = { pair: 'BTCUSDT', buyTag: 'test_entry' };
        const candle = {
            date: mockHistoricalData[mockHistoricalData.length - 1].date,
            close: 100,
            volume: 12000,
        };

        await createTradeMethod('long', candle, 'test_entry', metadata);

        const trade = (engine as any).openTrades[0] as any;
        const expectedMaxFill = 13750 * 0.01;
        expect(trade).toBeDefined();
        expect(trade.amount).toBeCloseTo(expectedMaxFill, 6);
        expect((engine as any).totalSpreadCost).toBeGreaterThan(0);
        expect((engine as any).pendingPartialEntries.length).toBe(1);
    });

    test('F2-8: Pending partial entry is auto-filled on subsequent candles', async () => {
        (engine as any).historicalData = mockHistoricalData;
        (engine as any).currentDataIndex = mockHistoricalData.length;
        (engine as any).balance = 50000;

        mockStrategy.stakeAmount = 25000;

        const createTradeMethod = (engine as any).createTrade.bind(engine);
        const processPendingMethod = (engine as any).processPendingPartialEntries.bind(engine);

        const metadata = {
            pair: 'BTCUSDT',
            timeframe: '5m',
            stake_currency: 'USDT',
        };

        const candle1 = {
            date: mockHistoricalData[mockHistoricalData.length - 2].date,
            close: 100,
            volume: 12000,
        };

        const candle2 = {
            date: mockHistoricalData[mockHistoricalData.length - 1].date,
            close: 101,
            volume: 12000,
        };

        await createTradeMethod('long', candle1, 'test_entry', metadata);

        const pendingAfterCreate = (engine as any).pendingPartialEntries as any[];
        expect(pendingAfterCreate.length).toBe(1);
        expect(pendingAfterCreate[0].remainingQuantity).toBeGreaterThan(0);

        const openTradesBeforePendingFill = (engine as any).openTrades.length;

        await processPendingMethod(candle2, metadata);

        const openTradesAfterPendingFill = (engine as any).openTrades.length;
        const pendingAfterFirstFill = (engine as any).pendingPartialEntries as any[];

        expect(openTradesAfterPendingFill).toBeGreaterThan(openTradesBeforePendingFill);
        expect(pendingAfterFirstFill.length).toBeLessThanOrEqual(1);

        // A second attempt should fully clear the remainder for this deterministic setup
        await processPendingMethod(candle2, metadata);
        expect((engine as any).pendingPartialEntries.length).toBe(0);
    });

    test('F2-2: totalSlippageCost accumulates across multiple trades', async () => {
        (engine as any).historicalData = mockHistoricalData;
        (engine as any).currentDataIndex = mockHistoricalData.length;

        const createTradeMethod = (engine as any).createTrade.bind(engine);
        const metadata = { pair: 'BTCUSDT', buyTag: 'test_entry' };

        const candle = {
            date: mockHistoricalData[mockHistoricalData.length - 1].date,
            close: 100,
            volume: 12000,
        };

        // Get initial totalSlippageCost
        const initialSlippageCost = (engine as any).totalSlippageCost;
        expect(initialSlippageCost).toBe(0);

        // Create multiple trades
        for (let i = 0; i < 3; i++) {
            await createTradeMethod('long', candle, 'test_entry', metadata);
        }

        // Verify totalSlippageCost increased
        const finalSlippageCost = (engine as any).totalSlippageCost;
        expect(finalSlippageCost).toBeGreaterThan(0);
    });

    test('F2-2: Position uses actualEntryPrice for P&L calculations', async () => {
        (engine as any).historicalData = mockHistoricalData;
        (engine as any).currentDataIndex = mockHistoricalData.length;

        const createTradeMethod = (engine as any).createTrade.bind(engine);
        const metadata = { pair: 'BTCUSDT', buyTag: 'test_entry' };

        const candle = {
            date: mockHistoricalData[mockHistoricalData.length - 1].date,
            close: 100,
            volume: 12000,
        };

        await createTradeMethod('long', candle, 'test_entry', metadata);

        // Get created position
        const positions = (engine as any).positions as any[];
        expect(positions.length).toBeGreaterThan(0);

        const position = positions[0];
        const trade = (engine as any).openTrades[0];

        // Position entryPrice should match trade's actualEntryPrice (with slippage)
        expect(position.entryPrice).toBe(trade.actualEntryPrice);
        expect(position.entryPrice).not.toBe(trade.openRate); // Should differ from nominal price
    });

    test('F2-2: closeTrade applies slippage on exit and updates profitPct correctly', async () => {
        (engine as any).historicalData = mockHistoricalData;
        (engine as any).currentDataIndex = mockHistoricalData.length;

        const createTradeMethod = (engine as any).createTrade.bind(engine);
        const closeTradeMethod = (engine as any).closeTrade.bind(engine);
        const metadata = { pair: 'BTCUSDT', buyTag: 'test_entry' };

        // Create entry candle
        const entryCandle = {
            date: mockHistoricalData[mockHistoricalData.length - 2].date,
            close: 100,
            volume: 12000,
        };

        await createTradeMethod('long', entryCandle, 'test_entry', metadata);

        // Get created trade
        const trade = (engine as any).openTrades[0] as any;
        const actualEntryPrice = trade.actualEntryPrice;

        // Create exit candle (slightly higher price)
        const exitCandle = {
            date: mockHistoricalData[mockHistoricalData.length - 1].date,
            close: 105, // 5% profit
            volume: 12000,
        };

        // Close trade
        await closeTradeMethod(trade, exitCandle, 'test_exit');

        // Verify trade was closed with slippage fields
        expect(trade.isOpen).toBe(false);
        expect(trade.actualExitPrice).toBeDefined();
        expect(trade.exitSlippage).toBeDefined();
        expect(trade.closeRate).toBe(105); // Nominal price stored

        // profitPct should be calculated using actualEntryPrice
        const expectedProfit = ((105 - actualEntryPrice) / actualEntryPrice) * 100;
        const tolerance = 5; // Allow 5% tolerance due to fees and slippage
        expect(Math.abs((trade.profitPct || 0) - expectedProfit)).toBeLessThan(tolerance);
    });

    test('F2-2: Exit slippage is in opposite direction of entry slippage', () => {
        // Direct test of calculateSlippage method behavior
        const slippageMethod = (engine as any).calculateSlippage.bind(engine);

        // For a long entry, we're buying (slippage pushes price higher)
        const longEntry = slippageMethod(100, 'long', 10, 1000);

        // For closing long (selling = short order), slippage pushes price lower
        const shortExit = slippageMethod(105, 'short', 10, 1000);

        // If volume impact is same, long entry should increase fill price
        // and short exit should decrease fill price
        expect(longEntry.fillPrice).toBeGreaterThanOrEqual(100); // Filled at or above market
        expect(shortExit.fillPrice).toBeLessThanOrEqual(105); // Filled at or below market
    });

    test('F2-2: Slippage fields persist through trade lifecycle', async () => {
        (engine as any).historicalData = mockHistoricalData;
        (engine as any).currentDataIndex = mockHistoricalData.length;

        const createTradeMethod = (engine as any).createTrade.bind(engine);
        const closeTradeMethod = (engine as any).closeTrade.bind(engine);
        const metadata = { pair: 'BTCUSDT', buyTag: 'test_entry' };

        // Create and close trade
        const entryCandle = {
            date: mockHistoricalData[mockHistoricalData.length - 2].date,
            close: 100,
            volume: 12000,
        };

        await createTradeMethod('long', entryCandle, 'test_entry', metadata);
        const trade = (engine as any).openTrades[0] as any;
        const entrySlippage = trade.entrySlippage;

        const exitCandle = {
            date: mockHistoricalData[mockHistoricalData.length - 1].date,
            close: 105,
            volume: 12000,
        };

        await closeTradeMethod(trade, exitCandle, 'test_exit');

        // Verify closed trade has all slippage fields
        expect(trade.entrySlippage).toBe(entrySlippage); // Entry slippage unchanged
        expect(trade.exitSlippage).toBeDefined(); // Exit slippage now set
        expect(trade.actualEntryPrice).toBeDefined();
        expect(trade.actualExitPrice).toBeDefined();
        expect(trade.openRate).toBe(100); // Nominal prices preserved
        expect(trade.closeRate).toBe(105);
    });

    test('F2-3: getCurrentResult returns slippage metrics', async () => {
        (engine as any).historicalData = mockHistoricalData;
        (engine as any).currentDataIndex = mockHistoricalData.length;

        const createTradeMethod = (engine as any).createTrade.bind(engine);
        const closeTradeMethod = (engine as any).closeTrade.bind(engine);
        const metadata = { pair: 'BTCUSDT', buyTag: 'test_entry' };

        const entryCandle = {
            date: mockHistoricalData[mockHistoricalData.length - 2].date,
            close: 100,
            volume: 12000,
        };

        await createTradeMethod('long', entryCandle, 'test_entry', metadata);
        const trade = (engine as any).openTrades[0] as any;

        const exitCandle = {
            date: mockHistoricalData[mockHistoricalData.length - 1].date,
            close: 105,
            volume: 12000,
        };

        await closeTradeMethod(trade, exitCandle, 'test_exit');

        const result = engine.getCurrentResult();
        expect(result.totalSlippageCost).toBeDefined();
        expect(result.totalSpreadCost).toBeDefined();
        expect(result.profitWithoutSlippage).toBeDefined();
        expect((result.totalSlippageCost || 0)).toBeGreaterThan(0);
        expect((result.totalSpreadCost || 0)).toBeGreaterThan(0);
        expect((result.profitWithoutSlippage || 0)).toBeGreaterThan(result.totalProfit);
    });
});
