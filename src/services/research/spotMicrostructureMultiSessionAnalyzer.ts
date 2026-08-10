import { SpotMicrostructureResearchReport, FeatureHorizonMetric } from './spotMicrostructureResearchAnalyzer';
import { StabilityResearchReport, StabilityFeatureMetric } from './spotMicrostructureStabilityAnalyzer';

export interface MultiSessionAnalysisInput {
    sessionId: string;
    research: SpotMicrostructureResearchReport;
    stability: StabilityResearchReport;
}

export interface MultiSessionSessionSummary {
    sessionId: string;
    featureRecords: number;
    outcomeRecords: number;
    healthyFeaturePct: number;
    duplicateSlots: number;
    missingSlots: number;
    cadenceCoveragePct: number;
    gridErrorP95Ms: number;
    gridPhasesMs: number[];
    gridPhaseChanges: number;
    continuityBreaks: number;
    structuralQaPass: boolean;
    timingQaPass: boolean;
    usableForCrossSessionEvidence: boolean;
}

export interface MultiSessionFeatureMetric {
    featureName: string;
    sessionsWithResearchMetric: number;
    sessionsWithStabilityMetric: number;
    researchReadySessions: number;
    stabilityGateSessions: number;
    spearmanPositiveSessions: number;
    spearmanNegativeSessions: number;
    spearmanZeroSessions: number;
    spearmanSignConsistency: number;
    medianSpearman: number;
    medianAbsSpearman: number;
    minSpearman: number;
    maxSpearman: number;
    qSpreadPositiveSessions: number;
    qSpreadNegativeSessions: number;
    qSpreadZeroSessions: number;
    qSpreadSignConsistency: number;
    medianQSpreadBps: number;
    medianDirectionConsistency: number;
    medianStabilityScore: number;
    minStabilityScore: number;
    medianPhaseSignConsistency: number;
    medianBlockSignConsistency: number;
}

export interface MultiSessionHorizonReport {
    horizonMs: number;
    sessionsTotal: number;
    sessionsUsable: number;
    sessionsRankingEnabled: number;
    sessionsResearchReady: number;
    sessionsStabilityGate: number;
    medianEligibleOutcomes: number;
    medianIndependentWindows: number;
    features: MultiSessionFeatureMetric[];
}

