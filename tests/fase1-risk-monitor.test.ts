jest.mock('../src/services/databaseService', () => ({
    db: {
        getOpenLiveTrades: jest.fn(),
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

import { RiskMonitorLoop } from '../src/services/riskMonitorLoop';
import { db } from '../src/services/databaseService';
import { binanceOrderService } from '../src/services/binanceOrderService';

describe('F1: RiskMonitorLoop', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('triggers executeExit when stop loss is hit', async () => {
        const executeExit = jest.fn().mockResolvedValue({});
        const loop = new RiskMonitorLoop({ executeExit } as any, {
            pollIntervalMs: 1000,
            trailingStopPositive: 0.01,
            circuitBreakerDrawdownPct: 0.5,
        });

        (db.getOpenLiveTrades as jest.Mock).mockResolvedValue([
            {
                id: 't1',
                userId: 1,
                symbol: 'BTCUSDT',
                side: 'BUY',
                entryPrice: 50000,
                stopLoss: 49500,
                takeProfit: null,
            },
        ]);
        (binanceOrderService.getCurrentPrice as jest.Mock).mockResolvedValue(49400);
        (binanceOrderService.getAccountBalance as jest.Mock).mockResolvedValue([
            { asset: 'USDT', free: '1000', locked: '0' },
        ]);

        await loop.start();
        loop.stop();

        expect(executeExit).toHaveBeenCalledWith('t1', 'stop_loss_triggered');
    });

    it('updates trailing stop when price moves favorably for long trade', async () => {
        const executeExit = jest.fn().mockResolvedValue({});
        const loop = new RiskMonitorLoop({ executeExit } as any, {
            pollIntervalMs: 1000,
            trailingStopPositive: 0.01,
            circuitBreakerDrawdownPct: 0.5,
        });

        (db.getOpenLiveTrades as jest.Mock).mockResolvedValue([
            {
                id: 't2',
                userId: 1,
                symbol: 'BTCUSDT',
                side: 'BUY',
                entryPrice: 50000,
                stopLoss: 49000,
                takeProfit: null,
            },
        ]);
        (binanceOrderService.getCurrentPrice as jest.Mock).mockResolvedValue(51000);
        (binanceOrderService.getAccountBalance as jest.Mock).mockResolvedValue([
            { asset: 'USDT', free: '1000', locked: '0' },
        ]);

        await loop.start();
        loop.stop();

        expect(db.updateTradeRisk).toHaveBeenCalledWith('t2', expect.objectContaining({
            stopLoss: 50490,
        }));
        expect(executeExit).not.toHaveBeenCalled();
    });

    it('closes all open trades when circuit breaker drawdown threshold is breached', async () => {
        jest.useFakeTimers();

        const executeExit = jest.fn().mockResolvedValue({});
        const notifier = jest.fn().mockResolvedValue(undefined);
        const loop = new RiskMonitorLoop({ executeExit } as any, {
            pollIntervalMs: 1000,
            trailingStopPositive: 0.01,
            circuitBreakerDrawdownPct: 0.15,
        }, notifier);

        (db.getOpenLiveTrades as jest.Mock)
            .mockResolvedValueOnce([
                {
                    id: 't3',
                    userId: 7,
                    symbol: 'BTCUSDT',
                    side: 'BUY',
                    entryPrice: 50000,
                    stopLoss: 49000,
                    takeProfit: 52000,
                },
            ])
            .mockResolvedValueOnce([
                {
                    id: 't3',
                    userId: 7,
                    symbol: 'BTCUSDT',
                    side: 'BUY',
                    entryPrice: 50000,
                    stopLoss: 49000,
                    takeProfit: 52000,
                },
            ])
            .mockResolvedValueOnce([
                {
                    id: 't3',
                    userId: 7,
                    symbol: 'BTCUSDT',
                    side: 'BUY',
                    entryPrice: 50000,
                    stopLoss: 49000,
                    takeProfit: 52000,
                },
            ]);
        (binanceOrderService.getCurrentPrice as jest.Mock).mockResolvedValue(50000);
        (binanceOrderService.getAccountBalance as jest.Mock)
            .mockResolvedValueOnce([{ asset: 'USDT', free: '1000', locked: '0' }])
            .mockResolvedValueOnce([{ asset: 'USDT', free: '700', locked: '0' }]);

        await loop.start();
        await jest.advanceTimersByTimeAsync(1000);
        loop.stop();
        jest.useRealTimers();

        expect(executeExit).toHaveBeenCalledWith('t3', 'circuit_breaker');
        expect(notifier).toHaveBeenCalledWith(expect.stringContaining('CIRCUIT BREAKER aktif'), 7);
    });
});
