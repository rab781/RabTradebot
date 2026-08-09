import {
    SPOT_MICROSTRUCTURE_SCHEMA_VERSION,
    SpotMicrostructureQuality,
} from '../marketData/spotMicrostructureTypes';

export const SPOT_RESEARCH_DATASET_VERSION = 'spot-microstructure-dataset-v1' as const;

export interface SpotResearchDatasetManifest {
    datasetVersion: typeof SPOT_RESEARCH_DATASET_VERSION;
    schemaVersion: typeof SPOT_MICROSTRUCTURE_SCHEMA_VERSION;
    symbol: string;
    featureNames: string[];
    sampleIntervalMs: number;
    horizonsMs: number[];
    createdAt: number;
}

export interface SpotResearchFeatureRecord {
    recordType: 'FEATURE';
    datasetVersion: typeof SPOT_RESEARCH_DATASET_VERSION;
    schemaVersion: typeof SPOT_MICROSTRUCTURE_SCHEMA_VERSION;
    sampleId: string;
    symbol: string;
    sampledAt: number;
    /** Approximate local receive timestamp of the depth event that supplied the reference mid. */
    referenceObservedAt: number;
    referenceMidPrice: number;
    featureNames: string[];
    featureValues: number[];
    quality: SpotMicrostructureQuality;
}

export interface SpotResearchOutcomeRecord {
    recordType: 'OUTCOME';
    datasetVersion: typeof SPOT_RESEARCH_DATASET_VERSION;
    schemaVersion: typeof SPOT_MICROSTRUCTURE_SCHEMA_VERSION;
    sampleId: string;
    symbol: string;
    horizonMs: number;
    targetTime: number;
    observedAt: number;
    observationLagMs: number;
    referenceMidPrice: number;
    targetMidPrice: number;
    forwardReturn: number;
    forwardReturnBps: number;
    forwardLogReturn: number;
    targetQualityHealthy: boolean;
    targetQualityReasons: string[];
}

export interface SpotResearchDatasetStats {
    featureRecords: number;
    outcomeRecords: number;
    skippedUnhealthySamples: number;
    skippedDuplicateSamples: number;
    expiredOutcomes: number;
    pendingOutcomes: number;
    lastSampledAt?: number;
}

export interface SpotResearchDatasetStore {
    initialize(manifest: SpotResearchDatasetManifest): Promise<void>;
    appendFeature(record: SpotResearchFeatureRecord): Promise<boolean>;
    appendOutcome(record: SpotResearchOutcomeRecord): Promise<boolean>;
    /** Optional restart-recovery support for append-only stores. */
    loadFeaturesSince?(referenceObservedAtInclusive: number): Promise<SpotResearchFeatureRecord[]>;
    hasOutcome?(sampleId: string, horizonMs: number): Promise<boolean>;
    close?(): Promise<void>;
}

export interface SpotMicrostructureFeatureRecorderSource {
    getSnapshot(now?: number): import('../marketData/spotMicrostructureTypes').SpotMicrostructureSnapshot;
    toFlatVector(snapshot?: import('../marketData/spotMicrostructureTypes').SpotMicrostructureSnapshot): import('../marketData/spotMicrostructureTypes').SpotMicrostructureFlatVector;
}
