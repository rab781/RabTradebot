import { promises as fs } from 'fs';
import path from 'path';
import {
    SpotResearchDatasetManifest,
    SpotResearchFeatureRecord,
    SpotResearchOutcomeRecord,
} from './spotMicrostructureDatasetTypes';
import { spearmanCorrelation, summarize, NumericSummary } from './spotMicrostructureResearchAnalyzer';

export interface StabilityAnalyzerOptions {
    requireHealthyTarget?: boolean;
    maxObservationLagMs?: number;
    blockMs?: number;
    minBlockSamples?: number;
    minPhaseSamples?: number;
    minIndependentWindows?: number;
    topFeatureCount?: number;
}

export interface FeatureTimingQa {
    featureRecords: number;
    firstObservedAt?: number;
    lastObservedAt?: number;
    expectedSlots: number;
    observedSlots: number;
    missingSlots: number;
    duplicateSlots: number;
    cadenceCoveragePct: number;
    intervalMs: NumericSummary;
    absoluteGridErrorMs: NumericSummary;
}

export interface StabilityFeatureMetric {
    featureName: string;
    samples: number;
    fullSpearman: number;
    nonOverlapStride: number;
    nonOverlapPhasesUsed: number;
    medianPhaseSpearman: number;
    phaseSignConsistency: number;
    blocksUsed: number;
    medianBlockSpearman: number;
    blockSignConsistency: number;
    stabilityScore: number;
}

export interface StabilityHorizonReport {
    horizonMs: number;
    eligibleOutcomes: number;
    approximateIndependentWindows: number;
    overlapFactor: number;
    blocksAvailable: number;
    independentWindowGate: boolean;
    stabilityGate: boolean;
    features: StabilityFeatureMetric[];
    topStable: StabilityFeatureMetric[];
}

export interface StabilityResearchReport {
    generatedAt: number;
    manifest: SpotResearchDatasetManifest;
    options: Required<StabilityAnalyzerOptions>;
    timingQa: FeatureTimingQa;
    horizons: StabilityHorizonReport[];
}

const DEFAULTS: Required<StabilityAnalyzerOptions> = {
    requireHealthyTarget: true,
    maxObservationLagMs: 500,
    blockMs: 5 * 60 * 1000,
    minBlockSamples: 60,
    minPhaseSamples: 20,
    minIndependentWindows: 100,
    topFeatureCount: 15,
};

