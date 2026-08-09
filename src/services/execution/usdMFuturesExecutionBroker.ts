import {
    ExecutionClientNotConfiguredError,
    ExecutionFill,
    FuturesMarginType,
    FuturesPositionMode,
    FuturesPositionSide,
    FuturesSymbolConfiguration,
    InsufficientFuturesPositionError,
    InvalidExecutionCommandError,
    InvalidFuturesConfigurationError,
    MarketExecutionCommand,
    UnsupportedPositionCommandError,
} from '../../domain/execution';
import { mapPositionCommandToOrder } from './orderIntentMapper';
import {
    FuturesLeverageResponse,
    FuturesMarginTypeResponse,
    FuturesMarketOrderRequest,
    FuturesOrderResponse,
    FuturesPositionModeResponse,
    FuturesPositionRisk,
} from './binanceUsdMFuturesClient';

export interface UsdMFuturesExchangeClient {
    isConfigured(): boolean;
    placeMarketOrder(request: FuturesMarketOrderRequest): Promise<FuturesOrderResponse>;
    getPositionMode(): Promise<FuturesPositionModeResponse>;
    getPositionRisk(symbol: string): Promise<FuturesPositionRisk[]>;
    changeInitialLeverage(symbol: string, leverage: number): Promise<FuturesLeverageResponse>;
    changeMarginType(
        symbol: string,
        marginType: FuturesMarginType,
    ): Promise<FuturesMarginTypeResponse>;
}

export interface FuturesExecutionOptions {
    /** Avoids one account lookup when the caller already owns a fresh mode snapshot. */
    positionMode?: FuturesPositionMode;
}

export interface FuturesConfigurationResult {
    symbol: string;
    leverage?: FuturesLeverageResponse;
    marginType?: FuturesMarginTypeResponse;
}

/**
 * Product boundary for Binance USDⓈ-M Futures.
 *
 * Critical invariants:
 * - SELL is not synonymous with SHORT.
 * - Hedge Mode uses LONG/SHORT positionSide and omits reduceOnly.
 * - One-way Mode uses BOTH and uses reduceOnly for CLOSE commands.
 * - CLOSE is preflight-checked against the actual exchange position so a
 *   reduce command cannot accidentally flip exposure when local state is stale.
 */
export class UsdMFuturesExecutionBroker {
    readonly product = 'USDM_FUTURES' as const;
    private clientOrderSequence = 0;

    constructor(private readonly client: UsdMFuturesExchangeClient) { }

    async executeMarket(
        command: MarketExecutionCommand,
        options: FuturesExecutionOptions = {},
    ): Promise<ExecutionFill> {
        this.validateCommand(command);

        if (!this.client.isConfigured()) {
            throw new ExecutionClientNotConfiguredError(
                'Binance USDⓈ-M Futures execution client is not configured with API credentials.',
            );
        }

        if (command.position.product !== 'USDM_FUTURES') {
            throw new UnsupportedPositionCommandError(
                `UsdMFuturesExecutionBroker cannot execute product ${command.position.product}.`,
            );
        }

        const intent = mapPositionCommandToOrder(command.position);
        const positionMode = options.positionMode ?? await this.resolvePositionMode();
        const transportPositionSide: FuturesPositionSide = positionMode === 'HEDGE'
            ? this.requireDirectionalPositionSide(intent.positionSide)
            : 'BOTH';

        if (command.position.effect === 'CLOSE') {
            await this.assertSufficientPosition(
                command,
                positionMode,
                transportPositionSide,
            );
        }

        const clientOrderId = this.resolveClientOrderId(command.clientOrderId);
        const request: FuturesMarketOrderRequest = {
            symbol: this.normalizeSymbol(command.instrument.symbol),
            side: intent.side,
            quantity: command.quantity,
            positionSide: transportPositionSide,
            // Binance Hedge Mode identifies the leg using positionSide. Do not
            // send reduceOnly there. In One-way Mode, CLOSE uses reduceOnly.
            reduceOnly: positionMode === 'ONE_WAY' && intent.reduceOnly ? true : undefined,
            newClientOrderId: clientOrderId,
        };

        const order = await this.client.placeMarketOrder(request);
        return this.normalizeFill(command, intent.reduceOnly, request, order);
    }

