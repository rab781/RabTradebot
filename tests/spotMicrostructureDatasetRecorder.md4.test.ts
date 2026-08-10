import { SpotMicrostructureDatasetRecorder } from '../src/services/research/spotMicrostructureDatasetRecorder';
import {
    SpotResearchDatasetManifest,
    SpotResearchDatasetStore,
    SpotResearchFeatureRecord,
    SpotResearchOutcomeRecord,
} from '../src/services/research/spotMicrostructureDatasetTypes';
import { SPOT_MICROSTRUCTURE_SCHEMA_VERSION } from '../src/services/marketData/spotMicrostructureTypes';

class MemoryStore implements SpotResearchDatasetStore {
    manifest?: SpotResearchDatasetManifest;
    features: SpotResearchFeatureRecord[] = [];
    outcomes: SpotResearchOutcomeRecord[] = [];
    featureIds = new Set<string>();
    outcomeIds = new Set<string>();
    async initialize(manifest: SpotResearchDatasetManifest): Promise<void> { this.manifest = manifest; }
    async appendFeature(record: SpotResearchFeatureRecord): Promise<boolean> {
        if (this.featureIds.has(record.sampleId)) return false;
        this.featureIds.add(record.sampleId); this.features.push(record); return true;
    }
    async appendOutcome(record: SpotResearchOutcomeRecord): Promise<boolean> {
        const key = `${record.sampleId}:${record.horizonMs}`;
        if (this.outcomeIds.has(key)) return false;
        this.outcomeIds.add(key); this.outcomes.push(record); return true;
    }
    async loadFeaturesSince(since: number): Promise<SpotResearchFeatureRecord[]> {
        return this.features.filter((x) => x.sampledAt >= since);
    }
    async loadLatestFeature(): Promise<SpotResearchFeatureRecord | undefined> {
        return this.features.length > 0 ? this.features[this.features.length - 1] : undefined;
    }
    async hasOutcome(sampleId: string, horizonMs: number): Promise<boolean> {
        return this.outcomeIds.has(`${sampleId}:${horizonMs}`);
    }
}

function source() {
    let now = 1_000_000;
    let mid = 100;
    let healthy = true;
    let depthAge = 20;
    const names = ['f1', 'f2'];
    return {
        setTime(value: number) { now = value; },
        setMid(value: number) { mid = value; },
        setHealthy(value: boolean) { healthy = value; },
        setDepthAge(value: number) { depthAge = value; },
        getSnapshot(at = now) {
            now = at;
            return {
                schemaVersion: SPOT_MICROSTRUCTURE_SCHEMA_VERSION,
                symbol: 'BTCUSDT', generatedAt: now,
                midPrice: mid, spreadBps: 0.1, microPrice: mid, microPriceDeviationBps: 0,
                topQueueImbalance: 0,
                depth1: {} as never, depth5: {} as never, depth10: {} as never, depth20: {} as never,
                trade1s: {} as never, trade5s: {} as never, trade30s: {} as never, trade60s: {} as never,
                depthFlow1s: {} as never, depthFlow5s: {} as never, depthFlow30s: {} as never, depthFlow60s: {} as never,
                quality: {
                    healthy, marketStatus: 'LIVE' as const, depthStatus: 'LIVE' as const,
                    lastTradeAgeMs: 10, lastDepthAgeMs: depthAge,
                    tradeSamples60s: 10, ofiSamples60s: 20, reasons: healthy ? [] : ['depth-stale'],
                },
            };
        },
        toFlatVector() { return { schemaVersion: SPOT_MICROSTRUCTURE_SCHEMA_VERSION, names, values: [1, 2] }; },
    };
}

