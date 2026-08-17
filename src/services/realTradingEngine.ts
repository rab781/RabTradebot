import { IStrategy } from '../types/strategy';
import { SignalResult } from './signalGenerator';
import { db } from './databaseService';
import { BinanceOrderResponse, binanceOrderService } from './binanceOrderService';
import { ExecutionFill, InvalidExecutionCommandError, TradingInstrument, UnsupportedPositionCommandError } from '../domain/execution';
import { ExecutionRouter } from './execution/executionRouter';
import {
    mapLegacyEntrySignalToPosition,
    mapLegacyTradeSideToClosePosition,
    resolveTradeProductFromMetadata,
} from './execution/liveExecutionSemantics';
import { spotOnlyExecutionRouter } from './execution/spotOnlyExecutionRouter';
import {
    binanceRestOperationalState,
    BinanceRestOperationalStatePort,
} from './binanceRestOperationalState';

export interface RiskParams {
    riskPerTrade: number;     // 0.01 = 1%
    maxPositionSize: number;  // fraction of account, e.g. 0.15
    minPositionSize: number;  // fraction of account, e.g. 0.01
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
    private startupRecoveryRequired = false;
    private startupRecoveryComplete = true;

    constructor(
        notifier?: LiveNotifier,
        private readonly executionRouter: Pick<ExecutionRouter, 'executeMarket'> = spotOnlyExecutionRouter,
        private readonly entryOperationalState?: Pick<BinanceRestOperationalStatePort, 'getEntryGate'>,
    ) {
        this.notifier = notifier;
    }

    setNotifier(notifier: LiveNotifier): void {
        this.notifier = notifier;
    }

    /**
     * Production startup gate: live orders must not be submitted until persisted
     * unresolved exchange orders have completed their initial recovery sweep.
     */
    requireStartupRecovery(): void {
        this.startupRecoveryRequired = true;
        this.startupRecoveryComplete = false;
    }

    markStartupRecoveryComplete(): void {
        if (this.startupRecoveryRequired) {
            this.startupRecoveryComplete = true;
        }
    }

    isStartupRecoveryReady(): boolean {
        return !this.startupRecoveryRequired || this.startupRecoveryComplete;
    }

    private async notify(message: string, userId?: number): Promise<void> {
        if (!this.notifier) return;
        await this.notifier(message, userId);
    }

    async executeEntry(input: ExecuteEntryInput): Promise<ExecuteEntryResult> {
        this.assertStartupRecoveryReady();
        const { userId, symbol, signal, strategy, riskParams } = input;

        if (signal.action === 'HOLD') {
            throw new Error('Signal is HOLD, no entry executed');
        }

        if (signal.action === 'SELL') {
            throw new Error(
                'Spot live entry rejected: SELL cannot open a Spot position. Use explicit CLOSE LONG semantics for exits.',
            );
        }

        const position = mapLegacyEntrySignalToPosition('SPOT', signal.action);
        if (!position) {
            throw new Error('Signal is HOLD, no entry executed');
        }

        // DEV1-B: NEW entries fail closed when Binance REST operational health is
        // unknown, stale, or unavailable. Existing LONG exits deliberately do
        // not consult this gate so they can keep retrying as connectivity recovers.
        this.assertNewEntryOperationalReady();

        if (!binanceOrderService.isConfigured()) {
            throw new Error('Binance API key/secret belum diset');
        }

        const upperSymbol = symbol.toUpperCase();
        const instrument = this.resolveUsdtSpotInstrument(upperSymbol);

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

        const side: 'BUY' = 'BUY';

        const stopLoss = this.resolveStopLoss(signal, side, currentPrice, riskParams.stopLossPctFallback);
        const takeProfit = this.resolveTakeProfit(signal, side, currentPrice, stopLoss, riskParams.rewardRiskRatio || 2);

        const kellyFraction = this.computeKellyFraction(
            riskParams.expectedWinRate ?? 0.52,
            riskParams.rewardRiskRatio ?? 2,
        );

        const riskCapital = usdtBalance * riskParams.riskPerTrade;
        const positionCapByKelly = usdtBalance * this.clamp(kellyFraction, riskParams.minPositionSize, riskParams.maxPositionSize);

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
            throw new Error(`Order notional below minimum (${notional.toFixed(4)} < ${rules.minNotional})`);
        }

        if (notional > usdtBalance) {
            throw new Error(`Insufficient balance for notional ${notional.toFixed(2)} USDT`);
        }

        const execution = await this.executionRouter.executeMarket({
            position,
            instrument,
            quantity,
        });
        this.assertSpotExecutionFill(execution, 'BUY', upperSymbol);

