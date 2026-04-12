/**
 * F6: BinanceOrderService Unit Tests
 * Tests signature generation, step size rounding, error handling,
 * and rate limiter integration — all with mocked HTTP calls.
 */

import { BinanceOrderService } from '../src/services/binanceOrderService';

// Mock axios to prevent real HTTP calls
jest.mock('axios', () => ({
    __esModule: true,
    default: {
        request: jest.fn(),
    },
}));

import axios from 'axios';
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('F6: BinanceOrderService', () => {
    let service: BinanceOrderService;

    beforeEach(() => {
        jest.clearAllMocks();
        // Set API keys in env for tests
        process.env.BINANCE_API_KEY = 'test-api-key';
        process.env.BINANCE_API_SECRET = 'test-api-secret';
        process.env.BINANCE_TESTNET = '1';
        service = new BinanceOrderService();
    });

    afterEach(() => {
        delete process.env.BINANCE_API_KEY;
        delete process.env.BINANCE_API_SECRET;
        delete process.env.BINANCE_TESTNET;
        delete process.env.BINANCE_BASE_URL;
        delete process.env.BINANCE_PROXY_URL;
    });

    // ─── Configuration ─────────────────────────────────────────────────────────

    describe('Configuration', () => {
        it('should report configured when API keys are set', () => {
            expect(service.isConfigured()).toBe(true);
        });

        it('should report not configured when keys are missing', () => {
            delete process.env.BINANCE_API_KEY;
            delete process.env.BINANCE_API_SECRET;
            const unconfigured = new BinanceOrderService();
            expect(unconfigured.isConfigured()).toBe(false);
        });

        it('should use testnet URL when BINANCE_TESTNET=1', () => {
            expect(service.getBaseUrl()).toContain('testnet');
        });

        it('should use production URL by default', () => {
            delete process.env.BINANCE_TESTNET;
            const prodService = new BinanceOrderService();
            expect(prodService.getBaseUrl()).toContain('api.binance.com');
        });

        it('should prefer explicit BINANCE_BASE_URL over auto-detect', () => {
            process.env.BINANCE_BASE_URL = 'https://custom.binance.com';
            const customService = new BinanceOrderService();
            expect(customService.getBaseUrl()).toBe('https://custom.binance.com');
        });
    });

    // ─── Step Size Rounding ────────────────────────────────────────────────────

    describe('roundToStepSize', () => {
        it('should round down to nearest step size', () => {
            expect(service.roundToStepSize(0.123456, 0.001)).toBe(0.123);
        });

        it('should handle whole number step sizes', () => {
            expect(service.roundToStepSize(15.7, 1)).toBe(15);
        });

        it('should handle exact multiples of step size', () => {
            expect(service.roundToStepSize(0.5, 0.1)).toBe(0.5);
        });

        it('should handle very small step sizes (8 decimal places)', () => {
            const result = service.roundToStepSize(0.12345678, 0.00000001);
            expect(result).toBe(0.12345678);
        });

        it('should return 0 for quantity smaller than step size', () => {
            expect(service.roundToStepSize(0.0001, 0.01)).toBe(0);
        });

        it('should throw on zero step size', () => {
            expect(() => service.roundToStepSize(1.5, 0)).toThrow();
        });

        it('should throw on negative step size', () => {
            expect(() => service.roundToStepSize(1.5, -0.01)).toThrow();
        });
    });

    // ─── Rate Limiter Integration ──────────────────────────────────────────────

    describe('Rate Limiter Integration', () => {
        it('should expose rate limiter snapshot', () => {
            const snapshot = service.getRateLimiterSnapshot();

            expect(snapshot).toBeDefined();
            expect(typeof snapshot.restTokens).toBe('number');
            expect(typeof snapshot.orderTokens).toBe('number');
            expect(snapshot.rest.capacity).toBeGreaterThan(0);
        });
    });

    // ─── API Error Handling ────────────────────────────────────────────────────

    describe('Error Handling', () => {
        it('should throw descriptive error when keys are not configured', async () => {
            delete process.env.BINANCE_API_KEY;
            delete process.env.BINANCE_API_SECRET;
            const unconfigured = new BinanceOrderService();

            await expect(
                unconfigured.placeMarketOrder('BTCUSDT', 'BUY', 0.001)
            ).rejects.toThrow(/not configured/i);
        });

        it('should format Binance error codes correctly', async () => {
            (mockAxios as any).request.mockRejectedValueOnce({
                response: {
                    status: 400,
                    data: { code: -1121, msg: 'Invalid symbol.' },
                    headers: {},
                },
                message: 'Request failed with status code 400',
                isAxiosError: true,
            });

            await expect(
                service.getCurrentPrice('INVALIDPAIR')
            ).rejects.toThrow(/Invalid symbol/);
        });

        it('should handle network timeout errors', async () => {
            (mockAxios as any).request.mockRejectedValueOnce({
                message: 'timeout of 12000ms exceeded',
                code: 'ECONNABORTED',
                isAxiosError: true,
            });

            await expect(
                service.getCurrentPrice('BTCUSDT')
            ).rejects.toThrow(/timeout/i);
        });
    });

    // ─── Successful API Calls ──────────────────────────────────────────────────

    describe('Successful API Calls', () => {
        it('should parse current price from ticker response', async () => {
            (mockAxios as any).request.mockResolvedValueOnce({
                data: { symbol: 'BTCUSDT', price: '50123.45' },
                headers: { 'x-mbx-used-weight-1m': '1' },
            });

            const price = await service.getCurrentPrice('BTCUSDT');
            expect(price).toBe(50123.45);
        });

        it('should parse account balance filtering zero balances', async () => {
            (mockAxios as any).request.mockResolvedValueOnce({
                data: {
                    balances: [
                        { asset: 'BTC', free: '0.5', locked: '0' },
                        { asset: 'ETH', free: '0', locked: '0' },
                        { asset: 'USDT', free: '1000', locked: '50' },
                    ],
                },
                headers: { 'x-mbx-used-weight-1m': '10' },
            });

            const balances = await service.getAccountBalance();
            expect(balances.length).toBe(2); // BTC and USDT only
            expect(balances.map(b => b.asset)).toContain('BTC');
            expect(balances.map(b => b.asset)).toContain('USDT');
            expect(balances.map(b => b.asset)).not.toContain('ETH');
        });

        it('should parse symbol info from exchange info', async () => {
            (mockAxios as any).request.mockResolvedValueOnce({
                data: {
                    symbols: [
                        {
                            symbol: 'BTCUSDT',
                            filters: [
                                { filterType: 'LOT_SIZE', minQty: '0.00001', maxQty: '9000', stepSize: '0.00001' },
                                { filterType: 'PRICE_FILTER', tickSize: '0.01', minPrice: '0.01', maxPrice: '100000' },
                                { filterType: 'MIN_NOTIONAL', minNotional: '10' },
                            ],
                        },
                    ],
                },
                headers: { 'x-mbx-used-weight-1m': '10' },
            });

            const info = await service.getSymbolInfo('BTCUSDT');
            expect(info.minQty).toBe(0.00001);
            expect(info.maxQty).toBe(9000);
            expect(info.stepSize).toBe(0.00001);
            expect(info.minNotional).toBe(10);
            expect(info.tickSize).toBe(0.01);
        });
    });
});
