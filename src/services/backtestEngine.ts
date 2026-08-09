import { DataFrame, DataFrameBuilder, OHLCVCandle } from '../types/dataframe';
import { IStrategy, Trade, StrategyMetadata } from '../types/strategy';
import {
    BacktestExecutionConfig,
    BacktestExecutionModelConfig,
    BacktestExecutionResult,
    BacktestExecutionTrade
} from '../types/backtestExecution';
import { logger } from '../utils/logger';

interface EquityPoint {
    date: Date;
    equity: number;
}

interface ExecutionFill {
    referencePrice: number;
    fillPrice: number;
    spreadCost: number;
    slippageCost: number;
    adverseMovePct: number;
}

interface EntryResult {
    entryFee: number;
    reservedCapital: number;
}

export class BacktestEngine {
    private strategy: IStrategy;
    private config: BacktestExecutionConfig;
    private executionModel: Required<BacktestExecutionModelConfig>;
    private sortedRoi: [number, number][];
    private randomState: number;
    private tradeSequence = 0;

    constructor(strategy: IStrategy, config: BacktestExecutionConfig) {
        this.strategy = strategy;
        this.config = config;
        this.executionModel = {
            spreadBps: config.executionModel?.spreadBps ?? 0,
            slippageBps: config.executionModel?.slippageBps ?? 0,
            randomSlippageBps: config.executionModel?.randomSlippageBps ?? 0,
            seed: config.executionModel?.seed ?? 0x6d2b79f5
        };
        this.validateExecutionModel(this.executionModel);
        this.randomState = this.normalizeSeed(this.executionModel.seed);
        this.sortedRoi = Object.entries(this.strategy.minimalRoi || {})
            .map(([timeStr, roiTarget]) => [parseInt(timeStr), roiTarget] as [number, number])
            .sort((a, b) => a[0] - b[0]);
    }

    async runBacktest(data: OHLCVCandle[]): Promise<BacktestExecutionResult> {
        if (data.length === 0) {
            throw new Error('Backtest requires at least one candle');
        }

        logger.info(`Starting backtest for strategy: ${this.strategy.name}`);
        logger.info(`Time range: ${this.config.timerange}`);
        logger.info(`Timeframe: ${this.config.timeframe}`);
        logger.info(`Starting balance: ${this.config.startingBalance}`);

        // P0.3 reproducibility invariant: reset all per-run deterministic state.
        this.randomState = this.normalizeSeed(this.executionModel.seed);
        this.tradeSequence = 0;

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
        const trades: BacktestExecutionTrade[] = [];
        const openTrades: BacktestExecutionTrade[] = [];
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
            const exitFill = this.createExecutionFill(
                data[data.length - 1].close,
                trade.amount,
                trade.side === 'long' ? 'SELL' : 'BUY'
            );
            balance += this.closeTrade(
                trade,
                exitFill,
                data[data.length - 1].date,
                'backtest_end'
            );
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
        openTrades: BacktestExecutionTrade[],
        allTrades: BacktestExecutionTrade[],
        exitData: DataFrame,
        signalIndex: number,
        executionCandle: OHLCVCandle
    ): Promise<number> {
        const exitLong = ((exitData.exit_long as number[]) || [])[signalIndex];
        const exitShort = ((exitData.exit_short as number[]) || [])[signalIndex];
        const exitTag = ((exitData.exit_tag as string[]) || [])[signalIndex];
        const referencePrice = executionCandle.open;
        let realizedPnl = 0;

        for (let j = openTrades.length - 1; j >= 0; j--) {
            const trade = openTrades[j];
            const shouldExit =
                (trade.side === 'long' && exitLong === 1) ||
                (trade.side === 'short' && exitShort === 1);

            if (!shouldExit) continue;

            const exitFill = this.createExecutionFill(
                referencePrice,
                trade.amount,
                trade.side === 'long' ? 'SELL' : 'BUY'
            );

            let confirmExit = true;
            if (this.strategy.confirmTradeExit) {
                confirmExit = this.strategy.confirmTradeExit(
                    trade.pair,
                    trade,
                    'market',
                    trade.amount,
                    exitFill.fillPrice,
                    executionCandle.date
                );
            }

            if (!confirmExit) continue;

            trade.exitTag = exitTag;
            realizedPnl += this.closeTrade(
                trade,
                exitFill,
                executionCandle.date,
                'exit_signal'
            );
            allTrades.push(trade);
            openTrades.splice(j, 1);
        }

        return realizedPnl;
    }

