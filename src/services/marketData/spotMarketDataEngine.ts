import { EventEmitter } from 'events';
import {
    SpotAggregateTrade,
    SpotBookTicker,
    SpotMarketCandle,
    SpotMarketDataEvent,
    SpotMarketDataHealth,
    SpotMarketDataSnapshot,
    SpotMarketDataStatus,
    SpotRestMarketDataPort,
    SpotWebSocketLifecycleEvent,
    SpotWebSocketPort,
} from './spotMarketDataTypes';

export interface SpotMarketDataEngineOptions {
    symbol: string;
    interval: string;
    candleBootstrapLimit?: number;
    aggregateTradeBootstrapLimit?: number;
    maxCandleCache?: number;
    maxAggregateTradeCache?: number;
    staleAfterMs?: number;
    enableStaleMonitor?: boolean;
}

const FIXED_INTERVAL_MS: Record<string, number> = {
    '1s': 1_000,
    '1m': 60_000,
    '3m': 3 * 60_000,
    '5m': 5 * 60_000,
    '15m': 15 * 60_000,
    '30m': 30 * 60_000,
    '1h': 60 * 60_000,
    '2h': 2 * 60 * 60_000,
    '4h': 4 * 60 * 60_000,
    '6h': 6 * 60 * 60_000,
    '8h': 8 * 60 * 60_000,
    '12h': 12 * 60 * 60_000,
    '1d': 24 * 60 * 60_000,
    '3d': 3 * 24 * 60 * 60_000,
    '1w': 7 * 24 * 60 * 60_000,
};

export class SpotMarketDataEngine extends EventEmitter {
    private readonly symbol: string;
    private readonly interval: string;
    private readonly candleBootstrapLimit: number;
    private readonly aggregateTradeBootstrapLimit: number;
    private readonly maxCandleCache: number;
    private readonly maxAggregateTradeCache: number;
    private readonly staleAfterMs: number;
    private readonly enableStaleMonitor: boolean;

    private candles: SpotMarketCandle[] = [];
    private aggregateTrades: SpotAggregateTrade[] = [];
    private bookTicker?: SpotBookTicker;
    private preBootstrapBuffer: SpotMarketDataEvent[] = [];
    private buffering = false;
    private staleTimer?: NodeJS.Timeout;
    private running = false;

    private healthState: SpotMarketDataHealth;

    constructor(
        private readonly rest: SpotRestMarketDataPort,
        private readonly ws: SpotWebSocketPort,
        options: SpotMarketDataEngineOptions,
    ) {
        super();
        this.symbol = options.symbol.toUpperCase();
        this.interval = options.interval;
        this.candleBootstrapLimit = options.candleBootstrapLimit ?? 500;
        this.aggregateTradeBootstrapLimit = options.aggregateTradeBootstrapLimit ?? 500;
        this.maxCandleCache = options.maxCandleCache ?? Math.max(this.candleBootstrapLimit, 1_000);
        this.maxAggregateTradeCache = options.maxAggregateTradeCache ?? Math.max(this.aggregateTradeBootstrapLimit, 5_000);
        this.staleAfterMs = options.staleAfterMs ?? 10_000;
        this.enableStaleMonitor = options.enableStaleMonitor ?? true;
        this.healthState = this.makeInitialHealth('STOPPED');

        if (this.candleBootstrapLimit <= 0 || this.aggregateTradeBootstrapLimit <= 0) {
            throw new Error('Bootstrap limits must be positive.');
        }
        if (this.maxCandleCache < this.candleBootstrapLimit) {
            throw new Error('maxCandleCache cannot be smaller than candleBootstrapLimit.');
        }
        if (this.maxAggregateTradeCache < this.aggregateTradeBootstrapLimit) {
            throw new Error('maxAggregateTradeCache cannot be smaller than aggregateTradeBootstrapLimit.');
        }
    }

