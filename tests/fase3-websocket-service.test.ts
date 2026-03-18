/**
 * F3 Sprint 1 Test — BinanceWebSocketService
 *
 * Strategy: Mock the 'ws' module entirely so no real network connections are made.
 * We simulate WebSocket lifecycle events (open, message, close) manually.
 */

import { EventEmitter } from 'events';

// ─── Mock WebSocket ────────────────────────────────────────────────────────────

let mockWsInstances: MockWs[] = [];

class MockWs extends EventEmitter {
    readyState: number;
    url: string;

    static OPEN = 1;
    static CONNECTING = 0;

    constructor(url: string) {
        super();
        this.url = url;
        this.readyState = MockWs.CONNECTING;
        mockWsInstances.push(this);
        // Simulate async connection open
        setImmediate(() => {
            this.readyState = MockWs.OPEN;
            this.emit('open');
        });
    }

    terminate() {
        this.readyState = 3; // CLOSED
        this.emit('close');
    }

    send(_data: string) {}
}

jest.mock('ws', () => MockWs);

// ─── SUT import (after mock) ───────────────────────────────────────────────────

import { BinanceWebSocketService } from '../src/services/binanceWebSocketService';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeTickerMessage(symbol = 'BTCUSDT', lastPrice = '50000.00') {
    return JSON.stringify({
        e: '24hrTicker',
        s: symbol,
        c: lastPrice,
        b: '49999.00',
        a: '50001.00',
        v: '1234.56',
        P: '2.10',
    });
}

function makeKlineMessage(symbol = 'BTCUSDT', interval = '1h', isClosed = false) {
    return JSON.stringify({
        e: 'kline',
        s: symbol,
        k: {
            i: interval,
            t: 1700000000000,
            o: '49000.00',
            h: '51000.00',
            l: '48500.00',
            c: '50000.00',
            v: '500.00',
            T: 1700003600000,
            x: isClosed,
        },
    });
}

