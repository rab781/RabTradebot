import {
    ExecutionClientNotConfiguredError,
    InsufficientFuturesPositionError,
    InvalidExecutionCommandError,
    InvalidFuturesConfigurationError,
    MarketExecutionCommand,
    UnsupportedPositionCommandError,
} from '../src/domain/execution';
import {
    FuturesMarketOrderRequest,
    FuturesOrderResponse,
    FuturesPositionRisk,
} from '../src/services/execution/binanceUsdMFuturesClient';
import {
    UsdMFuturesExchangeClient,
    UsdMFuturesExecutionBroker,
} from '../src/services/execution/usdMFuturesExecutionBroker';

function makeCommand(overrides: Partial<MarketExecutionCommand> = {}): MarketExecutionCommand {
    return {
        position: { product: 'USDM_FUTURES', intent: 'LONG', effect: 'OPEN' },
        instrument: { symbol: 'btcusdt', baseAsset: 'BTC', quoteAsset: 'USDT' },
        quantity: 0.1,
        clientOrderId: 'rab-test-001',
        ...overrides,
    };
}

function makeOrder(overrides: Partial<FuturesOrderResponse> = {}): FuturesOrderResponse {
    return {
        symbol: 'BTCUSDT',
        orderId: 9001,
        clientOrderId: 'rab-test-001',
        status: 'FILLED',
        avgPrice: '100000',
        price: '0',
        origQty: '0.1',
        executedQty: '0.1',
        cumQuote: '10000',
        side: 'BUY',
        positionSide: 'BOTH',
        type: 'MARKET',
        ...overrides,
    };
}

function makePosition(overrides: Partial<FuturesPositionRisk> = {}): FuturesPositionRisk {
    return {
        symbol: 'BTCUSDT',
        positionSide: 'BOTH',
        positionAmt: '0.5',
        entryPrice: '99000',
        markPrice: '100000',
        unRealizedProfit: '500',
        liquidationPrice: '80000',
        leverage: '5',
        marginType: 'isolated',
        ...overrides,
    };
}

function makeClient(options: {
    configured?: boolean;
    hedgeMode?: boolean;
    positions?: FuturesPositionRisk[];
    order?: FuturesOrderResponse;
} = {}): UsdMFuturesExchangeClient & {
    placeMarketOrder: jest.Mock;
    getPositionMode: jest.Mock;
    getPositionRisk: jest.Mock;
    changeInitialLeverage: jest.Mock;
    changeMarginType: jest.Mock;
} {
    return {
        isConfigured: jest.fn(() => options.configured ?? true),
        placeMarketOrder: jest.fn(async (request: FuturesMarketOrderRequest) => (
            options.order ?? makeOrder({
                side: request.side,
                positionSide: request.positionSide,
                clientOrderId: request.newClientOrderId ?? '',
            })
        )),
        getPositionMode: jest.fn(async () => ({ dualSidePosition: options.hedgeMode ?? false })),
        getPositionRisk: jest.fn(async () => options.positions ?? [makePosition()]),
        changeInitialLeverage: jest.fn(async (symbol: string, leverage: number) => ({
            symbol,
            leverage,
            maxNotionalValue: '1000000',
        })),
        changeMarginType: jest.fn(async () => ({ code: 200, msg: 'success' })),
    };
}

