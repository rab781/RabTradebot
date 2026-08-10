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

import { SignalGenerator, SignalResult } from '../src/services/signalGenerator';
import { RealTradingEngine } from '../src/services/realTradingEngine';
import { binanceOrderService } from '../src/services/binanceOrderService';
import { db } from '../src/services/databaseService';
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

function makeGenerator(sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL', confidence: number): SignalGenerator {
    const technicalAnalyzer = {
        analyzeSymbol: jest.fn().mockResolvedValue('technical analysis'),
    };
    const chutesService = {
        isConfigured: jest.fn().mockReturnValue(true),
        searchCryptoNews: jest.fn().mockResolvedValue([{ title: 'test' }]),
        analyzeNewsImpact: jest.fn().mockResolvedValue({
            overallSentiment: sentiment,
            impactPrediction: { shortTerm: 'test impact' },
            marketMovement: {
                direction: sentiment === 'BULLISH' ? 'UP' : sentiment === 'BEARISH' ? 'DOWN' : 'SIDEWAYS',
                confidence,
            },
        }),
    };
    return new SignalGenerator(technicalAnalyzer as any, chutesService as any);
}

describe('B4.2-SAFE Spot execution boundary', () => {
    beforeEach(() => jest.clearAllMocks());

    it('normalizes historical Chutes 0-100 confidence into canonical 0-1', async () => {
        const result = await makeGenerator('BULLISH', 75).generateSignal('BTCUSDT');
        expect(result.action).toBe('BUY');
        expect(result.confidence).toBeCloseTo(0.75);
        expect(result.text).toContain('Confidence: 75.0%');
    });

    it('keeps already-normalized confidence unchanged', async () => {
        const result = await makeGenerator('BULLISH', 0.82).generateSignal('BTCUSDT');
        expect(result.action).toBe('BUY');
        expect(result.confidence).toBeCloseTo(0.82);
        expect(result.text).toContain('Confidence: 82.0%');
    });

    it('fails closed: bearish news never becomes a Spot SELL entry signal', async () => {
        const result = await makeGenerator('BEARISH', 91).generateSignal('BTCUSDT');
        expect(result.action).toBe('HOLD');
        expect(result.confidence).toBeCloseTo(0.91);
    });

    it('hard-rejects legacy SELL entry before any Binance/account/database request', async () => {
        const engine = new RealTradingEngine();
        const signal: SignalResult = {
            action: 'SELL',
            price: 0,
            stopLoss: 0,
            takeProfit: 0,
            confidence: 0.9,
            reason: 'legacy bearish signal',
            text: 'legacy bearish signal',
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
        })).rejects.toThrow(/SELL cannot open a Spot position/);

        expect(binanceOrderService.isConfigured).not.toHaveBeenCalled();
        expect(binanceOrderService.getSymbolInfo).not.toHaveBeenCalled();
        expect(binanceOrderService.getAccountBalance).not.toHaveBeenCalled();
        expect(binanceOrderService.getCurrentPrice).not.toHaveBeenCalled();
        expect(binanceOrderService.placeMarketOrder).not.toHaveBeenCalled();
        expect(db.saveTrade).not.toHaveBeenCalled();
    });
});
