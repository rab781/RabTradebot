import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(process.cwd(), 'src/enhancedBot.ts'), 'utf8');

describe('DEV1-A enhancedBot architecture guards', () => {
  test('core startup is invoked independently before Telegram polling', () => {
    const coreStart = source.indexOf('void startCoreRuntime();');
    const telegramStart = source.indexOf('void telegramRuntime.launch(');

    expect(coreStart).toBeGreaterThan(-1);
    expect(telegramStart).toBeGreaterThan(-1);
    expect(coreStart).toBeLessThan(telegramStart);
  });

  test('startup recovery remains fail-closed and owned by the core runtime', () => {
    expect(source).toContain('realTradingEngine.requireStartupRecovery();');
    expect(source).toContain('const recovery = await realTradingEngine.reconcilePendingOrders();');
    expect(source).toContain('realTradingEngine.markStartupRecoveryComplete();');
    expect(source).toContain('connectionManager.startUserDataStreamV2({');
    expect(source).toContain('riskMonitorLoop.start().catch');
  });

  test('Telegram transport has no direct launch/stop/send bypasses', () => {
    expect(source).not.toContain('bot.launch(');
    expect(source).not.toContain('bot.stop(');
    expect(source).not.toContain('bot.telegram.sendMessage');
  });

  test('Telegram launch failure cannot terminate the process', () => {
    expect(source).not.toContain('process.exit(1)');
    expect(source).toContain('Telegram polling failed; core Web/API/reconciliation/risk runtime remains active');
  });

  test('Telegram notifications and shutdown use guarded runtime state', () => {
    expect(source).toContain('if (!telegramRuntime.canSend() || !dbUserId) return;');
    expect(source).toContain('if (!telegramRuntime.canSend()) return;');
    expect(source).toContain("telegramRuntime.stop('SIGINT');");
    expect(source).toContain("telegramRuntime.stop('SIGTERM');");
  });
});
