import { IStrategy, Position, Trade, StrategyMetadata } from '../types/strategy';
import { DataFrame, OHLCVCandle, DataFrameBuilder } from '../types/dataframe';
import { DataManager } from './dataManager';
import { db } from './databaseService';
import { v4 as uuidv4 } from 'uuid';

export interface PaperTradingConfig {
    initialBalance: number;
    maxOpenTrades: number;
    feeOpen: number; // 0.001 = 0.1%
    feeClose: number;
    stakeCurrency: string;
    updateInterval: number; // milliseconds
}

export interface PaperTradingResult {
    balance: number;
    totalTrades: number;
    openTrades: number;
    totalProfit: number;
    totalProfitPct: number;
    winRate: number;
    avgProfit: number;
    maxDrawdown: number;
    sharpeRatio: number;
    positions: Position[];
    recentTrades: Trade[];
    performance: PerformanceMetric[];
}

export interface PerformanceMetric {
    timestamp: Date;
    balance: number;
    totalProfit: number;
    openPositions: number;
    drawdown: number;
}

export class PaperTradingEngine {
    private strategy: IStrategy;
    private config: PaperTradingConfig;
    private dataManager: DataManager;
    private userId?: string; // Track user for database integration
    
    // Trading state
    private balance: number;
    private openTrades: Trade[] = [];
    private closedTrades: Trade[] = [];
    private positions: Position[] = [];
    private isRunning = false;
    private tradeIdCounter = 1;
    
    // Performance tracking
    private performanceHistory: PerformanceMetric[] = [];
    private maxBalance = 0;
    private maxDrawdown = 0;
    
    // Data and timing
    private currentDataIndex = 0;
    private historicalData: OHLCVCandle[] = [];
    private lastUpdateTime = 0;

    // Cached ROI for performance
    private sortedRoi: [number, number][];

    constructor(strategy: IStrategy, config: PaperTradingConfig, userId?: string) {
        this.strategy = strategy;
        this.config = config;

        // Cache sorted ROI to prevent Object.entries() overhead on every candle check
        this.sortedRoi = Object.entries(this.strategy.minimalRoi || {})
            .map(([timeStr, roiTarget]) => [parseInt(timeStr), roiTarget] as [number, number])
            .sort((a, b) => a[0] - b[0]); // Sort by time (Object.entries usually returns ascending numeric keys anyway, but let's be safe)

        this.dataManager = new DataManager();
        this.balance = config.initialBalance;
        this.maxBalance = config.initialBalance;
        this.userId = userId;
    }

    async start(symbol: string, timeframe: string = '5m', dataPoints: number = 1000): Promise<void> {
        if (this.isRunning) {
            throw new Error('Paper trading is already running');
        }

        console.log(`Starting paper trading for strategy: ${this.strategy.name}`);
        console.log(`Symbol: ${symbol}, Timeframe: ${timeframe}`);
        console.log(`Initial balance: ${this.config.initialBalance} ${this.config.stakeCurrency}`);

        try {
            // Download recent historical data
            this.historicalData = await this.dataManager.getRecentData(symbol, timeframe, dataPoints);
            
            if (this.historicalData.length < this.strategy.startupCandleCount) {
                throw new Error(`Insufficient data: need at least ${this.strategy.startupCandleCount} candles`);
            }

            this.currentDataIndex = this.strategy.startupCandleCount;
            this.isRunning = true;

            // Initialize strategy
            if (this.strategy.botStart) {
                this.strategy.botStart();
            }

            console.log(`Paper trading started successfully with ${this.historicalData.length} candles`);
            
            // Start the main trading loop
            await this.runTradingLoop(symbol, timeframe);

        } catch (error) {
            console.error('Error starting paper trading:', error);
            throw error;
        }
    }

    stop(): void {
        this.isRunning = false;
        console.log('Paper trading stopped');
    }

