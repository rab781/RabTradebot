import { binanceOrderService } from './binanceOrderService';
import { connectionManager } from './connectionManager';
import { db } from './databaseService';
import { healthMonitor } from './healthMonitor';
import { realTradingEngine } from './realTradingEngine';
import { riskMonitorLoop } from './riskMonitorLoop';
import { spotMicrostructureRuntimeRegistry } from './marketData/spotMicrostructureRuntimeService';
import type { SpotMicrostructureEntryGate, SpotMicrostructureRuntimeStatus } from './marketData/spotMicrostructureRuntimeService';

type ConnectionStatus = ReturnType<typeof connectionManager.getStatus>;
type HealthSnapshot = ReturnType<typeof healthMonitor.getSnapshot>;

export type CoreExecutionGate = 'READY' | 'BLOCKED';
export type WebControlMode = 'READ_ONLY';

export interface TradingApplicationStatus {
    generatedAt: string;

    venue: 'BINANCE';
    product: 'SPOT';
    positionMode: 'LONG_FLAT';

    execution: {
        binanceConfigured: boolean;
        startupRecoveryReady: boolean;
        coreExecutionGate: CoreExecutionGate;
        blockers: string[];
    };

    risk: {
        monitorActive: boolean;
    };

    transport: {
        webSocket: ConnectionStatus;
    };

    health: HealthSnapshot;

    web: {
        controlMode: WebControlMode;
        mutableControlsEnabled: false;

        /**
         * The canonical permission is now exposed per symbol from the
         * same Spot microstructure runtime used by live-entry gating.
         *
         * This flag means "Web can read the canonical gate"; it is NOT
         * itself a global permission to trade.
         */
        newEntryPermissionExposed: true;
    };
}

export type LiveExposurePosition = 'LONG' | 'INVALID';
export type LiveReconciliationKind =
    | 'NONE'
    | 'ENTRY_PENDING'
    | 'EXIT_PENDING';

export interface LiveExposureView {
    tradeId: string;
    userId: number;
    symbol: string;
    position: LiveExposurePosition;
    quantity: number;
    entryPrice: number;
    status: string;
    reconciliation: LiveReconciliationKind;
}

export interface PendingReconciliationView {
    tradeId: string;
    userId: number;
    symbol: string;
    status: string;
    quantity: number;
    orderId: number | null;
    metadataValid: boolean;
}

export interface SpotMicrostructureRuntimeView {
    symbol: string;
    available: boolean;
    runtimeState: string;
    marketStatus: string | null;
    depthStatus: string | null;
    featureHealthy: boolean | null;
    qualityReasons: string[];

    newEntry: {
        allowed: boolean;
        blockers: string[];
    };
}

export interface TradingReadState {
    generatedAt: string;
    product: 'SPOT';
    positionMode: 'LONG_FLAT';

    exposure: {
        state: 'FLAT' | 'LONG' | 'INVALID';
        count: number;
        invalidCount: number;
        positions: LiveExposureView[];
    };

    reconciliation: {
        state: 'READY' | 'PENDING';
        pendingCount: number;
        pendingOrders: PendingReconciliationView[];
    };

    microstructure: {
        activeSymbols: string[];
        runtimes: SpotMicrostructureRuntimeView[];
    };

    /**
     * New-entry permission is intentionally not collapsed into one
     * global boolean because the canonical gate is symbol-scoped.
     */
    newEntryPermission: {
        exposed: true;
        allowed: null;
        reason: 'PER_SYMBOL_MICROSTRUCTURE_GATE';
    };
}

export interface TradingApplicationDependencies {
    orderService: {
        isConfigured(): boolean;
    };

    executionEngine: {
        isStartupRecoveryReady(): boolean;
    };

    riskMonitor: {
        isActive(): boolean;
    };

    connection: {
        getStatus(): ConnectionStatus;
    };

    health: {
        getSnapshot(): HealthSnapshot;
    };

    database: {
        getOpenLiveTrades(
            userId?: number,
            symbol?: string,
        ): Promise<any[]>;

        getPendingLiveTrades(): Promise<any[]>;
    };

