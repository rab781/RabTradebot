import { promises as fs } from 'fs';
import path from 'path';

function arg(name: string, fallback: string): string {
    const item = process.argv.find((value) => value.startsWith(`--${name}=`));
    return item ? item.slice(name.length + 3) : fallback;
}
async function lines(file: string): Promise<Record<string, unknown>[]> {
    try {
        const raw = await fs.readFile(file, 'utf8');
        return raw.split(/\r?\n/).filter(Boolean).map((x) => JSON.parse(x));
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw e;
    }
}
async function main(): Promise<void> {
    const dir = path.resolve(arg('input', 'data/research/btcusdt-microstructure-v1'));
    const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
    const features = await lines(path.join(dir, 'features.jsonl'));
    const outcomes = await lines(path.join(dir, 'outcomes.jsonl'));
    const byHorizon = new Map<number, number>();
    let unhealthyTargets = 0; let maxLag = 0;
    for (const row of outcomes) {
        const h = Number(row.horizonMs); byHorizon.set(h, (byHorizon.get(h) ?? 0) + 1);
        if (row.targetQualityHealthy === false) unhealthyTargets += 1;
        maxLag = Math.max(maxLag, Number(row.observationLagMs ?? 0));
    }
    console.log({
        dir,
        symbol: manifest.symbol,
        schema: manifest.schemaVersion,
        featureDimensions: manifest.featureNames?.length,
        sampleIntervalMs: manifest.sampleIntervalMs,
        features: features.length,
        outcomes: outcomes.length,
        outcomeCoverageByHorizon: Object.fromEntries([...byHorizon.entries()].sort((a,b) => a[0]-b[0])),
        unhealthyTargets,
        maxObservationLagMs: maxLag,
    });
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
