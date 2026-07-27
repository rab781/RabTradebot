import axios from 'axios';
import crypto from 'crypto';
import {
  BinanceWebSocketService,
  UserDataCallbacks,
  AlertCallback,
} from './binanceWebSocketService';
import { binanceOrderService } from './binanceOrderService';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type StreamType = 'ticker' | 'kline' | 'userData';

export interface StreamInfo {
  key: string;
  type: StreamType;
  symbol: string;
  interval?: string;
  subscriberIds: Set<number>;
  startedAt: Date;
}

export interface ConnectionStatus {
  activeStreamCount: number;
  maxStreams: number;
  streams: Array<{
    key: string;
    type: StreamType;
    symbol: string;
    interval?: string;
    subscribers: number;
    startedAt: string;
  }>;
  listenKeyExpiresAt: string | null;
}

export interface SignalCallback {
  userId: number;
  onSignal: (symbol: string, action: 'BUY' | 'SELL', confidence: number, reason: string) => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_STREAMS = 5;
const LISTEN_KEY_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// ─── ConnectionManager ─────────────────────────────────────────────────────────

/**
 * Manages all active WebSocket streams centrally.
 * Enforces Binance's limit of 5 concurrent streams.
 * Handles listenKey lifecycle for User Data Stream.
 */
export class ConnectionManager {
  private readonly wsService: BinanceWebSocketService;
  private readonly streamInfoMap = new Map<string, StreamInfo>();

  /** User subscribers for auto-signal notifications per symbol */
  private readonly signalSubscribers = new Map<string, Set<number>>();

  /** Signal callbacks indexed by userId */
  private readonly signalCallbacks = new Map<number, SignalCallback['onSignal']>();

  /** Listen key for User Data Stream */
  private listenKey: string | null = null;
  private listenKeyTimer: NodeJS.Timeout | null = null;
  private listenKeyExpiresAt: Date | null = null;

  constructor(wsService?: BinanceWebSocketService, alertCallback?: AlertCallback) {
    this.wsService = wsService ?? new BinanceWebSocketService(alertCallback);
  }

  // ── Stream Subscription ────────────────────────────────────────────────────

  /**
   * Subscribe to ticker stream for a symbol.
   * Throws if MAX_STREAMS limit would be exceeded.
   */
  subscribeTicker(
    symbol: string,
    callback: (lastPrice: number, bidPrice: number, askPrice: number) => void,
    subscriberId?: number
  ): void {
    const key = `${symbol.toLowerCase()}_ticker`;
    this.ensureSlotAvailable(key);

    if (!this.streamInfoMap.has(key)) {
      this.wsService.subscribeTickerStream(symbol, (data) => {
        callback(data.lastPrice, data.bidPrice, data.askPrice);
      });
      this.streamInfoMap.set(key, {
        key,
        type: 'ticker',
        symbol,
        subscriberIds: new Set(),
        startedAt: new Date(),
      });
    }

    if (subscriberId !== undefined) {
      this.streamInfoMap.get(key)!.subscriberIds.add(subscriberId);
    }
  }

  /**
   * Subscribe to kline stream.
   * Throws if MAX_STREAMS limit would be exceeded.
   */
  subscribeKline(
    symbol: string,
    interval: string,
    callback: Parameters<BinanceWebSocketService['subscribeKlineStream']>[2],
    subscriberId?: number
  ): void {
    const key = `${symbol.toLowerCase()}_kline_${interval}`;
    this.ensureSlotAvailable(key);

    if (!this.streamInfoMap.has(key)) {
      this.wsService.subscribeKlineStream(symbol, interval, callback);
      this.streamInfoMap.set(key, {
        key,
        type: 'kline',
        symbol,
        interval,
        subscriberIds: new Set(),
        startedAt: new Date(),
      });
    }

    if (subscriberId !== undefined) {
      this.streamInfoMap.get(key)!.subscriberIds.add(subscriberId);
    }
  }

  /**
   * F3-6: Obtain listenKey from Binance REST and start User Data Stream.
   * F3-7: Auto-refreshes the listenKey every 30 minutes.
   */
  async startUserDataStream(callbacks: UserDataCallbacks): Promise<void> {
    const key = 'userData_main';
    this.ensureSlotAvailable(key);

    // F3-6: Request listenKey from Binance
    this.listenKey = await this.getListenKey();
    this.listenKeyExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 min TTL

    this.wsService.subscribeUserDataStream(this.listenKey, callbacks);
    this.streamInfoMap.set(key, {
      key,
      type: 'userData',
      symbol: 'userData',
      subscriberIds: new Set(),
      startedAt: new Date(),
    });

    // F3-7: Schedule listenKey keep-alive every 30 minutes
    this.scheduleListenKeyRefresh();
  }

  /** F3-6: Request a new listenKey from Binance REST API */
  async getListenKey(): Promise<string> {
    const baseUrl = binanceOrderService.getBaseUrl();
    const apiKey = process.env.BINANCE_API_KEY || '';
    const apiSecret = process.env.BINANCE_API_SECRET || '';
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');

    const response = await axios.request<{ listenKey: string }>({
      method: 'POST',
      url: `${baseUrl}/api/v3/userDataStream`,
      params: { timestamp, signature },
      headers: { 'X-MBX-APIKEY': apiKey },
      timeout: 10_000,
    });
    return response.data.listenKey;
  }

