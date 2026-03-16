/**
 * F0-4 + F0-6 Tests
 *
 * F0-4: SignalGenerator returns a structured SignalResult (not a plain string)
 * F0-6: DatabaseService — saveTrade status param, closeTrade profit direction,
 *       findOpenTrade status param, getOpenPaperTrades
 *
 * Strategy: bypass the DatabaseService constructor entirely using Object.create
 * and inject a controlled Prisma mock directly. This avoids all module-singleton
 * and jest.requireActual cross-registry issues.
 */

// ── Module mocks (hoisted by Jest) ────────────────────────────────────────────
// Needed so databaseService module can be imported without real Prisma deps
jest.mock('@prisma/adapter-libsql', () => ({ PrismaLibSql: jest.fn() }));
jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn().mockImplementation(() => ({})) }));
// Auto-mock heavy service deps so SignalGenerator can be imported cleanly
jest.mock('../src/services/technicalAnalyzer');
jest.mock('../src/services/chutesService');

// ── Imports ───────────────────────────────────────────────────────────────────

import { DatabaseService } from '../src/services/databaseService';
import { SignalGenerator } from '../src/services/signalGenerator';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface MockPrisma {
    trade: { create: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
}

/**
 * Create a DatabaseService instance with a fully-controlled mock Prisma injected.
 * Uses Object.create to skip the constructor (no real DB connection needed).
 */
function buildService(): { svc: DatabaseService; p: MockPrisma } {
    const p: MockPrisma = {
        trade: {
            create: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
        },
    };
    const svc = Object.create(DatabaseService.prototype) as DatabaseService;
    (svc as any).prisma = p;
    return { svc, p };
}

// ─────────────────────────────────────────────────────────────────────────────
// F0-4 — SignalGenerator returns structured SignalResult
// ─────────────────────────────────────────────────────────────────────────────

describe('F0-4: SignalGenerator returns a structured SignalResult', () => {
    let mockTechnicalAnalyzer: { analyzeSymbol: jest.Mock };
    let mockChutesService: { isConfigured: jest.Mock; searchCryptoNews: jest.Mock; analyzeNewsImpact: jest.Mock };
    let signalGenerator: SignalGenerator;

    const TECH_ANALYSIS_TEXT = 'RSI: 45 | MACD: Bullish';

    beforeEach(() => {
        mockTechnicalAnalyzer = {
            analyzeSymbol: jest.fn().mockResolvedValue(TECH_ANALYSIS_TEXT),
        } as any;

        mockChutesService = {
            isConfigured: jest.fn().mockReturnValue(false),
            searchCryptoNews: jest.fn(),
            analyzeNewsImpact: jest.fn(),
        } as any;

        signalGenerator = new SignalGenerator(
            mockTechnicalAnalyzer as any,
            mockChutesService as any,
        );
    });

    it('returns an object with the expected SignalResult shape (not a plain string)', async () => {
        const result = await signalGenerator.generateSignal('BTCUSDT');

        expect(typeof result).toBe('object');
        expect(result).toHaveProperty('action');
        expect(result).toHaveProperty('price');
        expect(result).toHaveProperty('stopLoss');
        expect(result).toHaveProperty('takeProfit');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('reason');
        expect(result).toHaveProperty('text');
    });

    it('includes the symbol in the text field', async () => {
        const result = await signalGenerator.generateSignal('BTCUSDT');
        expect(result.text).toContain('BTCUSDT');
    });

    it('includes the technical analysis output in the text', async () => {
        const result = await signalGenerator.generateSignal('BTCUSDT');
        expect(result.text).toContain(TECH_ANALYSIS_TEXT);
    });

    it('defaults to HOLD with confidence 0.5 when Chutes is not configured', async () => {
        mockChutesService.isConfigured.mockReturnValue(false);
        const result = await signalGenerator.generateSignal('BTCUSDT');

        expect(result.action).toBe('HOLD');
        expect(result.confidence).toBe(0.5);
    });

    it('returns BUY action when Chutes sentiment is BULLISH', async () => {
        mockChutesService.isConfigured.mockReturnValue(true);
        mockChutesService.searchCryptoNews.mockResolvedValue([{ title: 'BTC pumps' }] as any);
        mockChutesService.analyzeNewsImpact.mockResolvedValue({
            overallSentiment: 'BULLISH',
            marketMovement: { direction: 'UP', confidence: 0.82 },
            impactPrediction: { shortTerm: 'Price expected to rise' },
        } as any);

        const result = await signalGenerator.generateSignal('BTCUSDT');

        expect(result.action).toBe('BUY');
        expect(result.confidence).toBe(0.82);
    });

    it('returns SELL action when Chutes sentiment is BEARISH', async () => {
        mockChutesService.isConfigured.mockReturnValue(true);
        mockChutesService.searchCryptoNews.mockResolvedValue([{ title: 'BTC dumps' }] as any);
        mockChutesService.analyzeNewsImpact.mockResolvedValue({
            overallSentiment: 'BEARISH',
            marketMovement: { direction: 'DOWN', confidence: 0.71 },
            impactPrediction: { shortTerm: 'Bearish pressure' },
        } as any);

        const result = await signalGenerator.generateSignal('BTCUSDT');

        expect(result.action).toBe('SELL');
        expect(result.confidence).toBe(0.71);
    });

    it('returns HOLD action when Chutes sentiment is NEUTRAL', async () => {
        mockChutesService.isConfigured.mockReturnValue(true);
        mockChutesService.searchCryptoNews.mockResolvedValue([{ title: 'BTC flat' }] as any);
        mockChutesService.analyzeNewsImpact.mockResolvedValue({
            overallSentiment: 'NEUTRAL',
            marketMovement: { direction: 'FLAT', confidence: 0.55 },
            impactPrediction: { shortTerm: 'Sideways movement' },
        } as any);

        const result = await signalGenerator.generateSignal('BTCUSDT');

        expect(result.action).toBe('HOLD');
    });

    it('falls back to HOLD when Chutes returns no news items', async () => {
        mockChutesService.isConfigured.mockReturnValue(true);
        mockChutesService.searchCryptoNews.mockResolvedValue([] as any);

        const result = await signalGenerator.generateSignal('ETHUSDT');

        expect(result.action).toBe('HOLD');
        expect(result.confidence).toBe(0.5);
    });

    it('confidence comes from newsAnalysis.marketMovement.confidence (not hardcoded 0.75)', async () => {
        mockChutesService.isConfigured.mockReturnValue(true);
        mockChutesService.searchCryptoNews.mockResolvedValue([{}] as any);
        mockChutesService.analyzeNewsImpact.mockResolvedValue({
            overallSentiment: 'BULLISH',
            marketMovement: { direction: 'UP', confidence: 0.91 },
            impactPrediction: { shortTerm: 'Strong upward' },
        } as any);

        const result = await signalGenerator.generateSignal('SOLUSDT');

        expect(result.confidence).toBe(0.91);
        expect(result.confidence).not.toBe(0.75);   // old hardcoded value
    });

    it('price, stopLoss, takeProfit are 0 (pending exchange data)', async () => {
        const result = await signalGenerator.generateSignal('BTCUSDT');
        expect(result.price).toBe(0);
        expect(result.stopLoss).toBe(0);
        expect(result.takeProfit).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// F0-6 — DatabaseService method behaviours
// ─────────────────────────────────────────────────────────────────────────────

describe('F0-6: DatabaseService — saveTrade uses provided status', () => {
    let svc: DatabaseService;
    let p: MockPrisma;

    beforeEach(() => {
        ({ svc, p } = buildService());
    });

    it('uses PAPER_OPEN when status is explicitly provided', async () => {
        p.trade.create.mockResolvedValueOnce({ id: 't1', status: 'PAPER_OPEN' });

        await svc.saveTrade({
            userId: 1,
            symbol: 'BTCUSDT',
            side: 'BUY',
            entryPrice: 50000,
            quantity: 0.01,
            status: 'PAPER_OPEN',
            notes: 'PAPER_TRADE',
        });

        expect(p.trade.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'PAPER_OPEN' }),
            }),
        );
    });

    it('defaults to OPEN when no status is provided', async () => {
        p.trade.create.mockResolvedValueOnce({ id: 't2', status: 'OPEN' });

        await svc.saveTrade({
            userId: 1,
            symbol: 'BTCUSDT',
            side: 'BUY',
            entryPrice: 50000,
            quantity: 0.01,
        });

        expect(p.trade.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'OPEN' }),
            }),
        );
    });
});

