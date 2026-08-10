jest.mock('../src/services/databaseService', () => ({
    db: {
        countOpenLiveTrades: jest.fn(),
        saveTrade: jest.fn(),
        getTradeById: jest.fn(),
        closeTrade: jest.fn(),
        updateLiveTradeExecution: jest.fn(),
        findPendingLiveTradeByOrderId: jest.fn(),
        getPendingLiveTrades: jest.fn(),
        logError: jest.fn(),
    },
}));

jest.mock('../src/services/binanceOrderService', () => ({
    binanceOrderService: {
        isConfigured: jest.fn(),
        getSymbolInfo: jest.fn(),
        getAccountBalance: jest.fn(),
        getCurrentPrice: jest.fn(),
        roundToStepSize: jest.fn(),
        cancelOrder: jest.fn(),
        getOrderStatus: jest.fn(),
    },
}));

import { ExecutionFill } from '../src/domain/execution';
import { RealTradingEngine } from '../src/services/realTradingEngine';
import { db } from '../src/services/databaseService';
import { binanceOrderService } from '../src/services/binanceOrderService';
import { SignalResult } from '../src/services/signalGenerator';
import { IStrategy } from '../src/types/strategy';

const strategy: IStrategy = {
    name: 'B42Recovery',
    version: '1.0.0',
    timeframe: '5m',
    canShort: false,
    stoploss: -0.03,
    minimalRoi: { '0': 0.1 },
    trailingStop: true,
    trailingStopPositive: 0.01,
    trailingStopPositiveOffset: 0.02,
    stakeAmount: 'unlimited',
    maxOpenTrades: 3,
    startupCandleCount: 10,
    processOnlyNewCandles: true,
    useExitSignal: true,
    exitProfitOnly: false,
    exitProfitOffset: 0,
    ignoreRoiIfEntrySignal: false,
    populateIndicators: (df) => df,
    populateEntryTrend: (df) => df,
    populateExitTrend: (df) => df,
};

const riskParams = {
    riskPerTrade: 0.01,
    maxPositionSize: 0.15,
    minPositionSize: 0.01,
    maxOpenTrades: 3,
    stopLossPctFallback: 0.03,
    expectedWinRate: 0.55,
    rewardRiskRatio: 2,
};

const signal: SignalResult = {
    action: 'BUY',
    price: 0,
    stopLoss: 49000,
    takeProfit: 52000,
    confidence: 0.8,
    reason: 'recovery test',
    text: 'recovery test',
};

function fill(overrides: Partial<ExecutionFill> = {}): ExecutionFill {
    return {
        product: 'SPOT',
        symbol: 'BTCUSDT',
        side: 'BUY',
        reduceOnly: false,
        orderId: 7001,
        status: 'PARTIALLY_FILLED',
        requestedQuantity: 0.01,
        executedQuantity: 0,
        cumulativeQuoteQuantity: 0,
        averageFillPrice: undefined,
        requiresReconciliation: true,
        ...overrides,
    };
}

function binanceOrder(overrides: Record<string, unknown> = {}) {
    return {
        symbol: 'BTCUSDT',
        orderId: 7001,
        status: 'PARTIALLY_FILLED',
        executedQty: '0.004',
        cummulativeQuoteQty: '200',
        price: '0',
        origQty: '0.01',
        type: 'MARKET',
        side: 'BUY',
        ...overrides,
    };
}

function entryPendingTrade(overrides: Record<string, unknown> = {}) {
    return {
        id: 'entry-pending',
        userId: 1,
        symbol: 'BTCUSDT',
        side: 'BUY',
        entryPrice: 50000,
        quantity: 0,
        status: 'LIVE_ENTRY_PENDING_RECONCILIATION',
        tags: JSON.stringify({
            live: true,
            product: 'SPOT',
            entryOrderId: 7001,
            entryRequestedQuantity: 0.01,
            positionInitialQuantity: 0,
            requiresReconciliation: true,
        }),
        ...overrides,
    };
}

