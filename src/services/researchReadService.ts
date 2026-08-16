import * as fs from 'fs';
import * as path from 'path';

export type ResearchRegion = 'EUROPE' | 'ASIA' | 'US' | 'OTHER';
export type ResearchAcceptance = 'ACCEPTED' | 'REJECTED' | 'PENDING' | 'UNKNOWN' | 'NOT_CAPTURED';
export type ComparatorState = 'PASS' | 'FAIL' | 'PENDING' | 'UNKNOWN';

type Obj = Record<string, unknown>;

const DATASET = 'spot-microstructure-dataset-v2';
const SCHEMA = 'spot-microstructure-v1';
const REGISTRY = 'research-acceptance-v1';
const ACCEPT = new Set(['ACCEPTED', 'REJECTED', 'PENDING', 'UNKNOWN']);
const COMPARE = new Set(['PASS', 'FAIL', 'PENDING', 'UNKNOWN']);

export class ResearchReadService {
    private readonly root: string;
    private readonly registry: string;

    constructor(private readonly repoRoot = process.cwd()) {
        this.root = path.join(repoRoot, 'data', 'research', 'multisession');
        this.registry = path.join(this.root, 'acceptance-registry.json');
    }

    getSessions() {
        if (!fs.existsSync(this.root)) {
            return {
                generatedAt: new Date().toISOString(),
                rootAvailable: false,
                root: this.rel(this.root),
                count: 0,
                sessions: [],
            };
        }

        const sessions = fs.readdirSync(this.root, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => this.readSession(entry.name))
            .sort((a, b) =>
                (b.createdAt ?? 0) - (a.createdAt ?? 0) ||
                a.sessionId.localeCompare(b.sessionId),
            );

        return {
            generatedAt: new Date().toISOString(),
            rootAvailable: true,
            root: this.rel(this.root),
            count: sessions.length,
            sessions,
        };
    }

    getAcceptance() {
        const catalog = this.getSessions();
        const source = this.readRegistry();

        const regions = (['EUROPE', 'ASIA', 'US'] as const).map((region) => {
            const session = catalog.sessions.find((item) => item.region === region);

            if (!session) {
                return {
                    region,
                    state: 'NOT_CAPTURED' as ResearchAcceptance,
                    sessionId: null,
                    evidence: 'NO_DISCOVERED_SESSION',
                };
            }

            const persisted = source.value?.sessions[session.sessionId];

            return {
                region,
                state: (persisted?.status ?? 'UNKNOWN') as ResearchAcceptance,
                sessionId: session.sessionId,
                evidence: persisted
                    ? 'CANONICAL_ACCEPTANCE_REGISTRY'
                    : 'NO_VALID_CANONICAL_ACCEPTANCE_EVIDENCE',
            };
        });

        const state = (region: 'EUROPE' | 'ASIA' | 'US') =>
            regions.find((item) => item.region === region)?.state ?? 'UNKNOWN';

        const comparators = source.value?.comparators ?? {
            preUs: 'UNKNOWN' as ComparatorState,
            finalThreeSession: 'UNKNOWN' as ComparatorState,
        };

        const blockers: string[] = [];

        if (state('EUROPE') !== 'ACCEPTED') blockers.push('EUROPE_ACCEPTANCE_NOT_PROVEN');
        if (state('ASIA') !== 'ACCEPTED') blockers.push('ASIA_ACCEPTANCE_NOT_PROVEN');
        if (state('US') !== 'ACCEPTED') blockers.push('US_ACCEPTANCE_NOT_PROVEN');
        if (comparators.finalThreeSession !== 'PASS') {
            blockers.push('FINAL_THREE_SESSION_COMPARATOR_NOT_PASS');
        }

        return {
            generatedAt: new Date().toISOString(),
            source: {
                path: this.rel(this.registry),
                available: source.available,
                valid: source.value !== null,
                version: source.value?.version ?? null,
                error: source.error,
            },
            regions,
            comparators,
            md52Gate: {
                allowed: blockers.length === 0,
                blockers,
            },
        };
    }