        // Never manufacture Spot inventory from the requested quantity.
        // A zero-fill accepted order is persisted as pending with quantity=0
        // until Binance confirms actual execution.
        const trackedQuantity = Math.max(0, execution.executedQuantity);
        const entryPrice = execution.averageFillPrice ?? currentPrice;
        const entryStatus = execution.requiresReconciliation
            ? 'LIVE_ENTRY_PENDING_RECONCILIATION'
            : 'LIVE_OPEN';

        await db.logError({
            level: execution.requiresReconciliation ? 'WARN' : 'INFO',
            source: 'realTradingEngine.executeEntry',
            message: execution.requiresReconciliation
                ? `LIVE Spot entry accepted but requires reconciliation ${upperSymbol} orderId=${execution.orderId}`
                : `LIVE Spot entry confirmed ${upperSymbol} BUY qty=${trackedQuantity}`,
            userId,
            symbol: upperSymbol,
            metadata: {
                product: execution.product,
                side: execution.side,
                requestedQuantity: quantity,
                executedQuantity: execution.executedQuantity,
                strategyName: strategy.name,
                signalConfidence: signal.confidence,
                orderId: execution.orderId,
                status: execution.status,
                requiresReconciliation: execution.requiresReconciliation,
            },
        });

        const metadata = {
            live: true,
            product: 'SPOT',
            positionIntent: 'LONG',
            positionEffect: 'OPEN',
            entryOrderId: execution.orderId,
            executionStatus: execution.status,
            requiresReconciliation: execution.requiresReconciliation,
            requestedQuantity: quantity,
            executedQuantity: execution.executedQuantity,
            entryRequestedQuantity: quantity,
            entryExecutedQuantity: execution.executedQuantity,
            entryCumulativeQuoteQuantity: execution.cumulativeQuoteQuantity,
            entryAverageFillPrice: execution.averageFillPrice ?? null,
            entryPriceProvisional: execution.averageFillPrice === undefined,
            // Updated to the actual terminal executed quantity by reconciliation.
            positionInitialQuantity: trackedQuantity,
            realizedExitQuantityCarry: 0,
            realizedExitQuoteCarry: 0,
            risk: {
                riskPerTrade: riskParams.riskPerTrade,
                kellyFraction,
            },
        };

        const trade = await db.saveTrade({
            userId,
            symbol: upperSymbol,
            side: 'BUY',
            entryPrice,
            quantity: trackedQuantity,
            strategyName: strategy.name,
            strategyVersion: strategy.version,
            signalStrength: signal.confidence,
            stopLoss,
            takeProfit,
            notes: execution.requiresReconciliation
                ? `LIVE_ENTRY_RECONCILIATION:${execution.orderId}`
                : `LIVE_ENTRY:${execution.orderId}`,
            status: entryStatus,
            tags: JSON.stringify(metadata),
        });

        if (execution.requiresReconciliation) {
            await this.attemptImmediateReconciliation(
                execution.orderId,
                upperSymbol,
                userId,
                'POST_SUBMIT_ENTRY',
            );
        }

        await this.notify(
            `✅ LIVE ENTRY ${upperSymbol}\nSide: BUY\nExecuted Qty: ${trackedQuantity}\nEntry: ${entryPrice.toFixed(4)}\nSL: ${stopLoss.toFixed(4)}\nTP: ${takeProfit.toFixed(4)}\nOrder ID: ${execution.orderId}${execution.requiresReconciliation ? '\n⚠️ Exchange response required reconciliation; canonical status check triggered.' : ''}`,
            userId,
        );

        await db.logError({
            level: 'INFO',
            source: 'realTradingEngine.executeEntry',
            message: `LIVE order recorded ${upperSymbol} BUY entry=${entryPrice.toFixed(6)} qty=${trackedQuantity}`,
            userId,
            symbol: upperSymbol,
            metadata: {
                orderId: execution.orderId,
                entryPrice,
                quantity: trackedQuantity,
                status: execution.status,
                requiresReconciliation: execution.requiresReconciliation,
                stopLoss,
                takeProfit,
            },
        });