function exitPendingTrade(overrides: Record<string, unknown> = {}) {
    return {
        id: 'exit-pending',
        userId: 1,
        symbol: 'BTCUSDT',
        side: 'BUY',
        entryPrice: 49000,
        quantity: 0.006,
        status: 'LIVE_EXIT_PENDING_RECONCILIATION',
        tags: JSON.stringify({
            live: true,
            product: 'SPOT',
            positionInitialQuantity: 0.01,
            exitOrderId: 8001,
            exitReason: 'stop_loss',
            exitBaseQuantity: 0.01,
            exitRequestedQuantity: 0.01,
            realizedExitQuantityCarry: 0,
            realizedExitQuoteCarry: 0,
            requiresReconciliation: true,
        }),
        ...overrides,
    };
}

describe('B4.2-R - live Spot reconciliation and recovery', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (binanceOrderService.isConfigured as jest.Mock).mockReturnValue(true);
        (binanceOrderService.getSymbolInfo as jest.Mock).mockResolvedValue({
            minQty: 0.001,
            maxQty: 1000,
            stepSize: 0.001,
            minNotional: 5,
            tickSize: 0.01,
        });
        (binanceOrderService.getAccountBalance as jest.Mock).mockResolvedValue([
            { asset: 'USDT', free: '1000', locked: '0' },
        ]);
        (binanceOrderService.getCurrentPrice as jest.Mock).mockResolvedValue(50000);
        (binanceOrderService.roundToStepSize as jest.Mock).mockReturnValue(0.01);
        (db.countOpenLiveTrades as jest.Mock).mockResolvedValue(0);
        (db.saveTrade as jest.Mock).mockResolvedValue({ id: 'entry-pending' });
        (db.updateLiveTradeExecution as jest.Mock).mockResolvedValue({ id: 'updated' });
        (db.getPendingLiveTrades as jest.Mock).mockResolvedValue([]);
    });

    it('blocks live execution until an explicitly required startup recovery gate is completed', async () => {
        const executeMarket = jest.fn().mockResolvedValue(fill({
            status: 'FILLED',
            executedQuantity: 0.01,
            cumulativeQuoteQuantity: 500,
            averageFillPrice: 50000,
            requiresReconciliation: false,
        }));
        const engine = new RealTradingEngine(undefined, { executeMarket } as any);
        engine.requireStartupRecovery();

        await expect(engine.executeEntry({
            userId: 1,
            symbol: 'BTCUSDT',
            signal,
            strategy,
            riskParams,
        })).rejects.toThrow(/startup order reconciliation/);
        expect(executeMarket).not.toHaveBeenCalled();

        engine.markStartupRecoveryComplete();
        expect(engine.isStartupRecoveryReady()).toBe(true);

        await expect(engine.executeEntry({
            userId: 1,
            symbol: 'BTCUSDT',
            signal,
            strategy,
            riskParams,
        })).resolves.toEqual(expect.objectContaining({ quantity: 0.01 }));
        expect(executeMarket).toHaveBeenCalledTimes(1);
    });

    it('fails closed if the execution adapter reports an impossible initial Spot overfill', async () => {
        const executeMarket = jest.fn().mockResolvedValue(fill({
            status: 'FILLED',
            requestedQuantity: 0.01,
            executedQuantity: 0.011,
            cumulativeQuoteQuantity: 550,
            averageFillPrice: 50000,
            requiresReconciliation: false,
        }));
        const engine = new RealTradingEngine(undefined, { executeMarket } as any);

        await expect(engine.executeEntry({
            userId: 1,
            symbol: 'BTCUSDT',
            signal,
            strategy,
            riskParams,
        })).rejects.toThrow(/impossible Spot overfill/);

        expect(db.saveTrade).not.toHaveBeenCalled();
    });

    it('persists accepted zero-fill BUY as pending with quantity=0 instead of synthetic inventory', async () => {
        const executeMarket = jest.fn().mockResolvedValue(fill());
        const engine = new RealTradingEngine(undefined, { executeMarket } as any);

        const result = await engine.executeEntry({
            userId: 1,
            symbol: 'BTCUSDT',
            signal,
            strategy,
            riskParams,
        });

        expect(result.quantity).toBe(0);
        expect(db.saveTrade).toHaveBeenCalledWith(expect.objectContaining({
            quantity: 0,
            status: 'LIVE_ENTRY_PENDING_RECONCILIATION',
            notes: 'LIVE_ENTRY_RECONCILIATION:7001',
        }));
    });

    it('reconciles a partial BUY using cumulative Binance quantity and quote', async () => {
        const trade = entryPendingTrade();
        (db.findPendingLiveTradeByOrderId as jest.Mock).mockResolvedValue(trade);
        (binanceOrderService.getOrderStatus as jest.Mock).mockResolvedValue(binanceOrder());
        const engine = new RealTradingEngine();

        await engine.reconcileOrderUpdate(7001, 'BTCUSDT', 'PARTIALLY_FILLED');

        expect(db.updateLiveTradeExecution).toHaveBeenCalledWith(
            'entry-pending',
            expect.objectContaining({
                quantity: 0.004,
                entryPrice: 50000,
                status: 'LIVE_ENTRY_PENDING_RECONCILIATION',
            }),
        );
    });

    it('turns a terminal zero-fill BUY into CANCELLED with no Spot exposure', async () => {
        const trade = entryPendingTrade();
        (db.findPendingLiveTradeByOrderId as jest.Mock).mockResolvedValue(trade);
        (binanceOrderService.getOrderStatus as jest.Mock).mockResolvedValue(binanceOrder({
            status: 'CANCELED',
            executedQty: '0',
            cummulativeQuoteQty: '0',
        }));
        const engine = new RealTradingEngine();

        await engine.reconcileOrderUpdate(7001, 'BTCUSDT', 'CANCELED');

        expect(db.updateLiveTradeExecution).toHaveBeenCalledWith(
            'entry-pending',
            expect.objectContaining({ quantity: 0, status: 'CANCELLED' }),
        );
    });

    it('turns a terminal short-filled BUY into a real LIVE_OPEN position at actual fill size', async () => {
        const trade = entryPendingTrade();
        (db.findPendingLiveTradeByOrderId as jest.Mock).mockResolvedValue(trade);
        (binanceOrderService.getOrderStatus as jest.Mock).mockResolvedValue(binanceOrder({
            status: 'CANCELED',
            executedQty: '0.004',
            cummulativeQuoteQty: '200',
        }));
        const engine = new RealTradingEngine();

        await engine.reconcileOrderUpdate(7001, 'BTCUSDT', 'CANCELED');

        expect(db.updateLiveTradeExecution).toHaveBeenCalledWith(
            'entry-pending',
            expect.objectContaining({ quantity: 0.004, entryPrice: 50000, status: 'LIVE_OPEN' }),
        );
    });

    it('keeps a PARTIALLY_FILLED SELL pending and tracks only residual inventory', async () => {
        const trade = exitPendingTrade();
        (db.findPendingLiveTradeByOrderId as jest.Mock).mockResolvedValue(trade);
        (binanceOrderService.getOrderStatus as jest.Mock).mockResolvedValue(binanceOrder({
            orderId: 8001,
            side: 'SELL',
            status: 'PARTIALLY_FILLED',
            executedQty: '0.006',
            cummulativeQuoteQty: '306',
        }));
        const engine = new RealTradingEngine();

        await engine.reconcileOrderUpdate(8001, 'BTCUSDT', 'PARTIALLY_FILLED');

        expect(db.updateLiveTradeExecution).toHaveBeenCalledWith(
            'exit-pending',
            expect.objectContaining({ quantity: 0.004, status: 'LIVE_EXIT_PENDING_RECONCILIATION' }),
        );
        expect(db.closeTrade).not.toHaveBeenCalled();
    });

    it('returns a canceled partial SELL to LIVE_OPEN with realized fills carried forward', async () => {
        const trade = exitPendingTrade();
        (db.findPendingLiveTradeByOrderId as jest.Mock).mockResolvedValue(trade);
        (binanceOrderService.getOrderStatus as jest.Mock).mockResolvedValue(binanceOrder({
            orderId: 8001,
            side: 'SELL',
            status: 'CANCELED',
            executedQty: '0.004',
            cummulativeQuoteQty: '204',
        }));
        const engine = new RealTradingEngine();

        await engine.reconcileOrderUpdate(8001, 'BTCUSDT', 'CANCELED');

        const update = (db.updateLiveTradeExecution as jest.Mock).mock.calls[0][1];
        expect(update.quantity).toBeCloseTo(0.006);
        expect(update.status).toBe('LIVE_OPEN');
        const tags = JSON.parse(update.tags);
        expect(tags.realizedExitQuantityCarry).toBeCloseTo(0.004);
        expect(tags.realizedExitQuoteCarry).toBeCloseTo(204);
        expect(tags.requiresReconciliation).toBe(false);
    });

    it('aggregates realized carry when a residual Spot position is closed by a later SELL order', async () => {
        (db.getTradeById as jest.Mock).mockResolvedValue({
            id: 'residual-open',
            userId: 1,
            symbol: 'BTCUSDT',
            side: 'BUY',
            entryPrice: 49000,
            quantity: 0.006,
            status: 'LIVE_OPEN',
            tags: JSON.stringify({
                live: true,
                product: 'SPOT',
                positionInitialQuantity: 0.01,
                realizedExitQuantityCarry: 0.004,
                realizedExitQuoteCarry: 204,
                protectiveOrderIds: [],
            }),
        });
        const executeMarket = jest.fn().mockResolvedValue(fill({
            side: 'SELL',
            reduceOnly: true,
            orderId: 8002,
            status: 'FILLED',
            requestedQuantity: 0.006,
            executedQuantity: 0.006,
            cumulativeQuoteQuantity: 306,
            averageFillPrice: 51000,
            requiresReconciliation: false,
        }));
        const engine = new RealTradingEngine(undefined, { executeMarket } as any);

        await engine.executeExit('residual-open', 'risk_resume_exit');

        expect(db.closeTrade).not.toHaveBeenCalled();
        expect(db.updateLiveTradeExecution).toHaveBeenCalledWith(
            'residual-open',
            expect.objectContaining({
                quantity: 0.01,
                exitPrice: 51000,
                status: 'CLOSED',
                profit: 20,
            }),
        );
    });

    it('rejects a duplicate SELL while the previous Spot exit order is unresolved', async () => {
        (db.getTradeById as jest.Mock).mockResolvedValue(exitPendingTrade());
        const executeMarket = jest.fn();
        const engine = new RealTradingEngine(undefined, { executeMarket } as any);

        await expect(engine.executeExit('exit-pending', 'duplicate_exit'))
            .rejects.toThrow(/already has an unresolved Spot exit/);
        expect(executeMarket).not.toHaveBeenCalled();
    });

    it('finalizes a FILLED SELL from cumulative fills without premature closeTrade accounting', async () => {
        const trade = exitPendingTrade();
        (db.findPendingLiveTradeByOrderId as jest.Mock).mockResolvedValue(trade);
        (binanceOrderService.getOrderStatus as jest.Mock).mockResolvedValue(binanceOrder({
            orderId: 8001,
            side: 'SELL',
            status: 'FILLED',
            executedQty: '0.01',
            cummulativeQuoteQty: '510',
        }));
        const engine = new RealTradingEngine();

        await engine.reconcileOrderUpdate(8001, 'BTCUSDT', 'FILLED');

        expect(db.closeTrade).not.toHaveBeenCalled();
        expect(db.updateLiveTradeExecution).toHaveBeenCalledWith(
            'exit-pending',
            expect.objectContaining({
                quantity: 0.01,
                exitPrice: 51000,
                status: 'CLOSED',
                profit: 20,
            }),
        );
    });

    it('fails closed when canonical REST order identity does not match the persisted Binance order id', async () => {
        const trade = exitPendingTrade();
        (db.findPendingLiveTradeByOrderId as jest.Mock).mockResolvedValue(trade);
        (binanceOrderService.getOrderStatus as jest.Mock).mockResolvedValue(binanceOrder({
            orderId: 9999,
            side: 'SELL',
            status: 'FILLED',
            executedQty: '0.01',
            cummulativeQuoteQty: '510',
        }));
        const engine = new RealTradingEngine();

        await expect(engine.reconcileOrderUpdate(8001, 'BTCUSDT', 'FILLED'))
            .rejects.toThrow(/order id mismatch/);
        expect(db.updateLiveTradeExecution).not.toHaveBeenCalled();
    });

    it('fails closed when canonical REST execution quantities are malformed', async () => {
        const trade = entryPendingTrade();
        (db.findPendingLiveTradeByOrderId as jest.Mock).mockResolvedValue(trade);
        (binanceOrderService.getOrderStatus as jest.Mock).mockResolvedValue(binanceOrder({
            executedQty: 'not-a-number',
            cummulativeQuoteQty: '200',
        }));
        const engine = new RealTradingEngine();

        await expect(engine.reconcileOrderUpdate(7001, 'BTCUSDT', 'PARTIALLY_FILLED'))
            .rejects.toThrow(/Invalid Binance reconciliation field executedQty/);
        expect(db.updateLiveTradeExecution).not.toHaveBeenCalled();
    });

    it('uses explicit REST fill price when cumulative quote is unavailable at terminal reconciliation', async () => {
        const trade = exitPendingTrade();
        (db.findPendingLiveTradeByOrderId as jest.Mock).mockResolvedValue(trade);
        (binanceOrderService.getOrderStatus as jest.Mock).mockResolvedValue(binanceOrder({
            orderId: 8001,
            side: 'SELL',
            status: 'FILLED',
            executedQty: '0.01',
            cummulativeQuoteQty: '0',
            price: '51000',
        }));
        const engine = new RealTradingEngine();

        await engine.reconcileOrderUpdate(8001, 'BTCUSDT', 'FILLED');

        expect(db.updateLiveTradeExecution).toHaveBeenCalledWith(
            'exit-pending',
            expect.objectContaining({
                exitPrice: 51000,
                profit: 20,
                status: 'CLOSED',
            }),
        );
    });

    it('rejects reconciliation if Binance reports an exit overfill beyond tracked Spot inventory', async () => {
        const trade = exitPendingTrade();
        (db.findPendingLiveTradeByOrderId as jest.Mock).mockResolvedValue(trade);
        (binanceOrderService.getOrderStatus as jest.Mock).mockResolvedValue(binanceOrder({
            orderId: 8001,
            side: 'SELL',
            status: 'FILLED',
            executedQty: '0.011',
            cummulativeQuoteQty: '561',
        }));
        const engine = new RealTradingEngine();

        await expect(engine.reconcileOrderUpdate(8001, 'BTCUSDT', 'FILLED'))
            .rejects.toThrow(/overfill detected/);
        expect(db.updateLiveTradeExecution).not.toHaveBeenCalled();
    });

    it('treats EXPIRED_IN_MATCH as terminal and resumes residual Spot risk management', async () => {
        const trade = exitPendingTrade();
        (db.findPendingLiveTradeByOrderId as jest.Mock).mockResolvedValue(trade);
        (binanceOrderService.getOrderStatus as jest.Mock).mockResolvedValue(binanceOrder({
            orderId: 8001,
            side: 'SELL',
            status: 'EXPIRED_IN_MATCH',
            executedQty: '0.004',
            cummulativeQuoteQty: '204',
        }));
        const engine = new RealTradingEngine();

        await engine.reconcileOrderUpdate(8001, 'BTCUSDT', 'EXPIRED_IN_MATCH');

        const update = (db.updateLiveTradeExecution as jest.Mock).mock.calls[0][1];
        expect(update.quantity).toBeCloseTo(0.006);
        expect(update.status).toBe('LIVE_OPEN');
        const tags = JSON.parse(update.tags);
        expect(tags.lastTerminalExitStatus).toBe('EXPIRED_IN_MATCH');
    });

    it('startup recovery sweeps every persisted pending order independently', async () => {
        const entry = entryPendingTrade();
        const exit = exitPendingTrade();
        (db.getPendingLiveTrades as jest.Mock).mockResolvedValue([entry, exit]);
        (db.findPendingLiveTradeByOrderId as jest.Mock)
            .mockResolvedValueOnce(entry)
            .mockResolvedValueOnce(exit);
        (binanceOrderService.getOrderStatus as jest.Mock)
            .mockResolvedValueOnce(binanceOrder({ status: 'FILLED', executedQty: '0.01', cummulativeQuoteQty: '500' }))
            .mockResolvedValueOnce(binanceOrder({ orderId: 8001, side: 'SELL', status: 'FILLED', executedQty: '0.01', cummulativeQuoteQty: '510' }));
        const engine = new RealTradingEngine();

        const result = await engine.reconcilePendingOrders();

        expect(result).toEqual({ checked: 2, reconciled: 2, failed: 0 });
        expect(binanceOrderService.getOrderStatus).toHaveBeenCalledTimes(2);
    });
});