    private async processEntries(
        openTrades: BacktestExecutionTrade[],
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
        let availableBalance = this.calculateAvailableBalance(balance, openTrades);

        const tryCreateTrade = async (side: 'long' | 'short'): Promise<void> => {
            if (openTrades.length >= this.config.maxOpenTrades) return;

            const result = await this.createTrade(
                side,
                executionCandle,
                enterTag,
                availableBalance,
                openTrades,
                metadata
            );
            if (!result) return;

            entryFees += result.entryFee;
            availableBalance -= result.reservedCapital + result.entryFee;
            // Floating point dust must never create phantom buying power.
            if (Math.abs(availableBalance) < 1e-10) availableBalance = 0;
        };

        if (enterLong === 1) {
            await tryCreateTrade('long');
        }

        if (this.strategy.canShort && enterShort === 1) {
            await tryCreateTrade('short');
        }

        return entryFees;
    }

    private async createTrade(
        side: 'long' | 'short',
        candle: OHLCVCandle,
        enterTag: string,
        availableBalance: number,
        openTrades: BacktestExecutionTrade[],
        metadata: StrategyMetadata
    ): Promise<EntryResult | null> {
        const remainingSlots = Math.max(1, this.config.maxOpenTrades - openTrades.length);
        const stakeAmount = this.resolveStakeAmount(availableBalance, remainingSlots);
        if (!Number.isFinite(stakeAmount) || stakeAmount <= 0) {
            return null;
        }

        const entryFee = stakeAmount * this.config.feeOpen;
        const requiredCapital = stakeAmount + entryFee;
        const tolerance = Math.max(1e-10, availableBalance * 1e-12);
        if (requiredCapital - availableBalance > tolerance) {
            return null;
        }

        const orderSide: 'BUY' | 'SELL' = side === 'long' ? 'BUY' : 'SELL';
        // Fill price is quantity-independent in this P0 model. Generate the
        // stochastic component exactly once, then scale per-unit costs by amount.
        const unitFill = this.createExecutionFill(candle.open, 1, orderSide);
        const amount = stakeAmount / unitFill.fillPrice;
        const entryFill = this.scaleExecutionFill(unitFill, amount);

        let confirmEntry = true;
        if (this.strategy.confirmTradeEntry) {
            confirmEntry = this.strategy.confirmTradeEntry(
                metadata.pair,
                'market',
                amount,
                entryFill.fillPrice,
                candle.date
            );
        }

        if (!confirmEntry) return null;

        const trade: BacktestExecutionTrade = {
            id: this.nextTradeId(candle, side),
            pair: metadata.pair,
            isOpen: true,
            side,
            amount,
            openRate: entryFill.fillPrice,
            openDate: candle.date,
            fee: entryFee,
            entryTag: enterTag,
            stoplossRate: entryFill.fillPrice * (
                1 + this.strategy.stoploss * (side === 'long' ? 1 : -1)
            ),
            stakeAmount,
            entryReferencePrice: entryFill.referencePrice,
            actualEntryPrice: entryFill.fillPrice,
            entrySlippage: entryFill.adverseMovePct,
            entrySpreadCost: entryFill.spreadCost,
            entrySlippageCost: entryFill.slippageCost,
            executionCost: entryFill.spreadCost + entryFill.slippageCost
        };

        openTrades.push(trade);
        logger.info(
            `Opened ${side} trade for ${metadata.pair}: reference=${entryFill.referencePrice}, ` +
            `fill=${entryFill.fillPrice}, reserved=${stakeAmount}, executionCost=${trade.executionCost}`
        );

        return { entryFee, reservedCapital: stakeAmount };
    }

