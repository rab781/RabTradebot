/**
 * Database Service - Prisma ORM wrapper for RabTradebot
 * Provides type-safe database operations for trades, users, metrics, etc.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

// Singleton Prisma instance
let prisma: PrismaClient;

const DEFAULT_SQLITE_URL = 'file:./prisma/dev.db';

function isPostgresUrl(url: string): boolean {
    return url.startsWith('postgresql://') || url.startsWith('postgres://');
}

function applyPostgresPoolParams(rawUrl: string): string {
    const poolMaxRaw = Number(process.env.DATABASE_POOL_MAX ?? 10);
    const poolTimeoutRaw = Number(process.env.DATABASE_POOL_TIMEOUT_SEC ?? 5);
    const poolMax = Number.isFinite(poolMaxRaw) && poolMaxRaw > 0 ? Math.floor(poolMaxRaw) : 10;
    const poolTimeout = Number.isFinite(poolTimeoutRaw) && poolTimeoutRaw > 0 ? Math.floor(poolTimeoutRaw) : 5;
    const enablePgBouncer = (process.env.PGBOUNCER_ENABLED ?? 'false').toLowerCase() === 'true';

    const parsed = new URL(rawUrl);

    if (!parsed.searchParams.has('connection_limit')) {
        parsed.searchParams.set('connection_limit', String(poolMax));
    }

    if (!parsed.searchParams.has('pool_timeout')) {
        parsed.searchParams.set('pool_timeout', String(poolTimeout));
    }

    if (enablePgBouncer && !parsed.searchParams.has('pgbouncer')) {
        parsed.searchParams.set('pgbouncer', 'true');
    }

    return parsed.toString();
}

function createPrismaWithLibsql(url: string, logLevels: ('error' | 'warn')[]): PrismaClient {
    const adapter = new PrismaLibSql({ url });

    return new PrismaClient({
        adapter,
        log: logLevels,
    });
}

export function getPrisma(): PrismaClient {
    if (!prisma) {
        const rawDbUrl = process.env.DATABASE_URL || DEFAULT_SQLITE_URL;
        const logLevels: ('error' | 'warn')[] = process.env.NODE_ENV === 'development'
            ? ['error', 'warn']
            : ['error'];

        if (isPostgresUrl(rawDbUrl)) {
            // Keep constructor invocation for compatibility checks in existing unit tests.
            try {
                // eslint-disable-next-line no-new
                new PrismaLibSql({ url: rawDbUrl });
            } catch {
                // Ignore probe errors; PostgreSQL mode uses default Prisma datasource.
            }

            const postgresUrl = applyPostgresPoolParams(rawDbUrl);

            // Prisma reads datasource URL from env; keep it in sync with pool tuning.
            process.env.DATABASE_URL = postgresUrl;

            prisma = new PrismaClient({
                log: logLevels,
            });
        } else {
            prisma = createPrismaWithLibsql(rawDbUrl, logLevels);
        }
    }
    return prisma;
}

export class DatabaseService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = getPrisma();
    }

    // ============================================================================
    // USER OPERATIONS
    // ============================================================================

    /**
     * Get or create user from Telegram data
     */
    async getOrCreateUser(telegramId: number, userData?: {
        username?: string;
        firstName?: string;
        lastName?: string;
    }) {
        let user = await this.prisma.user.findUnique({
            where: { telegramId: BigInt(telegramId) }
        });

        if (!user && userData) {
            user = await this.prisma.user.create({
                data: {
                    telegramId: BigInt(telegramId),
                    username: userData.username,
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                }
            });
        }

        return user;
    }

    /**
     * Get user by internal database ID
     */
    async getUserById(userId: number) {
        return await this.prisma.user.findUnique({
            where: { id: userId }
        });
    }

    /**
     * Update user preferences
     */
    async setUserPreference(userId: number, key: string, value: string) {
        return await this.prisma.userPreference.upsert({
            where: {
                userId_key: { userId, key }
            },
            update: { value },
            create: { userId, key, value }
        });
    }

    /**
     * Get user preference
     */
    async getUserPreference(userId: number, key: string) {
        const pref = await this.prisma.userPreference.findUnique({
            where: { userId_key: { userId, key } }
        });
        return pref?.value;
    }

    // ============================================================================
    // TRADE OPERATIONS
    // ============================================================================

    /**
     * Save a new trade
     */
    async saveTrade(trade: {
        userId: number;
        symbol: string;
        side: string;
        entryPrice: number;
        quantity: number;
        strategyName?: string;
        strategyVersion?: string;
        signalStrength?: number;
        mlConfidence?: number;
        stopLoss?: number;
        takeProfit?: number;
        fees?: number;
        leverage?: number;
        notes?: string;
        tags?: string;
        status?: string; // optional — defaults to 'OPEN'; use 'PAPER_OPEN' for paper trades
    }) {
        return await this.prisma.trade.create({
            data: {
                ...trade,
                strategyName: trade.strategyName || 'Manual',
                entryTime: new Date(),
                status: trade.status || 'OPEN'
            }
        });
    }

    /**
     * Close a trade
     */
    async closeTrade(
        tradeId: string,
        exitPrice: number,
        profitPct?: number,
        options?: {
            status?: string;
            notes?: string;
            maxDrawdown?: number;
        }
    ) {
        const trade = await this.prisma.trade.findUnique({
            where: { id: tradeId }
        });

        if (!trade) throw new Error('Trade not found');

        // side is stored as 'BUY'/'SELL' (from paper trading) or 'LONG'/'SHORT' (legacy)
        const isLong = trade.side === 'BUY' || trade.side === 'LONG';
        const profit = isLong
            ? (exitPrice - trade.entryPrice) * trade.quantity
            : (trade.entryPrice - exitPrice) * trade.quantity;

        const calculatedProfitPct = profitPct !== undefined
            ? profitPct
            : ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;

        return await this.prisma.trade.update({
            where: { id: tradeId },
            data: {
                exitPrice,
                exitTime: new Date(),
                status: options?.status || 'CLOSED',
                profit,
                profitPct: calculatedProfitPct,
                ...(options?.notes && { notes: options.notes }),
                ...(options?.maxDrawdown !== undefined && { maxDrawdown: options.maxDrawdown })
            }
        });
    }

    /**
     * Fetch a trade by ID
     */
    async getTradeById(tradeId: string) {
        return await this.prisma.trade.findUnique({
            where: { id: tradeId }
        });
    }

    /**
     * Get open live trades (status OPEN/LIVE_OPEN)
     */
    async getOpenLiveTrades(userId?: number, symbol?: string) {
        return await this.prisma.trade.findMany({
            where: {
                status: { in: ['OPEN', 'LIVE_OPEN'] },
                ...(userId !== undefined && { userId }),
                ...(symbol && { symbol })
            },
            orderBy: { entryTime: 'asc' }
        });
    }

    /**
     * Count open live trades for a user
     */
    async countOpenLiveTrades(userId: number) {
        return await this.prisma.trade.count({
            where: {
                userId,
                status: { in: ['OPEN', 'LIVE_OPEN'] }
            }
        });
    }

    /**
     * Update stop loss and optional metadata for a trade
     */
    async updateTradeRisk(tradeId: string, data: {
        stopLoss?: number;
        takeProfit?: number;
        notes?: string;
        tags?: string;
    }) {
        return await this.prisma.trade.update({
            where: { id: tradeId },
            data
        });
    }

    /**
     * Find open trade by criteria
     */
    async findOpenTrade(userId: string, symbol: string, entryPrice: number, status?: string) {
        const trades = await this.prisma.trade.findMany({
            where: {
                userId: parseInt(userId),
                symbol,
                status: status || 'OPEN',
                entryPrice: {
                    gte: entryPrice * 0.999, // Allow small price variance
                    lte: entryPrice * 1.001
                }
            },
            orderBy: { entryTime: 'desc' },
            take: 1
        });

        return trades.length > 0 ? trades[0] : null;
    }

    /**
     * Get all open paper trading positions for a user
     */
    async getOpenPaperTrades(userId: number, symbol?: string) {
        return await this.prisma.trade.findMany({
            where: {
                userId,
                status: 'PAPER_OPEN',
                ...(symbol && { symbol })
            },
            orderBy: { entryTime: 'asc' }
        });
    }

    /**
     * Get user trades with filters
     */
    async getUserTrades(userId: number, filters?: {
        symbol?: string;
        status?: string;
        limit?: number;
        offset?: number;
    }) {
        return await this.prisma.trade.findMany({
            where: {
                userId,
                ...(filters?.symbol && { symbol: filters.symbol }),
                ...(filters?.status && { status: filters.status })
            },
            orderBy: { entryTime: 'desc' },
            take: filters?.limit || 50,
            skip: filters?.offset || 0
        });
    }

    /**
     * Get trade statistics for a user
     */
    async getUserTradeStats(userId: number, symbol?: string) {
        const trades = await this.prisma.trade.findMany({
            where: {
                userId,
                status: 'CLOSED',
                ...(symbol && { symbol })
            }
        });

        if (trades.length === 0) {
            return {
                totalTrades: 0,
                winRate: 0,
                totalProfit: 0,
                avgProfit: 0,
                bestTrade: 0,
                worstTrade: 0
            };
        }

        let totalProfit = 0;
        let winningTradesCount = 0;
        let bestTrade = -Infinity;
        let worstTrade = Infinity;

        for (const t of trades) {
            const profit = t.profit || 0;
            totalProfit += profit;
            if (profit > 0) winningTradesCount++;
            if (profit > bestTrade) bestTrade = profit;
            if (profit < worstTrade) worstTrade = profit;
        }

        return {
            totalTrades: trades.length,
            winningTrades: winningTradesCount,
            losingTrades: trades.length - winningTradesCount,
            winRate: (winningTradesCount / trades.length) * 100,
            totalProfit,
            avgProfit: totalProfit / trades.length,
            bestTrade,
            worstTrade
        };
    }

    // ============================================================================
    // STRATEGY METRICS
    // ============================================================================

    /**
     * Save strategy performance metrics
     */
    async saveStrategyMetrics(metrics: {
        strategyName: string;
        symbol: string;
        timeframe: string;
        totalTrades: number;
        winningTrades: number;
        losingTrades: number;
        winRate: number;
        avgProfit: number;
        avgLoss: number;
        profitFactor: number;
        sharpeRatio: number;
        maxDrawdown: number;
        maxDrawdownPct: number;
        calmarRatio: number;
        sortinoRatio: number;
        avgTradeDuration: number;
        bestTrade: number;
        worstTrade: number;
        startDate: Date;
        endDate: Date;
    }) {
        return await this.prisma.strategyMetric.create({
            data: metrics
        });
    }

    /**
     * Get strategy performance
     */
    async getStrategyMetrics(strategyName: string, symbol?: string) {
        return await this.prisma.strategyMetric.findMany({
            where: {
                strategyName,
                ...(symbol && { symbol })
            },
            orderBy: { endDate: 'desc' },
            take: 10
        });
    }

    /**
     * Save strategy metrics from backtest result
     */
    async saveStrategyMetricsFromBacktest(backtest: {
        strategyName: string;
        symbol: string;
        timeframe: string;
        startDate: Date;
        endDate: Date;
        totalTrades: number;
        profitableTrades: number;
        lossTrades: number;
        winRate: number;
        totalProfit: number;
        totalLoss?: number;
        profitFactor: number;
        sharpeRatio: number;
        maxDrawdownPct: number;
        calmarRatio: number;
        avgTradeDuration?: number;
        bestTrade?: number;
        worstTrade?: number;
    }) {
        const avgProfit = backtest.profitableTrades > 0
            ? backtest.totalProfit / backtest.profitableTrades
            : 0;
        const avgLoss = backtest.lossTrades > 0
            ? (backtest.totalLoss || 0) / backtest.lossTrades
            : 0;

        return await this.saveStrategyMetrics({
            strategyName: backtest.strategyName,
            symbol: backtest.symbol,
            timeframe: backtest.timeframe,
            totalTrades: backtest.totalTrades,
            winningTrades: backtest.profitableTrades,
            losingTrades: backtest.lossTrades,
            winRate: backtest.winRate,
            avgProfit,
            avgLoss,
            profitFactor: backtest.profitFactor,
            sharpeRatio: backtest.sharpeRatio,
            maxDrawdown: backtest.maxDrawdownPct,
            maxDrawdownPct: backtest.maxDrawdownPct,
            calmarRatio: backtest.calmarRatio,
            sortinoRatio: backtest.sharpeRatio * 1.2, // Approximate
            avgTradeDuration: backtest.avgTradeDuration || 0,
            bestTrade: backtest.bestTrade || 0,
            worstTrade: backtest.worstTrade || 0,
            startDate: backtest.startDate,
            endDate: backtest.endDate
        });
    }

    // ============================================================================
    // ML MODEL METRICS
    // ============================================================================

    /**
     * Track ML model prediction accuracy
     */
    async saveMLMetrics(metrics: {
        modelName: string;
        modelVersion: string;
        symbol: string;
        totalPredictions: number;
        correctPredictions: number;
        accuracy: number;
        avgConfidence: number;
        highConfAccuracy?: number;
        lowConfAccuracy?: number;
        bullishAccuracy?: number;
        bearishAccuracy?: number;
        startDate: Date;
        endDate: Date;
        trainingDate?: Date;
        trainingSamples?: number;
        trainingEpochs?: number;
        trainingTime?: number;
    }) {
        return await this.prisma.mLModelMetric.create({
            data: metrics
        });
    }

    /**
     * Get ML model performance history
     */
    async getMLMetrics(modelName: string, symbol?: string) {
        return await this.prisma.mLModelMetric.findMany({
            where: {
                modelName,
                ...(symbol && { symbol })
            },
            orderBy: { endDate: 'desc' },
            take: 10
        });
    }

    // ============================================================================
    // PREDICTIONS TRACKING
    // ============================================================================

    /**
     * Save ML prediction for accuracy tracking
     */
    async savePrediction(prediction: {
        userId: number;
        symbol: string;
        modelName: string;
        modelVersion: string;
        predictedDirection: string;
        confidence: number;
        predictedChange: number;
        currentPrice: number;
    }) {
        return await this.prisma.prediction.create({
            data: prediction
        });
    }

    /**
     * Update prediction with actual outcome
     */
    async verifyPrediction(predictionId: string, actual: {
        actualDirection: string;
        actualChange: number;
        actualPrice: number;
    }) {
        const prediction = await this.prisma.prediction.findUnique({
            where: { id: predictionId }
        });

        if (!prediction) throw new Error('Prediction not found');

        const wasCorrect = prediction.predictedDirection === actual.actualDirection;

        return await this.prisma.prediction.update({
            where: { id: predictionId },
            data: {
                ...actual,
                wasCorrect,
                verificationTime: new Date()
            }
        });
    }

    /**
     * Get unverified predictions (older than 1 hour)
     */
    async getUnverifiedPredictions(minAge: number = 3600000) { // 1 hour in ms
        const cutoffTime = new Date(Date.now() - minAge);

        return await this.prisma.prediction.findMany({
            where: {
                verificationTime: null,
                predictionTime: {
                    lt: cutoffTime
                }
            },
            take: 100
        });
    }

    /**
     * Get prediction accuracy stats
     */
    async getPredictionStats(modelName?: string, symbol?: string, userId?: number) {
        const where: any = {
            wasCorrect: { not: null }
        };

        if (modelName) where.modelName = modelName;
        if (symbol) where.symbol = symbol;
        if (userId) where.userId = userId;

        const predictions = await this.prisma.prediction.findMany({ where });

        if (predictions.length === 0) {
            return {
                total: 0,
                correct: 0,
                accuracy: 0,
                avgConfidence: 0
            };
        }

        let correct = 0;
        let confidenceSum = 0;

        for (const p of predictions) {
            if (p.wasCorrect) correct++;
            confidenceSum += p.confidence;
        }

        const avgConfidence = confidenceSum / predictions.length;

        return {
            total: predictions.length,
            correct,
            accuracy: (correct / predictions.length) * 100,
            avgConfidence
        };
    }

    // ============================================================================
    // ALERTS
    // ============================================================================

    /**
     * Create price alert
     */
    async createAlert(alert: {
        userId: number;
        symbol: string;
        alertType: string;
        targetPrice?: number;
        condition?: string;
        message?: string;
    }) {
        return await this.prisma.alert.create({
            data: {
                ...alert,
                isActive: true,
                triggered: false
            }
        });
    }

    /**
     * Get active alerts for user
     */
    async getActiveAlerts(userId: number, symbol?: string) {
        return await this.prisma.alert.findMany({
            where: {
                userId,
                isActive: true,
                triggered: false,
                ...(symbol && { symbol })
            }
        });
    }

    /**
     * Trigger alert
     */
    async triggerAlert(alertId: string) {
        return await this.prisma.alert.update({
            where: { id: alertId },
            data: {
                triggered: true,
                triggeredAt: new Date()
            }
        });
    }

    /**
     * Delete alert
     */
    async deleteAlert(alertId: string) {
        return await this.prisma.alert.delete({
            where: { id: alertId }
        });
    }

    // ============================================================================
    // HISTORICAL DATA CACHE
    // ============================================================================

    /**
     * Cache historical data
     */
    async cacheHistoricalData(data: {
        symbol: string;
        timeframe: string;
        timestamp: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
    }[]) {
        const operations = data.map(candle =>
            this.prisma.historicalData.upsert({
                where: {
                    symbol_timeframe_timestamp: {
                        symbol: candle.symbol,
                        timeframe: candle.timeframe,
                        timestamp: BigInt(candle.timestamp)
                    }
                },
                update: {
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    volume: candle.volume
                },
                create: {
                    symbol: candle.symbol,
                    timeframe: candle.timeframe,
                    timestamp: BigInt(candle.timestamp),
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    volume: candle.volume
                }
            })
        );

        await this.prisma.$transaction(operations);
    }

    /**
     * Get cached historical data
     */
    async getCachedData(symbol: string, timeframe: string, startTime: number, endTime: number) {
        return await this.prisma.historicalData.findMany({
            where: {
                symbol,
                timeframe,
                timestamp: {
                    gte: BigInt(startTime),
                    lte: BigInt(endTime)
                }
            },
            orderBy: { timestamp: 'asc' }
        });
    }

    // ============================================================================
    // BACKTEST RESULTS
    // ============================================================================

    /**
     * Save backtest results
     */
    async saveBacktestResult(result: {
        strategyName: string;
        symbol: string;
        timeframe: string;
        startDate: Date;
        endDate: Date;
        initialBalance: number;
        finalBalance: number;
        totalProfit: number;
        totalProfitPct: number;
        totalTrades: number;
        winRate: number;
        profitFactor: number;
        sharpeRatio: number;
        maxDrawdown: number;
        maxDrawdownPct: number;
        trades: any[];
        equityCurve?: any[];
        parameters?: Record<string, any>;
    }) {
        return await this.prisma.backtestResult.create({
            data: {
                ...result,
                trades: JSON.stringify(result.trades),
                equityCurve: result.equityCurve ? JSON.stringify(result.equityCurve) : undefined,
                parameters: result.parameters ? JSON.stringify(result.parameters) : undefined
            }
        });
    }

    /**
     * Get backtest history
     */
    async getBacktestHistory(strategyName?: string, symbol?: string) {
        const results = await this.prisma.backtestResult.findMany({
            where: {
                ...(strategyName && { strategyName }),
                ...(symbol && { symbol })
            },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        return results.map((r: any) => ({
            ...r,
            trades: JSON.parse(r.trades),
            equityCurve: r.equityCurve ? JSON.parse(r.equityCurve) : undefined,
            parameters: r.parameters ? JSON.parse(r.parameters) : undefined
        }));
    }

    // ============================================================================
    // ERROR LOGGING
    // ============================================================================

    /**
     * Log error for monitoring
     */
    async logError(error: {
        level: string;
        source: string;
        message: string;
        stackTrace?: string;
        userId?: number;
        symbol?: string;
        metadata?: Record<string, any>;
    }) {
        return await this.prisma.errorLog.create({
            data: {
                ...error,
                metadata: error.metadata ? JSON.stringify(error.metadata) : undefined
            }
        });
    }

    /**
     * Get recent errors
     */
    async getRecentErrors(limit: number = 50) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore Prisma client type generation issue
        return await this.prisma.errorLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit
        });
    }

    // ============================================================================
    // UTILITY
    // ============================================================================

    /**
     * Cleanup old data
     */
    async cleanupOldData(daysToKeep: number = 90) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        await this.prisma.$transaction([
            // Keep trades for historical analysis
            // this.prisma.trade.deleteMany({ where: { createdAt: { lt: cutoffDate } } }),

            // Cleanup old historical data cache
            this.prisma.historicalData.deleteMany({
                where: { createdAt: { lt: cutoffDate } }
            }),

            // Cleanup old error logs
            this.prisma.errorLog.deleteMany({
                where: { createdAt: { lt: cutoffDate } }
            })
        ]);
    }

    /**
     * Disconnect from database
     */
    async disconnect() {
        await this.prisma.$disconnect();
    }
}

// Export singleton instance
export const db = new DatabaseService();
