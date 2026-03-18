/**
 * F3 Sprint 2 Test — ConnectionManager
 * Tests max stream enforcement, signal subscriber management, and status reporting.
 * BinanceWebSocketService is mocked entirely.
 */

// ─── Mock BinanceWebSocketService ─────────────────────────────────────────────

const mockWsService = {
    subscribeTickerStream: jest.fn(),
    subscribeKlineStream: jest.fn(),
    subscribeUserDataStream: jest.fn(),
    unsubscribe: jest.fn(),
    unsubscribeAll: jest.fn(),
    getActiveStreamCount: jest.fn().mockReturnValue(0),
};

jest.mock('../src/services/binanceWebSocketService', () => ({
    BinanceWebSocketService: jest.fn().mockImplementation(() => mockWsService),
    binanceWebSocketService: mockWsService,
}));

jest.mock('../src/services/binanceOrderService', () => ({
    binanceOrderService: {
        getBaseUrl: jest.fn().mockReturnValue('https://testnet.binance.vision'),
    },
}));

jest.mock('axios', () => ({
    request: jest.fn().mockResolvedValue({ data: { listenKey: 'test-listen-key-abc' } }),
}));

// ─── SUT import ────────────────────────────────────────────────────────────────

import { ConnectionManager } from '../src/services/connectionManager';
import { BinanceWebSocketService } from '../src/services/binanceWebSocketService';

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('F3-Sprint2: ConnectionManager', () => {
    let cm: ConnectionManager;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        cm = new ConnectionManager(mockWsService as any);
    });

    afterEach(() => {
        cm.shutdown();
        jest.useRealTimers();
    });

    // ── F3-17: Max streams enforcement ────────────────────────────────────────

    it('F3-17: allows subscribing up to MAX_STREAMS (5) streams', () => {
        cm.subscribeTicker('BTCUSDT', jest.fn());
        cm.subscribeTicker('ETHUSDT', jest.fn());
        cm.subscribeTicker('BNBUSDT', jest.fn());
        cm.subscribeKline('BTCUSDT', '1h', jest.fn());
        cm.subscribeKline('ETHUSDT', '4h', jest.fn());

        expect(cm.getActiveStreamCount()).toBe(5);
    });

    it('F3-17: throws MAX_STREAMS_EXCEEDED when trying to open a 6th stream', () => {
        cm.subscribeTicker('BTCUSDT', jest.fn());
        cm.subscribeTicker('ETHUSDT', jest.fn());
        cm.subscribeTicker('BNBUSDT', jest.fn());
        cm.subscribeKline('BTCUSDT', '1h', jest.fn());
        cm.subscribeKline('ETHUSDT', '4h', jest.fn());

        expect(() => cm.subscribeTicker('SOLUSDT', jest.fn())).toThrow('MAX_STREAMS_EXCEEDED');
    });

    it('F3-17: re-subscribing to same key does NOT count as new stream', () => {
        cm.subscribeTicker('BTCUSDT', jest.fn(), 1);
        cm.subscribeTicker('BTCUSDT', jest.fn(), 2); // same key, different subscriber

        expect(cm.getActiveStreamCount()).toBe(1); // still 1 stream
        expect(mockWsService.subscribeTickerStream).toHaveBeenCalledTimes(1);
    });

    it('F3-17: unsubscribing frees a slot so a new stream can be opened', () => {
        cm.subscribeTicker('BTCUSDT', jest.fn(), 1);
        cm.subscribeTicker('ETHUSDT', jest.fn(), 2);
        cm.subscribeTicker('BNBUSDT', jest.fn(), 3);
        cm.subscribeKline('BTCUSDT', '1h', jest.fn(), 4);
        cm.subscribeKline('ETHUSDT', '4h', jest.fn(), 5);

        // Free a slot
        cm.unsubscribeStream('btcusdt_ticker');

        // Should now be able to add the 5th unique stream
        expect(() => cm.subscribeTicker('SOLUSDT', jest.fn())).not.toThrow();
        expect(cm.getActiveStreamCount()).toBe(5);
    });

    it('F3-17: stream is NOT closed if other subscribers remain', () => {
        cm.subscribeTicker('BTCUSDT', jest.fn(), 1);
        cm.subscribeTicker('BTCUSDT', jest.fn(), 2); // 2 subscribers to same stream

        cm.unsubscribeStream('btcusdt_ticker', 1); // remove only user 1

        // Stream stays open because user 2 is still subscribed
        expect(cm.getActiveStreamCount()).toBe(1);
        expect(mockWsService.unsubscribe).not.toHaveBeenCalled();
    });

    it('F3-17: stream IS closed when last subscriber removes themselves', () => {
        cm.subscribeTicker('BTCUSDT', jest.fn(), 1);
        cm.unsubscribeStream('btcusdt_ticker', 1);

        expect(cm.getActiveStreamCount()).toBe(0);
        expect(mockWsService.unsubscribe).toHaveBeenCalledWith('BTCUSDT');
    });

    // ── F3-6 & F3-7: Listen Key lifecycle ─────────────────────────────────────

    it('F3-6: startUserDataStream requests a listenKey and starts WS stream', async () => {
        const onExecutionReport = jest.fn();
        await cm.startUserDataStream({ onExecutionReport });

        expect(mockWsService.subscribeUserDataStream).toHaveBeenCalledWith(
            'test-listen-key-abc',
            expect.objectContaining({ onExecutionReport }),
        );
        expect(cm.getActiveStreamCount()).toBe(1);
    });

    it('F3-7: keepAlive timer is scheduled after startUserDataStream', async () => {
        await cm.startUserDataStream({});

        // Should have registered a 30-minute interval
        expect(jest.getTimerCount()).toBeGreaterThan(0);
    });

    it('F3-6: getListenKey returns the listen key from Binance API', async () => {
        const key = await cm.getListenKey();
        expect(key).toBe('test-listen-key-abc');
    });

    // ── Signal Subscribers ─────────────────────────────────────────────────────

    it('addSignalSubscriber registers user correctly', () => {
        const cb = jest.fn();
        cm.addSignalSubscriber(42, 'BTCUSDT', cb);

        expect(cm.getSignalSubscriberCount('BTCUSDT')).toBe(1);
    });

    it('notifySignalSubscribers calls registered callbacks', () => {
        const cb1 = jest.fn();
        const cb2 = jest.fn();
        cm.addSignalSubscriber(1, 'BTCUSDT', cb1);
        cm.addSignalSubscriber(2, 'BTCUSDT', cb2);

        cm.notifySignalSubscribers('BTCUSDT', 'BUY', 0.82, 'RSI oversold');

        expect(cb1).toHaveBeenCalledWith('BTCUSDT', 'BUY', 0.82, 'RSI oversold');
        expect(cb2).toHaveBeenCalledWith('BTCUSDT', 'BUY', 0.82, 'RSI oversold');
    });

    it('removeSignalSubscriber returns true when no subscribers remain', () => {
        cm.addSignalSubscriber(99, 'ETHUSDT', jest.fn());
        const isEmpty = cm.removeSignalSubscriber(99, 'ETHUSDT');

        expect(isEmpty).toBe(true);
        expect(cm.getSignalSubscriberCount('ETHUSDT')).toBe(0);
    });

    it('removeSignalSubscriber returns false when other subscribers remain', () => {
        cm.addSignalSubscriber(1, 'ETHUSDT', jest.fn());
        cm.addSignalSubscriber(2, 'ETHUSDT', jest.fn());

        const isEmpty = cm.removeSignalSubscriber(1, 'ETHUSDT');

        expect(isEmpty).toBe(false);
        expect(cm.getSignalSubscriberCount('ETHUSDT')).toBe(1);
    });

    it('notifySignalSubscribers does nothing for unknown symbol', () => {
        const cb = jest.fn();
        cm.addSignalSubscriber(1, 'BTCUSDT', cb);

        cm.notifySignalSubscribers('SOLUSDT', 'SELL', 0.7, 'reason');

        expect(cb).not.toHaveBeenCalled();
    });

    // ── F3-18: Status reporting ────────────────────────────────────────────────

    it('F3-18: getStatus returns correct active stream count', () => {
        cm.subscribeTicker('BTCUSDT', jest.fn());
        cm.subscribeKline('ETHUSDT', '1h', jest.fn());

        const status = cm.getStatus();

        expect(status.activeStreamCount).toBe(2);
        expect(status.maxStreams).toBe(5);
        expect(status.streams.length).toBe(2);
    });

    it('F3-18: getStatus includes stream metadata', () => {
        cm.subscribeTicker('BTCUSDT', jest.fn());

        const status = cm.getStatus();
        const stream = status.streams[0];

        expect(stream.key).toBe('btcusdt_ticker');
        expect(stream.type).toBe('ticker');
        expect(stream.symbol).toBe('BTCUSDT');
        expect(stream.startedAt).toBeDefined();
    });

    it('F3-18: getStatus shows listenKeyExpiresAt after user data stream started', async () => {
        await cm.startUserDataStream({});

        const status = cm.getStatus();

        expect(status.listenKeyExpiresAt).not.toBeNull();
    });

    // ── Shutdown ───────────────────────────────────────────────────────────────

    it('shutdown closes all streams and clears state', async () => {
        cm.subscribeTicker('BTCUSDT', jest.fn());
        cm.subscribeTicker('ETHUSDT', jest.fn());
        cm.addSignalSubscriber(1, 'BTCUSDT', jest.fn());

        cm.shutdown();

        expect(mockWsService.unsubscribeAll).toHaveBeenCalled();
        expect(cm.getActiveStreamCount()).toBe(0);
        expect(cm.getSignalSubscriberCount('BTCUSDT')).toBe(0);
    });
});
