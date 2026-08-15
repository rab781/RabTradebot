import {
    MultiSessionAnalysisInput,
} from '../src/services/research/spotMicrostructureMultiSessionAnalyzer';

import {
    SpotMicrostructureResearchReport,
} from '../src/services/research/spotMicrostructureResearchAnalyzer';

import {
    StabilityResearchReport,
} from '../src/services/research/spotMicrostructureStabilityAnalyzer';

import {
    SPOT_MICROSTRUCTURE_SCHEMA_VERSION,
} from '../src/services/marketData/spotMicrostructureTypes';

import {
    SPOT_RESEARCH_DATASET_VERSION,
} from '../src/services/research/spotMicrostructureDatasetTypes';

import {
    summarizeSpotMicrostructureSession,
} from '../src/services/research/spotMicrostructureSessionSummary';

function manifest() {
    return {
        datasetVersion:
            SPOT_RESEARCH_DATASET_VERSION,

        schemaVersion:
            SPOT_MICROSTRUCTURE_SCHEMA_VERSION,

        symbol: 'BTCUSDT',

        featureNames: [
            'f1',
            'f2',
        ],

        sampleIntervalMs: 1000,

        horizonsMs: [
            1000,
        ],

        createdAt: 1,
    };
}

function research(
    overrides:
        Partial<SpotMicrostructureResearchReport> = {},
): SpotMicrostructureResearchReport {
    return {
        generatedAt: 1,

        manifest: manifest(),

        qa: {
            featureRecords: 7200,
            outcomeRecords: 35000,

            duplicateFeatureIds: 0,
            duplicateOutcomeKeys: 0,
            orphanOutcomes: 0,

            featureDimensionMismatches: 0,
            nonFiniteFeatureRows: 0,
            featureNameMismatches: 0,

            healthyFeaturePct: 100,
        },

        options: {
            requireHealthyTarget: true,
            maxObservationLagMs: 500,
            quantiles: 5,
            minSamplesForRanking: 1000,
            minSamplesResearchReady: 5000,
            redundancyThreshold: 0.97,
            topFeatureCount: 15,
        },

        horizons: [
            {
                horizonMs: 1000,

                totalOutcomes: 7100,
                eligibleOutcomes: 7000,

                unhealthyDropped: 0,
                lagDropped: 100,

                coveragePct: 98,

                observationLagMs: {
                    count: 7000,
                    mean: 50,
                    stdDev: 10,
                    min: 1,
                    p50: 50,
                    p95: 90,
                    max: 200,
                },

                forwardReturnBps: {
                    count: 7000,
                    mean: 0,
                    stdDev: 1,
                    min: -3,
                    p50: 0,
                    p95: 2,
                    max: 3,
                },

                rankingEnabled: true,
                researchReady: true,

                features: [
                    {
                        featureName: 'f1',
                        samples: 7000,
                        pearsonIc: 0.2,
                        spearmanIc: 0.2,
                        quantiles: [],
                        topMinusBottomBps: 1,
                        directionConsistency: 1,
                    },
                    {
                        featureName: 'f2',
                        samples: 7000,
                        pearsonIc: -0.2,
                        spearmanIc: -0.2,
                        quantiles: [],
                        topMinusBottomBps: -1,
                        directionConsistency: 0.75,
                    },
                ],

                topByAbsSpearman: [],
            },
        ],

        redundantPairs: [],

        ...overrides,
    };
}

function stability(
    overrides:
        Partial<StabilityResearchReport> = {},
): StabilityResearchReport {
    const feature = (
        featureName: string,
        value: number,
    ) => ({
        featureName,
        samples: 7000,

        fullSpearman: value,

        nonOverlapStride: 1,
        nonOverlapPhasesUsed: 1,

        medianPhaseSpearman: value,
        phaseSignConsistency: 1,

        blocksUsed: 20,

        medianBlockSpearman: value,
        blockSignConsistency: 1,

        stabilityScore: 0.1,
    });

    return {
        generatedAt: 1,

        manifest: manifest(),

        options: {
            requireHealthyTarget: true,
            maxObservationLagMs: 500,

            blockMs: 300000,

            minBlockSamples: 60,
            minPhaseSamples: 20,
            minIndependentWindows: 100,

            topFeatureCount: 15,
        },

        timingQa: {
            featureRecords: 7200,

            firstObservedAt: 1,
            lastObservedAt: 7200000,

            expectedSlots: 7200,
            observedSlots: 7200,

            missingSlots: 0,
            duplicateSlots: 0,

            cadenceCoveragePct: 100,

            intervalMs: {
                count: 7199,
                mean: 1000,
                stdDev: 0,
                min: 1000,
                p50: 1000,
                p95: 1000,
                max: 1000,
            },

            absoluteGridErrorMs: {
                count: 7200,
                mean: 50,
                stdDev: 10,
                min: 0,
                p50: 50,
                p95: 90,
                max: 100,
            },

            gridPhasesMs: [
                382,
            ],

            gridPhaseChanges: 0,
            continuityBreaks: 0,
        },

        horizons: [
            {
                horizonMs: 1000,

                eligibleOutcomes: 7000,

                approximateIndependentWindows:
                    7000,

                overlapFactor: 1,

                blocksAvailable: 24,

                independentWindowGate: true,
                stabilityGate: true,

                features: [
                    feature('f1', 0.2),
                    feature('f2', -0.2),
                ],

                topStable: [],
            },
        ],

        ...overrides,
    };
}