export interface SpotMicrostructureMultiSessionReport {
    generatedAt: number;
    datasetVersion: string;
    schemaVersion: string;
    symbol: string;
    sampleIntervalMs: number;
    horizonsMs: number[];
    featureCount: number;
    sessions: MultiSessionSessionSummary[];
    horizons: MultiSessionHorizonReport[];
    note: string;
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function sign(value: number): -1 | 0 | 1 {
    if (value > 0) return 1;
    if (value < 0) return -1;
    return 0;
}

function signCounts(values: number[]): { positive: number; negative: number; zero: number; consistency: number } {
    let positive = 0;
    let negative = 0;
    let zero = 0;
    for (const value of values) {
        const s = sign(value);
        if (s > 0) positive += 1;
        else if (s < 0) negative += 1;
        else zero += 1;
    }
    const nonZero = positive + negative;
    return {
        positive,
        negative,
        zero,
        consistency: nonZero === 0 ? 0 : Math.max(positive, negative) / nonZero,
    };
}

function arraysEqual<T>(left: T[], right: T[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function structuralQaPass(report: SpotMicrostructureResearchReport): boolean {
    const qa = report.qa;
    return qa.duplicateFeatureIds === 0
        && qa.duplicateOutcomeKeys === 0
        && qa.orphanOutcomes === 0
        && qa.featureDimensionMismatches === 0
        && qa.nonFiniteFeatureRows === 0
        && qa.featureNameMismatches === 0;
}

function timingQaPass(report: StabilityResearchReport): boolean {
    const timing = report.timingQa;
    return timing.duplicateSlots === 0
        && timing.gridPhaseChanges === 0
        && timing.gridPhasesMs.length <= 1;
}

function researchFeature(
    report: SpotMicrostructureResearchReport,
    horizonMs: number,
    featureName: string,
): FeatureHorizonMetric | undefined {
    return report.horizons.find((horizon) => horizon.horizonMs === horizonMs)
        ?.features.find((feature) => feature.featureName === featureName);
}

function stabilityFeature(
    report: StabilityResearchReport,
    horizonMs: number,
    featureName: string,
): StabilityFeatureMetric | undefined {
    return report.horizons.find((horizon) => horizon.horizonMs === horizonMs)
        ?.features.find((feature) => feature.featureName === featureName);
}

export class SpotMicrostructureMultiSessionAnalyzer {
    analyze(inputs: MultiSessionAnalysisInput[]): SpotMicrostructureMultiSessionReport {
        if (inputs.length < 2) throw new Error('Multi-session analysis requires at least two sessions.');

        const first = inputs[0];
        const canonical = first.research.manifest;
        if (first.stability.manifest.datasetVersion !== canonical.datasetVersion
            || first.stability.manifest.schemaVersion !== canonical.schemaVersion) {
            throw new Error(`Session ${first.sessionId} has research/stability manifest version mismatch.`);
        }

        for (const input of inputs) {
            const researchManifest = input.research.manifest;
            const stabilityManifest = input.stability.manifest;
            if (researchManifest.datasetVersion !== canonical.datasetVersion) {
                throw new Error(`Session ${input.sessionId} datasetVersion mismatch.`);
            }
            if (researchManifest.schemaVersion !== canonical.schemaVersion) {
                throw new Error(`Session ${input.sessionId} schemaVersion mismatch.`);
            }
            if (researchManifest.symbol !== canonical.symbol) {
                throw new Error(`Session ${input.sessionId} symbol mismatch.`);
            }
            if (researchManifest.sampleIntervalMs !== canonical.sampleIntervalMs) {
                throw new Error(`Session ${input.sessionId} sampleIntervalMs mismatch.`);
            }
            if (!arraysEqual(researchManifest.horizonsMs, canonical.horizonsMs)) {
                throw new Error(`Session ${input.sessionId} horizonsMs mismatch.`);
            }
            if (!arraysEqual(researchManifest.featureNames, canonical.featureNames)) {
                throw new Error(`Session ${input.sessionId} featureNames mismatch.`);
            }
            if (stabilityManifest.datasetVersion !== researchManifest.datasetVersion
                || stabilityManifest.schemaVersion !== researchManifest.schemaVersion
                || stabilityManifest.symbol !== researchManifest.symbol
                || stabilityManifest.sampleIntervalMs !== researchManifest.sampleIntervalMs
                || !arraysEqual(stabilityManifest.horizonsMs, researchManifest.horizonsMs)
                || !arraysEqual(stabilityManifest.featureNames, researchManifest.featureNames)) {
                throw new Error(`Session ${input.sessionId} research/stability manifests are incompatible.`);
            }
        }

        const sessions = inputs.map((input): MultiSessionSessionSummary => {
            const structural = structuralQaPass(input.research);
            const timing = timingQaPass(input.stability);
            return {
                sessionId: input.sessionId,
                featureRecords: input.research.qa.featureRecords,
                outcomeRecords: input.research.qa.outcomeRecords,
                healthyFeaturePct: input.research.qa.healthyFeaturePct,
                duplicateSlots: input.stability.timingQa.duplicateSlots,
                missingSlots: input.stability.timingQa.missingSlots,
                cadenceCoveragePct: input.stability.timingQa.cadenceCoveragePct,
                gridErrorP95Ms: input.stability.timingQa.absoluteGridErrorMs.p95,
                gridPhasesMs: [...input.stability.timingQa.gridPhasesMs],
                gridPhaseChanges: input.stability.timingQa.gridPhaseChanges,
                continuityBreaks: input.stability.timingQa.continuityBreaks,
                structuralQaPass: structural,
                timingQaPass: timing,
                usableForCrossSessionEvidence: structural && timing,
            };
        });

        const usableIds = new Set(sessions.filter((session) => session.usableForCrossSessionEvidence).map((session) => session.sessionId));
        const usableInputs = inputs.filter((input) => usableIds.has(input.sessionId));

        const horizons = canonical.horizonsMs.map((horizonMs): MultiSessionHorizonReport => {
            const researchHorizons = usableInputs.map((input) => input.research.horizons.find((h) => h.horizonMs === horizonMs));
            const stabilityHorizons = usableInputs.map((input) => input.stability.horizons.find((h) => h.horizonMs === horizonMs));

            const features = canonical.featureNames.map((featureName): MultiSessionFeatureMetric => {
                const researchRows = usableInputs.flatMap((input) => {
                    const horizon = input.research.horizons.find((h) => h.horizonMs === horizonMs);
                    if (!horizon?.rankingEnabled) return [];
                    const feature = researchFeature(input.research, horizonMs, featureName);
                    return feature ? [{ input, horizon, feature }] : [];
                });
                const stabilityRows = usableInputs.flatMap((input) => {
                    const horizon = input.stability.horizons.find((h) => h.horizonMs === horizonMs);
                    const feature = stabilityFeature(input.stability, horizonMs, featureName);
                    return horizon && feature ? [{ input, horizon, feature }] : [];
                });

                const spearman = researchRows.map((row) => row.feature.spearmanIc);
                const qSpread = researchRows.map((row) => row.feature.topMinusBottomBps);
                const spearmanSigns = signCounts(spearman);
                const qSpreadSigns = signCounts(qSpread);
                const stabilityScores = stabilityRows.map((row) => row.feature.stabilityScore);

                return {
                    featureName,
                    sessionsWithResearchMetric: researchRows.length,
                    sessionsWithStabilityMetric: stabilityRows.length,
                    researchReadySessions: researchRows.filter((row) => row.horizon.researchReady).length,
                    stabilityGateSessions: stabilityRows.filter((row) => row.horizon.stabilityGate).length,
                    spearmanPositiveSessions: spearmanSigns.positive,
                    spearmanNegativeSessions: spearmanSigns.negative,
                    spearmanZeroSessions: spearmanSigns.zero,
                    spearmanSignConsistency: spearmanSigns.consistency,
                    medianSpearman: median(spearman),
                    medianAbsSpearman: median(spearman.map(Math.abs)),
                    minSpearman: spearman.length === 0 ? 0 : Math.min(...spearman),
                    maxSpearman: spearman.length === 0 ? 0 : Math.max(...spearman),
                    qSpreadPositiveSessions: qSpreadSigns.positive,
                    qSpreadNegativeSessions: qSpreadSigns.negative,
                    qSpreadZeroSessions: qSpreadSigns.zero,
                    qSpreadSignConsistency: qSpreadSigns.consistency,
                    medianQSpreadBps: median(qSpread),
                    medianDirectionConsistency: median(researchRows.map((row) => row.feature.directionConsistency)),
                    medianStabilityScore: median(stabilityScores),
                    minStabilityScore: stabilityScores.length === 0 ? 0 : Math.min(...stabilityScores),
                    medianPhaseSignConsistency: median(stabilityRows.map((row) => row.feature.phaseSignConsistency)),
                    medianBlockSignConsistency: median(stabilityRows.map((row) => row.feature.blockSignConsistency)),
                };
            });

            return {
                horizonMs,
                sessionsTotal: inputs.length,
                sessionsUsable: usableInputs.length,
                sessionsRankingEnabled: researchHorizons.filter((horizon) => horizon?.rankingEnabled).length,
                sessionsResearchReady: researchHorizons.filter((horizon) => horizon?.researchReady).length,
                sessionsStabilityGate: stabilityHorizons.filter((horizon) => horizon?.stabilityGate).length,
                medianEligibleOutcomes: median(researchHorizons.flatMap((horizon) => horizon ? [horizon.eligibleOutcomes] : [])),
                medianIndependentWindows: median(stabilityHorizons.flatMap((horizon) => horizon ? [horizon.approximateIndependentWindows] : [])),
                features,
            };
        });

        return {
            generatedAt: Date.now(),
            datasetVersion: canonical.datasetVersion,
            schemaVersion: canonical.schemaVersion,
            symbol: canonical.symbol,
            sampleIntervalMs: canonical.sampleIntervalMs,
            horizonsMs: [...canonical.horizonsMs],
            featureCount: canonical.featureNames.length,
            sessions,
            horizons,
            note: 'Cross-session evidence only. Do not treat feature ranking or sign consistency as a production trading edge or automatic pruning decision.',
        };
    }
}
