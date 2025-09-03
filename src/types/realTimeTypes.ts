/**
 * Real-time Trading Data Types
 * Comprehensive type definitions for WebSocket data, market data, and real-time events
 */

// ================== BASE TYPES ==================

export interface PriceData {
    symbol: string;
    price: number;
    change24h: number;
    changePercent24h: number;
    volume24h: number;
    high24h: number;
    low24h: number;
    timestamp: number;
    exchange: string;
}

export interface OrderBookEntry {
    price: number;
    quantity: number;
}

export interface OrderBook {
    symbol: string;
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
    timestamp: number;
    exchange: string;
}

export interface TradeData {
    symbol: string;
    price: number;
    quantity: number;
    side: 'buy' | 'sell';
    timestamp: number;
    tradeId: string;
    exchange: string;
}

// ================== WHALE ALERT TYPES ==================

export interface WhaleTransaction {
    id: string;
    blockchain: string;
    symbol: string;
    amount: number;
    amountUsd: number;
    from: {
        address: string;
        owner?: string;
        owner_type?: 'exchange' | 'whale' | 'unknown';
    };
    to: {
        address: string;
        owner?: string;
        owner_type?: 'exchange' | 'whale' | 'unknown';
    };
    transactionHash: string;
    timestamp: number;
    transactionType: 'transfer' | 'mint' | 'burn';
}

export interface WhaleAlert {
    transaction: WhaleTransaction;
    impact: 'high' | 'medium' | 'low';
    priceCorrelation?: number;
    marketSentiment: 'bullish' | 'bearish' | 'neutral';
    alertType: 'exchange_inflow' | 'exchange_outflow' | 'whale_movement' | 'institutional';
}

// ================== FEAR & GREED TYPES ==================

export interface FearGreedIndex {
    value: number;
    valueClassification: 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed';
    timestamp: number;
    nextUpdate?: number;
}

export interface SentimentData {
    fearGreedIndex: FearGreedIndex;
    socialSentiment?: number;
    newsImpact?: number;
    compositeSentiment: number;
    recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
}

// ================== WEBSOCKET TYPES ==================

export interface WebSocketConfig {
    url: string;
    reconnectInterval: number;
    maxReconnectAttempts: number;
    pingInterval: number;
    headers?: Record<string, string>;
}

export interface ExchangeConfig {
    name: string;
    wsUrl: string;
    restUrl: string;
    subscribeFormat: (symbols: string[]) => any;
    parseMessage: (data: any) => ParsedMessage | null;
    rateLimits: {
        connections: number;
        requestsPerMinute: number;
        subscriptionsPerConnection: number;
    };
}

export interface ParsedMessage {
    type: 'price' | 'orderbook' | 'trade' | 'error';
    data: PriceData | OrderBook | TradeData | Error;
    exchange: string;
}

// ================== REAL-TIME EVENTS ==================

export interface PriceUpdateEvent {
    type: 'price:update';
    data: {
        symbol: string;
        price: number;
        change: number;
        changePercent: number;
        volume: number;
        timestamp: number;
        exchange: string;
    };
}

export interface PriceSpikeEvent {
    type: 'price:spike';
    data: {
        symbol: string;
        percentage: number;
        direction: 'up' | 'down';
        currentPrice: number;
        previousPrice: number;
        timestamp: number;
        exchange: string;
    };
}

export interface OrderBookImbalanceEvent {
    type: 'orderbook:imbalance';
    data: {
        symbol: string;
        buyPressure: number;
        sellPressure: number;
        imbalanceRatio: number;
        timestamp: number;
        exchange: string;
    };
}

export interface VolumeAnomalyEvent {
    type: 'volume:anomaly';
    data: {
        symbol: string;
        currentVolume: number;
        averageVolume: number;
        volumeRatio: number;
        timestamp: number;
        exchange: string;
    };
}

export interface WhaleMovementEvent {
    type: 'whale:movement';
    data: WhaleAlert;
}

export interface SentimentChangeEvent {
    type: 'sentiment:change';
    data: {
        previousValue: number;
        currentValue: number;
        change: number;
        classification: string;
        timestamp: number;
    };
}

export type RealTimeEvent =
    | PriceUpdateEvent
    | PriceSpikeEvent
    | OrderBookImbalanceEvent
    | VolumeAnomalyEvent
    | WhaleMovementEvent
    | SentimentChangeEvent;

// ================== AGGREGATOR TYPES ==================

export interface DataAggregatorConfig {
    exchanges: string[];
    symbols: string[];
    updateIntervals: {
        price: number;
        orderbook: number;
        trades: number;
        sentiment: number;
    };
    caching: {
        priceCache: number;
        orderbookCache: number;
        sentimentCache: number;
    };
    alerts: {
        priceSpike: number;
        volumeAnomaly: number;
        whaleThreshold: number;
    };
}

export interface ConnectionStatus {
    exchange: string;
    status: 'connected' | 'disconnected' | 'reconnecting' | 'error';
    lastUpdate: number;
    errorCount: number;
    latency?: number;
}

export interface AggregatorMetrics {
    connections: ConnectionStatus[];
    messagesPerSecond: number;
    memoryUsage: number;
    uptime: number;
    errorRate: number;
    lastHealthCheck: number;
}

// ================== ARBITRAGE TYPES ==================

export interface ArbitrageOpportunity {
    symbol: string;
    buyExchange: string;
    sellExchange: string;
    buyPrice: number;
    sellPrice: number;
    profitPct: number;
    profitUsd: number;
    volume: number;
    timestamp: number;
    confidence: number;
}

export interface ArbitrageResult {
    opportunity: ArbitrageOpportunity;
    executed: boolean;
    actualProfit?: number;
    fees?: number;
    netProfit?: number;
    executionTime?: number;
    errors?: string[];
}

// ================== CACHE TYPES ==================

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

export interface CacheStats {
    hits: number;
    misses: number;
    size: number;
    memoryUsage: number;
    hitRate: number;
}

// ================== ERROR TYPES ==================

export interface RealTimeError {
    type: 'connection' | 'parsing' | 'rate_limit' | 'api' | 'unknown';
    message: string;
    exchange?: string;
    symbol?: string;
    timestamp: number;
    stack?: string;
}

// ================== UTILITY TYPES ==================

export type ExchangeName = 'binance' | 'bybit' | 'okx' | 'coinbase' | 'kraken';
export type TimeFrame = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export type AlertLevel = 'low' | 'medium' | 'high' | 'critical';

export interface HealthCheckResult {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: {
        websockets: boolean;
        apis: boolean;
        memory: boolean;
        latency: boolean;
    };
    metrics: AggregatorMetrics;
    timestamp: number;
}
