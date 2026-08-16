import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ResearchReadService } from '../src/services/researchReadService';

describe('WEB3-A1 research read model', () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'rab-web3a-'));
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    const session = (id: string, createdAt = 1) => {
        const dir = path.join(root, 'data', 'research', 'multisession', id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
            datasetVersion: 'spot-microstructure-dataset-v2',
            schemaVersion: 'spot-microstructure-v1',
            symbol: 'BTCUSDT',
            featureNames: Array.from({ length: 104 }, (_, i) => `f${i}`),
            sampleIntervalMs: 1000,
            horizonsMs: [1000, 5000, 15000, 30000, 60000],
            createdAt,
        }));
        return dir;
    };

    const registry = (value: unknown) => {
        const dir = path.join(root, 'data', 'research', 'multisession');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'acceptance-registry.json'), JSON.stringify(value));
    };

    test('catalogs dataset-v2 manifests and only stats JSONL files', () => {
        const dir = session('btcusdt-v2-asia-test', 2);
        session('btcusdt-v2-europe-test', 1);
        fs.writeFileSync(path.join(dir, 'features.jsonl'), '{"x":1}\n');
        fs.writeFileSync(path.join(dir, 'outcomes.jsonl'), '{"y":1}\n');

        const result = new ResearchReadService(root).getSessions();

        expect(result.count).toBe(2);
        expect(result.sessions[0]).toMatchObject({
            region: 'ASIA',
            featureCount: 104,
            sampleIntervalMs: 1000,
            horizonsMs: [1000, 5000, 15000, 30000, 60000],
            manifestValid: true,
            compatibleWithCurrentResearchSchema: true,
        });
        expect(result.sessions[0].files.features.present).toBe(true);
        expect(result.sessions[0].files.outcomes.present).toBe(true);
    });

    test('missing acceptance evidence fails closed', () => {
        session('btcusdt-v2-europe-test');
        session('btcusdt-v2-asia-test');

        const result = new ResearchReadService(root).getAcceptance();

        expect(result.source).toMatchObject({
            available: false,
            valid: false,
            error: 'NOT_FOUND',
        });
        expect(result.regions).toEqual(expect.arrayContaining([
            expect.objectContaining({ region: 'EUROPE', state: 'UNKNOWN' }),
            expect.objectContaining({ region: 'ASIA', state: 'UNKNOWN' }),
            expect.objectContaining({ region: 'US', state: 'NOT_CAPTURED' }),
        ]));
        expect(result.md52Gate.allowed).toBe(false);
    });

    test('strict registry is the only source that can open the research gate', () => {
        const eu = 'btcusdt-v2-europe-test';
        const asia = 'btcusdt-v2-asia-test';
        const us = 'btcusdt-v2-us-test';
        [eu, asia, us].forEach((id) => session(id));

        registry({
            version: 'research-acceptance-v1',
            sessions: {
                [eu]: { status: 'ACCEPTED' },
                [asia]: { status: 'ACCEPTED' },
                [us]: { status: 'ACCEPTED' },
            },
            comparators: {
                preUs: 'PASS',
                finalThreeSession: 'PASS',
            },
        });

        const result = new ResearchReadService(root).getAcceptance();

        expect(result.source.valid).toBe(true);
        expect(result.md52Gate).toEqual({ allowed: true, blockers: [] });
    });

    test('invalid registry stays blocked', () => {
        session('btcusdt-v2-europe-test');
        registry({ version: 'wrong', sessions: {}, comparators: {} });

        const result = new ResearchReadService(root).getAcceptance();

        expect(result.source.error).toBe('INVALID_SCHEMA');
        expect(result.md52Gate.allowed).toBe(false);
    });

    test('web routes are GET-only and service is isolated from execution', () => {
        const web = fs.readFileSync(path.join(__dirname, '..', 'src', 'webServer.ts'), 'utf8');
        const serviceSource = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'services', 'researchReadService.ts'),
            'utf8',
        );

        expect(web).toContain("app.get('/api/research/sessions'");
        expect(web).toContain("app.get('/api/research/acceptance'");
        expect(web).not.toMatch(/app\.(post|put|patch|delete)\('\/api\/research\//);

        ['RealTradingEngine', 'tradingApplicationService', 'submitOrder', 'executeEntry', 'executeExit']
            .forEach((value) => expect(serviceSource).not.toContain(value));
    });
});
