import {
    spotMicrostructureRuntimeRegistry,
    SpotMicrostructureEntryGate,
} from './marketData/spotMicrostructureRuntimeService';
import {
    binanceRestOperationalState,
    BinanceRestOperationalStatePort,
} from './binanceRestOperationalState';

export interface SpotLiveEntryGateDependencies {
    microstructure: {
        getEntryGate(
            rawSymbol: string,
            now?: number,
        ): SpotMicrostructureEntryGate;
    };

    binanceRest: BinanceRestOperationalStatePort;
}

const defaultDependencies: SpotLiveEntryGateDependencies = {
    microstructure: spotMicrostructureRuntimeRegistry,
    binanceRest: binanceRestOperationalState,
};

/**
 * Canonical Spot live-entry permission composer.
 *
 * A symbol is eligible for NEW entry only when BOTH are true:
 * 1. Binance REST operational health is fresh and healthy.
 * 2. The existing symbol-scoped microstructure gate allows entry.
 *
 * This service does not gate exits. Existing LONG positions must continue to
 * attempt risk/reconciliation/exit actions when connectivity becomes available.
 */
export class SpotLiveEntryGateService {
    constructor(
        private readonly dependencies: SpotLiveEntryGateDependencies =
            defaultDependencies,
    ) {}

    getEntryGate(
        rawSymbol: string,
        now = Date.now(),
    ): SpotMicrostructureEntryGate {
        const microstructure =
            this.dependencies.microstructure.getEntryGate(
                rawSymbol,
                now,
            );

        const restGate =
            this.dependencies.binanceRest.getEntryGate(
                now,
                this.getRestHealthyTtlMs(),
            );

        return {
            symbol: microstructure.symbol,
            allowed:
                restGate.allowed &&
                microstructure.allowed,
            blockers: [
                ...restGate.blockers,
                ...microstructure.blockers,
            ],
            quality: microstructure.quality,
        };
    }

    private getRestHealthyTtlMs(): number {
        const raw = Number(
            process.env
                .BINANCE_REST_ENTRY_HEALTH_TTL_MS ??
                '60000',
        );

        return Number.isFinite(raw) && raw >= 5_000
            ? raw
            : 60_000;
    }
}

export const spotLiveEntryGateService =
    new SpotLiveEntryGateService();