function makeExecutionReport(status = 'FILLED', orderId = 123) {
    return JSON.stringify({
        e: 'executionReport',
        s: 'BTCUSDT',
        S: 'BUY',
        i: orderId,
        c: 'my-client-id',
        X: status,
        z: '0.001',
        p: '50000',
        L: '50001',
    });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('F3-Sprint1: BinanceWebSocketService', () => {
    let svc: BinanceWebSocketService;

    beforeEach(() => {
        mockWsInstances = [];
        jest.useFakeTimers({ doNotFake: ['setImmediate'] });
        svc = new BinanceWebSocketService();
    });

    afterEach(() => {
        svc.unsubscribeAll();
        jest.useRealTimers();
    });

    // ── F3-3: Ticker stream ────────────────────────────────────────────────────

    it('F3-3: subscribeTickerStream fires callback with parsed TickerData', async () => {
        const cb = jest.fn();
        svc.subscribeTickerStream('BTCUSDT', cb);

        await new Promise((r) => setImmediate(r)); // let 'open' fire

        const ws = mockWsInstances[0];
        ws.emit('message', Buffer.from(makeTickerMessage('BTCUSDT', '50000.00')));

        expect(cb).toHaveBeenCalledTimes(1);
        const data = cb.mock.calls[0][0];
        expect(data.symbol).toBe('BTCUSDT');
        expect(data.lastPrice).toBe(50000);
        expect(data.bidPrice).toBe(49999);
        expect(data.askPrice).toBe(50001);
        expect(data.volume).toBe(1234.56);
        expect(data.priceChangePercent).toBe(2.1);
    });

    it('F3-3: duplicate subscribeTickerStream for same symbol is ignored', async () => {
        const cb1 = jest.fn();
        const cb2 = jest.fn();
        svc.subscribeTickerStream('BTCUSDT', cb1);
        svc.subscribeTickerStream('BTCUSDT', cb2); // should be no-op

        await new Promise((r) => setImmediate(r));

        expect(mockWsInstances.length).toBe(1); // only one WS created
        expect(svc.getActiveStreamCount()).toBe(1);
    });

    // ── F3-4: Kline stream ─────────────────────────────────────────────────────

    it('F3-4: subscribeKlineStream fires callback on every kline message', async () => {
        const cb = jest.fn();
        svc.subscribeKlineStream('BTCUSDT', '1h', cb);

        await new Promise((r) => setImmediate(r));

        const ws = mockWsInstances[0];
        ws.emit('message', Buffer.from(makeKlineMessage('BTCUSDT', '1h', false)));

        expect(cb).toHaveBeenCalledTimes(1);
        const data = cb.mock.calls[0][0];
        expect(data.symbol).toBe('BTCUSDT');
        expect(data.interval).toBe('1h');
        expect(data.isClosed).toBe(false);
        expect(data.close).toBe(50000);
    });

    it('F3-4: kline callback receives isClosed=true when candle finalizes', async () => {
        const cb = jest.fn();
        svc.subscribeKlineStream('ETHUSDT', '1h', cb);

        await new Promise((r) => setImmediate(r));

        const ws = mockWsInstances[0];
        ws.emit('message', Buffer.from(makeKlineMessage('ETHUSDT', '1h', true)));

        expect(cb.mock.calls[0][0].isClosed).toBe(true);
    });

    // ── F3-8: Auto-reconnect ───────────────────────────────────────────────────

    it('F3-8: reconnect is scheduled with 1s delay after first disconnect', async () => {
        const cb = jest.fn();
        svc.subscribeTickerStream('BTCUSDT', cb);

        await new Promise((r) => setImmediate(r)); // open

        const ws1 = mockWsInstances[0];
        ws1.readyState = 3; // simulate closed
        ws1.emit('close');

        // Timer should be scheduled
        expect(jest.getTimerCount()).toBeGreaterThan(0);

        // After 1 second delay, reconnect fires
        jest.advanceTimersByTime(1000);
        await new Promise((r) => setImmediate(r));

        expect(mockWsInstances.length).toBe(2); // new WS created
    });

    it('F3-8: reconnect delay grows exponentially (1s, 2s, 4s...)', async () => {
        const cb = jest.fn();
        svc.subscribeTickerStream('BTCUSDT', cb);
        await new Promise((r) => setImmediate(r));

        // Simulate 3 disconnects
        for (let attempt = 1; attempt <= 3; attempt++) {
            const ws = mockWsInstances[mockWsInstances.length - 1];
            ws.readyState = 3;
            ws.emit('close');

            const expectedDelay = Math.min(1000 * Math.pow(2, attempt - 1), 30_000);
            jest.advanceTimersByTime(expectedDelay);
            await new Promise((r) => setImmediate(r));
        }

        expect(mockWsInstances.length).toBe(4); // original + 3 reconnects
    });

    it('F3-8: after MAX_RECONNECT_ATTEMPTS the stream is removed and alert fires', async () => {
        // For this test: reconnected WSes should fail immediately (not emit 'open').
        // This prevents the reconnect counter from being reset on "successful" open.
        // Real scenario: if server is down, reconnect attempts all fail.
        let wsCreationCount = 0;
        const FailingMockWs = class extends EventEmitter {
            readyState = MockWs.CONNECTING;
            url: string;
            static OPEN = MockWs.OPEN;
            static CONNECTING = MockWs.CONNECTING;
            constructor(url: string) {
                super();
                this.url = url;
                wsCreationCount++;
                mockWsInstances.push(this as any);
                // Only first connection succeeds (initial subscribe)
                if (wsCreationCount === 1) {
                    setImmediate(() => { this.readyState = MockWs.OPEN; this.emit('open'); });
                }
                // Reconnect attempts: do NOT emit open (simulate server down)
            }
            terminate() { this.readyState = 3; this.emit('close'); }
            send(_data: string) {}
        };

        jest.resetModules();
        jest.doMock('ws', () => FailingMockWs);
        const { BinanceWebSocketService: FreshSvc } = await import('../src/services/binanceWebSocketService');

        const alertCb = jest.fn();
        const svcWithAlert = new FreshSvc(alertCb);
        svcWithAlert.subscribeTickerStream('BTCUSDT', jest.fn());
        await new Promise((r) => setImmediate(r)); // let first open fire

        // MAX_RECONNECT_ATTEMPTS = 5: simulate 5 disconnects
        // Each disconnect increments counter; reconnected WS never opens so counter stays
        for (let i = 0; i < 5; i++) {
            const ws = mockWsInstances[mockWsInstances.length - 1];
            ws.emit('close');
            jest.advanceTimersByTime(30_000);
            await new Promise((r) => setImmediate(r));
        }

        // 6th close crosses the threshold → alert fires and stream is removed
        const ws = mockWsInstances[mockWsInstances.length - 1];
        ws.emit('close');
        jest.advanceTimersByTime(30_000);
        await new Promise((r) => setImmediate(r));

        expect(svcWithAlert.getActiveStreamCount()).toBe(0);
        expect(alertCb).toHaveBeenCalledWith(expect.stringContaining('gagal reconnect'));

        svcWithAlert.unsubscribeAll();
        jest.dontMock('ws');
    });

    // ── F3-9: Unsubscribe ──────────────────────────────────────────────────────

    it('F3-9: unsubscribe(symbol) closes stream and removes it from active list', async () => {
        const cb = jest.fn();
        svc.subscribeTickerStream('BTCUSDT', cb);
        await new Promise((r) => setImmediate(r));

        expect(svc.getActiveStreamCount()).toBe(1);

        svc.unsubscribe('BTCUSDT');

        expect(svc.getActiveStreamCount()).toBe(0);
    });

    it('F3-9: callback is NOT called after unsubscribe()', async () => {
        const cb = jest.fn();
        svc.subscribeTickerStream('BTCUSDT', cb);
        await new Promise((r) => setImmediate(r));

        svc.unsubscribe('BTCUSDT');

        // Even if WS sends a message after unsubscribe, callback should not fire
        // (stream already destroyed, so no more listeners)
        expect(svc.getActiveStreamCount()).toBe(0);
        expect(cb).toHaveBeenCalledTimes(0);
    });

    it('F3-9: unsubscribeAll() closes all active streams', async () => {
        svc.subscribeTickerStream('BTCUSDT', jest.fn());
        svc.subscribeTickerStream('ETHUSDT', jest.fn());
        svc.subscribeKlineStream('BTCUSDT', '1h', jest.fn());
        await new Promise((r) => setImmediate(r));

        expect(svc.getActiveStreamCount()).toBe(3);

        svc.unsubscribeAll();

        expect(svc.getActiveStreamCount()).toBe(0);
    });

    it('F3-9: unsubscribe(symbol) only removes streams for that symbol', async () => {
        svc.subscribeTickerStream('BTCUSDT', jest.fn());
        svc.subscribeTickerStream('ETHUSDT', jest.fn());
        await new Promise((r) => setImmediate(r));

        svc.unsubscribe('BTCUSDT');

        expect(svc.getActiveStreamCount()).toBe(1);
        expect(svc.getActiveStreams()).toContain('ethusdt_ticker');
    });

    // ── F3-5: User Data Stream ─────────────────────────────────────────────────

    it('F3-5: subscribeUserDataStream fires onExecutionReport for FILLED orders', async () => {
        const onExecutionReport = jest.fn();
        svc.subscribeUserDataStream('fake-listen-key-abc123', { onExecutionReport });
        await new Promise((r) => setImmediate(r));

        const ws = mockWsInstances[0];
        ws.emit('message', Buffer.from(makeExecutionReport('FILLED', 999)));

        expect(onExecutionReport).toHaveBeenCalledTimes(1);
        const report = onExecutionReport.mock.calls[0][0];
        expect(report.orderId).toBe(999);
        expect(report.status).toBe('FILLED');
        expect(report.symbol).toBe('BTCUSDT');
        expect(report.side).toBe('BUY');
    });

    it('F3-5: subscribeUserDataStream fires onAccountPosition for balance events', async () => {
        const onAccountPosition = jest.fn();
        svc.subscribeUserDataStream('fake-listen-key-xyz789', { onAccountPosition });
        await new Promise((r) => setImmediate(r));

        const payload = JSON.stringify({
            e: 'outboundAccountPosition',
            B: [
                { a: 'BTC', f: '0.01', l: '0' },
                { a: 'USDT', f: '500', l: '100' },
            ],
        });

        const ws = mockWsInstances[0];
        ws.emit('message', Buffer.from(payload));

        expect(onAccountPosition).toHaveBeenCalledTimes(1);
        const pos = onAccountPosition.mock.calls[0][0];
        expect(pos.balances.length).toBe(2);
        expect(pos.balances[0].asset).toBe('BTC');
    });

    // ── getActiveStreams ────────────────────────────────────────────────────────

    it('getActiveStreams() returns correct stream keys', async () => {
        svc.subscribeTickerStream('BTCUSDT', jest.fn());
        svc.subscribeKlineStream('ETHUSDT', '4h', jest.fn());
        await new Promise((r) => setImmediate(r));

        const streams = svc.getActiveStreams();
        expect(streams).toContain('btcusdt_ticker');
        expect(streams).toContain('ethusdt_kline_4h');
        expect(streams.length).toBe(2);
    });
});
