import { DataFrame, DataFrameBuilder, OHLCVCandle } from '../types/dataframe';
import { IStrategy, Trade, BacktestConfig, BacktestResult, StrategyMetadata } from '../types/strategy';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

interface EquityPoint {
    date: Date;
    equity: number;
}

export class BacktestEngine {
    private strategy: IStrategy;
    private config: BacktestConfig;
    private sortedRoi: [number, number][];

    constructor(strategy: IStrategy, config: BacktestConfig) {
        this.strategy = strategy;
        this.config = config;
        this.sortedRoi = Object.entries(this.strategy.minimalRoi || {})
            .map(([timeStr, roiTarget]) => [parseInt(timeStr), roiTarget] as [number, number])
            .sort((a, b) => a[0] - b[0]);
    }

    async runBacktest(data: OHLCVCandle[]): Promise<BacktestResult> {
        if (data.length === 0) {
            throw new Error('Backtest requires at least one candle');
        }

        logger.info(`Starting backtest for strategy: ${this.strategy.name}`);
        logger.info(`Time range: ${this.config.timerange}`);
        logger.info(`Timeframe: ${this.config.timeframe}`);
        logger.info(`Starting balance: ${this.config.startingBalance}`);

        const dataframe = DataFrameBuilder.fromCandles(data);
        const metadata: StrategyMetadata = {
            pair: 'BTCUSDT',
            timeframe: this.config.timeframe,
            stake_currency: 'USDT'
        };

        const indicatorData = this.strategy.populateIndicators(dataframe, metadata);
        const entryData = this.strategy.populateEntryTrend(indicatorData, metadata);
        const exitData = this.strategy.populateExitTrend(entryData, metadata);

        // P0: this is realized account equity, not a constant starting balance.
        let balance = this.config.startingBalance;
        const trades: Trade[] = [];
        const openTrades: Trade[] = [];
        const equityCurve: EquityPoint[] = [];

        let maxBalance = balance;
        let maxDrawdown = 0;
        let maxDrawdownPct = 0;

        const recordEquity = (date: Date, equity: number): void => {
            equityCurve.push({ date, equity });
            if (equity > maxBalance) {
                maxBalance = equity;
                return;
            }

            const drawdown = maxBalance - equity;
            const drawdownPct = maxBalance > 0 ? (drawdown / maxBalance) * 100 : 0;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
                maxDrawdownPct = drawdownPct;
            }
        };

        if (this.strategy.botStart) {
            this.strategy.botStart();
        }

        // Signals are computed from a completed candle and may only execute on
        // the next candle. Record pre-execution candles at flat equity so daily
        // return sampling also contains the warm-up period.
        const firstExecutionIndex = Math.min(data.length, this.strategy.startupCandleCount + 1);
        for (let i = 0; i < firstExecutionIndex; i++) {
            recordEquity(data[i].date, balance);
        }

        for (let i = this.strategy.startupCandleCount + 1; i < data.length; i++) {
            const currentCandle = data[i];
            const currentTime = currentCandle.date;
            const signalIndex = i - 1;

            if (this.strategy.botLoopStart) {
                this.strategy.botLoopStart(currentTime);
            }

            // A signal generated at close(t) executes no earlier than open(t+1).
            balance += await this.processSignalExits(
                openTrades,
                trades,
                exitData,
                signalIndex,
                currentCandle
            );

            balance -= await this.processEntries(
                openTrades,
                entryData,
                signalIndex,
                currentCandle,
                balance,
                metadata
            );

            // Stops / ROI are evaluated against the full OHLC range after the
            // opening-auction executions above. If both are hit inside the same
            // candle and path ordering is unknown, stop-loss wins conservatively.
            balance += await this.processIntrabarExits(openTrades, trades, currentCandle);

            this.updateTradesProfits(openTrades, currentCandle.close);
            const totalUnrealizedPnl = openTrades.reduce(
                (sum, trade) => sum + this.calculateTradeProfit(trade, currentCandle.close),
                0
            );
            recordEquity(currentTime, balance + totalUnrealizedPnl);
        }

        // Close remaining positions and realize their PnL, including both sides' fees.
        for (const trade of openTrades) {
            balance += this.closeTrade(trade, data[data.length - 1].close, data[data.length - 1].date, 'backtest_end');
            trades.push(trade);
        }

        // The exit fee on a forced final close can make final equity lower than the
        // last mark-to-market point, so record it explicitly for drawdown/returns.
        recordEquity(data[data.length - 1].date, balance);

