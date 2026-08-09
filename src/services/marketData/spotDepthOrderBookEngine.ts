import { EventEmitter } from 'events';
import { SpotLocalOrderBook } from './spotLocalOrderBook';
import {
    SpotDepthHealth,
    SpotDepthLifecycleEvent,
    SpotDepthRestPort,
    SpotDepthStatus,
    SpotDepthUpdate,
    SpotDepthWebSocketPort,
    SpotLocalOrderBookSnapshot,
} from './spotDepthTypes';

export interface SpotDepthOrderBookEngineOptions {
    symbol: string;
    snapshotLimit?: 5 | 10 | 20 | 50 | 100 | 500 | 1000 | 5000;
    outputLevels?: number;
    staleAfterMs?: number;
    enableStaleMonitor?: boolean;
    maxSnapshotRetries?: number;
    snapshotRetryDelayMs?: number;
}

export class SpotDepthOrderBookEngine extends EventEmitter {
    private readonly symbol: string;
    private readonly snapshotLimit: number;
    private readonly outputLevels: number;
    private readonly staleAfterMs: number;
    private readonly enableStaleMonitor: boolean;
    private readonly maxSnapshotRetries: number;
    private readonly snapshotRetryDelayMs: number;
    private readonly book: SpotLocalOrderBook;

    private buffer: SpotDepthUpdate[] = [];
    private buffering = false;
    private running = false;
    private bootstrapped = false;
    private staleTimer?: NodeJS.Timeout;
    private resyncPromise?: Promise<void>;
    private healthState: SpotDepthHealth;

    constructor(
        private readonly rest: SpotDepthRestPort,
        private readonly ws: SpotDepthWebSocketPort,
        options: SpotDepthOrderBookEngineOptions,
    ) {
        super();
        this.symbol = options.symbol.toUpperCase();
        this.snapshotLimit = options.snapshotLimit ?? 5000;
        this.outputLevels = options.outputLevels ?? 20;
        this.staleAfterMs = options.staleAfterMs ?? 10_000;
        this.enableStaleMonitor = options.enableStaleMonitor ?? true;
        this.maxSnapshotRetries = options.maxSnapshotRetries ?? 5;
        this.snapshotRetryDelayMs = options.snapshotRetryDelayMs ?? 50;
        this.book = new SpotLocalOrderBook(this.symbol);
        this.healthState = this.makeInitialHealth('STOPPED');

        if (this.outputLevels <= 0 || !Number.isInteger(this.outputLevels)) {
            throw new Error('outputLevels must be a positive integer.');
        }
        if (this.maxSnapshotRetries <= 0 || !Number.isInteger(this.maxSnapshotRetries)) {
            throw new Error('maxSnapshotRetries must be a positive integer.');
        }
    }

    async start(): Promise<void> {
        if (this.running) return;
        this.running = true;
        this.bootstrapped = false;
        this.buffering = true;
        this.buffer = [];
        this.healthState = this.makeInitialHealth('BOOTSTRAPPING');

        try {
            await this.ws.connect(
                this.symbol,
                (event) => this.handleDepthEvent(event),
                (event) => this.handleLifecycle(event),
            );
            await this.synchronize('BOOTSTRAP');
            this.bootstrapped = true;
            const now = Date.now();
            this.healthState.bootstrappedAt = now;
            this.healthState.lastMessageAt = this.healthState.lastMessageAt ?? now;
            this.setStatus('LIVE');
            if (this.enableStaleMonitor) this.startStaleMonitor();
            this.emit('ready', this.getSnapshot());
        } catch (error) {
            this.running = false;
            this.buffering = false;
            await this.ws.close();
            this.healthState.lastError = error instanceof Error ? error.message : String(error);
            this.setStatus('STOPPED');
            throw error;
        }
    }

    async stop(): Promise<void> {
        this.running = false;
        this.bootstrapped = false;
        this.buffering = false;
        this.buffer = [];
        if (this.staleTimer) {
            clearInterval(this.staleTimer);
            this.staleTimer = undefined;
        }
        await this.ws.close();
        this.setStatus('STOPPED');
    }

    getSnapshot(levels = this.outputLevels): SpotLocalOrderBookSnapshot {
        return this.book.getSnapshot(levels);
    }

    getHealth(): SpotDepthHealth {
        return { ...this.healthState };
    }

