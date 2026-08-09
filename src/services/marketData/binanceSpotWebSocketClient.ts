import WebSocket from 'ws';
import {
    SpotAggregateTrade,
    SpotBookTicker,
    SpotMarketCandle,
    SpotMarketDataEvent,
    SpotWebSocketLifecycleEvent,
    SpotWebSocketPort,
} from './spotMarketDataTypes';

const DEFAULT_STREAM_BASE_URL = 'wss://data-stream.binance.vision';

function finiteNumber(value: unknown, field: string): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid Binance Spot WS ${field}: ${String(value)}`);
    }
    return parsed;
}

function positive(value: number, field: string): number {
    if (value <= 0) {
        throw new Error(`Invalid Binance Spot WS ${field}: ${value}`);
    }
    return value;
}

export function buildBinanceSpotCombinedStreamUrl(
    symbol: string,
    interval: string,
    baseUrl = DEFAULT_STREAM_BASE_URL,
): string {
    const lower = symbol.toLowerCase();
    const streams = [
        `${lower}@bookTicker`,
        `${lower}@aggTrade`,
        `${lower}@kline_${interval}`,
    ];
    return `${baseUrl.replace(/\/$/, '')}/stream?streams=${streams.join('/')}`;
}

export function parseCombinedSpotStreamMessage(raw: unknown, receivedAt = Date.now()): SpotMarketDataEvent | null {
    const envelope = raw as Record<string, unknown>;
    if (!envelope || typeof envelope !== 'object') {
        throw new Error('Malformed Binance Spot combined stream envelope.');
    }

    const stream = typeof envelope.stream === 'string' ? envelope.stream : '';
    const data = envelope.data as Record<string, unknown>;
    if (!stream || !data || typeof data !== 'object') {
        throw new Error('Malformed Binance Spot combined stream message.');
    }

    if (stream.endsWith('@bookTicker')) {
        const bidPrice = positive(finiteNumber(data.b, 'bookTicker.bidPrice'), 'bookTicker.bidPrice');
        const bidQty = positive(finiteNumber(data.B, 'bookTicker.bidQty'), 'bookTicker.bidQty');
        const askPrice = positive(finiteNumber(data.a, 'bookTicker.askPrice'), 'bookTicker.askPrice');
        const askQty = positive(finiteNumber(data.A, 'bookTicker.askQty'), 'bookTicker.askQty');
        if (bidPrice >= askPrice) {
            throw new Error('Crossed or locked Binance Spot WS top-of-book.');
        }
        const ticker: SpotBookTicker = {
            symbol: String(data.s).toUpperCase(),
            updateId: finiteNumber(data.u, 'bookTicker.updateId'),
            bidPrice,
            bidQty,
            askPrice,
            askQty,
            source: 'WS',
            receivedAt,
        };
        return { type: 'bookTicker', data: ticker };
    }

    if (stream.endsWith('@aggTrade')) {
        const trade: SpotAggregateTrade = {
            symbol: String(data.s).toUpperCase(),
            id: finiteNumber(data.a, 'aggTrade.id'),
            price: positive(finiteNumber(data.p, 'aggTrade.price'), 'aggTrade.price'),
            quantity: positive(finiteNumber(data.q, 'aggTrade.quantity'), 'aggTrade.quantity'),
            firstTradeId: finiteNumber(data.f, 'aggTrade.firstTradeId'),
            lastTradeId: finiteNumber(data.l, 'aggTrade.lastTradeId'),
            tradeTime: finiteNumber(data.T, 'aggTrade.tradeTime'),
            buyerIsMaker: Boolean(data.m),
            eventTime: finiteNumber(data.E, 'aggTrade.eventTime'),
            source: 'WS',
            receivedAt,
        };
        return { type: 'aggTrade', data: trade };
    }

    if (stream.includes('@kline_')) {
        const k = data.k as Record<string, unknown>;
        if (!k || typeof k !== 'object') {
            throw new Error('Malformed Binance Spot WS kline payload.');
        }
        const open = positive(finiteNumber(k.o, 'kline.open'), 'kline.open');
        const high = positive(finiteNumber(k.h, 'kline.high'), 'kline.high');
        const low = positive(finiteNumber(k.l, 'kline.low'), 'kline.low');
        const close = positive(finiteNumber(k.c, 'kline.close'), 'kline.close');
        if (high < Math.max(open, close) || low > Math.min(open, close) || high < low) {
            throw new Error('Invalid Binance Spot WS OHLC bounds.');
        }
        const candle: SpotMarketCandle = {
            symbol: String(k.s ?? data.s).toUpperCase(),
            interval: String(k.i),
            openTime: finiteNumber(k.t, 'kline.openTime'),
            closeTime: finiteNumber(k.T, 'kline.closeTime'),
            open,
            high,
            low,
            close,
            volume: finiteNumber(k.v, 'kline.volume'),
            quoteVolume: finiteNumber(k.q, 'kline.quoteVolume'),
            trades: finiteNumber(k.n, 'kline.trades'),
            takerBuyBaseVolume: finiteNumber(k.V, 'kline.takerBuyBaseVolume'),
            takerBuyQuoteVolume: finiteNumber(k.Q, 'kline.takerBuyQuoteVolume'),
            closed: Boolean(k.x),
            source: 'WS',
            eventTime: finiteNumber(data.E, 'kline.eventTime'),
            receivedAt,
        };
        return { type: 'candle', data: candle };
    }

    if (data.e === 'serverShutdown') {
        return null;
    }

    return null;
}

export interface BinanceSpotWebSocketClientOptions {
    baseUrl?: string;
    initialReconnectDelayMs?: number;
    maxReconnectDelayMs?: number;
}

export class BinanceSpotWebSocketClient implements SpotWebSocketPort {
    private socket?: WebSocket;
    private manuallyClosed = false;
    private connected = false;
    private reconnectTimer?: NodeJS.Timeout;
    private reconnectAttempt = 0;
    private symbol = '';
    private interval = '';
    private onEvent?: (event: SpotMarketDataEvent) => void;
    private onLifecycle?: (event: SpotWebSocketLifecycleEvent) => void;
    private readonly baseUrl: string;
    private readonly initialReconnectDelayMs: number;
    private readonly maxReconnectDelayMs: number;

    constructor(options: BinanceSpotWebSocketClientOptions = {}) {
        this.baseUrl = options.baseUrl ?? DEFAULT_STREAM_BASE_URL;
        this.initialReconnectDelayMs = options.initialReconnectDelayMs ?? 1_000;
        this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30_000;
    }

    isConnected(): boolean {
        return this.connected && this.socket?.readyState === WebSocket.OPEN;
    }

    async connect(
        symbol: string,
        interval: string,
        onEvent: (event: SpotMarketDataEvent) => void,
        onLifecycle: (event: SpotWebSocketLifecycleEvent) => void,
    ): Promise<void> {
        this.manuallyClosed = false;
        this.symbol = symbol.toUpperCase();
        this.interval = interval;
        this.onEvent = onEvent;
        this.onLifecycle = onLifecycle;
        await this.openSocket(true);
    }

    async close(): Promise<void> {
        this.manuallyClosed = true;
        this.connected = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        const socket = this.socket;
        this.socket = undefined;
        if (!socket || socket.readyState === WebSocket.CLOSED) {
            return;
        }
        await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 1_000);
            socket.once('close', () => {
                clearTimeout(timeout);
                resolve();
            });
            socket.close(1000, 'client shutdown');
        });
    }

    private async openSocket(initial: boolean): Promise<void> {
        const url = buildBinanceSpotCombinedStreamUrl(this.symbol, this.interval, this.baseUrl);
        await new Promise<void>((resolve, reject) => {
            let settled = false;
            const socket = new WebSocket(url, { perMessageDeflate: false });
            this.socket = socket;

            socket.once('open', () => {
                this.connected = true;
                this.reconnectAttempt = 0;
                this.onLifecycle?.({ type: 'connected', at: Date.now() });
                if (!settled) {
                    settled = true;
                    resolve();
                }
            });

            socket.on('message', (buffer) => {
                try {
                    const parsed = JSON.parse(buffer.toString());
                    const event = parseCombinedSpotStreamMessage(parsed, Date.now());
                    if (event) {
                        this.onEvent?.(event);
                    }
                } catch (error) {
                    this.onLifecycle?.({
                        type: 'error',
                        at: Date.now(),
                        error: error instanceof Error ? error : new Error(String(error)),
                    });
                }
            });

            socket.on('error', (error) => {
                this.onLifecycle?.({ type: 'error', at: Date.now(), error });
                if (initial && !settled) {
                    settled = true;
                    reject(error);
                }
            });

            socket.on('close', (code, reason) => {
                this.connected = false;
                this.onLifecycle?.({
                    type: 'disconnected',
                    at: Date.now(),
                    code,
                    reason: reason.toString(),
                });
                if (initial && !settled) {
                    settled = true;
                    reject(new Error(`Binance Spot WebSocket closed before open (${code}).`));
                }
                if (!this.manuallyClosed) {
                    this.scheduleReconnect();
                }
            });
        });
    }

    private scheduleReconnect(): void {
        if (this.manuallyClosed || this.reconnectTimer) {
            return;
        }
        this.reconnectAttempt += 1;
        const delayMs = Math.min(
            this.initialReconnectDelayMs * 2 ** Math.max(0, this.reconnectAttempt - 1),
            this.maxReconnectDelayMs,
        );
        this.onLifecycle?.({
            type: 'reconnecting',
            at: Date.now(),
            attempt: this.reconnectAttempt,
            delayMs,
        });
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            void this.openSocket(false).catch((error) => {
                this.onLifecycle?.({
                    type: 'error',
                    at: Date.now(),
                    error: error instanceof Error ? error : new Error(String(error)),
                });
                this.scheduleReconnect();
            });
        }, delayMs);
    }
}
