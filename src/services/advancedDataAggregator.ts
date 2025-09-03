import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
    PriceData,
    OrderBook,
    TradeData,
    ExchangeConfig,
    ParsedMessage,
    RealTimeEvent,
    DataAggregatorConfig,
    ConnectionStatus,
    AggregatorMetrics,
    ArbitrageOpportunity,
    CacheEntry,
    RealTimeError,
    HealthCheckResult
} from '../types/realTimeTypes';
import { DatabaseService } from './databaseService';

/**
 * AdvancedDataAggregator - Central hub for real-time cryptocurrency data
 * Manages WebSocket connections to multiple exchanges and provides unified data streaming
 */
export class AdvancedDataAggregator extends EventEmitter {
    private connections: Map<string, WebSocket> = new Map();
    private connectionStatus: Map<string, ConnectionStatus> = new Map();
    private reconnectAttempts: Map<string, number> = new Map();
    private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private priceCache: Map<string, CacheEntry<PriceData>> = new Map();
    private orderBookCache: Map<string, CacheEntry<OrderBook>> = new Map();
    private tradesCache: Map<string, CacheEntry<TradeData[]>> = new Map();

    private config: DataAggregatorConfig;
    private isRunning: boolean = false;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private metricsStartTime: number = Date.now();
    private messageCount: number = 0;

    // Enhanced display controls
    private lastDisplayTime: Map<string, number> = new Map();
    private displayThrottle: number = 3000; // 3 detik per symbol
    private significantVolumeThreshold: number = 10000; // $10k USD
    private enablePrettyDisplay: boolean = true;

    // Database integration
    private databaseService: DatabaseService;

    // Exchange configurations
    private exchanges: Map<string, ExchangeConfig> = new Map([
        ['binance', {
            name: 'binance',
            wsUrl: 'wss://stream.binance.com:9443/ws',
            restUrl: 'https://api.binance.com/api/v3',
            subscribeFormat: this.createBinanceSubscription.bind(this),
            parseMessage: this.parseBinanceMessage.bind(this),
            rateLimits: {
                connections: 5,
                requestsPerMinute: 1200,
                subscriptionsPerConnection: 1024
            }
        }],
        ['bybit', {
            name: 'bybit',
            wsUrl: 'wss://stream.bybit.com/v5/public/spot',
            restUrl: 'https://api.bybit.com/v5',
            subscribeFormat: this.createBybitSubscription.bind(this),
            parseMessage: this.parseBybitMessage.bind(this),
            rateLimits: {
                connections: 3,
                requestsPerMinute: 600,
                subscriptionsPerConnection: 500
            }
        }],
        ['okx', {
            name: 'okx',
            wsUrl: 'wss://ws.okx.com:8443/ws/v5/public',
            restUrl: 'https://www.okx.com/api/v5',
            subscribeFormat: this.createOKXSubscription.bind(this),
            parseMessage: this.parseOKXMessage.bind(this),
            rateLimits: {
                connections: 5,
                requestsPerMinute: 600,
                subscriptionsPerConnection: 240
            }
        }]
    ]);

    constructor(config?: Partial<DataAggregatorConfig>) {
        super();

        this.config = {
            exchanges: ['binance', 'bybit', 'okx'],
            symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'SOLUSDT'],
            updateIntervals: {
                price: 1000,
                orderbook: 500,
                trades: 1000,
                sentiment: 300000
            },
            caching: {
                priceCache: 5000,
                orderbookCache: 2000,
                sentimentCache: 600000
            },
            alerts: {
                priceSpike: 5.0,
                volumeAnomaly: 3.0,
                whaleThreshold: 1000000
            },
            ...config
        };

        this.initializeConnectionStatus();
        
