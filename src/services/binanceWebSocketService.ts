import WebSocket from 'ws';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TickerData {
  symbol: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  volume: number;
  priceChangePercent: number;
}

export interface KlineData {
  symbol: string;
  interval: string;
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  isClosed: boolean;
}

export interface ExecutionReportData {
  orderId: number;
  clientOrderId: string;
  symbol: string;
  side: string;
  status: string; // 'NEW' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELED' | 'REJECTED'
  executedQty: number;
  price: number;
  lastFilledPrice: number;
  cumulativeFilledQty: number;
}

export interface AccountPositionData {
  balances: Array<{ asset: string; free: string; locked: string }>;
}

export interface UserDataCallbacks {
  onExecutionReport?: (data: ExecutionReportData) => void;
  onAccountPosition?: (data: AccountPositionData) => void;
}

export type AlertCallback = (message: string) => void;

// ─── Stream Metadata ───────────────────────────────────────────────────────────

interface StreamMeta {
  ws: WebSocket;
  type: 'ticker' | 'kline' | 'userData';
  symbol: string;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  /** Timestamp di mana koneksi mulai stabil (≥ 60 detik connected) */
  connectedAt: number | null;
  destroyed: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const WS_BASE_URL = 'wss://stream.binance.com:9443/ws';
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const STABLE_CONNECTION_MS = 60_000;

// ─── BinanceWebSocketService ───────────────────────────────────────────────────

export class BinanceWebSocketService {
  /** Map key = streamKey (e.g. "btcusdt_ticker", "btcusdt_kline_1h") */
  private streams = new Map<string, StreamMeta>();
  /** Persistent reconnect counters per stream key, survive meta replacement */
  private reconnectCounters = new Map<string, number>();
  private alertCallback?: AlertCallback;

