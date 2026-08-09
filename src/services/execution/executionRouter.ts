import {
    ExecutionFill,
    InvalidExecutionCommandError,
    MarketExecutionCommand,
    TradingProduct,
} from '../../domain/execution';

/**
 * Small common surface implemented by product-specific execution brokers.
 * The router owns only product dispatch. It deliberately does not infer
 * position semantics, retry exchange requests, or perform risk sizing.
 */
export interface MarketExecutionBroker<P extends TradingProduct = TradingProduct> {
    readonly product: P;
    executeMarket(command: MarketExecutionCommand): Promise<ExecutionFill>;
}

/**
 * Routes a fully-formed MarketExecutionCommand to exactly one product broker.
 *
 * Critical invariants:
 * - Routing is based on command.position.product, never BUY/SELL.
 * - There is no fallback from one product to another.
 * - Broker errors propagate; the router must never retry on a different venue.
 */
export class ExecutionRouter {
    constructor(
        private readonly spotBroker: MarketExecutionBroker<'SPOT'>,
        private readonly futuresBroker: MarketExecutionBroker<'USDM_FUTURES'>,
    ) {
        if (spotBroker.product !== 'SPOT') {
            throw new InvalidExecutionCommandError(
                `ExecutionRouter Spot slot requires product=SPOT, received ${String(spotBroker.product)}.`,
            );
        }
        if (futuresBroker.product !== 'USDM_FUTURES') {
            throw new InvalidExecutionCommandError(
                `ExecutionRouter Futures slot requires product=USDM_FUTURES, received ${String(futuresBroker.product)}.`,
            );
        }
    }

    async executeMarket(command: MarketExecutionCommand): Promise<ExecutionFill> {
        const product = command?.position?.product as TradingProduct | undefined;

        if (product === 'SPOT') {
            return this.spotBroker.executeMarket(command);
        }

        if (product === 'USDM_FUTURES') {
            return this.futuresBroker.executeMarket(command);
        }

        throw new InvalidExecutionCommandError(
            `ExecutionRouter received unsupported or missing product: ${String(product)}.`,
        );
    }
}