    private calculateAvailableBalance(
        realizedBalance: number,
        openTrades: BacktestExecutionTrade[]
    ): number {
        const reservedCapital = openTrades.reduce(
            (sum, trade) => sum + trade.stakeAmount,
            0
        );
        return Math.max(0, realizedBalance - reservedCapital);
    }

    private resolveStakeAmount(availableBalance: number, remainingSlots: number): number {
        if (typeof this.strategy.stakeAmount === 'number') {
            return this.strategy.stakeAmount;
        }

        // "unlimited" means evenly allocate remaining buying power while
        // reserving enough cash for entry fees.
        const feeMultiplier = 1 + Math.max(0, this.config.feeOpen);
        return availableBalance / Math.max(1, remainingSlots) / feeMultiplier;
    }

    private validateExecutionModel(model: Required<BacktestExecutionModelConfig>): void {
        const nonNegativeFields: Array<keyof BacktestExecutionModelConfig> = [
            'spreadBps',
            'slippageBps',
            'randomSlippageBps'
        ];

        for (const field of nonNegativeFields) {
            const value = model[field] as number;
            if (!Number.isFinite(value) || value < 0) {
                throw new Error(`Invalid executionModel.${field}: expected a finite non-negative number`);
            }
        }

        if (!Number.isFinite(model.seed)) {
            throw new Error('Invalid executionModel.seed: expected a finite number');
        }

        const maxAdverseBps = (model.spreadBps / 2) + model.slippageBps + model.randomSlippageBps;
        if (maxAdverseBps >= 10_000) {
            throw new Error(
                'Invalid execution model: worst-case adverse move must remain below 10000 bps'
            );
        }
    }

    private normalizeSeed(seed: number): number {
        return Math.trunc(seed) >>> 0;
    }

    /** Mulberry32: compact deterministic PRNG suitable for simulation reproducibility. */
    private nextRandom(): number {
        this.randomState = (this.randomState + 0x6d2b79f5) >>> 0;
        let t = this.randomState;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    }

    private createExecutionFill(
        referencePrice: number,
        amount: number,
        orderSide: 'BUY' | 'SELL'
    ): ExecutionFill {
        if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
            throw new Error(`Invalid execution reference price: ${referencePrice}`);
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error(`Invalid execution amount: ${amount}`);
        }

        const direction = orderSide === 'BUY' ? 1 : -1;
        const halfSpreadFraction = (this.executionModel.spreadBps / 2) / 10_000;
        const randomAdverseBps = this.executionModel.randomSlippageBps > 0
            ? this.nextRandom() * this.executionModel.randomSlippageBps
            : 0;
        const slippageFraction = (
            this.executionModel.slippageBps + randomAdverseBps
        ) / 10_000;

        const spreadPrice = referencePrice * (1 + direction * halfSpreadFraction);
        const fillPrice = spreadPrice + (referencePrice * direction * slippageFraction);
        const spreadCost = Math.abs(spreadPrice - referencePrice) * amount;
        const slippageCost = Math.abs(fillPrice - spreadPrice) * amount;

