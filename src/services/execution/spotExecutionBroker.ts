import {
    ExecutionClientNotConfiguredError,
    ExecutionFill,
    InsufficientSpotInventoryError,
    InvalidExecutionCommandError,
    MarketExecutionCommand,
    UnsupportedPositionCommandError,
} from '../../domain/execution';
import { mapPositionCommandToOrder } from './orderIntentMapper';

export interface SpotClientOrderResponse {
    symbol: string;
    orderId: number;
    status: string;
    executedQty: string;
    cummulativeQuoteQty: string;
    price: string;
    origQty: string;
    type: string;
    side: 'BUY' | 'SELL';
}

export interface SpotClientBalance {
    asset: string;
    free: string;
    locked: string;
}

/**
 * Narrow dependency surface over the existing BinanceOrderService.
 * Keeping this structural makes the broker easy to unit-test and prevents
 * product-specific HTTP details from leaking into the domain layer.
 */
export interface SpotExchangeClient {
    isConfigured(): boolean;
    placeMarketOrder(
        symbol: string,
        side: 'BUY' | 'SELL',
        quantity: number,
    ): Promise<SpotClientOrderResponse>;
    getAccountBalance(): Promise<SpotClientBalance[]>;
}

export class SpotExecutionBroker {
    readonly product = 'SPOT' as const;

    constructor(private readonly client: SpotExchangeClient) { }

    async executeMarket(command: MarketExecutionCommand): Promise<ExecutionFill> {
        this.validateCommand(command);

        if (!this.client.isConfigured()) {
            throw new ExecutionClientNotConfiguredError(
                'Binance Spot execution client is not configured with API credentials.',
            );
        }

        if (command.position.product !== 'SPOT') {
            throw new UnsupportedPositionCommandError(
                `SpotExecutionBroker cannot execute product ${command.position.product}.`,
            );
        }

        const intent = mapPositionCommandToOrder(command.position);

        // On Spot, CLOSE LONG maps to SELL. "reduceOnly" is a domain semantic;
        // Spot does not receive a reduceOnly parameter. We enforce reduction by
        // checking free base-asset inventory before submitting the SELL.
        if (intent.side === 'SELL') {
            await this.assertSufficientBaseInventory(
                command.instrument.baseAsset,
                command.quantity,
            );
        }

        const order = await this.client.placeMarketOrder(
            this.normalizeSymbol(command.instrument.symbol),
            intent.side,
            command.quantity,
        );

        return this.normalizeFill(command, intent.reduceOnly, order);
    }

    private validateCommand(command: MarketExecutionCommand): void {
        const symbol = command?.instrument?.symbol?.trim();
        const baseAsset = command?.instrument?.baseAsset?.trim();
        const quoteAsset = command?.instrument?.quoteAsset?.trim();

        if (!symbol) {
            throw new InvalidExecutionCommandError('Spot execution requires a non-empty symbol.');
        }
        if (!baseAsset) {
            throw new InvalidExecutionCommandError('Spot execution requires a non-empty baseAsset.');
        }
        if (!quoteAsset) {
            throw new InvalidExecutionCommandError('Spot execution requires a non-empty quoteAsset.');
        }
        if (!Number.isFinite(command.quantity) || command.quantity <= 0) {
            throw new InvalidExecutionCommandError(
                `Spot execution quantity must be finite and greater than zero. Received ${command.quantity}.`,
            );
        }
    }

    private async assertSufficientBaseInventory(baseAsset: string, quantity: number): Promise<void> {
        const balances = await this.client.getAccountBalance();
        const normalizedAsset = baseAsset.toUpperCase();
        const balance = balances.find((item) => item.asset.toUpperCase() === normalizedAsset);
        const free = this.parseNonNegative(balance?.free);

        // Tiny tolerance is only for floating-point representation; it must not
        // create meaningful synthetic inventory.
        const tolerance = Math.max(1e-12, quantity * 1e-12);
        if (free + tolerance < quantity) {
            throw new InsufficientSpotInventoryError(
                `Insufficient free ${normalizedAsset} inventory for Spot SELL: required=${quantity}, free=${free}.`,
            );
        }
    }

    private normalizeFill(
        command: MarketExecutionCommand,
        reduceOnly: boolean,
        order: SpotClientOrderResponse,
    ): ExecutionFill {
        const executedQuantity = this.parseNonNegative(order.executedQty);
        const cumulativeQuoteQuantity = this.parseNonNegative(order.cummulativeQuoteQty);
        const explicitPrice = this.parsePositive(order.price);
        const calculatedPrice = executedQuantity > 0 && cumulativeQuoteQuantity > 0
            ? cumulativeQuoteQuantity / executedQuantity
            : undefined;
        const averageFillPrice = explicitPrice ?? calculatedPrice;

        // An accepted exchange order with incomplete execution fields must not be
        // represented as a failed submission. Mark it for reconciliation instead;
        // blindly retrying could duplicate a live order.
        const status = String(order.status || 'UNKNOWN').toUpperCase();
        const executionKnown = executedQuantity > 0 && averageFillPrice !== undefined;
        const terminalOrPartiallyFilled = status === 'FILLED' || status === 'PARTIALLY_FILLED';

        return {
            product: 'SPOT',
            symbol: this.normalizeSymbol(command.instrument.symbol),
            side: order.side,
            reduceOnly,
            orderId: order.orderId,
            status,
            requestedQuantity: command.quantity,
            executedQuantity,
            cumulativeQuoteQuantity,
            averageFillPrice,
            requiresReconciliation: !executionKnown || !terminalOrPartiallyFilled,
        };
    }

    private normalizeSymbol(symbol: string): string {
        return symbol.trim().toUpperCase();
    }

    private parseNonNegative(value: string | undefined): number {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    }

    private parsePositive(value: string | undefined): number | undefined {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }
}