    /**
     * Explicit control-plane operation. It is intentionally NOT invoked for
     * every order; changing leverage/margin mode is account configuration, not
     * an implicit side effect of trade execution.
     */
    async configureSymbol(
        symbol: string,
        configuration: FuturesSymbolConfiguration,
    ): Promise<FuturesConfigurationResult> {
        if (!this.client.isConfigured()) {
            throw new ExecutionClientNotConfiguredError(
                'Binance USDⓈ-M Futures execution client is not configured with API credentials.',
            );
        }

        const normalizedSymbol = this.normalizeRequiredSymbol(symbol);
        this.validateConfiguration(configuration);

        const result: FuturesConfigurationResult = { symbol: normalizedSymbol };
        if (configuration.marginType) {
            result.marginType = await this.client.changeMarginType(
                normalizedSymbol,
                configuration.marginType,
            );
        }
        if (configuration.leverage !== undefined) {
            result.leverage = await this.client.changeInitialLeverage(
                normalizedSymbol,
                configuration.leverage,
            );
        }
        return result;
    }

    private validateCommand(command: MarketExecutionCommand): void {
        const symbol = command?.instrument?.symbol?.trim();
        const baseAsset = command?.instrument?.baseAsset?.trim();
        const quoteAsset = command?.instrument?.quoteAsset?.trim();

        if (!symbol) {
            throw new InvalidExecutionCommandError('Futures execution requires a non-empty symbol.');
        }
        if (!baseAsset) {
            throw new InvalidExecutionCommandError('Futures execution requires a non-empty baseAsset.');
        }
        if (!quoteAsset) {
            throw new InvalidExecutionCommandError('Futures execution requires a non-empty quoteAsset.');
        }
        if (!Number.isFinite(command.quantity) || command.quantity <= 0) {
            throw new InvalidExecutionCommandError(
                `Futures execution quantity must be finite and greater than zero. Received ${command.quantity}.`,
            );
        }
        if (command.clientOrderId !== undefined) {
            this.validateClientOrderId(command.clientOrderId);
        }
    }

    private validateConfiguration(configuration: FuturesSymbolConfiguration): void {
        if (configuration.leverage !== undefined) {
            if (
                !Number.isInteger(configuration.leverage)
                || configuration.leverage < 1
                || configuration.leverage > 125
            ) {
                throw new InvalidFuturesConfigurationError(
                    `Futures leverage must be an integer between 1 and 125. Received ${configuration.leverage}.`,
                );
            }
        }
    }

    private async resolvePositionMode(): Promise<FuturesPositionMode> {
        const mode = await this.client.getPositionMode();
        return mode.dualSidePosition ? 'HEDGE' : 'ONE_WAY';
    }

    private requireDirectionalPositionSide(
        positionSide: FuturesPositionSide | undefined,
    ): 'LONG' | 'SHORT' {
        if (positionSide !== 'LONG' && positionSide !== 'SHORT') {
            throw new InvalidExecutionCommandError(
                'Hedge Mode Futures execution requires directional LONG or SHORT positionSide.',
            );
        }
        return positionSide;
    }

