import { SpotDepthOrderBookEngine } from '../src/services/marketData/spotDepthOrderBookEngine';
import {
    SpotDepthLifecycleEvent,
    SpotDepthRestPort,
    SpotDepthSnapshot,
    SpotDepthUpdate,
    SpotDepthWebSocketPort,
} from '../src/services/marketData/spotDepthTypes';

function snap(lastUpdateId = 100): SpotDepthSnapshot {
    return {
        symbol: 'BTCUSDT', lastUpdateId,
        bids: [{ price: 100, quantity: 2 }, { price: 99, quantity: 3 }],
        asks: [{ price: 101, quantity: 4 }, { price: 102, quantity: 5 }],
        receivedAt: 1, source: 'REST',
    };
}
function update(U: number, u: number, receivedAt = 10): SpotDepthUpdate {
    return {
        symbol: 'BTCUSDT', firstUpdateId: U, finalUpdateId: u,
        bids: [{ price: 100, quantity: 2.5 }], asks: [],
        eventTime: receivedAt - 1, receivedAt, source: 'WS',
    };
}

class FakeRest implements SpotDepthRestPort {
    calls = 0;
    snapshots: SpotDepthSnapshot[] = [snap()];
    beforeResolve?: () => void;
    async fetchDepthSnapshot(): Promise<SpotDepthSnapshot> {
        this.calls += 1;
        this.beforeResolve?.();
        return this.snapshots[Math.min(this.calls - 1, this.snapshots.length - 1)];
    }
}
class FakeWs implements SpotDepthWebSocketPort {
    connected = false;
    onEvent?: (event: SpotDepthUpdate) => void;
    onLifecycle?: (event: SpotDepthLifecycleEvent) => void;
    async connect(_symbol: string, onEvent: (event: SpotDepthUpdate) => void, onLifecycle: (event: SpotDepthLifecycleEvent) => void): Promise<void> {
        this.onEvent = onEvent; this.onLifecycle = onLifecycle; this.connected = true;
        onLifecycle({ type: 'connected', at: 1 });
    }
    async close(): Promise<void> { this.connected = false; }
    isConnected(): boolean { return this.connected; }
    emit(event: SpotDepthUpdate): void { this.onEvent?.(event); }
    lifecycle(event: SpotDepthLifecycleEvent): void { this.onLifecycle?.(event); }
}

function create(rest = new FakeRest(), ws = new FakeWs()) {
    const engine = new SpotDepthOrderBookEngine(rest, ws, {
        symbol: 'BTCUSDT', outputLevels: 2, staleAfterMs: 1_000,
        enableStaleMonitor: false, snapshotRetryDelayMs: 0,
    });
    return { engine, rest, ws };
}

