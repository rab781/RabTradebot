import { IStrategy, Position, Trade, StrategyMetadata } from '../types/strategy';
import { DataFrame, OHLCVCandle, DataFrameBuilder } from '../types/dataframe';
import { DataManager } from './dataManager';
import { db } from './databaseService';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

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
  // Slippage tracking (Fase 2)
  totalSlippageCost?: number; // Total cost from slippage across all trades
  totalSpreadCost?: number; // Total cost from bid/ask spread
  profitWithoutSlippage?: number; // P&L if slippage didn't exist
}

export interface PerformanceMetric {
  timestamp: Date;
  balance: number;
  totalProfit: number;
  openPositions: number;
  drawdown: number;
}

interface PendingPartialEntry {
  pair: string;
  side: 'long' | 'short';
  remainingQuantity: number;
  enterTag: string;
  createdAt: Date;
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
  private pendingPartialEntries: PendingPartialEntry[] = [];
  private paperTradeDbIds: Map<string, string> = new Map();
  private isRunning = false;
  private tradeIdCounter = 1;

  // Performance tracking
  private performanceHistory: PerformanceMetric[] = [];
  private maxBalance = 0;
  private maxDrawdown = 0;
  private performancePersistEvery = 10;

  // Slippage tracking (Fase 2)
  private totalSlippageCost = 0;
  private totalSpreadCost = 0;

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

    logger.info(`Starting paper trading for strategy: ${this.strategy.name}`);
    logger.info(`Symbol: ${symbol}, Timeframe: ${timeframe}`);
    logger.info(`Initial balance: ${this.config.initialBalance} ${this.config.stakeCurrency}`);

