import {
    SPOT_RESEARCH_DATASET_VERSION,
    SpotMicrostructureFeatureRecorderSource,
    SpotResearchDatasetManifest,
    SpotResearchDatasetStats,
    SpotResearchDatasetStore,
    SpotResearchFeatureRecord,
    SpotResearchOutcomeRecord,
} from './spotMicrostructureDatasetTypes';

interface PendingOutcome {
    feature: SpotResearchFeatureRecord;
    horizonMs: number;
    targetTime: number;
    expiresAt: number;
}

export interface SpotMicrostructureDatasetRecorderOptions {
    symbol: string;
    sampleIntervalMs?: number;
    horizonsMs?: number[];
    maxObservationLagMs?: number;
    recordOnlyHealthy?: boolean;
}

const DEFAULT_HORIZONS_MS = [1_000, 5_000, 15_000, 30_000, 60_000];

function validatePositiveInteger(value: number, name: string): void {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer.`);
    }
}

function deterministicSampleId(symbol: string, schemaVersion: string, sampleSlotAt: number): string {
    return `${symbol}:${schemaVersion}:slot:${sampleSlotAt}`;
}

function cloneQuality<T extends { reasons: string[] }>(quality: T): T {
    return { ...quality, reasons: [...quality.reasons] };
}

/**
 * Leak-safe research recorder.
 *
 * Feature records are persisted immediately at t. Outcomes are emitted only after
 * their future horizon has elapsed, and are stored separately from features.
 * This prevents future prices from contaminating the feature row itself.
 */
export class SpotMicrostructureDatasetRecorder {
    private readonly symbol: string;
    private readonly sampleIntervalMs: number;
    private readonly horizonsMs: number[];
    private readonly maxObservationLagMs: number;
    private readonly recordOnlyHealthy: boolean;
    private initialized = false;
    private lastSampledAt?: number;
    /** Fixed cadence anchor. Actual callback jitter must not shift future sample slots. */
    private nextSampleDueAt?: number;
    private pending: PendingOutcome[] = [];
    private statsState: SpotResearchDatasetStats = {
        featureRecords: 0,
        outcomeRecords: 0,
        skippedUnhealthySamples: 0,
        skippedDuplicateSamples: 0,
        expiredOutcomes: 0,
        pendingOutcomes: 0,
    };

    constructor(
        private readonly features: SpotMicrostructureFeatureRecorderSource,
        private readonly store: SpotResearchDatasetStore,
        options: SpotMicrostructureDatasetRecorderOptions,
    ) {
        this.symbol = options.symbol.toUpperCase();
        this.sampleIntervalMs = options.sampleIntervalMs ?? 1_000;
        this.horizonsMs = [...(options.horizonsMs ?? DEFAULT_HORIZONS_MS)].sort((a, b) => a - b);
        this.maxObservationLagMs = options.maxObservationLagMs ?? Math.max(this.sampleIntervalMs * 2, 2_000);
        this.recordOnlyHealthy = options.recordOnlyHealthy ?? true;

        validatePositiveInteger(this.sampleIntervalMs, 'sampleIntervalMs');
        validatePositiveInteger(this.maxObservationLagMs, 'maxObservationLagMs');
        if (this.horizonsMs.length === 0) throw new Error('At least one forward-return horizon is required.');
        for (const horizon of this.horizonsMs) validatePositiveInteger(horizon, 'horizonMs');
        if (new Set(this.horizonsMs).size !== this.horizonsMs.length) {
            throw new Error('horizonsMs must not contain duplicates.');
        }
    }

    async initialize(now = Date.now()): Promise<SpotResearchDatasetManifest> {
        const snapshot = this.features.getSnapshot(now);
        if (snapshot.symbol.toUpperCase() !== this.symbol) {
            throw new Error(`Feature-source symbol mismatch: ${snapshot.symbol}`);
        }
        const vector = this.features.toFlatVector(snapshot);
        if (vector.names.length !== vector.values.length || vector.values.length === 0) {
            throw new Error('Feature schema is empty or misaligned.');
        }
        if (!vector.values.every(Number.isFinite)) {
            throw new Error('Feature schema bootstrap contains non-finite values.');
        }
        const manifest: SpotResearchDatasetManifest = {
            datasetVersion: SPOT_RESEARCH_DATASET_VERSION,
            schemaVersion: vector.schemaVersion,
            symbol: this.symbol,
            featureNames: [...vector.names],
            sampleIntervalMs: this.sampleIntervalMs,
            horizonsMs: [...this.horizonsMs],
            createdAt: now,
        };
        await this.store.initialize(manifest);
        this.initialized = true;
        await this.restorePending(now);
        return manifest;
    }

    /** Sample once. Call this from a deterministic scheduler in live collection. */
    async sample(now = Date.now()): Promise<SpotResearchFeatureRecord | undefined> {
        this.ensureInitialized();
        const snapshot = this.features.getSnapshot(now);
        if (snapshot.symbol.toUpperCase() !== this.symbol) {
            throw new Error(`Feature-source symbol mismatch: ${snapshot.symbol}`);
        }

        // First use the current mid-price observation to settle older labels.
        await this.settlePending(snapshot.generatedAt, snapshot.midPrice, snapshot.quality);

        // Keep feature sampling on a fixed cadence grid.
        // Do NOT anchor the next sample to the actual callback time: timer jitter would
        // otherwise accumulate (e.g. 1000ms target gradually becoming ~1100ms).
        if (this.nextSampleDueAt === undefined) {
            this.nextSampleDueAt = now;
        }
        if (now < this.nextSampleDueAt) {
            this.statsState.pendingOutcomes = this.pending.length;
            return undefined;
        }

        // If the process was paused long enough to miss one or more complete slots, do not
        // backfill synthetic historical features. Record one current snapshot and advance
        // to the next future slot while preserving the original cadence phase.
        const slotsLate = Math.floor((now - this.nextSampleDueAt) / this.sampleIntervalMs);
        const sampleSlotAt = this.nextSampleDueAt + slotsLate * this.sampleIntervalMs;
        this.nextSampleDueAt = sampleSlotAt + this.sampleIntervalMs;
        this.lastSampledAt = now;
        this.statsState.lastSampledAt = now;

        if (this.recordOnlyHealthy && !snapshot.quality.healthy) {
            this.statsState.skippedUnhealthySamples += 1;
            this.statsState.pendingOutcomes = this.pending.length;
            return undefined;
        }

        const vector = this.features.toFlatVector(snapshot);
        if (vector.names.length !== vector.values.length || vector.values.length === 0) {
            throw new Error('Feature vector is empty or misaligned.');
        }
        if (!vector.values.every(Number.isFinite) || !Number.isFinite(snapshot.midPrice) || snapshot.midPrice <= 0) {
            throw new Error('Refusing to record non-finite microstructure features or reference price.');
        }

        // Mid-price originates from the latest depth snapshot. Reconstruct its local receive time
        // from the quality age rather than pretending wall-clock sample time is exchange event time.
        const depthAge = snapshot.quality.lastDepthAgeMs ?? 0;
        const referenceObservedAt = Math.max(0, snapshot.generatedAt - depthAge);
        const record: SpotResearchFeatureRecord = {
            recordType: 'FEATURE',
            datasetVersion: SPOT_RESEARCH_DATASET_VERSION,
            schemaVersion: vector.schemaVersion,
            sampleId: deterministicSampleId(this.symbol, vector.schemaVersion, sampleSlotAt),
            symbol: this.symbol,
            sampleSlotAt,
            sampledAt: snapshot.generatedAt,
            referenceObservedAt,
            referenceMidPrice: snapshot.midPrice,
            featureNames: [...vector.names],
            featureValues: [...vector.values],
            quality: cloneQuality(snapshot.quality),
        };

        const inserted = await this.store.appendFeature(record);
        if (!inserted) {
            this.statsState.skippedDuplicateSamples += 1;
            this.statsState.pendingOutcomes = this.pending.length;
            return undefined;
        }

        this.statsState.featureRecords += 1;
        for (const horizonMs of this.horizonsMs) {
            const targetTime = record.sampledAt + horizonMs;
            this.pending.push({
                feature: record,
                horizonMs,
                targetTime,
                expiresAt: targetTime + this.maxObservationLagMs,
            });
        }
        this.statsState.pendingOutcomes = this.pending.length;
        return record;
    }

    async flush(now = Date.now()): Promise<void> {
        this.ensureInitialized();
        const snapshot = this.features.getSnapshot(now);
        await this.settlePending(snapshot.generatedAt, snapshot.midPrice, snapshot.quality);
        if (this.store.close) await this.store.close();
    }

    getStats(): SpotResearchDatasetStats {
        return { ...this.statsState, pendingOutcomes: this.pending.length };
    }

    private async restorePending(now: number): Promise<void> {
        if (!this.store.loadFeaturesSince || !this.store.hasOutcome) return;
        const maxHorizon = Math.max(...this.horizonsMs);
        const since = now - maxHorizon - this.maxObservationLagMs;
        const recent = await this.store.loadFeaturesSince(since);
        for (const feature of recent) {
            for (const horizonMs of this.horizonsMs) {
                if (await this.store.hasOutcome(feature.sampleId, horizonMs)) continue;
                const targetTime = feature.datasetVersion === 'spot-microstructure-dataset-v1'
                    ? feature.referenceObservedAt + horizonMs
                    : feature.sampledAt + horizonMs;
                const expiresAt = targetTime + this.maxObservationLagMs;
                if (expiresAt < now) {
                    this.statsState.expiredOutcomes += 1;
                    continue;
                }
                this.pending.push({ feature, horizonMs, targetTime, expiresAt });
            }
        }
        this.statsState.pendingOutcomes = this.pending.length;
    }

    private async settlePending(
        sampledAt: number,
        midPrice: number,
        quality: { healthy: boolean; lastDepthAgeMs?: number; reasons: string[] },
    ): Promise<void> {
        if (!Number.isFinite(midPrice) || midPrice <= 0) return;
        const depthAge = quality.lastDepthAgeMs ?? 0;
        const observedAt = Math.max(0, sampledAt - depthAge);
        const stillPending: PendingOutcome[] = [];

        for (const pending of this.pending) {
            if (observedAt < pending.targetTime) {
                stillPending.push(pending);
                continue;
            }
            if (observedAt > pending.expiresAt) {
                this.statsState.expiredOutcomes += 1;
                continue;
            }

            const reference = pending.feature.referenceMidPrice;
            const forwardReturn = midPrice / reference - 1;
            const record: SpotResearchOutcomeRecord = {
                recordType: 'OUTCOME',
                datasetVersion: SPOT_RESEARCH_DATASET_VERSION,
                schemaVersion: pending.feature.schemaVersion,
                sampleId: pending.feature.sampleId,
                symbol: this.symbol,
                horizonMs: pending.horizonMs,
                targetTime: pending.targetTime,
                observedAt,
                observationLagMs: observedAt - pending.targetTime,
                referenceMidPrice: reference,
                targetMidPrice: midPrice,
                forwardReturn,
                forwardReturnBps: forwardReturn * 10_000,
                forwardLogReturn: Math.log(midPrice / reference),
                targetQualityHealthy: quality.healthy,
                targetQualityReasons: [...quality.reasons],
            };
            const inserted = await this.store.appendOutcome(record);
            if (inserted) this.statsState.outcomeRecords += 1;
        }
        this.pending = stillPending;
        this.statsState.pendingOutcomes = this.pending.length;
    }

    private ensureInitialized(): void {
        if (!this.initialized) throw new Error('SpotMicrostructureDatasetRecorder.initialize() must be called first.');
    }
}
