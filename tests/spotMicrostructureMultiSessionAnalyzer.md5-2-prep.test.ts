import {
    SpotMicrostructureMultiSessionAnalyzer,
    MultiSessionAnalysisInput,
} from '../src/services/research/spotMicrostructureMultiSessionAnalyzer';
import { SpotMicrostructureResearchReport } from '../src/services/research/spotMicrostructureResearchAnalyzer';
import { StabilityResearchReport } from '../src/services/research/spotMicrostructureStabilityAnalyzer';
import { SPOT_MICROSTRUCTURE_SCHEMA_VERSION } from '../src/services/marketData/spotMicrostructureTypes';
import { SPOT_RESEARCH_DATASET_VERSION } from '../src/services/research/spotMicrostructureDatasetTypes';

function manifest() {
    return {
        datasetVersion: SPOT_RESEARCH_DATASET_VERSION,
        schemaVersion: SPOT_MICROSTRUCTURE_SCHEMA_VERSION,
        symbol: 'BTCUSDT',
        featureNames: ['f1', 'f2'],
        sampleIntervalMs: 1000,
        horizonsMs: [1000],
        createdAt: 1,
    };
}

function research(overrides: Partial<SpotMicrostructureResearchReport> = {}, rho = 0.2, qSpread = 1): SpotMicrostructureResearchReport {
    return {
        generatedAt: 1,
        manifest: manifest(),
        qa: {
            featureRecords: 7200, outcomeRecords: 35000, duplicateFeatureIds: 0, duplicateOutcomeKeys: 0,
            orphanOutcomes: 0, featureDimensionMismatches: 0, nonFiniteFeatureRows: 0,
            featureNameMismatches: 0, healthyFeaturePct: 100,
        },
        options: {
            requireHealthyTarget: true, maxObservationLagMs: 500, quantiles: 5,
            minSamplesForRanking: 1000, minSamplesResearchReady: 5000,
            redundancyThreshold: 0.97, topFeatureCount: 15,
        },
        horizons: [{
            horizonMs: 1000, totalOutcomes: 7100, eligibleOutcomes: 7000, unhealthyDropped: 0,
            lagDropped: 100, coveragePct: 98, observationLagMs: { count: 7000, mean: 50, stdDev: 10, min: 1, p50: 50, p95: 90, max: 200 },
            forwardReturnBps: { count: 7000, mean: 0, stdDev: 1, min: -3, p50: 0, p95: 2, max: 3 },
            rankingEnabled: true, researchReady: true,
            features: [
                { featureName: 'f1', samples: 7000, pearsonIc: rho, spearmanIc: rho, quantiles: [], topMinusBottomBps: qSpread, directionConsistency: 1 },
                { featureName: 'f2', samples: 7000, pearsonIc: -rho, spearmanIc: -rho, quantiles: [], topMinusBottomBps: -qSpread, directionConsistency: 0.75 },
            ],
            topByAbsSpearman: [],
        }],
        redundantPairs: [],
        ...overrides,
    };
}

function stability(overrides: Partial<StabilityResearchReport> = {}, rho = 0.2, score = 0.1): StabilityResearchReport {
    const feature = (featureName: string, value: number) => ({
        featureName, samples: 7000, fullSpearman: value, nonOverlapStride: 1, nonOverlapPhasesUsed: 1,
        medianPhaseSpearman: value, phaseSignConsistency: 1, blocksUsed: 20,
        medianBlockSpearman: value, blockSignConsistency: 1, stabilityScore: score,
    });
    return {
        generatedAt: 1,
        manifest: manifest(),
        options: { requireHealthyTarget: true, maxObservationLagMs: 500, blockMs: 300000, minBlockSamples: 60, minPhaseSamples: 20, minIndependentWindows: 100, topFeatureCount: 15 },
        timingQa: {
            featureRecords: 7200, firstObservedAt: 1, lastObservedAt: 7200000,
            expectedSlots: 7200, observedSlots: 7200, missingSlots: 0, duplicateSlots: 0,
            cadenceCoveragePct: 100,
            intervalMs: { count: 7199, mean: 1000, stdDev: 0, min: 1000, p50: 1000, p95: 1000, max: 1000 },
            absoluteGridErrorMs: { count: 7200, mean: 50, stdDev: 10, min: 0, p50: 50, p95: 90, max: 100 },
            gridPhasesMs: [382], gridPhaseChanges: 0, continuityBreaks: 0,
        },
        horizons: [{
            horizonMs: 1000, eligibleOutcomes: 7000, approximateIndependentWindows: 7000,
            overlapFactor: 1, blocksAvailable: 24, independentWindowGate: true, stabilityGate: true,
            features: [feature('f1', rho), feature('f2', -rho)], topStable: [],
        }],
        ...overrides,
    };
}

