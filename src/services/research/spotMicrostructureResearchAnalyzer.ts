import { promises as fs } from 'fs';
import path from 'path';
import {
    SpotResearchDatasetManifest,
    SpotResearchFeatureRecord,
    SpotResearchOutcomeRecord,
} from './spotMicrostructureDatasetTypes';

export interface ResearchAnalyzerOptions {
    requireHealthyTarget?: boolean;
    maxObservationLagMs?: number;
    quantiles?: number;
    minSamplesForRanking?: number;
    minSamplesResearchReady?: number;
    redundancyThreshold?: number;
    topFeatureCount?: number;
}

export interface NumericSummary {
    count: number;
    mean: number;
    stdDev: number;
    min: number;
    p50: number;
    p95: number;
    max: number;
}

export interface QuantileBucket {
    bucket: number;
    count: number;
    minFeature: number;
    maxFeature: number;
    meanForwardReturnBps: number;
}

export interface FeatureHorizonMetric {
    featureName: string;
    samples: number;
    pearsonIc: number;
    spearmanIc: number;
    quantiles: QuantileBucket[];
    topMinusBottomBps: number;
    directionConsistency: number;
}

export interface HorizonResearchReport {
    horizonMs: number;
    totalOutcomes: number;
    eligibleOutcomes: number;
    unhealthyDropped: number;
    lagDropped: number;
    coveragePct: number;
    observationLagMs: NumericSummary;
    forwardReturnBps: NumericSummary;
    rankingEnabled: boolean;
    researchReady: boolean;
    features: FeatureHorizonMetric[];
    topByAbsSpearman: FeatureHorizonMetric[];
}

export interface RedundantFeaturePair {
    left: string;
    right: string;
    correlation: number;
    samples: number;
}

export interface DatasetQaReport {
    featureRecords: number;
    outcomeRecords: number;
    duplicateFeatureIds: number;
    duplicateOutcomeKeys: number;
    orphanOutcomes: number;
    featureDimensionMismatches: number;
    nonFiniteFeatureRows: number;
    featureNameMismatches: number;
    healthyFeaturePct: number;
}

export interface SpotMicrostructureResearchReport {
    generatedAt: number;
    manifest: SpotResearchDatasetManifest;
    qa: DatasetQaReport;
    options: Required<ResearchAnalyzerOptions>;
    horizons: HorizonResearchReport[];
    redundantPairs: RedundantFeaturePair[];
}

const DEFAULTS: Required<ResearchAnalyzerOptions> = {
    requireHealthyTarget: true,
    maxObservationLagMs: 500,
    quantiles: 5,
    minSamplesForRanking: 1000,
    minSamplesResearchReady: 5000,
    redundancyThreshold: 0.97,
    topFeatureCount: 15,
};

async function readJsonLines<T>(file: string): Promise<T[]> {
    const raw = await fs.readFile(file, 'utf8');
    return raw
        .split(/\r?\n/)
        .filter((line: string) => line.trim().length > 0)
        .map((line: string) => JSON.parse(line) as T);
}

function finite(values: number[]): number[] {
    return values.filter(Number.isFinite);
}

function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const m = mean(values);
    const variance = values.reduce((sum, value) => sum + ((value - m) ** 2), 0) / (values.length - 1);
    return Math.sqrt(Math.max(0, variance));
}

function percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    if (sortedValues.length === 1) return sortedValues[0];
    const clamped = Math.min(1, Math.max(0, p));
    const index = (sortedValues.length - 1) * clamped;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sortedValues[lower];
    const weight = index - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export function summarize(valuesInput: number[]): NumericSummary {
    const values = finite(valuesInput).sort((a, b) => a - b);
    if (values.length === 0) {
        return { count: 0, mean: 0, stdDev: 0, min: 0, p50: 0, p95: 0, max: 0 };
    }
    return {
        count: values.length,
        mean: mean(values),
        stdDev: stdDev(values),
        min: values[0],
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        max: values[values.length - 1],
    };
}

export function pearsonCorrelation(xs: number[], ys: number[]): number {
    if (xs.length !== ys.length || xs.length < 2) return 0;
    const mx = mean(xs);
    const my = mean(ys);
    let numerator = 0;
    let dx2 = 0;
    let dy2 = 0;
    for (let i = 0; i < xs.length; i += 1) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        numerator += dx * dy;
        dx2 += dx * dx;
        dy2 += dy * dy;
    }
    const denominator = Math.sqrt(dx2 * dy2);
    return denominator === 0 ? 0 : numerator / denominator;
}