        return {
            tradeId: trade.id,
            orderId: execution.orderId,
            symbol: upperSymbol,
            side: 'BUY',
            quantity: trackedQuantity,
            entryPrice,
            stopLoss,
            takeProfit,
        };
    }

    async executeExit(tradeId: string, reason: string): Promise<ExitResult> {
        this.assertStartupRecoveryReady();
        const trade = await db.getTradeById(tradeId);
        if (!trade) {
            throw new Error(`Trade not found: ${tradeId}`);
        }

        const userId = trade.userId;
        const symbol = trade.symbol.toUpperCase();

        const metadata = this.parseTags(trade.tags);
        if (trade.status === 'LIVE_EXIT_PENDING_RECONCILIATION') {
            throw new Error(
                `Trade ${trade.id} already has an unresolved Spot exit. Reconcile the existing order before submitting another SELL.`,
            );
        }
        if (trade.status === 'LIVE_ENTRY_PENDING_RECONCILIATION') {
            throw new Error(
                `Trade ${trade.id} entry is still pending reconciliation. Resolve the BUY order before submitting an exit.`,
            );
        }

        const product = resolveTradeProductFromMetadata(metadata);
        const position = mapLegacyTradeSideToClosePosition(product, trade.side as 'BUY' | 'SELL' | 'LONG' | 'SHORT');
        if (product !== 'SPOT') {
            throw new UnsupportedPositionCommandError(
                `Production RealTradingEngine is Spot-only. Persisted trade ${trade.id} has product=${product}.`,
            );
        }

        const instrument = this.resolveUsdtSpotInstrument(symbol);
        const currentPrice = await binanceOrderService.getCurrentPrice(symbol);
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

        const execution = await this.executionRouter.executeMarket({
            position,
            instrument,
            quantity,
        });
        this.assertSpotExecutionFill(execution, 'SELL', symbol);

        const resolvedExitPrice = execution.averageFillPrice ?? currentPrice;

        await db.logError({
            level: execution.requiresReconciliation ? 'WARN' : 'INFO',
            source: 'realTradingEngine.executeExit',
            message: execution.requiresReconciliation
                ? `LIVE Spot exit accepted but requires reconciliation ${symbol} orderId=${execution.orderId}`
                : `LIVE Spot exit confirmed ${symbol} SELL qty=${execution.executedQuantity} reason=${reason}`,
            userId,
            symbol,
            metadata: {
                tradeId: trade.id,
                reason,
                orderId: execution.orderId,
                status: execution.status,
                requestedQuantity: quantity,
                executedQuantity: execution.executedQuantity,
                requiresReconciliation: execution.requiresReconciliation,
            },
        });

        const previousExitCarryQuantity = this.readFiniteMetadataNumber(metadata, 'realizedExitQuantityCarry');
        const previousExitCarryQuote = this.readFiniteMetadataNumber(metadata, 'realizedExitQuoteCarry');

        if (execution.requiresReconciliation) {
            const remainingQuantity = Math.max(0, quantity - execution.executedQuantity);
            const pendingMetadata = {
                ...(metadata ?? {}),
                exitOrderId: execution.orderId,
                exitReason: reason,
                exitStatus: execution.status,
                exitBaseQuantity: quantity,
                exitRequestedQuantity: execution.requestedQuantity,
                exitOrderExecutedQuantity: execution.executedQuantity,
                exitOrderCumulativeQuoteQuantity: execution.cumulativeQuoteQuantity,
                exitOrderAverageFillPrice: execution.averageFillPrice ?? null,
                requiresReconciliation: true,
            };

            await db.updateLiveTradeExecution(trade.id, {
                quantity: remainingQuantity,
                status: 'LIVE_EXIT_PENDING_RECONCILIATION',
                notes: `LIVE_EXIT_RECONCILIATION:${execution.orderId}:${reason}`,
                tags: JSON.stringify(pendingMetadata),
            });
        } else if (previousExitCarryQuantity > 0 || previousExitCarryQuote > 0) {
            await this.finalizeExitWithCarry(
                trade,
                metadata,
                execution.executedQuantity,
                execution.cumulativeQuoteQuantity,
                execution.orderId,
                reason,
                execution.status,
            );
        } else {
            await db.closeTrade(trade.id, resolvedExitPrice, undefined, {
                status: 'CLOSED',
                notes: `LIVE_EXIT:${execution.orderId}:${reason}`,
            });
        }

        if (execution.requiresReconciliation) {
            await this.attemptImmediateReconciliation(
                execution.orderId,
                symbol,
                userId,
                'POST_SUBMIT_EXIT',
            );
        }

        const remainingForNotice = execution.requiresReconciliation
            ? Math.max(0, quantity - execution.executedQuantity)
            : 0;
        await this.notify(
            `📤 LIVE EXIT ${symbol}\nReason: ${reason}\nExecuted Qty: ${execution.executedQuantity}\nExit Price: ${resolvedExitPrice.toFixed(4)}\nExit Order ID: ${execution.orderId}${execution.requiresReconciliation ? `\n⚠️ Exchange response required reconciliation; canonical status check triggered. Initially tracked residual: ${remainingForNotice}` : ''}`,
            userId,
        );

        await db.logError({
            level: 'INFO',
            source: 'realTradingEngine.executeExit',
            message: execution.requiresReconciliation
                ? `LIVE exit quarantined for reconciliation ${symbol} orderId=${execution.orderId}`
                : `LIVE exit recorded ${symbol} exit=${resolvedExitPrice.toFixed(6)} qty=${execution.executedQuantity} reason=${reason}`,
            userId,
            symbol,
            metadata: {
                tradeId: trade.id,
                exitOrderId: execution.orderId,
                exitPrice: resolvedExitPrice,
                reason,
                status: execution.status,
                requiresReconciliation: execution.requiresReconciliation,
            },
        });

        return {
            tradeId: trade.id,
            exitOrderId: execution.orderId,
            exitPrice: resolvedExitPrice,
            reason,
        };
    }

    private async attemptImmediateReconciliation(
        orderId: number,
        symbol: string,
        userId: number,
        eventStatus: string,
    ): Promise<void> {
        try {
            await this.reconcileOrderUpdate(orderId, symbol, eventStatus);
        } catch (error) {
            // The exchange already accepted the order. Never surface this as a
            // submission failure that a caller might retry and duplicate.
            await db.logError({
                level: 'WARN',
                source: 'realTradingEngine.attemptImmediateReconciliation',
                message: `Immediate canonical reconciliation deferred for ${symbol} orderId=${orderId}: ${error instanceof Error ? error.message : String(error)}`,
                userId,
                symbol,
                metadata: { orderId, eventStatus },
            });
        }
    }

    /**
     * Legacy F3 hook kept for compatibility. A FILLED execution report delegates
     * here; the canonical state is always re-read from Binance REST before local
     * state is changed.
     */
    async confirmFill(orderId: number): Promise<void> {
        await this.reconcileOrderUpdate(orderId);
    }

    /**
     * Reconcile one pending live Spot order against Binance's canonical order
     * status. `symbolHint`/`eventStatus` are provenance only; REST remains the
     * source of truth for cumulative execution state.
     */
    async reconcileOrderUpdate(orderId: number, symbolHint?: string, eventStatus?: string): Promise<boolean> {
        const pendingTrade = await db.findPendingLiveTradeByOrderId(orderId, symbolHint);
        if (!pendingTrade) {
            return false;
        }

        const symbol = pendingTrade.symbol.toUpperCase();
        const metadata = this.parseTags(pendingTrade.tags) ?? {};
        const order = await binanceOrderService.getOrderStatus(symbol, orderId);

        if (Number(metadata.entryOrderId) === orderId) {
            await this.reconcileEntryOrder(pendingTrade, metadata, order, eventStatus);
            return true;
        }
        if (Number(metadata.exitOrderId) === orderId) {
            await this.reconcileExitOrder(pendingTrade, metadata, order, eventStatus);
            return true;
        }

        await db.logError({
            level: 'ERROR',
            source: 'realTradingEngine.reconcileOrderUpdate',
            message: `Pending trade ${pendingTrade.id} did not match persisted orderId=${orderId}`,
            userId: pendingTrade.userId,
            symbol,
            metadata: { tradeId: pendingTrade.id, orderId, eventStatus },
        });
        return false;
    }

    /**
     * Startup/recovery sweep. Safe to call repeatedly: every iteration derives
     * state from cumulative Binance order quantities rather than applying deltas.
     */
    async reconcilePendingOrders(): Promise<{ checked: number; reconciled: number; failed: number }> {
        const pendingTrades = await db.getPendingLiveTrades();
        let reconciled = 0;
        let failed = 0;

        for (const trade of pendingTrades) {
            const metadata = this.parseTags(trade.tags) ?? {};
            const orderId = trade.status === 'LIVE_ENTRY_PENDING_RECONCILIATION'
                ? Number(metadata.entryOrderId)
                : Number(metadata.exitOrderId);

            if (!Number.isFinite(orderId) || orderId <= 0) {
                failed += 1;
                await db.logError({
                    level: 'ERROR',
                    source: 'realTradingEngine.reconcilePendingOrders',
                    message: `Pending trade ${trade.id} has no valid Binance order id`,
                    userId: trade.userId,
                    symbol: trade.symbol,
                    metadata: { tradeId: trade.id, status: trade.status },
                });
                continue;
            }

            try {
                const didReconcile = await this.reconcileOrderUpdate(orderId, trade.symbol, 'STARTUP_RECOVERY');
                if (didReconcile) reconciled += 1;
            } catch (error) {
                failed += 1;
                await db.logError({
                    level: 'ERROR',
                    source: 'realTradingEngine.reconcilePendingOrders',
                    message: `Failed to reconcile ${trade.symbol} orderId=${orderId}: ${error instanceof Error ? error.message : String(error)}`,
                    userId: trade.userId,
                    symbol: trade.symbol,
                    metadata: { tradeId: trade.id, orderId, status: trade.status },
                });
            }
        }

        return { checked: pendingTrades.length, reconciled, failed };
    }

    private async reconcileEntryOrder(
        trade: any,
        metadata: Record<string, unknown>,
        order: BinanceOrderResponse,
        eventStatus?: string,
    ): Promise<void> {
        const status = this.normalizeOrderStatus(order.status);
        const expectedOrderId = Number(metadata.entryOrderId);
        this.assertReconciliationOrderIdentity(order, trade.symbol, 'BUY', expectedOrderId);
        const executedQuantity = this.parseRequiredNonNegativeNumber(
            order.executedQty,
            'executedQty',
            trade.symbol,
            order.orderId,
        );
        const requestedQuantity = this.readFiniteMetadataNumber(metadata, 'entryRequestedQuantity');
        if (requestedQuantity > 0 && executedQuantity > requestedQuantity + this.quantityTolerance(requestedQuantity)) {
            throw new InvalidExecutionCommandError(
                `Entry reconciliation overfill detected for ${trade.symbol} orderId=${order.orderId}: executed=${executedQuantity}, requested=${requestedQuantity}.`,
            );
        }
        const cumulativeQuote = this.parseRequiredNonNegativeNumber(
            order.cummulativeQuoteQty,
            'cummulativeQuoteQty',
            trade.symbol,
            order.orderId,
        );
        const averageFillPrice = executedQuantity > 0 && cumulativeQuote > 0
            ? cumulativeQuote / executedQuantity
            : this.parsePositiveNumber(order.price);
        const isTerminal = this.isTerminalOrderStatus(status);
        if (isTerminal && executedQuantity > 0 && averageFillPrice === undefined) {
            throw new InvalidExecutionCommandError(
                `Entry reconciliation has executed inventory but no trustworthy fill price for ${trade.symbol} orderId=${order.orderId}.`,
            );
        }

        const nextMetadata: Record<string, unknown> = {
            ...metadata,
            executionStatus: status,
            entryStatus: status,
            entryExecutedQuantity: executedQuantity,
            executedQuantity,
            entryCumulativeQuoteQuantity: cumulativeQuote,
            entryAverageFillPrice: averageFillPrice ?? null,
            entryPriceProvisional: averageFillPrice === undefined,
            lastReconciledAt: new Date().toISOString(),
            lastExecutionEventStatus: eventStatus ?? null,
        };

        if (!isTerminal) {
            nextMetadata.requiresReconciliation = true;
            nextMetadata.positionInitialQuantity = executedQuantity;
            await db.updateLiveTradeExecution(trade.id, {
                quantity: executedQuantity,
                ...(averageFillPrice !== undefined && { entryPrice: averageFillPrice }),
                status: 'LIVE_ENTRY_PENDING_RECONCILIATION',
                notes: `LIVE_ENTRY_RECONCILIATION:${order.orderId}`,
                tags: JSON.stringify(nextMetadata),
            });
            return;
        }

        if (executedQuantity <= 0) {
            // Terminal zero-fill means no Spot exposure ever existed.
            nextMetadata.requiresReconciliation = false;
            nextMetadata.positionInitialQuantity = 0;
            nextMetadata.entryTerminalStatus = status;
            await db.updateLiveTradeExecution(trade.id, {
                quantity: 0,
                status: 'CANCELLED',
                notes: `LIVE_ENTRY_TERMINAL_ZERO_FILL:${order.orderId}:${status}`,
                tags: JSON.stringify(nextMetadata),
            });
            await this.notify(
                `⚠️ LIVE ENTRY ${trade.symbol} ended ${status} with zero executed quantity. No Spot position was created.`,
                trade.userId,
            );
            return;
        }

        // A terminal order can legitimately finish below requested quantity after
        // cancellation/expiry. The actual executed quantity becomes the position.
        nextMetadata.requiresReconciliation = false;
        nextMetadata.positionInitialQuantity = executedQuantity;
        nextMetadata.entryTerminalStatus = status;
        nextMetadata.entryTerminalShortFill = executedQuantity + this.quantityTolerance(executedQuantity)
            < this.readFiniteMetadataNumber(metadata, 'entryRequestedQuantity');

        await db.updateLiveTradeExecution(trade.id, {
            quantity: executedQuantity,
            ...(averageFillPrice !== undefined && { entryPrice: averageFillPrice }),
            status: 'LIVE_OPEN',
            notes: `LIVE_ENTRY_RECONCILED:${order.orderId}:${status}`,
            tags: JSON.stringify(nextMetadata),
        });

        await db.logError({
            level: status === 'FILLED' ? 'INFO' : 'WARN',
            source: 'realTradingEngine.reconcileEntryOrder',
            message: `Spot entry reconciled ${trade.symbol} orderId=${order.orderId} status=${status} executed=${executedQuantity}`,
            userId: trade.userId,
            symbol: trade.symbol,
            metadata: { tradeId: trade.id, orderId: order.orderId, status, executedQuantity },
        });
    }

    private async reconcileExitOrder(
        trade: any,
        metadata: Record<string, unknown>,
        order: BinanceOrderResponse,
        eventStatus?: string,
    ): Promise<void> {
        const status = this.normalizeOrderStatus(order.status);
        const expectedOrderId = Number(metadata.exitOrderId);
        this.assertReconciliationOrderIdentity(order, trade.symbol, 'SELL', expectedOrderId);
        const executedQuantity = this.parseRequiredNonNegativeNumber(
            order.executedQty,
            'executedQty',
            trade.symbol,
            order.orderId,
        );
        const cumulativeQuote = this.parseRequiredNonNegativeNumber(
            order.cummulativeQuoteQty,
            'cummulativeQuoteQty',
            trade.symbol,
            order.orderId,
        );
        const exitBaseQuantity = this.readFiniteMetadataNumber(metadata, 'exitBaseQuantity') || trade.quantity;
        if (executedQuantity > exitBaseQuantity + this.quantityTolerance(exitBaseQuantity)) {
            throw new InvalidExecutionCommandError(
                `Exit reconciliation overfill detected for ${trade.symbol} orderId=${order.orderId}: executed=${executedQuantity}, base=${exitBaseQuantity}.`,
            );
        }
        const requestedQuantity = this.readFiniteMetadataNumber(metadata, 'exitRequestedQuantity') || exitBaseQuantity;
        const clampedExecuted = Math.min(executedQuantity, exitBaseQuantity);
        const remainingQuantity = Math.max(0, exitBaseQuantity - clampedExecuted);
        const currentAverage = clampedExecuted > 0 && cumulativeQuote > 0
            ? cumulativeQuote / clampedExecuted
            : this.parsePositiveNumber(order.price);
        const effectiveCumulativeQuote = cumulativeQuote > 0
            ? cumulativeQuote
            : (currentAverage !== undefined ? currentAverage * clampedExecuted : 0);
        const carryQuantity = this.readFiniteMetadataNumber(metadata, 'realizedExitQuantityCarry');
        const carryQuote = this.readFiniteMetadataNumber(metadata, 'realizedExitQuoteCarry');
        const reason = String(metadata.exitReason ?? 'reconciliation');
        const isTerminal = this.isTerminalOrderStatus(status);
        if (isTerminal && clampedExecuted > 0 && currentAverage === undefined) {
            throw new InvalidExecutionCommandError(
                `Exit reconciliation has executed inventory but no trustworthy fill price for ${trade.symbol} orderId=${order.orderId}.`,
            );
        }

        const nextMetadata: Record<string, unknown> = {
            ...metadata,
            exitStatus: status,
            exitOrderExecutedQuantity: clampedExecuted,
            exitOrderCumulativeQuoteQuantity: effectiveCumulativeQuote,
            exitOrderAverageFillPrice: currentAverage ?? null,
            lastReconciledAt: new Date().toISOString(),
            lastExecutionEventStatus: eventStatus ?? null,
        };

        if (!isTerminal) {
            nextMetadata.requiresReconciliation = true;
            await db.updateLiveTradeExecution(trade.id, {
                quantity: remainingQuantity,
                status: 'LIVE_EXIT_PENDING_RECONCILIATION',
                notes: `LIVE_EXIT_RECONCILIATION:${order.orderId}:${reason}`,
                tags: JSON.stringify(nextMetadata),
            });
            return;
        }

        const totalRealizedQuantity = carryQuantity + clampedExecuted;
        const totalRealizedQuote = carryQuote + effectiveCumulativeQuote;
        const positionInitialQuantity = this.readFiniteMetadataNumber(metadata, 'positionInitialQuantity')
            || Math.max(totalRealizedQuantity + remainingQuantity, requestedQuantity);
        const fullyFlat = remainingQuantity <= this.quantityTolerance(exitBaseQuantity);

        if (fullyFlat) {
            await this.finalizeReconciledExit(
                trade,
                nextMetadata,
                totalRealizedQuantity,
                totalRealizedQuote,
                positionInitialQuantity,
                order.orderId,
                reason,
                status,
            );
            return;
        }

        // Terminal short-fill: the order is no longer live, so resume risk
        // management on the residual inventory and carry realized fills forward.
        nextMetadata.requiresReconciliation = false;
        nextMetadata.realizedExitQuantityCarry = totalRealizedQuantity;
        nextMetadata.realizedExitQuoteCarry = totalRealizedQuote;
        nextMetadata.lastTerminalExitOrderId = order.orderId;
        nextMetadata.lastTerminalExitStatus = status;
        nextMetadata.exitOrderId = null;
        nextMetadata.exitBaseQuantity = null;
        nextMetadata.exitRequestedQuantity = null;

        await db.updateLiveTradeExecution(trade.id, {
            quantity: remainingQuantity,
            status: 'LIVE_OPEN',
            notes: `LIVE_EXIT_PARTIAL_TERMINAL:${order.orderId}:${status}:${reason}`,
            tags: JSON.stringify(nextMetadata),
        });

        await this.notify(
            `⚠️ LIVE EXIT ${trade.symbol} ended ${status} with residual inventory ${remainingQuantity}. Risk monitoring resumed for the remaining Spot position.`,
            trade.userId,
        );
    }

    private async finalizeExitWithCarry(
        trade: any,
        metadata: Record<string, unknown> | null,
        currentExecutedQuantity: number,
        currentCumulativeQuote: number,
        orderId: number,
        reason: string,
        orderStatus: string,
    ): Promise<void> {
        const safeMetadata = metadata ?? {};
        const carryQuantity = this.readFiniteMetadataNumber(safeMetadata, 'realizedExitQuantityCarry');
        const carryQuote = this.readFiniteMetadataNumber(safeMetadata, 'realizedExitQuoteCarry');
        const totalQuantity = carryQuantity + Math.max(0, currentExecutedQuantity);
        const totalQuote = carryQuote + Math.max(0, currentCumulativeQuote);
        const positionInitialQuantity = this.readFiniteMetadataNumber(safeMetadata, 'positionInitialQuantity')
            || totalQuantity;

        await this.finalizeReconciledExit(
            trade,
            safeMetadata,
            totalQuantity,
            totalQuote,
            positionInitialQuantity,
            orderId,
            reason,
            orderStatus,
        );
    }

    private async finalizeReconciledExit(
        trade: any,
        metadata: Record<string, unknown>,
        totalExitQuantity: number,
        totalExitQuote: number,
        positionInitialQuantity: number,
        orderId: number,
        reason: string,
        orderStatus: string,
    ): Promise<void> {
        const safeExitQuantity = Math.max(0, totalExitQuantity);
        const exitPrice = safeExitQuantity > 0 && totalExitQuote > 0
            ? totalExitQuote / safeExitQuantity
            : trade.entryPrice;
        const realizedProfit = totalExitQuote - (trade.entryPrice * safeExitQuantity);
        const costBasis = trade.entryPrice * Math.max(positionInitialQuantity, safeExitQuantity);
        const profitPct = costBasis > 0 ? (realizedProfit / costBasis) * 100 : 0;

        const finalMetadata: Record<string, unknown> = {
            ...metadata,
            requiresReconciliation: false,
            exitOrderId: orderId,
            exitStatus: orderStatus,
            realizedExitQuantityCarry: safeExitQuantity,
            realizedExitQuoteCarry: totalExitQuote,
            finalExitQuantity: safeExitQuantity,
            finalExitQuote: totalExitQuote,
            finalExitAveragePrice: exitPrice,
            finalExitReason: reason,
            reconciledClosedAt: new Date().toISOString(),
        };

        await db.updateLiveTradeExecution(trade.id, {
            quantity: Math.max(positionInitialQuantity, safeExitQuantity),
            exitPrice,
            exitTime: new Date(),
            status: 'CLOSED',
            profit: realizedProfit,
            profitPct,
            notes: `LIVE_EXIT_RECONCILED:${orderId}:${orderStatus}:${reason}`,
            tags: JSON.stringify(finalMetadata),
        });

        await this.notify(
            `✅ LIVE EXIT RECONCILED ${trade.symbol}\nOrder ID: ${orderId}\nStatus: ${orderStatus}\nFinal Qty: ${safeExitQuantity}\nAverage Exit: ${exitPrice.toFixed(4)}`,
            trade.userId,
        );
    }

    private assertReconciliationOrderIdentity(
        order: BinanceOrderResponse,
        expectedSymbol: string,
        expectedSide: 'BUY' | 'SELL',
        expectedOrderId: number,
    ): void {
        if (!Number.isFinite(expectedOrderId) || expectedOrderId <= 0 || Number(order.orderId) !== expectedOrderId) {
            throw new InvalidExecutionCommandError(
                `Reconciliation order id mismatch: expected=${expectedOrderId}, actual=${order.orderId}.`,
            );
        }
        if (String(order.symbol || '').toUpperCase() !== expectedSymbol.toUpperCase()) {
            throw new InvalidExecutionCommandError(
                `Reconciliation order symbol mismatch: expected=${expectedSymbol}, actual=${order.symbol}.`,
            );
        }
        if (order.side !== expectedSide) {
            throw new InvalidExecutionCommandError(
                `Reconciliation order side mismatch: expected=${expectedSide}, actual=${order.side}.`,
            );
        }
    }

    private normalizeOrderStatus(status: string | undefined): string {
        return String(status || 'UNKNOWN').toUpperCase();
    }

    private isTerminalOrderStatus(status: string): boolean {
        return ['FILLED', 'CANCELED', 'CANCELLED', 'EXPIRED', 'EXPIRED_IN_MATCH', 'REJECTED'].includes(status);
    }

    private parseRequiredNonNegativeNumber(
        value: string | number | undefined,
        field: string,
        symbol: string,
        orderId: number,
    ): number {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
            throw new InvalidExecutionCommandError(
                `Invalid Binance reconciliation field ${field}=${String(value)} for ${symbol} orderId=${orderId}.`,
            );
        }
        return parsed;
    }

    private parsePositiveNumber(value: string | number | undefined): number | undefined {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }

    private readFiniteMetadataNumber(metadata: Record<string, unknown> | null, key: string): number {
        const parsed = Number(metadata?.[key] ?? 0);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    }

    private quantityTolerance(quantity: number): number {
        return Math.max(1e-12, Math.abs(quantity) * 1e-12);
    }

    private assertStartupRecoveryReady(): void {
        if (!this.isStartupRecoveryReady()) {
            throw new InvalidExecutionCommandError(
                'Live Spot execution is blocked until startup order reconciliation completes successfully.',
            );
        }
    }

    private assertNewEntryOperationalReady(): void {
        if (!this.entryOperationalState) {
            return;
        }

        const configuredTtl = Number(
            process.env.BINANCE_REST_ENTRY_HEALTH_TTL_MS ?? '60000',
        );
        const healthyTtlMs = Number.isFinite(configuredTtl) && configuredTtl >= 5_000
            ? configuredTtl
            : 60_000;

        const gate = this.entryOperationalState.getEntryGate(
            Date.now(),
            healthyTtlMs,
        );

        if (!gate.allowed) {
            throw new InvalidExecutionCommandError(
                `Live Spot NEW entry blocked by Binance REST operational gate: ${gate.blockers.join(', ')}`,
            );
        }
    }

    private resolveUsdtSpotInstrument(symbol: string): TradingInstrument {
        const normalized = symbol.trim().toUpperCase();
        if (!normalized.endsWith('USDT') || normalized.length <= 4) {
            throw new InvalidExecutionCommandError(
                `Production RealTradingEngine currently supports explicit Binance Spot USDT pairs only. Received ${symbol}.`,
            );
        }

        return {
            symbol: normalized,
            baseAsset: normalized.slice(0, -4),
            quoteAsset: 'USDT',
        };
    }

    private assertSpotExecutionFill(
        fill: ExecutionFill,
        expectedSide: 'BUY' | 'SELL',
        expectedSymbol: string,
    ): void {
        if (fill.product !== 'SPOT') {
            throw new InvalidExecutionCommandError(
                `ExecutionRouter returned unexpected product=${fill.product} for Spot live trading.`,
            );
        }
        if (fill.side !== expectedSide) {
            throw new InvalidExecutionCommandError(
                `ExecutionRouter returned unexpected side=${fill.side}; expected ${expectedSide}.`,
            );
        }
        if (fill.symbol.toUpperCase() !== expectedSymbol.toUpperCase()) {
            throw new InvalidExecutionCommandError(
                `ExecutionRouter returned unexpected symbol=${fill.symbol}; expected ${expectedSymbol}.`,
            );
        }

        const requestedQuantity = Number(fill.requestedQuantity);
        const executedQuantity = Number(fill.executedQuantity);
        if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
            throw new InvalidExecutionCommandError(
                `ExecutionRouter returned invalid requestedQuantity=${fill.requestedQuantity} for ${expectedSymbol}.`,
            );
        }
        if (!Number.isFinite(executedQuantity) || executedQuantity < 0) {
            throw new InvalidExecutionCommandError(
                `ExecutionRouter returned invalid executedQuantity=${fill.executedQuantity} for ${expectedSymbol}.`,
            );
        }
        if (executedQuantity > requestedQuantity + this.quantityTolerance(requestedQuantity)) {
            throw new InvalidExecutionCommandError(
                `ExecutionRouter returned an impossible Spot overfill for ${expectedSymbol}: executed=${executedQuantity}, requested=${requestedQuantity}.`,
            );
        }
    }

    private findUsdtBalance(balances: Array<{ asset: string; free: string; locked: string }>): number {
        const usdt = balances.find((b) => b.asset === 'USDT');
        if (!usdt) return 0;
        return parseFloat(usdt.free || '0');
    }

    private resolveStopLoss(signal: SignalResult, side: 'BUY' | 'SELL', currentPrice: number, fallbackPct: number): number {
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
        rewardRiskRatio: number,
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

export const realTradingEngine = new RealTradingEngine(
    undefined,
    spotOnlyExecutionRouter,
    binanceRestOperationalState,
);
