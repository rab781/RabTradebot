export type SpotDepthStatus =
    | 'STOPPED'
    | 'BOOTSTRAPPING'
    | 'LIVE'
    | 'STALE'
    | 'RECONNECTING'
    | 'RESYNCING';

export interface SpotDepthLevel {
    price: number;
    quantity: number;
}

export interface SpotDepthSnapshot {
    symbol: string;
    lastUpdateId: number;
    bids: SpotDepthLevel[];
    asks: SpotDepthLevel[];
    receivedAt: number;
    source: 'REST';
}

export interface SpotDepthUpdate {
    symbol: string;
    firstUpdateId: number;
    finalUpdateId: number;
    bids: SpotDepthLevel[];
    asks: SpotDepthLevel[];
    eventTime: number;
    receivedAt: number;
    source: 'WS';
}

export interface SpotDepthRestPort {
    fetchDepthSnapshot(symbol: string, limit?: number): Promise<SpotDepthSnapshot>;
}

export type SpotDepthLifecycleEvent =
    | { type: 'connected'; at: number }
    | { type: 'reconnecting'; at: number; attempt: number; delayMs: number }
    | { type: 'disconnected'; at: number; code?: number; reason?: string }
    | { type: 'error'; at: number; error: Error };

export interface SpotDepthWebSocketPort {
    connect(
        symbol: string,
        onEvent: (event: SpotDepthUpdate) => void,
        onLifecycle: (event: SpotDepthLifecycleEvent) => void,
    ): Promise<void>;
    close(): Promise<void> | void;
    isConnected(): boolean;
}

export interface SpotOrderBookMetrics {
    levels: number;
    bestBid: number;
    bestBidQty: number;
    bestAsk: number;
    bestAskQty: number;
    midPrice: number;
    spread: number;
    spreadBps: number;
    microPrice: number;
    bidDepth: number;
    askDepth: number;
    queueImbalance: number;
}

export interface SpotLocalOrderBookSnapshot {
    symbol: string;
    lastUpdateId: number;
    bids: SpotDepthLevel[];
    asks: SpotDepthLevel[];
    metrics: SpotOrderBookMetrics;
    receivedAt: number;
}

export interface SpotDepthHealth {
    status: SpotDepthStatus;
    symbol: string;
    bootstrappedAt?: number;
    lastMessageAt?: number;
    lastAppliedUpdateId?: number;
    reconnectCount: number;
    resyncCount: number;
    sequenceGapCount: number;
    staleEventCount: number;
    invalidBookCount: number;
    snapshotRetryCount: number;
    depthEventsApplied: number;
    ignoredWrongSymbolEvents: number;
    lastError?: string;
}

export type SpotDepthApplyResult =
    | { status: 'APPLIED'; updateId: number }
    | { status: 'IGNORED_STALE'; updateId: number }
    | { status: 'GAP'; expectedUpdateId: number; firstUpdateId: number; finalUpdateId: number };
