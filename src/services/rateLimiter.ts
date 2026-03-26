type BucketType = 'rest' | 'order' | 'ws';

interface BucketConfig {
    capacity: number;
    refillPerSecond: number;
}

interface BucketState {
    tokens: number;
    lastRefillTs: number;
}

export interface RateLimiterSnapshot {
    restTokens: number;
    orderTokens: number;
    wsTokens: number;
    lastSyncTime: number;
    rest: {
        used: number;
        capacity: number;
    };
    order: {
        used: number;
        capacity: number;
    };
}

export class RateLimiter {
    private readonly buckets = new Map<BucketType, BucketConfig>();
    private readonly states = new Map<BucketType, BucketState>();
    private lastHeaderSyncTs = 0;

    constructor() {
        const restCapacity = this.envInt('BINANCE_MAX_WEIGHT_PER_MINUTE', 1200);
        const orderPerSecond = this.envInt('BINANCE_MAX_ORDERS_PER_SECOND', 10);
        const wsCapacity = this.envInt('BINANCE_MAX_WS_STREAMS', 5);

        this.buckets.set('rest', {
            capacity: restCapacity,
            refillPerSecond: restCapacity / 60,
        });

        this.buckets.set('order', {
            capacity: orderPerSecond,
            refillPerSecond: orderPerSecond,
        });

        // Placeholder bucket for future websocket limiter integration.
        this.buckets.set('ws', {
            capacity: wsCapacity,
            refillPerSecond: wsCapacity,
        });

        const now = Date.now();
        this.states.set('rest', { tokens: restCapacity, lastRefillTs: now });
        this.states.set('order', { tokens: orderPerSecond, lastRefillTs: now });
        this.states.set('ws', { tokens: wsCapacity, lastRefillTs: now });
    }

    async acquire(bucket: BucketType, cost = 1, timeoutMs = 30000): Promise<void> {
        if (cost <= 0) {
            return;
        }

        const started = Date.now();

        while (true) {
            const state = this.refill(bucket);
            if (state.tokens >= cost) {
                state.tokens -= cost;
                return;
            }

            const cfg = this.mustGetBucket(bucket);
            const deficit = cost - state.tokens;
            const waitMs = Math.ceil((deficit / cfg.refillPerSecond) * 1000);

            if (Date.now() - started + waitMs > timeoutMs) {
                throw new Error(`Rate limiter timeout for bucket=${bucket}, cost=${cost}`);
            }

            await this.sleep(Math.max(1, waitMs));
        }
    }

    syncFromHeaders(headers?: Record<string, unknown>): void {
        if (!headers) {
            return;
        }

        const restUsed = this.readNumericHeader(headers, [
            'x-mbx-used-weight-1m',
            'x-mbx-used-weight',
        ]);

        if (typeof restUsed === 'number') {
            const restCfg = this.mustGetBucket('rest');
            const state = this.refill('rest');
            state.tokens = this.clamp(restCfg.capacity - restUsed, 0, restCfg.capacity);
            state.lastRefillTs = Date.now();
            this.lastHeaderSyncTs = Date.now();
        }

        const orderUsed = this.readNumericHeader(headers, [
            'x-mbx-order-count-1s',
            'x-mbx-order-count-1m',
        ]);

        if (typeof orderUsed === 'number') {
            const orderCfg = this.mustGetBucket('order');
            const state = this.refill('order');
            state.tokens = this.clamp(orderCfg.capacity - orderUsed, 0, orderCfg.capacity);
            state.lastRefillTs = Date.now();
            this.lastHeaderSyncTs = Date.now();
        }
    }

    getSnapshot(): RateLimiterSnapshot {
        const restCfg = this.mustGetBucket('rest');
        const orderCfg = this.mustGetBucket('order');
        const rest = this.refill('rest').tokens;
        const order = this.refill('order').tokens;
        const ws = this.refill('ws').tokens;

        return {
            restTokens: rest,
            orderTokens: order,
            wsTokens: ws,
            lastSyncTime: this.lastHeaderSyncTs,
            rest: {
                used: this.clamp(restCfg.capacity - rest, 0, restCfg.capacity),
                capacity: restCfg.capacity,
            },
            order: {
                used: this.clamp(orderCfg.capacity - order, 0, orderCfg.capacity),
                capacity: orderCfg.capacity,
            },
        };
    }

    private refill(bucket: BucketType): BucketState {
        const cfg = this.mustGetBucket(bucket);
        const state = this.mustGetState(bucket);

        const now = Date.now();
        const elapsedMs = Math.max(0, now - state.lastRefillTs);

        if (elapsedMs > 0) {
            const refillAmount = (elapsedMs / 1000) * cfg.refillPerSecond;
            state.tokens = this.clamp(state.tokens + refillAmount, 0, cfg.capacity);
            state.lastRefillTs = now;
        }

        return state;
    }

    private readNumericHeader(headers: Record<string, unknown>, names: string[]): number | undefined {
        for (const name of names) {
            const direct = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
            const parsed = this.parseHeaderValue(direct);
            if (typeof parsed === 'number') {
                return parsed;
            }
        }

        return undefined;
    }

    private parseHeaderValue(value: unknown): number | undefined {
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return undefined;
            }
            return this.parseHeaderValue(value[0]);
        }

        if (typeof value !== 'string' && typeof value !== 'number') {
            return undefined;
        }

        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return undefined;
        }

        return parsed;
    }

    private envInt(name: string, fallback: number): number {
        const raw = process.env[name];
        if (!raw) {
            return fallback;
        }

        const parsed = parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return fallback;
        }

        return parsed;
    }

    private mustGetBucket(bucket: BucketType): BucketConfig {
        const cfg = this.buckets.get(bucket);
        if (!cfg) {
            throw new Error(`Unknown rate limiter bucket: ${bucket}`);
        }
        return cfg;
    }

    private mustGetState(bucket: BucketType): BucketState {
        const state = this.states.get(bucket);
        if (!state) {
            throw new Error(`Missing rate limiter state for bucket: ${bucket}`);
        }
        return state;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), max);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

export const rateLimiter = new RateLimiter();