async function readJsonLines<T>(file: string): Promise<T[]> {
    const raw = await fs.readFile(file, 'utf8');
    return raw.split(/\r?\n/).filter((line: string) => line.trim().length > 0).map((line: string) => JSON.parse(line) as T);
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function sign(value: number): number {
    if (value > 0) return 1;
    if (value < 0) return -1;
    return 0;
}

function signConsistency(values: number[], reference: number): number {
    const ref = sign(reference);
    if (ref === 0 || values.length === 0) return 0;
    const nonZero = values.filter((value) => sign(value) !== 0);
    if (nonZero.length === 0) return 0;
    return nonZero.filter((value) => sign(value) === ref).length / nonZero.length;
}


function featureSlotTime(feature: SpotResearchFeatureRecord): number {
    return feature.sampleSlotAt ?? feature.referenceObservedAt;
}

function eligibleRows(
    features: SpotResearchFeatureRecord[],
    outcomes: SpotResearchOutcomeRecord[],
    horizonMs: number,
    options: Required<StabilityAnalyzerOptions>,
): Array<{ feature: SpotResearchFeatureRecord; outcome: SpotResearchOutcomeRecord }> {
    const featureById = new Map(features.map((feature) => [feature.sampleId, feature]));
    return outcomes
        .filter((outcome) => outcome.horizonMs === horizonMs)
        .flatMap((outcome) => {
            const feature = featureById.get(outcome.sampleId);
            if (!feature) return [];
            if (options.requireHealthyTarget && !outcome.targetQualityHealthy) return [];
            if (outcome.observationLagMs > options.maxObservationLagMs) return [];
            if (!feature.quality.healthy) return [];
            if (!feature.featureValues.every(Number.isFinite)) return [];
            if (!Number.isFinite(outcome.forwardReturnBps)) return [];
            return [{ feature, outcome }];
        })
        .sort((a, b) => featureSlotTime(a.feature) - featureSlotTime(b.feature));
}

export function analyzeFeatureTiming(
    manifest: SpotResearchDatasetManifest,
    features: SpotResearchFeatureRecord[],
): FeatureTimingQa {
    if (features.length === 0) {
        return {
            featureRecords: 0,
            expectedSlots: 0,
            observedSlots: 0,
            missingSlots: 0,
            duplicateSlots: 0,
            cadenceCoveragePct: 0,
            intervalMs: summarize([]),
            absoluteGridErrorMs: summarize([]),
        };
    }
    const sorted = [...features].sort((a, b) => featureSlotTime(a) - featureSlotTime(b));
    const first = featureSlotTime(sorted[0]);
    const last = featureSlotTime(sorted[sorted.length - 1]);
    const slots = new Map<number, number>();
    const gridErrors: number[] = [];
    for (const feature of sorted) {
        const rawSlot = (featureSlotTime(feature) - first) / manifest.sampleIntervalMs;
        const slot = Math.round(rawSlot);
        slots.set(slot, (slots.get(slot) ?? 0) + 1);
        const ideal = first + slot * manifest.sampleIntervalMs;
        gridErrors.push(Math.abs(feature.sampledAt - ideal));
    }
    const maxSlot = Math.max(...slots.keys());
    const expectedSlots = maxSlot + 1;
    const duplicateSlots = [...slots.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
    const observedSlots = slots.size;
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
        intervals.push(featureSlotTime(sorted[i]) - featureSlotTime(sorted[i - 1]));
    }
    return {
        featureRecords: features.length,
        firstObservedAt: first,
        lastObservedAt: last,
        expectedSlots,
        observedSlots,
        missingSlots: Math.max(0, expectedSlots - observedSlots),
        duplicateSlots,
        cadenceCoveragePct: expectedSlots === 0 ? 0 : (observedSlots / expectedSlots) * 100,
        intervalMs: summarize(intervals),
        absoluteGridErrorMs: summarize(gridErrors),
    };
}

export class SpotMicrostructureStabilityAnalyzer {
    private readonly options: Required<StabilityAnalyzerOptions>;

    constructor(options: StabilityAnalyzerOptions = {}) {
        this.options = { ...DEFAULTS, ...options };
        if (this.options.blockMs <= 0) throw new Error('blockMs must be > 0.');
        if (this.options.minBlockSamples < 2) throw new Error('minBlockSamples must be >= 2.');
        if (this.options.minPhaseSamples < 2) throw new Error('minPhaseSamples must be >= 2.');
        if (this.options.minIndependentWindows < 1) throw new Error('minIndependentWindows must be >= 1.');
    }

    async analyzeDirectory(inputDir: string): Promise<StabilityResearchReport> {
        const manifest = JSON.parse(await fs.readFile(path.join(inputDir, 'manifest.json'), 'utf8')) as SpotResearchDatasetManifest;
        const [features, outcomes] = await Promise.all([
            readJsonLines<SpotResearchFeatureRecord>(path.join(inputDir, 'features.jsonl')),
            readJsonLines<SpotResearchOutcomeRecord>(path.join(inputDir, 'outcomes.jsonl')),
        ]);
        return this.analyze(manifest, features, outcomes);
    }

    analyze(
        manifest: SpotResearchDatasetManifest,
        features: SpotResearchFeatureRecord[],
        outcomes: SpotResearchOutcomeRecord[],
    ): StabilityResearchReport {
        const timingQa = analyzeFeatureTiming(manifest, features);
        const horizons = manifest.horizonsMs.map((horizonMs): StabilityHorizonReport => {
            const rows = eligibleRows(features, outcomes, horizonMs, this.options);
            const stride = Math.max(1, Math.ceil(horizonMs / manifest.sampleIntervalMs));
            const durationMs = rows.length < 2
                ? 0
                : featureSlotTime(rows[rows.length - 1].feature) - featureSlotTime(rows[0].feature);
            const approximateIndependentWindows = rows.length === 0
                ? 0
                : Math.max(1, Math.floor(durationMs / horizonMs) + 1);

            const firstTime = rows[0] ? featureSlotTime(rows[0].feature) : 0;
            const blockIds = new Set(rows.map((row) => Math.floor((featureSlotTime(row.feature) - firstTime) / this.options.blockMs)));

            const metrics = manifest.featureNames.map((featureName, featureIndex): StabilityFeatureMetric => {
                const xs = rows.map((row) => row.feature.featureValues[featureIndex]);
                const ys = rows.map((row) => row.outcome.forwardReturnBps);
                const fullSpearman = spearmanCorrelation(xs, ys);

                const phaseIcs: number[] = [];
                for (let phase = 0; phase < stride; phase += 1) {
                    const phaseRows = rows.filter((row) => {
                        const slot = Math.round((featureSlotTime(row.feature) - firstTime) / manifest.sampleIntervalMs);
                        return ((slot % stride) + stride) % stride === phase;
                    });
                    if (phaseRows.length < this.options.minPhaseSamples) continue;
                    phaseIcs.push(spearmanCorrelation(
                        phaseRows.map((row) => row.feature.featureValues[featureIndex]),
                        phaseRows.map((row) => row.outcome.forwardReturnBps),
                    ));
                }

                const blockIcs: number[] = [];
                for (const blockId of [...blockIds].sort((a, b) => a - b)) {
                    const blockRows = rows.filter((row) => Math.floor((featureSlotTime(row.feature) - firstTime) / this.options.blockMs) === blockId);
                    if (blockRows.length < this.options.minBlockSamples) continue;
                    blockIcs.push(spearmanCorrelation(
                        blockRows.map((row) => row.feature.featureValues[featureIndex]),
                        blockRows.map((row) => row.outcome.forwardReturnBps),
                    ));
                }

                const medianPhaseSpearman = median(phaseIcs);
                const medianBlockSpearman = median(blockIcs);
                const phaseSign = signConsistency(phaseIcs, fullSpearman);
                const blockSign = signConsistency(blockIcs, fullSpearman);
                const stabilityScore = Math.min(
                    Math.abs(fullSpearman),
                    phaseIcs.length > 0 ? Math.abs(medianPhaseSpearman) : 0,
                    blockIcs.length > 0 ? Math.abs(medianBlockSpearman) : 0,
                ) * phaseSign * blockSign;

                return {
                    featureName,
                    samples: rows.length,
                    fullSpearman,
                    nonOverlapStride: stride,
                    nonOverlapPhasesUsed: phaseIcs.length,
                    medianPhaseSpearman,
                    phaseSignConsistency: phaseSign,
                    blocksUsed: blockIcs.length,
                    medianBlockSpearman,
                    blockSignConsistency: blockSign,
                    stabilityScore,
                };
            });

            const independentWindowGate = approximateIndependentWindows >= this.options.minIndependentWindows;
            const stabilityGate = independentWindowGate && blockIds.size >= 3;
            return {
                horizonMs,
                eligibleOutcomes: rows.length,
                approximateIndependentWindows,
                overlapFactor: stride,
                blocksAvailable: blockIds.size,
                independentWindowGate,
                stabilityGate,
                features: metrics,
                topStable: [...metrics]
                    .sort((a, b) => b.stabilityScore - a.stabilityScore)
                    .slice(0, this.options.topFeatureCount),
            };
        });
        return {
            generatedAt: Date.now(),
            manifest,
            options: this.options,
            timingQa,
            horizons,
        };
    }
}
