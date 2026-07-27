import { IStrategy } from '../types/strategy';
import { SignalResult } from './signalGenerator';
import { db } from './databaseService';
import { binanceOrderService } from './binanceOrderService';

export interface RiskParams {
  riskPerTrade: number; // 0.01 = 1%
  maxPositionSize: number; // fraction of account, e.g. 0.15
  minPositionSize: number; // fraction of account, e.g. 0.01
  maxOpenTrades: number;
  stopLossPctFallback: number; // positive percentage, e.g. 0.03
  expectedWinRate?: number;
  rewardRiskRatio?: number;
}

export interface ExecuteEntryInput {
  userId: number;
  symbol: string;
  signal: SignalResult;
  strategy: IStrategy;
  riskParams: RiskParams;
}

export interface ExecuteEntryResult {
  tradeId: string;
  orderId: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
}

export interface ExitResult {
  tradeId: string;
  exitOrderId: number;
  exitPrice: number;
  reason: string;
}

export type LiveNotifier = (message: string, userId?: number) => Promise<void> | void;

export class RealTradingEngine {
  private notifier?: LiveNotifier;

  constructor(notifier?: LiveNotifier) {
    this.notifier = notifier;
  }

  setNotifier(notifier: LiveNotifier): void {
    this.notifier = notifier;
  }

  private async notify(message: string, userId?: number): Promise<void> {
    if (!this.notifier) return;
    await this.notifier(message, userId);
  }

