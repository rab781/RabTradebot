import { db } from './databaseService';
import { binanceOrderService } from './binanceOrderService';
import { RealTradingEngine, realTradingEngine } from './realTradingEngine';
import { BinanceWebSocketService } from './binanceWebSocketService';
import { connectionManager } from './connectionManager';
import { withLogContext } from '../utils/logger';

export interface RiskMonitorConfig {
    pollIntervalMs: number;
    trailingStopPositive: number; // 0.01 = 1%
    circuitBreakerDrawdownPct: number; // 0.15 = 15%
}

export type RiskAlertNotifier = (message: string, userId?: number) => Promise<void> | void;

/** Minimal strategy interface for signal generation on kline close */
export interface SignalStrategy {
    name: string;
    populateIndicators?: (data: any[]) => any[];
    populateEntryTrend?: (data: any[]) => { action?: 'BUY' | 'SELL' | 'HOLD'; confidence?: number; reason?: string } | null;
}

export type KlineSignalNotifier = (
    symbol: string,
    action: 'BUY' | 'SELL',
    confidence: number,
    reason: string,
) => Promise<void> | void;

interface TrailState {
    highestPrice?: number;
    lowestPrice?: number;
}

export class RiskMonitorLoop {
    private readonly engine: RealTradingEngine;
    private readonly config: RiskMonitorConfig;

    private isRunning = false;
    private timer: NodeJS.Timeout | null = null;
    private notifier?: RiskAlertNotifier;
    private trailState = new Map<string, TrailState>();
    private baselineEquityByUser = new Map<number, number>();

    // ── F3-10/F3-11: WebSocket mode ────────────────────────────────────────────
    /** Symbols currently subscribed via WebSocket */
    private wsSymbols = new Set<string>();
    private wsService?: BinanceWebSocketService;
    /** Tracks symbols that have a kline-based signal subscription */
    private klineSignalSymbols = new Set<string>();

    constructor(
        engine: RealTradingEngine,
        config?: Partial<RiskMonitorConfig>,
        notifier?: RiskAlertNotifier,
        wsService?: BinanceWebSocketService,
    ) {
        this.engine = engine;
        this.notifier = notifier;
        this.wsService = wsService;
        this.config = {
            pollIntervalMs: 5000,
            trailingStopPositive: 0.01,
            circuitBreakerDrawdownPct: 0.15,
            ...config,
        };
    }

    setNotifier(notifier: RiskAlertNotifier): void {
        this.notifier = notifier;
    }

    setWsService(wsService: BinanceWebSocketService): void {
        this.wsService = wsService;
    }

    // ── F3-10: WebSocket mode for real-time price updates ─────────────────────

    /**
     * Subscribe to real-time ticker stream for the given symbols.
     * Each price tick directly triggers SL/TP evaluation (no polling delay).
     * Falls back to REST polling if WebSocket is unavailable.
     */
    startWebSocket(symbols: string[]): void {
        if (!this.wsService) {
            withLogContext({ service: 'riskMonitorLoop' }).warn('No wsService set, cannot start WebSocket mode');
            return;
        }

        for (const symbol of symbols) {
            const symUpper = symbol.toUpperCase();
            if (this.wsSymbols.has(symUpper)) continue;
            this.wsSymbols.add(symUpper);

            this.wsService.subscribeTickerStream(symUpper, async (tick) => {
                if (!this.isRunning) return;
                try {
                    const trades = await db.getOpenLiveTrades();
                    const symbolTrades = trades.filter(
                        (t: any) => t.symbol.toUpperCase() === symUpper,
                    );
                    for (const trade of symbolTrades) {
                        await this.updateTrailingStop(trade, tick.lastPrice);
                        await this.evaluateExitTriggers(trade, tick.lastPrice);
                    }
                } catch (err) {
                    withLogContext({ service: 'riskMonitorLoop', symbol: symUpper }).error(
                        { err, phase: 'ws_tick' },
                        'Risk monitor WebSocket tick error',
                    );
                }
            });
        }
    }

    /** Stop WebSocket subscriptions for all symbols */
    stopWebSocket(): void {
        if (!this.wsService) return;
        for (const sym of this.wsSymbols) {
            this.wsService.unsubscribe(sym);
        }
        this.wsSymbols.clear();
    }

    // ── F3-12: executionReport confirmation ───────────────────────────────────

    /**
     * Called when a User Data Stream `executionReport` event arrives for a FILLED order.
     * Syncs the trade status in DB without additional REST polling.
     */
    async handleExecutionReport(orderId: number, status: string): Promise<void> {
        if (status !== 'FILLED') return;
        // Delegate to engine for DB sync — engine already has confirmFill logic
        await (this.engine as any).confirmFill?.(orderId).catch(() => {});
    }

    // ── F3-13: Auto-signal from kline close ───────────────────────────────────

