/**
 * Database Service - Prisma Integration
 * Handles all database operations for the trading bot
 */

import { PrismaClient } from '../generated/prisma';
import { PriceData, TradeData, OrderBook } from '../types/realTimeTypes';

export class DatabaseService {
    private prisma: PrismaClient;
    private isInitialized: boolean = false;

    constructor() {
        this.prisma = new PrismaClient();
    }

    /**
     * Initialize database connection
     */
    async initialize(): Promise<void> {
        try {
            await this.prisma.$connect();
            this.isInitialized = true;
            console.log('✅ Database connected successfully');
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            throw error;
        }
    }

    /**
     * Cleanup database connection
     */
    async cleanup(): Promise<void> {
        if (this.isInitialized) {
            await this.prisma.$disconnect();
            this.isInitialized = false;
            console.log('✅ Database disconnected');
        }
    }

    // ==================== PRICE DATA ====================

    /**
     * Store price data
     */
    async storePriceData(priceData: PriceData): Promise<void> {
        try {
            await this.prisma.priceData.create({
                data: {
                    symbol: priceData.symbol,
                    price: priceData.price,
                    change24h: priceData.change24h,
                    changePercent24h: priceData.changePercent24h,
                    volume24h: priceData.volume24h,
                    high24h: priceData.high24h,
                    low24h: priceData.low24h,
                    timestamp: new Date(priceData.timestamp),
                    exchange: priceData.exchange
                }
            });
        } catch (error) {
            console.error('Error storing price data:', error);
        }
    }

    /**
     * Get recent price data for symbol
     */
    async getRecentPriceData(symbol: string, limit: number = 100): Promise<any[]> {
        return await this.prisma.priceData.findMany({
            where: { symbol },
            orderBy: { timestamp: 'desc' },
            take: limit
        });
    }

    /**
     * Get price history for analysis
     */
    async getPriceHistory(symbol: string, timeframe: string): Promise<any[]> {
        const now = new Date();
        const timeframes: { [key: string]: number } = {
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000
        };

        const timeframeMs = timeframes[timeframe] || timeframes['1d'];
        const startTime = new Date(now.getTime() - timeframeMs);

        return await this.prisma.priceData.findMany({
            where: {
                symbol,
                timestamp: {
                    gte: startTime
                }
            },
            orderBy: { timestamp: 'asc' }
        });
    }

    // ==================== TRADE DATA ====================

    /**
     * Store trade data
     */
    async storeTradeData(tradeData: TradeData): Promise<void> {
        try {
            const totalValue = tradeData.price * tradeData.quantity;
            
            await this.prisma.tradeData.create({
                data: {
                    symbol: tradeData.symbol,
                    price: tradeData.price,
                    quantity: tradeData.quantity,
                    side: tradeData.side,
                    tradeId: tradeData.tradeId,
                    timestamp: new Date(tradeData.timestamp),
                    exchange: tradeData.exchange,
                    totalValue
                }
            });
        } catch (error) {
            console.error('Error storing trade data:', error);
        }
    }

    /**
     * Get large trades (whale trades)
     */
    async getLargeTrades(minValue: number = 100000, limit: number = 50): Promise<any[]> {
        return await this.prisma.tradeData.findMany({
            where: {
                totalValue: {
                    gte: minValue
                }
            },
            orderBy: { timestamp: 'desc' },
            take: limit
        });
    }

    /**
     * Get trade volume statistics
     */
    async getTradeVolumeStats(symbol: string, timeframe: string): Promise<any> {
        const now = new Date();
        const timeframes: { [key: string]: number } = {
            '1h': 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000
        };

        const timeframeMs = timeframes[timeframe] || timeframes['1d'];
        const startTime = new Date(now.getTime() - timeframeMs);

        const result = await this.prisma.tradeData.aggregate({
            where: {
                symbol,
                timestamp: {
                    gte: startTime
                }
            },
            _sum: {
                totalValue: true,
                quantity: true
            },
            _count: {
                id: true
            },
            _avg: {
                price: true,
                totalValue: true
            }
        });

        return {
            totalVolume: result._sum.totalValue || 0,
            totalQuantity: result._sum.quantity || 0,
            tradeCount: result._count.id || 0,
            averagePrice: result._avg.price || 0,
            averageTradeValue: result._avg.totalValue || 0,
            timeframe,
            symbol
        };
    }

    // ==================== ORDER BOOK DATA ====================

    /**
     * Store order book snapshot
     */
    async storeOrderBookSnapshot(orderBook: OrderBook): Promise<void> {
        try {
            const totalBidVolume = orderBook.bids.reduce((sum, bid) => sum + (bid.price * bid.quantity), 0);
            const totalAskVolume = orderBook.asks.reduce((sum, ask) => sum + (ask.price * ask.quantity), 0);
            const spread = orderBook.asks[0]?.price - orderBook.bids[0]?.price || 0;
            const imbalanceRatio = totalBidVolume / (totalBidVolume + totalAskVolume);

            await this.prisma.orderBookSnapshot.create({
                data: {
                    symbol: orderBook.symbol,
                    timestamp: new Date(orderBook.timestamp),
                    exchange: orderBook.exchange,
                    bids: JSON.stringify(orderBook.bids),
                    asks: JSON.stringify(orderBook.asks),
                    totalBidVolume,
                    totalAskVolume,
                    spread,
                    imbalanceRatio
                }
            });
        } catch (error) {
            console.error('Error storing order book data:', error);
        }
    }