  async executeEntry(input: ExecuteEntryInput): Promise<ExecuteEntryResult> {
    const { userId, symbol, signal, strategy, riskParams } = input;

    if (signal.action === 'HOLD') {
      throw new Error('Signal is HOLD, no entry executed');
    }

    if (!binanceOrderService.isConfigured()) {
      throw new Error('Binance API key/secret belum diset');
    }

    const upperSymbol = symbol.toUpperCase();

    const [rules, balances, openTradesCount, currentPrice] = await Promise.all([
      binanceOrderService.getSymbolInfo(upperSymbol),
      binanceOrderService.getAccountBalance(),
      db.countOpenLiveTrades(userId),
      binanceOrderService.getCurrentPrice(upperSymbol),
    ]);

    if (openTradesCount >= riskParams.maxOpenTrades) {
      throw new Error(`Open trades limit reached (${openTradesCount}/${riskParams.maxOpenTrades})`);
    }

    const usdtBalance = this.findUsdtBalance(balances);
    if (usdtBalance <= 0) {
      throw new Error('Insufficient USDT balance');
    }

    const side: 'BUY' | 'SELL' = signal.action;

    const stopLoss = this.resolveStopLoss(
      signal,
      side,
      currentPrice,
      riskParams.stopLossPctFallback
    );
    const takeProfit = this.resolveTakeProfit(
      signal,
      side,
      currentPrice,
      stopLoss,
      riskParams.rewardRiskRatio || 2
    );

    const kellyFraction = this.computeKellyFraction(
      riskParams.expectedWinRate ?? 0.52,
      riskParams.rewardRiskRatio ?? 2
    );

    const riskCapital = usdtBalance * riskParams.riskPerTrade;
    const positionCapByKelly =
      usdtBalance *
      this.clamp(kellyFraction, riskParams.minPositionSize, riskParams.maxPositionSize);

    const stopDistance = Math.max(Math.abs(currentPrice - stopLoss), currentPrice * 0.001);
    const qtyByRisk = riskCapital / stopDistance;
    const qtyByCap = positionCapByKelly / currentPrice;
    const rawQty = Math.min(qtyByRisk, qtyByCap);

    const quantity = binanceOrderService.roundToStepSize(rawQty, rules.stepSize);
    if (quantity < rules.minQty) {
      throw new Error(`Quantity too small for ${upperSymbol}. minQty=${rules.minQty}`);
    }

    const notional = quantity * currentPrice;
    if (notional < rules.minNotional) {
      throw new Error(
        `Order notional below minimum (${notional.toFixed(4)} < ${rules.minNotional})`
      );
    }

    if (notional > usdtBalance) {
      throw new Error(`Insufficient balance for notional ${notional.toFixed(2)} USDT`);
    }

    const order = await binanceOrderService.placeMarketOrder(upperSymbol, side, quantity);

    await db.logError({
      level: 'INFO',
      source: 'realTradingEngine.executeEntry',
      message: `LIVE order sent ${upperSymbol} ${side} qty=${quantity}`,
      userId,
      symbol: upperSymbol,
      metadata: {
        side,
        quantity,
        strategyName: strategy.name,
        signalConfidence: signal.confidence,
        orderId: order.orderId,
      },
    });

    const entryPrice =
      parseFloat(order.price || '0') > 0
        ? parseFloat(order.price)
        : parseFloat(order.cummulativeQuoteQty || '0') > 0 &&
            parseFloat(order.executedQty || '0') > 0
          ? parseFloat(order.cummulativeQuoteQty) / parseFloat(order.executedQty)
          : currentPrice;

    const metadata = {
      live: true,
      entryOrderId: order.orderId,
      risk: {
        riskPerTrade: riskParams.riskPerTrade,
        kellyFraction,
      },
    };

    const trade = await db.saveTrade({
      userId,
      symbol: upperSymbol,
      side,
      entryPrice,
      quantity,
      strategyName: strategy.name,
      strategyVersion: strategy.version,
      signalStrength: signal.confidence,
      stopLoss,
      takeProfit,
      notes: `LIVE_ENTRY:${order.orderId}`,
      status: 'LIVE_OPEN',
      tags: JSON.stringify(metadata),
    });

    await this.notify(
      `✅ LIVE ENTRY ${upperSymbol}\nSide: ${side}\nQty: ${quantity}\nEntry: ${entryPrice.toFixed(4)}\nSL: ${stopLoss.toFixed(4)}\nTP: ${takeProfit.toFixed(4)}\nOrder ID: ${order.orderId}`,
      userId
    );

    await db.logError({
      level: 'INFO',
      source: 'realTradingEngine.executeEntry',
      message: `LIVE order confirmed ${upperSymbol} ${side} entry=${entryPrice.toFixed(6)} qty=${quantity}`,
      userId,
      symbol: upperSymbol,
      metadata: {
        orderId: order.orderId,
        entryPrice,
        quantity,
        stopLoss,
        takeProfit,
      },
    });

    return {
      tradeId: trade.id,
      orderId: order.orderId,
      symbol: upperSymbol,
      side,
      quantity,
      entryPrice,
      stopLoss,
      takeProfit,
    };
  }