function rank(values: number[]): number[] {
    const len = values.length;
    // ⚡ Bolt Optimization: Use Int32Array for indices and sort directly to avoid O(N) object allocations
    const indices = new Int32Array(len);
    for (let i = 0; i < len; i++) indices[i] = i;

    indices.sort((a, b) => values[a] - values[b]);

    const ranks = new Array<number>(len);
    let i = 0;
    while (i < len) {
        let j = i + 1;
        while (j < len && values[indices[j]] === values[indices[i]]) j += 1;
        const averageRank = (i + j - 1) / 2 + 1;
        for (let k = i; k < j; k += 1) ranks[indices[k]] = averageRank;
        i = j;
    }
    return ranks;
}

export function spearmanCorrelation(xs: number[], ys: number[]): number {
    if (xs.length !== ys.length || xs.length < 2) return 0;
    return pearsonCorrelation(rank(xs), rank(ys));
}

function quantileBuckets(feature: number[], returnsBps: number[], bucketCount: number): QuantileBucket[] {
    if (feature.length !== returnsBps.length || feature.length === 0) return [];
    const len = feature.length;
    // ⚡ Bolt Optimization: Use Int32Array for indices and sort directly to avoid O(N) object allocations
    const indices = new Int32Array(len);
    for (let i = 0; i < len; i++) indices[i] = i;

    indices.sort((a, b) => feature[a] - feature[b]);

    const buckets: QuantileBucket[] = [];
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
        const start = Math.floor((bucket * len) / bucketCount);
        const end = Math.floor(((bucket + 1) * len) / bucketCount);
        const count = Math.max(start + 1, end) - start;
        if (count <= 0) continue;

        let sum = 0;
        for (let i = start; i < start + count; i++) {
            sum += returnsBps[indices[i]];
        }

        buckets.push({
            bucket: bucket + 1,
            count,
            minFeature: feature[indices[start]],
            maxFeature: feature[indices[start + count - 1]],
            meanForwardReturnBps: sum / count,
        });
    }
    return buckets;
}

function directionConsistency(quantiles: QuantileBucket[]): number {
    if (quantiles.length < 2) return 0;
    let monotonicUp = 0;
    let monotonicDown = 0;
    const comparisons = quantiles.length - 1;
    for (let i = 1; i < quantiles.length; i += 1) {
        const delta = quantiles[i].meanForwardReturnBps - quantiles[i - 1].meanForwardReturnBps;
        if (delta >= 0) monotonicUp += 1;
        if (delta <= 0) monotonicDown += 1;
    }
    return Math.max(monotonicUp, monotonicDown) / comparisons;
}

function sameNames(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((name, index) => name === b[index]);
}

export class SpotMicrostructureResearchAnalyzer {
    private readonly options: Required<ResearchAnalyzerOptions>;

    constructor(options: ResearchAnalyzerOptions = {}) {
        this.options = { ...DEFAULTS, ...options };
        if (this.options.quantiles < 2) throw new Error('quantiles must be >= 2.');
        if (this.options.maxObservationLagMs < 0) throw new Error('maxObservationLagMs must be >= 0.');
        if (this.options.redundancyThreshold <= 0 || this.options.redundancyThreshold > 1) {
            throw new Error('redundancyThreshold must be in (0, 1].');
        }
    }