        return this.calculateResults(
            trades,
            balance,
            this.config.startingBalance,
            maxDrawdown,
            maxDrawdownPct,
            data,
            equityCurve
        );
    }

    private async processSignalExits(
        openTrades: Trade[],
        allTrades: Trade[],
        exitData: DataFrame,
        signalIndex: number,
        executionCandle: OHLCVCandle
    ): Promise<number> {
        const exitLong = ((exitData.exit_long as number[]) || [])[signalIndex];
        const exitShort = ((exitData.exit_short as number[]) || [])[signalIndex];
        const exitTag = ((exitData.exit_tag as string[]) || [])[signalIndex];
        const executionPrice = executionCandle.open;
        let realizedPnl = 0;

        for (let j = openTrades.length - 1; j >= 0; j--) {
            const trade = openTrades[j];
            const shouldExit =
                (trade.side === 'long' && exitLong === 1) ||
                (trade.side === 'short' && exitShort === 1);

            if (!shouldExit) continue;

            let confirmExit = true;
            if (this.strategy.confirmTradeExit) {
                confirmExit = this.strategy.confirmTradeExit(
                    trade.pair,
                    trade,
                    'market',
                    trade.amount,
                    executionPrice,
                    executionCandle.date
                );
            }

            if (!confirmExit) continue;

            trade.exitTag = exitTag;
            realizedPnl += this.closeTrade(
                trade,
                executionPrice,
                executionCandle.date,
                'exit_signal'
            );
            allTrades.push(trade);
            openTrades.splice(j, 1);
        }

        return realizedPnl;
    }

    private async processEntries(
        openTrades: Trade[],
        entryData: DataFrame,
        signalIndex: number,
        executionCandle: OHLCVCandle,
        balance: number,
        metadata: StrategyMetadata
    ): Promise<number> {
        if (openTrades.length >= this.config.maxOpenTrades) {
            return 0;
        }

        const enterLong = (entryData.enter_long as number[])[signalIndex];
        const enterShort = (entryData.enter_short as number[])[signalIndex];
        const enterTag = (entryData.enter_tag as string[])[signalIndex];

        let entryFees = 0;

        if (enterLong === 1 && openTrades.length < this.config.maxOpenTrades) {
            entryFees += await this.createTrade('long', executionCandle, enterTag, balance - entryFees, openTrades, metadata);
        }

        if (this.strategy.canShort && enterShort === 1 && openTrades.length < this.config.maxOpenTrades) {
            entryFees += await this.createTrade('short', executionCandle, enterTag, balance - entryFees, openTrades, metadata);
        }

        return entryFees;
    }

    private async createTrade(
        side: 'long' | 'short',
        candle: OHLCVCandle,
        enterTag: string,
        balance: number,
        openTrades: Trade[],
        metadata: StrategyMetadata
    ): Promise<number> {
        const stakeAmount = typeof this.strategy.stakeAmount === 'number'
            ? this.strategy.stakeAmount
            : balance / this.config.maxOpenTrades;

        if (stakeAmount > balance * 0.95) {
            return 0;
        }

        const entryPrice = candle.open;
        const amount = stakeAmount / entryPrice;
        const fee = stakeAmount * this.config.feeOpen;

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

        if (!confirmEntry) return 0;

        const trade: Trade = {
            id: uuidv4(),
            pair: metadata.pair,
            isOpen: true,
            side,
            amount,
            openRate: entryPrice,
            openDate: candle.date,
            fee,
            entryTag: enterTag,
            stoplossRate: entryPrice * (1 + this.strategy.stoploss * (side === 'long' ? 1 : -1))
        };

        openTrades.push(trade);
        logger.info(`Opened ${side} trade for ${metadata.pair} at ${entryPrice} with tag: ${enterTag}`);
        return fee;
    }

    private closeTrade(
        trade: Trade,
        exitPrice: number,
        exitDate: Date,
        exitReason: string
    ): number {
        const exitFee = trade.amount * exitPrice * this.config.feeClose;
        const grossPnl = this.calculateTradeProfit(trade, exitPrice);

        trade.closeRate = exitPrice;
        trade.closeDate = exitDate;
        trade.isOpen = false;
        trade.exitReason = exitReason;

        // P0 invariant: net PnL always includes entry fee AND exit fee.
        trade.profit = grossPnl - trade.fee - exitFee;
        trade.profitPct = (trade.profit / (trade.amount * trade.openRate)) * 100;

        logger.info(
            `Closed ${trade.side} trade for ${trade.pair} at ${exitPrice}, ` +
            `profit: ${trade.profit.toFixed(2)} (${trade.profitPct.toFixed(2)}%)`
        );

        // Entry fee has already reduced realized balance. Only gross PnL minus
        // the exit fee is newly realized at close.
        return grossPnl - exitFee;
    }

    private calculateTradeProfit(trade: Trade, currentPrice: number): number {
        if (trade.side === 'long') {
            return trade.amount * (currentPrice - trade.openRate);
        }
        return trade.amount * (trade.openRate - currentPrice);
    }

    private updateTradesProfits(openTrades: Trade[], currentPrice: number): void {
        for (const trade of openTrades) {
            // Entry fee is already paid and must be visible in mark-to-market equity.
            trade.profit = this.calculateTradeProfit(trade, currentPrice) - trade.fee;
            trade.profitPct = (trade.profit / (trade.amount * trade.openRate)) * 100;
        }
    }

    private async processIntrabarExits(
        openTrades: Trade[],
        allTrades: Trade[],
        candle: OHLCVCandle
    ): Promise<number> {
        let realizedPnl = 0;

        for (let j = openTrades.length - 1; j >= 0; j--) {
            const trade = openTrades[j];
            const openNetPnl = this.calculateTradeProfit(trade, candle.open) - trade.fee;
            const openProfitPct = (openNetPnl / (trade.amount * trade.openRate)) * 100;

            const stopPrice = this.resolveStoplossPrice(
                trade,
                candle.date,
                candle.open,
                openProfitPct
            );
            const roiTarget = this.getActiveRoiTarget(trade, candle.date);
            const roiPrice = roiTarget === null
                ? null
                : this.calculateRoiExitPrice(trade, roiTarget);

            const stopHit = stopPrice !== null && (
                trade.side === 'long'
                    ? candle.low <= stopPrice
                    : candle.high >= stopPrice
            );
            const roiHit = roiPrice !== null && (
                trade.side === 'long'
                    ? candle.high >= roiPrice
                    : candle.low <= roiPrice
            );

            let exitReason: 'stoploss' | 'roi' | null = null;
            let exitPrice = 0;

            // Conservative bar-path rule: when OHLC cannot tell us whether TP or
            // SL occurred first, assume the adverse stop occurred first.
            if (stopHit && stopPrice !== null) {
                exitReason = 'stoploss';
                exitPrice = trade.side === 'long'
                    ? (candle.open <= stopPrice ? candle.open : stopPrice)
                    : (candle.open >= stopPrice ? candle.open : stopPrice);
            } else if (roiHit && roiPrice !== null) {
                exitReason = 'roi';
                exitPrice = trade.side === 'long'
                    ? (candle.open >= roiPrice ? candle.open : roiPrice)
                    : (candle.open <= roiPrice ? candle.open : roiPrice);
            }

            if (!exitReason) continue;

            let confirmExit = true;
            if (this.strategy.confirmTradeExit) {
                confirmExit = this.strategy.confirmTradeExit(
                    trade.pair,
                    trade,
                    'market',
                    trade.amount,
                    exitPrice,
                    candle.date
                );
            }
            if (!confirmExit) continue;

            realizedPnl += this.closeTrade(trade, exitPrice, candle.date, exitReason);
            allTrades.push(trade);
            openTrades.splice(j, 1);
        }

        return realizedPnl;
    }

    private resolveStoplossPrice(
        trade: Trade,
        currentTime: Date,
        currentRate: number,
        currentProfitPct: number
    ): number | null {
        if (this.strategy.customStoploss) {
            const customStoploss = this.strategy.customStoploss(
                trade,
                currentTime,
                currentRate,
                currentProfitPct
            );
            if (customStoploss !== null) {
                return trade.openRate * (
                    1 + customStoploss * (trade.side === 'long' ? 1 : -1)
                );
            }
        }

        return trade.stoplossRate ?? null;
    }

    private getActiveRoiTarget(trade: Trade, currentTime: Date): number | null {
        const tradeDuration = (currentTime.getTime() - trade.openDate.getTime()) / 60_000;
        let activeTarget: number | null = null;

        for (const [timeThreshold, roiTarget] of this.sortedRoi) {
            if (tradeDuration < timeThreshold) break;
            activeTarget = roiTarget;
        }

        return activeTarget;
    }

    private calculateRoiExitPrice(trade: Trade, roiTarget: number): number {
        const stake = trade.amount * trade.openRate;
        const closeFee = this.config.feeClose;

        if (trade.side === 'long') {
            // Solve netPnL = stake * roiTarget, including entry and exit fees.
            return (stake * (1 + roiTarget) + trade.fee) /
                (trade.amount * (1 - closeFee));
        }

        const numerator = stake * (1 - roiTarget) - trade.fee;
        return Math.max(0, numerator / (trade.amount * (1 + closeFee)));
    }

    private calculateResults(
        trades: Trade[],
        finalBalance: number,
        startingBalance: number,
        maxDrawdown: number,
        maxDrawdownPct: number,
        data: OHLCVCandle[],
        equityCurve: EquityPoint[]
    ): BacktestResult {
        const totalTrades = trades.length;
        let profitableTrades = 0;
        let losingTrades = 0;
        let totalProfit = 0;
        let totalProfitPctAcrossTrades = 0;
        let totalDuration = 0;
        let durationCount = 0;
        let bestTrade: Trade | null = null;
        let worstTrade: Trade | null = null;
        let grossProfit = 0;
        let grossLoss = 0;

        for (let i = 0; i < totalTrades; i++) {
            const current = trades[i];
            const pnl = current.profit || 0;
            totalProfit += pnl;
            totalProfitPctAcrossTrades += current.profitPct || 0;

            if (pnl > 0) {
                profitableTrades++;
                grossProfit += pnl;
            } else if (pnl < 0) {
                losingTrades++;
                grossLoss += Math.abs(pnl);
            }

            if (current.closeDate) {
                totalDuration += current.closeDate.getTime() - current.openDate.getTime();
                durationCount++;
            }

            if (!bestTrade || pnl > (bestTrade.profit ?? -Infinity)) bestTrade = current;
            if (!worstTrade || pnl < (worstTrade.profit ?? Infinity)) worstTrade = current;
        }

        // Economic invariant: the ledger and the trade book must reconcile.
        const expectedFinalBalance = startingBalance + totalProfit;
        const reconciliationTolerance = Math.max(1e-8, Math.abs(expectedFinalBalance) * 1e-10);
        if (Math.abs(finalBalance - expectedFinalBalance) > reconciliationTolerance) {
            throw new Error(
                `Backtest ledger invariant violated: finalBalance=${finalBalance}, ` +
                `startingBalance+tradePnL=${expectedFinalBalance}`
            );
        }

        const lossTrades = losingTrades;
        const totalProfitPct = startingBalance !== 0 ? (totalProfit / startingBalance) * 100 : 0;
        const avgProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;
        const avgProfitPct = totalTrades > 0 ? totalProfitPctAcrossTrades / totalTrades : 0;
        const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;
        const avgTradeDuration = durationCount > 0
            ? (totalDuration / durationCount) / (1000 * 60)
            : 0;

        // Profit Factor = gross winning PnL / absolute gross losing PnL.
        const profitFactor = grossLoss > 0
            ? grossProfit / grossLoss
            : (grossProfit > 0 ? Number.POSITIVE_INFINITY : 0);

        const dailyReturns = this.calculateDailyReturns(equityCurve, startingBalance);
        const dailyReturnsLen = dailyReturns.length;
        let sharpeRatio = 0;
        let sortinoRatio = 0;

        if (dailyReturnsLen > 0) {
            const avgDailyReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturnsLen;

            if (dailyReturnsLen > 1) {
                const sumSqDiff = dailyReturns.reduce((sum, r) => {
                    const diff = r - avgDailyReturn;
                    return sum + diff * diff;
                }, 0);
                const sampleStd = Math.sqrt(sumSqDiff / (dailyReturnsLen - 1));
                if (sampleStd > 0) {
                    sharpeRatio = (avgDailyReturn / sampleStd) * Math.sqrt(365);
                }
            }

            // Downside deviation uses all periods, with positive returns contributing 0.
            const downsideVariance = dailyReturns.reduce((sum, r) => {
                const downside = Math.min(r, 0);
                return sum + downside * downside;
            }, 0) / dailyReturnsLen;
            const downsideDeviation = Math.sqrt(downsideVariance);
            if (downsideDeviation > 0) {
                sortinoRatio = (avgDailyReturn / downsideDeviation) * Math.sqrt(365);
            }
        }

        const elapsedDays = Math.max(
            (data[data.length - 1].date.getTime() - data[0].date.getTime()) / 86_400_000,
            0
        );
        let annualizedReturn = 0;
        if (startingBalance > 0 && finalBalance > 0) {
            const totalReturn = finalBalance / startingBalance;
            annualizedReturn = elapsedDays > 0
                ? Math.pow(totalReturn, 365 / elapsedDays) - 1
                : totalReturn - 1;
        }
        const calmarRatio = maxDrawdownPct > 0
            ? annualizedReturn / (maxDrawdownPct / 100)
            : 0;

        return {
            trades,
            finalBalance,
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

    private calculateDailyReturns(equityCurve: EquityPoint[], startingBalance: number): number[] {
        if (equityCurve.length === 0 || startingBalance === 0) return [];

        // Keep the last mark-to-market equity point for each UTC day.
        const endOfDayEquity = new Map<number, number>();
        for (const point of equityCurve) {
            const dayKey = Math.floor(point.date.getTime() / 86_400_000);
            endOfDayEquity.set(dayKey, point.equity);
        }

        const sortedDays = Array.from(endOfDayEquity.keys()).sort((a, b) => a - b);
        const dailyReturns: number[] = [];
        let previousEquity = startingBalance;

        for (const dayKey of sortedDays) {
            const equity = endOfDayEquity.get(dayKey)!;
            const dailyReturn = previousEquity !== 0
                ? (equity - previousEquity) / previousEquity
                : 0;
            dailyReturns.push(dailyReturn);
            previousEquity = equity;
        }

        return dailyReturns;
    }
}