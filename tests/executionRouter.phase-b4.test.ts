import {
    ExecutionFill,
    InvalidExecutionCommandError,
    MarketExecutionCommand,
} from '../src/domain/execution';
import {
    ExecutionRouter,
    MarketExecutionBroker,
} from '../src/services/execution/executionRouter';

function makeCommand(product: 'SPOT' | 'USDM_FUTURES' = 'SPOT'): MarketExecutionCommand {
    return {
        position: { product, intent: 'LONG', effect: 'OPEN' },
        instrument: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
        quantity: 0.1,
        clientOrderId: 'rab-b4-001',
    };
}

function makeFill(product: 'SPOT' | 'USDM_FUTURES'): ExecutionFill {
    return {
        product,
        symbol: 'BTCUSDT',
        side: 'BUY',
        reduceOnly: false,
        orderId: product === 'SPOT' ? 101 : 901,
        status: 'FILLED',
        requestedQuantity: 0.1,
        executedQuantity: 0.1,
        cumulativeQuoteQuantity: 10000,
        averageFillPrice: 100000,
        requiresReconciliation: false,
        clientOrderId: 'rab-b4-001',
        positionSide: product === 'USDM_FUTURES' ? 'BOTH' : undefined,
    };
}

function makeBroker<P extends 'SPOT' | 'USDM_FUTURES'>(
    product: P,
    fill: ExecutionFill = makeFill(product),
): MarketExecutionBroker<P> & { executeMarket: jest.Mock } {
    return {
        product,
        executeMarket: jest.fn(async () => fill),
    };
}

describe('Phase B4.1 - ExecutionRouter', () => {
    it('routes SPOT to Spot broker only', async () => {
        const spot = makeBroker('SPOT');
        const futures = makeBroker('USDM_FUTURES');
        const router = new ExecutionRouter(spot, futures);
        const command = makeCommand('SPOT');

        const result = await router.executeMarket(command);

        expect(spot.executeMarket).toHaveBeenCalledTimes(1);
        expect(spot.executeMarket).toHaveBeenCalledWith(command);
        expect(futures.executeMarket).not.toHaveBeenCalled();
        expect(result.product).toBe('SPOT');
    });

    it('routes USDM_FUTURES to Futures broker only', async () => {
        const spot = makeBroker('SPOT');
        const futures = makeBroker('USDM_FUTURES');
        const router = new ExecutionRouter(spot, futures);
        const command = makeCommand('USDM_FUTURES');

        const result = await router.executeMarket(command);

        expect(futures.executeMarket).toHaveBeenCalledTimes(1);
        expect(futures.executeMarket).toHaveBeenCalledWith(command);
        expect(spot.executeMarket).not.toHaveBeenCalled();
        expect(result.product).toBe('USDM_FUTURES');
    });

    it('returns the broker fill unchanged, including reconciliation state', async () => {
        const fill = { ...makeFill('SPOT'), status: 'NEW', requiresReconciliation: true };
        const spot = makeBroker('SPOT', fill);
        const futures = makeBroker('USDM_FUTURES');
        const router = new ExecutionRouter(spot, futures);

        await expect(router.executeMarket(makeCommand('SPOT'))).resolves.toBe(fill);
    });

    it('fails closed for a missing/unknown runtime product and calls neither broker', async () => {
        const spot = makeBroker('SPOT');
        const futures = makeBroker('USDM_FUTURES');
        const router = new ExecutionRouter(spot, futures);
        const bad = makeCommand('SPOT') as any;
        bad.position.product = 'MARGIN';

        await expect(router.executeMarket(bad)).rejects.toBeInstanceOf(InvalidExecutionCommandError);
        expect(spot.executeMarket).not.toHaveBeenCalled();
        expect(futures.executeMarket).not.toHaveBeenCalled();
    });

    it('does not fall back to Futures when Spot broker fails', async () => {
        const spot = makeBroker('SPOT');
        spot.executeMarket.mockRejectedValueOnce(new Error('spot timeout'));
        const futures = makeBroker('USDM_FUTURES');
        const router = new ExecutionRouter(spot, futures);

        await expect(router.executeMarket(makeCommand('SPOT'))).rejects.toThrow('spot timeout');
        expect(futures.executeMarket).not.toHaveBeenCalled();
    });

    it('does not fall back to Spot when Futures broker fails', async () => {
        const spot = makeBroker('SPOT');
        const futures = makeBroker('USDM_FUTURES');
        futures.executeMarket.mockRejectedValueOnce(new Error('futures timeout'));
        const router = new ExecutionRouter(spot, futures);

        await expect(router.executeMarket(makeCommand('USDM_FUTURES'))).rejects.toThrow('futures timeout');
        expect(spot.executeMarket).not.toHaveBeenCalled();
    });
});
