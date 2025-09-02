import axios from 'axios';
import { EventEmitter } from 'events';
import { 
    FearGreedIndex, 
    SentimentData, 
    SentimentChangeEvent,
    CacheEntry,
    RealTimeError 
} from '../types/realTimeTypes';

/**
 * FearGreedService - Monitor Fear & Greed Index and Market Sentiment
 * Tracks market sentiment from multiple sources and provides composite scores
 */
export class FearGreedService extends EventEmitter {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private isMonitoring: boolean = false;
    private monitoringInterval: NodeJS.Timeout | null = null;
    private readonly API_URL = 'https://api.alternative.me/fng/';
    private readonly MONITORING_INTERVAL = 300000; // 5 minutes
    private readonly CACHE_TTL = 600000; // 10 minutes
    private lastFearGreedValue: number | null = null;

    // Classification thresholds
    private readonly FEAR_GREED_THRESHOLDS = {
        EXTREME_FEAR: 25,
        FEAR: 45,
        NEUTRAL: 55,
        GREED: 75,
        EXTREME_GREED: 100
    };

    constructor() {
        super();
    }

    /**
     * Start monitoring fear & greed index
     */
    async startMonitoring(): Promise<void> {
        if (this.isMonitoring) {
            console.log('📊 Fear & Greed monitoring already running');
            return;
        }

        console.log('📊 Starting Fear & Greed Index monitoring...');
        this.isMonitoring = true;

        // Initial fetch
        await this.fetchFearGreedIndex();

        // Set up polling
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.fetchFearGreedIndex();
            } catch (error) {
                this.handleError('polling', error as Error);
            }
        }, this.MONITORING_INTERVAL);

        console.log('✅ Fear & Greed monitoring started successfully');
    }

    /**
     * Stop monitoring
     */
    stopMonitoring(): void {
        if (!this.isMonitoring) return;

        console.log('🛑 Stopping Fear & Greed monitoring...');
        this.isMonitoring = false;

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        console.log('✅ Fear & Greed monitoring stopped');
    }

    /**
     * Fetch current Fear & Greed Index
     */
    async getCurrentIndex(): Promise<FearGreedIndex> {
        const cacheKey = 'current_fear_greed';
        const cached = this.getFromCache<FearGreedIndex>(cacheKey);
        
        if (cached) {
            return cached;
        }

        try {
            const response = await axios.get(`${this.API_URL}?limit=1&format=json`, {
                timeout: 10000
            });

            if (response.data && response.data.data && response.data.data[0]) {
                const data = response.data.data[0];
                const fearGreedIndex: FearGreedIndex = {
                    value: parseInt(data.value),
                    valueClassification: data.value_classification,
                    timestamp: parseInt(data.timestamp) * 1000,
                    nextUpdate: parseInt(data.next_update) * 1000
                };

                // Cache the result
                this.setCache(cacheKey, fearGreedIndex, this.CACHE_TTL);

                return fearGreedIndex;
            }

            throw new Error('Invalid API response format');
        } catch (error) {
            this.handleError('api', error as Error);
            throw error;
        }
    }

    /**
     * Get historical Fear & Greed data
     */
    async getHistoricalData(days: number = 30): Promise<FearGreedIndex[]> {
        const cacheKey = `historical_fear_greed_${days}`;
        const cached = this.getFromCache<FearGreedIndex[]>(cacheKey);
        
        if (cached) {
            return cached;
        }

        try {
            const response = await axios.get(`${this.API_URL}?limit=${days}&format=json`, {
                timeout: 15000
            });

            if (response.data && response.data.data) {
                const historicalData: FearGreedIndex[] = response.data.data.map((item: any) => ({
                    value: parseInt(item.value),
                    valueClassification: item.value_classification,
                    timestamp: parseInt(item.timestamp) * 1000,
                    nextUpdate: parseInt(item.next_update) * 1000
                }));

                // Cache for longer period since historical data doesn't change
                this.setCache(cacheKey, historicalData, this.CACHE_TTL * 2);

                return historicalData;
            }

            throw new Error('Invalid historical data response');
        } catch (error) {
            this.handleError('api', error as Error);
            throw error;
        }
    }

    /**
     * Fetch and process Fear & Greed Index with change detection
     */
    private async fetchFearGreedIndex(): Promise<void> {
        try {
            const currentIndex = await this.getCurrentIndex();
            
            // Check for significant changes
            if (this.lastFearGreedValue !== null) {
                const change = currentIndex.value - this.lastFearGreedValue;
                const changePercent = Math.abs(change / this.lastFearGreedValue) * 100;

                // Emit change event if significant (>5% change or classification change)
                if (changePercent > 5 || this.hasClassificationChanged(this.lastFearGreedValue, currentIndex.value)) {
                    this.emit('sentiment:change', {
                        type: 'sentiment:change',
                        data: {
                            previousValue: this.lastFearGreedValue,
                            currentValue: currentIndex.value,
                            change: change,
                            classification: currentIndex.valueClassification,
                            timestamp: currentIndex.timestamp
                        }
                    } as SentimentChangeEvent);

                    console.log(`📊 Sentiment Change: ${this.lastFearGreedValue} → ${currentIndex.value} (${currentIndex.valueClassification})`);
                }
            }

            this.lastFearGreedValue = currentIndex.value;

        } catch (error) {
            this.handleError('fetch', error as Error);
        }
    }

    /**
     * Check if classification level has changed
     */
    private hasClassificationChanged(oldValue: number, newValue: number): boolean {
        return this.getClassification(oldValue) !== this.getClassification(newValue);
    }

    /**
     * Get classification for a given value
     */
    private getClassification(value: number): string {
        if (value <= this.FEAR_GREED_THRESHOLDS.EXTREME_FEAR) return 'Extreme Fear';
        if (value <= this.FEAR_GREED_THRESHOLDS.FEAR) return 'Fear';
        if (value <= this.FEAR_GREED_THRESHOLDS.NEUTRAL) return 'Neutral';
        if (value <= this.FEAR_GREED_THRESHOLDS.GREED) return 'Greed';
        return 'Extreme Greed';
    }

    /**
     * Generate comprehensive sentiment data
     */
    async getComprehensiveSentiment(): Promise<SentimentData> {
        try {
            const fearGreedIndex = await this.getCurrentIndex();
            const historicalData = await this.getHistoricalData(7); // Last 7 days
            
            // Calculate trends
            const trend = this.calculateTrend(historicalData);
            const volatility = this.calculateSentimentVolatility(historicalData);
            
            // Generate composite sentiment (combine multiple factors)
            const compositeSentiment = this.calculateCompositeSentiment(
                fearGreedIndex.value,
                trend,
                volatility
            );

            // Generate trading recommendation
            const recommendation = this.generateTradingRecommendation(
                fearGreedIndex.value,
                trend,
                compositeSentiment
            );

            return {
                fearGreedIndex,
                compositeSentiment,
                recommendation
            };

        } catch (error) {
            this.handleError('sentiment_analysis', error as Error);
            throw error;
        }
    }

    /**
     * Calculate sentiment trend from historical data
     */
    private calculateTrend(historicalData: FearGreedIndex[]): number {
        if (historicalData.length < 2) return 0;

        const recent = historicalData.slice(0, 3); // Last 3 days
        const older = historicalData.slice(-3); // 3 days ago

        const recentAvg = recent.reduce((sum, item) => sum + item.value, 0) / recent.length;
        const olderAvg = older.reduce((sum, item) => sum + item.value, 0) / older.length;

        return ((recentAvg - olderAvg) / olderAvg) * 100; // Percentage change
    }

    /**
     * Calculate sentiment volatility
     */
    private calculateSentimentVolatility(historicalData: FearGreedIndex[]): number {
        if (historicalData.length < 2) return 0;

        const values = historicalData.map(item => item.value);
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        
        return Math.sqrt(variance);
    }

    /**
     * Calculate composite sentiment score
     */
    private calculateCompositeSentiment(
        fearGreedValue: number,
        trend: number,
        volatility: number
    ): number {
        // Normalize fear & greed (0-100 to -50 to +50)
        const normalizedFG = fearGreedValue - 50;
        
        // Trend influence (positive trend = more bullish)
        const trendInfluence = Math.max(-25, Math.min(25, trend * 2));
        
        // Volatility penalty (high volatility reduces confidence)
        const volatilityPenalty = Math.min(10, volatility / 2);
        
        // Composite score (-50 to +50)
        const composite = normalizedFG + trendInfluence - volatilityPenalty;
        
        // Normalize to 0-100 scale
        return Math.max(0, Math.min(100, composite + 50));
    }

    /**
     * Generate trading recommendation based on sentiment
     */
    private generateTradingRecommendation(
        fearGreedValue: number,
        trend: number,
        compositeSentiment: number
    ): SentimentData['recommendation'] {
        // Extreme fear with positive trend = strong buy
        if (fearGreedValue <= 25 && trend > 5) return 'strong_buy';
        
        // Fear territory = buy
        if (fearGreedValue <= 45) return 'buy';
        
        // Extreme greed with negative trend = strong sell
        if (fearGreedValue >= 75 && trend < -5) return 'strong_sell';
        
        // Greed territory = sell
        if (fearGreedValue >= 75) return 'sell';
        
        // Based on composite sentiment
        if (compositeSentiment >= 70) return 'buy';
        if (compositeSentiment <= 30) return 'sell';
        
        return 'hold';
    }

    /**
     * Get sentiment analysis for display
     */
    async getSentimentAnalysis(): Promise<any> {
        try {
            const current = await this.getCurrentIndex();
            const historical = await this.getHistoricalData(30);
            const trend = this.calculateTrend(historical);
            const volatility = this.calculateSentimentVolatility(historical);

            return {
                current: {
                    value: current.value,
                    classification: current.valueClassification,
                    timestamp: new Date(current.timestamp).toISOString()
                },
                trend: {
                    value: trend,
                    direction: trend > 0 ? 'improving' : trend < 0 ? 'declining' : 'stable',
                    strength: Math.abs(trend) > 10 ? 'strong' : Math.abs(trend) > 5 ? 'moderate' : 'weak'
                },
                volatility: {
                    value: volatility,
                    level: volatility > 15 ? 'high' : volatility > 8 ? 'moderate' : 'low'
                },
                recommendation: this.generateTradingRecommendation(current.value, trend, current.value),
                extremes: {
                    isExtremeFear: current.value <= 25,
                    isExtremeGreed: current.value >= 75,
                    timeInCurrentState: this.calculateTimeInCurrentState(historical, current.value)
                }
            };
        } catch (error) {
            this.handleError('analysis', error as Error);
            throw error;
        }
    }

    /**
     * Calculate how long we've been in current sentiment state
     */
    private calculateTimeInCurrentState(historical: FearGreedIndex[], currentValue: number): number {
        const currentClassification = this.getClassification(currentValue);
        let days = 0;

        for (const data of historical) {
            if (this.getClassification(data.value) === currentClassification) {
                days++;
            } else {
                break;
            }
        }

        return days;
    }

    /**
     * Cache management
     */
    private getFromCache<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() > entry.timestamp + entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    private setCache<T>(key: string, data: T, ttl: number): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    }

    /**
     * Error handling
     */
    private handleError(type: string, error: Error): void {
        const realTimeError: RealTimeError = {
            type: type as any,
            message: error.message,
            timestamp: Date.now(),
            stack: error.stack
        };

        console.error(`📊 Fear & Greed Error [${type}]:`, error.message);
        this.emit('error', realTimeError);
    }

    /**
     * Get current sentiment data
     */
    async getCurrentSentiment(): Promise<any> {
        try {
            // Try to get from cache first
            let fearGreedIndex = this.getFromCache('current_fear_greed') as FearGreedIndex;
            
            if (!fearGreedIndex) {
                // Fetch fresh data
                await this.fetchFearGreedIndex();
                fearGreedIndex = this.getFromCache('current_fear_greed') as FearGreedIndex;
                
                if (!fearGreedIndex) {
                    // Return mock data if API fails
                    fearGreedIndex = this.getMockFearGreedIndex();
                }
            }

            // Get historical data for context
            const history = (this.getFromCache('fear_greed_history') as any[]) || [];

            return {
                fearGreedIndex,
                socialSentiment: 0.5, // Mock value
                newsImpact: 0.6, // Mock value
                compositeSentiment: fearGreedIndex.value / 100,
                recommendation: this.getRecommendationFromValue(fearGreedIndex.value),
                value: fearGreedIndex.value,
                classification: fearGreedIndex.valueClassification,
                timestamp: fearGreedIndex.timestamp,
                history: history.slice(0, 7), // Last 7 days
                tradingAdvice: this.getTradingAdvice(fearGreedIndex.value),
                marketBias: this.getMarketBias(fearGreedIndex.value)
            };

        } catch (error) {
            console.error('Error getting current sentiment:', error);
            return this.getMockSentimentData();
        }
    }

    /**
     * Get classification from value
     */
    private getClassificationFromValue(value: number): 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed' {
        if (value <= this.FEAR_GREED_THRESHOLDS.EXTREME_FEAR) return 'Extreme Fear';
        if (value <= this.FEAR_GREED_THRESHOLDS.FEAR) return 'Fear';
        if (value <= this.FEAR_GREED_THRESHOLDS.NEUTRAL) return 'Neutral';
        if (value <= this.FEAR_GREED_THRESHOLDS.GREED) return 'Greed';
        return 'Extreme Greed';
    }

    /**
     * Get mock fear & greed index for testing
     */
    private getMockFearGreedIndex(): FearGreedIndex {
        const value = 45; // Fear range
        return {
            value,
            valueClassification: this.getClassificationFromValue(value),
            timestamp: Date.now()
        };
    }

    /**
     * Get mock sentiment data
     */
    private getMockSentimentData(): any {
        const mockIndex = this.getMockFearGreedIndex();
        return {
            fearGreedIndex: mockIndex,
            socialSentiment: 0.4,
            newsImpact: 0.5,
            compositeSentiment: mockIndex.value / 100,
            recommendation: this.getRecommendationFromValue(mockIndex.value),
            value: mockIndex.value,
            classification: mockIndex.valueClassification,
            timestamp: mockIndex.timestamp,
            history: [
                { value: 42, classification: 'Fear', timestamp: Date.now() - 86400000 },
                { value: 38, classification: 'Fear', timestamp: Date.now() - 172800000 },
                { value: 45, classification: 'Fear', timestamp: Date.now() - 259200000 }
            ],
            tradingAdvice: this.getTradingAdvice(mockIndex.value),
            marketBias: this.getMarketBias(mockIndex.value)
        };
    }

    /**
     * Get trading recommendation from fear & greed value
     */
    private getRecommendationFromValue(value: number): 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell' {
        if (value <= 20) return 'strong_buy';  // Extreme fear = opportunity
        if (value <= 40) return 'buy';         // Fear = good buying opportunity
        if (value <= 60) return 'hold';        // Neutral = hold
        if (value <= 80) return 'sell';        // Greed = consider selling
        return 'strong_sell';                  // Extreme greed = sell
    }

    /**
     * Get trading advice text
     */
    private getTradingAdvice(value: number): string {
        if (value <= 25) return 'Market shows extreme fear - historically good buying opportunity';
        if (value <= 45) return 'Market sentiment is fearful - consider DCA strategy';
        if (value <= 55) return 'Market is neutral - wait for clearer signals';
        if (value <= 75) return 'Market shows greed - be cautious, consider taking profits';
        return 'Extreme greed detected - consider reducing positions';
    }

    /**
     * Get market bias
     */
    private getMarketBias(value: number): string {
        if (value <= 30) return 'Strong Buy Signal';
        if (value <= 50) return 'Bullish Opportunity';
        if (value <= 70) return 'Neutral to Bearish';
        return 'Bearish - High Risk';
    }

    /**
     * Health check
     */
    getHealthStatus(): any {
        return {
            isMonitoring: this.isMonitoring,
            cacheSize: this.cache.size,
            lastValue: this.lastFearGreedValue,
            lastUpdate: this.getFromCache('current_fear_greed') ? 'recent' : 'none'
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
