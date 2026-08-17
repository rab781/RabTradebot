export type BinanceRestOperationalStatus =
    | 'UNKNOWN'
    | 'HEALTHY'
    | 'DEGRADED'
    | 'UNAVAILABLE';

export interface BinanceRestOperationalSnapshot {
    status: BinanceRestOperationalStatus;
    checkedAt: number | null;
    lastSuccessAt: number | null;
    lastFailureAt: number | null;
    latencyMs: number | null;
    error: string | null;
    source: string | null;
}

export interface BinanceRestEntryGate {
    allowed: boolean;
    blockers: string[];
    status: BinanceRestOperationalStatus;
    checkedAt: number | null;
    ageMs: number | null;
}

export interface BinanceRestOperationalStatePort {
    markHealthy(input?: {
        checkedAt?: number;
        latencyMs?: number;
        source?: string;
    }): void;

    markDegraded(input?: {
        checkedAt?: number;
        error?: string;
        latencyMs?: number;
        source?: string;
    }): void;

    markUnavailable(input?: {
        checkedAt?: number;
        error?: string;
        latencyMs?: number;
        source?: string;
    }): void;

    markUnknown(input?: {
        checkedAt?: number;
        error?: string;
        source?: string;
    }): void;

    getSnapshot(): BinanceRestOperationalSnapshot;

    getEntryGate(
        now?: number,
        maxHealthyAgeMs?: number,
    ): BinanceRestEntryGate;

    reset(): void;
}

/**
 * Process-local operational truth for Binance Spot REST reachability.
 *
 * This is intentionally separate from order/reconciliation state:
 * - NEW live entries fail closed when REST health is unknown, stale, or unavailable.
 * - Existing LONG exits/reconciliation are NOT prevented from attempting REST calls;
 *   they must remain manageable as soon as connectivity recovers.
 */
export class BinanceRestOperationalState
implements BinanceRestOperationalStatePort {
    private status: BinanceRestOperationalStatus = 'UNKNOWN';
    private checkedAt: number | null = null;
    private lastSuccessAt: number | null = null;
    private lastFailureAt: number | null = null;
    private latencyMs: number | null = null;
    private error: string | null = null;
    private source: string | null = null;

    markHealthy(
        input: {
            checkedAt?: number;
            latencyMs?: number;
            source?: string;
        } = {},
    ): void {
        const checkedAt = input.checkedAt ?? Date.now();

        this.status = 'HEALTHY';
        this.checkedAt = checkedAt;
        this.lastSuccessAt = checkedAt;
        this.latencyMs = this.normalizeLatency(input.latencyMs);
        this.error = null;
        this.source = input.source ?? 'UNKNOWN';
    }

    markDegraded(
        input: {
            checkedAt?: number;
            error?: string;
            latencyMs?: number;
            source?: string;
        } = {},
    ): void {
        const checkedAt = input.checkedAt ?? Date.now();

        this.status = 'DEGRADED';
        this.checkedAt = checkedAt;
        this.lastSuccessAt = checkedAt;
        this.latencyMs = this.normalizeLatency(input.latencyMs);
        this.error = input.error ?? 'Binance REST degraded';
        this.source = input.source ?? 'UNKNOWN';
    }

    markUnavailable(
        input: {
            checkedAt?: number;
            error?: string;
            latencyMs?: number;
            source?: string;
        } = {},
    ): void {
        const checkedAt = input.checkedAt ?? Date.now();

        this.status = 'UNAVAILABLE';
        this.checkedAt = checkedAt;
        this.lastFailureAt = checkedAt;
        this.latencyMs = this.normalizeLatency(input.latencyMs);
        this.error = input.error ?? 'Binance REST unavailable';
        this.source = input.source ?? 'UNKNOWN';
    }

    markUnknown(
        input: {
            checkedAt?: number;
            error?: string;
            source?: string;
        } = {},
    ): void {
        this.status = 'UNKNOWN';
        this.checkedAt = input.checkedAt ?? Date.now();
        this.latencyMs = null;
        this.error = input.error ?? null;
        this.source = input.source ?? 'UNKNOWN';
    }

    getSnapshot(): BinanceRestOperationalSnapshot {
        return {
            status: this.status,
            checkedAt: this.checkedAt,
            lastSuccessAt: this.lastSuccessAt,
            lastFailureAt: this.lastFailureAt,
            latencyMs: this.latencyMs,
            error: this.error,
            source: this.source,
        };
    }

    getEntryGate(
        now = Date.now(),
        maxHealthyAgeMs = 60_000,
    ): BinanceRestEntryGate {
        const checkedAt = this.checkedAt;
        const ageMs = checkedAt === null
            ? null
            : Math.max(0, now - checkedAt);

        if (this.status === 'UNAVAILABLE') {
            return {
                allowed: false,
                blockers: ['BINANCE_REST_UNAVAILABLE'],
                status: this.status,
                checkedAt,
                ageMs,
            };
        }

        if (this.status === 'DEGRADED') {
            return {
                allowed: false,
                blockers: ['BINANCE_REST_DEGRADED'],
                status: this.status,
                checkedAt,
                ageMs,
            };
        }

        if (this.status !== 'HEALTHY' || checkedAt === null) {
            return {
                allowed: false,
                blockers: ['BINANCE_REST_HEALTH_UNKNOWN'],
                status: this.status,
                checkedAt,
                ageMs,
            };
        }

        const safeMaxAge = Number.isFinite(maxHealthyAgeMs)
            && maxHealthyAgeMs > 0
            ? maxHealthyAgeMs
            : 60_000;

        if (ageMs !== null && ageMs > safeMaxAge) {
            return {
                allowed: false,
                blockers: ['BINANCE_REST_HEALTH_STALE'],
                status: this.status,
                checkedAt,
                ageMs,
            };
        }

        return {
            allowed: true,
            blockers: [],
            status: this.status,
            checkedAt,
            ageMs,
        };
    }

    reset(): void {
        this.status = 'UNKNOWN';
        this.checkedAt = null;
        this.lastSuccessAt = null;
        this.lastFailureAt = null;
        this.latencyMs = null;
        this.error = null;
        this.source = null;
    }

    private normalizeLatency(value: number | undefined): number | null {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
            return null;
        }
        return value;
    }
}

export const binanceRestOperationalState =
    new BinanceRestOperationalState();