function input(id: string, rho = 0.2, qSpread = 1): MultiSessionAnalysisInput {
    return { sessionId: id, research: research({}, rho, qSpread), stability: stability({}, rho, Math.abs(rho) / 2) };
}

describe('MD5 multi-session evidence analyzer', () => {
    test('aggregates sign consistency and medians across compatible sessions', () => {
        const report = new SpotMicrostructureMultiSessionAnalyzer().analyze([
            input('asia', 0.2, 1), input('europe', 0.4, 2), input('us', 0.3, 1.5),
        ]);
        const f1 = report.horizons[0].features.find((feature) => feature.featureName === 'f1')!;
        expect(report.sessions).toHaveLength(3);
        expect(f1.sessionsWithResearchMetric).toBe(3);
        expect(f1.spearmanSignConsistency).toBe(1);
        expect(f1.medianSpearman).toBeCloseTo(0.3, 12);
        expect(f1.medianAbsSpearman).toBeCloseTo(0.3, 12);
        expect(f1.qSpreadSignConsistency).toBe(1);
        expect(f1.medianQSpreadBps).toBeCloseTo(1.5, 12);
    });

    test('exposes sign instability instead of silently selecting a direction', () => {
        const report = new SpotMicrostructureMultiSessionAnalyzer().analyze([
            input('a', 0.2, 1), input('b', -0.4, -2), input('c', 0.3, 1.5),
        ]);
        const f1 = report.horizons[0].features.find((feature) => feature.featureName === 'f1')!;
        expect(f1.spearmanPositiveSessions).toBe(2);
        expect(f1.spearmanNegativeSessions).toBe(1);
        expect(f1.spearmanSignConsistency).toBeCloseTo(2 / 3, 12);
        expect(f1.qSpreadSignConsistency).toBeCloseTo(2 / 3, 12);
    });

    test('marks a session with structural QA errors unusable for evidence', () => {
        const bad = input('bad');
        bad.research.qa.duplicateFeatureIds = 1;
        const report = new SpotMicrostructureMultiSessionAnalyzer().analyze([input('good'), bad]);
        expect(report.sessions.find((session) => session.sessionId === 'bad')?.structuralQaPass).toBe(false);
        expect(report.horizons[0].sessionsUsable).toBe(1);
        expect(report.horizons[0].features[0].sessionsWithResearchMetric).toBe(1);
    });

    test('marks restart phase changes unusable for cross-session evidence', () => {
        const bad = input('bad-timing');
        bad.stability.timingQa.gridPhasesMs = [100, 400];
        bad.stability.timingQa.gridPhaseChanges = 1;
        const report = new SpotMicrostructureMultiSessionAnalyzer().analyze([input('good'), bad]);
        expect(report.sessions.find((session) => session.sessionId === 'bad-timing')?.timingQaPass).toBe(false);
        expect(report.horizons[0].sessionsUsable).toBe(1);
    });

    test('does not count research metrics when a horizon has ranking disabled', () => {
        const short = input('short');
        short.research.horizons[0].rankingEnabled = false;
        short.research.horizons[0].researchReady = false;
        short.research.horizons[0].features = [];
        const report = new SpotMicrostructureMultiSessionAnalyzer().analyze([input('long'), short]);
        expect(report.horizons[0].sessionsRankingEnabled).toBe(1);
        expect(report.horizons[0].features[0].sessionsWithResearchMetric).toBe(1);
    });

    test('fails closed on dataset-version mismatch', () => {
        const bad = input('bad');
        bad.research.manifest.datasetVersion = 'wrong-version' as any;
        bad.stability.manifest.datasetVersion = 'wrong-version' as any;
        expect(() => new SpotMicrostructureMultiSessionAnalyzer().analyze([input('good'), bad]))
            .toThrow(/datasetVersion mismatch/i);
    });

    test('fails closed on feature-order mismatch', () => {
        const bad = input('bad');
        bad.research.manifest.featureNames = ['f2', 'f1'];
        bad.stability.manifest.featureNames = ['f2', 'f1'];
        expect(() => new SpotMicrostructureMultiSessionAnalyzer().analyze([input('good'), bad]))
            .toThrow(/featureNames mismatch/i);
    });

    test('requires at least two sessions', () => {
        expect(() => new SpotMicrostructureMultiSessionAnalyzer().analyze([input('only')]))
            .toThrow(/at least two sessions/i);
    });
});