    /**
     * Subscribe to kline close events. On each closed candle, evaluate strategy
     * and notify subscribers if a BUY/SELL signal is generated.
     */
    startKlineSignal(
        symbol: string,
        interval: string,
        strategy: SignalStrategy,
        signalNotifier: KlineSignalNotifier,
    ): void {
        if (!this.wsService) return;

        const symUpper = symbol.toUpperCase();
        const key = `${symUpper}_${interval}`;
        if (this.klineSignalSymbols.has(key)) return;
        this.klineSignalSymbols.add(key);

        this.wsService.subscribeKlineStream(symUpper, interval, async (kline) => {
            if (!kline.isClosed) return;

            try {
                // Use a minimal candle array for strategy evaluation
                const candles = [{
                    date: new Date(kline.closeTime),
                    open: kline.open,
                    high: kline.high,
                    low: kline.low,
                    close: kline.close,
                    volume: kline.volume,
                }];

                const enriched = strategy.populateIndicators?.(candles) ?? candles;
                const result = strategy.populateEntryTrend?.(enriched);

                if (result?.action === 'BUY' || result?.action === 'SELL') {
                    await db.logError({
                        level: 'INFO',
                        source: 'riskMonitorLoop.signal',
                        message: `Signal generated ${symUpper} ${result.action} conf=${(result.confidence ?? 0).toFixed(3)}`,
                        symbol: symUpper,
                        metadata: {
                            interval,
                            action: result.action,
                            confidence: result.confidence ?? 0,
                            reason: result.reason ?? '',
                            strategy: strategy.name,
                        },
                    });

                    await signalNotifier(
                        symUpper,
                        result.action,
                        result.confidence ?? 0,
                        result.reason ?? `${result.action} signal on ${interval} close`,
                    );
                    // Also notify connectionManager signal subscribers (F3-13)
                    connectionManager.notifySignalSubscribers(
                        symUpper,
                        result.action,
                        result.confidence ?? 0,
                        result.reason ?? '',
                    );
                }
            } catch (err) {
                withLogContext({ service: 'riskMonitorLoop', symbol: symUpper }).error(
                    { err, phase: 'kline_signal' },
                    'Risk monitor kline signal error',
                );
            }
        });
    }