    // ==================== USER PREFERENCES ====================

    /**
     * Get or create user preferences
     */
    async getUserPreferences(userId: string): Promise<any> {
        let preferences = await this.prisma.userPreference.findUnique({
            where: { userId }
        });

        if (!preferences) {
            preferences = await this.prisma.userPreference.create({
                data: {
                    userId,
                    displayEnabled: true,
                    throttleMs: 3000,
                    volumeThreshold: 10000.0,
                    favoriteSymbols: JSON.stringify(['BTCUSDT', 'ETHUSDT']),
                    alertSettings: JSON.stringify({
                        priceAlerts: true,
                        whaleAlerts: true,
                        volumeAlerts: true
                    })
                }
            });
        }

        return {
            ...preferences,
            favoriteSymbols: JSON.parse(preferences.favoriteSymbols),
            alertSettings: JSON.parse(preferences.alertSettings)
        };
    }

    /**
     * Update user preferences
     */
    async updateUserPreferences(userId: string, updates: any): Promise<void> {
        const updateData: any = {};

        if (updates.displayEnabled !== undefined) updateData.displayEnabled = updates.displayEnabled;
        if (updates.throttleMs !== undefined) updateData.throttleMs = updates.throttleMs;
        if (updates.volumeThreshold !== undefined) updateData.volumeThreshold = updates.volumeThreshold;
        if (updates.favoriteSymbols !== undefined) updateData.favoriteSymbols = JSON.stringify(updates.favoriteSymbols);
        if (updates.alertSettings !== undefined) updateData.alertSettings = JSON.stringify(updates.alertSettings);

        await this.prisma.userPreference.update({
            where: { userId },
            data: updateData
        });
    }

    // ==================== PRICE ALERTS ====================

    /**
     * Create price alert
     */
    async createPriceAlert(userId: string, symbol: string, targetPrice: number, direction: string): Promise<any> {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

        return await this.prisma.priceAlert.create({
            data: {
                userId,
                symbol,
                targetPrice,
                direction,
                expiresAt
            }
        });
    }

    /**
     * Get active alerts for user
     */
    async getActiveAlerts(userId: string): Promise<any[]> {
        return await this.prisma.priceAlert.findMany({
            where: {
                userId,
                isActive: true,
                expiresAt: {
                    gt: new Date()
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Trigger price alert
     */
    async triggerPriceAlert(alertId: string): Promise<void> {
        await this.prisma.priceAlert.update({
            where: { id: alertId },
            data: {
                isActive: false,
                triggeredAt: new Date()
            }
        });
    }

    // ==================== ANALYTICS ====================

    /**
     * Get trading statistics
     */
    async getTradingStats(timeframe: string = '1d'): Promise<any> {
        const now = new Date();
        const timeframes: { [key: string]: number } = {
            '1h': 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000
        };

        const timeframeMs = timeframes[timeframe] || timeframes['1d'];
        const startTime = new Date(now.getTime() - timeframeMs);

        const [tradeStats, priceDataCount, orderBookCount] = await Promise.all([
            this.prisma.tradeData.aggregate({
                where: {
                    timestamp: { gte: startTime }
                },
                _count: { id: true },
                _sum: { totalValue: true }
            }),
            this.prisma.priceData.count({
                where: {
                    timestamp: { gte: startTime }
                }
            }),
            this.prisma.orderBookSnapshot.count({
                where: {
                    timestamp: { gte: startTime }
                }
            })
        ]);

        return {
            timeframe,
            tradesProcessed: tradeStats._count.id || 0,
            totalTradeVolume: tradeStats._sum.totalValue || 0,
            priceUpdatesProcessed: priceDataCount,
            orderBookSnapshotsProcessed: orderBookCount,
            dataProcessingRate: {
                tradesPerHour: Math.round((tradeStats._count.id || 0) / (timeframeMs / (60 * 60 * 1000))),
                priceUpdatesPerHour: Math.round(priceDataCount / (timeframeMs / (60 * 60 * 1000))),
                orderBookUpdatesPerHour: Math.round(orderBookCount / (timeframeMs / (60 * 60 * 1000)))
            }
        };
    }

    /**
     * Store performance metric
     */
    async storePerformanceMetric(symbol: string | null, metricType: string, value: number, timeframe: string, metadata?: any): Promise<void> {
        await this.prisma.performanceMetric.create({
            data: {
                symbol,
                metricType,
                value,
                timeframe,
                calculatedAt: new Date(),
                metadata: metadata ? JSON.stringify(metadata) : null
            }
        });
    }

    /**
     * Store system metric
     */
    async storeSystemMetric(metricName: string, value: number, exchange?: string): Promise<void> {
        await this.prisma.systemMetric.create({
            data: {
                metricName,
                value,
                exchange,
                timestamp: new Date()
            }
        });
    }

    /**
     * Log error
     */
    async logError(errorType: string, errorMessage: string, exchange?: string, symbol?: string, stackTrace?: string, severity: string = 'medium'): Promise<void> {
        await this.prisma.errorLog.create({
            data: {
                errorType,
                errorMessage,
                exchange,
                symbol,
                stackTrace,
                severity,
                timestamp: new Date()
            }
        });
    }
}