describe('F0-6: DatabaseService — closeTrade profit direction', () => {
    const ENTRY = 50000;
    const EXIT = 55000;
    const QTY = 0.01;

    let svc: DatabaseService;
    let p: MockPrisma;

    beforeEach(() => {
        ({ svc, p } = buildService());
        p.trade.update.mockResolvedValue({ id: 'trade-closed' });
    });

    it('calculates profit as (exit - entry) * qty for side BUY (long)', async () => {
        p.trade.findUnique.mockResolvedValueOnce({
            id: 't-buy',
            side: 'BUY',
            entryPrice: ENTRY,
            quantity: QTY,
        });

        await svc.closeTrade('t-buy', EXIT);

        const expectedProfit = (EXIT - ENTRY) * QTY;   // (55000 - 50000) * 0.01 = 50
        expect(p.trade.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ profit: expectedProfit }),
            }),
        );
    });

    it('calculates same long profit for legacy side LONG (backward compat)', async () => {
        p.trade.findUnique.mockResolvedValueOnce({
            id: 't-long',
            side: 'LONG',
            entryPrice: ENTRY,
            quantity: QTY,
        });

        await svc.closeTrade('t-long', EXIT);

        const expectedProfit = (EXIT - ENTRY) * QTY;
        expect(p.trade.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ profit: expectedProfit }),
            }),
        );
    });

    it('calculates profit as (entry - exit) * qty for side SELL (short)', async () => {
        p.trade.findUnique.mockResolvedValueOnce({
            id: 't-sell',
            side: 'SELL',
            entryPrice: ENTRY,
            quantity: QTY,
        });

        await svc.closeTrade('t-sell', EXIT);

        const expectedProfit = (ENTRY - EXIT) * QTY;   // (50000 - 55000) * 0.01 = -50
        expect(p.trade.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ profit: expectedProfit }),
            }),
        );
    });

    it('SELL and BUY profits are opposite in sign when price moved against position', async () => {
        const LOWER_EXIT = 45000;

        p.trade.findUnique.mockResolvedValueOnce({
            id: 't-buy2',
            side: 'BUY',
            entryPrice: ENTRY,
            quantity: QTY,
        });
        await svc.closeTrade('t-buy2', LOWER_EXIT);
        const buyProfit = (p.trade.update.mock.calls[0][0] as any).data.profit;

        jest.clearAllMocks();
        p.trade.update.mockResolvedValue({ id: 'trade-closed' });

        p.trade.findUnique.mockResolvedValueOnce({
            id: 't-sell2',
            side: 'SELL',
            entryPrice: ENTRY,
            quantity: QTY,
        });
        await svc.closeTrade('t-sell2', LOWER_EXIT);
        const sellProfit = (p.trade.update.mock.calls[0][0] as any).data.profit;

        expect(buyProfit).toBeLessThan(0);      // BUY lost (price dropped)
        expect(sellProfit).toBeGreaterThan(0);  // SELL gained (price dropped)
        expect(buyProfit).toBeCloseTo(-sellProfit);
    });
});