  async executeExit(tradeId: string, reason: string): Promise<ExitResult> {
    const trade = await db.getTradeById(tradeId);
    if (!trade) {
      throw new Error(`Trade not found: ${tradeId}`);
    }

    const userId = trade.userId;
    const symbol = trade.symbol.toUpperCase();

    const currentPrice = await binanceOrderService.getCurrentPrice(symbol);
    const exitSide: 'BUY' | 'SELL' = trade.side === 'BUY' || trade.side === 'LONG' ? 'SELL' : 'BUY';

    const metadata = this.parseTags(trade.tags);
    const protectiveOrderIds: number[] = Array.isArray(metadata?.protectiveOrderIds)
      ? metadata.protectiveOrderIds.filter((x: unknown) => typeof x === 'number')
      : [];

    for (const orderId of protectiveOrderIds) {
      try {
        await binanceOrderService.cancelOrder(symbol, orderId);
        await db.logError({
          level: 'INFO',
          source: 'realTradingEngine.executeExit',
          message: `Protective order cancelled ${symbol} orderId=${orderId}`,
          userId,
          symbol,
          metadata: {
            tradeId: trade.id,
            orderId,
          },
        });
      } catch {
        await db.logError({
          level: 'WARN',
          source: 'realTradingEngine.executeExit',
          message: `Protective order cancellation failed ${symbol} orderId=${orderId}`,
          userId,
          symbol,
          metadata: {
            tradeId: trade.id,
            orderId,
          },
        });
      }
    }

    const rules = await binanceOrderService.getSymbolInfo(symbol);
    const quantity = binanceOrderService.roundToStepSize(trade.quantity, rules.stepSize);
    if (quantity < rules.minQty) {
      throw new Error(`Rounded quantity below minQty for exit (${quantity} < ${rules.minQty})`);
    }

    const exitOrder = await binanceOrderService.placeMarketOrder(symbol, exitSide, quantity);

    await db.logError({
      level: 'INFO',
      source: 'realTradingEngine.executeExit',
      message: `LIVE exit sent ${symbol} ${exitSide} qty=${quantity} reason=${reason}`,
      userId,
      symbol,
      metadata: {
        tradeId: trade.id,
        reason,
        orderId: exitOrder.orderId,
      },
    });

    const resolvedExitPrice =
      parseFloat(exitOrder.price || '0') > 0
        ? parseFloat(exitOrder.price)
        : parseFloat(exitOrder.cummulativeQuoteQty || '0') > 0 &&
            parseFloat(exitOrder.executedQty || '0') > 0
          ? parseFloat(exitOrder.cummulativeQuoteQty) / parseFloat(exitOrder.executedQty)
          : currentPrice;

    await db.closeTrade(trade.id, resolvedExitPrice, undefined, {
      status: 'CLOSED',
      notes: `LIVE_EXIT:${exitOrder.orderId}:${reason}`,
    });

    await this.notify(
      `📤 LIVE EXIT ${symbol}\nReason: ${reason}\nExit Price: ${resolvedExitPrice.toFixed(4)}\nExit Order ID: ${exitOrder.orderId}`,
      userId
    );

    await db.logError({
      level: 'INFO',
      source: 'realTradingEngine.executeExit',
      message: `LIVE exit confirmed ${symbol} exit=${resolvedExitPrice.toFixed(6)} qty=${quantity} reason=${reason}`,
      userId,
      symbol,
      metadata: {
        tradeId: trade.id,
        exitOrderId: exitOrder.orderId,
        exitPrice: resolvedExitPrice,
        reason,
      },
    });

    return {
      tradeId: trade.id,
      exitOrderId: exitOrder.orderId,
      exitPrice: resolvedExitPrice,
      reason,
    };
  }

  private findUsdtBalance(
    balances: Array<{ asset: string; free: string; locked: string }>
  ): number {
    const usdt = balances.find((b) => b.asset === 'USDT');
    if (!usdt) return 0;
    return parseFloat(usdt.free || '0');
  }

  private resolveStopLoss(
    signal: SignalResult,
    side: 'BUY' | 'SELL',
    currentPrice: number,
    fallbackPct: number
  ): number {
    if (signal.stopLoss > 0) return signal.stopLoss;
    if (side === 'BUY') {
      return currentPrice * (1 - fallbackPct);
    }
    return currentPrice * (1 + fallbackPct);
  }

  private resolveTakeProfit(
    signal: SignalResult,
    side: 'BUY' | 'SELL',
    currentPrice: number,
    stopLoss: number,
    rewardRiskRatio: number
  ): number {
    if (signal.takeProfit > 0) return signal.takeProfit;
    const stopDistance = Math.abs(currentPrice - stopLoss);
    if (side === 'BUY') {
      return currentPrice + stopDistance * rewardRiskRatio;
    }
    return currentPrice - stopDistance * rewardRiskRatio;
  }

  private computeKellyFraction(winRate: number, rewardRiskRatio: number): number {
    if (rewardRiskRatio <= 0) return 0;
    const q = 1 - winRate;
    return winRate - q / rewardRiskRatio;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private parseTags(tags?: string | null): Record<string, unknown> | null {
    if (!tags) return null;
    try {
      return JSON.parse(tags) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export const realTradingEngine = new RealTradingEngine();
