/**
 * F3 Sprint 3 Test — RiskMonitorLoop WebSocket Integration
 *
 * Tests F3-10 (WS ticker triggers SL/TP), F3-11 (real-time evaluation),
 * F3-12 (executionReport handling), F3-13 (kline auto-signal).
 */

// ─── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../src/services/databaseService', () => ({
    db: {
        getOpenLiveTrades: jest.fn(),
        getOpenLiveTrades_bySymbol: jest.fn(),
        updateTradeRisk: jest.fn(),
        logError: jest.fn(),
    },
}));

jest.mock('../src/services/binanceOrderService', () => ({
    binanceOrderService: {
        getCurrentPrice: jest.fn(),
        getAccountBalance: jest.fn(),
    },
}));

jest.mock('../src/services/connectionManager', () => ({
    connectionManager: {
        notifySignalSubscribers: jest.fn(),
    },
}));

// ─── SUT imports ──────────────────────────────────────────────────────────────

import { RiskMonitorLoop, SignalStrategy } from '../src/services/riskMonitorLoop';
import { db } from '../src/services/databaseService';
import { binanceOrderService } from '../src/services/binanceOrderService';
import { connectionManager } from '../src/services/connectionManager';

// ─── Mock BinanceWebSocketService ─────────────────────────────────────────────

class MockWsService {
    tickerCallbacks = new Map<string, (...args: any[]) => void>();
    klineCallbacks = new Map<string, (...args: any[]) => void>();
    subscribedSymbols: string[] = [];
    unsubscribedSymbols: string[] = [];

    subscribeTickerStream(symbol: string, cb: (...args: any[]) => void) {
        this.tickerCallbacks.set(symbol.toUpperCase(), cb);
        this.subscribedSymbols.push(symbol.toUpperCase());
    }

    subscribeKlineStream(symbol: string, interval: string, cb: (...args: any[]) => void) {
        this.klineCallbacks.set(`${symbol.toUpperCase()}_${interval}`, cb);
    }

    unsubscribe(symbol: string) {
        this.unsubscribedSymbols.push(symbol);
        this.tickerCallbacks.delete(symbol.toUpperCase());
    }

    // Helper: simulate a ticker update arriving from Binance
    emitTick(symbol: string, lastPrice: number) {
        const cb = this.tickerCallbacks.get(symbol.toUpperCase());
        cb?.({ symbol, lastPrice, bidPrice: lastPrice - 1, askPrice: lastPrice + 1, volume: 1000, priceChangePercent: 0 });
    }

    // Helper: simulate a kline close event
    emitKlineClose(symbol: string, interval: string, closePrice: number) {
        const key = `${symbol.toUpperCase()}_${interval}`;
        const cb = this.klineCallbacks.get(key);
        cb?.({
            symbol,
            interval,
            openTime: Date.now() - 3600_000,
            open: closePrice - 100,
            high: closePrice + 50,
            low: closePrice - 200,
            close: closePrice,
            volume: 500,
            closeTime: Date.now(),
            isClosed: true,
        });
    }

    // Simulate kline update that is NOT closed yet
    emitKlineUpdate(symbol: string, interval: string, price: number) {
        const key = `${symbol.toUpperCase()}_${interval}`;
        const cb = this.klineCallbacks.get(key);
        cb?.({
            symbol,
            interval,
            open: price - 100,
            high: price + 50,
            low: price - 200,
            close: price,
            volume: 500,
            openTime: Date.now() - 1800_000,
            closeTime: Date.now() + 1800_000,
            isClosed: false, // candle NOT closed yet
        });
    }
}

// ─── Test helpers ──────────────────────────────────────────────────────────────