    async start(): Promise<void> {
        if (this.running) {
            return;
        }
        this.running = true;
        this.setStatus('BOOTSTRAPPING');
        this.buffering = true;
        this.preBootstrapBuffer = [];

        try {
            // WebSocket-first: buffer realtime events while REST bootstrap is in flight.
            await this.ws.connect(
                this.symbol,
                this.interval,
                (event) => this.handleIncomingEvent(event),
                (event) => this.handleLifecycle(event),
            );

            const [candles, bookTicker, trades] = await Promise.all([
                this.rest.fetchKlines(this.symbol, this.interval, this.candleBootstrapLimit),
                this.rest.fetchBookTicker(this.symbol),
                this.rest.fetchAggregateTrades(this.symbol, this.aggregateTradeBootstrapLimit),
            ]);

            this.validateBootstrap(candles, bookTicker, trades);
            this.candles = candles.slice(-this.maxCandleCache);
            this.bookTicker = bookTicker;
            this.aggregateTrades = trades.slice(-this.maxAggregateTradeCache);

            const buffered = this.preBootstrapBuffer;
            this.preBootstrapBuffer = [];
            this.buffering = false;
            for (const event of buffered) {
                this.applyEvent(event, true);
            }

            const bootstrappedAt = Date.now();
            this.healthState.bootstrappedAt = bootstrappedAt;
            this.healthState.lastMessageAt = this.healthState.lastMessageAt ?? bootstrappedAt;
            this.setStatus('LIVE');
            if (this.enableStaleMonitor) {
                this.startStaleMonitor();
            }
            this.emit('ready', this.getSnapshot());
        } catch (error) {
            this.buffering = false;
            this.running = false;
            await this.ws.close();
            this.setStatus('STOPPED');
            throw error;
        }
    }

    async stop(): Promise<void> {
        this.running = false;
        this.buffering = false;
        this.preBootstrapBuffer = [];
        if (this.staleTimer) {
            clearInterval(this.staleTimer);
            this.staleTimer = undefined;
        }
        await this.ws.close();
        this.setStatus('STOPPED');
    }

    getSnapshot(): SpotMarketDataSnapshot {
        return {
            symbol: this.symbol,
            interval: this.interval,
            candles: this.candles.map((item) => ({ ...item })),
            bookTicker: this.bookTicker ? { ...this.bookTicker } : undefined,
            aggregateTrades: this.aggregateTrades.map((item) => ({ ...item })),
            health: { ...this.healthState },
        };
    }

    getHealth(): SpotMarketDataHealth {
        return { ...this.healthState };
    }

    checkStaleness(now = Date.now()): SpotMarketDataStatus {
        if (!this.running || this.healthState.status === 'STOPPED' || this.healthState.status === 'BOOTSTRAPPING') {
            return this.healthState.status;
        }
        const lastMessageAt = this.healthState.lastMessageAt;
        if (lastMessageAt !== undefined && now - lastMessageAt > this.staleAfterMs) {
            this.setStatus('STALE');
        } else if (this.ws.isConnected() && this.healthState.status === 'STALE') {
            this.setStatus('LIVE');
        }
        return this.healthState.status;
    }

    private makeInitialHealth(status: SpotMarketDataStatus): SpotMarketDataHealth {
        return {
            status,
            symbol: this.symbol,
            interval: this.interval,
            reconnectCount: 0,
            duplicateEvents: 0,
            outOfOrderEvents: 0,
            tradeGapCount: 0,
            candleGapCount: 0,
            ignoredWrongSymbolEvents: 0,
        };
    }

    private setStatus(status: SpotMarketDataStatus): void {
        if (this.healthState.status === status) {
            return;
        }
        this.healthState.status = status;
        this.emit('status', status);
    }

    private startStaleMonitor(): void {
        if (this.staleTimer) {
            clearInterval(this.staleTimer);
        }
        const frequency = Math.max(250, Math.min(1_000, Math.floor(this.staleAfterMs / 2)));
        this.staleTimer = setInterval(() => this.checkStaleness(), frequency);
        this.staleTimer.unref?.();
    }

    private handleLifecycle(event: SpotWebSocketLifecycleEvent): void {
        if (event.type === 'reconnecting') {
            this.healthState.reconnectCount += 1;
            if (this.running) {
                this.setStatus('RECONNECTING');
            }
        } else if (event.type === 'connected') {
            if (this.running && !this.buffering && this.healthState.status !== 'BOOTSTRAPPING') {
                this.setStatus('LIVE');
            }
        } else if (event.type === 'disconnected') {
            if (this.running && !this.buffering) {
                this.setStatus('RECONNECTING');
            }
        }
        this.emit('lifecycle', event);
    }

    private handleIncomingEvent(event: SpotMarketDataEvent): void {
        const symbol = event.data.symbol.toUpperCase();
        if (symbol !== this.symbol) {
            this.healthState.ignoredWrongSymbolEvents += 1;
            return;
        }
        this.healthState.lastMessageAt = event.data.receivedAt;
        if (this.buffering) {
            this.preBootstrapBuffer.push(event);
            return;
        }
        this.applyEvent(event);
        if (this.healthState.status === 'STALE' && this.ws.isConnected()) {
            this.setStatus('LIVE');
        }
    }