    microstructure: {
        getActiveSymbols(): string[];

        getEntryGate(
            symbol: string,
            now?: number,
        ): SpotMicrostructureEntryGate;

        getStatus(
            symbol: string,
            now?: number,
        ): SpotMicrostructureRuntimeStatus | undefined;
    };
}

const defaultDependencies: TradingApplicationDependencies = {
    orderService: binanceOrderService,
    executionEngine: realTradingEngine,
    riskMonitor: riskMonitorLoop,
    connection: connectionManager,
    health: healthMonitor,
    database: db,
    microstructure:
        spotMicrostructureRuntimeRegistry,
};

export class TradingApplicationService {
    constructor(
        private readonly dependencies: TradingApplicationDependencies = defaultDependencies,
    ) {}

    getStatus(): TradingApplicationStatus {
        const binanceConfigured = this.dependencies.orderService.isConfigured();
        const startupRecoveryReady =
            this.dependencies.executionEngine.isStartupRecoveryReady();

        const blockers: string[] = [];

        if (!binanceConfigured) {
            blockers.push('BINANCE_NOT_CONFIGURED');
        }

        if (!startupRecoveryReady) {
            blockers.push('STARTUP_RECOVERY_PENDING');
        }

        return {
            generatedAt: new Date().toISOString(),

            venue: 'BINANCE',
            product: 'SPOT',
            positionMode: 'LONG_FLAT',

            execution: {
                binanceConfigured,
                startupRecoveryReady,
                coreExecutionGate:
                    blockers.length === 0 ? 'READY' : 'BLOCKED',
                blockers,
            },

            risk: {
                monitorActive: this.dependencies.riskMonitor.isActive(),
            },

            transport: {
                webSocket: this.dependencies.connection.getStatus(),
            },

            health: this.dependencies.health.getSnapshot(),

            web: {
                controlMode: 'READ_ONLY',
                mutableControlsEnabled: false,
                newEntryPermissionExposed: true,
            },
        };
    }

    async getTradingState(): Promise<TradingReadState> {
        const [openTrades, pendingTrades] = await Promise.all([
            this.dependencies.database.getOpenLiveTrades(),
            this.dependencies.database.getPendingLiveTrades(),
        ]);

        const positions = openTrades.map((trade) =>
            this.toExposureView(trade),
        );

        const invalidCount = positions.filter(
            (position) => position.position === 'INVALID',
        ).length;

        const exposureState: TradingReadState['exposure']['state'] =
            invalidCount > 0
                ? 'INVALID'
                : positions.length > 0
                    ? 'LONG'
                    : 'FLAT';

        const pendingOrders = pendingTrades.map((trade) =>
            this.toPendingView(trade),
        );

        const activeMicrostructureSymbols =
            this.dependencies.microstructure
                .getActiveSymbols();

        const microstructureRuntimes =
            activeMicrostructureSymbols.map(
                (symbol) =>
                    this.getMicrostructureState(
                        symbol,
                    ),
            );

        return {
            generatedAt: new Date().toISOString(),
            product: 'SPOT',
            positionMode: 'LONG_FLAT',

            exposure: {
                state: exposureState,
                count: positions.length,
                invalidCount,
                positions,
            },

            reconciliation: {
                state:
                    pendingOrders.length > 0
                        ? 'PENDING'
                        : 'READY',
                pendingCount: pendingOrders.length,
                pendingOrders,
            },

            microstructure: {
                activeSymbols:
                    activeMicrostructureSymbols,
                runtimes:
                    microstructureRuntimes,
            },

            newEntryPermission: {
                exposed: true,
                allowed: null,
                reason:
                    'PER_SYMBOL_MICROSTRUCTURE_GATE',
            },
        };
    }

    getMicrostructureState(
        rawSymbol: string,
    ): SpotMicrostructureRuntimeView {
        const gate =
            this.dependencies.microstructure
                .getEntryGate(rawSymbol);

        const status =
            this.dependencies.microstructure
                .getStatus(gate.symbol);

        return this.toMicrostructureView(
            gate,
            status,
        );
    }