    async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;
        await this.tick();
        this.timer = setInterval(() => {
            this.tick().catch((error) => {
                withLogContext({ service: 'riskMonitorLoop' }).error({ err: error }, 'Risk monitor tick error');
            });
        }, this.config.pollIntervalMs);
    }

    stop(): void {
        this.isRunning = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    isActive(): boolean {
        return this.isRunning;
    }

    private async notify(message: string, userId?: number): Promise<void> {
        if (!this.notifier) return;
        await this.notifier(message, userId);
    }

    private async tick(): Promise<void> {
        if (!this.isRunning) return;

        const openTrades = await db.getOpenLiveTrades();
        if (openTrades.length === 0) {
            return;
        }

        for (const trade of openTrades) {
            const symbol = trade.symbol.toUpperCase();
            const currentPrice = await binanceOrderService.getCurrentPrice(symbol);

            await this.updateTrailingStop(trade, currentPrice);
            await this.evaluateExitTriggers(trade, currentPrice);
            await this.evaluateCircuitBreaker(trade.userId);
        }
    }

    private async updateTrailingStop(trade: any, currentPrice: number): Promise<void> {
        const tradeKey = trade.id;
        const state = this.trailState.get(tradeKey) || {};
        const side = trade.side === 'SELL' || trade.side === 'SHORT' ? 'short' : 'long';

        const trailingDelta = this.config.trailingStopPositive;
        const currentStop = trade.stopLoss ?? 0;

        if (side === 'long') {
            const highestPrice = Math.max(state.highestPrice ?? trade.entryPrice, currentPrice);
            state.highestPrice = highestPrice;
            const candidateStop = highestPrice * (1 - trailingDelta);

            if (candidateStop > currentStop) {
                await db.updateTradeRisk(trade.id, {
                    stopLoss: candidateStop,
                    notes: `TRAILING_UPDATE:${candidateStop}`,
                });
                await db.logError({
                    level: 'INFO',
                    source: 'riskMonitorLoop.trailing',
                    message: `Trailing stop updated ${trade.symbol} long ${currentStop.toFixed(6)} -> ${candidateStop.toFixed(6)}`,
                    userId: trade.userId,
                    symbol: trade.symbol,
                    metadata: {
                        tradeId: trade.id,
                        side,
                        currentPrice,
                        highestPrice,
                    },
                });
                trade.stopLoss = candidateStop;
            }
        } else {
            const lowestPrice = Math.min(state.lowestPrice ?? trade.entryPrice, currentPrice);
            state.lowestPrice = lowestPrice;
            const candidateStop = lowestPrice * (1 + trailingDelta);

            if (currentStop <= 0 || candidateStop < currentStop) {
                await db.updateTradeRisk(trade.id, {
                    stopLoss: candidateStop,
                    notes: `TRAILING_UPDATE:${candidateStop}`,
                });
                await db.logError({
                    level: 'INFO',
                    source: 'riskMonitorLoop.trailing',
                    message: `Trailing stop updated ${trade.symbol} short ${currentStop.toFixed(6)} -> ${candidateStop.toFixed(6)}`,
                    userId: trade.userId,
                    symbol: trade.symbol,
                    metadata: {
                        tradeId: trade.id,
                        side,
                        currentPrice,
                        lowestPrice,
                    },
                });
                trade.stopLoss = candidateStop;
            }
        }

        this.trailState.set(tradeKey, state);
    }

    private async evaluateExitTriggers(trade: any, currentPrice: number): Promise<void> {
        const side = trade.side === 'SELL' || trade.side === 'SHORT' ? 'short' : 'long';
        const stopLoss = trade.stopLoss ?? 0;
        const takeProfit = trade.takeProfit ?? 0;

        const stopTriggered = side === 'long'
            ? stopLoss > 0 && currentPrice <= stopLoss
            : stopLoss > 0 && currentPrice >= stopLoss;

        const takeProfitTriggered = side === 'long'
            ? takeProfit > 0 && currentPrice >= takeProfit
            : takeProfit > 0 && currentPrice <= takeProfit;

        if (stopTriggered) {
            await db.logError({
                level: 'INFO',
                source: 'riskMonitorLoop.exitTrigger',
                message: `Stop loss triggered ${trade.symbol} at ${currentPrice.toFixed(6)}`,
                userId: trade.userId,
                symbol: trade.symbol,
                metadata: {
                    tradeId: trade.id,
                    side,
                    stopLoss,
                    currentPrice,
                },
            });
            await this.engine.executeExit(trade.id, 'stop_loss_triggered');
            await this.notify(`🛑 Stop loss triggered for ${trade.symbol} @ ${currentPrice.toFixed(4)}`, trade.userId);
            this.trailState.delete(trade.id);
            return;
        }

        if (takeProfitTriggered) {
            await db.logError({
                level: 'INFO',
                source: 'riskMonitorLoop.exitTrigger',
                message: `Take profit triggered ${trade.symbol} at ${currentPrice.toFixed(6)}`,
                userId: trade.userId,
                symbol: trade.symbol,
                metadata: {
                    tradeId: trade.id,
                    side,
                    takeProfit,
                    currentPrice,
                },
            });
            await this.engine.executeExit(trade.id, 'take_profit_triggered');
            await this.notify(`🎯 Take profit reached for ${trade.symbol} @ ${currentPrice.toFixed(4)}`, trade.userId);
            this.trailState.delete(trade.id);
        }
    }

    private async evaluateCircuitBreaker(userId: number): Promise<void> {
        const balances = await binanceOrderService.getAccountBalance();
        const usdtBalance = balances
            .filter((b) => b.asset === 'USDT')
            .reduce((sum, b) => sum + parseFloat(b.free || '0') + parseFloat(b.locked || '0'), 0);

        if (usdtBalance <= 0) return;

        if (!this.baselineEquityByUser.has(userId)) {
            this.baselineEquityByUser.set(userId, usdtBalance);
            return;
        }

        const baseline = this.baselineEquityByUser.get(userId)!;
        const drawdownPct = baseline > 0 ? (baseline - usdtBalance) / baseline : 0;

        if (drawdownPct < this.config.circuitBreakerDrawdownPct) return;

        const openTrades = await db.getOpenLiveTrades(userId);
        if (openTrades.length === 0) return;

        await this.notify(
            `🚨 CIRCUIT BREAKER aktif (drawdown ${(drawdownPct * 100).toFixed(2)}%). Menutup semua posisi live...`,
            userId,
        );

        await db.logError({
            level: 'INFO',
            source: 'riskMonitorLoop.circuitBreaker',
            message: `Circuit breaker activated drawdown=${(drawdownPct * 100).toFixed(3)}% openTrades=${openTrades.length}`,
            userId,
            metadata: {
                drawdownPct,
                openTrades: openTrades.length,
                baseline,
                usdtBalance,
            },
        });

        await Promise.all(
            openTrades.map(async (trade) => {
                try {
                    await this.engine.executeExit(trade.id, 'circuit_breaker');
                } catch (error) {
                    await db.logError({
                        level: 'ERROR',
                        source: 'risk_monitor_loop',
                        message: `Failed to close trade ${trade.id} during circuit breaker: ${(error as Error).message}`,
                        userId,
                        symbol: trade.symbol,
                    });
                }
            })
        );
    }
}

export const riskMonitorLoop = new RiskMonitorLoop(realTradingEngine);
