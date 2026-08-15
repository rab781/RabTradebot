import { promises as fs } from 'fs';
import path from 'path';

import {
    SpotMicrostructureMultiSessionAnalyzer,
} from '../src/services/research/spotMicrostructureMultiSessionAnalyzer';

import {
    discoverMultiSessionInputs,
} from '../src/services/research/spotMicrostructureMultiSessionLoader';

function arg(name: string, fallback?: string): string | undefined {
    const prefix = `--${name}=`;
    const found = process.argv.find(
        (value: string) => value.startsWith(prefix),
    );

    return found
        ? found.slice(prefix.length)
        : fallback;
}

function numberArg(name: string, fallback: number): number {
    const raw = arg(name);

    if (raw === undefined) {
        return fallback;
    }

    const value = Number(raw);

    if (!Number.isFinite(value) || value < 1) {
        throw new Error(
            `Invalid --${name}: ${raw}`,
        );
    }

    return Math.floor(value);
}

async function main(): Promise<void> {
    const root = path.resolve(
        arg(
            'root',
            'data/research/multisession',
        )!,
    );

    const output = path.resolve(
        arg(
            'output',
            path.join(
                root,
                'multisession-report.json',
            ),
        )!,
    );

    const top = numberArg('top', 15);

    /*
     * Discovery sekarang dilakukan oleh dedicated loader.
     *
     * Semantics:
     * - directory tanpa kedua analysis report => skip
     * - hanya salah satu report ada => fail closed
     * - malformed JSON => fail closed
     * - kedua report valid => load
     */
    const inputs = await discoverMultiSessionInputs(root);

    console.log(
        `Discovered ${inputs.length} analyzed sessions:`,
    );

    for (const input of inputs) {
        console.log(`  - ${input.sessionId}`);
    }

    if (inputs.length < 2) {
        throw new Error(
            `Need at least two analyzed session directories under ${root}. ` +
            `Found ${inputs.length}.`,
        );
    }

    const report =
        new SpotMicrostructureMultiSessionAnalyzer()
            .analyze(inputs);

    await fs.writeFile(
        output,
        `${JSON.stringify(report, null, 2)}\n`,
        'utf8',
    );

    console.log(
        `Multi-session microstructure validation — ${report.symbol}`,
    );

    console.log(`root=${root}`);
    console.log(`report=${output}`);

    console.log(
        `dataset=${report.datasetVersion}; ` +
        `schema=${report.schemaVersion}; ` +
        `features=${report.featureCount}`,
    );

    console.table(
        report.sessions.map((session) => ({
            session: session.sessionId,
            features: session.featureRecords,
            outcomes: session.outcomeRecords,
            qa: session.structuralQaPass
                ? 'PASS'
                : 'FAIL',
            timing: session.timingQaPass
                ? 'PASS'
                : 'FAIL',
            coverage: Number(
                session.cadenceCoveragePct.toFixed(2),
            ),
            gridP95: Number(
                session.gridErrorP95Ms.toFixed(2),
            ),
            phases: session.gridPhasesMs.join(','),
            phaseChanges: session.gridPhaseChanges,
            usable:
                session.usableForCrossSessionEvidence,
        })),
    );

    for (const horizon of report.horizons) {
        console.log(
            `\nHorizon ${horizon.horizonMs}ms`,
        );

        console.log({
            sessionsTotal:
                horizon.sessionsTotal,

            sessionsUsable:
                horizon.sessionsUsable,

            sessionsRankingEnabled:
                horizon.sessionsRankingEnabled,

            sessionsResearchReady:
                horizon.sessionsResearchReady,

            sessionsStabilityGate:
                horizon.sessionsStabilityGate,

            medianEligibleOutcomes:
                horizon.medianEligibleOutcomes,

            medianIndependentWindows:
                horizon.medianIndependentWindows,
        });

        const comparable = horizon.features
            .filter(
                (feature) =>
                    feature.sessionsWithResearchMetric > 0,
            )
            .sort((left, right) => {
                if (
                    right.sessionsWithResearchMetric !==
                    left.sessionsWithResearchMetric
                ) {
                    return (
                        right.sessionsWithResearchMetric -
                        left.sessionsWithResearchMetric
                    );
                }

                if (
                    right.spearmanSignConsistency !==
                    left.spearmanSignConsistency
                ) {
                    return (
                        right.spearmanSignConsistency -
                        left.spearmanSignConsistency
                    );
                }

                return (
                    right.medianAbsSpearman -
                    left.medianAbsSpearman
                );
            })
            .slice(0, top);

        console.table(
            comparable.map((feature) => ({
                feature:
                    feature.featureName,

                sessions:
                    feature.sessionsWithResearchMetric,

                ready:
                    feature.researchReadySessions,

                stable:
                    feature.stabilityGateSessions,

                sign: Number(
                    feature.spearmanSignConsistency
                        .toFixed(3),
                ),

                medianRho: Number(
                    feature.medianSpearman
                        .toFixed(4),
                ),

                medianAbsRho: Number(
                    feature.medianAbsSpearman
                        .toFixed(4),
                ),

                qSign: Number(
                    feature.qSpreadSignConsistency
                        .toFixed(3),
                ),

                medianQSpread: Number(
                    feature.medianQSpreadBps
                        .toFixed(4),
                ),

                medianStability: Number(
                    feature.medianStabilityScore
                        .toFixed(4),
                ),
            })),
        );
    }

    console.log(
        '\nNote: this is cross-session research evidence only; ' +
        'it does not prune features or claim production edge.',
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});