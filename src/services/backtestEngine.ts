import { DataFrame, DataFrameBuilder, OHLCVCandle } from '../types/dataframe';
import { IStrategy, Trade, BacktestConfig, BacktestResult, StrategyMetadata } from '../types/strategy';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export class BacktestEngine {
    private strategy: IStrategy;
    private config: BacktestConfig;
    private sortedRoi: [number, number][];

    constructor(strategy: IStrategy, config: BacktestConfig) {
        this.strategy = strategy;
        this.config = config;

        // Cache sorted ROI to prevent Object.entries() overhead on every candle check
        this.sortedRoi = Object.entries(this.strategy.minimalRoi || {})
            .map(([timeStr, roiTarget]) => [parseInt(timeStr), roiTarget] as [number, number])
            .sort((a, b) => a[0] - b[0]);
    }

    async runBacktest(data: OHLCVCandle[]): Promise<BacktestResult> {
        logger.info(`Starting backtest for strategy: ${this.strategy.name}`);
        logger.info(`Time range: ${this.config.timerange}`);
        logger.info(`Timeframe: ${this.config.timeframe}`);
        logger.info(`Starting balance: ${this.config.startingBalance}`);

        // Convert candles to DataFrame
        const dataframe = DataFrameBuilder.fromCandles(data);

        // Populate indicators
        const metadata: StrategyMetadata = {
            pair: 'BTCUSDT', // TODO: Make this configurable
            timeframe: this.config.timeframe,
            stake_currency: 'USDT'
        };

        const indicatorData = this.strategy.populateIndicators(dataframe, metadata);
        const entryData = this.strategy.populateEntryTrend(indicatorData, metadata);
        const exitData = this.strategy.populateExitTrend(entryData, metadata);

        // Initialize backtest state
        const balance = this.config.startingBalance;
        const trades: Trade[] = [];
        const openTrades: Trade[] = [];
        const tradeIdCounter = 1;

        // Track performance metrics
        let maxBalance = balance;
        let minBalance = balance;
        let maxDrawdown = 0;
        let maxDrawdownPct = 0;

        // Strategy callbacks
        if (this.strategy.botStart) {
            this.strategy.botStart();
        }

        // Main backtest loop
        for (let i = this.strategy.startupCandleCount; i < data.length; i++) {
            const currentCandle = data[i];
            const currentTime = currentCandle.date;
            const currentPrice = currentCandle.close;

            // Bot loop start callback
            if (this.strategy.botLoopStart) {
                this.strategy.botLoopStart(currentTime);
            }

            // Process exits first
            await this.processExits(openTrades, trades, exitData, i, currentCandle, balance);

            // Process entries
            await this.processEntries(openTrades, entryData, i, currentCandle, balance, tradeIdCounter, metadata);

            // Update trade profits
            this.updateTradesProfits(openTrades, currentPrice);

            // Update balance for open trades
            const totalUnrealizedPnl = openTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);
            const currentBalance = balance + totalUnrealizedPnl;

            // Track drawdown
            if (currentBalance > maxBalance) {
                maxBalance = currentBalance;
            } else {
                const drawdown = maxBalance - currentBalance;
                const drawdownPct = (drawdown / maxBalance) * 100;
                if (drawdown > maxDrawdown) {
                    maxDrawdown = drawdown;
                    maxDrawdownPct = drawdownPct;
                }
            }

            if (currentBalance < minBalance) {
                minBalance = currentBalance;
            }
        }

        // Close any remaining open trades
        for (const trade of openTrades) {
            this.closeTrade(trade, data[data.length - 1], 'backtest_end');
            trades.push(trade);
        }

        // Calculate final results
        return this.calculateResults(trades, balance, this.config.startingBalance, maxDrawdown, maxDrawdownPct, data);
    }

    private async processExits(
        openTrades: Trade[],
        allTrades: Trade[],
        exitData: DataFrame,
        index: number,
        candle: OHLCVCandle,
        balance: number
    ): Promise<void> {
        const currentPrice = candle.close;
        const exitLong = (exitData.exit_long as number[] || [])[index];
        const exitShort = (exitData.exit_short as number[] || [])[index];
        const exitTag = (exitData.exit_tag as string[] || [])[index];

        for (let j = openTrades.length - 1; j >= 0; j--) {
            const trade = openTrades[j];
            const currentProfit = this.calculateTradeProfit(trade, currentPrice);
            const currentProfitPct = (currentProfit / (trade.amount * trade.openRate)) * 100;

            let shouldExit = false;
            let exitReason = '';

            // Check exit signals
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
            if (!shouldExit && this.checkStoploss(trade, currentPrice, candle.date, currentProfitPct)) {
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
                    this.closeTrade(trade, candle, exitReason);
                    allTrades.push(trade);
                    openTrades.splice(j, 1);
                }
            }
        }
    }

    private async processEntries(
        openTrades: Trade[],
        entryData: DataFrame,
        index: number,
        candle: OHLCVCandle,
        balance: number,
        tradeIdCounter: number,
        metadata: StrategyMetadata
    ): Promise<void> {
        // Check if we can open new trades
        if (openTrades.length >= this.config.maxOpenTrades) {
            return;
        }

        const enterLong = (entryData.enter_long as number[])[index];
        const enterShort = (entryData.enter_short as number[])[index];
        const enterTag = (entryData.enter_tag as string[])[index];

        // Process long entry
        if (enterLong === 1) {
            await this.createTrade('long', candle, enterTag, balance, tradeIdCounter, openTrades, metadata);
        }

        // Process short entry (if enabled)
        if (this.strategy.canShort && enterShort === 1) {
            await this.createTrade('short', candle, enterTag, balance, tradeIdCounter, openTrades, metadata);
        }
    }

    private async createTrade(
        side: 'long' | 'short',
        candle: OHLCVCandle,
        enterTag: string,
        balance: number,
        tradeIdCounter: number,
        openTrades: Trade[],
        metadata: StrategyMetadata
    ): Promise<void> {
        const stakeAmount = typeof this.strategy.stakeAmount === 'number'
            ? this.strategy.stakeAmount
            : balance / this.config.maxOpenTrades;

        // Check if we have enough balance
        if (stakeAmount > balance * 0.95) { // Leave 5% buffer
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
            return;
        }

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

        openTrades.push(trade);
        logger.info(`Opened ${side} trade for ${metadata.pair} at ${entryPrice} with tag: ${enterTag}`);
    }

    private closeTrade(trade: Trade, candle: OHLCVCandle, exitReason: string): void {
        const exitPrice = candle.close;
        const exitFee = (trade.amount * exitPrice) * this.config.feeClose;

        trade.closeRate = exitPrice;
        trade.closeDate = candle.date;
        trade.isOpen = false;
        trade.exitReason = exitReason;
        trade.profit = this.calculateTradeProfit(trade, exitPrice) - exitFee;
        trade.profitPct = (trade.profit / (trade.amount * trade.openRate)) * 100;

        logger.info(`Closed ${trade.side} trade for ${trade.pair} at ${exitPrice}, profit: ${trade.profit?.toFixed(2)} (${trade.profitPct?.toFixed(2)}%)`);
    }

    private calculateTradeProfit(trade: Trade, currentPrice: number): number {
        if (trade.side === 'long') {
            return trade.amount * (currentPrice - trade.openRate);
        } else {
            return trade.amount * (trade.openRate - currentPrice);
        }
    }

    private updateTradesProfits(openTrades: Trade[], currentPrice: number): void {
        for (const trade of openTrades) {
            trade.profit = this.calculateTradeProfit(trade, currentPrice);
            trade.profitPct = (trade.profit / (trade.amount * trade.openRate)) * 100;
        }
    }

    private checkRoi(trade: Trade, currentTime: Date): boolean {
        const tradeDuration = (currentTime.getTime() - trade.openDate.getTime()) / (1000 * 60); // minutes
        const currentProfitPct = trade.profitPct || 0;

        // Use pre-computed sortedRoi for performance improvement during hot-path evaluation
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

    private checkStoploss(trade: Trade, currentPrice: number, currentTime: Date, currentProfitPct: number): boolean {
        // Check custom stoploss first
        if (this.strategy.customStoploss) {
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

    private calculateResults(
        trades: Trade[],
        finalBalance: number,
        startingBalance: number,
        maxDrawdown: number,
        maxDrawdownPct: number,
        data: OHLCVCandle[]
    ): BacktestResult {
        const totalTrades = trades.length;

        let profitableTrades = 0;
        let totalProfit = 0;
        let totalDuration = 0;
        let durationCount = 0;

        let bestTrade: Trade | null = null;
        let worstTrade: Trade | null = null;

        let sumPositiveReturns = 0;
        let countPositiveReturns = 0;
        let sumNegativeReturns = 0;
        let countNegativeReturns = 0;

        // ⚡ Bolt Optimization: Replace multiple array traversals (.reduce, .filter, .map)
        // with a single O(N) pass for calculating core aggregate metrics.
        for (let i = 0; i < totalTrades; i++) {
            const current = trades[i];
            const pnl = current.profit || 0;

            totalProfit += pnl;

            if (pnl > 0) {
                profitableTrades++;
                sumPositiveReturns += pnl;
                countPositiveReturns++;
            } else if (pnl < 0) {
                sumNegativeReturns += pnl;
                countNegativeReturns++;
            }

            if (current.closeDate) {
                totalDuration += current.closeDate.getTime() - current.openDate.getTime();
                durationCount++;
            }

            if (!bestTrade || pnl > (bestTrade.profit || -Infinity)) bestTrade = current;
            if (!worstTrade || pnl < (worstTrade.profit || Infinity)) worstTrade = current;
        }

        const lossTrades = totalTrades - profitableTrades;
        const totalProfitPct = (totalProfit / startingBalance) * 100;
        const avgProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;
        const avgProfitPct = totalTrades > 0 ? totalProfitPct / totalTrades : 0;
        const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;

        const avgTradeDuration = durationCount > 0 ? (totalDuration / durationCount) / (1000 * 60) : 0;
        const avgPositiveReturn = countPositiveReturns > 0 ? sumPositiveReturns / countPositiveReturns : 0;
        const avgNegativeReturn = countNegativeReturns > 0 ? sumNegativeReturns / countNegativeReturns : 0;
        const profitFactor = avgNegativeReturn !== 0 ? Math.abs(avgPositiveReturn / avgNegativeReturn) : 0;

        // Simple Sharpe ratio calculation (using daily returns)
        const dailyReturns = this.calculateDailyReturns(trades, data);
        const dailyReturnsLen = dailyReturns.length;

        let avgDailyReturn = 0;
        let stdDailyReturn = 0;
        let downsideStd = 0;
        let sharpeRatio = 0;
        let sortinoRatio = 0;

        if (dailyReturnsLen > 0) {
            // Calculate sum for average
            let sumDailyReturns = 0;
            let downsideSumSq = 0;
            let downsideCount = 0;

            for (let i = 0; i < dailyReturnsLen; i++) {
                const r = dailyReturns[i];
                sumDailyReturns += r;
                if (r < 0) {
                    downsideSumSq += r * r;
                    downsideCount++;
                }
            }

            avgDailyReturn = sumDailyReturns / dailyReturnsLen;

            // Calculate standard deviation and sortino
            let sumSqDiff = 0;
            for (let i = 0; i < dailyReturnsLen; i++) {
                const diff = dailyReturns[i] - avgDailyReturn;
                sumSqDiff += diff * diff;
            }

            stdDailyReturn = Math.sqrt(sumSqDiff / dailyReturnsLen);
            sharpeRatio = stdDailyReturn !== 0 ? avgDailyReturn / stdDailyReturn : 0;

            downsideStd = downsideCount > 0 ? Math.sqrt(downsideSumSq / downsideCount) : 0;
            sortinoRatio = downsideStd !== 0 ? avgDailyReturn / downsideStd : 0;
        }

        // Calmar ratio (return / max drawdown)
        const calmarRatio = maxDrawdownPct !== 0 ? totalProfitPct / maxDrawdownPct : 0;

        return {
            trades,
            finalBalance: startingBalance + totalProfit,
            totalTrades,
            profitableTrades,
            lossTrades,
            totalProfit,
            totalProfitPct,
            avgProfit,
            avgProfitPct,
            maxDrawdown,
            maxDrawdownPct,
            sharpeRatio,
            winRate,
            avgTradeDuration,
            bestTrade,
            worstTrade,
            calmarRatio,
            sortinoRatio,
            profitFactor,
            startDate: data[0].date,
            endDate: data[data.length - 1].date
        };
    }

    private calculateDailyReturns(trades: Trade[], data: OHLCVCandle[]): number[] {
        // Simple daily returns calculation based on cumulative profits
        const dailyReturns: number[] = [];
        let cumulativeProfit = 0;
        let previousCumulativeProfit = 0;

        // ⚡ Bolt Optimization: Group profits per day directly to avoid creating
        // intermediate arrays, array.reduce, and expensive string parsing.
        // Math.floor(timestamp / 86400000) is a fast way to get a unique integer for UTC day.
        const dayProfits = new Map<number, number>();

        for (let i = 0; i < trades.length; i++) {
            const trade = trades[i];
            if (!trade.closeDate) continue;

            // Unique integer per UTC day (86400000 ms = 1 day)
            const dayKey = Math.floor(trade.closeDate.getTime() / 86400000);

            const currentProfit = dayProfits.get(dayKey) || 0;
            dayProfits.set(dayKey, currentProfit + (trade.profit || 0));
        }

        // The Map preserves insertion order, so we can iterate its values
        for (const dayProfit of dayProfits.values()) {
            cumulativeProfit += dayProfit;
            const dailyReturn = cumulativeProfit - previousCumulativeProfit;
            dailyReturns.push(dailyReturn);
            previousCumulativeProfit = cumulativeProfit;
        }

        return dailyReturns;
    }
}
