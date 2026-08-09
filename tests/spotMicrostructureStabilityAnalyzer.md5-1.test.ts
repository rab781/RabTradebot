import {
    analyzeFeatureTiming,
    SpotMicrostructureStabilityAnalyzer,
} from '../src/services/research/spotMicrostructureStabilityAnalyzer';
import {
    SPOT_RESEARCH_DATASET_VERSION,
    SpotResearchDatasetManifest,
    SpotResearchFeatureRecord,
    SpotResearchOutcomeRecord,
} from '../src/services/research/spotMicrostructureDatasetTypes';
import { SPOT_MICROSTRUCTURE_SCHEMA_VERSION } from '../src/services/marketData/spotMicrostructureTypes';

const manifest: SpotResearchDatasetManifest = {
    datasetVersion: SPOT_RESEARCH_DATASET_VERSION,
    schemaVersion: SPOT_MICROSTRUCTURE_SCHEMA_VERSION,
    symbol: 'BTCUSDT',
    featureNames: ['stable', 'flips'],
    sampleIntervalMs: 1000,
    horizonsMs: [5000, 60000],
    createdAt: 1,
};

function quality() {
    return {
        healthy: true,
        marketStatus: 'LIVE' as const,
        depthStatus: 'LIVE' as const,
        lastTradeAgeMs: 10,
        lastDepthAgeMs: 5,
        tradeSamples60s: 10,
        ofiSamples60s: 10,
        reasons: [],
    };
}

function makeFeature(i: number): SpotResearchFeatureRecord {
    const half = i < 600 ? i : 1200 - i;
    return {
        recordType: 'FEATURE',
        datasetVersion: SPOT_RESEARCH_DATASET_VERSION,
        schemaVersion: SPOT_MICROSTRUCTURE_SCHEMA_VERSION,
        sampleId: `s${i}`,
        symbol: 'BTCUSDT',
        sampleSlotAt: i * 1000,
        sampledAt: i * 1000,
        referenceObservedAt: i * 1000,
        referenceMidPrice: 100,
        featureNames: [...manifest.featureNames],
        featureValues: [i, half],
        quality: quality(),
    };
}

function makeOutcome(i: number, horizonMs: number): SpotResearchOutcomeRecord {
    return {
        recordType: 'OUTCOME',
        datasetVersion: SPOT_RESEARCH_DATASET_VERSION,
        schemaVersion: SPOT_MICROSTRUCTURE_SCHEMA_VERSION,
        sampleId: `s${i}`,
        symbol: 'BTCUSDT',
        horizonMs,
        targetTime: i * 1000 + horizonMs,
        observedAt: i * 1000 + horizonMs + 20,
        observationLagMs: 20,
        referenceMidPrice: 100,
        targetMidPrice: 100 + i / 10000,
        forwardReturn: i / 1_000_000,
        forwardReturnBps: i / 100,
        forwardLogReturn: Math.log(1 + i / 1_000_000),
        targetQualityHealthy: true,
        targetQualityReasons: [],
    };
}

