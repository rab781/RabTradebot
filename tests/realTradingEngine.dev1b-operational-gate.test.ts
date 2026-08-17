jest.mock('../src/services/databaseService', () => ({
    db: {
        getTradeById: jest.fn(),
        logError: jest.fn(),
    },
}));

jest.mock('../src/services/binanceOrderService', () => ({
    binanceOrderService: {
        isConfigured: jest.fn(() => true),
        getSymbolInfo: jest.fn(),
        getAccountBalance: jest.fn(),
        getCurrentPrice: jest.fn(),
        roundToStepSize: jest.fn(),
        cancelOrder: jest.fn(),
    },
}));

import { RealTradingEngine } from '../src/services/realTradingEngine';
import { db } from '../src/services/databaseService';
import { IStrategy } from '../src/types/strategy';

const strategy: IStrategy = {
    name: 'DEV1BTestStrategy',
    version: '1.0.0',
    timeframe: '5m',
    canShort: false,
    stoploss: -0.03,
    minimalRoi: { '0': 0.1 },
    trailingStop: false,
    trailingStopPositive: 0,
    trailingStopPositiveOffset: 0,
    stakeAmount: 'unlimited',
    maxOpenTrades: 1,
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

describe('DEV1-B RealTradingEngine operational NEW-entry gate', () => {
    test('blocks BUY before any exchange/order work when Binance REST is unavailable', async () => {
        const executeMarket = jest.fn();
        const operationalGate = {
            getEntryGate: jest.fn(() => ({
                allowed: false,
                blockers: ['BINANCE_REST_UNAVAILABLE'],
                status: 'UNAVAILABLE' as const,
                checkedAt: Date.now(),
                ageMs: 0,
            })),
        };

        const engine = new RealTradingEngine(
            undefined,
            { executeMarket } as any,
            operationalGate,
        );

        await expect(engine.executeEntry({
            userId: 1,
            symbol: 'BTCUSDT',
            signal: {
                action: 'BUY',
                price: 0,
                stopLoss: 0,
                takeProfit: 0,
                confidence: 0.8,
                reason: 'test',
                text: 'test',
            },
            strategy,
            riskParams: {
                riskPerTrade: 0.01,
                maxPositionSize: 0.1,
                minPositionSize: 0.01,
                maxOpenTrades: 1,
                stopLossPctFallback: 0.03,
            },
        })).rejects.toThrow(
            'Live Spot NEW entry blocked by Binance REST operational gate: BINANCE_REST_UNAVAILABLE',
        );

        expect(operationalGate.getEntryGate).toHaveBeenCalledTimes(1);
        expect(executeMarket).not.toHaveBeenCalled();
    });

    test('does not apply the NEW-entry operational gate to existing LONG exit attempts', async () => {
        const operationalGate = {
            getEntryGate: jest.fn(() => ({
                allowed: false,
                blockers: ['BINANCE_REST_UNAVAILABLE'],
                status: 'UNAVAILABLE' as const,
                checkedAt: Date.now(),
                ageMs: 0,
            })),
        };

        const engine = new RealTradingEngine(
            undefined,
            { executeMarket: jest.fn() } as any,
            operationalGate,
        );

        (db.getTradeById as jest.Mock).mockResolvedValue(null);

        await expect(engine.executeExit('missing-trade', 'test')).rejects.toThrow(
            'Trade not found: missing-trade',
        );

        expect(operationalGate.getEntryGate).not.toHaveBeenCalled();
    });
});
