import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import {
    discoverMultiSessionInputs,
} from '../src/services/research/spotMicrostructureMultiSessionLoader';

describe('MD5 multi-session loader', () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(
            path.join(os.tmpdir(), 'rabtradebot-md5-ms-'),
        );
    });

    afterEach(async () => {
        await fs.rm(root, {
            recursive: true,
            force: true,
        });
    });

    async function createSession(
        sessionId: string,
    ): Promise<string> {
        const dir = path.join(root, sessionId);

        await fs.mkdir(dir, {
            recursive: true,
        });

        return dir;
    }

    async function writeJson(
        file: string,
        value: unknown,
    ): Promise<void> {
        await fs.writeFile(
            file,
            `${JSON.stringify(value)}\n`,
            'utf8',
        );
    }

    test('discovers a session when both analysis reports are present', async () => {
        const dir = await createSession('session-valid');

        await writeJson(
            path.join(dir, 'md5-report.json'),
            {
                manifest: {
                    datasetVersion: 'spot-microstructure-dataset-v2',
                },
            },
        );

        await writeJson(
            path.join(dir, 'md5-stability-report.json'),
            {
                manifest: {
                    datasetVersion: 'spot-microstructure-dataset-v2',
                },
            },
        );

        const inputs =
            await discoverMultiSessionInputs(root);

        expect(inputs).toHaveLength(1);

        expect(inputs[0].sessionId)
            .toBe('session-valid');

        expect(inputs[0].research)
            .toBeDefined();

        expect(inputs[0].stability)
            .toBeDefined();
    });

    test('ignores a directory when neither analysis report exists', async () => {
        const dir =
            await createSession('session-unanalyzed');

        // Simulasi raw capture yang belum dianalisis.
        await writeJson(
            path.join(dir, 'manifest.json'),
            {
                datasetVersion:
                    'spot-microstructure-dataset-v2',
            },
        );

        const inputs =
            await discoverMultiSessionInputs(root);

        expect(inputs).toHaveLength(0);
    });

    test('fails closed when md5-report exists but stability report is missing', async () => {
        const dir =
            await createSession('session-missing-stability');

        await writeJson(
            path.join(dir, 'md5-report.json'),
            {
                manifest: {
                    datasetVersion:
                        'spot-microstructure-dataset-v2',
                },
            },
        );

        await expect(
            discoverMultiSessionInputs(root),
        ).rejects.toThrow(
            /session-missing-stability.*incomplete analysis reports/i,
        );
    });

    test('fails closed when stability report exists but md5-report is missing', async () => {
        const dir =
            await createSession('session-missing-research');

        await writeJson(
            path.join(
                dir,
                'md5-stability-report.json',
            ),
            {
                manifest: {
                    datasetVersion:
                        'spot-microstructure-dataset-v2',
                },
            },
        );

        await expect(
            discoverMultiSessionInputs(root),
        ).rejects.toThrow(
            /session-missing-research.*incomplete analysis reports/i,
        );
    });

    test('fails closed with context when md5-report JSON is malformed', async () => {
        const dir =
            await createSession('session-bad-research-json');

        await fs.writeFile(
            path.join(dir, 'md5-report.json'),
            '{ definitely-not-valid-json !!!',
            'utf8',
        );

        await writeJson(
            path.join(
                dir,
                'md5-stability-report.json',
            ),
            {},
        );

        await expect(
            discoverMultiSessionInputs(root),
        ).rejects.toThrow(
            /failed to read\/parse md5-report\.json.*session-bad-research-json/i,
        );
    });

    test('fails closed with context when stability report JSON is malformed', async () => {
        const dir =
            await createSession('session-bad-stability-json');

        await writeJson(
            path.join(dir, 'md5-report.json'),
            {},
        );

        await fs.writeFile(
            path.join(
                dir,
                'md5-stability-report.json',
            ),
            '{ definitely-not-valid-json !!!',
            'utf8',
        );

        await expect(
            discoverMultiSessionInputs(root),
        ).rejects.toThrow(
            /failed to read\/parse md5-stability-report\.json.*session-bad-stability-json/i,
        );
    });
});