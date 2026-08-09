import {
    ExecutionClientNotConfiguredError,
    InsufficientSpotInventoryError,
    InvalidExecutionCommandError,
    MarketExecutionCommand,
    UnsupportedPositionCommandError,
} from '../src/domain/execution';
import {
    SpotClientOrderResponse,
    SpotExchangeClient,
    SpotExecutionBroker,
} from '../src/services/execution/spotExecutionBroker';

function makeOrder(overrides: Partial<SpotClientOrderResponse> = {}): SpotClientOrderResponse {
    return {
        symbol: 'BTCUSDT',
        orderId: 101,
        status: 'FILLED',
        executedQty: '0.1',
        cummulativeQuoteQty: '10000',
        price: '0',
        origQty: '0.1',
        type: 'MARKET',
        side: 'BUY',
        ...overrides,
    };
}

function makeCommand(overrides: Partial<MarketExecutionCommand> = {}): MarketExecutionCommand {
    return {
        position: { product: 'SPOT', intent: 'LONG', effect: 'OPEN' },
        instrument: { symbol: 'btcusdt', baseAsset: 'BTC', quoteAsset: 'USDT' },
        quantity: 0.1,
        ...overrides,
    };
}

function makeClient(options: {
    configured?: boolean;
    balances?: Array<{ asset: string; free: string; locked: string }>;
    order?: SpotClientOrderResponse;
} = {}): SpotExchangeClient & {
    placeMarketOrder: jest.Mock;
    getAccountBalance: jest.Mock;
} {
    return {
        isConfigured: jest.fn(() => options.configured ?? true),
        getAccountBalance: jest.fn(async () => options.balances ?? []),
        placeMarketOrder: jest.fn(async () => options.order ?? makeOrder()),
    };
}

