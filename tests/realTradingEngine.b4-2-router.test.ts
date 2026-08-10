jest.mock('../src/services/databaseService', () => ({
    db: {
        countOpenLiveTrades: jest.fn(),
        saveTrade: jest.fn(),
        getTradeById: jest.fn(),
        closeTrade: jest.fn(),
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
        placeMarketOrder: jest.fn(),
        cancelOrder: jest.fn(),
    },
}));

import { ExecutionFill, MarketExecutionCommand } from '../src/domain/execution';
import { RealTradingEngine } from '../src/services/realTradingEngine';
import { binanceOrderService } from '../src/services/binanceOrderService';
import { db } from '../src/services/databaseService';
import { SignalResult } from '../src/services/signalGenerator';
import { IStrategy } from '../src/types/strategy';

const strategy: IStrategy = {
    name: 'OpenClawStrategy',
    version: '1.0.0',
    timeframe: '5m',
    canShort: true,
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

function spotFill(overrides: Partial<ExecutionFill> = {}): ExecutionFill {
    return {
        product: 'SPOT',
        symbol: 'BTCUSDT',
        side: 'BUY',
        reduceOnly: false,
        orderId: 101,
        status: 'FILLED',
        requestedQuantity: 0.01,
        executedQuantity: 0.01,
        cumulativeQuoteQuantity: 500,
        averageFillPrice: 50000,
        requiresReconciliation: false,
        ...overrides,
    };
}

describe('B4.2 Patch 2 - RealTradingEngine uses explicit execution semantics', () => {
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
            { asset: 'BTC', free: '1', locked: '0' },
        ]);
        (binanceOrderService.getCurrentPrice as jest.Mock).mockResolvedValue(50000);
        (binanceOrderService.roundToStepSize as jest.Mock).mockReturnValue(0.01);
        (db.countOpenLiveTrades as jest.Mock).mockResolvedValue(0);
        (db.saveTrade as jest.Mock).mockResolvedValue({ id: 'trade-1' });
        (db.closeTrade as jest.Mock).mockResolvedValue({ id: 'trade-1' });
        (binanceOrderService.cancelOrder as jest.Mock).mockResolvedValue({});
    });

    it('routes Spot BUY entry as explicit LONG OPEN and never calls Binance market order directly', async () => {
        const executeMarket = jest.fn().mockResolvedValue(spotFill());
        const engine = new RealTradingEngine(undefined, { executeMarket } as any);
        const signal: SignalResult = {
            action: 'BUY',
            price: 0,
            stopLoss: 49000,
            takeProfit: 52000,
            confidence: 0.8,
            reason: 'bullish',
            text: 'ok',
        };

        await engine.executeEntry({
            userId: 1,
            symbol: 'BTCUSDT',
            signal,
            strategy,
            riskParams,
        });

        expect(executeMarket).toHaveBeenCalledTimes(1);
        const command = executeMarket.mock.calls[0][0] as MarketExecutionCommand;
        expect(command.position).toEqual({
            product: 'SPOT',
            intent: 'LONG',
            effect: 'OPEN',
        });
        expect(command.instrument).toEqual({
            symbol: 'BTCUSDT',
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
        });
        expect(binanceOrderService.placeMarketOrder).not.toHaveBeenCalled();
        expect(db.saveTrade).toHaveBeenCalledWith(expect.objectContaining({
            side: 'BUY',
            status: 'LIVE_OPEN',
            tags: expect.stringContaining('"product":"SPOT"'),
        }));
    });

    it('routes a legacy Spot BUY trade exit as explicit LONG CLOSE', async () => {
        const executeMarket = jest.fn().mockResolvedValue(spotFill({
            side: 'SELL',
            reduceOnly: true,
            orderId: 202,
            averageFillPrice: 50500,
            cumulativeQuoteQuantity: 505,
        }));
        const engine = new RealTradingEngine(undefined, { executeMarket } as any);

        (db.getTradeById as jest.Mock).mockResolvedValue({
            id: 'trade-1',
            userId: 1,
            symbol: 'BTCUSDT',
            side: 'BUY',
            quantity: 0.01,
            tags: JSON.stringify({ product: 'SPOT', protectiveOrderIds: [] }),
        });

        await engine.executeExit('trade-1', 'manual_test');

        const command = executeMarket.mock.calls[0][0] as MarketExecutionCommand;
        expect(command.position).toEqual({
            product: 'SPOT',
            intent: 'LONG',
            effect: 'CLOSE',
        });
        expect(binanceOrderService.placeMarketOrder).not.toHaveBeenCalled();
        expect(db.closeTrade).toHaveBeenCalledWith(
            'trade-1',
            50500,
            undefined,
            expect.objectContaining({ status: 'CLOSED' }),
        );
    });

    it('quarantines an accepted Spot exit that requires reconciliation instead of marking it CLOSED', async () => {
        const executeMarket = jest.fn().mockResolvedValue(spotFill({
            side: 'SELL',
            reduceOnly: true,
            orderId: 303,
            status: 'PARTIALLY_FILLED',
            requestedQuantity: 0.01,
            executedQuantity: 0.004,
            cumulativeQuoteQuantity: 202,
            averageFillPrice: 50500,
            requiresReconciliation: true,
        }));
        const engine = new RealTradingEngine(undefined, { executeMarket } as any);

        (db.getTradeById as jest.Mock).mockResolvedValue({
            id: 'trade-1',
            userId: 1,
            symbol: 'BTCUSDT',
            side: 'BUY',
            quantity: 0.01,
            tags: JSON.stringify({ product: 'SPOT', protectiveOrderIds: [] }),
        });

        await engine.executeExit('trade-1', 'stop_loss');

        expect(db.closeTrade).toHaveBeenCalledWith(
            'trade-1',
            50500,
            undefined,
            expect.objectContaining({
                status: 'LIVE_EXIT_PENDING_RECONCILIATION',
                notes: expect.stringContaining('LIVE_EXIT_RECONCILIATION:303'),
            }),
        );
    });

    it('fails closed on persisted Futures metadata before routing or cancelling Spot protective orders', async () => {
        const executeMarket = jest.fn();
        const engine = new RealTradingEngine(undefined, { executeMarket } as any);

        (db.getTradeById as jest.Mock).mockResolvedValue({
            id: 'future-trade',
            userId: 1,
            symbol: 'BTCUSDT',
            side: 'BUY',
            quantity: 0.01,
            tags: JSON.stringify({ product: 'USDM_FUTURES', protectiveOrderIds: [11] }),
        });

        await expect(engine.executeExit('future-trade', 'manual_test'))
            .rejects.toThrow(/Spot-only/);

        expect(executeMarket).not.toHaveBeenCalled();
        expect(binanceOrderService.cancelOrder).not.toHaveBeenCalled();
        expect(binanceOrderService.placeMarketOrder).not.toHaveBeenCalled();
    });
});
