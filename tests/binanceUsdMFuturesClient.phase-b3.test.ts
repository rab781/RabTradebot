import crypto from 'crypto';
import {
    BinanceUsdMFuturesClient,
    FuturesHttpRequest,
    FuturesHttpTransport,
} from '../src/services/execution/binanceUsdMFuturesClient';

function makeTransport(responseData: unknown = {}): FuturesHttpTransport & { request: jest.Mock } {
    return {
        request: jest.fn(async () => ({ data: responseData })) as any,
    };
}

function signedClient(transport: FuturesHttpTransport) {
    return new BinanceUsdMFuturesClient({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        recvWindow: 5000,
        transport,
        now: () => 1_700_000_000_000,
    });
}

function requestUrl(transport: FuturesHttpTransport & { request: jest.Mock }): string {
    return (transport.request.mock.calls[0][0] as FuturesHttpRequest).url;
}

describe('Phase B3 - BinanceUsdMFuturesClient', () => {
    it('submits MARKET order through /fapi/v1/order with signed query and API key', async () => {
        const transport = makeTransport({ orderId: 1 });
        const client = signedClient(transport);

        await client.placeMarketOrder({
            symbol: 'btcusdt',
            side: 'SELL',
            quantity: 0.1,
            positionSide: 'BOTH',
            reduceOnly: true,
            newClientOrderId: 'rab-123',
        });

        const request = transport.request.mock.calls[0][0] as FuturesHttpRequest;
        expect(request.method).toBe('POST');
        expect(request.url.startsWith('/fapi/v1/order?')).toBe(true);
        expect(request.url).toContain('symbol=BTCUSDT');
        expect(request.url).toContain('side=SELL');
        expect(request.url).toContain('type=MARKET');
        expect(request.url).toContain('quantity=0.1');
        expect(request.url).toContain('positionSide=BOTH');
        expect(request.url).toContain('reduceOnly=true');
        expect(request.url).toContain('newOrderRespType=RESULT');
        expect(request.headers).toEqual({ 'X-MBX-APIKEY': 'test-key' });

        const unsigned = request.url.split('?')[1].split('&signature=')[0];
        const expectedSignature = crypto
            .createHmac('sha256', 'test-secret')
            .update(unsigned)
            .digest('hex');
        expect(request.url).toContain(`signature=${expectedSignature}`);
    });

    it('omits reduceOnly when undefined, required for Hedge-mode transport semantics', async () => {
        const transport = makeTransport({ orderId: 2 });
        const client = signedClient(transport);

        await client.placeMarketOrder({
            symbol: 'ETHUSDT',
            side: 'BUY',
            quantity: 1,
            positionSide: 'LONG',
        });

        expect(requestUrl(transport)).not.toContain('reduceOnly=');
        expect(requestUrl(transport)).toContain('positionSide=LONG');
    });

    it('queries account position mode through /fapi/v1/positionSide/dual', async () => {
        const transport = makeTransport({ dualSidePosition: true });
        const client = signedClient(transport);

        await expect(client.getPositionMode()).resolves.toEqual({ dualSidePosition: true });
        expect(requestUrl(transport).startsWith('/fapi/v1/positionSide/dual?')).toBe(true);
    });

    it('queries V3 position risk for the normalized symbol', async () => {
        const transport = makeTransport([]);
        const client = signedClient(transport);

        await client.getPositionRisk('ethusdt');

        expect(requestUrl(transport).startsWith('/fapi/v3/positionRisk?')).toBe(true);
        expect(requestUrl(transport)).toContain('symbol=ETHUSDT');
    });

    it('changes initial leverage through /fapi/v1/leverage', async () => {
        const transport = makeTransport({ symbol: 'BTCUSDT', leverage: 5, maxNotionalValue: '1' });
        const client = signedClient(transport);

        await client.changeInitialLeverage('btcusdt', 5);

        expect(requestUrl(transport).startsWith('/fapi/v1/leverage?')).toBe(true);
        expect(requestUrl(transport)).toContain('leverage=5');
    });

    it('changes margin type through /fapi/v1/marginType', async () => {
        const transport = makeTransport({ code: 200, msg: 'success' });
        const client = signedClient(transport);

        await client.changeMarginType('btcusdt', 'ISOLATED');

        expect(requestUrl(transport).startsWith('/fapi/v1/marginType?')).toBe(true);
        expect(requestUrl(transport)).toContain('marginType=ISOLATED');
    });

    it('gets mark price from public premiumIndex without API-key headers or signature', async () => {
        const transport = makeTransport({ symbol: 'BTCUSDT', markPrice: '100000', indexPrice: '99990' });
        const client = new BinanceUsdMFuturesClient({ transport });

        const result = await client.getMarkPrice('btcusdt');

        const request = transport.request.mock.calls[0][0] as FuturesHttpRequest;
        expect(request.url).toBe('/fapi/v1/premiumIndex?symbol=BTCUSDT');
        expect(request.headers).toBeUndefined();
        expect(result.markPrice).toBe('100000');
    });

    it('queries funding-fee income through signed /fapi/v1/income', async () => {
        const transport = makeTransport([]);
        const client = signedClient(transport);

        await client.getFundingIncome('btcusdt', 123456789, 50);

        expect(requestUrl(transport).startsWith('/fapi/v1/income?')).toBe(true);
        expect(requestUrl(transport)).toContain('symbol=BTCUSDT');
        expect(requestUrl(transport)).toContain('incomeType=FUNDING_FEE');
        expect(requestUrl(transport)).toContain('startTime=123456789');
        expect(requestUrl(transport)).toContain('limit=50');
    });

    it('fails signed endpoints when credentials are missing', async () => {
        const transport = makeTransport({});
        const client = new BinanceUsdMFuturesClient({ transport });

        await expect(client.getPositionMode()).rejects.toThrow('credentials are not configured');
        expect(transport.request).not.toHaveBeenCalled();
    });
});
