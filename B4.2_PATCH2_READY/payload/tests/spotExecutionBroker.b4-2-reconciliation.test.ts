import { MarketExecutionCommand } from '../src/domain/execution';
import { SpotExchangeClient, SpotExecutionBroker } from '../src/services/execution/spotExecutionBroker';

function command(): MarketExecutionCommand {
    return {
        position: { product: 'SPOT', intent: 'LONG', effect: 'CLOSE' },
        instrument: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
        quantity: 0.01,
    };
}

function client(): SpotExchangeClient & {
    placeMarketOrder: jest.Mock;
    getAccountBalance: jest.Mock;
} {
    return {
        isConfigured: () => true,
        getAccountBalance: jest.fn().mockResolvedValue([
            { asset: 'BTC', free: '1', locked: '0' },
        ]),
        placeMarketOrder: jest.fn(),
    };
}

describe('B4.2 Patch 2 - Spot fill reconciliation semantics', () => {
    it('marks PARTIALLY_FILLED market orders as requiring reconciliation', async () => {
        const exchange = client();
        exchange.placeMarketOrder.mockResolvedValue({
            symbol: 'BTCUSDT',
            orderId: 1,
            status: 'PARTIALLY_FILLED',
            executedQty: '0.004',
            cummulativeQuoteQty: '202',
            price: '0',
            origQty: '0.01',
            type: 'MARKET',
            side: 'SELL',
        });

        const fill = await new SpotExecutionBroker(exchange).executeMarket(command());

        expect(fill.executedQuantity).toBeCloseTo(0.004);
        expect(fill.averageFillPrice).toBeCloseTo(50500);
        expect(fill.requiresReconciliation).toBe(true);
    });

    it('marks a complete FILLED market order as reconciled', async () => {
        const exchange = client();
        exchange.placeMarketOrder.mockResolvedValue({
            symbol: 'BTCUSDT',
            orderId: 2,
            status: 'FILLED',
            executedQty: '0.01',
            cummulativeQuoteQty: '505',
            price: '0',
            origQty: '0.01',
            type: 'MARKET',
            side: 'SELL',
        });

        const fill = await new SpotExecutionBroker(exchange).executeMarket(command());

        expect(fill.requiresReconciliation).toBe(false);
    });

    it('keeps a FILLED response with less than requested execution in reconciliation state', async () => {
        const exchange = client();
        exchange.placeMarketOrder.mockResolvedValue({
            symbol: 'BTCUSDT',
            orderId: 3,
            status: 'FILLED',
            executedQty: '0.008',
            cummulativeQuoteQty: '404',
            price: '0',
            origQty: '0.01',
            type: 'MARKET',
            side: 'SELL',
        });

        const fill = await new SpotExecutionBroker(exchange).executeMarket(command());

        expect(fill.requiresReconciliation).toBe(true);
    });
});