function input(
    id = 'session',
): MultiSessionAnalysisInput {
    return {
        sessionId: id,

        research: research(),

        stability: stability(),
    };
}

describe(
    'MD5 session acceptance summary',
    () => {
        test(
            'accepts a structurally healthy, timing healthy, research-ready and stable session',
            () => {
                const summary =
                    summarizeSpotMicrostructureSession(
                        input('healthy'),
                    );

                expect(
                    summary.structural.pass,
                ).toBe(true);

                expect(
                    summary.timing.pass,
                ).toBe(true);

                expect(
                    summary.crossSessionUsable,
                ).toBe(true);

                expect(
                    summary.allHorizonsPass,
                ).toBe(true);

                expect(
                    summary.sessionAccepted,
                ).toBe(true);

                expect(
                    summary.horizons,
                ).toHaveLength(1);

                expect(
                    summary.horizons[0].pass,
                ).toBe(true);
            },
        );

        test(
            'rejects a session with structural QA errors',
            () => {
                const bad = input(
                    'structural-bad',
                );

                bad.research.qa
                    .duplicateFeatureIds = 1;

                const summary =
                    summarizeSpotMicrostructureSession(
                        bad,
                    );

                expect(
                    summary.structural.pass,
                ).toBe(false);

                expect(
                    summary.timing.pass,
                ).toBe(true);

                expect(
                    summary.crossSessionUsable,
                ).toBe(false);

                expect(
                    summary.allHorizonsPass,
                ).toBe(true);

                expect(
                    summary.sessionAccepted,
                ).toBe(false);
            },
        );

        test(
            'rejects a session with duplicate timing slots',
            () => {
                const bad = input(
                    'duplicate-slot',
                );

                bad.stability.timingQa
                    .duplicateSlots = 1;

                const summary =
                    summarizeSpotMicrostructureSession(
                        bad,
                    );

                expect(
                    summary.structural.pass,
                ).toBe(true);

                expect(
                    summary.timing.pass,
                ).toBe(false);

                expect(
                    summary.crossSessionUsable,
                ).toBe(false);

                expect(
                    summary.sessionAccepted,
                ).toBe(false);
            },
        );

        test(
            'rejects a session when grid phase changes are detected',
            () => {
                const bad = input(
                    'phase-change',
                );

                bad.stability.timingQa
                    .gridPhaseChanges = 1;

                const summary =
                    summarizeSpotMicrostructureSession(
                        bad,
                    );

                expect(
                    summary.timing.pass,
                ).toBe(false);

                expect(
                    summary.crossSessionUsable,
                ).toBe(false);

                expect(
                    summary.sessionAccepted,
                ).toBe(false);
            },
        );

        test(
            'keeps cross-session usability but rejects session acceptance when researchReady fails',
            () => {
                const bad = input(
                    'research-not-ready',
                );

                bad.research.horizons[0]
                    .researchReady = false;

                const summary =
                    summarizeSpotMicrostructureSession(
                        bad,
                    );

                expect(
                    summary.structural.pass,
                ).toBe(true);

                expect(
                    summary.timing.pass,
                ).toBe(true);

                expect(
                    summary.crossSessionUsable,
                ).toBe(true);

                expect(
                    summary.horizons[0]
                        .researchReady,
                ).toBe(false);

                expect(
                    summary.horizons[0].pass,
                ).toBe(false);

                expect(
                    summary.allHorizonsPass,
                ).toBe(false);

                expect(
                    summary.sessionAccepted,
                ).toBe(false);
            },
        );

        test(
            'rejects session acceptance when independent-window gate fails',
            () => {
                const bad = input(
                    'independent-window-fail',
                );

                bad.stability.horizons[0]
                    .independentWindowGate = false;

                const summary =
                    summarizeSpotMicrostructureSession(
                        bad,
                    );

                expect(
                    summary.crossSessionUsable,
                ).toBe(true);

                expect(
                    summary.horizons[0]
                        .independentWindowGate,
                ).toBe(false);

                expect(
                    summary.horizons[0].pass,
                ).toBe(false);

                expect(
                    summary.allHorizonsPass,
                ).toBe(false);

                expect(
                    summary.sessionAccepted,
                ).toBe(false);
            },
        );

        test(
            'rejects session acceptance when stability gate fails',
            () => {
                const bad = input(
                    'stability-fail',
                );

                bad.stability.horizons[0]
                    .stabilityGate = false;

                const summary =
                    summarizeSpotMicrostructureSession(
                        bad,
                    );

                expect(
                    summary.crossSessionUsable,
                ).toBe(true);

                expect(
                    summary.horizons[0]
                        .stabilityGate,
                ).toBe(false);

                expect(
                    summary.horizons[0].pass,
                ).toBe(false);

                expect(
                    summary.allHorizonsPass,
                ).toBe(false);

                expect(
                    summary.sessionAccepted,
                ).toBe(false);
            },
        );

        test(
            'fails closed when research and stability manifests are incompatible',
            () => {
                const bad = input(
                    'manifest-mismatch',
                );

                bad.stability.manifest.symbol =
                    'ETHUSDT';

                expect(
                    () =>
                        summarizeSpotMicrostructureSession(
                            bad,
                        ),
                ).toThrow(
                    /research\/stability manifests are incompatible/i,
                );
            },
        );
    },
);