describe('MD4 SpotMicrostructureDatasetRecorder', () => {
    test('writes a feature row without any future label fields', async () => {
        const s = source(); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT', horizonsMs: [1000] });
        await recorder.initialize(1_000_000);
        await recorder.sample(1_000_000);
        expect(store.features).toHaveLength(1);
        expect(store.outcomes).toHaveLength(0);
        expect((store.features[0] as unknown as Record<string, unknown>).forwardReturn).toBeUndefined();
    });

    test('uses depth receive time as reference observation time', async () => {
        const s = source(); s.setDepthAge(25); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT', horizonsMs: [1000] });
        await recorder.initialize(1_000_000);
        await recorder.sample(1_000_000);
        expect(store.features[0].referenceObservedAt).toBe(999_975);
    });

    test('settles forward return only after horizon is reached', async () => {
        const s = source(); s.setDepthAge(0); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT', horizonsMs: [1000], sampleIntervalMs: 1000 });
        await recorder.initialize(1_000_000);
        await recorder.sample(1_000_000);
        s.setMid(101);
        await recorder.sample(1_000_500);
        expect(store.outcomes).toHaveLength(0);
        await recorder.sample(1_001_000);
        expect(store.outcomes).toHaveLength(1);
        expect(store.outcomes[0].forwardReturn).toBeCloseTo(0.01, 12);
        expect(store.outcomes[0].forwardReturnBps).toBeCloseTo(100, 8);
    });

    test('high-frequency settlement ticks do not increase feature cadence and can settle labels with low lag', async () => {
        const s = source(); s.setDepthAge(0); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, {
            symbol: 'BTCUSDT', horizonsMs: [1000], sampleIntervalMs: 1000, maxObservationLagMs: 2000,
        });
        await recorder.initialize(1_000_000);
        await recorder.sample(1_000_000);
        s.setMid(101);
        for (let now = 1_000_100; now <= 1_000_900; now += 100) {
            await recorder.sample(now);
        }
        expect(store.features).toHaveLength(1);
        expect(store.outcomes).toHaveLength(0);
        await recorder.sample(1_001_000);
        expect(store.features).toHaveLength(2);
        expect(store.outcomes).toHaveLength(1);
        expect(store.outcomes[0].observationLagMs).toBe(0);
    });

    test('keeps feature cadence anchored when settlement callbacks arrive late', async () => {
        const s = source(); s.setDepthAge(0); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, {
            symbol: 'BTCUSDT', horizonsMs: [60_000], sampleIntervalMs: 1000, maxObservationLagMs: 2000,
        });
        await recorder.initialize(1_000_000);

        await recorder.sample(1_000_000); // due 1_000_000; next due 1_001_000
        await recorder.sample(1_001_099); // 99ms late; next due must remain 1_002_000
        await recorder.sample(1_002_098); // 98ms late; should still sample here
        await recorder.sample(1_003_097); // 97ms late; should still sample here

        expect(store.features).toHaveLength(4);
        expect(store.features.map((x) => x.sampledAt)).toEqual([
            1_000_000, 1_001_099, 1_002_098, 1_003_097,
        ]);
        expect(store.features.map((x) => x.sampleSlotAt)).toEqual([
            1_000_000, 1_001_000, 1_002_000, 1_003_000,
        ]);
    });

    test('does not backfill synthetic rows after a missed cadence slot', async () => {
        const s = source(); s.setDepthAge(0); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, {
            symbol: 'BTCUSDT', horizonsMs: [60_000], sampleIntervalMs: 1000, maxObservationLagMs: 2000,
        });
        await recorder.initialize(1_000_000);

        await recorder.sample(1_000_000);
        await recorder.sample(1_002_500); // missed the 1_001_000 slot; one current row only
        await recorder.sample(1_002_999); // next fixed due is 1_003_000
        expect(store.features).toHaveLength(2);
        expect(store.features.map((x) => x.sampleSlotAt)).toEqual([1_000_000, 1_002_000]);
        await recorder.sample(1_003_000);
        expect(store.features).toHaveLength(3);
    });

    test('anchors forward horizon to feature sampledAt, not older depth referenceObservedAt', async () => {
        const s = source(); s.setDepthAge(100); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, {
            symbol: 'BTCUSDT', horizonsMs: [1000], sampleIntervalMs: 1000, maxObservationLagMs: 2000,
        });
        await recorder.initialize(1_000_000);
        await recorder.sample(1_000_000);
        expect(store.features[0].referenceObservedAt).toBe(999_900);
        s.setMid(101);
        s.setDepthAge(0);
        await recorder.sample(1_001_000);
        expect(store.outcomes).toHaveLength(1);
        expect(store.outcomes[0].targetTime).toBe(1_001_000);
        expect(store.outcomes[0].observationLagMs).toBe(0);
    });

    test('records observation lag', async () => {
        const s = source(); s.setDepthAge(0); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT', horizonsMs: [1000], maxObservationLagMs: 500 });
        await recorder.initialize(1_000_000);
        await recorder.sample(1_000_000);
        s.setMid(100.5);
        await recorder.sample(1_001_125);
        expect(store.outcomes[0].observationLagMs).toBe(125);
    });

    test('expires labels observed beyond max lag', async () => {
        const s = source(); s.setDepthAge(0); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT', horizonsMs: [1000], maxObservationLagMs: 100 });
        await recorder.initialize(1_000_000);
        await recorder.sample(1_000_000);
        await recorder.sample(1_001_500);
        expect(store.outcomes).toHaveLength(0);
        expect(recorder.getStats().expiredOutcomes).toBe(1);
    });

    test('skips unhealthy feature snapshots by default', async () => {
        const s = source(); s.setHealthy(false); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT' });
        await recorder.initialize(1_000_000);
        await recorder.sample(1_000_000);
        expect(store.features).toHaveLength(0);
        expect(recorder.getStats().skippedUnhealthySamples).toBe(1);
    });

    test('can record unhealthy snapshots when explicitly configured', async () => {
        const s = source(); s.setHealthy(false); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT', recordOnlyHealthy: false });
        await recorder.initialize(1_000_000);
        await recorder.sample(1_000_000);
        expect(store.features).toHaveLength(1);
        expect(store.features[0].quality.healthy).toBe(false);
    });

    test('keeps distinct fixed-grid rows even when the latest depth observation is unchanged', async () => {
        const s = source(); s.setDepthAge(0); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT', sampleIntervalMs: 1 });
        await recorder.initialize(1_000_000);
        await recorder.sample(1_000_000);
        s.setDepthAge(1); // next wall-clock ms maps to the same latest depth observation
        await recorder.sample(1_000_001);
        expect(store.features).toHaveLength(2);
        expect(store.features.map((x) => x.sampleSlotAt)).toEqual([1_000_000, 1_000_001]);
        expect(store.features[0].referenceObservedAt).toBe(store.features[1].referenceObservedAt);
        expect(recorder.getStats().skippedDuplicateSamples).toBe(0);
    });

    test('creates deterministic sample IDs from symbol/schema/fixed slot time', async () => {
        const s = source(); s.setDepthAge(0); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'btcusdt' });
        await recorder.initialize(1_000_000);
        await recorder.sample(1_000_000);
        expect(store.features[0].sampleId).toBe('BTCUSDT:spot-microstructure-v1:slot:1000000');
    });

    test('creates one pending outcome per configured horizon', async () => {
        const s = source(); s.setDepthAge(0); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT', horizonsMs: [1000, 5000, 15000] });
        await recorder.initialize(1_000_000);
        await recorder.sample(1_000_000);
        expect(recorder.getStats().pendingOutcomes).toBe(3);
    });

    test('rejects duplicated horizon configuration', () => {
        expect(() => new SpotMicrostructureDatasetRecorder(source(), new MemoryStore(), {
            symbol: 'BTCUSDT', horizonsMs: [1000, 1000],
        })).toThrow(/duplicates/);
    });

    test('rejects symbol mismatch during initialization', async () => {
        const s = source(); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'ETHUSDT' });
        await expect(recorder.initialize(1_000_000)).rejects.toThrow(/symbol mismatch/i);
    });


    test('restores unresolved horizons after recorder restart', async () => {
        const s = source(); s.setDepthAge(0); const store = new MemoryStore();
        const first = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT', horizonsMs: [5000], maxObservationLagMs: 2000 });
        await first.initialize(1_000_000);
        await first.sample(1_000_000);
        const second = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT', horizonsMs: [5000], maxObservationLagMs: 2000 });
        await second.initialize(1_003_000);
        expect(second.getStats().pendingOutcomes).toBe(1);
        s.setMid(102);
        await second.sample(1_005_000);
        expect(store.outcomes).toHaveLength(1);
        expect(store.outcomes[0].forwardReturn).toBeCloseTo(0.02, 12);
    });

    test('restores the fixed-grid phase after recorder restart without synthetic backfill', async () => {
        const s = source(); s.setDepthAge(0); const store = new MemoryStore();
        const first = new SpotMicrostructureDatasetRecorder(s, store, {
            symbol: 'BTCUSDT', sampleIntervalMs: 1000, horizonsMs: [5000],
        });
        await first.initialize(1_000_342);
        await first.sample(1_000_342);

        const second = new SpotMicrostructureDatasetRecorder(s, store, {
            symbol: 'BTCUSDT', sampleIntervalMs: 1000, horizonsMs: [5000],
        });
        await second.initialize(1_003_768);
        const resumed = await second.sample(1_003_768);

        expect(store.features).toHaveLength(2);
        expect(store.features.map((x) => x.sampleSlotAt)).toEqual([1_000_342, 1_003_342]);
        expect(resumed?.sampledAt).toBe(1_003_768);
        expect(resumed?.sampleSlotAt).toBe(1_003_342);
        expect(store.features.some((x) => x.sampleSlotAt === 1_001_342 || x.sampleSlotAt === 1_002_342)).toBe(false);
    });

    test('fails closed if persisted scheduler slot is ahead of the restart clock', async () => {
        const s = source(); s.setDepthAge(0); const store = new MemoryStore();
        const first = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT' });
        await first.initialize(1_000_000);
        await first.sample(1_000_000);

        const second = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT' });
        await expect(second.initialize(999_999)).rejects.toThrow(/research clock backwards/i);
    });

    test('does not restore horizons that already have persisted outcomes', async () => {
        const s = source(); s.setDepthAge(0); const store = new MemoryStore();
        const first = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT', horizonsMs: [1000], maxObservationLagMs: 2000 });
        await first.initialize(1_000_000);
        await first.sample(1_000_000);
        s.setMid(101); await first.sample(1_001_000);
        const second = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT', horizonsMs: [1000], maxObservationLagMs: 2000 });
        await second.initialize(1_001_100);
        expect(second.getStats().pendingOutcomes).toBeGreaterThanOrEqual(0);
        expect(second.getStats().pendingOutcomes).toBe(1); // the newer feature at 1,001,000 is pending; old one is not restored
    });

    test('target quality is recorded independently of feature quality', async () => {
        const s = source(); s.setDepthAge(0); const store = new MemoryStore();
        const recorder = new SpotMicrostructureDatasetRecorder(s, store, { symbol: 'BTCUSDT', horizonsMs: [1000], recordOnlyHealthy: true });
        await recorder.initialize(1_000_000);
        await recorder.sample(1_000_000);
        s.setHealthy(false); s.setMid(99);
        await recorder.sample(1_001_000);
        expect(store.outcomes[0].targetQualityHealthy).toBe(false);
        expect(store.outcomes[0].targetQualityReasons).toEqual(['depth-stale']);
    });
});
