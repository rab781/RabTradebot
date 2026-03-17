jest.mock('../src/services/databaseService', () => ({
    db: {
        countOpenLiveTrades: jest.fn(),
        saveTrade: jest.fn(),
        getTradeById: jest.fn(),
        closeTrade: jest.fn(),
        getOpenLiveTrades: jest.fn(),
        updateTradeRisk: jest.fn(),
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

import { RealTradingEngine } from '../src/services/realTradingEngine';
import { RiskMonitorLoop } from '../src/services/riskMonitorLoop';
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

describe('F1-35: full live flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (binanceOrderService.isConfigured as jest.Mock).mockReturnValue(true);
    });

    it('runs signal -> entry order -> risk monitor -> exit order', async () => {
        const notifier = jest.fn().mockResolvedValue(undefined);
        const engine = new RealTradingEngine(notifier);
        const loop = new RiskMonitorLoop(engine, {
            pollIntervalMs: 1000,
            trailingStopPositive: 0.01,
            circuitBreakerDrawdownPct: 0.5,
        }, notifier);

        const signal: SignalResult = {
            action: 'BUY',
            price: 0,
            stopLoss: 49500,
            takeProfit: 52000,
            confidence: 0.82,
            reason: 'bullish breakout',
            text: 'BUY BTCUSDT',
        };

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
        (binanceOrderService.getCurrentPrice as jest.Mock)
            .mockResolvedValueOnce(50000)
            .mockResolvedValueOnce(49400)
            .mockResolvedValueOnce(49400);
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
                orderId: 54321,
                price: '49400',
                cummulativeQuoteQty: '494',
                executedQty: '0.01',
                status: 'FILLED',
                symbol: 'BTCUSDT',
                origQty: '0.01',
                type: 'MARKET',
                side: 'SELL',
            });

        (db.saveTrade as jest.Mock).mockResolvedValue({ id: 'trade-flow-1' });
        (db.getTradeById as jest.Mock).mockResolvedValue({
            id: 'trade-flow-1',
            userId: 1,
            symbol: 'BTCUSDT',
            side: 'BUY',
            quantity: 0.01,
            tags: JSON.stringify({ protectiveOrderIds: [] }),
        });
        (db.closeTrade as jest.Mock).mockResolvedValue({ id: 'trade-flow-1', status: 'CLOSED' });
        (db.getOpenLiveTrades as jest.Mock).mockResolvedValue([
            {
                id: 'trade-flow-1',
                userId: 1,
                symbol: 'BTCUSDT',
                side: 'BUY',
                entryPrice: 50010,
                quantity: 0.01,
                stopLoss: 49500,
                takeProfit: 52000,
            },
        ]);

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

        await loop.start();
        loop.stop();

        expect(db.saveTrade).toHaveBeenCalledWith(expect.objectContaining({ status: 'LIVE_OPEN' }));
        expect(db.closeTrade).toHaveBeenCalledWith(
            'trade-flow-1',
            49400,
            undefined,
            expect.objectContaining({ status: 'CLOSED' }),
        );
        expect(notifier).toHaveBeenCalledWith(expect.stringContaining('LIVE ENTRY BTCUSDT'), 1);
        expect(notifier).toHaveBeenCalledWith(expect.stringContaining('Stop loss triggered'), 1);
        expect(notifier).toHaveBeenCalledWith(expect.stringContaining('LIVE EXIT BTCUSDT'), 1);
    });
});