async function flush(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('SpotDepthOrderBookEngine MD2', () => {
    it('buffers WS first, bootstraps REST, replays the bridging event and becomes LIVE', async () => {
        const rest = new FakeRest(); const ws = new FakeWs();
        rest.beforeResolve = () => ws.emit(update(100, 101, 5));
        const { engine } = create(rest, ws);
        await engine.start();
        expect(engine.getHealth().status).toBe('LIVE');
        expect(engine.getSnapshot().lastUpdateId).toBe(101);
        expect(engine.getHealth().depthEventsApplied).toBe(1);
        await engine.stop();
    });

    it('silently discards buffered events already covered by REST snapshot', async () => {
        const rest = new FakeRest(); const ws = new FakeWs();
        rest.beforeResolve = () => ws.emit(update(90, 100, 5));
        const { engine } = create(rest, ws);
        await engine.start();
        expect(engine.getSnapshot().lastUpdateId).toBe(100);
        expect(engine.getHealth().staleEventCount).toBe(0);
        await engine.stop();
    });

    it('refetches a snapshot when snapshot lastUpdateId is older than first buffered U', async () => {
        const rest = new FakeRest(); const ws = new FakeWs();
        rest.snapshots = [snap(90), snap(100)];
        rest.beforeResolve = () => { if (rest.calls === 1) ws.emit(update(100, 101, 5)); };
        const { engine } = create(rest, ws);
        await engine.start();
        expect(rest.calls).toBe(2);
        expect(engine.getHealth().snapshotRetryCount).toBeGreaterThanOrEqual(1);
        expect(engine.getSnapshot().lastUpdateId).toBe(101);
        await engine.stop();
    });

    it('applies live contiguous depth events', async () => {
        const { engine, ws } = create();
        await engine.start();
        ws.emit(update(101, 101, 20));
        expect(engine.getSnapshot().lastUpdateId).toBe(101);
        expect(engine.getHealth().depthEventsApplied).toBe(1);
        await engine.stop();
    });

    it('counts stale live events without mutating update ID', async () => {
        const { engine, ws } = create();
        await engine.start();
        ws.emit(update(90, 100, 20));
        expect(engine.getHealth().staleEventCount).toBe(1);
        expect(engine.getSnapshot().lastUpdateId).toBe(100);
        await engine.stop();
    });

    it('detects a live sequence gap and automatically resynchronizes', async () => {
        const rest = new FakeRest(); const ws = new FakeWs();
        rest.snapshots = [snap(100), snap(103)];
        const { engine } = create(rest, ws);
        await engine.start();
        ws.emit(update(103, 103, 20));
        await flush();
        expect(engine.getHealth().sequenceGapCount).toBe(1);
        expect(engine.getHealth().resyncCount).toBe(1);
        expect(engine.getSnapshot().lastUpdateId).toBe(103);
        expect(engine.getHealth().status).toBe('LIVE');
        await engine.stop();
    });

    it('resynchronizes after WebSocket reconnect', async () => {
        const rest = new FakeRest(); const ws = new FakeWs();
        rest.snapshots = [snap(100), snap(105)];
        const { engine } = create(rest, ws);
        await engine.start();
        ws.lifecycle({ type: 'reconnecting', at: 20, attempt: 1, delayMs: 1 });
        expect(engine.getHealth().status).toBe('RECONNECTING');
        ws.lifecycle({ type: 'connected', at: 21 });
        await flush();
        expect(engine.getHealth().reconnectCount).toBe(1);
        expect(engine.getHealth().resyncCount).toBe(1);
        expect(engine.getSnapshot().lastUpdateId).toBe(105);
        await engine.stop();
    });

    it('actively recovers a silently stale depth feed', async () => {
        const rest = new FakeRest();
        const ws = new FakeWs();

        rest.snapshots = [snap(100), snap(105)];

        const { engine } = create(rest, ws);
        await engine.start();

        const closeSpy = jest.spyOn(ws, 'close');
        const connectSpy = jest.spyOn(ws, 'connect');

        const lastMessageAt = engine.getHealth().lastMessageAt!;
        engine.checkStaleness(lastMessageAt + 1_001);

        await flush();

        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(connectSpy).toHaveBeenCalledTimes(1);
        expect(engine.getHealth().resyncCount).toBe(1);
        expect(engine.getSnapshot().lastUpdateId).toBe(105);

        await engine.stop();
    });
    it('does not recycle the depth socket again on the next stale check after reconnect resync', async () => {
        const rest = new FakeRest();
        const ws = new FakeWs();

        rest.snapshots = [snap(100), snap(105), snap(110)];

        const { engine } = create(rest, ws);
        await engine.start();

        const closeSpy = jest.spyOn(ws, 'close');
        const connectSpy = jest.spyOn(ws, 'connect');

        const lastMessageAt = engine.getHealth().lastMessageAt!;

        engine.checkStaleness(lastMessageAt + 1_001);
        await flush();

        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(connectSpy).toHaveBeenCalledTimes(1);
        expect(engine.getHealth().resyncCount).toBe(1);

        // Resync completed, but no fresh depth WS event has arrived.
        // Do not recycle again immediately on the following monitor tick.
        engine.checkStaleness(lastMessageAt + 1_002);
        await flush();

        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(connectSpy).toHaveBeenCalledTimes(1);
        expect(engine.getHealth().resyncCount).toBe(1);

        await engine.stop();
    });

    it('ignores updates for another symbol', async () => {
        const { engine, ws } = create();
        await engine.start();
        ws.emit({ ...update(101, 101), symbol: 'ETHUSDT' });
        expect(engine.getHealth().ignoredWrongSymbolEvents).toBe(1);
        await engine.stop();
    });

    it('returns defensive order-book snapshots', async () => {
        const { engine } = create();
        await engine.start();
        const result = engine.getSnapshot();
        result.bids[0].quantity = 999;
        expect(engine.getSnapshot().bids[0].quantity).toBe(2);
        await engine.stop();
    });

    it('stops and closes the depth WebSocket', async () => {
        const { engine, ws } = create();
        await engine.start();
        await engine.stop();
        expect(ws.connected).toBe(false);
        expect(engine.getHealth().status).toBe('STOPPED');
    });
});
