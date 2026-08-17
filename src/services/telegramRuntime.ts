export interface TelegramRuntimeClient {
  launch(
    options?: { dropPendingUpdates?: boolean },
    onLaunch?: () => void,
  ): Promise<unknown>;
  stop(reason?: string): void;
  telegram: {
    sendMessage(chatId: number, message: string): Promise<unknown>;
  };
}

export interface TelegramLaunchResult {
  started: boolean;
  skipped: boolean;
  error?: unknown;
}

const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);
const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

/**
 * Production-compatible boolean env parsing.
 * Undefined/blank values fall back to the caller-provided default.
 * Unknown values also fall back instead of turning a typo into a process crash.
 */
export function resolveBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (FALSE_VALUES.has(normalized)) return false;
  if (TRUE_VALUES.has(normalized)) return true;
  return defaultValue;
}

/**
 * Telegraf needs a non-empty token even when polling is intentionally disabled.
 * When Telegram is enabled, a missing token remains a hard configuration error,
 * preserving the previous production expectation that TELEGRAM_BOT_TOKEN exists.
 */
export function resolveTelegramBotToken(token: string | undefined, enabled: boolean): string {
  const normalized = token?.trim();
  if (normalized) return normalized;
  if (enabled) {
    throw new Error('TELEGRAM_BOT_TOKEN is required when TELEGRAM_ENABLED is enabled');
  }
  return '0:telegram-disabled';
}

/**
 * Keeps Telegram transport lifecycle state separate from the trading/runtime core.
 * Telegraf's launch() promise remains pending while long polling is active, so
 * polling readiness is recorded through launch()'s onLaunch callback instead of
 * waiting for the promise to resolve.
 */
export class TelegramRuntime {
  private pollingRunning = false;

  constructor(
    private readonly client: TelegramRuntimeClient,
    public readonly enabled: boolean,
  ) {}

  isPollingRunning(): boolean {
    return this.pollingRunning;
  }

  canSend(): boolean {
    return this.enabled && this.pollingRunning;
  }

  async launch(
    options: { dropPendingUpdates?: boolean } = {},
    onStarted?: () => void,
  ): Promise<TelegramLaunchResult> {
    if (!this.enabled) {
      return { started: false, skipped: true };
    }

    let started = false;
    try {
      await this.client.launch(options, () => {
        started = true;
        this.pollingRunning = true;
        onStarted?.();
      });

      // A resolved launch promise means polling has stopped normally.
      this.pollingRunning = false;
      return { started, skipped: false };
    } catch (error) {
      // Polling startup/runtime failures (including 409 conflicts) are contained.
      this.pollingRunning = false;
      return { started, skipped: false, error };
    }
  }

  async sendMessage(chatId: number, message: string): Promise<boolean> {
    if (!this.canSend()) return false;
    await this.client.telegram.sendMessage(chatId, message);
    return true;
  }

  stop(reason?: string): boolean {
    if (!this.pollingRunning) return false;
    this.client.stop(reason);
    this.pollingRunning = false;
    return true;
  }
}