describe('Phase B2 - SpotExecutionBroker', () => {
    it('executes SPOT LONG OPEN as BUY without an inventory lookup', async () => {
        const client = makeClient();
        const broker = new SpotExecutionBroker(client);

        const result = await broker.executeMarket(makeCommand());

        expect(client.getAccountBalance).not.toHaveBeenCalled();
        expect(client.placeMarketOrder).toHaveBeenCalledWith('BTCUSDT', 'BUY', 0.1);
        expect(result.product).toBe('SPOT');
        expect(result.side).toBe('BUY');
        expect(result.reduceOnly).toBe(false);
    });

    it('executes SPOT LONG CLOSE as SELL only after checking free base inventory', async () => {
        const client = makeClient({
            balances: [{ asset: 'BTC', free: '0.25', locked: '0.50' }],
            order: makeOrder({ side: 'SELL' }),
        });
        const broker = new SpotExecutionBroker(client);

        const result = await broker.executeMarket(makeCommand({
            position: { product: 'SPOT', intent: 'LONG', effect: 'CLOSE' },
            quantity: 0.2,
        }));

        expect(client.getAccountBalance).toHaveBeenCalledTimes(1);
        expect(client.placeMarketOrder).toHaveBeenCalledWith('BTCUSDT', 'SELL', 0.2);
        expect(result.reduceOnly).toBe(true);
        expect(result.side).toBe('SELL');
    });

    it('rejects SPOT SHORT before making any exchange call', async () => {
        const client = makeClient();
        const broker = new SpotExecutionBroker(client);

        await expect(broker.executeMarket(makeCommand({
            position: { product: 'SPOT', intent: 'SHORT', effect: 'OPEN' },
        }))).rejects.toBeInstanceOf(UnsupportedPositionCommandError);

        expect(client.getAccountBalance).not.toHaveBeenCalled();
        expect(client.placeMarketOrder).not.toHaveBeenCalled();
    });

    it('rejects a Futures command before making an exchange call', async () => {
        const client = makeClient();
        const broker = new SpotExecutionBroker(client);

        await expect(broker.executeMarket(makeCommand({
            position: { product: 'USDM_FUTURES', intent: 'LONG', effect: 'OPEN' },
        }))).rejects.toBeInstanceOf(UnsupportedPositionCommandError);

        expect(client.placeMarketOrder).not.toHaveBeenCalled();
    });

    it('fails closed when the Spot client has no API credentials', async () => {
        const client = makeClient({ configured: false });
        const broker = new SpotExecutionBroker(client);

        await expect(broker.executeMarket(makeCommand()))
            .rejects.toBeInstanceOf(ExecutionClientNotConfiguredError);

        expect(client.placeMarketOrder).not.toHaveBeenCalled();
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
        'rejects invalid quantity %p',
        async (quantity) => {
            const client = makeClient();
            const broker = new SpotExecutionBroker(client);

            await expect(broker.executeMarket(makeCommand({ quantity })))
                .rejects.toBeInstanceOf(InvalidExecutionCommandError);
            expect(client.placeMarketOrder).not.toHaveBeenCalled();
        },
    );

    it('rejects a Spot SELL when free base inventory is insufficient', async () => {
        const client = makeClient({
            balances: [{ asset: 'BTC', free: '0.05', locked: '1.0' }],
        });
        const broker = new SpotExecutionBroker(client);

        await expect(broker.executeMarket(makeCommand({
            position: { product: 'SPOT', intent: 'LONG', effect: 'CLOSE' },
            quantity: 0.1,
        }))).rejects.toBeInstanceOf(InsufficientSpotInventoryError);

        expect(client.placeMarketOrder).not.toHaveBeenCalled();
    });

    it('does not count locked Spot balance as sellable inventory', async () => {
        const client = makeClient({
            balances: [{ asset: 'BTC', free: '0', locked: '10' }],
        });
        const broker = new SpotExecutionBroker(client);

        await expect(broker.executeMarket(makeCommand({
            position: { product: 'SPOT', intent: 'LONG', effect: 'CLOSE' },
        }))).rejects.toBeInstanceOf(InsufficientSpotInventoryError);
    });

    it('allows a Spot SELL when free balance exactly covers the quantity', async () => {
        const client = makeClient({
            balances: [{ asset: 'BTC', free: '0.1', locked: '0' }],
            order: makeOrder({ side: 'SELL' }),
        });
        const broker = new SpotExecutionBroker(client);

        await expect(broker.executeMarket(makeCommand({
            position: { product: 'SPOT', intent: 'LONG', effect: 'CLOSE' },
        }))).resolves.toMatchObject({ side: 'SELL', reduceOnly: true });
    });

    it('normalizes average fill price from cumulative quote quantity when order.price is zero', async () => {
        const client = makeClient({
            order: makeOrder({
                executedQty: '0.2',
                cummulativeQuoteQty: '20000',
                price: '0',
            }),
        });
        const broker = new SpotExecutionBroker(client);

        const result = await broker.executeMarket(makeCommand({ quantity: 0.2 }));

        expect(result.averageFillPrice).toBeCloseTo(100000, 8);
        expect(result.executedQuantity).toBeCloseTo(0.2, 8);
        expect(result.requiresReconciliation).toBe(false);
    });

    it('uses an explicit positive order.price when the exchange supplies one', async () => {
        const client = makeClient({
            order: makeOrder({ price: '99999.5', cummulativeQuoteQty: '0' }),
        });
        const broker = new SpotExecutionBroker(client);

        const result = await broker.executeMarket(makeCommand());

        expect(result.averageFillPrice).toBeCloseTo(99999.5, 8);
    });

    it('marks accepted orders with missing fill details for reconciliation instead of pretending submission failed', async () => {
        const client = makeClient({
            order: makeOrder({ status: 'NEW', executedQty: '0', cummulativeQuoteQty: '0', price: '0' }),
        });
        const broker = new SpotExecutionBroker(client);

        const result = await broker.executeMarket(makeCommand());

        expect(result.orderId).toBe(101);
        expect(result.requiresReconciliation).toBe(true);
        expect(result.averageFillPrice).toBeUndefined();
    });
});
