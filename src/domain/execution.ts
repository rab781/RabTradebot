export type TradingProduct = 'SPOT' | 'USDM_FUTURES';
export type PositionIntent = 'LONG' | 'SHORT';
export type PositionEffect = 'OPEN' | 'CLOSE';
export type OrderSide = 'BUY' | 'SELL';
export type FuturesPositionSide = 'BOTH' | 'LONG' | 'SHORT';
export type FuturesPositionMode = 'ONE_WAY' | 'HEDGE';
export type FuturesMarginType = 'ISOLATED' | 'CROSSED';

export interface PositionCommand {
    product: TradingProduct;
    intent: PositionIntent;
    effect: PositionEffect;
}

export interface ExchangeOrderIntent {
    product: TradingProduct;
    side: OrderSide;
    reduceOnly: boolean;
    positionSide?: FuturesPositionSide;
}

export interface TradingInstrument {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
}

export interface MarketExecutionCommand {
    position: PositionCommand;
    instrument: TradingInstrument;
    quantity: number;
    /**
     * Correlation/idempotency key supplied by the caller when available.
     * The Futures client forwards this as Binance newClientOrderId.
     */
    clientOrderId?: string;
}

export interface ExecutionFill {
    product: TradingProduct;
    symbol: string;
    side: OrderSide;
    reduceOnly: boolean;
    orderId: number;
    status: string;
    requestedQuantity: number;
    executedQuantity: number;
    cumulativeQuoteQuantity: number;
    averageFillPrice?: number;
    requiresReconciliation: boolean;
    clientOrderId?: string;
    positionSide?: FuturesPositionSide;
}

export interface FuturesSymbolConfiguration {
    leverage?: number;
    marginType?: FuturesMarginType;
}

export class UnsupportedPositionCommandError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsupportedPositionCommandError';
    }
}

export class InvalidExecutionCommandError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidExecutionCommandError';
    }
}

export class InsufficientSpotInventoryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InsufficientSpotInventoryError';
    }
}

export class InsufficientFuturesPositionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InsufficientFuturesPositionError';
    }
}

export class InvalidFuturesConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidFuturesConfigurationError';
    }
}

export class ExecutionClientNotConfiguredError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ExecutionClientNotConfiguredError';
    }
}