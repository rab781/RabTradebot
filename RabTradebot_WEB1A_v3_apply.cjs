const fs = require('fs');
const path = require('path');

const CHECK_ONLY = process.argv.includes('--check');
const root = process.cwd();

const webServerPath = path.join(root, 'src', 'webServer.ts');
const servicePath = path.join(root, 'src', 'services', 'tradingApplicationService.ts');
const testPath = path.join(root, 'tests', 'tradingApplicationService.web1.test.ts');

function fail(message) {
  throw new Error(`[WEB1-A v3] ${message}`);
}

function readUtf8(file) {
  if (!fs.existsSync(file)) {
    fail(`Required file not found: ${path.relative(root, file)}`);
  }
  return fs.readFileSync(file, 'utf8');
}

function normalize(text) {
  return text.replace(/\r\n/g, '\n');
}

function restoreEol(original, normalized) {
  return original.includes('\r\n')
    ? normalized.replace(/\n/g, '\r\n')
    : normalized;
}

const serviceSource = `import { binanceOrderService } from './binanceOrderService';
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
`;

const testSource = `import {
    TradingApplicationDependencies,
    TradingApplicationService,
} from '../src/services/tradingApplicationService';

function makeDependencies(
    overrides: Partial<TradingApplicationDependencies> = {},
): TradingApplicationDependencies {
    return {
        orderService: {
            isConfigured: () => true,
        },

        executionEngine: {
            isStartupRecoveryReady: () => true,
        },

        riskMonitor: {
            isActive: () => false,
        },

        connection: {
            getStatus: (() => ({
                activeStreamCount: 1,
                maxStreams: 5,
                streams: [],
                listenKeyExpiresAt: null,
            })) as TradingApplicationDependencies['connection']['getStatus'],
        },

        health: {
            getSnapshot: (() => ({
                timestamp: 1,
                overallStatus: 'ok',
                components: {},
                uptime: 10,
                memoryUsageMb: 20,
            })) as TradingApplicationDependencies['health']['getSnapshot'],
        },

        ...overrides,
    };
}

describe('WEB1-A TradingApplicationService', () => {
    test('exposes Binance Spot LONG/FLAT semantics with read-only Web controls', () => {
        const service = new TradingApplicationService(makeDependencies());
        const status = service.getStatus();

        expect(status.venue).toBe('BINANCE');
        expect(status.product).toBe('SPOT');
        expect(status.positionMode).toBe('LONG_FLAT');

        expect(status.web.controlMode).toBe('READ_ONLY');
        expect(status.web.mutableControlsEnabled).toBe(false);
        expect(status.web.newEntryPermissionExposed).toBe(false);
    });

    test('blocks core execution when Binance credentials are unavailable', () => {
        const service = new TradingApplicationService(
            makeDependencies({
                orderService: {
                    isConfigured: () => false,
                },
            }),
        );

        const status = service.getStatus();

        expect(status.execution.coreExecutionGate).toBe('BLOCKED');
        expect(status.execution.blockers).toEqual([
            'BINANCE_NOT_CONFIGURED',
        ]);
    });

    test('blocks core execution while startup reconciliation is pending', () => {
        const service = new TradingApplicationService(
            makeDependencies({
                executionEngine: {
                    isStartupRecoveryReady: () => false,
                },
            }),
        );

        const status = service.getStatus();

        expect(status.execution.coreExecutionGate).toBe('BLOCKED');
        expect(status.execution.blockers).toEqual([
            'STARTUP_RECOVERY_PENDING',
        ]);
    });

    test('READY is scoped and never exposes NEW ENTRY permission', () => {
        const service = new TradingApplicationService(makeDependencies());
        const status = service.getStatus();

        expect(status.execution.coreExecutionGate).toBe('READY');
        expect(status.execution.blockers).toEqual([]);
        expect(status.web.newEntryPermissionExposed).toBe(false);
    });
});
`;

const originalWebServer = readUtf8(webServerPath);
let webServer = normalize(originalWebServer);

const importLine =
  `import { tradingApplicationService } from './services/tradingApplicationService';`;

