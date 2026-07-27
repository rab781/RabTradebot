// ─── Health Monitor Service ────────────────────────────────────────────────────
// Monitors system health and triggers alerts for operational issues
// Integrates with:
//   - RateLimiterService (API health)
//   - BinanceWebSocketService (WS connectivity)
//   - RealTradingEngine (account drawdown)
//   - SimpleGRUModel (model accuracy)
//   - Process metrics (uptime, memory)

import { performance } from 'perf_hooks';
import { withLogContext } from '../utils/logger';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type HealthStatus = 'ok' | 'degraded' | 'down';
export type HealthComponent =
  | 'database'
  | 'binanceRest'
  | 'binanceWs'
  | 'modelAccuracy'
  | 'accountDrawdown'
  | 'accountBalance'
  | 'botProcess';

export interface ComponentHealth {
  status: HealthStatus;
  lastCheck: number; // timestamp
  message: string;
  details?: Record<string, any>;
}

export interface HealthSnapshot {
  timestamp: number;
  overallStatus: HealthStatus;
  components: Record<HealthComponent, ComponentHealth>;
  uptime: number; // seconds
  memoryUsageMb: number;
}

export interface HealthThresholds {
  binanceRestTimeoutMs: number; // max latency before "degraded"
  wsDisconnectWindow: number; // lookback window for disconnect count (ms)
  wsDisconnectThreshold: number; // max disconnects before "degraded"
  modelAccuracyMin: number; // min accuracy (0-1) before alert
  drawdownThresholdPct: number; // max drawdown % before alert
  minAccountBalance: number; // USDT, below this = alert
  apiHealthTimeout: number; // ms timeout for health checks
}

// ─── State Tracker (for time-window based alerts) ───────────────────────────────

interface StateChange {
  timestamp: number;
  component: HealthComponent;
  oldStatus: HealthStatus;
  newStatus: HealthStatus;
  reason: string;
}

// ─── Health Monitor Implementation ─────────────────────────────────────────────

export class HealthMonitor {
  private startTime = performance.now();
  private components: Map<HealthComponent, ComponentHealth> = new Map();
  private stateHistory: StateChange[] = [];
  private wsDisconnectTimes: number[] = [];
  private alertCallback?: (msg: string) => Promise<void>;
  private thresholds: HealthThresholds;

  // Optional external service references
  private rateLimiter?: any;
  private wsService?: any;
  private tradingEngine?: any;
  private mlModel?: any;

  constructor(thresholds?: Partial<HealthThresholds>) {
    this.thresholds = {
      binanceRestTimeoutMs: 5000,
      wsDisconnectWindow: 10 * 60 * 1000, // 10 minutes
      wsDisconnectThreshold: 3,
      modelAccuracyMin: 0.5, // 50%
      drawdownThresholdPct: 10,
      minAccountBalance: 50, // USDT
      apiHealthTimeout: 8000,
      ...thresholds,
    };

    this.initializeComponents();
  }

  private initializeComponents(): void {
    const now = Date.now();
    const components: HealthComponent[] = [
      'database',
      'binanceRest',
      'binanceWs',
      'modelAccuracy',
      'accountDrawdown',
      'accountBalance',
      'botProcess',
    ];

    for (const comp of components) {
      this.components.set(comp, {
        status: 'ok',
        lastCheck: now,
        message: 'Not yet checked',
      });
    }
  }

  // ─── Configuration ────────────────────────────────────────────────────────

  /** Register external services for health checks */
  setServices(opts: {
    rateLimiter?: any;
    wsService?: any;
    tradingEngine?: any;
    mlModel?: any;
  }): void {
    this.rateLimiter = opts.rateLimiter;
    this.wsService = opts.wsService;
    this.tradingEngine = opts.tradingEngine;
    this.mlModel = opts.mlModel;
  }

  /** Register alert callback (e.g., Telegram sender) */
  setAlertCallback(callback: (msg: string) => Promise<void>): void {
    this.alertCallback = callback;
  }

