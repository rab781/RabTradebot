import WebSocket from 'ws';
import {
    SpotDepthLevel,
    SpotDepthLifecycleEvent,
    SpotDepthUpdate,
    SpotDepthWebSocketPort,
} from './spotDepthTypes';

const DEFAULT_STREAM_BASE_URL = 'wss://data-stream.binance.vision';

function parseLevel(raw: unknown, side: 'bid' | 'ask'): SpotDepthLevel {
    if (!Array.isArray(raw) || raw.length < 2) {
        throw new Error(`Malformed Binance Spot WS depth ${side} level.`);
    }
    const price = Number(raw[0]);
    const quantity = Number(raw[1]);
    if (!Number.isFinite(price) || price <= 0) {
        throw new Error(`Invalid Binance Spot WS depth ${side} price: ${String(raw[0])}`);
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
        throw new Error(`Invalid Binance Spot WS depth ${side} quantity: ${String(raw[1])}`);
    }
    return { price, quantity };
}

export function buildBinanceSpotDepthStreamUrl(
    symbol: string,
    baseUrl = DEFAULT_STREAM_BASE_URL,
): string {
    return `${baseUrl.replace(/\/$/, '')}/ws/${symbol.toLowerCase()}@depth@100ms`;
}

export function parseSpotDepthUpdate(raw: unknown, receivedAt = Date.now()): SpotDepthUpdate | null {
    const value = raw as Record<string, unknown>;
    if (!value || typeof value !== 'object') {
        throw new Error('Malformed Binance Spot depth WebSocket payload.');
    }
    if (value.e === 'serverShutdown') return null;
    if (value.e !== 'depthUpdate') return null;
    if (!Array.isArray(value.b) || !Array.isArray(value.a)) {
        throw new Error('Malformed Binance Spot depth WebSocket levels.');
    }
    const firstUpdateId = Number(value.U);
    const finalUpdateId = Number(value.u);
    const eventTime = Number(value.E);
    if (!Number.isSafeInteger(firstUpdateId) || !Number.isSafeInteger(finalUpdateId) || firstUpdateId > finalUpdateId) {
        throw new Error('Invalid Binance Spot depth WebSocket update IDs.');
    }
    if (!Number.isFinite(eventTime) || eventTime <= 0) {
        throw new Error('Invalid Binance Spot depth WebSocket event time.');
    }
    return {
        symbol: String(value.s).toUpperCase(),
        firstUpdateId,
        finalUpdateId,
        bids: value.b.map((row) => parseLevel(row, 'bid')),
        asks: value.a.map((row) => parseLevel(row, 'ask')),
        eventTime,
        receivedAt,
        source: 'WS',
    };
}

export interface BinanceSpotDepthWebSocketClientOptions {
    baseUrl?: string;
    initialReconnectDelayMs?: number;
    maxReconnectDelayMs?: number;
}

export class BinanceSpotDepthWebSocketClient implements SpotDepthWebSocketPort {
    private socket?: WebSocket;
    private manuallyClosed = false;
    private connected = false;
    private reconnectTimer?: NodeJS.Timeout;
    private reconnectAttempt = 0;
    private symbol = '';
    private onEvent?: (event: SpotDepthUpdate) => void;
    private onLifecycle?: (event: SpotDepthLifecycleEvent) => void;
    private readonly baseUrl: string;
    private readonly initialReconnectDelayMs: number;
    private readonly maxReconnectDelayMs: number;

    constructor(options: BinanceSpotDepthWebSocketClientOptions = {}) {
        this.baseUrl = options.baseUrl ?? DEFAULT_STREAM_BASE_URL;
        this.initialReconnectDelayMs = options.initialReconnectDelayMs ?? 1_000;
        this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30_000;
    }

    isConnected(): boolean {
        return this.connected && this.socket?.readyState === WebSocket.OPEN;
    }

    async connect(
        symbol: string,
        onEvent: (event: SpotDepthUpdate) => void,
        onLifecycle: (event: SpotDepthLifecycleEvent) => void,
    ): Promise<void> {
        this.manuallyClosed = false;
        this.symbol = symbol.toUpperCase();
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
        if (!socket || socket.readyState === WebSocket.CLOSED) return;
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
        const url = buildBinanceSpotDepthStreamUrl(this.symbol, this.baseUrl);
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
                    const event = parseSpotDepthUpdate(JSON.parse(buffer.toString()), Date.now());
                    if (event) this.onEvent?.(event);
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
                this.onLifecycle?.({ type: 'disconnected', at: Date.now(), code, reason: reason.toString() });
                if (initial && !settled) {
                    settled = true;
                    reject(new Error(`Binance Spot depth WebSocket closed before open (${code}).`));
                }
                if (!this.manuallyClosed) this.scheduleReconnect();
            });
        });
    }

    private scheduleReconnect(): void {
        if (this.manuallyClosed || this.reconnectTimer) return;
        this.reconnectAttempt += 1;
        const delayMs = Math.min(
            this.initialReconnectDelayMs * 2 ** Math.max(0, this.reconnectAttempt - 1),
            this.maxReconnectDelayMs,
        );
        this.onLifecycle?.({ type: 'reconnecting', at: Date.now(), attempt: this.reconnectAttempt, delayMs });
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
        this.reconnectTimer.unref?.();
    }
}
