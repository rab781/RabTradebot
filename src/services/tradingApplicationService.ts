import { binanceOrderService } from './binanceOrderService';
import { connectionManager } from './connectionManager';
import { healthMonitor } from './healthMonitor';
import { realTradingEngine } from './realTradingEngine';
import { riskMonitorLoop } from './riskMonitorLoop';

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
         * Intentionally false until canonical live market/feature quality
         * is wired into this shared application layer.
         *
         * coreExecutionGate === READY must NOT be interpreted as
         * NEW ENTRY ALLOWED.
         */
        newEntryPermissionExposed: false;
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
}

const defaultDependencies: TradingApplicationDependencies = {
    orderService: binanceOrderService,
    executionEngine: realTradingEngine,
    riskMonitor: riskMonitorLoop,
    connection: connectionManager,
    health: healthMonitor,
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
                newEntryPermissionExposed: false,
            },
        };
    }
}

export const tradingApplicationService = new TradingApplicationService();
