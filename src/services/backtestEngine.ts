import { DataFrame, DataFrameBuilder, OHLCVCandle } from '../types/dataframe';
import { IStrategy, Trade, BacktestConfig, BacktestResult, StrategyMetadata } from '../types/strategy';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

interface BacktestAccountState {
    balance: number;
}

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

        logger.info(
            `Starting backtest for strategy: ${this.strategy.name}`
        );

        logger.info(
            `Time range: ${this.config.timerange}`
        );

        logger.info(
            `Timeframe: ${this.config.timeframe}`
        );

        logger.info(
            `Starting balance: ${this.config.startingBalance}`
        );


        /*
         * ============================================================
         * VALIDATE DATA
         * ============================================================
         */

        if (!data || data.length === 0) {
            throw new Error(
                'Backtest data cannot be empty'
            );
        }


        if (
            data.length <=
            this.strategy.startupCandleCount
        ) {
            throw new Error(
                `Not enough candles for backtest. ` +
                `Received ${data.length}, ` +
                `startupCandleCount=${this.strategy.startupCandleCount}`
            );
        }


        /*
         * ============================================================
         * BUILD DATAFRAME
         * ============================================================
         */

        const dataframe =
            DataFrameBuilder.fromCandles(data);


        /*
         * ============================================================
         * STRATEGY METADATA
         * ============================================================
         *
         * NOTE:
         * BTCUSDT is still hardcoded for now.
         *
         * We will fix this later by adding symbol
         * into BacktestConfig.
         * ============================================================
         */

        const metadata: StrategyMetadata = {

            pair: 'BTCUSDT',

            timeframe:
                this.config.timeframe,

            stake_currency:
                'USDT'
        };


        /*
         * ============================================================
         * PRE-CALCULATE STRATEGY DATA
         * ============================================================
         */

        const indicatorData =
            this.strategy.populateIndicators(
                dataframe,
                metadata
            );


        const entryData =
            this.strategy.populateEntryTrend(
                indicatorData,
                metadata
            );


        const exitData =
            this.strategy.populateExitTrend(
                entryData,
                metadata
            );


        /*
         * ============================================================
         * ACCOUNT STATE
         * ============================================================
         *
         * IMPORTANT:
         *
         * Previously:
         *
         * const balance = startingBalance
         *
         * which never changed.
         *
         * Now account.balance will be updated
         * every time a trade is realized.
         * ============================================================
         */

        const account: BacktestAccountState = {

            balance:
                this.config.startingBalance
        };


        /*
         * ============================================================
         * TRADE STATE
         * ============================================================
         */

        const trades: Trade[] = [];

        const openTrades: Trade[] = [];


        /*
         * ============================================================
         * PERFORMANCE STATE
         * ============================================================
         */

        let maxEquity =
            account.balance;

        let maxDrawdown = 0;

        let maxDrawdownPct = 0;


        /*
         * ============================================================
         * STRATEGY START CALLBACK
         * ============================================================
         */

        if (this.strategy.botStart) {

            this.strategy.botStart();
        }


        /*
         * ============================================================
         * MAIN BACKTEST LOOP
         * ============================================================
         *
         * IMPORTANT EXECUTION MODEL:
         *
         * Candle N closes
         *      ↓
         * indicators available
         *      ↓
         * signal generated
         *      ↓
         * Candle N+1 opens
         *      ↓
         * order executes
         *
         *
         * Therefore:
         *
         * current candle     = execution candle
         * signalIndex        = previous candle
         *
         * ============================================================
         */

        for (
            let i = this.strategy.startupCandleCount;
            i < data.length;
            i++
        ) {

            /*
             * Current candle represents
             * the candle we can execute against.
             */
            const currentCandle =
                data[i];


            const currentTime =
                currentCandle.date;


            const currentPrice =
                currentCandle.close;


            /*
             * Strategy signals must come from
             * the previous CLOSED candle.
             */
            const signalIndex =
                i - 1;


            /*
             * ========================================================
             * BOT LOOP CALLBACK
             * ========================================================
             */

            if (this.strategy.botLoopStart) {

                this.strategy.botLoopStart(
                    currentTime
                );
            }


            /*
             * ========================================================
             * PROCESS EXISTING POSITIONS FIRST
             * ========================================================
             *
             * Why exits first?
             *
             * If an existing trade exits on this candle,
             * capital becomes available before evaluating
             * new entries.
             *
             * processExits will:
             *
             * - evaluate previous candle exit signal
             * - evaluate current candle ROI
             * - evaluate intrabar stoploss
             * - close trade
             * - update account.balance
             *
             * ========================================================
             */

            await this.processExits(
                openTrades,
                trades,
                exitData,
                signalIndex,
                currentCandle,
                account
            );


            /*
             * ========================================================
             * PROCESS NEW ENTRIES
             * ========================================================
             *
             * Only signals from a VALID closed candle
             * are eligible.
             *
             * Example:
             *
             * startupCandleCount = 2
             *
             * i = 2
             * signalIndex = 1
             *
             * No trade yet.
             *
             * i = 3
             * signalIndex = 2
             *
             * Signal candle #2 can now execute
             * at candle #3 open.
             *
             * ========================================================
             */

            if (
                signalIndex >=
                this.strategy.startupCandleCount
            ) {

                await this.processEntries(
                    openTrades,
                    entryData,
                    signalIndex,
                    currentCandle,
                    account,
                    metadata
                );
            }


            /*
             * ========================================================
             * UPDATE UNREALIZED PNL
             * ========================================================
             */

            this.updateTradesProfits(
                openTrades,
                currentPrice
            );


            /*
             * ========================================================
             * CALCULATE CURRENT EQUITY
             * ========================================================
             *
             * Account balance:
             *
             * realized money
             *
             * +
             *
             * unrealized PnL
             *
             * =
             *
             * current equity
             *
             * ========================================================
             */

            const totalUnrealizedPnl =
                openTrades.reduce(
                    (
                        total,
                        trade
                    ) => {

                        return (
                            total +
                            (trade.profit ?? 0)
                        );

                    },
                    0
                );


            const currentEquity =
                account.balance +
                totalUnrealizedPnl;


            /*
             * ========================================================
             * UPDATE EQUITY PEAK
             * ========================================================
             */

            if (
                currentEquity >
                maxEquity
            ) {

                maxEquity =
                    currentEquity;
            }


            /*
             * ========================================================
             * CALCULATE DRAWDOWN
             * ========================================================
             *
             * Drawdown:
             *
             * peak equity
             * -
             * current equity
             *
             * ========================================================
             */

            const currentDrawdown =
                maxEquity -
                currentEquity;


            const currentDrawdownPct =
                maxEquity > 0
                    ?
                    (
                        currentDrawdown /
                        maxEquity
                    ) * 100
                    :
                    0;


            /*
             * Save worst drawdown
             */
            if (
                currentDrawdown >
                maxDrawdown
            ) {

                maxDrawdown =
                    currentDrawdown;

                maxDrawdownPct =
                    currentDrawdownPct;
            }
        }


        /*
         * ============================================================
         * CLOSE REMAINING OPEN TRADES
         * ============================================================
         *
         * Any position still open when historical
         * data ends must be closed.
         * ============================================================
         */

        if (openTrades.length > 0) {

            const finalCandle =
                data[data.length - 1];


            /*
             * Iterate backwards because we remove
             * items from openTrades.
             */
            for (
                let i =
                    openTrades.length - 1;

                i >= 0;

                i--
            ) {

                const trade =
                    openTrades[i];


                /*
                 * closeTrade now returns
                 * REALIZED NET PNL.
                 */
                const realizedPnl =
                    this.closeTrade(
                        trade,
                        finalCandle,
                        'backtest_end'
                    );


                /*
                 * Update actual account balance.
                 */
                account.balance +=
                    realizedPnl;


                /*
                 * Save completed trade.
                 */
                trades.push(
                    trade
                );


                /*
                 * Remove from open positions.
                 */
                openTrades.splice(
                    i,
                    1
                );
            }
        }


        /*
         * ============================================================
         * FINAL RESULT
         * ============================================================
         */

        logger.info(
            `Backtest completed. ` +
            `Trades: ${trades.length}, ` +
            `Final balance: ${account.balance.toFixed(2)}`
        );


        return this.calculateResults(
            trades,

            /*
             * REAL actual final account balance.
             */
            account.balance,

            this.config.startingBalance,

            maxDrawdown,

            maxDrawdownPct,

            data
        );
    }
    private async processExits(
        openTrades: Trade[],
        allTrades: Trade[],
        exitData: DataFrame,
        signalIndex: number,
        candle: OHLCVCandle,
        account: BacktestAccountState
    ): Promise<void> {

        const currentPrice = candle.close;

        const exitLong =
            ((exitData.exit_long as number[]) ?? [])[signalIndex] ?? 0;

        const exitShort =
            ((exitData.exit_short as number[]) ?? [])[signalIndex] ?? 0;

        const exitTag =
            ((exitData.exit_tag as string[]) ?? [])[signalIndex];

        for (
            let j = openTrades.length - 1;
            j >= 0;
            j--
        ) {

            const trade = openTrades[j];

            const currentProfit =
                this.calculateTradeProfit(
                    trade,
                    currentPrice
                );

            const entryNotional =
                trade.amount * trade.openRate;

            const currentProfitPct =
                entryNotional > 0
                    ? (
                        currentProfit /
                        entryNotional
                    ) * 100
                    : 0;

            let shouldExit = false;
            let exitReason = '';

            /*
             * Default exit price is current close.
             */
            let exitPrice = currentPrice;


            /*
             * =====================================================
             * EXIT SIGNAL
             * =====================================================
             *
             * Signal comes from previous candle,
             * therefore we can execute at current candle OPEN.
             */

            const hasExitSignal =
                (
                    trade.side === 'long' &&
                    exitLong === 1
                ) ||
                (
                    trade.side === 'short' &&
                    exitShort === 1
                );

            if (
                this.strategy.useExitSignal &&
                hasExitSignal
            ) {

                shouldExit = true;

                exitReason = 'exit_signal';

                exitPrice = candle.open;

                trade.exitTag = exitTag;
            }


            /*
             * =====================================================
             * STOP LOSS
             * =====================================================
             */

            if (!shouldExit) {

                const stopExitPrice =
                    this.resolveStoplossExitPrice(
                        trade,
                        candle,
                        currentProfitPct
                    );

                if (stopExitPrice !== null) {

                    shouldExit = true;

                    exitReason = 'stoploss';

                    exitPrice = stopExitPrice;
                }
            }


            /*
             * =====================================================
             * ROI
             * =====================================================
             */

            if (
                !shouldExit &&
                this.checkRoi(
                    trade,
                    candle.date,
                    currentPrice
                )
            ) {

                shouldExit = true;

                exitReason = 'roi';

                exitPrice = currentPrice;
            }


            /*
             * =====================================================
             * NOTHING TO DO
             * =====================================================
             */

            if (!shouldExit) {
                continue;
            }


            /*
             * =====================================================
             * CONFIRM EXIT
             * =====================================================
             */

            let confirmExit = true;

            if (this.strategy.confirmTradeExit) {

                confirmExit =
                    this.strategy.confirmTradeExit(
                        trade.pair,
                        trade,
                        'market',
                        trade.amount,
                        exitPrice,
                        candle.date
                    );
            }


            if (!confirmExit) {
                continue;
            }


            /*
             * =====================================================
             * CLOSE POSITION
             * =====================================================
             */

            const realizedPnl =
                this.closeTrade(
                    trade,
                    candle,
                    exitReason,
                    exitPrice
                );


            /*
             * CRITICAL:
             * realized PnL changes actual account balance.
             */
            account.balance += realizedPnl;


            allTrades.push(trade);

            openTrades.splice(j, 1);
        };
    }

    private async processEntries(
        openTrades: Trade[],
        entryData: DataFrame,
        signalIndex: number,
        candle: OHLCVCandle,
        account: BacktestAccountState,
        metadata: StrategyMetadata
    ): Promise<void> {

        /*
         * No available slot.
         */
        if (
            openTrades.length >=
            this.config.maxOpenTrades
        ) {
            return;
        }


        const enterLong =
            ((entryData.enter_long as number[]) ?? [])
            [signalIndex] ?? 0;


        const enterShort =
            ((entryData.enter_short as number[]) ?? [])
            [signalIndex] ?? 0;


        const enterTag =
            ((entryData.enter_tag as string[]) ?? [])
            [signalIndex] ?? 'entry';


        /*
         * =====================================================
         * LONG
         * =====================================================
         */

        if (
            enterLong === 1 &&
            openTrades.length <
            this.config.maxOpenTrades
        ) {

            await this.createTrade(
                'long',
                candle,
                enterTag,
                account.balance,
                openTrades,
                metadata
            );
        }


        /*
         * =====================================================
         * SHORT
         * =====================================================
         *
         * IMPORTANT:
         *
         * Check maxOpenTrades AGAIN because
         * LONG may have just occupied the final slot.
         */

        if (
            this.strategy.canShort &&
            enterShort === 1 &&
            openTrades.length <
            this.config.maxOpenTrades
        ) {

            await this.createTrade(
                'short',
                candle,
                enterTag,
                account.balance,
                openTrades,
                metadata
            );
        }
    }

    private async createTrade(
        side: 'long' | 'short',
        candle: OHLCVCandle,
        enterTag: string,
        balance: number,
        openTrades: Trade[],
        metadata: StrategyMetadata
    ): Promise<void> {

        /*
         * =====================================================
         * POSITION SIZE
         * =====================================================
         */

        const stakeAmount =
            typeof this.strategy.stakeAmount === 'number'
                ? this.strategy.stakeAmount
                : balance /
                this.config.maxOpenTrades;


        /*
         * Temporary safety check.
         *
         * Capital reservation will be improved
         * in Backtest V2.1.
         */
        if (
            stakeAmount >
            balance * 0.95
        ) {

            logger.warn(
                `Skipping entry: stake ${stakeAmount} exceeds available balance buffer`
            );

            return;
        }


        /*
         * =====================================================
         * EXECUTION PRICE
         * =====================================================
         *
         * Signal from candle N is executed
         * at OPEN candle N+1.
         */

        const entryPrice =
            candle.open;


        const amount =
            stakeAmount /
            entryPrice;


        const fee =
            stakeAmount *
            this.config.feeOpen;


        /*
         * =====================================================
         * CONFIRM ENTRY
         * =====================================================
         */

        let confirmEntry = true;


        if (
            this.strategy.confirmTradeEntry
        ) {

            confirmEntry =
                this.strategy.confirmTradeEntry(
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


        /*
         * =====================================================
         * CREATE TRADE
         * =====================================================
         */

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

            stoplossRate:
                entryPrice *
                (
                    1 +
                    this.strategy.stoploss *
                    (
                        side === 'long'
                            ? 1
                            : -1
                    )
                )
        };


        openTrades.push(trade);


        logger.info(
            `Opened ${side} trade ` +
            `${metadata.pair} ` +
            `@ ${entryPrice} ` +
            `stake=${stakeAmount.toFixed(2)}`
        );
    }

    private closeTrade(
        trade: Trade,
        candle: OHLCVCandle,
        exitReason: string,
        exitPrice: number = candle.close
    ): number {

        /*
         * =====================================================
         * EXIT FEE
         * =====================================================
         */

        const exitNotional =
            trade.amount *
            exitPrice;


        const exitFee =
            exitNotional *
            this.config.feeClose;


        /*
         * Entry fee was calculated when
         * position was created.
         */
        const entryFee =
            trade.fee ?? 0;


        /*
         * =====================================================
         * GROSS PNL
         * =====================================================
         */

        const grossProfit =
            this.calculateTradeProfit(
                trade,
                exitPrice
            );


        /*
         * =====================================================
         * NET PNL
         * =====================================================
         *
         * net =
         *
         * gross PnL
         * - entry fee
         * - exit fee
         */

        const netProfit =
            grossProfit -
            entryFee -
            exitFee;


        /*
         * =====================================================
         * UPDATE TRADE
         * =====================================================
         */

        trade.closeRate =
            exitPrice;


        trade.closeDate =
            candle.date;


        trade.isOpen =
            false;


        trade.exitReason =
            exitReason;


        trade.profit =
            netProfit;


        const entryNotional =
            trade.amount *
            trade.openRate;


        trade.profitPct =
            entryNotional > 0
                ? (
                    netProfit /
                    entryNotional
                ) * 100
                : 0;


        logger.info(
            `Closed ${trade.side} trade ` +
            `${trade.pair} @ ${exitPrice}, ` +
            `gross=${grossProfit.toFixed(2)}, ` +
            `entryFee=${entryFee.toFixed(2)}, ` +
            `exitFee=${exitFee.toFixed(2)}, ` +
            `net=${netProfit.toFixed(2)} ` +
            `(${trade.profitPct.toFixed(2)}%)`
        );


        /*
         * THIS fixes:
         *
         * account.balance += realizedPnl
         */

        return netProfit;
    }

    private calculateTradeProfit(trade: Trade, currentPrice: number): number {
        if (trade.side === 'long') {
            return trade.amount * (currentPrice - trade.openRate);
        } else {
            return trade.amount * (trade.openRate - currentPrice);
        }
    }

    private updateTradesProfits(
        openTrades: Trade[],
        currentPrice: number
    ): void {

        for (
            const trade of openTrades
        ) {

            const grossProfit =
                this.calculateTradeProfit(
                    trade,
                    currentPrice
                );


            /*
             * Entry fee has already been paid.
             *
             * We do not estimate exit fee
             * until trade is actually closed.
             */
            const unrealizedProfit =
                grossProfit -
                (trade.fee ?? 0);


            trade.profit =
                unrealizedProfit;


            const entryNotional =
                trade.amount *
                trade.openRate;


            trade.profitPct =
                entryNotional > 0
                    ? (
                        unrealizedProfit /
                        entryNotional
                    ) * 100
                    : 0;
        }
    }

    private checkRoi(
        trade: Trade,
        currentTime: Date,
        currentPrice: number
    ): boolean {

        const tradeDuration =
            (
                currentTime.getTime() -
                trade.openDate.getTime()
            ) /
            (1000 * 60);


        /*
         * Calculate CURRENT PnL directly.
         *
         * Do not use cached trade.profitPct.
         */
        const currentProfit =
            this.calculateTradeProfit(
                trade,
                currentPrice
            );


        const entryNotional =
            trade.amount *
            trade.openRate;


        const currentProfitPct =
            entryNotional > 0
                ? (
                    currentProfit /
                    entryNotional
                ) * 100
                : 0;


        for (
            let i = 0;
            i < this.sortedRoi.length;
            i++
        ) {

            const [
                timeThreshold,
                roiTarget
            ] = this.sortedRoi[i];


            if (
                tradeDuration >= timeThreshold &&
                currentProfitPct >=
                roiTarget * 100
            ) {

                return true;
            }
        }


        return false;
    }
    private resolveStoplossExitPrice(
        trade: Trade,
        candle: OHLCVCandle,
        currentProfitPct: number
    ): number | null {

        /*
         * Start with default stoploss.
         */
        let stopPrice =
            trade.stoplossRate;


        /*
         * =====================================================
         * CUSTOM STOPLOSS
         * =====================================================
         */

        if (
            this.strategy.customStoploss
        ) {

            const customStop =
                this.strategy.customStoploss(
                    trade,
                    candle.date,
                    candle.close,
                    currentProfitPct
                );


            if (customStop !== null) {

                stopPrice =
                    trade.openRate *
                    (
                        1 + customStop *
                        (
                            trade.side === 'long'
                                ? 1
                                : -1
                        )
                    );
            }
        }
        if (
            stopPrice === undefined
        ) {

            return null;
        }


        /*
         * =====================================================
         * LONG STOP
         * =====================================================
         */

        if (
            trade.side === 'long'
        ) {

            /*
             * Stop not touched.
             */
            if (
                candle.low >
                stopPrice
            ) {

                return null;
            }


            /*
             * Gap down handling.
             *
             * Example:
             *
             * stop = 95
             * open = 92
             *
             * Cannot pretend fill = 95.
             */
            return Math.min(
                candle.open,
                stopPrice
            );
        }


        /*
         * =====================================================
         * SHORT STOP
         * =====================================================
         */

        if (
            candle.high <
            stopPrice
        ) {

            return null;
        }

        /*
         * Gap up handling for short.
         */
        return Math.max(
            candle.open,
            stopPrice
        );
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
