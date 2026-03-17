import { db } from './databaseService';
import { binanceOrderService } from './binanceOrderService';
import { RealTradingEngine, realTradingEngine } from './realTradingEngine';

export interface RiskMonitorConfig {
    pollIntervalMs: number;
    trailingStopPositive: number; // 0.01 = 1%
    circuitBreakerDrawdownPct: number; // 0.15 = 15%
}

export type RiskAlertNotifier = (message: string, userId?: number) => Promise<void> | void;

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

    constructor(engine: RealTradingEngine, config?: Partial<RiskMonitorConfig>, notifier?: RiskAlertNotifier) {
        this.engine = engine;
        this.notifier = notifier;
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

    async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;
        await this.tick();
        this.timer = setInterval(() => {
            this.tick().catch((error) => {
                console.error('Risk monitor tick error:', (error as Error).message);
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
            await this.engine.executeExit(trade.id, 'stop_loss_triggered');
            await this.notify(`🛑 Stop loss triggered for ${trade.symbol} @ ${currentPrice.toFixed(4)}`, trade.userId);
            this.trailState.delete(trade.id);
            return;
        }

        if (takeProfitTriggered) {
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

        for (const trade of openTrades) {
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
        }
    }
}

export const riskMonitorLoop = new RiskMonitorLoop(realTradingEngine);
