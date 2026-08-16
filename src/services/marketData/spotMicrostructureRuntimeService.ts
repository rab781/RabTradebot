import { BinanceSpotDepthRestClient } from './binanceSpotDepthRestClient';
import { BinanceSpotDepthWebSocketClient } from './binanceSpotDepthWebSocketClient';
import { BinanceSpotRestMarketDataClient } from './binanceSpotRestMarketDataClient';
import { BinanceSpotWebSocketClient } from './binanceSpotWebSocketClient';
import { SpotDepthOrderBookEngine } from './spotDepthOrderBookEngine';
import type { SpotDepthHealth } from './spotDepthTypes';
import { SpotMarketDataEngine } from './spotMarketDataEngine';
import type { SpotMarketDataHealth } from './spotMarketDataTypes';
import { SpotMicrostructureFeatureEngine } from './spotMicrostructureFeatureEngine';
import type {
    SpotMicrostructureQuality,
    SpotMicrostructureSnapshot,
} from './spotMicrostructureTypes';

export type SpotMicrostructureRuntimeState =
    | 'STOPPED'
    | 'STARTING'
    | 'RUNNING'
    | 'ERROR';

export interface SpotMicrostructureEntryGate {
    symbol: string;
    allowed: boolean;
    blockers: string[];
    quality?: SpotMicrostructureQuality;
}

export interface SpotMicrostructureRuntimeStatus {
    symbol: string;
    state: SpotMicrostructureRuntimeState;
    market: SpotMarketDataHealth;
    depth: SpotDepthHealth;
    quality?: SpotMicrostructureQuality;
    entryGate: SpotMicrostructureEntryGate;
    lastError?: string;
}

export interface SpotMicrostructureRuntimeComponents {
    market: {
        start(): Promise<void>;
        stop(): Promise<void>;
        getHealth(): SpotMarketDataHealth;
    };

    depth: {
        start(): Promise<void>;
        stop(): Promise<void>;
        getHealth(): SpotDepthHealth;
    };

    features: {
        start(): void;
        stop(): void;
        getSnapshot(now?: number): SpotMicrostructureSnapshot;
    };
}

export interface SpotMicrostructureRuntimePort {
    start(): Promise<void>;
    stop(): Promise<void>;
    getEntryGate(now?: number): SpotMicrostructureEntryGate;
    getStatus(now?: number): SpotMicrostructureRuntimeStatus;
}

export class SpotMicrostructureRuntimeService
implements SpotMicrostructureRuntimePort {
    private state: SpotMicrostructureRuntimeState = 'STOPPED';
    private lastError?: string;
    private startPromise?: Promise<void>;

    constructor(
        private readonly symbol: string,
        private readonly components: SpotMicrostructureRuntimeComponents,
    ) {}

    async start(): Promise<void> {
        if (this.state === 'RUNNING') {
            return;
        }

        if (this.startPromise) {
            return this.startPromise;
        }

        this.startPromise = this.startInternal();

        try {
            await this.startPromise;
        } finally {
            this.startPromise = undefined;
        }
    }

    async stop(): Promise<void> {
        this.components.features.stop();

        await Promise.allSettled([
            this.components.market.stop(),
            this.components.depth.stop(),
        ]);

        this.state = 'STOPPED';
    }

    getEntryGate(now = Date.now()): SpotMicrostructureEntryGate {
        const symbol = this.symbol.toUpperCase();

        if (this.state !== 'RUNNING') {
            return {
                symbol,
                allowed: false,
                blockers: [
                    `MICROSTRUCTURE_RUNTIME_${this.state}`,
                ],
            };
        }

        try {
            const quality =
                this.components.features.getSnapshot(now).quality;

            return {
                symbol,
                allowed: quality.healthy,
                blockers: quality.healthy
                    ? []
                    : quality.reasons.map(
                        (reason) =>
                            `MICROSTRUCTURE_${reason}`,
                    ),
                quality,
            };
        } catch {
            return {
                symbol,
                allowed: false,
                blockers: [
                    'MICROSTRUCTURE_SNAPSHOT_UNAVAILABLE',
                ],
            };
        }
    }

    getStatus(now = Date.now()): SpotMicrostructureRuntimeStatus {
        const entryGate = this.getEntryGate(now);

        return {
            symbol: this.symbol.toUpperCase(),
            state: this.state,
            market: this.components.market.getHealth(),
            depth: this.components.depth.getHealth(),
            quality: entryGate.quality,
            entryGate,
            lastError: this.lastError,
        };
    }

    private async startInternal(): Promise<void> {
        this.state = 'STARTING';
        this.lastError = undefined;

        try {
            await Promise.all([
                this.components.market.start(),
                this.components.depth.start(),
            ]);

            this.components.features.start();
            this.state = 'RUNNING';
        } catch (error) {
            this.lastError =
                error instanceof Error
                    ? error.message
                    : String(error);

            this.components.features.stop();

            await Promise.allSettled([
                this.components.market.stop(),
                this.components.depth.stop(),
            ]);

            this.state = 'ERROR';
            throw error;
        }
    }
}

export interface SpotMicrostructureRuntimeRegistryOptions {
    maxSymbols?: number;
    factory?: (
        symbol: string,
    ) => SpotMicrostructureRuntimePort;
}