describe('MD5.1 feature timing QA', () => {
    test('detects perfect fixed-grid cadence', () => {
        const features = Array.from({ length: 10 }, (_, i) => makeFeature(i));
        const qa = analyzeFeatureTiming(manifest, features);
        expect(qa.expectedSlots).toBe(10);
        expect(qa.observedSlots).toBe(10);
        expect(qa.missingSlots).toBe(0);
        expect(qa.duplicateSlots).toBe(0);
        expect(qa.cadenceCoveragePct).toBe(100);
        expect(qa.intervalMs.p50).toBe(1000);
    });

    test('uses sampleSlotAt for cadence while reporting callback jitter as grid error', () => {
        const features = Array.from({ length: 4 }, (_, i) => ({
            ...makeFeature(i),
            sampledAt: i * 1000 + [0, 99, 98, 97][i],
            referenceObservedAt: i * 1000 + [0, 70, 20, 80][i],
        }));
        const qa = analyzeFeatureTiming(manifest, features);
        expect(qa.observedSlots).toBe(4);
        expect(qa.missingSlots).toBe(0);
        expect(qa.duplicateSlots).toBe(0);
        expect(qa.intervalMs.p50).toBe(1000);
        expect(qa.absoluteGridErrorMs.max).toBe(99);
    });

    test('detects missing and duplicate grid slots', () => {
        const features = [makeFeature(0), makeFeature(1), makeFeature(1), makeFeature(3)];
        features[2] = { ...features[2], sampleId: 'duplicate-slot-different-id' };
        const qa = analyzeFeatureTiming(manifest, features);
        expect(qa.expectedSlots).toBe(4);
        expect(qa.observedSlots).toBe(3);
        expect(qa.missingSlots).toBe(1);
        expect(qa.duplicateSlots).toBe(1);
    });
});

describe('SpotMicrostructureStabilityAnalyzer', () => {
    const features = Array.from({ length: 1200 }, (_, i) => makeFeature(i));
    const outcomes = [
        ...Array.from({ length: 1195 }, (_, i) => makeOutcome(i, 5000)),
        ...Array.from({ length: 1140 }, (_, i) => makeOutcome(i, 60000)),
    ];

    test('reports overlap factor and approximate independent windows', () => {
        const report = new SpotMicrostructureStabilityAnalyzer({ minIndependentWindows: 100 }).analyze(manifest, features, outcomes);
        const h5 = report.horizons.find((h) => h.horizonMs === 5000)!;
        const h60 = report.horizons.find((h) => h.horizonMs === 60000)!;
        expect(h5.overlapFactor).toBe(5);
        expect(h60.overlapFactor).toBe(60);
        expect(h5.approximateIndependentWindows).toBeGreaterThan(100);
        expect(h60.approximateIndependentWindows).toBeLessThan(100);
        expect(h5.independentWindowGate).toBe(true);
        expect(h60.independentWindowGate).toBe(false);
    });

    test('stable monotonic feature keeps sign across non-overlap phases and time blocks', () => {
        const report = new SpotMicrostructureStabilityAnalyzer({
            blockMs: 300000,
            minBlockSamples: 60,
            minPhaseSamples: 20,
            minIndependentWindows: 100,
        }).analyze(manifest, features, outcomes);
        const h5 = report.horizons.find((h) => h.horizonMs === 5000)!;
        const stable = h5.features.find((metric) => metric.featureName === 'stable')!;
        expect(stable.fullSpearman).toBeGreaterThan(0.99);
        expect(stable.phaseSignConsistency).toBe(1);
        expect(stable.blockSignConsistency).toBe(1);
        expect(stable.stabilityScore).toBeGreaterThan(0.9);
    });

    test('feature that reverses relationship across time receives weaker block stability', () => {
        const report = new SpotMicrostructureStabilityAnalyzer({
            blockMs: 300000,
            minBlockSamples: 60,
            minPhaseSamples: 20,
            minIndependentWindows: 100,
        }).analyze(manifest, features, outcomes);
        const h5 = report.horizons.find((h) => h.horizonMs === 5000)!;
        const stable = h5.features.find((metric) => metric.featureName === 'stable')!;
        const flips = h5.features.find((metric) => metric.featureName === 'flips')!;
        expect(flips.blockSignConsistency).toBeLessThan(stable.blockSignConsistency);
        expect(flips.stabilityScore).toBeLessThan(stable.stabilityScore);
    });

    test('withholds long-horizon stability gate when independent windows are too few', () => {
        const report = new SpotMicrostructureStabilityAnalyzer({ minIndependentWindows: 100 }).analyze(manifest, features, outcomes);
        const h60 = report.horizons.find((h) => h.horizonMs === 60000)!;
        expect(h60.stabilityGate).toBe(false);
    });
});
