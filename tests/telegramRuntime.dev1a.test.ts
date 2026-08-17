import {
  TelegramRuntime,
  TelegramRuntimeClient,
  resolveBooleanEnv,
  resolveTelegramBotToken,
} from '../src/services/telegramRuntime';

function createClient(overrides: Partial<TelegramRuntimeClient> = {}): TelegramRuntimeClient {
  return {
    launch: jest.fn().mockImplementation(async (_options, onLaunch?: () => void) => {
      onLaunch?.();
    }),
    stop: jest.fn(),
    telegram: {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

describe('DEV1-A TelegramRuntime', () => {
  test('TELEGRAM_ENABLED defaults to enabled for production compatibility', () => {
    expect(resolveBooleanEnv(undefined, true)).toBe(true);
    expect(resolveBooleanEnv('', true)).toBe(true);
    expect(resolveBooleanEnv('unexpected-value', true)).toBe(true);
  });

  test.each(['false', 'FALSE', '0', 'no', 'off'])('recognizes disabled value %s', (value) => {
    expect(resolveBooleanEnv(value, true)).toBe(false);
  });

  test.each(['true', 'TRUE', '1', 'yes', 'on'])('recognizes enabled value %s', (value) => {
    expect(resolveBooleanEnv(value, false)).toBe(true);
  });

  test('disabled transport does not launch polling, send notifications, or stop polling', async () => {
    const client = createClient();
    const runtime = new TelegramRuntime(client, false);

    await expect(runtime.launch({ dropPendingUpdates: true })).resolves.toEqual({
      started: false,
      skipped: true,
    });
    await expect(runtime.sendMessage(123, 'test')).resolves.toBe(false);
    expect(runtime.stop('SIGTERM')).toBe(false);

    expect(client.launch).not.toHaveBeenCalled();
    expect(client.telegram.sendMessage).not.toHaveBeenCalled();
    expect(client.stop).not.toHaveBeenCalled();
  });

  test('polling failure such as Telegram 409 is contained and does not throw', async () => {
    const conflict = new Error('409 Conflict: terminated by other getUpdates request');
    const client = createClient({ launch: jest.fn().mockRejectedValue(conflict) });
    const runtime = new TelegramRuntime(client, true);

    await expect(runtime.launch({ dropPendingUpdates: true })).resolves.toEqual({
      started: false,
      skipped: false,
      error: conflict,
    });

    expect(runtime.isPollingRunning()).toBe(false);
    expect(runtime.canSend()).toBe(false);
    await expect(runtime.sendMessage(123, 'suppressed')).resolves.toBe(false);
    expect(client.telegram.sendMessage).not.toHaveBeenCalled();
    expect(runtime.stop('SIGINT')).toBe(false);
    expect(client.stop).not.toHaveBeenCalled();
  });

  test('onLaunch marks polling ready before the long-running launch promise resolves', async () => {
    let resolvePolling!: () => void;
    const pollingPromise = new Promise<void>((resolve) => {
      resolvePolling = resolve;
    });
    const launch = jest.fn().mockImplementation(async (_options, onLaunch?: () => void) => {
      onLaunch?.();
      await pollingPromise;
    });
    const client = createClient({ launch });
    const runtime = new TelegramRuntime(client, true);

    const launchPromise = runtime.launch({ dropPendingUpdates: true });
    await Promise.resolve();

    expect(runtime.isPollingRunning()).toBe(true);
    expect(runtime.canSend()).toBe(true);
    await expect(runtime.sendMessage(456, 'hello')).resolves.toBe(true);
    expect(client.telegram.sendMessage).toHaveBeenCalledWith(456, 'hello');

    expect(runtime.stop('SIGTERM')).toBe(true);
    expect(client.stop).toHaveBeenCalledWith('SIGTERM');

    resolvePolling();
    await expect(launchPromise).resolves.toEqual({ started: true, skipped: false });
    expect(runtime.isPollingRunning()).toBe(false);
  });

  test('a 409 after onLaunch disables transport without propagating the rejection', async () => {
    const conflict = new Error('409 Conflict: terminated by other getUpdates request');
    const client = createClient({
      launch: jest.fn().mockImplementation(async (_options, onLaunch?: () => void) => {
        onLaunch?.();
        throw conflict;
      }),
    });
    const runtime = new TelegramRuntime(client, true);

    await expect(runtime.launch()).resolves.toEqual({
      started: true,
      skipped: false,
      error: conflict,
    });
    expect(runtime.canSend()).toBe(false);
    expect(runtime.stop('SIGINT')).toBe(false);
  });

  test('disabled mode can construct with no real bot token', () => {
    expect(resolveTelegramBotToken(undefined, false)).toBe('0:telegram-disabled');
  });

  test('enabled mode still requires TELEGRAM_BOT_TOKEN', () => {
    expect(() => resolveTelegramBotToken(undefined, true)).toThrow(
      'TELEGRAM_BOT_TOKEN is required when TELEGRAM_ENABLED is enabled',
    );
    expect(resolveTelegramBotToken(' 123:abc ', true)).toBe('123:abc');
  });
});