describe('F0-6: DatabaseService — findOpenTrade accepts custom status', () => {
    let svc: DatabaseService;
    let p: MockPrisma;

    beforeEach(() => {
        ({ svc, p } = buildService());
        p.trade.findMany.mockResolvedValue([]);
    });

    it('queries with PAPER_OPEN status when passed as 4th argument', async () => {
        await svc.findOpenTrade('1', 'BTCUSDT', 50000, 'PAPER_OPEN');

        expect(p.trade.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ status: 'PAPER_OPEN' }),
            }),
        );
    });

    it('defaults to OPEN when no status argument provided', async () => {
        await svc.findOpenTrade('1', 'BTCUSDT', 50000);

        expect(p.trade.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ status: 'OPEN' }),
            }),
        );
    });
});

describe('F0-6: DatabaseService — getOpenPaperTrades', () => {
    let svc: DatabaseService;
    let p: MockPrisma;

    beforeEach(() => {
        ({ svc, p } = buildService());
        p.trade.findMany.mockResolvedValue([]);
    });

    it('always queries with status PAPER_OPEN', async () => {
        await svc.getOpenPaperTrades(1);

        expect(p.trade.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ status: 'PAPER_OPEN' }),
            }),
        );
    });

    it('includes symbol filter when symbol is provided', async () => {
        await svc.getOpenPaperTrades(1, 'BTCUSDT');

        expect(p.trade.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ status: 'PAPER_OPEN', symbol: 'BTCUSDT' }),
            }),
        );
    });

    it('omits symbol filter when symbol is not provided', async () => {
        await svc.getOpenPaperTrades(1);

        const callArg = p.trade.findMany.mock.calls[0][0] as any;
        expect(callArg.where).not.toHaveProperty('symbol');
    });
});