  // ─── Health Check Methods ─────────────────────────────────────────────────

  /** Check Binance REST API health via rate limiter snapshot */
  async checkBinanceRest(): Promise<void> {
    const component: HealthComponent = 'binanceRest';
    const now = Date.now();

    try {
      if (!this.rateLimiter) {
        this.setComponentStatus(component, 'degraded', 'Rate limiter not configured', {
          reason: 'no_service',
        });
        return;
      }

      // Get rate limiter snapshot to check if API is reachable
      const snapshot = this.rateLimiter.getSnapshot?.();
      if (!snapshot) {
        this.setComponentStatus(component, 'degraded', 'No rate limiter data available', {
          reason: 'no_snapshot',
        });
        return;
      }

      // If limiter has recent updates from API, REST API is healthy
      const lastSyncAge = now - (snapshot.lastSyncTime || now);
      if (lastSyncAge < this.thresholds.binanceRestTimeoutMs) {
        this.setComponentStatus(component, 'ok', 'API responding normally', {
          lastSync: lastSyncAge,
          restUsed: snapshot.rest?.used,
          restCapacity: snapshot.rest?.capacity,
        });
      } else {
        this.setComponentStatus(component, 'degraded', `No API updates for ${lastSyncAge}ms`, {
          lastSync: lastSyncAge,
        });
      }
    } catch (error) {
      this.setComponentStatus(component, 'down', `Health check failed: ${error}`, { error });
    }
  }

  /** Check WebSocket connectivity health */
  async checkWebSocketHealth(): Promise<void> {
    const component: HealthComponent = 'binanceWs';
    const now = Date.now();

    try {
      if (!this.wsService) {
        this.setComponentStatus(component, 'degraded', 'WebSocket service not configured', {
          reason: 'no_service',
        });
        return;
      }

      // Get active stream count and reconnect info (implement in ws service)
      const isConnected = this.wsService.isHealthy?.() ?? true;
      const streamCount = this.wsService.getStreamCount?.() ?? 0;

      if (!isConnected) {
        this.setComponentStatus(component, 'down', 'WebSocket disconnected', {
          isConnected,
          streamCount,
        });
      } else if (isConnected && streamCount > 0) {
        this.setComponentStatus(component, 'ok', `WebSocket healthy (${streamCount} streams)`, {
          streamCount,
        });
      } else if (streamCount === 0) {
        this.setComponentStatus(component, 'degraded', 'No active WebSocket streams', {
          streamCount,
        });
      }
    } catch (error) {
      this.setComponentStatus(component, 'down', `WS health check failed: ${error}`, { error });
    }
  }

  /** Track WebSocket disconnects and check threshold */
  recordWebSocketDisconnect(): void {
    const now = Date.now();
    this.wsDisconnectTimes.push(now);

    // Prune old disconnect times outside window
    this.wsDisconnectTimes = this.wsDisconnectTimes.filter(
      (t) => now - t < this.thresholds.wsDisconnectWindow
    );

    // Check if threshold exceeded
    if (this.wsDisconnectTimes.length >= this.thresholds.wsDisconnectThreshold) {
      const component: HealthComponent = 'binanceWs';
      const oldStatus = this.components.get(component)?.status || 'ok';
      this.setComponentStatus(
        component,
        'degraded',
        `${this.wsDisconnectTimes.length} disconnects in ${this.thresholds.wsDisconnectWindow / 1000}s`,
        {
          disconnectCount: this.wsDisconnectTimes.length,
          windowSec: this.thresholds.wsDisconnectWindow / 1000,
        }
      );
    }
  }

