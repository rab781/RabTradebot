export type TradingProduct = 'SPOT' | 'USDM_FUTURES';
export type PositionIntent = 'LONG' | 'SHORT';
export type PositionEffect = 'OPEN' | 'CLOSE';
export type OrderSide = 'BUY' | 'SELL';
export type FuturesPositionSide = 'BOTH' | 'LONG' | 'SHORT';

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

export class ExecutionClientNotConfiguredError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ExecutionClientNotConfiguredError';
    }
}