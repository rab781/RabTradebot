import {
    pearsonCorrelation,
    spearmanCorrelation,
    SpotMicrostructureResearchAnalyzer,
    summarize,
} from '../src/services/research/spotMicrostructureResearchAnalyzer';
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
    featureNames: ['positiveSignal', 'negativeSignal', 'redundantSignal'],
    sampleIntervalMs: 1000,
    horizonsMs: [1000],
    createdAt: 1,
};

function feature(i: number, qualityHealthy = true): SpotResearchFeatureRecord {
    return {
        recordType: 'FEATURE',
        datasetVersion: SPOT_RESEARCH_DATASET_VERSION,
        schemaVersion: SPOT_MICROSTRUCTURE_SCHEMA_VERSION,
        sampleId: `s${i}`,
        symbol: 'BTCUSDT',
        sampledAt: i * 1000,
        referenceObservedAt: i * 1000,
        referenceMidPrice: 100,
        featureNames: [...manifest.featureNames],
        featureValues: [i, -i, i * 2],
        quality: {
            healthy: qualityHealthy,
            marketStatus: 'LIVE',
            depthStatus: 'LIVE',
            lastTradeAgeMs: 10,
            lastDepthAgeMs: 5,
            tradeSamples60s: 10,
            ofiSamples60s: 10,
            reasons: [],
        },
    };
}

function outcome(i: number, opts: Partial<SpotResearchOutcomeRecord> = {}): SpotResearchOutcomeRecord {
    return {
        recordType: 'OUTCOME',
        datasetVersion: SPOT_RESEARCH_DATASET_VERSION,
        schemaVersion: SPOT_MICROSTRUCTURE_SCHEMA_VERSION,
        sampleId: `s${i}`,
        symbol: 'BTCUSDT',
        horizonMs: 1000,
        targetTime: i * 1000 + 1000,
        observedAt: i * 1000 + 1020,
        observationLagMs: 20,
        referenceMidPrice: 100,
        targetMidPrice: 100 + i / 100,
        forwardReturn: i / 10000,
        forwardReturnBps: i,
        forwardLogReturn: Math.log(1 + i / 10000),
        targetQualityHealthy: true,
        targetQualityReasons: [],
        ...opts,
    };
}

describe('MD5 research statistics', () => {
    test('Pearson identifies positive and negative linear relationships', () => {
        expect(pearsonCorrelation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
        expect(pearsonCorrelation([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 12);
    });

    test('Spearman handles monotonic nonlinear ordering', () => {
        expect(spearmanCorrelation([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1, 12);
    });

    test('summary reports p50/p95 without NaN', () => {
        const result = summarize([1, 2, 3, 4, 5]);
        expect(result.p50).toBe(3);
        expect(result.p95).toBeCloseTo(4.8, 12);
        expect(Number.isFinite(result.stdDev)).toBe(true);
    });
});

describe('SpotMicrostructureResearchAnalyzer', () => {
    test('filters unhealthy targets and excessive observation lag', () => {
        const features = Array.from({ length: 8 }, (_, i) => feature(i));
        const outcomes = Array.from({ length: 8 }, (_, i) => outcome(i));
        outcomes[1] = outcome(1, { targetQualityHealthy: false, targetQualityReasons: ['depth-stale'] });
        outcomes[2] = outcome(2, { observationLagMs: 900 });
        const report = new SpotMicrostructureResearchAnalyzer({
            maxObservationLagMs: 500,
            minSamplesForRanking: 3,
            minSamplesResearchReady: 6,
        }).analyze(manifest, features, outcomes);
        expect(report.horizons[0].eligibleOutcomes).toBe(6);
        expect(report.horizons[0].unhealthyDropped).toBe(1);
        expect(report.horizons[0].lagDropped).toBe(1);
        expect(report.horizons[0].researchReady).toBe(true);
    });

    test('withholds feature ranking when sample count is below threshold', () => {
        const features = Array.from({ length: 5 }, (_, i) => feature(i));
        const outcomes = Array.from({ length: 5 }, (_, i) => outcome(i));
        const report = new SpotMicrostructureResearchAnalyzer({ minSamplesForRanking: 10 }).analyze(manifest, features, outcomes);
        expect(report.horizons[0].rankingEnabled).toBe(false);
        expect(report.horizons[0].topByAbsSpearman).toEqual([]);
    });

    test('ranks a strongly monotonic feature by Spearman IC', () => {
        const features = Array.from({ length: 20 }, (_, i) => feature(i));
        const outcomes = Array.from({ length: 20 }, (_, i) => outcome(i));
        const report = new SpotMicrostructureResearchAnalyzer({
            minSamplesForRanking: 10,
            minSamplesResearchReady: 10,
            redundancyThreshold: 0.999,
        }).analyze(manifest, features, outcomes);
        const positive = report.horizons[0].features.find((metric) => metric.featureName === 'positiveSignal')!;
        const negative = report.horizons[0].features.find((metric) => metric.featureName === 'negativeSignal')!;
        expect(positive.spearmanIc).toBeCloseTo(1, 12);
        expect(negative.spearmanIc).toBeCloseTo(-1, 12);
        expect(positive.topMinusBottomBps).toBeGreaterThan(0);
    });

    test('detects redundant feature pairs', () => {
        const features = Array.from({ length: 20 }, (_, i) => feature(i));
        const outcomes = Array.from({ length: 20 }, (_, i) => outcome(i));
        const report = new SpotMicrostructureResearchAnalyzer({ redundancyThreshold: 0.99 }).analyze(manifest, features, outcomes);
        expect(report.redundantPairs.some((pair) =>
            (pair.left === 'positiveSignal' && pair.right === 'redundantSignal')
            || (pair.left === 'redundantSignal' && pair.right === 'positiveSignal'),
        )).toBe(true);
    });

    test('flags malformed rows in QA instead of silently accepting them', () => {
        const malformed = feature(0);
        malformed.featureValues = [1, 2];
        const report = new SpotMicrostructureResearchAnalyzer().analyze(manifest, [malformed], [outcome(0)]);
        expect(report.qa.featureDimensionMismatches).toBe(1);
    });

    test('detects duplicate feature IDs, duplicate outcomes and orphan outcomes', () => {
        const features = [feature(0), feature(0)];
        const outcomes = [outcome(0), outcome(0), outcome(99)];
        const report = new SpotMicrostructureResearchAnalyzer().analyze(manifest, features, outcomes);
        expect(report.qa.duplicateFeatureIds).toBe(1);
        expect(report.qa.duplicateOutcomeKeys).toBe(1);
        expect(report.qa.orphanOutcomes).toBe(1);
    });
});
