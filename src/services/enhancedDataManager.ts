import { DataFrame, DataFrameBuilder } from '../types/dataframe';
import axios, { AxiosInstance } from 'axios';

// Define our own OHLCV interface to avoid conflicts
export interface OHLCVCandle {
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface HistoricalDataConfig {
    symbol: string;
    timeframe: string;
    startDate: Date;
    endDate: Date;
    limit?: number;
}

export interface CacheConfig {
    ttlMinutes: number;
    maxCacheSize: number;
    persistToDisk: boolean;
    diskCachePath?: string;
}

interface CacheEntry {
    data: OHLCVCandle[];
    timestamp: number;
    hits: number;
}

interface ConnectionPoolConfig {
    maxConnections: number;
    timeout: number;
    retryDelay: number;
    maxRetries: number;
}

export class EnhancedDataManager {
    private baseUrl = 'https://api.binance.com/api/v3';
    private dataCache = new Map<string, CacheEntry>();
    private axiosInstance: AxiosInstance;
    private cacheConfig: CacheConfig;
    private connectionConfig: ConnectionPoolConfig;
    private requestQueue: Array<() => Promise<any>> = [];
    private activeRequests = 0;

    constructor(
        cacheConfig?: Partial<CacheConfig>,
        connectionConfig?: Partial<ConnectionPoolConfig>
    ) {
        // Default cache configuration
        this.cacheConfig = {
            ttlMinutes: 30,
            maxCacheSize: 1000,
            persistToDisk: false,
            ...cacheConfig
        };

        // Default connection configuration
        this.connectionConfig = {
            maxConnections: 10,
            timeout: 30000,
            retryDelay: 1000,
            maxRetries: 3,
            ...connectionConfig
        };

        // Create axios instance with connection pooling
        this.axiosInstance = axios.create({
            timeout: this.connectionConfig.timeout,
            maxRedirects: 5,
            headers: {
                'Connection': 'keep-alive',
                'Keep-Alive': 'timeout=5, max=1000'
            }
        });

        this.setupInterceptors();
        this.startCacheCleanup();
    }

    /**
     * Download historical data with caching and optimizations
     */
    async downloadHistoricalData(config: HistoricalDataConfig): Promise<OHLCVCandle[]> {
        const cacheKey = this.generateCacheKey(config);

        // Check cache first
        const cachedData = this.getCachedData(cacheKey);
        if (cachedData) {
            console.log(`Retrieved cached data for ${config.symbol} (${cachedData.hits} hits)`);
            return cachedData.data;
        }

        console.log(`Downloading historical data for ${config.symbol}`);

        try {
            const data = await this.downloadDataWithRetry(config);
            this.setCachedData(cacheKey, data);
            return data;
        } catch (error) {
            console.error(`Error downloading data for ${config.symbol}:`, error);
            throw error;
        }
    }

    /**
     * Download data with automatic retry and rate limiting
     */
    private async downloadDataWithRetry(config: HistoricalDataConfig): Promise<OHLCVCandle[]> {
        return new Promise((resolve, reject) => {
            const executeRequest = async () => {
                try {
                    await this.waitForConnection();
                    const data = await this.fetchHistoricalDataBatched(config);
                    resolve(data);
                } catch (error) {
                    reject(error);
                } finally {
                    this.activeRequests--;
                    this.processQueue();
                }
            };

            if (this.activeRequests >= this.connectionConfig.maxConnections) {
                this.requestQueue.push(executeRequest);
            } else {
                this.activeRequests++;
                executeRequest();
            }
        });
    }

