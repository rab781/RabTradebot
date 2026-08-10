import { promises as fs } from 'fs';
import path from 'path';
import { SpotMicrostructureStabilityAnalyzer } from '../src/services/research/spotMicrostructureStabilityAnalyzer';

function arg(name: string, fallback?: string): string | undefined {
    const prefix = `--${name}=`;
    const found = process.argv.find((value: string) => value.startsWith(prefix));
    return found ? found.slice(prefix.length) : fallback;
}

function numberArg(name: string, fallback: number): number {
    const raw = arg(name);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid --${name}: ${raw}`);
    return parsed;
}

async function main(): Promise<void> {
    const input = path.resolve(arg('input', 'data/research/btcusdt-microstructure-v1-fixed-grid-30m')!);
    const output = path.resolve(arg('output', path.join(input, 'md5-stability-report.json'))!);
    const analyzer = new SpotMicrostructureStabilityAnalyzer({
        maxObservationLagMs: numberArg('maxLagMs', 500),
        blockMs: numberArg('blockMs', 300000),
        minBlockSamples: numberArg('minBlockSamples', 60),
        minPhaseSamples: numberArg('minPhaseSamples', 20),
        minIndependentWindows: numberArg('minIndependentWindows', 100),
        topFeatureCount: numberArg('top', 15),
        requireHealthyTarget: arg('allowUnhealthy', 'false') !== 'true',
    });
    const report = await analyzer.analyzeDirectory(input);
    await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    console.log(`MD5.1 overlap/stability validation — ${report.manifest.symbol}`);
    console.log(`input=${input}`);
    console.log(`report=${output}`);
    console.log('Timing QA:', {
        featureRecords: report.timingQa.featureRecords,
        expectedSlots: report.timingQa.expectedSlots,
        observedSlots: report.timingQa.observedSlots,
        missingSlots: report.timingQa.missingSlots,
        duplicateSlots: report.timingQa.duplicateSlots,
        cadenceCoveragePct: Number(report.timingQa.cadenceCoveragePct.toFixed(3)),
        intervalP50Ms: Number(report.timingQa.intervalMs.p50.toFixed(2)),
        intervalP95Ms: Number(report.timingQa.intervalMs.p95.toFixed(2)),
        gridErrorP95Ms: Number(report.timingQa.absoluteGridErrorMs.p95.toFixed(2)),
        gridPhasesMs: report.timingQa.gridPhasesMs,
        gridPhaseChanges: report.timingQa.gridPhaseChanges,
        continuityBreaks: report.timingQa.continuityBreaks,
    });

    for (const horizon of report.horizons) {
        const status = horizon.stabilityGate ? 'STABILITY_GATE_PASS' : 'SANITY_ONLY';
        console.log(`\nHorizon ${horizon.horizonMs}ms — ${status}`);
        console.log({
            eligibleOutcomes: horizon.eligibleOutcomes,
            overlapFactor: horizon.overlapFactor,
            approximateIndependentWindows: horizon.approximateIndependentWindows,
            blocksAvailable: horizon.blocksAvailable,
            independentWindowGate: horizon.independentWindowGate,
        });
        console.table(horizon.topStable.map((feature) => ({
            feature: feature.featureName,
            full: Number(feature.fullSpearman.toFixed(4)),
            phaseMedian: Number(feature.medianPhaseSpearman.toFixed(4)),
            phaseSign: Number(feature.phaseSignConsistency.toFixed(3)),
            blockMedian: Number(feature.medianBlockSpearman.toFixed(4)),
            blockSign: Number(feature.blockSignConsistency.toFixed(3)),
            score: Number(feature.stabilityScore.toFixed(4)),
        })));
    }
    console.log('\nNote: STABILITY_GATE_PASS is an exploratory dependence sanity-check, not a production edge claim.');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