  /** Check model accuracy (7-day rolling) */
  async checkModelAccuracy(): Promise<void> {
    const component: HealthComponent = 'modelAccuracy';

    try {
      if (!this.mlModel) {
        this.setComponentStatus(component, 'degraded', 'ML model not configured', {
          reason: 'no_service',
        });
        return;
      }

      // Get recent accuracy from model metrics
      const recentAccuracy = this.mlModel.getRecentAccuracy?.() ?? 0.5;

      if (recentAccuracy >= this.thresholds.modelAccuracyMin) {
        this.setComponentStatus(
          component,
          'ok',
          `Model accuracy: ${(recentAccuracy * 100).toFixed(1)}%`,
          {
            accuracy: recentAccuracy,
          }
        );
      } else {
        this.setComponentStatus(
          component,
          'degraded',
          `Model accuracy dropped: ${(recentAccuracy * 100).toFixed(1)}%`,
          {
            accuracy: recentAccuracy,
            threshold: this.thresholds.modelAccuracyMin,
          }
        );
        await this.alert(
          `⚠️ Model Accuracy Alert: Accuracy dropped to ${(recentAccuracy * 100).toFixed(1)}% (threshold: ${(this.thresholds.modelAccuracyMin * 100).toFixed(0)}%)`
        );
      }
    } catch (error) {
      this.setComponentStatus(component, 'down', `Accuracy check failed: ${error}`, { error });
    }
  }

  /** Check account drawdown vs threshold */
  async checkAccountDrawdown(): Promise<void> {
    const component: HealthComponent = 'accountDrawdown';

    try {
      if (!this.tradingEngine) {
        this.setComponentStatus(component, 'degraded', 'Trading engine not configured', {
          reason: 'no_service',
        });
        return;
      }

      // Get cumulative drawdown (implement getter in trading engine)
      const currentDrawdown = this.tradingEngine.getCurrentDrawdown?.() ?? 0;

      if (currentDrawdown <= this.thresholds.drawdownThresholdPct) {
        this.setComponentStatus(component, 'ok', `Drawdown: ${currentDrawdown.toFixed(2)}%`, {
          drawdown: currentDrawdown,
        });
      } else {
        this.setComponentStatus(
          component,
          'degraded',
          `High drawdown: ${currentDrawdown.toFixed(2)}%`,
          {
            drawdown: currentDrawdown,
            threshold: this.thresholds.drawdownThresholdPct,
          }
        );
        await this.alert(
          `⚠️ Drawdown Alert: Account drawdown is ${currentDrawdown.toFixed(2)}% (threshold: ${this.thresholds.drawdownThresholdPct}%)`
        );
      }
    } catch (error) {
      this.setComponentStatus(component, 'down', `Drawdown check failed: ${error}`, { error });
    }
  }

  /** Check account balance vs minimum */
  async checkAccountBalance(): Promise<void> {
    const component: HealthComponent = 'accountBalance';

    try {
      if (!this.tradingEngine) {
        this.setComponentStatus(component, 'degraded', 'Trading engine not configured', {
          reason: 'no_service',
        });
        return;
      }

      // Get current account balance (implement getter in trading engine)
      const currentBalance = this.tradingEngine.getAccountBalance?.() ?? 0;

      if (currentBalance >= this.thresholds.minAccountBalance) {
        this.setComponentStatus(component, 'ok', `Balance: $${currentBalance.toFixed(2)}`, {
          balance: currentBalance,
        });
      } else {
        this.setComponentStatus(component, 'down', `Low balance: $${currentBalance.toFixed(2)}`, {
          balance: currentBalance,
          minimum: this.thresholds.minAccountBalance,
        });
        await this.alert(
          `🚨 Low Balance Alert: Account balance is $${currentBalance.toFixed(2)} (minimum: $${this.thresholds.minAccountBalance})`
        );
      }
    } catch (error) {
      this.setComponentStatus(component, 'down', `Balance check failed: ${error}`, { error });
    }
  }