function makeOpenTrade(overrides = {}) {
    return {
        id: 'trade-1',
        userId: 1,
        symbol: 'BTCUSDT',
        side: 'BUY',
        entryPrice: 50000,
        stopLoss: 49000,
        takeProfit: 52000,
        ...overrides,
    };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('F3-Sprint3: RiskMonitorLoop WebSocket Integration', () => {
    let loop: RiskMonitorLoop;
    let mockWs: MockWsService;
    let executeExit: jest.Mock;
    let reconcileOrderUpdate: jest.Mock;
    let reconcilePendingOrders: jest.Mock;
    let isStartupRecoveryReady: jest.Mock;
    let markStartupRecoveryComplete: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockWs = new MockWsService();
        executeExit = jest.fn().mockResolvedValue({});
        reconcileOrderUpdate = jest.fn().mockResolvedValue(true);
        reconcilePendingOrders = jest.fn().mockResolvedValue({ checked: 0, reconciled: 0, failed: 0 });
        isStartupRecoveryReady = jest.fn().mockReturnValue(true);
        markStartupRecoveryComplete = jest.fn();
        const mockEngine = {
            executeExit,
            confirmFill: jest.fn(),
            reconcileOrderUpdate,
            reconcilePendingOrders,
            isStartupRecoveryReady,
            markStartupRecoveryComplete,
        } as any;

        loop = new RiskMonitorLoop(
            mockEngine,
            { pollIntervalMs: 10_000, trailingStopPositive: 0.01, circuitBreakerDrawdownPct: 0.5 },
            undefined,
            mockWs as any,
        );

        (db.getOpenLiveTrades as jest.Mock).mockResolvedValue([makeOpenTrade()]);
        (binanceOrderService.getAccountBalance as jest.Mock).mockResolvedValue([
            { asset: 'USDT', free: '1000', locked: '0' },
        ]);

        // Mark loop as running for WS callback to work
        (loop as any).isRunning = true;
    });

    // ── F3-10/F3-11: WebSocket ticker → SL/TP evaluation ─────────────────────

    it('F3-10: startWebSocket subscribes ticker for each symbol', () => {
        loop.startWebSocket(['BTCUSDT', 'ETHUSDT']);

        expect(mockWs.subscribedSymbols).toContain('BTCUSDT');
        expect(mockWs.subscribedSymbols).toContain('ETHUSDT');
    });

    it('F3-10: duplicate symbol subscription is skipped', () => {
        loop.startWebSocket(['BTCUSDT']);
        loop.startWebSocket(['BTCUSDT']); // second call same symbol

        expect(mockWs.subscribedSymbols.filter((s) => s === 'BTCUSDT').length).toBe(1);
    });

    it('F3-11: ticker callback triggers executeExit when price hits stop loss', async () => {
        loop.startWebSocket(['BTCUSDT']);

        // Price drops below stopLoss (49000)
        await new Promise<void>((resolve) => {
            (db.getOpenLiveTrades as jest.Mock).mockResolvedValueOnce([makeOpenTrade({ stopLoss: 49000, takeProfit: 0 })]);
            resolve();
        });

        await mockWs.emitTick('BTCUSDT', 48500); // below SL
        await new Promise((r) => setImmediate(r));

        expect(executeExit).toHaveBeenCalledWith('trade-1', 'stop_loss_triggered');
    });

    it('B4.2-R: ticker callback does not submit a second SELL while exit reconciliation is pending', async () => {
        loop.startWebSocket(['BTCUSDT']);

        (db.getOpenLiveTrades as jest.Mock).mockResolvedValueOnce([
            makeOpenTrade({
                status: 'LIVE_EXIT_PENDING_RECONCILIATION',
                quantity: 0.004,
                stopLoss: 49000,
                takeProfit: 0,
            }),
        ]);

        await mockWs.emitTick('BTCUSDT', 48000);
        await new Promise((r) => setImmediate(r));

        expect(executeExit).not.toHaveBeenCalled();
        expect(db.updateTradeRisk).not.toHaveBeenCalled();
    });

    it('F3-11: ticker callback triggers executeExit when price hits take profit', async () => {
        loop.startWebSocket(['BTCUSDT']);

        (db.getOpenLiveTrades as jest.Mock).mockResolvedValueOnce([
            makeOpenTrade({ stopLoss: 49000, takeProfit: 52000 }),
        ]);

        await mockWs.emitTick('BTCUSDT', 52100); // above TP
        await new Promise((r) => setImmediate(r));

        expect(executeExit).toHaveBeenCalledWith('trade-1', 'take_profit_triggered');
    });

    it('F3-11: ticker callback does NOT trigger exit when price is between SL and TP', async () => {
        loop.startWebSocket(['BTCUSDT']);

        (db.getOpenLiveTrades as jest.Mock).mockResolvedValueOnce([
            makeOpenTrade({ stopLoss: 49000, takeProfit: 52000 }),
        ]);

        await mockWs.emitTick('BTCUSDT', 50500); // safe zone
        await new Promise((r) => setImmediate(r));

        expect(executeExit).not.toHaveBeenCalled();
    });

    it('F3-11: ticker updates trailing stop when price rises', async () => {
        loop.startWebSocket(['BTCUSDT']);

        (db.getOpenLiveTrades as jest.Mock).mockResolvedValueOnce([
            makeOpenTrade({ stopLoss: 49000, takeProfit: 55000 }),
        ]);

        await mockWs.emitTick('BTCUSDT', 51000); // price rose
        await new Promise((r) => setImmediate(r));

        expect(db.updateTradeRisk).toHaveBeenCalledWith(
            'trade-1',
            expect.objectContaining({ stopLoss: expect.any(Number) }),
        );
        expect(executeExit).not.toHaveBeenCalled();
    });

    it('F3-10: stopWebSocket unsubscribes all active symbols', () => {
        loop.startWebSocket(['BTCUSDT', 'ETHUSDT']);
        loop.stopWebSocket();

        expect(mockWs.unsubscribedSymbols).toContain('BTCUSDT');
        expect(mockWs.unsubscribedSymbols).toContain('ETHUSDT');
    });

    it('F3-10: ticker callback is ignored when loop is not running', async () => {
        (loop as any).isRunning = false;
        loop.startWebSocket(['BTCUSDT']);

        (db.getOpenLiveTrades as jest.Mock).mockResolvedValueOnce([makeOpenTrade({ stopLoss: 49000 })]);
        await mockWs.emitTick('BTCUSDT', 48000); // below SL
        await new Promise((r) => setImmediate(r));

        expect(executeExit).not.toHaveBeenCalled();
    });

    // ── F3-12: executionReport handling ───────────────────────────────────────

    it('F3-12: handleExecutionReport delegates to engine.confirmFill for FILLED orders', async () => {
        const confirmFill = (loop as any).engine.confirmFill as jest.Mock;
        confirmFill.mockResolvedValue(undefined);

        await loop.handleExecutionReport(99, 'FILLED');

        expect(confirmFill).toHaveBeenCalledWith(99);
    });

    it('F3-12: handleExecutionReport does nothing for non-FILLED status', async () => {
        const confirmFill = (loop as any).engine.confirmFill as jest.Mock;

        await loop.handleExecutionReport(99, 'NEW');
        await loop.handleExecutionReport(99, 'PARTIALLY_FILLED');

        expect(confirmFill).not.toHaveBeenCalled();
    });



    it('B4.2-R: modern executionReport reconciles PARTIALLY_FILLED orders via canonical REST state', async () => {
        await loop.handleOrderExecutionReport({
            orderId: 8080,
            clientOrderId: 'rabtradebot',
            symbol: 'BTCUSDT',
            side: 'SELL',
            status: 'PARTIALLY_FILLED',
            executedQty: 0.004,
            price: 0,
            lastFilledPrice: 51000,
            cumulativeFilledQty: 0.004,
        });

        expect(reconcileOrderUpdate).toHaveBeenCalledWith(8080, 'BTCUSDT', 'PARTIALLY_FILLED');
    });

    it('B4.2-R: modern executionReport reconciles EXPIRED_IN_MATCH as terminal', async () => {
        await loop.handleOrderExecutionReport({
            orderId: 8082,
            clientOrderId: 'rabtradebot',
            symbol: 'BTCUSDT',
            side: 'SELL',
            status: 'EXPIRED_IN_MATCH',
            executedQty: 0.004,
            price: 0,
            lastFilledPrice: 51000,
            cumulativeFilledQty: 0.004,
        });

        expect(reconcileOrderUpdate).toHaveBeenCalledWith(8082, 'BTCUSDT', 'EXPIRED_IN_MATCH');
    });

    it('B4.2-R: modern executionReport ignores NEW orders', async () => {
        await loop.handleOrderExecutionReport({
            orderId: 8081,
            clientOrderId: 'rabtradebot',
            symbol: 'BTCUSDT',
            side: 'BUY',
            status: 'NEW',
            executedQty: 0,
            price: 0,
            lastFilledPrice: 0,
            cumulativeFilledQty: 0,
        });

        expect(reconcileOrderUpdate).not.toHaveBeenCalled();
    });

    it('B4.2-R: periodic REST sweep can reopen the startup gate after recovery succeeds', async () => {
        isStartupRecoveryReady.mockReturnValue(false);
        reconcilePendingOrders.mockResolvedValue({ checked: 1, reconciled: 1, failed: 0 });
        (db.getOpenLiveTrades as jest.Mock).mockResolvedValue([]);
        (loop as any).lastReconciliationSweepAt = 0;

        await (loop as any).tick();

        expect(reconcilePendingOrders).toHaveBeenCalledTimes(1);
        expect(markStartupRecoveryComplete).toHaveBeenCalledTimes(1);
    });

    it('B4.2-R: periodic REST sweep keeps the startup gate closed while recovery still fails', async () => {
        isStartupRecoveryReady.mockReturnValue(false);
        reconcilePendingOrders.mockResolvedValue({ checked: 1, reconciled: 0, failed: 1 });
        (db.getOpenLiveTrades as jest.Mock).mockResolvedValue([]);
        (loop as any).lastReconciliationSweepAt = 0;

        await (loop as any).tick();

        expect(markStartupRecoveryComplete).not.toHaveBeenCalled();
    });

    // ── F3-13: Auto-signal from kline close ───────────────────────────────────

    it('F3-13: startKlineSignal triggers notifier on candle close with BUY signal', async () => {
        const strategy: SignalStrategy = {
            name: 'TestStrategy',
            populateIndicators: (data) => data,
            populateEntryTrend: () => ({ action: 'BUY', confidence: 0.85, reason: 'RSI oversold' }),
        };

        const signalNotifier = jest.fn().mockResolvedValue(undefined);
        loop.startKlineSignal('BTCUSDT', '1h', strategy, signalNotifier);

        await mockWs.emitKlineClose('BTCUSDT', '1h', 50000);
        await new Promise((r) => setImmediate(r));

        expect(signalNotifier).toHaveBeenCalledWith('BTCUSDT', 'BUY', 0.85, 'RSI oversold');
    });

    it('F3-13: startKlineSignal notifies connectionManager signal subscribers', async () => {
        const strategy: SignalStrategy = {
            name: 'TestStrategy',
            populateIndicators: (data) => data,
            populateEntryTrend: () => ({ action: 'SELL', confidence: 0.9, reason: 'MACD bearish cross' }),
        };

        const signalNotifier = jest.fn().mockResolvedValue(undefined);
        loop.startKlineSignal('BTCUSDT', '1h', strategy, signalNotifier);

        await mockWs.emitKlineClose('BTCUSDT', '1h', 50000);
        await new Promise((r) => setImmediate(r));

        expect(connectionManager.notifySignalSubscribers).toHaveBeenCalledWith(
            'BTCUSDT', 'SELL', 0.9, 'MACD bearish cross',
        );
    });

    it('F3-13: kline callback does NOT trigger when candle is not closed', async () => {
        const strategy: SignalStrategy = {
            name: 'TestStrategy',
            populateIndicators: (data) => data,
            populateEntryTrend: () => ({ action: 'BUY', confidence: 0.8, reason: '' }),
        };

        const signalNotifier = jest.fn().mockResolvedValue(undefined);
        loop.startKlineSignal('BTCUSDT', '1h', strategy, signalNotifier);

        await mockWs.emitKlineUpdate('BTCUSDT', '1h', 50000); // isClosed = false
        await new Promise((r) => setImmediate(r));

        expect(signalNotifier).not.toHaveBeenCalled();
    });

    it('F3-13: kline callback does NOT trigger for HOLD signal', async () => {
        const strategy: SignalStrategy = {
            name: 'TestStrategy',
            populateIndicators: (data) => data,
            populateEntryTrend: () => ({ action: 'HOLD', confidence: 0.5, reason: '' }),
        };

        const signalNotifier = jest.fn().mockResolvedValue(undefined);
        loop.startKlineSignal('BTCUSDT', '1h', strategy, signalNotifier);

        await mockWs.emitKlineClose('BTCUSDT', '1h', 50000);
        await new Promise((r) => setImmediate(r));

        expect(signalNotifier).not.toHaveBeenCalled();
    });

    it('F3-13: duplicate klineSignal subscription for same symbol+interval is ignored', () => {
        const strategy: SignalStrategy = { name: 'T', populateEntryTrend: () => null };
        const signalNotifier = jest.fn();

        loop.startKlineSignal('BTCUSDT', '1h', strategy, signalNotifier);
        loop.startKlineSignal('BTCUSDT', '1h', strategy, signalNotifier);

        // Only one kline subscription created for BTCUSDT_1h
        const klineKeys = Array.from(mockWs.klineCallbacks.keys());
        expect(klineKeys.filter((k) => k === 'BTCUSDT_1h').length).toBe(1);
    });
});
