import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { JsonlResearchDatasetStore } from '../src/services/research/jsonlResearchDatasetStore';
import { SPOT_RESEARCH_DATASET_VERSION, SpotResearchDatasetManifest, SpotResearchFeatureRecord, SpotResearchOutcomeRecord } from '../src/services/research/spotMicrostructureDatasetTypes';
import { SPOT_MICROSTRUCTURE_SCHEMA_VERSION } from '../src/services/marketData/spotMicrostructureTypes';

function manifest(): SpotResearchDatasetManifest {
    return {
        datasetVersion: SPOT_RESEARCH_DATASET_VERSION,
        schemaVersion: SPOT_MICROSTRUCTURE_SCHEMA_VERSION,
        symbol: 'BTCUSDT', featureNames: ['f1'], sampleIntervalMs: 1000, horizonsMs: [1000], createdAt: 1,
    };
}
function feature(): SpotResearchFeatureRecord {
    return {
        recordType: 'FEATURE', datasetVersion: SPOT_RESEARCH_DATASET_VERSION, schemaVersion: SPOT_MICROSTRUCTURE_SCHEMA_VERSION,
        sampleId: 'id-1', symbol: 'BTCUSDT', sampledAt: 1000, referenceObservedAt: 999, referenceMidPrice: 100,
        featureNames: ['f1'], featureValues: [1],
        quality: { healthy: true, marketStatus: 'LIVE', depthStatus: 'LIVE', tradeSamples60s: 1, ofiSamples60s: 1, reasons: [] },
    };
}
function outcome(): SpotResearchOutcomeRecord {
    return {
        recordType: 'OUTCOME', datasetVersion: SPOT_RESEARCH_DATASET_VERSION, schemaVersion: SPOT_MICROSTRUCTURE_SCHEMA_VERSION,
        sampleId: 'id-1', symbol: 'BTCUSDT', horizonMs: 1000, targetTime: 1999, observedAt: 2000, observationLagMs: 1,
        referenceMidPrice: 100, targetMidPrice: 101, forwardReturn: .01, forwardReturnBps: 100,
        forwardLogReturn: Math.log(1.01), targetQualityHealthy: true, targetQualityReasons: [],
    };
}

describe('MD4 JsonlResearchDatasetStore', () => {
    let dir: string;
    beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rab-md4-')); });
    afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

    test('creates manifest and append-only feature/outcome files', async () => {
        const store = new JsonlResearchDatasetStore(dir);
        await store.initialize(manifest());
        expect(await store.appendFeature(feature())).toBe(true);
        expect(await store.appendOutcome(outcome())).toBe(true);
        const m = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
        expect(m.symbol).toBe('BTCUSDT');
        expect((await fs.readFile(path.join(dir, 'features.jsonl'), 'utf8')).trim().split('\n')).toHaveLength(1);
        expect((await fs.readFile(path.join(dir, 'outcomes.jsonl'), 'utf8')).trim().split('\n')).toHaveLength(1);
    });

    test('rejects duplicate feature IDs across restarts', async () => {
        const first = new JsonlResearchDatasetStore(dir); await first.initialize(manifest());
        expect(await first.appendFeature(feature())).toBe(true);
        const second = new JsonlResearchDatasetStore(dir); await second.initialize(manifest());
        expect(await second.appendFeature(feature())).toBe(false);
    });

    test('rejects duplicate outcome keys across restarts', async () => {
        const first = new JsonlResearchDatasetStore(dir); await first.initialize(manifest());
        await first.appendFeature(feature()); expect(await first.appendOutcome(outcome())).toBe(true);
        const second = new JsonlResearchDatasetStore(dir); await second.initialize(manifest());
        expect(await second.appendOutcome(outcome())).toBe(false);
    });

    test('refuses outcome without a persisted feature', async () => {
        const store = new JsonlResearchDatasetStore(dir); await store.initialize(manifest());
        await expect(store.appendOutcome(outcome())).rejects.toThrow(/unknown feature sample/);
    });


    test('loads recent persisted features and reports outcome existence for restart recovery', async () => {
        const store = new JsonlResearchDatasetStore(dir); await store.initialize(manifest());
        await store.appendFeature(feature()); await store.appendOutcome(outcome());
        const reopened = new JsonlResearchDatasetStore(dir); await reopened.initialize(manifest());
        const recent = await reopened.loadFeaturesSince(900);
        expect(recent.map((x) => x.sampleId)).toEqual(['id-1']);
        expect(await reopened.hasOutcome('id-1', 1000)).toBe(true);
        expect(await reopened.hasOutcome('id-1', 5000)).toBe(false);
    });

    test('refuses manifest/schema/config mismatch in an existing directory', async () => {
        const store = new JsonlResearchDatasetStore(dir); await store.initialize(manifest());
        const changed = manifest(); changed.horizonsMs = [5000];
        const second = new JsonlResearchDatasetStore(dir);
        await expect(second.initialize(changed)).rejects.toThrow(/manifest mismatch/);
    });
});