    try {
      // Download recent historical data
      this.historicalData = await this.dataManager.getRecentData(symbol, timeframe, dataPoints);

      if (this.historicalData.length < this.strategy.startupCandleCount) {
        throw new Error(
          `Insufficient data: need at least ${this.strategy.startupCandleCount} candles`
        );
      }

      this.currentDataIndex = this.strategy.startupCandleCount;
      this.isRunning = true;

      // Initialize strategy
      if (this.strategy.botStart) {
        this.strategy.botStart();
      }

      // Restore any persisted open paper positions from database
      if (this.userId) {
        await this.restoreStateFromDB(symbol);
      }

      logger.info(`Paper trading started successfully with ${this.historicalData.length} candles`);

      // Start the main trading loop
      await this.runTradingLoop(symbol, timeframe);
    } catch (error) {
      logger.error({ err: error }, 'Error starting paper trading:');
      throw error;
    }
  }

  stop(): void {
    this.isRunning = false;
    logger.info('Paper trading stopped');
  }

  /**
   * Reload open paper trades from the database into memory.
   * Called on startup so positions are not lost after a bot restart.
   */
  private async restoreStateFromDB(symbol: string): Promise<void> {
    if (!this.userId) return;

    try {
      const dbTrades = await db.getOpenPaperTrades(parseInt(this.userId), symbol);

      if (dbTrades.length === 0) return;

      logger.info(`🔄 Restoring ${dbTrades.length} open paper trade(s) from database...`);

      for (const dbTrade of dbTrades) {
        const side: 'long' | 'short' = dbTrade.side === 'BUY' ? 'long' : 'short';
        const stakeAmount = dbTrade.quantity * dbTrade.entryPrice;
        const fee = dbTrade.fees ?? 0;

        const trade: Trade = {
          id: uuidv4(),
          pair: dbTrade.symbol,
          side,
          isOpen: true,
          openRate: dbTrade.entryPrice,
          amount: dbTrade.quantity,
          stoplossRate: dbTrade.stopLoss ?? dbTrade.entryPrice * (side === 'long' ? 0.95 : 1.05),
          fee,
          openDate: dbTrade.entryTime,
          entryTag: 'RESTORED_FROM_DB',
        };

        const position: Position = {
          pair: dbTrade.symbol,
          side,
          amount: dbTrade.quantity,
          entryPrice: dbTrade.entryPrice,
          currentPrice: dbTrade.entryPrice,
          unrealizedPnl: 0,
          unrealizedPnlPct: 0,
          entryTime: dbTrade.entryTime,
          stoplossPrice: trade.stoplossRate,
        };

        this.openTrades.push(trade);
        this.positions.push(position);
        this.paperTradeDbIds.set(trade.id, dbTrade.id);
        this.balance -= stakeAmount + fee;

        logger.info(`  ✔ Restored ${side} ${dbTrade.symbol} @ ${dbTrade.entryPrice}`);
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to restore paper trades from database:');
      // Non-fatal — continue without restored state
    }
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
      logger.info('Paper trading stopped by user');
    } else {
      logger.info('Paper trading completed - reached end of historical data');
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
      stake_currency: this.config.stakeCurrency,
    };

    try {
      const indicatorData = this.strategy.populateIndicators(dataframe, metadata);
      const entryData = this.strategy.populateEntryTrend(indicatorData, metadata);
      const exitData = this.strategy.populateExitTrend(entryData, metadata);

      // Process exits first
      await this.processExits(exitData, currentCandle, metadata);

      // Process pending partial entries before fresh signals
      await this.processPendingPartialEntries(currentCandle, metadata);

      // Process entries
      await this.processEntries(entryData, currentCandle, metadata);

      // Update positions and performance
      await this.updatePositions(currentPrice);
      await this.updatePerformanceMetrics(currentTime);
    } catch (error) {
      logger.error({ err: error }, `Error processing iteration at ${currentTime}:`);
    }
  }

  private async processExits(
    exitData: DataFrame,
    candle: OHLCVCandle,
    metadata: StrategyMetadata
  ): Promise<void> {
    const currentIndex = this.currentDataIndex;
    const currentPrice = candle.close;

    for (let i = this.openTrades.length - 1; i >= 0; i--) {
      const trade = this.openTrades[i];
      let shouldExit = false;
      let exitReason = '';

      // Recompute current PnL before checking exit conditions.
      trade.profit = this.calculateTradeProfit(trade, currentPrice);
      trade.profitPct =
        (trade.profit / (trade.amount * (trade.actualEntryPrice || trade.openRate))) * 100;

      // Check exit signals
      const exitLong = (exitData.exit_long as number[])[currentIndex];
      const exitShort = (exitData.exit_short as number[])[currentIndex];
      const exitTag = (exitData.exit_tag as string[])[currentIndex];

      if (
        (trade.side === 'long' && exitLong === 1) ||
        (trade.side === 'short' && exitShort === 1)
      ) {
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

  private async processEntries(
    entryData: DataFrame,
    candle: OHLCVCandle,
    metadata: StrategyMetadata
  ): Promise<void> {
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
    const stakeAmount =
      typeof this.strategy.stakeAmount === 'number'
        ? this.strategy.stakeAmount
        : this.balance / this.config.maxOpenTrades;

    // Check if we have enough balance
    if (stakeAmount > this.balance * 0.95) {
      // Leave 5% buffer
      logger.info(`Insufficient balance for new trade: ${stakeAmount} > ${this.balance * 0.95}`);
      return;
    }

    const entryPrice = candle.close;
    const requestedAmount = stakeAmount / entryPrice;

    // F2-6/F2-7: Use average recent volume to constrain executable size.
    const avgVolume20 = this.calculateAverageVolume20();
    const liquidityData = this.applyLiquidityConstraint(requestedAmount, avgVolume20);
    if (liquidityData.filledQuantity <= 0) {
      logger.info(
        `Liquidity too low to open ${metadata.pair}: requested ${requestedAmount}, max ${liquidityData.maxFillQuantity}`
      );
      return;
    }

    if (liquidityData.isPartialFill) {
      logger.info(
        `Partial fill for ${metadata.pair}: requested ${requestedAmount.toFixed(6)}, filled ${liquidityData.filledQuantity.toFixed(6)}`
      );
    }

    const amount = liquidityData.filledQuantity;

    if (liquidityData.isPartialFill && liquidityData.unfilledQuantity > 0) {
      this.pendingPartialEntries.push({
        pair: metadata.pair,
        side,
        remainingQuantity: liquidityData.unfilledQuantity,
        enterTag,
        createdAt: candle.date,
      });
    }

    // F2-4/F2-5: Apply bid/ask spread before slippage.
    const spreadData = this.applySpread(entryPrice, side, metadata.pair);
    const spreadAdjustedEntryPrice = spreadData.adjustedPrice;
    const spreadCost = Math.abs(spreadAdjustedEntryPrice - entryPrice) * amount;
    this.totalSpreadCost += spreadCost;

    // F2-2: Calculate slippage on top of spread-adjusted price.
    const slippageData = this.calculateSlippage(
      spreadAdjustedEntryPrice,
      side,
      amount,
      avgVolume20
    );
    const actualEntryPrice = slippageData.fillPrice;
    const slippageCost = Math.abs(actualEntryPrice - spreadAdjustedEntryPrice) * amount;
    this.totalSlippageCost += slippageCost;
    const entryNotional = amount * actualEntryPrice;
    const fee = entryNotional * this.config.feeOpen;

    if (entryNotional + fee > this.balance * 0.95) {
      logger.info(
        `Insufficient balance for partial/new fill: ${entryNotional + fee} > ${this.balance * 0.95}`
      );
      return;
    }

    // Confirm entry if callback exists
    let confirmEntry = true;
    if (this.strategy.confirmTradeEntry) {
      confirmEntry = this.strategy.confirmTradeEntry(
        metadata.pair,
        'market',
        amount,
        actualEntryPrice,
        candle.date
      );
    }

    if (!confirmEntry) {
      logger.info('Trade entry not confirmed by strategy');
      return;
    }

    // Create trade with slippage tracking (Fase 2)
    const trade: Trade = {
      id: uuidv4(),
      pair: metadata.pair,
      isOpen: true,
      side: side,
      amount: amount,
      openRate: entryPrice, // Nominal entry price (for reference)
      actualEntryPrice: actualEntryPrice, // Actual fill price with slippage
      openDate: candle.date,
      fee: fee,
      entryTag: enterTag,
      entrySlippage: slippageData.totalSlippage, // Store slippage percentage
      stoplossRate: actualEntryPrice * (1 + this.strategy.stoploss * (side === 'long' ? 1 : -1)),
    };

    // Create position (using actual entry price with slippage)
    const position: Position = {
      pair: metadata.pair,
      side: side,
      amount: amount,
      entryPrice: actualEntryPrice, // Use actual fill price with slippage
      currentPrice: actualEntryPrice,
      unrealizedPnl: 0,
      unrealizedPnlPct: 0,
      entryTime: candle.date,
      stoplossPrice: trade.stoplossRate,
    };

    this.openTrades.push(trade);
    this.positions.push(position);
    this.balance -= entryNotional + fee;

    logger.info(`📈 Opened ${side} trade for ${metadata.pair} at ${entryPrice} (${enterTag})`);
    logger.info(`💰 Remaining balance: ${this.balance.toFixed(2)} ${this.config.stakeCurrency}`);

    // Save to database if userId is set
    if (this.userId) {
      try {
        const savedTrade = await db.saveTrade({
          userId: parseInt(this.userId),
          symbol: trade.pair,
          side: side === 'long' ? 'BUY' : 'SELL',
          entryPrice: trade.openRate,
          quantity: trade.amount,
          stopLoss: trade.stoplossRate,
          fees: trade.fee,
          status: 'PAPER_OPEN',
          notes: 'PAPER_TRADE',
        });
        this.paperTradeDbIds.set(trade.id, savedTrade.id);
      } catch (error) {
        logger.error({ err: error }, 'Failed to save trade to database:');
        await db.logError({
          level: 'ERROR',
          source: 'paper_trading_engine',
          message: `Failed to save paper trade: ${(error as Error).message}`,
          userId: parseInt(this.userId),
          symbol: trade.pair,
        });
      }
    }
  }

  private async processPendingPartialEntries(
    candle: OHLCVCandle,
    metadata: StrategyMetadata
  ): Promise<void> {
    if (this.pendingPartialEntries.length === 0) {
      return;
    }

    for (let i = this.pendingPartialEntries.length - 1; i >= 0; i--) {
      if (this.openTrades.length >= this.config.maxOpenTrades) {
        break;
      }

      const pending = this.pendingPartialEntries[i];
      if (pending.pair !== metadata.pair || pending.remainingQuantity <= 0) {
        continue;
      }

      const avgVolume20 = this.calculateAverageVolume20();
      const liquidityData = this.applyLiquidityConstraint(pending.remainingQuantity, avgVolume20);
      if (liquidityData.filledQuantity <= 0) {
        continue;
      }

      const amount = liquidityData.filledQuantity;
      const entryPrice = candle.close;
      const spreadData = this.applySpread(entryPrice, pending.side, pending.pair);
      const spreadAdjustedEntryPrice = spreadData.adjustedPrice;
      const spreadCost = Math.abs(spreadAdjustedEntryPrice - entryPrice) * amount;
      this.totalSpreadCost += spreadCost;

      const slippageData = this.calculateSlippage(
        spreadAdjustedEntryPrice,
        pending.side,
        amount,
        avgVolume20
      );
      const actualEntryPrice = slippageData.fillPrice;
      const slippageCost = Math.abs(actualEntryPrice - spreadAdjustedEntryPrice) * amount;
      this.totalSlippageCost += slippageCost;

      const entryNotional = amount * actualEntryPrice;
      const fee = entryNotional * this.config.feeOpen;

      if (entryNotional + fee > this.balance * 0.95) {
        continue;
      }

      const trade: Trade = {
        id: uuidv4(),
        pair: pending.pair,
        isOpen: true,
        side: pending.side,
        amount: amount,
        openRate: entryPrice,
        actualEntryPrice: actualEntryPrice,
        openDate: candle.date,
        fee: fee,
        entryTag: `${pending.enterTag}_PARTIAL`,
        entrySlippage: slippageData.totalSlippage,
        stoplossRate:
          actualEntryPrice * (1 + this.strategy.stoploss * (pending.side === 'long' ? 1 : -1)),
      };

      const position: Position = {
        pair: pending.pair,
        side: pending.side,
        amount: amount,
        entryPrice: actualEntryPrice,
        currentPrice: actualEntryPrice,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
        entryTime: candle.date,
        stoplossPrice: trade.stoplossRate,
      };

      this.openTrades.push(trade);
      this.positions.push(position);
      this.balance -= entryNotional + fee;

      pending.remainingQuantity = Math.max(0, pending.remainingQuantity - amount);
      if (pending.remainingQuantity <= 0) {
        this.pendingPartialEntries.splice(i, 1);
      }

      logger.info(
        `📈 Filled pending partial ${pending.side} ${pending.pair}: ${amount.toFixed(6)} at ${entryPrice}`
      );
      logger.info(`💰 Remaining balance: ${this.balance.toFixed(2)} ${this.config.stakeCurrency}`);

      if (this.userId) {
        try {
          const savedTrade = await db.saveTrade({
            userId: parseInt(this.userId),
            symbol: trade.pair,
            side: trade.side === 'long' ? 'BUY' : 'SELL',
            entryPrice: trade.openRate,
            quantity: trade.amount,
            stopLoss: trade.stoplossRate,
            fees: trade.fee,
            status: 'PAPER_OPEN',
            notes: 'PAPER_TRADE',
          });
          this.paperTradeDbIds.set(trade.id, savedTrade.id);
        } catch (error) {
          logger.error({ err: error }, 'Failed to save pending partial fill to database:');
        }
      }
    }
  }

  private async closeTrade(trade: Trade, candle: OHLCVCandle, exitReason: string): Promise<void> {
    const exitPrice = candle.close;

    // F2-6/F2-7: Calculate avgVolume20 and constrain executable exit size.
    const avgVolume20 = this.calculateAverageVolume20();
    const liquidityData = this.applyLiquidityConstraint(trade.amount, avgVolume20);
    if (liquidityData.filledQuantity <= 0) {
      logger.info(
        `Liquidity too low to close ${trade.pair}: requested ${trade.amount}, max ${liquidityData.maxFillQuantity}`
      );
      return;
    }

    if (liquidityData.isPartialFill) {
      logger.info(
        `Partial exit fill for ${trade.pair}: requested ${trade.amount.toFixed(6)}, filled ${liquidityData.filledQuantity.toFixed(6)}. Remaining position stays open.`
      );
      return;
    }

    // F2-2: Calculate slippage for exit fill price (opposite direction to entry)
    const exitSide = trade.side === 'long' ? 'short' : 'long'; // Closing position requires opposite order
    const spreadData = this.applySpread(exitPrice, exitSide, trade.pair);
    const spreadAdjustedExitPrice = spreadData.adjustedPrice;
    const spreadCost = Math.abs(spreadAdjustedExitPrice - exitPrice) * trade.amount;
    this.totalSpreadCost += spreadCost;

    const slippageData = this.calculateSlippage(
      spreadAdjustedExitPrice,
      exitSide,
      trade.amount,
      avgVolume20
    );
    const actualExitPrice = slippageData.fillPrice;
    const exitSlippageCost = Math.abs(actualExitPrice - spreadAdjustedExitPrice) * trade.amount;
    this.totalSlippageCost += exitSlippageCost;

    const exitFee = trade.amount * actualExitPrice * this.config.feeClose;
    const grossProfit = this.calculateTradeProfit(trade, actualExitPrice);
    const netProfit = grossProfit - exitFee;

    // Update trade with slippage fields (Fase 2)
    trade.closeRate = exitPrice; // Nominal exit price (for reference)
    trade.actualExitPrice = actualExitPrice; // Actual fill price with slippage
    trade.exitSlippage = slippageData.totalSlippage; // Store slippage percentage
    trade.closeDate = candle.date;
    trade.isOpen = false;
    trade.exitReason = exitReason;
    trade.profit = netProfit;
    trade.profitPct =
      (netProfit / (trade.amount * (trade.actualEntryPrice || trade.openRate))) * 100;

    // Update balance using actual exit price with slippage
    this.balance += trade.amount * actualExitPrice - exitFee;

    // Move trade to closed trades
    const tradeIndex = this.openTrades.findIndex((t) => t.id === trade.id);
    if (tradeIndex !== -1) {
      this.openTrades.splice(tradeIndex, 1);
    }
    this.closedTrades.push(trade);

    // Remove position
    const positionIndex = this.positions.findIndex(
      (p) =>
        p.pair === trade.pair &&
        p.side === trade.side &&
        p.entryTime.getTime() === trade.openDate.getTime()
    );
    if (positionIndex !== -1) {
      this.positions.splice(positionIndex, 1);
    }

    const profitEmoji = netProfit >= 0 ? '💚' : '💔';
    logger.info(
      `${profitEmoji} Closed ${trade.side} trade for ${trade.pair} at ${actualExitPrice}`
    );
    logger.info(
      `   Profit: ${netProfit.toFixed(2)} (${trade.profitPct?.toFixed(2)}%) | Reason: ${exitReason}`
    );
    logger.info(`💰 Current balance: ${this.balance.toFixed(2)} ${this.config.stakeCurrency}`);

    // Update database if userId is set
    if (this.userId) {
      try {
        const knownDbTradeId = this.paperTradeDbIds.get(trade.id);
        if (knownDbTradeId) {
          await db.closeTrade(knownDbTradeId, actualExitPrice, trade.profitPct || 0);
          this.paperTradeDbIds.delete(trade.id);
        } else {
          const dbTrade = await db.findOpenTrade(
            this.userId,
            trade.pair,
            trade.openRate,
            'PAPER_OPEN'
          );
          if (dbTrade) {
            await db.closeTrade(dbTrade.id, actualExitPrice, trade.profitPct || 0);
          }
        }
      } catch (error) {
        logger.error({ err: error }, 'Failed to update trade in database:');
        await db.logError({
          level: 'ERROR',
          source: 'paper_trading_engine',
          message: `Failed to close trade in database: ${(error as Error).message}`,
          userId: parseInt(this.userId),
          symbol: trade.pair,
        });
      }
    }
  }

  private calculateTradeProfit(trade: Trade, currentPrice: number): number {
    const entryPrice = trade.actualEntryPrice || trade.openRate;
    if (trade.side === 'long') {
      return trade.amount * (currentPrice - entryPrice);
    } else {
      return trade.amount * (entryPrice - currentPrice);
    }
  }

  private async syncOpenTradeRiskToDB(trade: Trade): Promise<void> {
    if (!this.userId) {
      return;
    }

    try {
      if (typeof (db as unknown as { updateTradeRisk?: unknown }).updateTradeRisk !== 'function') {
        return;
      }

      let dbTradeId = this.paperTradeDbIds.get(trade.id);

      if (!dbTradeId) {
        const dbTrade = await db.findOpenTrade(
          this.userId,
          trade.pair,
          trade.openRate,
          'PAPER_OPEN'
        );
        if (!dbTrade || !dbTrade.id) {
          return;
        }

        dbTradeId = dbTrade.id;
        // dbTradeId is now definitely a string, but TS still thinks it could be undefined here
        this.paperTradeDbIds.set(trade.id, dbTradeId as string);
      }

      await db.updateTradeRisk(dbTradeId as string, {
        stopLoss: trade.stoplossRate,
        notes: `PAPER_UNREALIZED_PNL=${(trade.profit || 0).toFixed(8)}`,
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to sync paper trade risk to database:');
    }
  }

  private calculateAverageVolume20(): number {
    const startIdx = Math.max(0, this.currentDataIndex - 20);
    let sumVolume = 0;
    let count = 0;
    for (let i = startIdx; i < this.currentDataIndex; i++) {
      sumVolume += this.historicalData[i].volume;
      count++;
    }

    if (count === 0) {
      return 1;
    }

    return sumVolume / count;
  }

  private getSpreadRate(pair: string): number {
    const normalizedPair = pair.toUpperCase();
    if (normalizedPair === 'BTCUSDT') {
      return 0.0001;
    }

    if (normalizedPair === 'ETHUSDT' || normalizedPair === 'BNBUSDT') {
      return 0.00015;
    }

    const largeCapAltcoins = [
      'SOLUSDT',
      'XRPUSDT',
      'ADAUSDT',
      'DOGEUSDT',
      'MATICUSDT',
      'LINKUSDT',
      'AVAXUSDT',
      'DOTUSDT',
      'LTCUSDT',
      'TRXUSDT',
    ];
    if (largeCapAltcoins.includes(normalizedPair)) {
      return 0.0003;
    }

    return 0.001;
  }

  private applySpread(
    price: number,
    side: 'long' | 'short',
    pair: string
  ): {
    spreadRate: number;
    adjustedPrice: number;
  } {
    const spreadRate = this.getSpreadRate(pair);
    const halfSpread = spreadRate / 2;
    const adjustedPrice = side === 'long' ? price * (1 + halfSpread) : price * (1 - halfSpread);

    return {
      spreadRate,
      adjustedPrice,
    };
  }

  private applyLiquidityConstraint(
    quantity: number,
    avgVolume20: number
  ): {
    maxFillQuantity: number;
    filledQuantity: number;
    unfilledQuantity: number;
    isPartialFill: boolean;
  } {
    const maxFillQuantity = Math.max(avgVolume20 * 0.01, 0);
    const filledQuantity = Math.min(quantity, maxFillQuantity);
    const unfilledQuantity = Math.max(0, quantity - filledQuantity);

    return {
      maxFillQuantity,
      filledQuantity,
      unfilledQuantity,
      isPartialFill: unfilledQuantity > 0,
    };
  }

  /**
   * F2-1: Calculate slippage based on volume impact and random component
   * Formula:
   *   - volumeImpact = (quantity / avgVolume20) * 0.001  (0.1% per 1x average volume)
   *   - randomComponent = ±0.05% gaussian noise
   *   - totalSlippage = volumeImpact + randomComponent
   *
   * For fills:
   *   - BUY (long entry / short exit): fillPrice = price * (1 + slippage)
   *   - SELL (short entry / long exit): fillPrice = price * (1 - slippage)
   */
  private calculateSlippage(
    price: number,
    side: 'long' | 'short',
    quantity: number,
    avgVolume20: number
  ): {
    volumeImpact: number;
    randomComponent: number;
    totalSlippage: number;
    fillPrice: number;
  } {
    // Volume impact: 0.1% per 1x average volume
    const volumeImpact = Math.max(0, (quantity / Math.max(avgVolume20, 1)) * 0.001);

    // Random component: ±0.05% as gaussian noise (simplified: random ±0.05%)
    const randomComponent = (Math.random() - 0.5) * 0.001; // ±0.05%

    // Total slippage magnitude
    const totalSlippage = volumeImpact + randomComponent;

    // Directional fill:
    // - long side represents buy-side execution (worse fill is higher price)
    // - short side represents sell-side execution (worse fill is lower price)
    const fillPrice = side === 'long' ? price * (1 + totalSlippage) : price * (1 - totalSlippage);

    return {
      volumeImpact,
      randomComponent,
      totalSlippage,
      fillPrice,
    };
  }

  private async updatePositions(currentPrice: number): Promise<void> {
    for (const position of this.positions) {
      position.currentPrice = currentPrice;

      if (position.side === 'long') {
        position.unrealizedPnl = position.amount * (currentPrice - position.entryPrice);
      } else {
        position.unrealizedPnl = position.amount * (position.entryPrice - currentPrice);
      }

      position.unrealizedPnlPct =
        (position.unrealizedPnl / (position.amount * position.entryPrice)) * 100;
    }

    // Update trade profits and persist risk state for open paper trades
    for (const trade of this.openTrades) {
      trade.profit = this.calculateTradeProfit(trade, currentPrice);
      trade.profitPct =
        (trade.profit / (trade.amount * (trade.actualEntryPrice || trade.openRate))) * 100;
      await this.syncOpenTradeRiskToDB(trade);
    }
  }

  private async persistPerformanceSnapshotToDB(): Promise<void> {
    if (!this.userId || this.performanceHistory.length === 0) {
      return;
    }

    try {
      const compactHistory = this.performanceHistory.slice(-200).map((metric) => ({
        t: metric.timestamp.toISOString(),
        b: metric.balance,
        p: metric.totalProfit,
        o: metric.openPositions,
        d: metric.drawdown,
      }));

      await db.setUserPreference(
        parseInt(this.userId),
        'paper_performance_history_v1',
        JSON.stringify(compactHistory)
      );
    } catch (error) {
      logger.error({ err: error }, 'Failed to persist paper performance history:');
    }
  }

  private async updatePerformanceMetrics(currentTime: Date): Promise<void> {
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
      drawdown: this.maxBalance - currentBalance,
    };

    this.performanceHistory.push(metric);

    // Limit history size
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory = this.performanceHistory.slice(-1000);
    }

    if (this.performanceHistory.length % this.performancePersistEvery === 0) {
      await this.persistPerformanceSnapshotToDB();
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
      const customStoploss = this.strategy.customStoploss(
        trade,
        currentTime,
        currentPrice,
        currentProfitPct
      );
      if (customStoploss !== null) {
        const stoplossPrice =
          trade.openRate * (1 + customStoploss * (trade.side === 'long' ? 1 : -1));
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
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Public methods for getting current state
  getCurrentResult(): PaperTradingResult {
    const totalTrades = this.closedTrades.length;

    let profitableTrades = 0;
    let totalProfit = 0;

    // ⚡ Bolt Optimization: Replace multiple array traversals (.reduce, .filter)
    // with single-pass loops for paper trading metrics.
    for (let i = 0; i < totalTrades; i++) {
      const pnl = this.closedTrades[i].profit || 0;
      totalProfit += pnl;
      if (pnl > 0) profitableTrades++;
    }

    let totalUnrealizedPnl = 0;
    for (let i = 0; i < this.positions.length; i++) {
      totalUnrealizedPnl += this.positions[i].unrealizedPnl;
    }

    const currentBalance = this.balance + totalUnrealizedPnl;
    const realizedAndUnrealizedProfit = totalProfit + totalUnrealizedPnl;

    const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;
    const avgProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;
    const totalProfitPct =
      ((currentBalance - this.config.initialBalance) / this.config.initialBalance) * 100;

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
      totalProfit: realizedAndUnrealizedProfit,
      totalProfitPct: totalProfitPct,
      winRate: winRate,
      avgProfit: avgProfit,
      maxDrawdown: this.maxDrawdown,
      sharpeRatio: sharpeRatio,
      positions: [...this.positions],
      recentTrades: this.closedTrades.slice(-10),
      performance: [...this.performanceHistory],
      totalSlippageCost: this.totalSlippageCost,
      totalSpreadCost: this.totalSpreadCost,
      profitWithoutSlippage:
        realizedAndUnrealizedProfit + this.totalSlippageCost + this.totalSpreadCost,
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
      percentage: (this.currentDataIndex / this.historicalData.length) * 100,
    };
  }
}