  constructor(alertCallback?: AlertCallback) {
    this.alertCallback = alertCallback;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Subscribe to real-time best price ticker for a symbol.
   * Callback is called on every price update (< 1 second cadence on Binance).
   */
  subscribeTickerStream(symbol: string, callback: (data: TickerData) => void): void {
    const key = this.tickerKey(symbol);
    if (this.streams.has(key)) return; // already subscribed

    const url = `${WS_BASE_URL}/${symbol.toLowerCase()}@ticker`;
    this.openStream(key, url, 'ticker', symbol, (raw) => {
      const d = JSON.parse(raw);
      callback({
        symbol: d.s,
        lastPrice: parseFloat(d.c),
        bidPrice: parseFloat(d.b),
        askPrice: parseFloat(d.a),
        volume: parseFloat(d.v),
        priceChangePercent: parseFloat(d.P),
      });
    });
  }

  /**
   * Subscribe to kline (candlestick) stream.
   * `isClosed` is true when the candle is finalized.
   */
  subscribeKlineStream(
    symbol: string,
    interval: string,
    callback: (data: KlineData) => void
  ): void {
    const key = this.klineKey(symbol, interval);
    if (this.streams.has(key)) return;

    const url = `${WS_BASE_URL}/${symbol.toLowerCase()}@kline_${interval}`;
    this.openStream(key, url, 'kline', symbol, (raw) => {
      const d = JSON.parse(raw);
      const k = d.k;
      callback({
        symbol: d.s,
        interval: k.i,
        openTime: k.t,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        closeTime: k.T,
        isClosed: k.x,
      });
    });
  }

  /**
   * Subscribe to user data stream (order updates, balance changes).
   * Requires a valid listenKey obtained from Binance REST API.
   */
  subscribeUserDataStream(listenKey: string, callbacks: UserDataCallbacks): void {
    const key = `userData_${listenKey.slice(0, 8)}`;
    if (this.streams.has(key)) return;

    const url = `${WS_BASE_URL}/${listenKey}`;
    this.openStream(key, url, 'userData', 'userData', (raw) => {
      const d = JSON.parse(raw);

      if (d.e === 'executionReport' && callbacks.onExecutionReport) {
        callbacks.onExecutionReport({
          orderId: d.i,
          clientOrderId: d.c,
          symbol: d.s,
          side: d.S,
          status: d.X,
          executedQty: parseFloat(d.z),
          price: parseFloat(d.p),
          lastFilledPrice: parseFloat(d.L),
          cumulativeFilledQty: parseFloat(d.z),
        });
      }

      if (d.e === 'outboundAccountPosition' && callbacks.onAccountPosition) {
        callbacks.onAccountPosition({
          balances: (d.B || []).map((b: any) => ({
            asset: b.a,
            free: b.f,
            locked: b.l,
          })),
        });
      }
    });
  }

  /** Close all streams for a given symbol across all types */
  unsubscribe(symbol: string): void {
    for (const [key, meta] of this.streams.entries()) {
      if (meta.symbol.toLowerCase() === symbol.toLowerCase()) {
        this.destroyStream(key);
      }
    }
  }

  /** Close all active WebSocket streams */
  unsubscribeAll(): void {
    for (const key of Array.from(this.streams.keys())) {
      this.destroyStream(key);
    }
    this.reconnectCounters.clear();
  }

  /** Return list of active stream keys */
  getActiveStreams(): string[] {
    return Array.from(this.streams.keys());
  }

  /** Return count of active streams */
  getActiveStreamCount(): number {
    return this.streams.size;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private openStream(
    key: string,
    url: string,
    type: StreamMeta['type'],
    symbol: string,
    onMessage: (raw: string) => void
  ): void {
    const ws = new WebSocket(url);

    const meta: StreamMeta = {
      ws,
      type,
      symbol,
      reconnectAttempts: 0,
      reconnectTimer: null,
      connectedAt: null,
      destroyed: false,
    };
    this.streams.set(key, meta);

    ws.on('open', () => {
      meta.reconnectAttempts = 0;
      meta.connectedAt = Date.now();
      // Reset persistent counter on successful connection
      this.reconnectCounters.delete(key);
    });

    ws.on('message', (data: WebSocket.RawData) => {
      try {
        onMessage(data.toString());
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('error', (_err) => {
      // errors are handled on 'close'
    });

    ws.on('close', () => {
      if (meta.destroyed) return;
      this.scheduleReconnect(key, url, type, symbol, onMessage, meta);
    });
  }

  private scheduleReconnect(
    key: string,
    url: string,
    type: StreamMeta['type'],
    symbol: string,
    onMessage: (raw: string) => void,
    meta: StreamMeta
  ): void {
    if (meta.destroyed) return;

    // Use persistent counter (survives meta replacement on reconnect)
    const attempts = (this.reconnectCounters.get(key) ?? 0) + 1;
    this.reconnectCounters.set(key, attempts);

    if (attempts > MAX_RECONNECT_ATTEMPTS) {
      this.alertCallback?.(
        `⚠️ WebSocket stream [${key}] gagal reconnect setelah ${MAX_RECONNECT_ATTEMPTS} percobaan. Stream dihentikan.`
      );
      this.streams.delete(key);
      this.reconnectCounters.delete(key);
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, attempts - 1),
      MAX_RECONNECT_DELAY_MS
    );

    meta.reconnectTimer = setTimeout(() => {
      if (meta.destroyed) return;
      // Remove old entry and reopen
      this.streams.delete(key);
      this.openStream(key, url, type, symbol, onMessage);
    }, delay);
  }

  private destroyStream(key: string): void {
    const meta = this.streams.get(key);
    if (!meta) return;

    meta.destroyed = true;
    if (meta.reconnectTimer) {
      clearTimeout(meta.reconnectTimer);
      meta.reconnectTimer = null;
    }

    if (meta.ws.readyState === WebSocket.OPEN || meta.ws.readyState === WebSocket.CONNECTING) {
      meta.ws.terminate();
    }

    this.streams.delete(key);
  }

  // ── Key helpers ─────────────────────────────────────────────────────────────

  tickerKey(symbol: string): string {
    return `${symbol.toLowerCase()}_ticker`;
  }

  klineKey(symbol: string, interval: string): string {
    return `${symbol.toLowerCase()}_kline_${interval}`;
  }
}

/** Singleton instance */
export const binanceWebSocketService = new BinanceWebSocketService();
