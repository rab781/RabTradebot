import { promises as fs } from 'fs';
import path from 'path';
import {
    SpotResearchDatasetManifest,
    SpotResearchDatasetStore,
    SpotResearchFeatureRecord,
    SpotResearchOutcomeRecord,
} from './spotMicrostructureDatasetTypes';

function stableManifestView(manifest: SpotResearchDatasetManifest): object {
    return {
        datasetVersion: manifest.datasetVersion,
        schemaVersion: manifest.schemaVersion,
        symbol: manifest.symbol,
        featureNames: manifest.featureNames,
        sampleIntervalMs: manifest.sampleIntervalMs,
        horizonsMs: manifest.horizonsMs,
    };
}

async function readJsonLines<T>(file: string): Promise<T[]> {
    try {
        const raw = await fs.readFile(file, 'utf8');
        return raw
            .split(/\r?\n/)
            .filter((line: string) => line.trim().length > 0)
            .map((line: string) => JSON.parse(line) as T);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
}

/**
 * Append-only research store. Features and future outcomes are deliberately
 * separated so training code cannot accidentally read labels as input columns.
 */
export class JsonlResearchDatasetStore implements SpotResearchDatasetStore {
    private manifest?: SpotResearchDatasetManifest;
    private readonly featureIds = new Set<string>();
    private readonly outcomeIds = new Set<string>();
    private readonly featuresById = new Map<string, SpotResearchFeatureRecord>();
    private featureFile = '';
    private outcomeFile = '';
    private manifestFile = '';

    constructor(private readonly outputDir: string) {
        if (!outputDir.trim()) throw new Error('outputDir is required.');
    }

    async initialize(manifest: SpotResearchDatasetManifest): Promise<void> {
        await fs.mkdir(this.outputDir, { recursive: true });
        this.featureFile = path.join(this.outputDir, 'features.jsonl');
        this.outcomeFile = path.join(this.outputDir, 'outcomes.jsonl');
        this.manifestFile = path.join(this.outputDir, 'manifest.json');

        try {
            const existing = JSON.parse(await fs.readFile(this.manifestFile, 'utf8')) as SpotResearchDatasetManifest;
            if (JSON.stringify(stableManifestView(existing)) !== JSON.stringify(stableManifestView(manifest))) {
                throw new Error('Research dataset manifest mismatch. Use a new output directory for a different schema/config.');
            }
            this.manifest = existing;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            await fs.writeFile(this.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
            this.manifest = manifest;
        }

        const [features, outcomes] = await Promise.all([
            readJsonLines<SpotResearchFeatureRecord>(this.featureFile),
            readJsonLines<SpotResearchOutcomeRecord>(this.outcomeFile),
        ]);
        this.featureIds.clear();
        this.outcomeIds.clear();
        this.featuresById.clear();
        for (const feature of features) {
            this.featureIds.add(feature.sampleId);
            this.featuresById.set(feature.sampleId, feature);
        }
        for (const outcome of outcomes) this.outcomeIds.add(`${outcome.sampleId}:${outcome.horizonMs}`);
    }

    async appendFeature(record: SpotResearchFeatureRecord): Promise<boolean> {
        this.ensureInitialized();
        if (this.featureIds.has(record.sampleId)) return false;
        await fs.appendFile(this.featureFile, `${JSON.stringify(record)}\n`, 'utf8');
        this.featureIds.add(record.sampleId);
        this.featuresById.set(record.sampleId, record);
        return true;
    }

    async appendOutcome(record: SpotResearchOutcomeRecord): Promise<boolean> {
        this.ensureInitialized();
        const key = `${record.sampleId}:${record.horizonMs}`;
        if (this.outcomeIds.has(key)) return false;
        if (!this.featureIds.has(record.sampleId)) {
            throw new Error(`Cannot append outcome for unknown feature sample ${record.sampleId}.`);
        }
        await fs.appendFile(this.outcomeFile, `${JSON.stringify(record)}\n`, 'utf8');
        this.outcomeIds.add(key);
        return true;
    }

    async loadFeaturesSince(sampledAtInclusive: number): Promise<SpotResearchFeatureRecord[]> {
        this.ensureInitialized();
        return [...this.featuresById.values()]
            .filter((record) => record.sampledAt >= sampledAtInclusive)
            .sort((a, b) => a.sampledAt - b.sampledAt)
            .map((record) => ({
                ...record,
                featureNames: [...record.featureNames],
                featureValues: [...record.featureValues],
                quality: { ...record.quality, reasons: [...record.quality.reasons] },
            }));
    }

    async hasOutcome(sampleId: string, horizonMs: number): Promise<boolean> {
        this.ensureInitialized();
        return this.outcomeIds.has(`${sampleId}:${horizonMs}`);
    }

    private ensureInitialized(): void {
        if (!this.manifest) throw new Error('JsonlResearchDatasetStore.initialize() must be called first.');
    }
}