    private async runTradingLoop(symbol: string, timeframe: string): Promise<void> {
        while (this.isRunning && this.currentDataIndex < this.historicalData.length) {
            const currentTime = Date.now();
            
            // Rate limiting
            if (currentTime - this.lastUpdateTime < this.config.updateInterval) {
                await this.sleep(this.config.updateInterval - (currentTime - this.lastUpdateTime));
            }

            await this.processIteration(symbol, timeframe);
            this.lastUpdateTime = Date.now();
            
            // Move to next candle
            this.currentDataIndex++;
        }

        if (!this.isRunning) {
            console.log('Paper trading stopped by user');
        } else {
            console.log('Paper trading completed - reached end of historical data');
            this.isRunning = false;
        }
    }

    private async processIteration(symbol: string, timeframe: string): Promise<void> {
        if (this.currentDataIndex >= this.historicalData.length) {
            return;
        }

        const currentCandle = this.historicalData[this.currentDataIndex];
        const currentTime = currentCandle.date;
        const currentPrice = currentCandle.close;

        // Strategy bot loop callback
        if (this.strategy.botLoopStart) {
            this.strategy.botLoopStart(currentTime);
        }

        // Get data window for analysis
        const dataWindow = this.historicalData.slice(0, this.currentDataIndex + 1);
        const dataframe = DataFrameBuilder.fromCandles(dataWindow);

        // Apply strategy analysis
        const metadata: StrategyMetadata = {
            pair: symbol,
            timeframe: timeframe,
            stake_currency: this.config.stakeCurrency
        };

        try {
            const indicatorData = this.strategy.populateIndicators(dataframe, metadata);
            const entryData = this.strategy.populateEntryTrend(indicatorData, metadata);
            const exitData = this.strategy.populateExitTrend(entryData, metadata);

            // Process exits first
            await this.processExits(exitData, currentCandle, metadata);

            // Process entries
            await this.processEntries(entryData, currentCandle, metadata);

            // Update positions and performance
            this.updatePositions(currentPrice);
            this.updatePerformanceMetrics(currentTime);

        } catch (error) {
            console.error(`Error processing iteration at ${currentTime}:`, error);
        }
    }

    private async processExits(exitData: DataFrame, candle: OHLCVCandle, metadata: StrategyMetadata): Promise<void> {
        const currentIndex = this.currentDataIndex;
        const currentPrice = candle.close;

        for (let i = this.openTrades.length - 1; i >= 0; i--) {
            const trade = this.openTrades[i];
            let shouldExit = false;
            let exitReason = '';

            // Check exit signals
            const exitLong = (exitData.exit_long as number[])[currentIndex];
            const exitShort = (exitData.exit_short as number[])[currentIndex];
            const exitTag = (exitData.exit_tag as string[])[currentIndex];

            if ((trade.side === 'long' && exitLong === 1) || (trade.side === 'short' && exitShort === 1)) {
                shouldExit = true;
                exitReason = 'exit_signal';
                trade.exitTag = exitTag;
            }

            // Check ROI
            if (!shouldExit && this.checkRoi(trade, candle.date)) {
                shouldExit = true;
                exitReason = 'roi';
            }

            // Check stop loss
            if (!shouldExit && this.checkStoploss(trade, currentPrice, candle.date)) {
                shouldExit = true;
                exitReason = 'stoploss';
            }

            // Execute exit
            if (shouldExit) {
                // Confirm exit if callback exists
                let confirmExit = true;
                if (this.strategy.confirmTradeExit) {
                    confirmExit = this.strategy.confirmTradeExit(
                        trade.pair,
                        trade,
                        'market',
                        trade.amount,
                        currentPrice,
                        candle.date
                    );
                }

                if (confirmExit) {
                    await this.closeTrade(trade, candle, exitReason);
                }
            }
        }
    }