    private async assertSufficientPosition(
        command: MarketExecutionCommand,
        mode: FuturesPositionMode,
        transportPositionSide: FuturesPositionSide,
    ): Promise<void> {
        const symbol = this.normalizeSymbol(command.instrument.symbol);
        const snapshots = await this.client.getPositionRisk(symbol);
        const requestedIntent = command.position.intent;

        const snapshot = mode === 'HEDGE'
            ? snapshots.find((item) => item.positionSide === transportPositionSide)
            : snapshots.find((item) => item.positionSide === 'BOTH') ?? snapshots[0];

        const positionAmount = this.parseFinite(snapshot?.positionAmt);
        const availableQuantity = this.closableQuantity(
            positionAmount,
            requestedIntent,
            mode,
            snapshot?.positionSide,
        );
        const tolerance = Math.max(1e-12, command.quantity * 1e-12);

        if (availableQuantity <= 0 || availableQuantity + tolerance < command.quantity) {
            throw new InsufficientFuturesPositionError(
                `Insufficient ${requestedIntent} Futures position for CLOSE: symbol=${symbol}, required=${command.quantity}, available=${availableQuantity}, mode=${mode}.`,
            );
        }
    }

    private closableQuantity(
        positionAmount: number,
        intent: 'LONG' | 'SHORT',
        mode: FuturesPositionMode,
        snapshotSide: FuturesPositionSide | undefined,
    ): number {
        if (mode === 'ONE_WAY') {
            if (intent === 'LONG') return positionAmount > 0 ? positionAmount : 0;
            return positionAmount < 0 ? Math.abs(positionAmount) : 0;
        }

        if (snapshotSide !== intent) return 0;
        return Math.abs(positionAmount);
    }

    private normalizeFill(
        command: MarketExecutionCommand,
        domainReduceOnly: boolean,
        request: FuturesMarketOrderRequest,
        order: FuturesOrderResponse,
    ): ExecutionFill {
        const executedQuantity = this.parseNonNegative(order.executedQty);
        const cumulativeQuoteQuantity = this.parseNonNegative(order.cumQuote);
        const explicitAveragePrice = this.parsePositive(order.avgPrice)
            ?? this.parsePositive(order.price);
        const calculatedPrice = executedQuantity > 0 && cumulativeQuoteQuantity > 0
            ? cumulativeQuoteQuantity / executedQuantity
            : undefined;
        const averageFillPrice = explicitAveragePrice ?? calculatedPrice;

        const status = String(order.status || 'UNKNOWN').toUpperCase();
        const executionKnown = executedQuantity > 0 && averageFillPrice !== undefined;
        const terminalOrPartiallyFilled = status === 'FILLED' || status === 'PARTIALLY_FILLED';

        return {
            product: 'USDM_FUTURES',
            symbol: this.normalizeSymbol(command.instrument.symbol),
            side: order.side,
            reduceOnly: domainReduceOnly,
            orderId: order.orderId,
            status,
            requestedQuantity: command.quantity,
            executedQuantity,
            cumulativeQuoteQuantity,
            averageFillPrice,
            requiresReconciliation: !executionKnown || !terminalOrPartiallyFilled,
            clientOrderId: order.clientOrderId || request.newClientOrderId,
            positionSide: order.positionSide || request.positionSide,
        };
    }

    private resolveClientOrderId(provided: string | undefined): string {
        if (provided !== undefined) return provided;
        this.clientOrderSequence += 1;
        const timestamp = Date.now().toString(36);
        const sequence = this.clientOrderSequence.toString(36);
        return `rab-${timestamp}-${sequence}`.slice(0, 36);
    }

    private validateClientOrderId(value: string): void {
        if (!/^[.A-Za-z0-9_:/-]{1,36}$/.test(value)) {
            throw new InvalidExecutionCommandError(
                'clientOrderId must be 1-36 characters using letters, digits, ., _, :, /, or -.',
            );
        }
    }

    private normalizeRequiredSymbol(symbol: string): string {
        const normalized = this.normalizeSymbol(symbol);
        if (!normalized) {
            throw new InvalidFuturesConfigurationError('Futures configuration requires a symbol.');
        }
        return normalized;
    }

    private normalizeSymbol(symbol: string): string {
        return symbol.trim().toUpperCase();
    }

    private parseFinite(value: string | undefined): number {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
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