interface RuntimeRegistryEntry {
    runtime: SpotMicrostructureRuntimePort;
    references: number;
}

export class SpotMicrostructureRuntimeRegistry {
    private readonly entries =
        new Map<string, RuntimeRegistryEntry>();

    private readonly maxSymbols: number;
    private readonly factory: (
        symbol: string,
    ) => SpotMicrostructureRuntimePort;

    constructor(
        options: SpotMicrostructureRuntimeRegistryOptions = {},
    ) {
        const envMax = Number(
            process.env
                .SPOT_MICROSTRUCTURE_MAX_LIVE_SYMBOLS ??
                '5',
        );

        this.maxSymbols =
            options.maxSymbols ??
            (
                Number.isInteger(envMax) &&
                envMax > 0
                    ? envMax
                    : 5
            );

        this.factory =
            options.factory ??
            createDefaultSpotMicrostructureRuntime;
    }

    async acquire(
        rawSymbol: string,
    ): Promise<SpotMicrostructureRuntimeStatus> {
        const symbol = this.normalizeSymbol(rawSymbol);

        let entry = this.entries.get(symbol);

        if (!entry) {
            if (this.entries.size >= this.maxSymbols) {
                throw new Error(
                    `Spot microstructure runtime limit reached (${this.maxSymbols}).`,
                );
            }

            entry = {
                runtime: this.factory(symbol),
                references: 0,
            };

            this.entries.set(symbol, entry);
        }

        entry.references += 1;

        try {
            await entry.runtime.start();
            return entry.runtime.getStatus();
        } catch (error) {
            entry.references = Math.max(
                0,
                entry.references - 1,
            );

            if (entry.references === 0) {
                this.entries.delete(symbol);
            }

            throw error;
        }
    }

    async acquireHealthy(
        rawSymbol: string,
    ): Promise<SpotMicrostructureRuntimeStatus> {
        const symbol = this.normalizeSymbol(rawSymbol);

        await this.acquire(symbol);

        const gate = this.getEntryGate(symbol);

        if (!gate.allowed) {
            this.release(symbol);

            throw new Error(
                `Canonical Spot microstructure gate blocked ${symbol}: ${gate.blockers.join(', ')}`,
            );
        }

        const status = this.getStatus(symbol);

        if (!status) {
            this.release(symbol);

            throw new Error(
                `Canonical Spot microstructure runtime disappeared for ${symbol}.`,
            );
        }

        return status;
    }

    release(rawSymbol: string): void {
        const symbol = this.normalizeSymbol(rawSymbol);
        const entry = this.entries.get(symbol);

        if (!entry) {
            return;
        }

        entry.references = Math.max(
            0,
            entry.references - 1,
        );

        if (entry.references > 0) {
            return;
        }

        this.entries.delete(symbol);

        void entry.runtime.stop().catch(() => {
            // Runtime is detached already.
            // A later acquire creates a fresh fail-closed runtime.
        });
    }

    getEntryGate(
        rawSymbol: string,
        now = Date.now(),
    ): SpotMicrostructureEntryGate {
        const symbol = this.normalizeSymbol(rawSymbol);
        const entry = this.entries.get(symbol);

        if (!entry) {
            return {
                symbol,
                allowed: false,
                blockers: [
                    'MICROSTRUCTURE_RUNTIME_NOT_STARTED',
                ],
            };
        }

        return entry.runtime.getEntryGate(now);
    }

    getStatus(
        rawSymbol: string,
        now = Date.now(),
    ): SpotMicrostructureRuntimeStatus | undefined {
        const symbol = this.normalizeSymbol(rawSymbol);
        return this.entries.get(symbol)?.runtime.getStatus(now);
    }

    getReferenceCount(rawSymbol: string): number {
        const symbol = this.normalizeSymbol(rawSymbol);
        return this.entries.get(symbol)?.references ?? 0;
    }

    getActiveSymbols(): string[] {
        return Array.from(this.entries.keys()).sort();
    }

    private normalizeSymbol(rawSymbol: string): string {
        const symbol = String(rawSymbol)
            .trim()
            .toUpperCase();

        if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
            throw new Error(
                `Invalid Spot microstructure symbol: ${rawSymbol}`,
            );
        }

        return symbol;
    }
}

function createDefaultSpotMicrostructureRuntime(
    symbol: string,
): SpotMicrostructureRuntimePort {
    const market = new SpotMarketDataEngine(
        new BinanceSpotRestMarketDataClient(),
        new BinanceSpotWebSocketClient(),
        {
            symbol,
            interval: '1m',
            candleBootstrapLimit: 100,
            aggregateTradeBootstrapLimit: 1000,
        },
    );

    const depth = new SpotDepthOrderBookEngine(
        new BinanceSpotDepthRestClient(),
        new BinanceSpotDepthWebSocketClient(),
        {
            symbol,
            outputLevels: 20,
        },
    );

    const features =
        new SpotMicrostructureFeatureEngine(
            market,
            depth,
            {
                symbol,
            },
        );

    return new SpotMicrostructureRuntimeService(
        symbol,
        {
            market,
            depth,
            features,
        },
    );
}

export const spotMicrostructureRuntimeRegistry =
    new SpotMicrostructureRuntimeRegistry();