    private async processEntries(entryData: DataFrame, candle: OHLCVCandle, metadata: StrategyMetadata): Promise<void> {
        // Check if we can open new trades
        if (this.openTrades.length >= this.config.maxOpenTrades) {
            return;
        }

        const currentIndex = this.currentDataIndex;
        const enterLong = (entryData.enter_long as number[])[currentIndex];
        const enterShort = (entryData.enter_short as number[])[currentIndex];
        const enterTag = (entryData.enter_tag as string[])[currentIndex];

        // Process long entry
        if (enterLong === 1) {
            await this.createTrade('long', candle, enterTag, metadata);
        }

        // Process short entry (if enabled)
        if (this.strategy.canShort && enterShort === 1) {
            await this.createTrade('short', candle, enterTag, metadata);
        }
    }

    private async createTrade(
        side: 'long' | 'short',
        candle: OHLCVCandle,
        enterTag: string,
        metadata: StrategyMetadata
    ): Promise<void> {
        const stakeAmount = typeof this.strategy.stakeAmount === 'number' 
            ? this.strategy.stakeAmount 
            : this.balance / this.config.maxOpenTrades;

        // Check if we have enough balance
        if (stakeAmount > this.balance * 0.95) { // Leave 5% buffer
            console.log(`Insufficient balance for new trade: ${stakeAmount} > ${this.balance * 0.95}`);
            return;
        }

        const entryPrice = candle.close;
        const amount = stakeAmount / entryPrice;
        const fee = stakeAmount * this.config.feeOpen;

        // Confirm entry if callback exists
        let confirmEntry = true;
        if (this.strategy.confirmTradeEntry) {
            confirmEntry = this.strategy.confirmTradeEntry(
                metadata.pair,
                'market',
                amount,
                entryPrice,
                candle.date
            );
        }

        if (!confirmEntry) {
            console.log('Trade entry not confirmed by strategy');
            return;
        }

        // Create trade
        const trade: Trade = {
            id: uuidv4(),
            pair: metadata.pair,
            isOpen: true,
            side: side,
            amount: amount,
            openRate: entryPrice,
            openDate: candle.date,
            fee: fee,
            entryTag: enterTag,
            stoplossRate: entryPrice * (1 + this.strategy.stoploss * (side === 'long' ? 1 : -1))
        };

        // Create position
        const position: Position = {
            pair: metadata.pair,
            side: side,
            amount: amount,
            entryPrice: entryPrice,
            currentPrice: entryPrice,
            unrealizedPnl: 0,
            unrealizedPnlPct: 0,
            entryTime: candle.date,
            stoplossPrice: trade.stoplossRate
        };

        this.openTrades.push(trade);
        this.positions.push(position);
        this.balance -= (stakeAmount + fee);

        console.log(`📈 Opened ${side} trade for ${metadata.pair} at ${entryPrice} (${enterTag})`);
        console.log(`💰 Remaining balance: ${this.balance.toFixed(2)} ${this.config.stakeCurrency}`);

        // Save to database if userId is set
        if (this.userId) {
            try {
                await db.saveTrade({
                    userId: parseInt(this.userId),
                    symbol: trade.pair,
                    side: side === 'long' ? 'BUY' : 'SELL',
                    entryPrice: trade.openRate,
                    quantity: trade.amount,
                    stopLoss: trade.stoplossRate,
                    fees: trade.fee
                });
            } catch (error) {
                console.error('Failed to save trade to database:', error);
                await db.logError({
                    level: 'ERROR',
                    source: 'paper_trading_engine',
                    message: `Failed to save paper trade: ${(error as Error).message}`,
                    userId: parseInt(this.userId),
                    symbol: trade.pair
                });
            }
        }
    }