    async analyzeDirectory(inputDir: string): Promise<SpotMicrostructureResearchReport> {
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
    ): SpotMicrostructureResearchReport {
        const featureById = new Map<string, SpotResearchFeatureRecord>();
        let duplicateFeatureIds = 0;
        let dimensionMismatches = 0;
        let nonFiniteFeatureRows = 0;
        let featureNameMismatches = 0;
        let healthyFeatures = 0;

        for (const feature of features) {
            if (featureById.has(feature.sampleId)) duplicateFeatureIds += 1;
            else featureById.set(feature.sampleId, feature);
            if (feature.featureValues.length !== manifest.featureNames.length) dimensionMismatches += 1;
            if (!feature.featureValues.every(Number.isFinite)) nonFiniteFeatureRows += 1;
            if (!sameNames(feature.featureNames, manifest.featureNames)) featureNameMismatches += 1;
            if (feature.quality.healthy) healthyFeatures += 1;
        }

        const outcomeKeys = new Set<string>();
        let duplicateOutcomeKeys = 0;
        let orphanOutcomes = 0;
        for (const outcome of outcomes) {
            const key = `${outcome.sampleId}:${outcome.horizonMs}`;
            if (outcomeKeys.has(key)) duplicateOutcomeKeys += 1;
            outcomeKeys.add(key);
            if (!featureById.has(outcome.sampleId)) orphanOutcomes += 1;
        }

        const qa: DatasetQaReport = {
            featureRecords: features.length,
            outcomeRecords: outcomes.length,
            duplicateFeatureIds,
            duplicateOutcomeKeys,
            orphanOutcomes,
            featureDimensionMismatches: dimensionMismatches,
            nonFiniteFeatureRows,
            featureNameMismatches,
            healthyFeaturePct: features.length === 0 ? 0 : (healthyFeatures / features.length) * 100,
        };

        const horizons = manifest.horizonsMs.map((horizonMs) => {
            const horizonOutcomes = outcomes.filter((outcome) => outcome.horizonMs === horizonMs);
            let unhealthyDropped = 0;
            let lagDropped = 0;
            const eligible: Array<{ feature: SpotResearchFeatureRecord; outcome: SpotResearchOutcomeRecord }> = [];
            for (const outcome of horizonOutcomes) {
                const feature = featureById.get(outcome.sampleId);
                if (!feature) continue;
                if (this.options.requireHealthyTarget && !outcome.targetQualityHealthy) {
                    unhealthyDropped += 1;
                    continue;
                }
                if (outcome.observationLagMs > this.options.maxObservationLagMs) {
                    lagDropped += 1;
                    continue;
                }
                if (feature.featureValues.length !== manifest.featureNames.length) continue;
                if (!feature.featureValues.every(Number.isFinite)) continue;
                eligible.push({ feature, outcome });
            }

            const returnsBps = eligible.map(({ outcome }) => outcome.forwardReturnBps);
            const rankingEnabled = eligible.length >= this.options.minSamplesForRanking;
            const researchReady = eligible.length >= this.options.minSamplesResearchReady;
            const metrics = manifest.featureNames.map((featureName, featureIndex): FeatureHorizonMetric => {
                const xs: number[] = [];
                const ys: number[] = [];
                for (const row of eligible) {
                    const x = row.feature.featureValues[featureIndex];
                    const y = row.outcome.forwardReturnBps;
                    if (Number.isFinite(x) && Number.isFinite(y)) {
                        xs.push(x);
                        ys.push(y);
                    }
                }
                const buckets = quantileBuckets(xs, ys, this.options.quantiles);
                const topMinusBottomBps = buckets.length >= 2
                    ? buckets[buckets.length - 1].meanForwardReturnBps - buckets[0].meanForwardReturnBps
                    : 0;
                return {
                    featureName,
                    samples: xs.length,
                    pearsonIc: pearsonCorrelation(xs, ys),
                    spearmanIc: spearmanCorrelation(xs, ys),
                    quantiles: buckets,
                    topMinusBottomBps,
                    directionConsistency: directionConsistency(buckets),
                };
            });
            const sorted = [...metrics].sort((a, b) => Math.abs(b.spearmanIc) - Math.abs(a.spearmanIc));
            return {
                horizonMs,
                totalOutcomes: horizonOutcomes.length,
                eligibleOutcomes: eligible.length,
                unhealthyDropped,
                lagDropped,
                coveragePct: features.length === 0 ? 0 : (horizonOutcomes.length / features.length) * 100,
                observationLagMs: summarize(horizonOutcomes.map((outcome) => outcome.observationLagMs)),
                forwardReturnBps: summarize(returnsBps),
                rankingEnabled,
                researchReady,
                features: metrics,
                topByAbsSpearman: rankingEnabled ? sorted.slice(0, this.options.topFeatureCount) : [],
            } satisfies HorizonResearchReport;
        });

        const redundantPairs = this.findRedundantPairs(manifest, features);
        return {
            generatedAt: Date.now(),
            manifest,
            qa,
            options: this.options,
            horizons,
            redundantPairs,
        };
    }

    private findRedundantPairs(
        manifest: SpotResearchDatasetManifest,
        features: SpotResearchFeatureRecord[],
    ): RedundantFeaturePair[] {
        const valid = features.filter((feature) =>
            feature.featureValues.length === manifest.featureNames.length
            && feature.featureValues.every(Number.isFinite),
        );
        const pairs: RedundantFeaturePair[] = [];
        for (let i = 0; i < manifest.featureNames.length; i += 1) {
            const xi = valid.map((row) => row.featureValues[i]);
            for (let j = i + 1; j < manifest.featureNames.length; j += 1) {
                const xj = valid.map((row) => row.featureValues[j]);
                const correlation = pearsonCorrelation(xi, xj);
                if (Math.abs(correlation) >= this.options.redundancyThreshold) {
                    pairs.push({
                        left: manifest.featureNames[i],
                        right: manifest.featureNames[j],
                        correlation,
                        samples: valid.length,
                    });
                }
            }
        }
        return pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    }
}
