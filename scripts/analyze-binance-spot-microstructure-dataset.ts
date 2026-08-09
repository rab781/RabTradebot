import { promises as fs } from 'fs';
import path from 'path';
import { SpotMicrostructureResearchAnalyzer } from '../src/services/research/spotMicrostructureResearchAnalyzer';

function arg(name: string, fallback?: string): string | undefined {
    const prefix = `--${name}=`;
    const found = process.argv.find((value: string) => value.startsWith(prefix));
    return found ? found.slice(prefix.length) : fallback;
}

function numericArg(name: string, fallback: number): number {
    const raw = arg(name);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid --${name}: ${raw}`);
    return parsed;
}

async function main(): Promise<void> {
    const input = path.resolve(arg('input', 'data/research/btcusdt-microstructure-v1')!);
    const output = path.resolve(arg('output', path.join(input, 'md5-report.json'))!);
    const analyzer = new SpotMicrostructureResearchAnalyzer({
        maxObservationLagMs: numericArg('maxLagMs', 500),
        minSamplesForRanking: numericArg('minRankSamples', 1000),
        minSamplesResearchReady: numericArg('minResearchSamples', 5000),
        redundancyThreshold: numericArg('redundancy', 0.97),
        quantiles: numericArg('quantiles', 5),
        topFeatureCount: numericArg('top', 15),
        requireHealthyTarget: arg('allowUnhealthy', 'false') !== 'true',
    });

    const report = await analyzer.analyzeDirectory(input);
    await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    console.log(`MD5 research validation — ${report.manifest.symbol}`);
    console.log(`input=${input}`);
    console.log(`report=${output}`);
    console.log('QA:', report.qa);
    console.log(`redundantPairs(|r|>=${report.options.redundancyThreshold})=${report.redundantPairs.length}`);

    for (const horizon of report.horizons) {
        const status = horizon.researchReady
            ? 'RESEARCH_READY'
            : horizon.rankingEnabled
                ? 'EXPLORATORY_ONLY'
                : 'INSUFFICIENT_SAMPLE';
        console.log(`\nHorizon ${horizon.horizonMs}ms — ${status}`);
        console.log({
            totalOutcomes: horizon.totalOutcomes,
            eligibleOutcomes: horizon.eligibleOutcomes,
            unhealthyDropped: horizon.unhealthyDropped,
            lagDropped: horizon.lagDropped,
            coveragePct: Number(horizon.coveragePct.toFixed(2)),
            lagP50Ms: Number(horizon.observationLagMs.p50.toFixed(2)),
            lagP95Ms: Number(horizon.observationLagMs.p95.toFixed(2)),
            maxLagMs: Number(horizon.observationLagMs.max.toFixed(2)),
            meanForwardReturnBps: Number(horizon.forwardReturnBps.mean.toFixed(6)),
            stdForwardReturnBps: Number(horizon.forwardReturnBps.stdDev.toFixed(6)),
        });
        if (!horizon.rankingEnabled) {
            console.log(`Feature ranking withheld until eligibleOutcomes >= ${report.options.minSamplesForRanking}.`);
            continue;
        }
        console.table(horizon.topByAbsSpearman.map((feature) => ({
            feature: feature.featureName,
            n: feature.samples,
            pearson: Number(feature.pearsonIc.toFixed(5)),
            spearman: Number(feature.spearmanIc.toFixed(5)),
            qSpreadBps: Number(feature.topMinusBottomBps.toFixed(5)),
            monotonicity: Number(feature.directionConsistency.toFixed(3)),
        })));
    }

    if (report.qa.duplicateFeatureIds || report.qa.duplicateOutcomeKeys || report.qa.orphanOutcomes
        || report.qa.featureDimensionMismatches || report.qa.nonFiniteFeatureRows || report.qa.featureNameMismatches) {
        process.exitCode = 2;
        console.error('\n❌ DATASET QA FAILED — repair dataset integrity before research/training.');
        return;
    }

    console.log('\n✅ Dataset structure is valid. Statistical readiness depends on eligible sample count per horizon.');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
