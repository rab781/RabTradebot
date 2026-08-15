import path from 'path';

import {
    SpotMicrostructureResearchReport,
} from '../src/services/research/spotMicrostructureResearchAnalyzer';

import {
    StabilityResearchReport,
} from '../src/services/research/spotMicrostructureStabilityAnalyzer';

import {
    readMultiSessionJson,
} from '../src/services/research/spotMicrostructureMultiSessionLoader';

import {
    summarizeSpotMicrostructureSession,
} from '../src/services/research/spotMicrostructureSessionSummary';

function arg(
    name: string,
): string | undefined {
    const prefix = `--${name}=`;

    const found = process.argv.find(
        (value) =>
            value.startsWith(prefix),
    );

    return found
        ? found.slice(prefix.length)
        : undefined;
}

function status(
    value: boolean,
): string {
    return value
        ? 'PASS'
        : 'FAIL';
}

async function main(): Promise<void> {
    const rawInput = arg('input');

    if (!rawInput) {
        throw new Error(
            'Missing required --input=<session-directory>',
        );
    }

    const inputDir =
        path.resolve(rawInput);

    const sessionId =
        path.basename(inputDir);

    const researchFile =
        path.join(
            inputDir,
            'md5-report.json',
        );

    const stabilityFile =
        path.join(
            inputDir,
            'md5-stability-report.json',
        );

    const [research, stability] =
        await Promise.all([
            readMultiSessionJson<SpotMicrostructureResearchReport>(
                researchFile,
                sessionId,
            ),

            readMultiSessionJson<StabilityResearchReport>(
                stabilityFile,
                sessionId,
            ),
        ]);

    const summary =
        summarizeSpotMicrostructureSession({
            sessionId,
            research,
            stability,
        });

    console.log(
        '\nBTCUSDT MICROSTRUCTURE SESSION SUMMARY',
    );

    console.log(
        '=====================================\n',
    );

    console.log(`Session : ${summary.sessionId}`);
    console.log(`Symbol  : ${summary.symbol}`);
    console.log(
        `Dataset : ${summary.datasetVersion}`,
    );
    console.log(
        `Schema  : ${summary.schemaVersion}`,
    );
    console.log(
        `Features: ${summary.featureCount}`,
    );

    console.log('\nSTRUCTURAL QA');

    console.table({
        featureRecords:
            summary.structural.featureRecords,

        outcomeRecords:
            summary.structural.outcomeRecords,

        healthyFeaturePct:
            Number(
                summary.structural
                    .healthyFeaturePct
                    .toFixed(3),
            ),

        duplicateFeatureIds:
            summary.structural
                .duplicateFeatureIds,

        duplicateOutcomeKeys:
            summary.structural
                .duplicateOutcomeKeys,

        orphanOutcomes:
            summary.structural.orphanOutcomes,

        featureDimensionMismatches:
            summary.structural
                .featureDimensionMismatches,

        nonFiniteFeatureRows:
            summary.structural
                .nonFiniteFeatureRows,

        featureNameMismatches:
            summary.structural
                .featureNameMismatches,
    });

    console.log(
        `STRUCTURAL STATUS: ${
            status(summary.structural.pass)
        }`,
    );

    console.log('\nTIMING QA');

    console.table({
        expectedSlots:
            summary.timing.expectedSlots,

        observedSlots:
            summary.timing.observedSlots,

        missingSlots:
            summary.timing.missingSlots,

        duplicateSlots:
            summary.timing.duplicateSlots,

        cadenceCoveragePct:
            Number(
                summary.timing
                    .cadenceCoveragePct
                    .toFixed(3),
            ),

        gridErrorP95Ms:
            Number(
                summary.timing
                    .gridErrorP95Ms
                    .toFixed(3),
            ),

        gridPhasesMs:
            summary.timing
                .gridPhasesMs.join(','),

        gridPhaseChanges:
            summary.timing.gridPhaseChanges,

        continuityBreaks:
            summary.timing.continuityBreaks,
    });

    console.log(
        `TIMING STATUS: ${
            status(summary.timing.pass)
        }`,
    );

    console.log('\nHORIZONS');

    console.table(
        summary.horizons.map(
            (horizon) => ({
                horizon:
                    `${horizon.horizonMs / 1000}s`,

                researchReady:
                    status(
                        horizon.researchReady,
                    ),

                independent:
                    status(
                        horizon
                            .independentWindowGate,
                    ),

                stability:
                    status(
                        horizon.stabilityGate,
                    ),

                independentWindows:
                    horizon
                        .approximateIndependentWindows,

                overall:
                    status(horizon.pass),
            }),
        ),
    );

    console.log(
        `\nCROSS-SESSION USABLE: ${
            status(summary.crossSessionUsable)
        }`,
    );

    console.log(
        `ALL HORIZONS: ${
            status(summary.allHorizonsPass)
        }`,
    );

    console.log('\nFINAL SESSION STATUS');

    console.log(
        summary.sessionAccepted
            ? 'ACCEPT'
            : 'REJECT',
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});