    checkStaleness(now = Date.now()): SpotDepthStatus {
        if (!this.running || ['STOPPED', 'BOOTSTRAPPING', 'RESYNCING'].includes(this.healthState.status)) {
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

    private async synchronize(reason: 'BOOTSTRAP' | 'GAP' | 'RECONNECT'): Promise<void> {
        this.buffering = true;
        if (reason !== 'BOOTSTRAP') this.setStatus('RESYNCING');

        let lastError: Error | undefined;
        for (let attempt = 1; attempt <= this.maxSnapshotRetries; attempt += 1) {
            try {
                const snapshot = await this.rest.fetchDepthSnapshot(this.symbol, this.snapshotLimit);
                const buffered = this.buffer.slice();
                const first = buffered[0];

                // Binance requires a fresh snapshot if it is strictly older than the first buffered U.
                if (first && snapshot.lastUpdateId < first.firstUpdateId) {
                    this.healthState.snapshotRetryCount += 1;
                    if (attempt < this.maxSnapshotRetries) {
                        await this.delay(this.snapshotRetryDelayMs);
                        continue;
                    }
                    throw new Error(
                        `Depth snapshot ${snapshot.lastUpdateId} remained older than first buffered U=${first.firstUpdateId}.`,
                    );
                }

                this.book.loadSnapshot(snapshot);
                const replay = this.buffer.splice(0);
                for (const update of replay) {
                    if (update.finalUpdateId <= snapshot.lastUpdateId) continue;
                    const result = this.book.apply(update);
                    if (result.status === 'GAP') {
                        throw new Error(
                            `Depth replay gap: expected ${result.expectedUpdateId}, received U=${result.firstUpdateId},u=${result.finalUpdateId}.`,
                        );
                    }
                    if (result.status === 'APPLIED') this.healthState.depthEventsApplied += 1;
                }

                this.buffering = false;
                this.healthState.lastAppliedUpdateId = this.book.lastUpdateId;
                this.healthState.lastError = undefined;
                if (reason !== 'BOOTSTRAP') this.healthState.resyncCount += 1;
                if (this.running) this.setStatus('LIVE');
                this.emit('resynced', { reason, updateId: this.book.lastUpdateId });
                return;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                this.healthState.lastError = lastError.message;
                if (attempt < this.maxSnapshotRetries) {
                    this.healthState.snapshotRetryCount += 1;
                    await this.delay(this.snapshotRetryDelayMs);
                    continue;
                }
            }
        }
        throw lastError ?? new Error('Unable to synchronize Binance Spot depth book.');
    }

    private handleDepthEvent(update: SpotDepthUpdate): void {
        if (update.symbol.toUpperCase() !== this.symbol) {
            this.healthState.ignoredWrongSymbolEvents += 1;
            return;
        }
        this.healthState.lastMessageAt = update.receivedAt;
        if (this.buffering) {
            this.buffer.push(update);
            return;
        }

        try {
            const result = this.book.apply(update);
            if (result.status === 'IGNORED_STALE') {
                this.healthState.staleEventCount += 1;
                return;
            }
            if (result.status === 'GAP') {
                this.healthState.sequenceGapCount += 1;
                this.buffering = true;
                this.buffer.push(update);
                this.emit('gap', result);
                this.triggerResync('GAP');
                return;
            }
            this.healthState.depthEventsApplied += 1;
            this.healthState.lastAppliedUpdateId = result.updateId;
            const snapshot = this.getSnapshot();
            this.emit('depth', snapshot);
            if (this.healthState.status === 'STALE' && this.ws.isConnected()) this.setStatus('LIVE');
        } catch (error) {
            this.healthState.invalidBookCount += 1;
            this.healthState.lastError = error instanceof Error ? error.message : String(error);
            this.buffering = true;
            this.buffer.push(update);
            this.triggerResync('GAP');
        }
    }

    private handleLifecycle(event: SpotDepthLifecycleEvent): void {
        if (event.type === 'reconnecting') {
            this.healthState.reconnectCount += 1;
            this.buffering = true;
            if (this.running) this.setStatus('RECONNECTING');
        } else if (event.type === 'disconnected') {
            this.buffering = true;
            if (this.running) this.setStatus('RECONNECTING');
        } else if (event.type === 'connected') {
            if (this.running && this.bootstrapped) {
                this.triggerResync('RECONNECT');
            }
        } else if (event.type === 'error') {
            this.healthState.lastError = event.error.message;
        }
        this.emit('lifecycle', event);
    }

    private triggerResync(reason: 'GAP' | 'RECONNECT'): void {
        if (this.resyncPromise || !this.running) return;
        this.resyncPromise = this.synchronize(reason)
            .catch((error) => {
                this.healthState.lastError = error instanceof Error ? error.message : String(error);
                this.setStatus('STALE');
                if (this.listenerCount('error') > 0) this.emit('error', error);
            })
            .finally(() => {
                this.resyncPromise = undefined;
            });
    }

    private makeInitialHealth(status: SpotDepthStatus): SpotDepthHealth {
        return {
            status,
            symbol: this.symbol,
            reconnectCount: 0,
            resyncCount: 0,
            sequenceGapCount: 0,
            staleEventCount: 0,
            invalidBookCount: 0,
            snapshotRetryCount: 0,
            depthEventsApplied: 0,
            ignoredWrongSymbolEvents: 0,
        };
    }

    private setStatus(status: SpotDepthStatus): void {
        if (this.healthState.status === status) return;
        this.healthState.status = status;
        this.emit('status', status);
    }

    private startStaleMonitor(): void {
        if (this.staleTimer) clearInterval(this.staleTimer);
        const frequency = Math.max(250, Math.min(1_000, Math.floor(this.staleAfterMs / 2)));
        this.staleTimer = setInterval(() => this.checkStaleness(), frequency);
        this.staleTimer.unref?.();
    }

    private async delay(ms: number): Promise<void> {
        if (ms <= 0) return;
        await new Promise<void>((resolve) => setTimeout(resolve, ms));
    }
}