    /**
     * Fetch historical data in batches
     */
    private async fetchHistoricalDataBatched(config: HistoricalDataConfig): Promise<OHLCVCandle[]> {
        const interval = this.convertTimeframeToInterval(config.timeframe);
        const startTime = config.startDate.getTime();
        const endTime = config.endDate.getTime();
        const limit = config.limit || 1000;

        const allCandles: OHLCVCandle[] = [];
        let currentStartTime = startTime;
        let retryCount = 0;

        while (currentStartTime < endTime) {
            try {
                const response = await this.axiosInstance.get('/klines', {
                    baseURL: this.baseUrl,
                    params: {
                        symbol: config.symbol,
                        interval: interval,
                        startTime: currentStartTime,
                        endTime: Math.min(currentStartTime + (limit * this.getIntervalMs(interval)), endTime),
                        limit: limit
                    }
                });

                const rawCandles = response.data;

                if (!rawCandles || rawCandles.length === 0) {
                    break;
                }

                const candles: OHLCVCandle[] = rawCandles.map((candle: any[]) => ({
                    timestamp: new Date(candle[0]),
                    open: parseFloat(candle[1]),
                    high: parseFloat(candle[2]),
                    low: parseFloat(candle[3]),
                    close: parseFloat(candle[4]),
                    volume: parseFloat(candle[5])
                }));

                allCandles.push(...candles);

                // Update start time for next batch
                if (candles.length > 0) {
                    const lastCandle = candles[candles.length - 1];
                    currentStartTime = (lastCandle.timestamp as any).getTime() + this.getIntervalMs(interval);
                } else {
                    break;
                }

                retryCount = 0;
                await this.delay(100); // Rate limiting

            } catch (error) {
                retryCount++;

                if (retryCount >= this.connectionConfig.maxRetries) {
                    throw new Error(`Failed to download data after ${retryCount} retries: ${error}`);
                }

                console.warn(`Request failed, retrying (${retryCount}/${this.connectionConfig.maxRetries})...`);
                await this.delay(this.connectionConfig.retryDelay * retryCount);
            }
        }

        console.log(`Downloaded ${allCandles.length} candles for ${config.symbol}`);
        return allCandles;
    }

    /**
     * Create DataFrame from OHLCV data
     */
    createDataFrame(candles: OHLCVCandle[]): DataFrame {
        const builder = new DataFrameBuilder();

        const ohlcvCandles = candles.map(candle => ({
            timestamp: candle.timestamp.getTime(),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            date: candle.timestamp
        }));

        builder.addCandles(ohlcvCandles);
        return builder.build();
    }

    // Cache management methods
    private getCachedData(cacheKey: string): CacheEntry | null {
        const entry = this.dataCache.get(cacheKey);
        if (!entry) return null;

        const isExpired = Date.now() - entry.timestamp > (this.cacheConfig.ttlMinutes * 60 * 1000);
        if (isExpired) {
            this.dataCache.delete(cacheKey);
            return null;
        }

        entry.hits++;
        return entry;
    }

    private setCachedData(cacheKey: string, data: OHLCVCandle[]): void {
        if (this.dataCache.size >= this.cacheConfig.maxCacheSize) {
            this.evictLeastUsedEntries();
        }

        this.dataCache.set(cacheKey, {
            data: [...data],
            timestamp: Date.now(),
            hits: 1
        });
    }

    private generateCacheKey(config: HistoricalDataConfig): string {
        return `${config.symbol}_${config.timeframe}_${config.startDate.getTime()}_${config.endDate.getTime()}_${config.limit || 'all'}`;
    }

    private evictLeastUsedEntries(): void {
        const entries = Array.from(this.dataCache.entries());
        entries.sort((a, b) => {
            if (a[1].hits !== b[1].hits) {
                return a[1].hits - b[1].hits;
            }
            return a[1].timestamp - b[1].timestamp;
        });

        const entriesToRemove = Math.floor(entries.length * 0.2);
        for (let i = 0; i < entriesToRemove; i++) {
            this.dataCache.delete(entries[i][0]);
        }

        console.log(`Evicted ${entriesToRemove} cache entries`);
    }

