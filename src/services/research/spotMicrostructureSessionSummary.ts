import {
    MultiSessionAnalysisInput,
    structuralQaPass,
    timingQaPass,
} from './spotMicrostructureMultiSessionAnalyzer';

export interface SpotMicrostructureSessionHorizonSummary {
    horizonMs: number;
    eligibleResearchOutcomes: number;
    eligibleStabilityOutcomes: number;
    approximateIndependentWindows: number;
    researchReady: boolean;
    independentWindowGate: boolean;
    stabilityGate: boolean;
    pass: boolean;
}

export interface SpotMicrostructureSessionSummary {
    sessionId: string;

    datasetVersion: string;
    schemaVersion: string;
    symbol: string;
    sampleIntervalMs: number;
    featureCount: number;

    structural: {
        featureRecords: number;
        outcomeRecords: number;
        healthyFeaturePct: number;

        duplicateFeatureIds: number;
        duplicateOutcomeKeys: number;
        orphanOutcomes: number;
        featureDimensionMismatches: number;
        nonFiniteFeatureRows: number;
        featureNameMismatches: number;

        pass: boolean;
    };

    timing: {
        expectedSlots: number;
        observedSlots: number;
        missingSlots: number;
        duplicateSlots: number;
        cadenceCoveragePct: number;

        gridErrorP95Ms: number;
        gridPhasesMs: number[];
        gridPhaseChanges: number;
        continuityBreaks: number;

        pass: boolean;
    };

    horizons: SpotMicrostructureSessionHorizonSummary[];

    crossSessionUsable: boolean;
    allHorizonsPass: boolean;
    sessionAccepted: boolean;
}

function arraysEqual<T>(
    left: T[],
    right: T[],
): boolean {
    return left.length === right.length
        && left.every(
            (value, index) => value === right[index],
        );
}

function assertResearchStabilityCompatible(
    input: MultiSessionAnalysisInput,
): void {
    const research = input.research.manifest;
    const stability = input.stability.manifest;

    if (
        research.datasetVersion !== stability.datasetVersion
        || research.schemaVersion !== stability.schemaVersion
        || research.symbol !== stability.symbol
        || research.sampleIntervalMs !== stability.sampleIntervalMs
        || !arraysEqual(
            research.horizonsMs,
            stability.horizonsMs,
        )
        || !arraysEqual(
            research.featureNames,
            stability.featureNames,
        )
    ) {
        throw new Error(
            `Session ${input.sessionId} research/stability manifests are incompatible.`,
        );
    }
}

export function summarizeSpotMicrostructureSession(
    input: MultiSessionAnalysisInput,
): SpotMicrostructureSessionSummary {
    assertResearchStabilityCompatible(input);

    const structuralPass =
        structuralQaPass(input.research);

    const timingPass =
        timingQaPass(input.stability);

    const horizons =
        input.research.manifest.horizonsMs.map(
            (
                horizonMs,
            ): SpotMicrostructureSessionHorizonSummary => {
                const research =
                    input.research.horizons.find(
                        (item) =>
                            item.horizonMs === horizonMs,
                    );

                const stability =
                    input.stability.horizons.find(
                        (item) =>
                            item.horizonMs === horizonMs,
                    );

                const researchReady =
                    research?.researchReady === true;

                const independentWindowGate =
                    stability?.independentWindowGate === true;

                const stabilityGate =
                    stability?.stabilityGate === true;

                return {
                    horizonMs,

                    eligibleResearchOutcomes:
                        research?.eligibleOutcomes ?? 0,

                    eligibleStabilityOutcomes:
                        stability?.eligibleOutcomes ?? 0,

                    approximateIndependentWindows:
                        stability
                            ?.approximateIndependentWindows
                        ?? 0,

                    researchReady,
                    independentWindowGate,
                    stabilityGate,

                    pass:
                        researchReady
                        && independentWindowGate
                        && stabilityGate,
                };
            },
        );

    const crossSessionUsable =
        structuralPass && timingPass;

    const allHorizonsPass =
        horizons.length > 0
        && horizons.every(
            (horizon) => horizon.pass,
        );

    return {
        sessionId: input.sessionId,

        datasetVersion:
            input.research.manifest.datasetVersion,

        schemaVersion:
            input.research.manifest.schemaVersion,

        symbol:
            input.research.manifest.symbol,

        sampleIntervalMs:
            input.research.manifest.sampleIntervalMs,

        featureCount:
            input.research.manifest.featureNames.length,

        structural: {
            featureRecords:
                input.research.qa.featureRecords,

            outcomeRecords:
                input.research.qa.outcomeRecords,

            healthyFeaturePct:
                input.research.qa.healthyFeaturePct,

            duplicateFeatureIds:
                input.research.qa.duplicateFeatureIds,

            duplicateOutcomeKeys:
                input.research.qa.duplicateOutcomeKeys,

            orphanOutcomes:
                input.research.qa.orphanOutcomes,

            featureDimensionMismatches:
                input.research.qa
                    .featureDimensionMismatches,

            nonFiniteFeatureRows:
                input.research.qa.nonFiniteFeatureRows,

            featureNameMismatches:
                input.research.qa
                    .featureNameMismatches,

            pass: structuralPass,
        },

        timing: {
            expectedSlots:
                input.stability.timingQa.expectedSlots,

            observedSlots:
                input.stability.timingQa.observedSlots,

            missingSlots:
                input.stability.timingQa.missingSlots,

            duplicateSlots:
                input.stability.timingQa.duplicateSlots,

            cadenceCoveragePct:
                input.stability.timingQa
                    .cadenceCoveragePct,

            gridErrorP95Ms:
                input.stability.timingQa
                    .absoluteGridErrorMs.p95,

            gridPhasesMs: [
                ...input.stability.timingQa
                    .gridPhasesMs,
            ],

            gridPhaseChanges:
                input.stability.timingQa
                    .gridPhaseChanges,

            continuityBreaks:
                input.stability.timingQa
                    .continuityBreaks,

            pass: timingPass,
        },

        horizons,

        crossSessionUsable,
        allHorizonsPass,

        sessionAccepted:
            crossSessionUsable
            && allHorizonsPass,
    };
}