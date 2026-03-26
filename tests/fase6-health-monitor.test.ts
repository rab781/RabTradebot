import { HealthMonitor, HealthStatus } from '../src/services/healthMonitor';

describe('HealthMonitor Service', () => {
  let monitor: HealthMonitor;

  beforeEach(() => {
    monitor = new HealthMonitor({
      binanceRestTimeoutMs: 5000,
      wsDisconnectWindow: 10000, // 10 seconds for testing
      wsDisconnectThreshold: 3,
      modelAccuracyMin: 0.5,
      drawdownThresholdPct: 10,
      minAccountBalance: 50,
    });
  });

  describe('Initialization', () => {
    it('should initialize with default thresholds', () => {
      const defaultMonitor = new HealthMonitor();
      const snapshot = defaultMonitor.getSnapshot();

      expect(snapshot.overallStatus).toBe('ok');
      expect(snapshot.components.database).toBeDefined();
      expect(snapshot.components.binanceRest).toBeDefined();
      expect(snapshot.memoryUsageMb).toBeGreaterThan(0);
    });

    it('should allow custom thresholds', () => {
      const custom = new HealthMonitor({ drawdownThresholdPct: 15, minAccountBalance: 100 });
      expect(custom).toBeDefined();
    });
  });

  describe('Component Status Management', () => {
    it('should track component status changes', () => {
      const snapshot = monitor.getSnapshot();
      expect(snapshot.components.binanceRest.status).toBe('ok');
    });

    it('should track overall status as worst among all components', async () => {
      // Mock rate limiter with old data
      monitor.setServices({
        rateLimiter: {
          getSnapshot: () => ({
            lastSyncTime: Date.now() - 10000, // 10 seconds old
          }),
        },
      });

      await monitor.checkBinanceRest();
      let snapshot = monitor.getSnapshot();
      expect(snapshot.components.binanceRest.status).toBe('degraded');
      expect(snapshot.overallStatus).toBe('degraded');

      // Add a down component
      monitor.setServices({
        tradingEngine: {
          getAccountBalance: () => 25, // Below minimum 50
        },
      });
      await monitor.checkAccountBalance();
      snapshot = monitor.getSnapshot();
      expect(snapshot.overallStatus).toBe('down'); // worst is down
    });
  });

  describe('Binance REST Health Check', () => {
    it('should report OK when rate limiter is recent', async () => {
      monitor.setServices({
        rateLimiter: {
          getSnapshot: () => ({
            lastSyncTime: Date.now() - 1000, // 1 second ago
            rest: { used: 100, capacity: 1200 },
          }),
        },
      });

      await monitor.checkBinanceRest();
      const status = monitor.getComponentStatus('binanceRest');

      expect(status?.status).toBe('ok');
      expect(status?.message).toContain('API responding');
    });

    it('should report degraded when rate limiter data is stale', async () => {
      monitor.setServices({
        rateLimiter: {
          getSnapshot: () => ({
            lastSyncTime: Date.now() - 10000, // 10 seconds ago
          }),
        },
      });

      await monitor.checkBinanceRest();
      const status = monitor.getComponentStatus('binanceRest');

      expect(status?.status).toBe('degraded');
      expect(status?.message).toContain('No API updates');
    });

    it('should report degraded when rate limiter is not configured', async () => {
      // Don't set any services
      await monitor.checkBinanceRest();
      const status = monitor.getComponentStatus('binanceRest');

      expect(status?.status).toBe('degraded');
      expect(status?.message).toContain('not configured');
    });
  });

  describe('WebSocket Health Check', () => {
    it('should report OK when WebSocket is healthy', async () => {
      monitor.setServices({
        wsService: {
          isHealthy: () => true,
          getStreamCount: () => 3,
        },
      });

      await monitor.checkWebSocketHealth();
      const status = monitor.getComponentStatus('binanceWs');

      expect(status?.status).toBe('ok');
      expect(status?.message).toContain('3 streams');
    });

    it('should report degraded when no active streams', async () => {
      monitor.setServices({
        wsService: {
          isHealthy: () => true,
          getStreamCount: () => 0,
        },
      });

      await monitor.checkWebSocketHealth();
      const status = monitor.getComponentStatus('binanceWs');

      expect(status?.status).toBe('degraded');
      expect(status?.message).toContain('No active WebSocket streams');
    });

    it('should report down when WebSocket is disconnected', async () => {
      monitor.setServices({
        wsService: {
          isHealthy: () => false,
          getStreamCount: () => 0,
        },
      });

      await monitor.checkWebSocketHealth();
      const status = monitor.getComponentStatus('binanceWs');

      expect(status?.status).toBe('down');
    });
  });

  describe('WebSocket Disconnect Tracking', () => {
    it('should track disconnect times', () => {
      monitor.recordWebSocketDisconnect();
      monitor.recordWebSocketDisconnect();
      expect(monitor.getComponentStatus('binanceWs')?.status).not.toBe('degraded');
    });

    it('should trigger alert on threshold disconnect count', () => {
      // Record 3 disconnects within the window
      monitor.recordWebSocketDisconnect();
      monitor.recordWebSocketDisconnect();
      monitor.recordWebSocketDisconnect();

      const status = monitor.getComponentStatus('binanceWs');
      expect(status?.status).toBe('degraded');
      expect(status?.message).toContain('disconnects');
    });

    it('should prune old disconnects outside time window', () => {
      const tooOld = Date.now() - 15000; // 15 seconds ago (outside 10s window)
      monitor.recordWebSocketDisconnect();

      // Manually push an old timestamp to test pruning
      (monitor as any).wsDisconnectTimes.push(tooOld);

      const currentCount = (monitor as any).wsDisconnectTimes.length;
      monitor.recordWebSocketDisconnect();

      // Old disconnect should be pruned
      expect((monitor as any).wsDisconnectTimes.length).toBeLessThanOrEqual(currentCount);
    });

    it('should allow resetting disconnect memory', () => {
      monitor.recordWebSocketDisconnect();
      monitor.recordWebSocketDisconnect();
      monitor.resetDisconnectMemory();

      const status = monitor.getComponentStatus('binanceWs');
      expect(status?.status).toBe('ok');
    });
  });

  describe('Model Accuracy Health Check', () => {
    it('should report OK when accuracy is above threshold', async () => {
      const alertCallback = jest.fn();
      monitor.setAlertCallback(alertCallback);

      monitor.setServices({
        mlModel: {
          getRecentAccuracy: () => 0.75, // Above 0.5 threshold
        },
      });

      await monitor.checkModelAccuracy();
      const status = monitor.getComponentStatus('modelAccuracy');

      expect(status?.status).toBe('ok');
      expect(status?.details?.accuracy).toBe(0.75);
      expect(alertCallback).not.toHaveBeenCalled();
    });

    it('should report degraded and alert when accuracy is below threshold', async () => {
      const alertCallback = jest.fn().mockResolvedValue(undefined);
      monitor.setAlertCallback(alertCallback);

      monitor.setServices({
        mlModel: {
          getRecentAccuracy: () => 0.45, // Below 0.5 threshold
        },
      });

      await monitor.checkModelAccuracy();
      const status = monitor.getComponentStatus('modelAccuracy');

      expect(status?.status).toBe('degraded');
      expect(alertCallback).toHaveBeenCalledWith(expect.stringContaining('Model Accuracy Alert'));
    });
  });

  describe('Account Drawdown Health Check', () => {
    it('should report OK when drawdown is below threshold', async () => {
      const alertCallback = jest.fn();
      monitor.setAlertCallback(alertCallback);

      monitor.setServices({
        tradingEngine: {
          getCurrentDrawdown: () => 5.2, // Below 10% threshold
        },
      });

      await monitor.checkAccountDrawdown();
      const status = monitor.getComponentStatus('accountDrawdown');

      expect(status?.status).toBe('ok');
      expect(alertCallback).not.toHaveBeenCalled();
    });

    it('should report degraded and alert when drawdown exceeds threshold', async () => {
      const alertCallback = jest.fn().mockResolvedValue(undefined);
      monitor.setAlertCallback(alertCallback);

      monitor.setServices({
        tradingEngine: {
          getCurrentDrawdown: () => 15.5, // Above 10% threshold
        },
      });

      await monitor.checkAccountDrawdown();
      const status = monitor.getComponentStatus('accountDrawdown');

      expect(status?.status).toBe('degraded');
      expect(alertCallback).toHaveBeenCalledWith(expect.stringContaining('Drawdown Alert'));
    });
  });

  describe('Account Balance Health Check', () => {
    it('should report OK when balance is above minimum', async () => {
      const alertCallback = jest.fn();
      monitor.setAlertCallback(alertCallback);

      monitor.setServices({
        tradingEngine: {
          getAccountBalance: () => 150, // Above 50 minimum
        },
      });

      await monitor.checkAccountBalance();
      const status = monitor.getComponentStatus('accountBalance');

      expect(status?.status).toBe('ok');
      expect(alertCallback).not.toHaveBeenCalled();
    });

    it('should report down and alert when balance is below minimum', async () => {
      const alertCallback = jest.fn().mockResolvedValue(undefined);
      monitor.setAlertCallback(alertCallback);

      monitor.setServices({
        tradingEngine: {
          getAccountBalance: () => 25, // Below 50 minimum
        },
      });

      await monitor.checkAccountBalance();
      const status = monitor.getComponentStatus('accountBalance');

      expect(status?.status).toBe('down');
      expect(alertCallback).toHaveBeenCalledWith(expect.stringContaining('Low Balance Alert'));
    });
  });

  describe('Bot Process Health Check', () => {
    it('should report OK when memory usage is normal', async () => {
      const alertCallback = jest.fn();
      monitor.setAlertCallback(alertCallback);

      await monitor.checkBotProcess();
      const status = monitor.getComponentStatus('botProcess');

      expect(status?.status).toBe('ok');
      expect(status?.details?.memory).toBeLessThan(500);
      expect(alertCallback).not.toHaveBeenCalled();
    });

    it('should report degraded when memory usage is high', async () => {
      const alertCallback = jest.fn();
      monitor.setAlertCallback(alertCallback);

      // Mock high memory usage
      const originalMemory = process.memoryUsage;
      (process as any).memoryUsage = () => ({
        heapUsed: 700 * 1024 * 1024, // 700 MB
      });

      await monitor.checkBotProcess();
      const status = monitor.getComponentStatus('botProcess');

      expect(status?.status).toBe('degraded');
      expect(status?.details?.memory).toBeGreaterThan(500);

      // Restore
      (process as any).memoryUsage = originalMemory;
    });
  });

  describe('Health Snapshot', () => {
    it('should provide complete snapshot of all components', () => {
      const snapshot = monitor.getSnapshot();

      expect(snapshot.timestamp).toBeGreaterThan(0);
      expect(snapshot.overallStatus).toBe('ok');
      expect(snapshot.uptime).toBeGreaterThan(0);
      expect(snapshot.memoryUsageMb).toBeGreaterThan(0);
      expect(snapshot.components.binanceRest).toBeDefined();
      expect(snapshot.components.binanceWs).toBeDefined();
      expect(snapshot.components.modelAccuracy).toBeDefined();
      expect(snapshot.components.accountDrawdown).toBeDefined();
      expect(snapshot.components.accountBalance).toBeDefined();
      expect(snapshot.components.botProcess).toBeDefined();
    });

    it('should update timestamps on each check', async () => {
      const snap1 = monitor.getSnapshot();
      await new Promise((r) => setTimeout(r, 10));
      await monitor.checkBotProcess();
      const snap2 = monitor.getSnapshot();

      expect(snap2.components.botProcess.lastCheck).toBeGreaterThan(snap1.components.botProcess.lastCheck);
    });
  });

  describe('Full Health Check', () => {
    it('should run all health checks in parallel', async () => {
      const alertCallback = jest.fn().mockResolvedValue(undefined);
      monitor.setAlertCallback(alertCallback);

      monitor.setServices({
        rateLimiter: {
          getSnapshot: () => ({
            lastSyncTime: Date.now() - 1000,
            rest: { used: 100, capacity: 1200 },
          }),
        },
        wsService: {
          isHealthy: () => true,
          getStreamCount: () => 2,
        },
        mlModel: {
          getRecentAccuracy: () => 0.65,
        },
        tradingEngine: {
          getCurrentDrawdown: () => 3.2,
          getAccountBalance: () => 500,
        },
      });

      const snapshot = await monitor.runFullHealthCheck();

      expect(snapshot.overallStatus).toBe('ok');
      expect(snapshot.components.binanceRest.status).toBe('ok');
      expect(snapshot.components.binanceWs.status).toBe('ok');
      expect(snapshot.components.modelAccuracy.status).toBe('ok');
    });
  });

  describe('State History Tracking', () => {
    it('should track component status changes', async () => {
      monitor.setServices({
        tradingEngine: {
          getAccountBalance: () => 100,
        },
      });

      await monitor.checkAccountBalance();
      let history = monitor.getStateHistory();
      const initialCount = history.length;

      // Change balance to trigger status change
      monitor.setServices({
        tradingEngine: {
          getAccountBalance: () => 30,
        },
      });

      await monitor.checkAccountBalance();
      history = monitor.getStateHistory();

      expect(history.length).toBeGreaterThan(initialCount);
      const lastChange = history[history.length - 1];
      expect(lastChange.component).toBe('accountBalance');
      expect(lastChange.oldStatus).toBe('ok');
      expect(lastChange.newStatus).toBe('down');
    });

    it('should limit history to recent changes', async () => {
      // Artificially set history to 100+ items via multiple state changes
      for (let i = 0; i < 105; i++) {
        (monitor as any).stateHistory.push({
          timestamp: Date.now(),
          component: 'binanceRest',
          oldStatus: 'ok',
          newStatus: 'degraded',
          reason: 'test',
        });
      }

      // Verify initial history is over limit
      let history = (monitor as any).stateHistory;
      expect(history.length).toBe(105);

      // Trigger a state change via a real health check which will cause trim
      monitor.setServices({
        rateLimiter: {
          getSnapshot: () => ({
            lastSyncTime: Date.now() - 10000, // stale
          }),
        },
      });
      await monitor.checkBinanceRest();

      history = (monitor as any).stateHistory;
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Alert Callback', () => {
    it('should handle missing alert callback gracefully', async () => {
      // Don't set any alert callback
      monitor.setServices({
        mlModel: {
          getRecentAccuracy: () => 0.3, // This would trigger alert
        },
      });

      expect(async () => await monitor.checkModelAccuracy()).not.toThrow();
    });

    it('should handle callback errors gracefully', async () => {
      const failingCallback = jest.fn().mockRejectedValue(new Error('Callback failed'));
      monitor.setAlertCallback(failingCallback);

      monitor.setServices({
        mlModel: {
          getRecentAccuracy: () => 0.3,
        },
      });

      expect(async () => await monitor.checkModelAccuracy()).not.toThrow();
    });
  });
});
