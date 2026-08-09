export type SpotMarketDataStatus =
    | 'STOPPED'
    | 'BOOTSTRAPPING'
    | 'LIVE'
    | 'STALE'
    | 'RECONNECTING';

export interface SpotMarketCandle {
    symbol: string;
    interval: string;
    openTime: number;
    closeTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quoteVolume: number;
    trades: number;
    takerBuyBaseVolume: number;
    takerBuyQuoteVolume: number;
    closed: boolean;
    source: 'REST' | 'WS';
    eventTime?: number;
    receivedAt: number;
}

export interface SpotBookTicker {
    symbol: string;
    updateId: number;
    bidPrice: number;
    bidQty: number;
    askPrice: number;
    askQty: number;
    eventTime?: number;
    receivedAt: number;
    source: 'REST' | 'WS';
}

export interface SpotAggregateTrade {
    symbol: string;
    id: number;
    price: number;
    quantity: number;
    firstTradeId: number;
    lastTradeId: number;
    tradeTime: number;
    buyerIsMaker: boolean;
    eventTime?: number;
    receivedAt: number;
    source: 'REST' | 'WS';
}

export type SpotMarketDataEvent =
    | { type: 'candle'; data: SpotMarketCandle }
    | { type: 'bookTicker'; data: SpotBookTicker }
    | { type: 'aggTrade'; data: SpotAggregateTrade };

export type SpotWebSocketLifecycleEvent =
    | { type: 'connected'; at: number }
    | { type: 'reconnecting'; at: number; attempt: number; delayMs: number }
    | { type: 'disconnected'; at: number; code?: number; reason?: string }
    | { type: 'error'; at: number; error: Error };

export interface SpotRestMarketDataPort {
    fetchKlines(symbol: string, interval: string, limit: number): Promise<SpotMarketCandle[]>;
    fetchBookTicker(symbol: string): Promise<SpotBookTicker>;
    fetchAggregateTrades(symbol: string, limit: number): Promise<SpotAggregateTrade[]>;
}

export interface SpotWebSocketPort {
    connect(
        symbol: string,
        interval: string,
        onEvent: (event: SpotMarketDataEvent) => void,
        onLifecycle: (event: SpotWebSocketLifecycleEvent) => void,
    ): Promise<void>;
    close(): Promise<void> | void;
    isConnected(): boolean;
}

export interface SpotMarketDataHealth {
    status: SpotMarketDataStatus;
    symbol: string;
    interval: string;
    bootstrappedAt?: number;
    lastMessageAt?: number;
    reconnectCount: number;
    duplicateEvents: number;
    outOfOrderEvents: number;
    tradeGapCount: number;
    candleGapCount: number;
    ignoredWrongSymbolEvents: number;
}

export interface SpotMarketDataSnapshot {
    symbol: string;
    interval: string;
    candles: SpotMarketCandle[];
    bookTicker?: SpotBookTicker;
    aggregateTrades: SpotAggregateTrade[];
    health: SpotMarketDataHealth;
}
