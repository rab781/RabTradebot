import { EventEmitter } from 'events';
import axios from 'axios';
import { WhaleTransaction, WhaleAlert, RealTimeError } from '../types/realTimeTypes';

/**
 * Whale Alert Service
 * Monitors large cryptocurrency transactions and whale movements across multiple blockchains
 * Provides real-time alerts and historical whale activity analysis
 */
export class WhaleAlertService extends EventEmitter {
    private apiKey: string;
    private baseUrl: string = 'https://api.whale-alert.io/v1';
    private cache: Map<string, any> = new Map();
    private isRunning: boolean = false;
    private monitoringInterval?: NodeJS.Timeout;

    // Configuration
    private readonly CACHE_TTL = 300000; // 5 minutes
    private readonly UPDATE_INTERVAL = 60000; // 1 minute
    private readonly MIN_USD_VALUE = 1000000; // $1M minimum for whale alerts

    constructor(apiKey?: string) {
        super();
        this.apiKey = apiKey || process.env.WHALE_ALERT_API_KEY || '';
    }

    /**
     * Check if service is properly configured
     */
    isConfigured(): boolean {
        return !!this.apiKey;
    }

    /**
     * Start monitoring whale transactions
     */
    async startMonitoring(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;

        // Initial fetch
        await this.fetchRecentTransactions();

        // Set up periodic updates
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.fetchRecentTransactions();
            } catch (error) {
                this.handleError('monitoring', error);
            }
        }, this.UPDATE_INTERVAL);

        this.emit('started');
        console.log('🐋 Whale Alert Service started');
    }

    /**
     * Stop monitoring
     */
    stopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }
        this.isRunning = false;
        this.emit('stopped');
        console.log('🐋 Whale Alert Service stopped');
    }

    /**
     * Fetch recent whale transactions
     */
    private async fetchRecentTransactions(): Promise<void> {
        if (!this.isConfigured()) {
            // Use mock data if not configured
            const mockData = this.getMockWhaleTransactions();
            this.setCache('recent_transactions', mockData);
            return;
        }

        try {
            const response = await axios.get(`${this.baseUrl}/transactions`, {
                params: {
                    api_key: this.apiKey,
                    min_value: this.MIN_USD_VALUE,
                    limit: 50,
                    cursor: this.getFromCache('last_cursor')
                },
                timeout: 10000
            });

            if (response.data && response.data.transactions) {
                const transactions = this.transformTransactions(response.data.transactions);
                this.setCache('recent_transactions', transactions);
                this.setCache('last_cursor', response.data.cursor);

                // Emit whale alerts for new significant transactions
                this.analyzeAndEmitAlerts(transactions);
            }

        } catch (error) {
            this.handleError('fetch', error);
            // Fallback to mock data on error
            const mockData = this.getMockWhaleTransactions();
            this.setCache('recent_transactions', mockData);
        }
    }

    /**
     * Transform API response to our interface
     */
    private transformTransactions(apiTransactions: any[]): WhaleTransaction[] {
        return apiTransactions.map(tx => ({
            id: tx.id || `${tx.hash}_${tx.timestamp}`,
            blockchain: tx.blockchain,
            symbol: tx.symbol,
            amount: tx.amount,
            amountUsd: tx.amount_usd,
            from: {
                address: tx.from.address,
                owner: tx.from.owner,
                owner_type: tx.from.owner_type
            },
            to: {
                address: tx.to.address,
                owner: tx.to.owner,
                owner_type: tx.to.owner_type
            },
            transactionHash: tx.hash,
            timestamp: tx.timestamp * 1000, // Convert to milliseconds
            transactionType: 'transfer'
        }));
    }

    /**
     * Analyze transactions and emit alerts
     */
    private analyzeAndEmitAlerts(transactions: WhaleTransaction[]): void {
        transactions.forEach(tx => {
            const alert = this.createWhaleAlert(tx);
            if (alert) {
                this.emit('whale_alert', alert);
            }
        });
    }

    /**
     * Create whale alert from transaction
     */
    private createWhaleAlert(transaction: WhaleTransaction): WhaleAlert | null {
        // Determine impact based on USD value
        let impact: 'high' | 'medium' | 'low';
        if (transaction.amountUsd >= 10000000) {
            impact = 'high';
        } else if (transaction.amountUsd >= 5000000) {
            impact = 'medium';
        } else {
            impact = 'low';
        }

        // Determine alert type based on transaction flow
        let alertType: 'exchange_inflow' | 'exchange_outflow' | 'whale_movement' | 'institutional';
        if (transaction.from.owner_type === 'exchange' && transaction.to.owner_type !== 'exchange') {
            alertType = 'exchange_outflow';
        } else if (transaction.from.owner_type !== 'exchange' && transaction.to.owner_type === 'exchange') {
            alertType = 'exchange_inflow';
        } else if (transaction.from.owner_type === 'whale' || transaction.to.owner_type === 'whale') {
            alertType = 'whale_movement';
        } else {
            alertType = 'institutional';
        }

        // Determine market sentiment
        const marketSentiment = alertType === 'exchange_inflow' ? 'bearish' : 
                               alertType === 'exchange_outflow' ? 'bullish' : 'neutral';

        return {
            transaction,
            impact,
            marketSentiment,
            alertType
        };
    }

    /**
     * Get whale statistics
     */
    async getWhaleStats(): Promise<any> {
        const transactions = this.getFromCache('recent_transactions') || [];
        
        const stats = {
            totalTransactions: transactions.length,
            totalVolume: transactions.reduce((sum: number, tx: WhaleTransaction) => sum + tx.amountUsd, 0),
            avgTransactionSize: 0,
            topSymbols: this.getTopSymbols(transactions),
            exchangeFlow: this.calculateExchangeFlow(transactions),
            hourlyActivity: this.getHourlyActivity(transactions)
        };

        stats.avgTransactionSize = stats.totalTransactions > 0 ? 
            stats.totalVolume / stats.totalTransactions : 0;

        return stats;
    }

    /**
     * Get top symbols by volume
     */
    private getTopSymbols(transactions: WhaleTransaction[]): any[] {
        const symbolVolumes: { [key: string]: number } = {};
        
        transactions.forEach(tx => {
            symbolVolumes[tx.symbol] = (symbolVolumes[tx.symbol] || 0) + tx.amountUsd;
        });

        return Object.entries(symbolVolumes)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([symbol, volume]) => ({ symbol, volume }));
    }

    /**
     * Calculate exchange flow (net inflow/outflow)
     */
    private calculateExchangeFlow(transactions: WhaleTransaction[]): any {
        let inflow = 0;
        let outflow = 0;

        transactions.forEach(tx => {
            if (tx.from.owner_type !== 'exchange' && tx.to.owner_type === 'exchange') {
                inflow += tx.amountUsd;
            } else if (tx.from.owner_type === 'exchange' && tx.to.owner_type !== 'exchange') {
                outflow += tx.amountUsd;
            }
        });

        return {
            inflow,
            outflow,
            netFlow: inflow - outflow,
            flowRatio: outflow > 0 ? inflow / outflow : 0
        };
    }

    /**
     * Get hourly activity distribution
     */
    private getHourlyActivity(transactions: WhaleTransaction[]): any[] {
        const hourlyCount: { [key: number]: number } = {};
        
        transactions.forEach(tx => {
            const hour = new Date(tx.timestamp).getHours();
            hourlyCount[hour] = (hourlyCount[hour] || 0) + 1;
        });

        return Array.from({ length: 24 }, (_, hour) => ({
            hour,
            count: hourlyCount[hour] || 0
        }));
    }

    /**
     * Get recent whale movements
     */
    async getWhaleMovements(limit: number = 10): Promise<WhaleTransaction[]> {
        try {
            const cached = this.getFromCache('recent_transactions') as WhaleTransaction[];
            if (cached && cached.length > 0) {
                return cached.slice(0, limit);
            }

            // If no cached data, fetch fresh
            await this.fetchRecentTransactions();
            const transactions = this.getFromCache('recent_transactions') as WhaleTransaction[] || [];
            return transactions.slice(0, limit);

        } catch (error) {
            console.error('Error getting whale movements:', error);
            return this.getMockWhaleTransactions(limit);
        }
    }

    /**
     * Get mock whale transactions for testing
     */
    private getMockWhaleTransactions(limit: number = 10): WhaleTransaction[] {
        const mockTransactions: WhaleTransaction[] = [];
        const symbols = ['BTC', 'ETH', 'USDT', 'BNB', 'ADA', 'XRP', 'SOL', 'AVAX'];
        
        for (let i = 0; i < Math.min(limit, 10); i++) {
            const symbol = symbols[i % symbols.length];
            const amount = Math.random() * 1000 + 100;
            const timestamp = Date.now() - (i * 3600000);
            
            mockTransactions.push({
                id: `mock_${i}_${timestamp}`,
                blockchain: symbol === 'BTC' ? 'bitcoin' : 'ethereum',
                symbol,
                amount,
                amountUsd: amount * (symbol === 'BTC' ? 45000 : symbol === 'ETH' ? 2500 : 1),
                from: {
                    address: `addr_from_${i}`,
                    owner: i % 2 === 0 ? 'unknown' : 'binance',
                    owner_type: i % 2 === 0 ? 'unknown' : 'exchange'
                },
                to: {
                    address: `addr_to_${i}`,
                    owner: i % 2 === 0 ? 'coinbase' : 'unknown',
                    owner_type: i % 2 === 0 ? 'exchange' : 'whale'
                },
                transactionHash: `0x${Math.random().toString(16).substr(2, 40)}`,
                timestamp,
                transactionType: 'transfer'
            });
        }
        
        return mockTransactions;
    }

    /**
     * Cache management
     */
    private setCache(key: string, value: any): void {
        this.cache.set(key, value);
        // Auto-expire cache entries
        setTimeout(() => {
            this.cache.delete(key);
        }, this.CACHE_TTL);
    }

    private getFromCache(key: string): any {
        return this.cache.get(key);
    }

    /**
     * Error handling
     */
    private handleError(type: string, error: any): void {
        const realTimeError: RealTimeError = {
            type: type as 'unknown' | 'connection' | 'parsing' | 'rate_limit' | 'api',
            message: error.message || 'Unknown error',
            timestamp: Date.now(),
            stack: error.stack
        };

        console.error(`🐋 Whale Alert Error [${type}]:`, error.message);
        this.emit('error', realTimeError);
    }

    /**
     * Health check
     */
    getHealthStatus(): any {
        return {
            isRunning: this.isRunning,
            isConfigured: this.isConfigured(),
            cacheSize: this.cache.size,
            lastUpdate: this.getFromCache('recent_transactions') ? 'recent' : 'none'
        };
    }

    /**
     * Cleanup resources
     */
    destroy(): void {
        this.stopMonitoring();
        this.cache.clear();
        this.removeAllListeners();
    }
}