    private toMicrostructureView(
        gate: SpotMicrostructureEntryGate,
        status:
            | SpotMicrostructureRuntimeStatus
            | undefined,
    ): SpotMicrostructureRuntimeView {
        return {
            symbol: gate.symbol,
            available: status !== undefined,
            runtimeState:
                status?.state ??
                'NOT_STARTED',
            marketStatus:
                status?.market?.status ??
                null,
            depthStatus:
                status?.depth?.status ??
                null,
            featureHealthy:
                status?.quality?.healthy ??
                null,
            qualityReasons:
                status?.quality?.reasons
                    ? [
                        ...status
                            .quality
                            .reasons,
                    ]
                    : [],

            // Do not recompute health thresholds here.
            // This is the exact canonical gate used by live entry.
            newEntry: {
                allowed: gate.allowed,
                blockers: [
                    ...gate.blockers,
                ],
            },
        };
    }

    private toExposureView(trade: any): LiveExposureView {
        return {
            tradeId: String(trade.id),
            userId: Number(trade.userId),
            symbol: String(trade.symbol).toUpperCase(),
            position: this.resolvePersistedPosition(trade.side),
            quantity: this.finiteNumberOrZero(trade.quantity),
            entryPrice: this.finiteNumberOrZero(trade.entryPrice),
            status: String(trade.status),
            reconciliation:
                this.resolveReconciliationKind(trade.status),
        };
    }

    private toPendingView(
        trade: any,
    ): PendingReconciliationView {
        const parsed = this.parseMetadata(trade.tags);

        const orderKey =
            trade.status ===
            'LIVE_ENTRY_PENDING_RECONCILIATION'
                ? 'entryOrderId'
                : 'exitOrderId';

        const rawOrderId =
            parsed.metadata?.[orderKey];

        const numericOrderId = Number(rawOrderId);

        return {
            tradeId: String(trade.id),
            userId: Number(trade.userId),
            symbol: String(trade.symbol).toUpperCase(),
            status: String(trade.status),
            quantity: this.finiteNumberOrZero(
                trade.quantity,
            ),
            orderId:
                parsed.valid &&
                Number.isFinite(numericOrderId) &&
                numericOrderId > 0
                    ? numericOrderId
                    : null,
            metadataValid: parsed.valid,
        };
    }

    private resolvePersistedPosition(
        rawSide: unknown,
    ): LiveExposurePosition {
        const side = String(rawSide).toUpperCase();

        if (side === 'BUY' || side === 'LONG') {
            return 'LONG';
        }

        // Never reinterpret SELL/SHORT or malformed legacy state
        // as a valid Spot position.
        return 'INVALID';
    }

    private resolveReconciliationKind(
        rawStatus: unknown,
    ): LiveReconciliationKind {
        const status = String(rawStatus);

        if (
            status ===
            'LIVE_ENTRY_PENDING_RECONCILIATION'
        ) {
            return 'ENTRY_PENDING';
        }

        if (
            status ===
            'LIVE_EXIT_PENDING_RECONCILIATION'
        ) {
            return 'EXIT_PENDING';
        }

        return 'NONE';
    }

    private parseMetadata(raw: unknown): {
        valid: boolean;
        metadata: Record<string, unknown> | null;
    } {
        if (raw === null || raw === undefined || raw === '') {
            return {
                valid: true,
                metadata: {},
            };
        }

        if (typeof raw !== 'string') {
            return {
                valid: false,
                metadata: null,
            };
        }

        try {
            const parsed = JSON.parse(raw);

            if (
                !parsed ||
                typeof parsed !== 'object' ||
                Array.isArray(parsed)
            ) {
                return {
                    valid: false,
                    metadata: null,
                };
            }

            return {
                valid: true,
                metadata:
                    parsed as Record<string, unknown>,
            };
        } catch {
            return {
                valid: false,
                metadata: null,
            };
        }
    }

    private finiteNumberOrZero(raw: unknown): number {
        const value = Number(raw);
        return Number.isFinite(value) ? value : 0;
    }
}

export const tradingApplicationService = new TradingApplicationService();