  /** Check bot process health (uptime, memory) */
  async checkBotProcess(): Promise<void> {
    const component: HealthComponent = 'botProcess';

    try {
      const uptime = this.getUptime();
      const memMb = this.getMemoryUsageMb();

      // Bot is healthy if running with reasonable memory usage
      if (memMb < 500) {
        this.setComponentStatus(
          component,
          'ok',
          `Running (${uptime.toFixed(1)}s, ${memMb.toFixed(0)}MB)`,
          {
            uptime,
            memory: memMb,
          }
        );
      } else if (memMb < 800) {
        this.setComponentStatus(component, 'degraded', `High memory usage: ${memMb.toFixed(0)}MB`, {
          uptime,
          memory: memMb,
        });
      } else {
        this.setComponentStatus(component, 'down', `Critical memory: ${memMb.toFixed(0)}MB`, {
          uptime,
          memory: memMb,
        });
        await this.alert(`🚨 Critical Memory Alert: Bot using ${memMb.toFixed(0)}MB of memory`);
      }
    } catch (error) {
      this.setComponentStatus(component, 'down', `Process check failed: ${error}`, { error });
    }
  }

  // ─── Component Status Management ──────────────────────────────────────────

  private setComponentStatus(
    component: HealthComponent,
    status: HealthStatus,
    message: string,
    details?: Record<string, any>
  ): void {
    const now = Date.now();
    const oldHealth = this.components.get(component);
    const oldStatus = oldHealth?.status || 'ok';

    this.components.set(component, {
      status,
      lastCheck: now,
      message,
      details,
    });

    // Track status changes
    if (status !== oldStatus) {
      this.stateHistory.push({
        timestamp: now,
        component,
        oldStatus,
        newStatus: status,
        reason: message,
      });

      // Keep history size manageable (last 100 changes)
      if (this.stateHistory.length > 100) {
        this.stateHistory = this.stateHistory.slice(-100);
      }
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Get complete health snapshot */
  getSnapshot(): HealthSnapshot {
    const components = Object.fromEntries(
      Array.from(this.components.entries()).map(([k, v]) => [k, v])
    ) as Record<HealthComponent, ComponentHealth>;

    // Overall status is worst of all components
    const statuses = Object.values(components).map((c) => c.status);
    let overallStatus: HealthStatus = 'ok';
    if (statuses.includes('down')) overallStatus = 'down';
    else if (statuses.includes('degraded')) overallStatus = 'degraded';

    return {
      timestamp: Date.now(),
      overallStatus,
      components,
      uptime: this.getUptime(),
      memoryUsageMb: this.getMemoryUsageMb(),
    };
  }

  /** Get status of single component */
  getComponentStatus(component: HealthComponent): ComponentHealth | null {
    return this.components.get(component) || null;
  }

  /** Set component status from external probes (e.g., DB ping). */
  setExternalComponentStatus(
    component: HealthComponent,
    status: HealthStatus,
    message: string,
    details?: Record<string, any>
  ): void {
    this.setComponentStatus(component, status, message, details);
  }

  /** Run all health checks */
  async runFullHealthCheck(): Promise<HealthSnapshot> {
    await Promise.all([
      this.checkBinanceRest(),
      this.checkWebSocketHealth(),
      this.checkModelAccuracy(),
      this.checkAccountDrawdown(),
      this.checkAccountBalance(),
      this.checkBotProcess(),
    ]);

    return this.getSnapshot();
  }

  // ─── Utility Methods ──────────────────────────────────────────────────────

  private getUptime(): number {
    return (performance.now() - this.startTime) / 1000; // seconds
  }

  private getMemoryUsageMb(): number {
    const mem = process.memoryUsage();
    return mem.heapUsed / 1024 / 1024;
  }

  private async alert(message: string): Promise<void> {
    if (!this.alertCallback) return;
    try {
      await this.alertCallback(message);
    } catch (error) {
      withLogContext({ service: 'healthMonitor' }).error(
        { err: error },
        'Health alert callback failed'
      );
    }
  }

  /** Get state change history for debugging */
  getStateHistory(limit: number = 20): StateChange[] {
    return this.stateHistory.slice(-limit);
  }

  /** Reset memory of disconnects (useful for manual maintenance) */
  resetDisconnectMemory(): void {
    this.wsDisconnectTimes = [];
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const healthMonitor = new HealthMonitor();