        // Initialize database service
        this.databaseService = new DatabaseService();
    }

    /**
     * Initialize connection status for all exchanges
     */
    private initializeConnectionStatus(): void {
        for (const exchange of this.config.exchanges) {
            this.connectionStatus.set(exchange, {
                exchange,
                status: 'disconnected',
                lastUpdate: 0,
                errorCount: 0
            });
        }
    }

    /**
     * Start the data aggregator
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            console.log('📡 Data aggregator already running');
            return;
        }

        console.log('📡 Starting Advanced Data Aggregator...');
        this.isRunning = true;
        this.metricsStartTime = Date.now();

        // Initialize database connection
        try {
            await this.databaseService.initialize();
        } catch (error) {
            console.error('❌ Failed to initialize database, continuing without persistence');
        }

        // Connect to all configured exchanges
        const connectionPromises = this.config.exchanges.map(exchange =>
            this.connectToExchange(exchange)
        );

        await Promise.allSettled(connectionPromises);

        // Start health monitoring
        this.startHealthMonitoring();

        console.log('✅ Data aggregator started successfully');
        this.emit('aggregator:started');
    }

    /**
     * Stop the data aggregator
     */
    async stop(): Promise<void> {
        if (!this.isRunning) return;

        console.log('🛑 Stopping Data Aggregator...');
        this.isRunning = false;

        // Close all WebSocket connections
        for (const [exchange, ws] of this.connections) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }

        // Clear reconnect timeouts
        for (const timeout of this.reconnectTimeouts.values()) {
            clearTimeout(timeout);
        }

        // Stop health monitoring
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        // Clear caches
        this.clearCaches();

        console.log('✅ Data aggregator stopped');
        this.emit('aggregator:stopped');
    }

    /**
     * Connect to a specific exchange
     */
    private async connectToExchange(exchangeName: string): Promise<void> {
        const exchangeConfig = this.exchanges.get(exchangeName);
        if (!exchangeConfig) {
            throw new Error(`Unknown exchange: ${exchangeName}`);
        }

        try {
            console.log(`🔌 Connecting to ${exchangeName}...`);

            const ws = new WebSocket(exchangeConfig.wsUrl);
            this.connections.set(exchangeName, ws);

            // Set up event handlers
            ws.on('open', () => this.handleOpen(exchangeName));
            ws.on('message', (data) => this.handleMessage(exchangeName, data));
            ws.on('error', (error) => this.handleError(exchangeName, error));
            ws.on('close', (code, reason) => this.handleClose(exchangeName, code, reason));

        } catch (error) {
            this.handleConnectionError(exchangeName, error as Error);
        }
    }

    /**
     * Handle WebSocket connection open
     */
    private handleOpen(exchange: string): void {
        console.log(`✅ Connected to ${exchange}`);

        this.updateConnectionStatus(exchange, {
            status: 'connected',
            lastUpdate: Date.now(),
            errorCount: 0
        });

        this.reconnectAttempts.set(exchange, 0);
        this.subscribeToSymbols(exchange);
    }

    /**
     * Subscribe to symbols on an exchange
     */
    private subscribeToSymbols(exchange: string): void {
        const exchangeConfig = this.exchanges.get(exchange);
        const ws = this.connections.get(exchange);

        if (!exchangeConfig || !ws || ws.readyState !== WebSocket.OPEN) {
            return;
        }

        try {
            const subscription = exchangeConfig.subscribeFormat(this.config.symbols);
            ws.send(JSON.stringify(subscription));

            console.log(`📋 Subscribed to ${this.config.symbols.length} symbols on ${exchange}`);
        } catch (error) {
            this.handleError(exchange, error as Error);
        }
    }

    /**
     * Handle incoming WebSocket messages
     */
    private handleMessage(exchange: string, data: WebSocket.Data): void {
        try {
            this.messageCount++;
            const exchangeConfig = this.exchanges.get(exchange);

            if (!exchangeConfig) return;

            const message = JSON.parse(data.toString());

            // Reduced debug logging - hanya untuk failed parsing
            const parsed = exchangeConfig.parseMessage(message);

            if (parsed) {
                this.processMessage(exchange, parsed);
                this.updateConnectionStatus(exchange, {
                    status: 'connected',
                    lastUpdate: Date.now()
                });
            } else if ((exchange === 'okx' || exchange === 'bybit') && this.messageCount % 50 === 0) {
                // Hanya log parse failures sesekali untuk debug
                console.log(`⚠️ ${exchange} parse failure (${this.messageCount} messages processed)`);
            }

        } catch (error) {
            this.handleError(exchange, error as Error);
        }
    }

    /**
     * Process parsed messages and emit events
     */
    private processMessage(exchange: string, parsed: ParsedMessage): void {
        switch (parsed.type) {
            case 'price':
                this.processPriceUpdate(parsed.data as PriceData);
                break;
            case 'orderbook':
                this.processOrderBookUpdate(parsed.data as OrderBook);
                break;
            case 'trade':
                this.processTradeUpdate(parsed.data as TradeData);
                break;
        }
    }

    /**
     * Process price updates and detect spikes
     */
    private processPriceUpdate(priceData: PriceData): void {
        const cacheKey = `${priceData.exchange}_${priceData.symbol}`;
        const previous = this.priceCache.get(cacheKey);

        // Cache the new price data
        this.setCacheEntry(this.priceCache, cacheKey, priceData, this.config.caching.priceCache);

        // Store to database (async, don't block main thread)
        this.databaseService.storePriceData(priceData).catch(error => {
            console.error('Database error storing price data:', error);
        });

        // Pretty display with throttling
        if (this.enablePrettyDisplay) {
            this.displayPriceUpdate(priceData, previous?.data);
        }

        // Emit price update event
        this.emit('price:update', {
            type: 'price:update',
            data: {
                symbol: priceData.symbol,
                price: priceData.price,
                change: priceData.change24h,
                changePercent: priceData.changePercent24h,
                volume: priceData.volume24h,
                timestamp: priceData.timestamp,
                exchange: priceData.exchange
            }
        });

        // Check for price spikes
        if (previous?.data) {
            const priceChange = ((priceData.price - previous.data.price) / previous.data.price) * 100;

            if (Math.abs(priceChange) >= this.config.alerts.priceSpike) {
                this.emit('price:spike', {
                    type: 'price:spike',
                    data: {
                        symbol: priceData.symbol,
                        percentage: priceChange,
                        direction: priceChange > 0 ? 'up' : 'down',
                        currentPrice: priceData.price,
                        previousPrice: previous.data.price,
                        timestamp: priceData.timestamp,
                        exchange: priceData.exchange
                    }
                });
            }
        }
    }

    /**
     * Process order book updates and detect imbalances
     */
    private processOrderBookUpdate(orderBook: OrderBook): void {
        const cacheKey = `${orderBook.exchange}_${orderBook.symbol}`;
        this.setCacheEntry(this.orderBookCache, cacheKey, orderBook, this.config.caching.orderbookCache);

        // Store significant order book snapshots to database (every 10th update to reduce load)
        if (Math.random() < 0.1) { // 10% sampling rate
            this.databaseService.storeOrderBookSnapshot(orderBook).catch(error => {
                console.error('Database error storing order book data:', error);
            });
        }

        // Calculate order book imbalance
        const totalBids = orderBook.bids.reduce((sum, bid) => sum + (bid.price * bid.quantity), 0);
        const totalAsks = orderBook.asks.reduce((sum, ask) => sum + (ask.price * ask.quantity), 0);
        const imbalanceRatio = totalBids / (totalBids + totalAsks);

        // Emit imbalance event if significant
        if (imbalanceRatio > 0.7 || imbalanceRatio < 0.3) {
            this.emit('orderbook:imbalance', {
                type: 'orderbook:imbalance',
                data: {
                    symbol: orderBook.symbol,
                    buyPressure: totalBids,
                    sellPressure: totalAsks,
                    imbalanceRatio,
                    timestamp: orderBook.timestamp,
                    exchange: orderBook.exchange
                }
            });
        }
    }

    /**
     * Process trade updates and detect volume anomalies
     */
    private processTradeUpdate(tradeData: TradeData): void {
        const cacheKey = `${tradeData.exchange}_${tradeData.symbol}`;
        let trades = this.tradesCache.get(cacheKey)?.data || [];

        // Add new trade and keep only recent trades (last 5 minutes)
        const fiveMinutesAgo = Date.now() - 300000;
        trades = trades.filter(trade => trade.timestamp > fiveMinutesAgo);
        trades.push(tradeData);

        this.setCacheEntry(this.tradesCache, cacheKey, trades, this.config.caching.priceCache);

        // Store to database (async, don't block main thread)
        this.databaseService.storeTradeData(tradeData).catch(error => {
            console.error('Database error storing trade data:', error);
        });

        // Pretty display untuk trades yang signifikan
        if (this.enablePrettyDisplay) {
            this.displayTradeUpdate(tradeData);
        }

        // Calculate current volume and average
        const currentVolume = trades.reduce((sum, trade) => sum + (trade.price * trade.quantity), 0);
        const averageVolume = this.calculateAverageVolume(tradeData.symbol, tradeData.exchange);

        if (averageVolume > 0) {
            const volumeRatio = currentVolume / averageVolume;

            if (volumeRatio >= this.config.alerts.volumeAnomaly) {
                this.emit('volume:anomaly', {
                    type: 'volume:anomaly',
                    data: {
                        symbol: tradeData.symbol,
                        currentVolume,
                        averageVolume,
                        volumeRatio,
                        timestamp: tradeData.timestamp,
                        exchange: tradeData.exchange
                    }
                });
            }
        }
    }

    /**
     * Calculate average volume (simplified implementation)
     */
    private calculateAverageVolume(symbol: string, exchange: string): number {
        const cacheKey = `${exchange}_${symbol}`;
        const priceData = this.priceCache.get(cacheKey);
        return priceData?.data.volume24h || 0;
    }

    /**
     * Handle WebSocket errors
     */
    private handleError(exchange: string, error: Error): void {
        console.error(`❌ WebSocket error on ${exchange}:`, error.message);

        this.updateConnectionStatus(exchange, {
            status: 'error',
            errorCount: (this.connectionStatus.get(exchange)?.errorCount || 0) + 1
        });

        const realTimeError: RealTimeError = {
            type: 'connection',
            message: error.message,
            exchange,
            timestamp: Date.now(),
            stack: error.stack
        };

        // Log error instead of emitting to avoid crash
        console.error(`❌ WebSocket error on ${exchange}:`, error.message);
        
        // Update connection status
        this.updateConnectionStatus(exchange, {
            status: 'error'
        });
    }

    /**
     * Handle WebSocket connection close
     */
    private handleClose(exchange: string, code: number, reason: Buffer): void {
        console.log(`🔌 Connection to ${exchange} closed: ${code} - ${reason.toString()}`);

        this.updateConnectionStatus(exchange, {
            status: 'disconnected'
        });

        // Attempt reconnection if still running
        if (this.isRunning) {
            this.scheduleReconnect(exchange);
        }
    }

    /**
     * Handle connection errors
     */
    private handleConnectionError(exchange: string, error: Error): void {
        console.error(`❌ Failed to connect to ${exchange}:`, error.message);

        this.updateConnectionStatus(exchange, {
            status: 'error',
            errorCount: (this.connectionStatus.get(exchange)?.errorCount || 0) + 1
        });

        if (this.isRunning) {
            this.scheduleReconnect(exchange);
        }
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    private scheduleReconnect(exchange: string): void {
        const attempts = this.reconnectAttempts.get(exchange) || 0;
        const maxAttempts = 10;

        if (attempts >= maxAttempts) {
            console.error(`❌ Max reconnection attempts reached for ${exchange}`);
            return;
        }

        const delay = Math.min(Math.pow(2, attempts) * 1000, 60000); // Max 60 seconds
        this.reconnectAttempts.set(exchange, attempts + 1);

        console.log(`🔄 Reconnecting to ${exchange} in ${delay}ms (attempt ${attempts + 1})`);

        this.updateConnectionStatus(exchange, {
            status: 'reconnecting'
        });

        const timeout = setTimeout(() => {
            this.connectToExchange(exchange);
        }, delay);

        this.reconnectTimeouts.set(exchange, timeout);
    }

    /**
     * Update connection status
     */
    private updateConnectionStatus(exchange: string, updates: Partial<ConnectionStatus>): void {
        const current = this.connectionStatus.get(exchange);
        if (current) {
            this.connectionStatus.set(exchange, { ...current, ...updates });
        }
    }

    /**
     * Start health monitoring
     */
    private startHealthMonitoring(): void {
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, 30000); // Every 30 seconds
    }

    /**
     * Perform health check
     */
    private performHealthCheck(): void {
        const now = Date.now();
        const staleThreshold = 60000; // 1 minute

        for (const [exchange, status] of this.connectionStatus) {
            if (status.status === 'connected' && now - status.lastUpdate > staleThreshold) {
                console.warn(`⚠️ Stale connection detected for ${exchange}`);
                this.updateConnectionStatus(exchange, { status: 'error' });
                this.scheduleReconnect(exchange);
            }
        }
    }

    /**
     * Get latest price for a symbol
     */
    getLatestPrice(symbol: string, exchange?: string): PriceData | null {
        if (exchange) {
            const cacheKey = `${exchange}_${symbol}`;
            return this.priceCache.get(cacheKey)?.data || null;
        }

        // Return best price from all exchanges
        let latestPrice: PriceData | null = null;
        let latestTimestamp = 0;

        for (const [key, entry] of this.priceCache) {
            if (key.includes(symbol) && entry.data.timestamp > latestTimestamp) {
                latestPrice = entry.data;
                latestTimestamp = entry.data.timestamp;
            }
        }

        return latestPrice;
    }

    /**
     * Get order book for a symbol
     */
    getOrderBook(symbol: string, exchange?: string): OrderBook | null {
        if (exchange) {
            const cacheKey = `${exchange}_${symbol}`;
            return this.orderBookCache.get(cacheKey)?.data || null;
        }

        // Return most recent order book
        let orderBook: OrderBook | null = null;
        let latestTimestamp = 0;

        for (const [key, entry] of this.orderBookCache) {
            if (key.includes(symbol) && entry.data.timestamp > latestTimestamp) {
                orderBook = entry.data;
                latestTimestamp = entry.data.timestamp;
            }
        }

        return orderBook;
    }

    /**
     * Scan for arbitrage opportunities
     */
    scanArbitrageOpportunities(): ArbitrageOpportunity[] {
        const opportunities: ArbitrageOpportunity[] = [];
        const symbols = this.config.symbols;

        for (const symbol of symbols) {
            const prices: { exchange: string; price: number; volume: number }[] = [];

            // Collect prices from all exchanges
            for (const exchange of this.config.exchanges) {
                const priceData = this.getLatestPrice(symbol, exchange);
                if (priceData) {
                    prices.push({
                        exchange,
                        price: priceData.price,
                        volume: priceData.volume24h
                    });
                }
            }

            // Find arbitrage opportunities
            if (prices.length >= 2) {
                prices.sort((a, b) => a.price - b.price);
                const lowest = prices[0];
                const highest = prices[prices.length - 1];

                const profitPct = ((highest.price - lowest.price) / lowest.price) * 100;

                if (profitPct > 0.5) { // 0.5% minimum profit
                    opportunities.push({
                        symbol,
                        buyExchange: lowest.exchange,
                        sellExchange: highest.exchange,
                        buyPrice: lowest.price,
                        sellPrice: highest.price,
                        profitPct,
                        profitUsd: highest.price - lowest.price,
                        volume: Math.min(lowest.volume, highest.volume),
                        timestamp: Date.now(),
                        confidence: this.calculateArbitrageConfidence(profitPct, lowest.volume)
                    });
                }
            }
        }

        return opportunities.sort((a, b) => b.profitPct - a.profitPct);
    }

    /**
     * Calculate arbitrage confidence score
     */
    private calculateArbitrageConfidence(profitPct: number, volume: number): number {
        // Higher profit and volume = higher confidence
        const profitScore = Math.min(profitPct / 5, 1); // Max at 5%
        const volumeScore = Math.min(volume / 1000000, 1); // Max at $1M volume
        return (profitScore + volumeScore) / 2 * 100;
    }

    /**
     * Get aggregator metrics
     */
    getMetrics(): AggregatorMetrics {
        const uptime = Date.now() - this.metricsStartTime;
        const messagesPerSecond = this.messageCount / (uptime / 1000);

        return {
            connections: Array.from(this.connectionStatus.values()),
            messagesPerSecond,
            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
            uptime,
            errorRate: this.calculateErrorRate(),
            lastHealthCheck: Date.now()
        };
    }

    /**
     * Calculate error rate
     */
    private calculateErrorRate(): number {
        const totalErrors = Array.from(this.connectionStatus.values())
            .reduce((sum, status) => sum + status.errorCount, 0);
        return totalErrors / Math.max(this.messageCount, 1) * 100;
    }

    /**
     * Perform comprehensive health check
     */
    async healthCheck(): Promise<HealthCheckResult> {
        const metrics = this.getMetrics();

        const checks = {
            websockets: Array.from(this.connectionStatus.values())
                .some(status => status.status === 'connected'),
            apis: true, // Simplified
            memory: metrics.memoryUsage < 500, // Less than 500MB
            latency: true // Simplified
        };

        const status = Object.values(checks).every(check => check) ? 'healthy' :
                      Object.values(checks).some(check => check) ? 'degraded' : 'unhealthy';

        return {
            status,
            checks,
            metrics,
            timestamp: Date.now()
        };
    }

    /**
     * Cache utility methods
     */
    private setCacheEntry<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttl: number): void {
        cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    }

    private clearCaches(): void {
        this.priceCache.clear();
        this.orderBookCache.clear();
        this.tradesCache.clear();
    }

    /**
     * Exchange-specific subscription formats
     */
    private createBinanceSubscription(symbols: string[]): any {
        const streams = symbols.flatMap(symbol => [
            `${symbol.toLowerCase()}@ticker`,
            `${symbol.toLowerCase()}@depth20@100ms`,
            `${symbol.toLowerCase()}@trade`
        ]);

        return {
            method: 'SUBSCRIBE',
            params: streams,
            id: Date.now()
        };
    }

    /**
     * Convert symbol format for different exchanges
     */
    private formatSymbolForExchange(symbol: string, exchange: string): string {
        switch (exchange) {
            case 'binance':
                return symbol.toUpperCase(); // BTCUSDT
            case 'bybit':
                return symbol.toUpperCase(); // BTCUSDT
            case 'okx':
                // OKX uses dash format: BTC-USDT
                return symbol.replace(/(\w+)USDT/, '$1-USDT').toUpperCase();
            default:
                return symbol.toUpperCase();
        }
    }

    private createBybitSubscription(symbols: string[]): any {
        const formattedSymbols = symbols.map(s => this.formatSymbolForExchange(s, 'bybit'));
        const args = formattedSymbols.flatMap(symbol => [
            `tickers.${symbol}`,
            `orderbook.20.${symbol}`,
            `publicTrade.${symbol}`
        ]);

        return {
            op: 'subscribe',
            args
        };
    }

    private createOKXSubscription(symbols: string[]): any {
        const formattedSymbols = symbols.map(s => this.formatSymbolForExchange(s, 'okx'));
        const args = formattedSymbols.flatMap(symbol => [
            { channel: 'tickers', instId: symbol },
            { channel: 'books5', instId: symbol }, // Changed to books5 for top 5 levels
            { channel: 'trades', instId: symbol }
        ]);

        return {
            op: 'subscribe',
            args
        };
    }

    /**
     * Exchange-specific message parsers
     */
    private parseBinanceMessage(message: any): ParsedMessage | null {
        if (message.stream && message.data) {
            const [symbol, type] = message.stream.split('@');

            if (type === 'ticker') {
                return {
                    type: 'price',
                    data: {
                        symbol: message.data.s,
                        price: parseFloat(message.data.c),
                        change24h: parseFloat(message.data.P),
                        changePercent24h: parseFloat(message.data.P),
                        volume24h: parseFloat(message.data.v),
                        high24h: parseFloat(message.data.h),
                        low24h: parseFloat(message.data.l),
                        timestamp: Date.now(),
                        exchange: 'binance'
                    } as PriceData,
                    exchange: 'binance'
                };
            }
        }
        return null;
    }

    private parseBybitMessage(message: any): ParsedMessage | null {
        try {
            // Bybit WebSocket response format
            if (message.topic && message.data) {
                const topic = message.topic;

                // Handle ticker data: tickers.BTCUSDT
                if (topic.startsWith('tickers.')) {
                    const symbol = topic.replace('tickers.', '');
                    const data = Array.isArray(message.data) ? message.data[0] : message.data;

                    return {
                        type: 'price',
                        data: {
                            symbol,
                            price: parseFloat(data.lastPrice || data.price || '0'),
                            change24h: parseFloat(data.price24hPcnt || '0'),
                            changePercent24h: parseFloat(data.price24hPcnt || '0') * 100,
                            volume24h: parseFloat(data.volume24h || '0'),
                            high24h: parseFloat(data.highPrice24h || '0'),
                            low24h: parseFloat(data.lowPrice24h || '0'),
                            timestamp: parseInt(data.ts || Date.now().toString()),
                            exchange: 'bybit'
                        } as PriceData,
                        exchange: 'bybit'
                    };
                }

                // Handle orderbook data: orderbook.1.BTCUSDT
                if (topic.startsWith('orderbook.')) {
                    const symbol = topic.split('.')[2];
                    const data = Array.isArray(message.data) ? message.data[0] : message.data;

                    if (data.b && data.a) {
                        return {
                            type: 'orderbook',
                            data: {
                                symbol,
                                bids: data.b.map((bid: any) => ({
                                    price: parseFloat(bid[0]),
                                    quantity: parseFloat(bid[1])
                                })),
                                asks: data.a.map((ask: any) => ({
                                    price: parseFloat(ask[0]),
                                    quantity: parseFloat(ask[1])
                                })),
                                timestamp: parseInt(data.ts || Date.now().toString()),
                                exchange: 'bybit'
                            } as OrderBook,
                            exchange: 'bybit'
                        };
                    }
                }

                // Handle trade data: publicTrade.BTCUSDT
                if (topic.startsWith('publicTrade.')) {
                    const symbol = topic.replace('publicTrade.', '');
                    const data = Array.isArray(message.data) ? message.data : [message.data];
                    
                    // Bybit sends multiple trades in array
                    for (const trade of data) {
                        return {
                            type: 'trade',
                            data: {
                                symbol,
                                price: parseFloat(trade.p || trade.price || '0'),
                                quantity: parseFloat(trade.v || trade.size || '0'),
                                side: trade.S === 'Buy' ? 'buy' : 'sell', // Bybit uses 'Buy'/'Sell'
                                timestamp: parseInt(trade.T || trade.timestamp || Date.now().toString()),
                                tradeId: trade.i || trade.id || `${Date.now()}_${Math.random()}`,
                                exchange: 'bybit'
                            } as TradeData,
                            exchange: 'bybit'
                        };
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing Bybit message:', error);
        }
        return null;
    }

    private parseOKXMessage(message: any): ParsedMessage | null {
        try {
            // OKX WebSocket response format
            if (message.arg && message.data) {
                const channel = message.arg.channel;
                const instId = message.arg.instId;

                // Handle ticker data
                if (channel === 'tickers') {
                    const data = Array.isArray(message.data) ? message.data[0] : message.data;

                    return {
                        type: 'price',
                        data: {
                            symbol: instId.replace('-', ''),
                            price: parseFloat(data.last || '0'),
                            change24h: parseFloat(data.open24h || '0'),
                            changePercent24h: parseFloat(data.open24h || '0'),
                            volume24h: parseFloat(data.vol24h || '0'),
                            high24h: parseFloat(data.high24h || '0'),
                            low24h: parseFloat(data.low24h || '0'),
                            timestamp: parseInt(data.ts || Date.now().toString()),
                            exchange: 'okx'
                        } as PriceData,
                        exchange: 'okx'
                    };
                }

                // Handle orderbook data
                if (channel === 'books5') {
                    const data = Array.isArray(message.data) ? message.data[0] : message.data;

                    if (data.bids && data.asks) {
                        return {
                            type: 'orderbook',
                            data: {
                                symbol: instId.replace('-', ''),
                                bids: data.bids.map((bid: any) => ({
                                    price: parseFloat(bid[0]),
                                    quantity: parseFloat(bid[1])
                                })),
                                asks: data.asks.map((ask: any) => ({
                                    price: parseFloat(ask[0]),
                                    quantity: parseFloat(ask[1])
                                })),
                                timestamp: parseInt(data.ts || Date.now().toString()),
                                exchange: 'okx'
                            } as OrderBook,
                            exchange: 'okx'
                        };
                    }
                }

                // Handle trade data
                if (channel === 'trades') {
                    const data = Array.isArray(message.data) ? message.data : [message.data];
                    
                    // OKX sends multiple trades in array
                    for (const trade of data) {
                        return {
                            type: 'trade',
                            data: {
                                symbol: instId.replace('-', ''),
                                price: parseFloat(trade.px || '0'), // OKX uses 'px' for price
                                quantity: parseFloat(trade.sz || '0'), // OKX uses 'sz' for size
                                side: trade.side === 'buy' ? 'buy' : 'sell', // OKX uses 'buy'/'sell'
                                timestamp: parseInt(trade.ts || Date.now().toString()),
                                tradeId: trade.tradeId || `${Date.now()}_${Math.random()}`,
                                exchange: 'okx'
                            } as TradeData,
                            exchange: 'okx'
                        };
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing OKX message:', error);
        }
        return null;
    }

    /**
     * Display formatted price update with throttling
     */
    private displayPriceUpdate(current: PriceData, previous?: PriceData): void {
        const now = Date.now();
        const throttleKey = `${current.exchange}_${current.symbol}`;
        const lastDisplay = this.lastDisplayTime.get(throttleKey) || 0;

        // Throttle: hanya tampilkan setiap X detik per symbol
        if (now - lastDisplay < this.displayThrottle) {
            return;
        }

        this.lastDisplayTime.set(throttleKey, now);

        const time = new Date(current.timestamp).toLocaleTimeString('id-ID');
        const price = this.formatPrice(current.price);
        const volume24h = this.formatVolume(current.volume24h * current.price);
        
        // Hitung perubahan harga dari previous
        let priceChangeText = '';
        let priceEmoji = '📊';
        
        if (previous) {
            const priceChange = ((current.price - previous.price) / previous.price) * 100;
            if (Math.abs(priceChange) > 0.01) { // Hanya tampilkan jika perubahan > 0.01%
                if (priceChange > 0) {
                    priceChangeText = ` 📈 +${priceChange.toFixed(2)}%`;
                    priceEmoji = '🚀';
                } else {
                    priceChangeText = ` 📉 ${priceChange.toFixed(2)}%`;
                    priceEmoji = '🔻';
                }
            }
        }

        // Highlight volume besar
        const volumeUSD = current.volume24h * current.price;
        let volumeEmoji = '💰';
        if (volumeUSD > 1000000) volumeEmoji = '🐋'; // Whale alert
        else if (volumeUSD > 100000) volumeEmoji = '🔥'; // Hot
        else if (volumeUSD > 50000) volumeEmoji = '⚡'; // Active

        console.log(`
╭─────────────────────────────────────────╮
│ ${priceEmoji} ${current.symbol.padEnd(8)} | ${current.exchange.toUpperCase().padEnd(6)} │
│ 💵 ${price.padEnd(12)} | ⏰ ${time}     │
│ ${volumeEmoji} ${volume24h.padEnd(12)} ${priceChangeText.padEnd(15)} │
╰─────────────────────────────────────────╯`);
    }

    /**
     * Display formatted trade data (untuk trades yang significant)
     */
    private displayTradeUpdate(trade: TradeData): void {
        const tradeValue = trade.price * trade.quantity;
        
        // Hanya tampilkan trade dengan nilai signifikan
        if (tradeValue < this.significantVolumeThreshold) {
            return;
        }

        const time = new Date(trade.timestamp).toLocaleTimeString('id-ID');
        const price = this.formatPrice(trade.price);
        const quantity = this.formatQuantity(trade.quantity);
        const value = this.formatVolume(tradeValue);
        
        // Emoji berdasarkan ukuran trade
        let tradeEmoji = '💸';
        if (tradeValue > 1000000) tradeEmoji = '🐋💥'; // Mega whale
        else if (tradeValue > 500000) tradeEmoji = '🐋'; // Whale
        else if (tradeValue > 100000) tradeEmoji = '🔥'; // Large trade
        else if (tradeValue > 50000) tradeEmoji = '⚡'; // Medium trade

        // Side indicator
        const sideEmoji = trade.side === 'buy' ? '🟢 BUY' : '🔴 SELL';

        console.log(`
🎯 TRADE ALERT ${tradeEmoji}
┌─────────────────────────────────────────┐
│ ${trade.symbol} on ${trade.exchange.toUpperCase()} | ${time}           │
│ ${sideEmoji} ${price} x ${quantity}      │
│ 💰 Total Value: ${value}                 │
└─────────────────────────────────────────┘`);
    }

    /**
     * Format price untuk display
     */
    private formatPrice(price: number): string {
        if (price >= 1000) {
            return new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(price);
        } else if (price >= 1) {
            return `$${price.toFixed(4)}`;
        } else {
            return `$${price.toFixed(6)}`;
        }
    }

    /**
     * Format volume untuk display
     */
    private formatVolume(volume: number): string {
        if (volume >= 1000000) {
            return `$${(volume / 1000000).toFixed(2)}M`;
        } else if (volume >= 1000) {
            return `$${(volume / 1000).toFixed(1)}K`;
        } else {
            return `$${volume.toFixed(0)}`;
        }
    }

    /**
     * Format quantity untuk display
     */
    private formatQuantity(quantity: number): string {
        if (quantity >= 1000) {
            return `${(quantity / 1000).toFixed(2)}K`;
        } else if (quantity >= 1) {
            return quantity.toFixed(4);
        } else {
            return quantity.toFixed(8);
        }
    }

    /**
     * Enable/disable pretty display
     */
    setPrettyDisplay(enabled: boolean): void {
        this.enablePrettyDisplay = enabled;
        console.log(`🎨 Pretty display ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Set display throttle time (in milliseconds)
     */
    setDisplayThrottle(ms: number): void {
        this.displayThrottle = ms;
        console.log(`⏱️ Display throttle set to ${ms}ms`);
    }

    /**
     * Set significant volume threshold for trade alerts
     */
    setVolumeThreshold(threshold: number): void {
        this.significantVolumeThreshold = threshold;
        console.log(`🎯 Volume threshold set to $${threshold}`);
    }

    /**
     * Cleanup resources
     */
    destroy(): void {
        this.stop();
        this.removeAllListeners();
        
        // Cleanup database connection
        this.databaseService.cleanup().catch(error => {
            console.error('Error cleaning up database:', error);
        });
    }

    /**
     * Get database service instance
     */
    getDatabaseService(): DatabaseService {
        return this.databaseService;
    }
}
