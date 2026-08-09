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

export class UnsupportedPositionCommandError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsupportedPositionCommandError';
    }
}
