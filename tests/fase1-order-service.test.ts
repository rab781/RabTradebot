jest.mock('axios', () => ({
    request: jest.fn(),
}));

import axios from 'axios';
import { BinanceOrderService } from '../src/services/binanceOrderService';

const mockAxiosRequest = axios.request as jest.Mock;

describe('F1: BinanceOrderService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.BINANCE_API_KEY = 'test-key';
        process.env.BINANCE_API_SECRET = 'test-secret';
        delete process.env.BINANCE_BASE_URL;
        delete process.env.BINANCE_TESTNET;
        delete process.env.BINANCE_TESTNET_URL;
    });

    it('uses testnet URL when BINANCE_TESTNET=true', () => {
        process.env.BINANCE_TESTNET = 'true';
        process.env.BINANCE_TESTNET_URL = 'https://testnet.binance.vision';

        const svc = new BinanceOrderService();
        expect(svc.getBaseUrl()).toBe('https://testnet.binance.vision');
    });

    it('roundToStepSize floors quantity to valid step size', () => {
        const svc = new BinanceOrderService();
        const rounded = svc.roundToStepSize(0.0015123, 0.001);
        expect(rounded).toBe(0.001);
    });

    it('getSymbolInfo parses LOT_SIZE, MIN_NOTIONAL, PRICE_FILTER', async () => {
        const svc = new BinanceOrderService();

        mockAxiosRequest.mockResolvedValueOnce({
            data: {
                symbols: [
                    {
                        symbol: 'BTCUSDT',
                        filters: [
                            { filterType: 'LOT_SIZE', minQty: '0.00001000', maxQty: '9000.00000000', stepSize: '0.00001000' },
                            { filterType: 'MIN_NOTIONAL', minNotional: '5.00000000' },
                            { filterType: 'PRICE_FILTER', tickSize: '0.01000000' },
                        ],
                    },
                ],
            },
        });

        const info = await svc.getSymbolInfo('BTCUSDT');
        expect(info.minQty).toBe(0.00001);
        expect(info.maxQty).toBe(9000);
        expect(info.stepSize).toBe(0.00001);
        expect(info.minNotional).toBe(5);
        expect(info.tickSize).toBe(0.01);
    });

    it('retries request for HTTP 429 and eventually succeeds', async () => {
        const svc = new BinanceOrderService();

        mockAxiosRequest
            .mockRejectedValueOnce({ response: { status: 429, data: { msg: 'Too many requests' } }, message: '429' })
            .mockResolvedValueOnce({ data: { symbol: 'BTCUSDT', price: '100000.00' } });

        const price = await svc.getCurrentPrice('BTCUSDT');

        expect(price).toBe(100000);
        expect(mockAxiosRequest).toHaveBeenCalledTimes(2);
    });

    it('does not retry for Binance -2010 insufficient balance error', async () => {
        const svc = new BinanceOrderService();

        mockAxiosRequest.mockRejectedValueOnce({
            response: {
                status: 400,
                data: { code: -2010, msg: 'Account has insufficient balance for requested action.' },
            },
            message: 'insufficient balance',
        });

        await expect(svc.placeMarketOrder('BTCUSDT', 'BUY', 0.001)).rejects.toThrow(/-2010/);
        expect(mockAxiosRequest).toHaveBeenCalledTimes(1);
    });
});
