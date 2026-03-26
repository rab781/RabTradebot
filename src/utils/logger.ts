import pino, { Logger, LoggerOptions } from 'pino';

export interface LogContext {
    service?: string;
    userId?: number;
    symbol?: string;
    data?: Record<string, unknown>;
}

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const isDevelopment = !isProduction;

const options: LoggerOptions = {
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
        level(label: string) {
            return { level: label };
        },
    },
};

const transport = isDevelopment
    && !isTest
    ? pino.transport({
          target: 'pino-pretty',
          options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
          },
      })
    : undefined;

export const logger: Logger = pino(options, transport);

export function withLogContext(context: LogContext): Logger {
    return logger.child({
        service: context.service,
        userId: context.userId,
        symbol: context.symbol,
        ...(context.data ? { data: context.data } : {}),
    });
}