if (!webServer.includes(importLine)) {
  const importRegex = /^import .*?;[ \t]*$/gm;
  const matches = [...webServer.matchAll(importRegex)];

  if (matches.length === 0) {
    fail('No TypeScript import statements found in src/webServer.ts.');
  }

  const lastImport = matches[matches.length - 1];
  const insertAt = lastImport.index + lastImport[0].length;

  webServer =
    webServer.slice(0, insertAt) +
    '\n' +
    importLine +
    webServer.slice(insertAt);
}

const routeMarker =
  `// WEB1-A: canonical shared, read-only application status.`;

const routeExists = /app\.get\(\s*['"]\/api\/system\/status['"]/.test(webServer);

if (routeExists && !webServer.includes(routeMarker)) {
  fail(
    'GET /api/system/status already exists but is not the WEB1-A route. ' +
    'Refusing to overwrite or duplicate it.'
  );
}

const routeSource = `// WEB1-A: canonical shared, read-only application status.
// This intentionally exposes no mutable trading controls.
app.get('/api/system/status', (req: Request, res: Response) => {
    try {
        res.json(tradingApplicationService.getStatus());
    } catch (error: any) {
        withLogContext({ service: 'webServer' }).error(
            \`System status API error: \${error.message}\`,
        );
        res.status(500).json({
            error: 'An internal server error occurred',
        });
    }
});

`;

if (!routeExists) {
  const apiHealthMatch =
    /app\.get\(\s*['"]\/api\/health['"]/.exec(webServer);

  const healthMatch =
    /app\.get\(\s*['"]\/health['"]/.exec(webServer);

  const anchor = apiHealthMatch || healthMatch;

  if (!anchor || anchor.index === undefined) {
    fail(
      'Could not find /api/health or /health route in src/webServer.ts. ' +
      'No files were changed.'
    );
  }

  let insertAt = anchor.index;

  // If a standalone comment immediately precedes the health route,
  // insert before that comment rather than between comment and route.
  const before = webServer.slice(0, insertAt);
  const lastLineBreak = before.lastIndexOf('\n');
  const previousLineBreak =
    lastLineBreak > 0 ? before.lastIndexOf('\n', lastLineBreak - 1) : -1;

  const precedingLine =
    before.slice(previousLineBreak + 1, lastLineBreak).trim();

  if (
    precedingLine === '// Health check' ||
    precedingLine === '// Health Check'
  ) {
    insertAt = previousLineBreak + 1;
  }

  webServer =
    webServer.slice(0, insertAt) +
    routeSource +
    webServer.slice(insertAt);
}

function ensureSafeNewFile(file, expectedSource) {
  if (!fs.existsSync(file)) return;

  const existing = normalize(fs.readFileSync(file, 'utf8')).trimEnd();
  const expected = normalize(expectedSource).trimEnd();

  if (existing !== expected) {
    fail(
      `Refusing to overwrite existing non-matching file: ` +
      `${path.relative(root, file)}`
    );
  }
}

ensureSafeNewFile(servicePath, serviceSource);
ensureSafeNewFile(testPath, testSource);

if (CHECK_ONLY) {
  console.log('[WEB1-A v3] CHECK PASS');
  console.log('  - src/webServer.ts supports safe import insertion');
  console.log('  - health-route anchor found');
  console.log('  - shared service/test paths are safe');
  console.log('  - Socket.IO block intentionally untouched');
  console.log('  - no files changed');
  process.exit(0);
}

fs.writeFileSync(
  webServerPath,
  restoreEol(originalWebServer, webServer),
  'utf8',
);

fs.writeFileSync(servicePath, serviceSource, 'utf8');
fs.writeFileSync(testPath, testSource, 'utf8');

console.log('[WEB1-A v3] APPLY PASS');
console.log('Changed/created:');
console.log('  - src/webServer.ts');
console.log('  - src/services/tradingApplicationService.ts');
console.log('  - tests/tradingApplicationService.web1.test.ts');
console.log('');
console.log('Intentionally NOT changed:');
console.log('  - src/enhancedBot.ts');
console.log('  - existing Socket.IO connection/listener block');
console.log('');
console.log('Next gates:');
console.log('  npx jest tests/tradingApplicationService.web1.test.ts --runInBand');
console.log('  npm run build');
console.log('  npm test -- --runInBand');
console.log('  git diff --check');
console.log('  git status --short');