    private readSession(sessionId: string) {
        const dir = path.join(this.root, sessionId);
        const manifestPath = path.join(dir, 'manifest.json');
        let manifest: Obj | null = null;

        try {
            const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            manifest = isObj(parsed) ? parsed : null;
        } catch {
            manifest = null;
        }

        const datasetVersion = str(manifest?.datasetVersion);
        const schemaVersion = str(manifest?.schemaVersion);
        const symbol = str(manifest?.symbol);
        const featureNames = Array.isArray(manifest?.featureNames)
            ? manifest.featureNames
            : null;
        const sampleIntervalMs = num(manifest?.sampleIntervalMs);
        const horizonsMs = Array.isArray(manifest?.horizonsMs)
            ? manifest.horizonsMs.map(num).filter((v): v is number => v !== null)
            : [];
        const createdAt = num(manifest?.createdAt);

        const manifestValid =
            !!manifest &&
            !!datasetVersion &&
            !!schemaVersion &&
            !!symbol &&
            !!featureNames &&
            sampleIntervalMs !== null &&
            horizonsMs.length > 0;

        return {
            sessionId,
            region: regionOf(sessionId),
            symbol,
            datasetVersion,
            schemaVersion,
            featureCount: featureNames?.length ?? null,
            sampleIntervalMs,
            horizonsMs,
            createdAt,
            manifestValid,
            compatibleWithCurrentResearchSchema:
                manifestValid &&
                datasetVersion === DATASET &&
                schemaVersion === SCHEMA,
            files: {
                features: fileInfo(path.join(dir, 'features.jsonl')),
                outcomes: fileInfo(path.join(dir, 'outcomes.jsonl')),
            },
        };
    }

    private readRegistry(): {
        available: boolean;
        value: {
            version: string;
            sessions: Record<string, { status: string }>;
            comparators: {
                preUs: ComparatorState;
                finalThreeSession: ComparatorState;
            };
        } | null;
        error: string | null;
    } {
        if (!fs.existsSync(this.registry)) {
            return { available: false, value: null, error: 'NOT_FOUND' };
        }

        let parsed: unknown;

        try {
            parsed = JSON.parse(fs.readFileSync(this.registry, 'utf8'));
        } catch {
            return { available: true, value: null, error: 'INVALID_JSON' };
        }

        if (!isObj(parsed) || parsed.version !== REGISTRY ||
            !isObj(parsed.sessions) || !isObj(parsed.comparators)) {
            return { available: true, value: null, error: 'INVALID_SCHEMA' };
        }

        const sessions: Record<string, { status: string }> = {};

        for (const [id, raw] of Object.entries(parsed.sessions)) {
            if (!isObj(raw)) continue;
            const status = str(raw.status);
            if (status && ACCEPT.has(status)) sessions[id] = { status };
        }

        const preUs = str(parsed.comparators.preUs);
        const finalThreeSession = str(parsed.comparators.finalThreeSession);

        if (!preUs || !COMPARE.has(preUs) ||
            !finalThreeSession || !COMPARE.has(finalThreeSession)) {
            return { available: true, value: null, error: 'INVALID_SCHEMA' };
        }

        return {
            available: true,
            value: {
                version: REGISTRY,
                sessions,
                comparators: {
                    preUs: preUs as ComparatorState,
                    finalThreeSession: finalThreeSession as ComparatorState,
                },
            },
            error: null,
        };
    }

    private rel(value: string) {
        return path.relative(this.repoRoot, value).replace(/\\/g, '/');
    }
}

function isObj(value: unknown): value is Obj {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function num(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function regionOf(id: string): ResearchRegion {
    const value = id.toLowerCase();
    if (value.includes('europe')) return 'EUROPE';
    if (value.includes('asia')) return 'ASIA';
    if (/(^|[-_])us([-_]|$)/.test(value) || value.includes('new-york')) return 'US';
    return 'OTHER';
}

function fileInfo(file: string) {
    try {
        const stat = fs.statSync(file);
        return { present: stat.isFile(), bytes: stat.isFile() ? stat.size : null };
    } catch {
        return { present: false, bytes: null };
    }
}

export const researchReadService = new ResearchReadService();