    private validateBootstrap(
        candles: SpotMarketCandle[],
        ticker: SpotBookTicker,
        trades: SpotAggregateTrade[],
    ): void {
        if (candles.length === 0) {
            throw new Error('Binance Spot bootstrap returned no candles.');
        }
        if (ticker.symbol.toUpperCase() !== this.symbol) {
            throw new Error('Binance Spot bootstrap bookTicker symbol mismatch.');
        }
        if (trades.length === 0) {
            throw new Error('Binance Spot bootstrap returned no aggregate trades.');
        }

        let lastOpenTime = -Infinity;
        for (const candle of candles) {
            if (candle.symbol.toUpperCase() !== this.symbol || candle.interval !== this.interval) {
                throw new Error('Binance Spot bootstrap candle symbol/interval mismatch.');
            }
            if (candle.openTime <= lastOpenTime) {
                throw new Error('Binance Spot bootstrap candles are duplicated or out of order.');
            }
            lastOpenTime = candle.openTime;
        }

        let lastTradeId = -Infinity;
        for (const trade of trades) {
            if (trade.symbol.toUpperCase() !== this.symbol) {
                throw new Error('Binance Spot bootstrap aggregate-trade symbol mismatch.');
            }
            if (trade.id <= lastTradeId) {
                throw new Error('Binance Spot bootstrap aggregate trades are duplicated or out of order.');
            }
            lastTradeId = trade.id;
        }
    }

    private applyEvent(event: SpotMarketDataEvent, bootstrapReplay = false): void {
        if (event.type === 'candle') {
            this.applyCandle(event.data, bootstrapReplay);
        } else if (event.type === 'bookTicker') {
            this.applyBookTicker(event.data, bootstrapReplay);
        } else {
            this.applyAggregateTrade(event.data, bootstrapReplay);
        }
        this.emit(event.type, { ...event.data });
    }

    private applyCandle(candle: SpotMarketCandle, bootstrapReplay = false): void {
        if (candle.interval !== this.interval) {
            this.healthState.outOfOrderEvents += 1;
            return;
        }
        const last = this.candles[this.candles.length - 1];
        if (!last) {
            this.candles.push(candle);
            return;
        }
        if (candle.openTime < last.openTime) {
            if (!bootstrapReplay) this.healthState.outOfOrderEvents += 1;
            return;
        }
        if (candle.openTime === last.openTime) {
            if (bootstrapReplay && candle.receivedAt <= last.receivedAt) {
                return;
            }
            if (
                candle.close === last.close &&
                candle.volume === last.volume &&
                candle.closed === last.closed &&
                candle.receivedAt === last.receivedAt
            ) {
                this.healthState.duplicateEvents += 1;
                return;
            }
            this.candles[this.candles.length - 1] = candle;
            return;
        }

        const intervalMs = FIXED_INTERVAL_MS[this.interval];
        if (intervalMs && candle.openTime > last.openTime + intervalMs) {
            this.healthState.candleGapCount += 1;
            this.emit('gap', {
                type: 'candle',
                expectedOpenTime: last.openTime + intervalMs,
                receivedOpenTime: candle.openTime,
            });
        }
        this.candles.push(candle);
        if (this.candles.length > this.maxCandleCache) {
            this.candles.splice(0, this.candles.length - this.maxCandleCache);
        }
    }

    private applyBookTicker(ticker: SpotBookTicker, bootstrapReplay = false): void {
        const current = this.bookTicker;
        if (current && ticker.updateId > 0 && current.updateId > 0) {
            if (ticker.updateId < current.updateId) {
                if (!bootstrapReplay) this.healthState.outOfOrderEvents += 1;
                return;
            }
            if (ticker.updateId === current.updateId) {
                if (
                    ticker.bidPrice === current.bidPrice &&
                    ticker.askPrice === current.askPrice &&
                    ticker.bidQty === current.bidQty &&
                    ticker.askQty === current.askQty
                ) {
                    if (!bootstrapReplay) this.healthState.duplicateEvents += 1;
                    return;
                }
            }
        }
        this.bookTicker = ticker;
    }

    private applyAggregateTrade(trade: SpotAggregateTrade, bootstrapReplay = false): void {
        const last = this.aggregateTrades[this.aggregateTrades.length - 1];
        if (last) {
            if (trade.id === last.id) {
                if (!bootstrapReplay) this.healthState.duplicateEvents += 1;
                return;
            }
            if (trade.id < last.id) {
                if (!bootstrapReplay) this.healthState.outOfOrderEvents += 1;
                return;
            }
            if (trade.id > last.id + 1) {
                this.healthState.tradeGapCount += 1;
                this.emit('gap', {
                    type: 'aggTrade',
                    expectedId: last.id + 1,
                    receivedId: trade.id,
                });
            }
        }
        this.aggregateTrades.push(trade);
        if (this.aggregateTrades.length > this.maxAggregateTradeCache) {
            this.aggregateTrades.splice(0, this.aggregateTrades.length - this.maxAggregateTradeCache);
        }
    }
}