  /** F3-7: Keep the listenKey alive (ping Binance every 30 minutes) */
  async keepAliveListenKey(lk: string): Promise<void> {
    const baseUrl = binanceOrderService.getBaseUrl();
    const apiKey = process.env.BINANCE_API_KEY || '';
    const apiSecret = process.env.BINANCE_API_SECRET || '';
    const timestamp = Date.now();
    const queryString = `listenKey=${lk}&timestamp=${timestamp}`;
    const signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');

    await axios.request({
      method: 'PUT',
      url: `${baseUrl}/api/v3/userDataStream`,
      params: { listenKey: lk, timestamp, signature },
      headers: { 'X-MBX-APIKEY': apiKey },
      timeout: 10_000,
    });
  }

  // ── Signal Subscribers ─────────────────────────────────────────────────────

  /**
   * Register a user to receive auto-signal notifications for a symbol.
   * F3-14: `/subscribe <symbol>`
   */
  addSignalSubscriber(userId: number, symbol: string, onSignal: SignalCallback['onSignal']): void {
    const symbolUpper = symbol.toUpperCase();
    if (!this.signalSubscribers.has(symbolUpper)) {
      this.signalSubscribers.set(symbolUpper, new Set());
    }
    this.signalSubscribers.get(symbolUpper)!.add(userId);
    this.signalCallbacks.set(userId, onSignal);
  }

  /**
   * Remove a user from auto-signal notifications.
   * F3-15: `/unsubscribe <symbol>`
   * Returns true if no more subscribers remain for the symbol.
   */
  removeSignalSubscriber(userId: number, symbol: string): boolean {
    const symbolUpper = symbol.toUpperCase();
    const subs = this.signalSubscribers.get(symbolUpper);
    if (subs) {
      subs.delete(userId);
      if (subs.size === 0) {
        this.signalSubscribers.delete(symbolUpper);
        return true; // no more subscribers
      }
    }
    return false;
  }

  /** Notify all signal subscribers for a symbol */
  notifySignalSubscribers(
    symbol: string,
    action: 'BUY' | 'SELL',
    confidence: number,
    reason: string
  ): void {
    const symbolUpper = symbol.toUpperCase();
    const subs = this.signalSubscribers.get(symbolUpper);
    if (!subs) return;

    for (const userId of subs) {
      const cb = this.signalCallbacks.get(userId);
      cb?.(symbolUpper, action, confidence, reason);
    }
  }

  getSignalSubscriberCount(symbol: string): number {
    return this.signalSubscribers.get(symbol.toUpperCase())?.size ?? 0;
  }

  // ── Unsubscribe ────────────────────────────────────────────────────────────

  /** Unsubscribe stream. If stream has remaining subscribers, only remove this one. */
  unsubscribeStream(key: string, subscriberId?: number): void {
    const info = this.streamInfoMap.get(key);
    if (!info) return;

    if (subscriberId !== undefined) {
      info.subscriberIds.delete(subscriberId);
      // Only actually close if no subscribers remain
      if (info.subscriberIds.size > 0) return;
    }

    this.wsService.unsubscribe(info.symbol);
    this.streamInfoMap.delete(key);
  }

  /** Stop User Data Stream and cancel keep-alive timer */
  stopUserDataStream(): void {
    if (this.listenKeyTimer) {
      clearInterval(this.listenKeyTimer);
      this.listenKeyTimer = null;
    }
    this.listenKey = null;
    this.listenKeyExpiresAt = null;
    this.streamInfoMap.delete('userData_main');
    this.wsService.unsubscribeAll();
  }

  /** Close all streams */
  shutdown(): void {
    if (this.listenKeyTimer) {
      clearInterval(this.listenKeyTimer);
      this.listenKeyTimer = null;
    }
    this.wsService.unsubscribeAll();
    this.streamInfoMap.clear();
    this.signalSubscribers.clear();
    this.signalCallbacks.clear();
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  /** F3-18: Get connection status for /apistatus command */
  getStatus(): ConnectionStatus {
    return {
      activeStreamCount: this.streamInfoMap.size,
      maxStreams: MAX_STREAMS,
      streams: Array.from(this.streamInfoMap.values()).map((info) => ({
        key: info.key,
        type: info.type,
        symbol: info.symbol,
        interval: info.interval,
        subscribers: info.subscriberIds.size,
        startedAt: info.startedAt.toISOString(),
      })),
      listenKeyExpiresAt: this.listenKeyExpiresAt?.toISOString() ?? null,
    };
  }

  getActiveStreamCount(): number {
    return this.streamInfoMap.size;
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private ensureSlotAvailable(key: string): void {
    if (this.streamInfoMap.has(key)) return; // re-subscription is OK
    if (this.streamInfoMap.size >= MAX_STREAMS) {
      throw new Error(
        `MAX_STREAMS_EXCEEDED: Cannot open more than ${MAX_STREAMS} WebSocket streams simultaneously.`
      );
    }
  }

  private scheduleListenKeyRefresh(): void {
    if (this.listenKeyTimer) {
      clearInterval(this.listenKeyTimer);
    }

    this.listenKeyTimer = setInterval(async () => {
      if (!this.listenKey) return;
      try {
        await this.keepAliveListenKey(this.listenKey);
        this.listenKeyExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      } catch {
        // If keepAlive fails, the listenKey may have expired.
        // A more robust impl would re-request a new listenKey here.
      }
    }, LISTEN_KEY_REFRESH_INTERVAL_MS);
  }
}

/** Singleton instance */
export const connectionManager = new ConnectionManager();
