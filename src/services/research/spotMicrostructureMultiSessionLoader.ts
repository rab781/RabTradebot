import { promises as fs } from 'fs';
import path from 'path';

import {
    MultiSessionAnalysisInput,
} from './spotMicrostructureMultiSessionAnalyzer';

import {
    SpotMicrostructureResearchReport,
} from './spotMicrostructureResearchAnalyzer';

import {
    StabilityResearchReport,
} from './spotMicrostructureStabilityAnalyzer';

async function fileExists(file: string): Promise<boolean> {
    try {
        await fs.access(file);
        return true;
    } catch {
        return false;
    }
}

export async function readMultiSessionJson<T>(
    file: string,
    sessionId: string,
): Promise<T> {
    try {
        const raw = await fs.readFile(file, 'utf8');
        return JSON.parse(raw) as T;
    } catch (error) {
        const message = error instanceof Error
            ? error.message
            : String(error);

        throw new Error(
            `Failed to read/parse ${path.basename(file)} ` +
            `for session ${sessionId}: ${message}`,
        );
    }
}

export async function discoverMultiSessionInputs(
    root: string,
): Promise<MultiSessionAnalysisInput[]> {
    const entries = await fs.readdir(root, { withFileTypes: true });

    const sessions: MultiSessionAnalysisInput[] = [];

    const directories = entries
        .filter((item) => item.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of directories) {
        const dir = path.join(root, entry.name);

        const researchFile = path.join(
            dir,
            'md5-report.json',
        );

        const stabilityFile = path.join(
            dir,
            'md5-stability-report.json',
        );

        const [hasResearch, hasStability] = await Promise.all([
            fileExists(researchFile),
            fileExists(stabilityFile),
        ]);

        // Folder capture yang sama sekali belum dianalisis boleh dilewati.
        if (!hasResearch && !hasStability) {
            continue;
        }

        // Tapi partial analysis harus FAIL CLOSED.
        if (!hasResearch || !hasStability) {
            throw new Error(
                `Session ${entry.name} has incomplete analysis reports: ` +
                `md5-report.json=${hasResearch ? 'present' : 'missing'}, ` +
                `md5-stability-report.json=${hasStability ? 'present' : 'missing'}.`,
            );
        }

        const [research, stability] = await Promise.all([
            readMultiSessionJson<SpotMicrostructureResearchReport>(
                researchFile,
                entry.name,
            ),
            readMultiSessionJson<StabilityResearchReport>(
                stabilityFile,
                entry.name,
            ),
        ]);

        sessions.push({
            sessionId: entry.name,
            research,
            stability,
        });
    }

    return sessions;
}