    private startCacheCleanup(): void {
        setInterval(() => {
            const expiredKeys: string[] = [];
            const now = Date.now();
            const ttlMs = this.cacheConfig.ttlMinutes * 60 * 1000;

            for (const [key, entry] of this.dataCache.entries()) {
                if (now - entry.timestamp > ttlMs) {
                    expiredKeys.push(key);
                }
            }

            expiredKeys.forEach(key => this.dataCache.delete(key));

            if (expiredKeys.length > 0) {
                console.log(`Cleaned up ${expiredKeys.length} expired cache entries`);
            }
        }, 5 * 60 * 1000);
    }

    // Connection management methods
    private setupInterceptors(): void {
        this.axiosInstance.interceptors.response.use(
            (response) => response,
            async (error) => {
                const config = error.config;

                if (error.response?.status === 429 && !config._retry) {
                    config._retry = true;
                    const retryAfter = error.response.headers['retry-after'] || 1;

                    console.warn(`Rate limited, retrying after ${retryAfter} seconds`);
                    await this.delay(retryAfter * 1000);

                    return this.axiosInstance(config);
                }

                if (error.response?.status >= 500 && !config._retry) {
                    config._retry = true;
                    console.warn(`Server error (${error.response.status}), retrying...`);
                    await this.delay(this.connectionConfig.retryDelay);
                    return this.axiosInstance(config);
                }

                return Promise.reject(error);
            }
        );
    }

    private async waitForConnection(): Promise<void> {
        while (this.activeRequests >= this.connectionConfig.maxConnections) {
            await this.delay(100);
        }
    }

    private processQueue(): void {
        if (this.requestQueue.length > 0 && this.activeRequests < this.connectionConfig.maxConnections) {
            const nextRequest = this.requestQueue.shift();
            if (nextRequest) {
                this.activeRequests++;
                nextRequest();
            }
        }
    }

    // Utility methods
    private convertTimeframeToInterval(timeframe: string): string {
        const mapping: { [key: string]: string } = {
            '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
            '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '8h': '8h', '12h': '12h',
            '1d': '1d', '3d': '3d', '1w': '1w', '1M': '1M'
        };

        return mapping[timeframe] || timeframe;
    }

    private getIntervalMs(interval: string): number {
        const mapping: { [key: string]: number } = {
            '1m': 60 * 1000, '3m': 3 * 60 * 1000, '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000, '30m': 30 * 60 * 1000, '1h': 60 * 60 * 1000,
            '2h': 2 * 60 * 60 * 1000, '4h': 4 * 60 * 60 * 1000, '6h': 6 * 60 * 60 * 1000,
            '8h': 8 * 60 * 60 * 1000, '12h': 12 * 60 * 60 * 1000, '1d': 24 * 60 * 60 * 1000,
            '3d': 3 * 24 * 60 * 60 * 1000, '1w': 7 * 24 * 60 * 60 * 1000, '1M': 30 * 24 * 60 * 60 * 1000
        };

        return mapping[interval] || 60 * 1000;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Public utility methods
    getCacheStats(): { size: number; hitRate: number; totalHits: number } {
        let totalHits = 0;
        for (const entry of this.dataCache.values()) {
            totalHits += entry.hits;
        }

        const hitRate = this.dataCache.size > 0 ? totalHits / this.dataCache.size : 0;

        return { size: this.dataCache.size, hitRate, totalHits };
    }

    clearCache(): void {
        this.dataCache.clear();
        console.log('Cache cleared');
    }

    async warmUpCache(symbols: string[], timeframes: string[] = ['1h', '4h', '1d']): Promise<void> {
        console.log('Warming up cache...');

        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

        const promises: Promise<any>[] = [];

        for (const symbol of symbols) {
            for (const timeframe of timeframes) {
                const config: HistoricalDataConfig = {
                    symbol, timeframe, startDate, endDate, limit: 500
                };

                promises.push(
                    this.downloadHistoricalData(config).catch(error => {
                        console.warn(`Failed to warm up cache for ${symbol} ${timeframe}:`, error.message);
                    })
                );

                await this.delay(50);
            }
        }

        await Promise.allSettled(promises);
        console.log(`Cache warmed up with ${symbols.length} symbols and ${timeframes.length} timeframes`);
    }
}
