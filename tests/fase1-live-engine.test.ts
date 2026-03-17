jest.mock('../src/services/databaseService', () => ({
    db: {
        countOpenLiveTrades: jest.fn(),
        saveTrade: jest.fn(),
        getTradeById: jest.fn(),
        closeTrade: jest.fn(),
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

import { RealTradingEngine } from '../src/services/realTradingEngine';
import { db } from '../src/services/databaseService';
import { binanceOrderService } from '../src/services/binanceOrderService';
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

describe('F1: RealTradingEngine', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (binanceOrderService.isConfigured as jest.Mock).mockReturnValue(true);
    });

    it('executeEntry validates and places market order then saves live trade', async () => {
        const engine = new RealTradingEngine();

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
        (db.countOpenLiveTrades as jest.Mock).mockResolvedValue(0);
        (binanceOrderService.getCurrentPrice as jest.Mock).mockResolvedValue(50000);
        (binanceOrderService.roundToStepSize as jest.Mock).mockReturnValue(0.01);
        (binanceOrderService.placeMarketOrder as jest.Mock).mockResolvedValue({
            orderId: 12345,
            price: '50010',
            cummulativeQuoteQty: '500.1',
            executedQty: '0.01',
            status: 'FILLED',
            symbol: 'BTCUSDT',
            origQty: '0.01',
            type: 'MARKET',
            side: 'BUY',
        });
        (db.saveTrade as jest.Mock).mockResolvedValue({ id: 'live-trade-1' });

        const signal: SignalResult = {
            action: 'BUY',
            price: 0,
            stopLoss: 0,
            takeProfit: 0,
            confidence: 0.8,
            reason: 'bullish',
            text: 'ok',
        };

        const result = await engine.executeEntry({
            userId: 1,
            symbol: 'BTCUSDT',
            signal,
            strategy,
            riskParams: {
                riskPerTrade: 0.01,
                maxPositionSize: 0.15,
                minPositionSize: 0.01,
                maxOpenTrades: 3,
                stopLossPctFallback: 0.03,
                expectedWinRate: 0.55,
                rewardRiskRatio: 2,
            },
        });

        expect(result.tradeId).toBe('live-trade-1');
        expect(result.orderId).toBe(12345);
        expect(db.saveTrade).toHaveBeenCalledWith(expect.objectContaining({
            status: 'LIVE_OPEN',
            symbol: 'BTCUSDT',
            side: 'BUY',
        }));
    });

    it('executeEntry rejects when max open trades is reached', async () => {
        const engine = new RealTradingEngine();

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
        (db.countOpenLiveTrades as jest.Mock).mockResolvedValue(3);
        (binanceOrderService.getCurrentPrice as jest.Mock).mockResolvedValue(50000);

        const signal: SignalResult = {
            action: 'BUY',
            price: 0,
            stopLoss: 49000,
            takeProfit: 52000,
            confidence: 0.8,
            reason: 'bullish',
            text: 'ok',
        };

        await expect(engine.executeEntry({
            userId: 1,
            symbol: 'BTCUSDT',
            signal,
            strategy,
            riskParams: {
                riskPerTrade: 0.01,
                maxPositionSize: 0.15,
                minPositionSize: 0.01,
                maxOpenTrades: 3,
                stopLossPctFallback: 0.03,
                expectedWinRate: 0.55,
                rewardRiskRatio: 2,
            },
        })).rejects.toThrow(/Open trades limit reached/);
    });

    it('sends notifier messages for entry and exit', async () => {
        const notifier = jest.fn().mockResolvedValue(undefined);
        const engine = new RealTradingEngine(notifier);

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
        (db.countOpenLiveTrades as jest.Mock).mockResolvedValue(0);
        (binanceOrderService.getCurrentPrice as jest.Mock).mockResolvedValue(50000);
        (binanceOrderService.roundToStepSize as jest.Mock).mockReturnValue(0.01);
        (binanceOrderService.placeMarketOrder as jest.Mock)
            .mockResolvedValueOnce({
                orderId: 12345,
                price: '50010',
                cummulativeQuoteQty: '500.1',
                executedQty: '0.01',
                status: 'FILLED',
                symbol: 'BTCUSDT',
                origQty: '0.01',
                type: 'MARKET',
                side: 'BUY',
            })
            .mockResolvedValueOnce({
                orderId: 777,
                price: '50500',
                cummulativeQuoteQty: '505',
                executedQty: '0.01',
                status: 'FILLED',
                symbol: 'BTCUSDT',
                origQty: '0.01',
                type: 'MARKET',
                side: 'SELL',
            });
        (db.saveTrade as jest.Mock).mockResolvedValue({ id: 'live-trade-1' });
        (db.getTradeById as jest.Mock).mockResolvedValue({
            id: 'live-trade-1',
            userId: 1,
            symbol: 'BTCUSDT',
            side: 'BUY',
            quantity: 0.01,
            tags: JSON.stringify({ protectiveOrderIds: [11] }),
        });
        (binanceOrderService.cancelOrder as jest.Mock).mockResolvedValue({});
        (db.closeTrade as jest.Mock).mockResolvedValue({ id: 'live-trade-1', status: 'CLOSED' });

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
            riskParams: {
                riskPerTrade: 0.01,
                maxPositionSize: 0.15,
                minPositionSize: 0.01,
                maxOpenTrades: 3,
                stopLossPctFallback: 0.03,
                expectedWinRate: 0.55,
                rewardRiskRatio: 2,
            },
        });

        await engine.executeExit('live-trade-1', 'manual_test');

        expect(notifier).toHaveBeenCalledTimes(2);
        expect(notifier).toHaveBeenNthCalledWith(1, expect.stringContaining('LIVE ENTRY BTCUSDT'), 1);
        expect(notifier).toHaveBeenNthCalledWith(2, expect.stringContaining('LIVE EXIT BTCUSDT'), 1);
    });

    it('executeExit sends opposite market order and closes trade', async () => {
        const engine = new RealTradingEngine();

        (db.getTradeById as jest.Mock).mockResolvedValue({
            id: 'trade-x',
            userId: 1,
            symbol: 'BTCUSDT',
            side: 'BUY',
            quantity: 0.01,
            tags: JSON.stringify({ protectiveOrderIds: [11, 12] }),
        });
        (binanceOrderService.getCurrentPrice as jest.Mock).mockResolvedValue(50500);
        (binanceOrderService.getSymbolInfo as jest.Mock).mockResolvedValue({
            minQty: 0.001,
            maxQty: 1000,
            stepSize: 0.001,
            minNotional: 5,
            tickSize: 0.01,
        });
        (binanceOrderService.roundToStepSize as jest.Mock).mockReturnValue(0.01);
        (binanceOrderService.cancelOrder as jest.Mock).mockResolvedValue({});
        (binanceOrderService.placeMarketOrder as jest.Mock).mockResolvedValue({
            orderId: 777,
            price: '50500',
            cummulativeQuoteQty: '505',
            executedQty: '0.01',
            status: 'FILLED',
            symbol: 'BTCUSDT',
            origQty: '0.01',
            type: 'MARKET',
            side: 'SELL',
        });
        (db.closeTrade as jest.Mock).mockResolvedValue({ id: 'trade-x', status: 'CLOSED' });

        const res = await engine.executeExit('trade-x', 'manual_test');

        expect(res.exitOrderId).toBe(777);
        expect(binanceOrderService.placeMarketOrder).toHaveBeenCalledWith('BTCUSDT', 'SELL', 0.01);
        expect(db.closeTrade).toHaveBeenCalledWith('trade-x', 50500, undefined, expect.objectContaining({ status: 'CLOSED' }));
    });
});