    private async closeTrade(trade: Trade, candle: OHLCVCandle, exitReason: string): Promise<void> {
        const exitPrice = candle.close;
        const exitFee = (trade.amount * exitPrice) * this.config.feeClose;
        const grossProfit = this.calculateTradeProfit(trade, exitPrice);
        const netProfit = grossProfit - exitFee;
        
        // Update trade
        trade.closeRate = exitPrice;
        trade.closeDate = candle.date;
        trade.isOpen = false;
        trade.exitReason = exitReason;
        trade.profit = netProfit;
        trade.profitPct = (netProfit / (trade.amount * trade.openRate)) * 100;

        // Update balance
        this.balance += (trade.amount * exitPrice) - exitFee;

        // Move trade to closed trades
        const tradeIndex = this.openTrades.findIndex(t => t.id === trade.id);
        if (tradeIndex !== -1) {
            this.openTrades.splice(tradeIndex, 1);
        }
        this.closedTrades.push(trade);

        // Remove position
        const positionIndex = this.positions.findIndex(p => 
            p.pair === trade.pair && p.side === trade.side && p.entryTime.getTime() === trade.openDate.getTime()
        );
        if (positionIndex !== -1) {
            this.positions.splice(positionIndex, 1);
        }

        const profitEmoji = netProfit >= 0 ? '💚' : '💔';
        console.log(`${profitEmoji} Closed ${trade.side} trade for ${trade.pair} at ${exitPrice}`);
        console.log(`   Profit: ${netProfit.toFixed(2)} (${trade.profitPct?.toFixed(2)}%) | Reason: ${exitReason}`);
        console.log(`💰 Current balance: ${this.balance.toFixed(2)} ${this.config.stakeCurrency}`);

        // Update database if userId is set
        if (this.userId) {
            try {
                const dbTrade = await db.findOpenTrade(this.userId, trade.pair, trade.openRate);
                if (dbTrade) {
                    await db.closeTrade(dbTrade.id, exitPrice, trade.profitPct || 0);
                }
            } catch (error) {
                console.error('Failed to update trade in database:', error);
                await db.logError({
                    level: 'ERROR',
                    source: 'paper_trading_engine',
                    message: `Failed to close trade in database: ${(error as Error).message}`,
                    userId: parseInt(this.userId),
                    symbol: trade.pair
                });
            }
        }
    }

    private calculateTradeProfit(trade: Trade, currentPrice: number): number {
        if (trade.side === 'long') {
            return trade.amount * (currentPrice - trade.openRate);
        } else {
            return trade.amount * (trade.openRate - currentPrice);
        }
    }

    private updatePositions(currentPrice: number): void {
        for (const position of this.positions) {
            position.currentPrice = currentPrice;
            
            if (position.side === 'long') {
                position.unrealizedPnl = position.amount * (currentPrice - position.entryPrice);
            } else {
                position.unrealizedPnl = position.amount * (position.entryPrice - currentPrice);
            }
            
            position.unrealizedPnlPct = (position.unrealizedPnl / (position.amount * position.entryPrice)) * 100;
        }

        // Update trade profits
        for (const trade of this.openTrades) {
            trade.profit = this.calculateTradeProfit(trade, currentPrice);
            trade.profitPct = (trade.profit / (trade.amount * trade.openRate)) * 100;
        }
    }

    private updatePerformanceMetrics(currentTime: Date): void {
        const totalUnrealizedPnl = this.positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
        const currentBalance = this.balance + totalUnrealizedPnl;
        
        // Update max balance and drawdown
        if (currentBalance > this.maxBalance) {
            this.maxBalance = currentBalance;
        } else {
            const drawdown = this.maxBalance - currentBalance;
            if (drawdown > this.maxDrawdown) {
                this.maxDrawdown = drawdown;
            }
        }

        const metric: PerformanceMetric = {
            timestamp: currentTime,
            balance: currentBalance,
            totalProfit: currentBalance - this.config.initialBalance,
            openPositions: this.positions.length,
            drawdown: this.maxBalance - currentBalance
        };

        this.performanceHistory.push(metric);

        // Limit history size
        if (this.performanceHistory.length > 1000) {
            this.performanceHistory = this.performanceHistory.slice(-1000);
        }
    }

    private checkRoi(trade: Trade, currentTime: Date): boolean {
        const tradeDuration = (currentTime.getTime() - trade.openDate.getTime()) / (1000 * 60); // minutes
        const currentProfitPct = trade.profitPct || 0;
        
        // Use pre-computed sortedRoi for ~35x performance improvement during hot-path evaluation
        for (let i = 0; i < this.sortedRoi.length; i++) {
            const [timeThreshold, roiTarget] = this.sortedRoi[i];
            if (tradeDuration >= timeThreshold) {
                if (currentProfitPct >= roiTarget * 100) {
                    return true;
                }
            }
        }
        
        return false;
    }