describe('Phase B3 - UsdMFuturesExecutionBroker', () => {
    it('maps One-way LONG OPEN to BUY/BOTH without reduceOnly', async () => {
        const client = makeClient();
        const broker = new UsdMFuturesExecutionBroker(client);

        const result = await broker.executeMarket(makeCommand());

        expect(client.placeMarketOrder).toHaveBeenCalledWith({
            symbol: 'BTCUSDT',
            side: 'BUY',
            quantity: 0.1,
            positionSide: 'BOTH',
            reduceOnly: undefined,
            newClientOrderId: 'rab-test-001',
        });
        expect(result).toMatchObject({
            product: 'USDM_FUTURES', side: 'BUY', positionSide: 'BOTH', reduceOnly: false,
        });
    });

    it('maps One-way SHORT OPEN to SELL/BOTH without reduceOnly', async () => {
        const client = makeClient();
        const broker = new UsdMFuturesExecutionBroker(client);

        await broker.executeMarket(makeCommand({
            position: { product: 'USDM_FUTURES', intent: 'SHORT', effect: 'OPEN' },
        }));

        expect(client.placeMarketOrder).toHaveBeenCalledWith(expect.objectContaining({
            side: 'SELL', positionSide: 'BOTH', reduceOnly: undefined,
        }));
    });

    it('maps One-way LONG CLOSE to SELL/BOTH reduceOnly after position preflight', async () => {
        const client = makeClient({ positions: [makePosition({ positionAmt: '0.25' })] });
        const broker = new UsdMFuturesExecutionBroker(client);

        const result = await broker.executeMarket(makeCommand({
            position: { product: 'USDM_FUTURES', intent: 'LONG', effect: 'CLOSE' },
            quantity: 0.2,
        }));

        expect(client.getPositionRisk).toHaveBeenCalledWith('BTCUSDT');
        expect(client.placeMarketOrder).toHaveBeenCalledWith(expect.objectContaining({
            side: 'SELL', positionSide: 'BOTH', reduceOnly: true,
        }));
        expect(result.reduceOnly).toBe(true);
    });

    it('maps One-way SHORT CLOSE to BUY/BOTH reduceOnly and requires a negative one-way position', async () => {
        const client = makeClient({
            positions: [makePosition({ positionAmt: '-0.3' })],
        });
        const broker = new UsdMFuturesExecutionBroker(client);

        await broker.executeMarket(makeCommand({
            position: { product: 'USDM_FUTURES', intent: 'SHORT', effect: 'CLOSE' },
            quantity: 0.2,
        }));

        expect(client.placeMarketOrder).toHaveBeenCalledWith(expect.objectContaining({
            side: 'BUY', positionSide: 'BOTH', reduceOnly: true,
        }));
    });

    it('maps Hedge LONG OPEN to BUY/LONG and omits reduceOnly', async () => {
        const client = makeClient({ hedgeMode: true });
        const broker = new UsdMFuturesExecutionBroker(client);

        await broker.executeMarket(makeCommand());

        expect(client.placeMarketOrder).toHaveBeenCalledWith(expect.objectContaining({
            side: 'BUY', positionSide: 'LONG', reduceOnly: undefined,
        }));
    });

    it('maps Hedge SHORT OPEN to SELL/SHORT and omits reduceOnly', async () => {
        const client = makeClient({ hedgeMode: true });
        const broker = new UsdMFuturesExecutionBroker(client);

        await broker.executeMarket(makeCommand({
            position: { product: 'USDM_FUTURES', intent: 'SHORT', effect: 'OPEN' },
        }));

        expect(client.placeMarketOrder).toHaveBeenCalledWith(expect.objectContaining({
            side: 'SELL', positionSide: 'SHORT', reduceOnly: undefined,
        }));
    });

    it('closes a Hedge LONG with SELL/LONG but deliberately omits transport reduceOnly', async () => {
        const client = makeClient({
            hedgeMode: true,
            positions: [makePosition({ positionSide: 'LONG', positionAmt: '0.3' })],
        });
        const broker = new UsdMFuturesExecutionBroker(client);

        const result = await broker.executeMarket(makeCommand({
            position: { product: 'USDM_FUTURES', intent: 'LONG', effect: 'CLOSE' },
            quantity: 0.2,
        }));

        expect(client.placeMarketOrder).toHaveBeenCalledWith(expect.objectContaining({
            side: 'SELL', positionSide: 'LONG', reduceOnly: undefined,
        }));
        // Domain meaning remains reducing even though Hedge Mode transport omits reduceOnly.
        expect(result.reduceOnly).toBe(true);
    });

    it('rejects CLOSE when the exchange position is smaller than the requested quantity', async () => {
        const client = makeClient({ positions: [makePosition({ positionAmt: '0.05' })] });
        const broker = new UsdMFuturesExecutionBroker(client);

        await expect(broker.executeMarket(makeCommand({
            position: { product: 'USDM_FUTURES', intent: 'LONG', effect: 'CLOSE' },
            quantity: 0.1,
        }))).rejects.toBeInstanceOf(InsufficientFuturesPositionError);

        expect(client.placeMarketOrder).not.toHaveBeenCalled();
    });

    it('rejects LONG CLOSE when One-way account currently holds SHORT exposure', async () => {
        const client = makeClient({ positions: [makePosition({ positionAmt: '-0.5' })] });
        const broker = new UsdMFuturesExecutionBroker(client);

        await expect(broker.executeMarket(makeCommand({
            position: { product: 'USDM_FUTURES', intent: 'LONG', effect: 'CLOSE' },
        }))).rejects.toBeInstanceOf(InsufficientFuturesPositionError);

        expect(client.placeMarketOrder).not.toHaveBeenCalled();
    });

    it('rejects a Spot command before order submission', async () => {
        const client = makeClient();
        const broker = new UsdMFuturesExecutionBroker(client);

        await expect(broker.executeMarket(makeCommand({
            position: { product: 'SPOT', intent: 'LONG', effect: 'OPEN' },
        }))).rejects.toBeInstanceOf(UnsupportedPositionCommandError);

        expect(client.placeMarketOrder).not.toHaveBeenCalled();
    });

    it('fails closed when Futures credentials are unavailable', async () => {
        const client = makeClient({ configured: false });
        const broker = new UsdMFuturesExecutionBroker(client);

        await expect(broker.executeMarket(makeCommand()))
            .rejects.toBeInstanceOf(ExecutionClientNotConfiguredError);
        expect(client.placeMarketOrder).not.toHaveBeenCalled();
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
        'rejects invalid Futures quantity %p',
        async (quantity: number) => {
            const client = makeClient();
            const broker = new UsdMFuturesExecutionBroker(client);

            await expect(broker.executeMarket(makeCommand({ quantity })))
                .rejects.toBeInstanceOf(InvalidExecutionCommandError);
            expect(client.placeMarketOrder).not.toHaveBeenCalled();
        },
    );

    it('rejects invalid Binance clientOrderId before any exchange lookup', async () => {
        const client = makeClient();
        const broker = new UsdMFuturesExecutionBroker(client);

        await expect(broker.executeMarket(makeCommand({ clientOrderId: 'contains spaces' })))
            .rejects.toBeInstanceOf(InvalidExecutionCommandError);
        expect(client.getPositionMode).not.toHaveBeenCalled();
        expect(client.placeMarketOrder).not.toHaveBeenCalled();
    });

    it('normalizes average fill price from avgPrice', async () => {
        const client = makeClient({
            order: makeOrder({ avgPrice: '101250.5', executedQty: '0.2', cumQuote: '20250.1' }),
        });
        const broker = new UsdMFuturesExecutionBroker(client);

        const result = await broker.executeMarket(makeCommand({ quantity: 0.2 }));

        expect(result.averageFillPrice).toBeCloseTo(101250.5, 8);
        expect(result.requiresReconciliation).toBe(false);
    });

    it('falls back to cumQuote/executedQty when avgPrice is missing', async () => {
        const client = makeClient({
            order: makeOrder({ avgPrice: '0', price: '0', executedQty: '0.2', cumQuote: '20000' }),
        });
        const broker = new UsdMFuturesExecutionBroker(client);

        const result = await broker.executeMarket(makeCommand({ quantity: 0.2 }));

        expect(result.averageFillPrice).toBeCloseTo(100000, 8);
    });

    it('marks an accepted NEW order with unknown fill as requiring reconciliation', async () => {
        const client = makeClient({
            order: makeOrder({ status: 'NEW', avgPrice: '0', executedQty: '0', cumQuote: '0' }),
        });
        const broker = new UsdMFuturesExecutionBroker(client);

        const result = await broker.executeMarket(makeCommand());

        expect(result.orderId).toBe(9001);
        expect(result.requiresReconciliation).toBe(true);
    });

    it('configures margin type and leverage explicitly, not as an execution side effect', async () => {
        const client = makeClient();
        const broker = new UsdMFuturesExecutionBroker(client);

        const result = await broker.configureSymbol('btcusdt', {
            marginType: 'ISOLATED',
            leverage: 7,
        });

        expect(client.changeMarginType).toHaveBeenCalledWith('BTCUSDT', 'ISOLATED');
        expect(client.changeInitialLeverage).toHaveBeenCalledWith('BTCUSDT', 7);
        expect(result.leverage?.leverage).toBe(7);
    });

    it.each([0, 1.5, 126])('rejects invalid leverage %p', async (leverage: number) => {
        const client = makeClient();
        const broker = new UsdMFuturesExecutionBroker(client);

        await expect(broker.configureSymbol('BTCUSDT', { leverage }))
            .rejects.toBeInstanceOf(InvalidFuturesConfigurationError);

        expect(client.changeInitialLeverage).not.toHaveBeenCalled();
    });
});