        return {
            referencePrice,
            fillPrice,
            spreadCost,
            slippageCost,
            adverseMovePct: Math.abs(fillPrice - referencePrice) / referencePrice
        };
    }

    private scaleExecutionFill(unitFill: ExecutionFill, amount: number): ExecutionFill {
        return {
            ...unitFill,
            spreadCost: unitFill.spreadCost * amount,
            slippageCost: unitFill.slippageCost * amount
        };
    }

    private nextTradeId(candle: OHLCVCandle, side: 'long' | 'short'): string {
        this.tradeSequence += 1;
        return `bt-${candle.timestamp}-${this.tradeSequence}-${side}`;
    }

    private closeTrade(
        trade: BacktestExecutionTrade,
        exitFill: ExecutionFill,
        exitDate: Date,
        exitReason: string
    ): number {
        const exitFee = trade.amount * exitFill.fillPrice * this.config.feeClose;
        const grossPnl = this.calculateTradeProfit(trade, exitFill.fillPrice);

        trade.closeRate = exitFill.fillPrice;
        trade.actualExitPrice = exitFill.fillPrice;
        trade.exitReferencePrice = exitFill.referencePrice;
        trade.exitSpreadCost = exitFill.spreadCost;
        trade.exitSlippageCost = exitFill.slippageCost;
        trade.exitSlippage = exitFill.adverseMovePct;
        trade.executionCost += exitFill.spreadCost + exitFill.slippageCost;
        trade.closeDate = exitDate;
        trade.isOpen = false;
        trade.exitReason = exitReason;

        // P0 invariant: net PnL always includes entry fee AND exit fee.
        // Spread/slippage are already embedded in the actual fill prices, so they
        // must NOT be subtracted again here.
        trade.profit = grossPnl - trade.fee - exitFee;
        trade.profitPct = (trade.profit / trade.stakeAmount) * 100;

        logger.info(
            `Closed ${trade.side} trade for ${trade.pair}: reference=${exitFill.referencePrice}, ` +
            `fill=${exitFill.fillPrice}, executionCost=${trade.executionCost}, ` +
            `profit=${trade.profit.toFixed(2)} (${trade.profitPct.toFixed(2)}%)`
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

    private updateTradesProfits(openTrades: BacktestExecutionTrade[], currentPrice: number): void {
        for (const trade of openTrades) {
            // Entry fee is already paid and must be visible in mark-to-market equity.
            trade.profit = this.calculateTradeProfit(trade, currentPrice) - trade.fee;
            trade.profitPct = (trade.profit / trade.stakeAmount) * 100;
        }
    }

    private async processIntrabarExits(
        openTrades: BacktestExecutionTrade[],
        allTrades: BacktestExecutionTrade[],
        candle: OHLCVCandle
    ): Promise<number> {
        let realizedPnl = 0;

        for (let j = openTrades.length - 1; j >= 0; j--) {
            const trade = openTrades[j];
            const openNetPnl = this.calculateTradeProfit(trade, candle.open) - trade.fee;
            const openProfitPct = (openNetPnl / trade.stakeAmount) * 100;

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
            let exitReferencePrice = 0;

            // Conservative bar-path rule: when OHLC cannot tell us whether TP or
            // SL occurred first, assume the adverse stop occurred first.
            if (stopHit && stopPrice !== null) {
                exitReason = 'stoploss';
                exitReferencePrice = trade.side === 'long'
                    ? (candle.open <= stopPrice ? candle.open : stopPrice)
                    : (candle.open >= stopPrice ? candle.open : stopPrice);
            } else if (roiHit && roiPrice !== null) {
                exitReason = 'roi';
                exitReferencePrice = trade.side === 'long'
                    ? (candle.open >= roiPrice ? candle.open : roiPrice)
                    : (candle.open <= roiPrice ? candle.open : roiPrice);
            }

            if (!exitReason) continue;

            const exitFill = this.createExecutionFill(
                exitReferencePrice,
                trade.amount,
                trade.side === 'long' ? 'SELL' : 'BUY'
            );

            let confirmExit = true;
            if (this.strategy.confirmTradeExit) {
                confirmExit = this.strategy.confirmTradeExit(
                    trade.pair,
                    trade,
                    'market',
                    trade.amount,
                    exitFill.fillPrice,
                    candle.date
                );
            }
            if (!confirmExit) continue;

            realizedPnl += this.closeTrade(trade, exitFill, candle.date, exitReason);
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
        trades: BacktestExecutionTrade[],
        finalBalance: number,
        startingBalance: number,
        maxDrawdown: number,
        maxDrawdownPct: number,
        data: OHLCVCandle[],
        equityCurve: EquityPoint[]
    ): BacktestExecutionResult {
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
        let totalSpreadCost = 0;
        let totalSlippageCost = 0;

        for (let i = 0; i < totalTrades; i++) {
            const current = trades[i];
            const pnl = current.profit || 0;
            totalProfit += pnl;
            totalProfitPctAcrossTrades += current.profitPct || 0;
            totalSpreadCost += current.entrySpreadCost + (current.exitSpreadCost || 0);
            totalSlippageCost += current.entrySlippageCost + (current.exitSlippageCost || 0);

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
            endDate: data[data.length - 1].date,
            totalSpreadCost,
            totalSlippageCost,
            totalExecutionCost: totalSpreadCost + totalSlippageCost
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