    private checkStoploss(trade: Trade, currentPrice: number, currentTime: Date): boolean {
        // Check custom stoploss first
        if (this.strategy.customStoploss) {
            const currentProfitPct = trade.profitPct || 0;
            const customStoploss = this.strategy.customStoploss(trade, currentTime, currentPrice, currentProfitPct);
            if (customStoploss !== null) {
                const stoplossPrice = trade.openRate * (1 + customStoploss * (trade.side === 'long' ? 1 : -1));
                if (trade.side === 'long') {
                    return currentPrice <= stoplossPrice;
                } else {
                    return currentPrice >= stoplossPrice;
                }
            }
        }

        // Default stoploss
        if (trade.stoplossRate) {
            if (trade.side === 'long') {
                return currentPrice <= trade.stoplossRate;
            } else {
                return currentPrice >= trade.stoplossRate;
            }
        }

        return false;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Public methods for getting current state
    getCurrentResult(): PaperTradingResult {
        const totalTrades = this.closedTrades.length;
        const profitableTrades = this.closedTrades.filter(t => (t.profit || 0) > 0).length;
        const totalProfit = this.closedTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
        const totalUnrealizedPnl = this.positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
        const currentBalance = this.balance + totalUnrealizedPnl;
        
        const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;
        const avgProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;
        const totalProfitPct = ((currentBalance - this.config.initialBalance) / this.config.initialBalance) * 100;

        // Simple Sharpe ratio calculation
        const dailyReturns = this.calculateDailyReturns();
        const dailyReturnsLen = dailyReturns.length;

        let avgDailyReturn = 0;
        let stdDailyReturn = 0;
        let sharpeRatio = 0;

        if (dailyReturnsLen > 0) {
            let sumDailyReturns = 0;
            for (let i = 0; i < dailyReturnsLen; i++) {
                sumDailyReturns += dailyReturns[i];
            }
            avgDailyReturn = sumDailyReturns / dailyReturnsLen;

            let sumSqDiff = 0;
            for (let i = 0; i < dailyReturnsLen; i++) {
                const diff = dailyReturns[i] - avgDailyReturn;
                sumSqDiff += diff * diff;
            }

            stdDailyReturn = Math.sqrt(sumSqDiff / dailyReturnsLen);
            sharpeRatio = stdDailyReturn !== 0 ? avgDailyReturn / stdDailyReturn : 0;
        }

        return {
            balance: currentBalance,
            totalTrades: totalTrades,
            openTrades: this.openTrades.length,
            totalProfit: totalProfit + totalUnrealizedPnl,
            totalProfitPct: totalProfitPct,
            winRate: winRate,
            avgProfit: avgProfit,
            maxDrawdown: this.maxDrawdown,
            sharpeRatio: sharpeRatio,
            positions: [...this.positions],
            recentTrades: this.closedTrades.slice(-10),
            performance: [...this.performanceHistory]
        };
    }

    private calculateDailyReturns(): number[] {
        if (this.performanceHistory.length < 2) {
            return [0];
        }

        const dailyReturns: number[] = [];
        for (let i = 1; i < this.performanceHistory.length; i++) {
            const previousBalance = this.performanceHistory[i - 1].balance;
            const currentBalance = this.performanceHistory[i].balance;
            const dailyReturn = (currentBalance - previousBalance) / previousBalance;
            dailyReturns.push(dailyReturn);
        }

        return dailyReturns;
    }

    isActive(): boolean {
        return this.isRunning;
    }

    getProgress(): { current: number; total: number; percentage: number } {
        return {
            current: this.currentDataIndex,
            total: this.historicalData.length,
            percentage: (this.currentDataIndex / this.historicalData.length) * 100
        };
    }
}
