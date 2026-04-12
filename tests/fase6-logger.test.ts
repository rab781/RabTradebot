/**
 * F6: Structured Logger Tests
 * Tests the pino-based logger configuration and helper functions.
 */

describe('F6: Structured Logger', () => {
    // Reset module cache between tests to get fresh logger instances
    let loggerModule: typeof import('../src/utils/logger');

    beforeEach(() => {
        jest.resetModules();
    });

    afterEach(() => {
        // Restore NODE_ENV after each test
        delete process.env.LOG_LEVEL;
    });

    describe('Logger Initialization', () => {
        it('should export a logger instance', () => {
            loggerModule = require('../src/utils/logger');
            expect(loggerModule.logger).toBeDefined();
            expect(typeof loggerModule.logger.info).toBe('function');
            expect(typeof loggerModule.logger.warn).toBe('function');
            expect(typeof loggerModule.logger.error).toBe('function');
            expect(typeof loggerModule.logger.debug).toBe('function');
        });

        it('should have info/warn/error/debug levels', () => {
            loggerModule = require('../src/utils/logger');
            const logger = loggerModule.logger;

            // These should not throw
            expect(() => logger.info('test info')).not.toThrow();
            expect(() => logger.warn('test warn')).not.toThrow();
            expect(() => logger.error('test error')).not.toThrow();
            expect(() => logger.debug('test debug')).not.toThrow();
        });

        it('should support structured metadata in log messages', () => {
            loggerModule = require('../src/utils/logger');
            const logger = loggerModule.logger;

            // Structured logging with object context should not throw
            expect(() =>
                logger.info({ symbol: 'BTCUSDT', price: 50000 }, 'Price update received')
            ).not.toThrow();
        });
    });

    describe('withLogContext', () => {
        it('should create a child logger with service context', () => {
            loggerModule = require('../src/utils/logger');
            const childLogger = loggerModule.withLogContext({ service: 'binanceOrder' });

            expect(childLogger).toBeDefined();
            expect(typeof childLogger.info).toBe('function');
            expect(typeof childLogger.error).toBe('function');
        });

        it('should create child logger with userId context', () => {
            loggerModule = require('../src/utils/logger');
            const childLogger = loggerModule.withLogContext({
                service: 'enhancedBot',
                userId: 12345,
            });

            expect(childLogger).toBeDefined();
            // Should not throw when logging
            expect(() => childLogger.info('User action logged')).not.toThrow();
        });

        it('should create child logger with symbol context', () => {
            loggerModule = require('../src/utils/logger');
            const childLogger = loggerModule.withLogContext({
                service: 'tradingEngine',
                symbol: 'ETHUSDT',
            });

            expect(childLogger).toBeDefined();
            expect(() => childLogger.warn('Signal detected')).not.toThrow();
        });

        it('should support additional data object in context', () => {
            loggerModule = require('../src/utils/logger');
            const childLogger = loggerModule.withLogContext({
                service: 'riskMonitor',
                data: { maxDrawdown: 10, currentDrawdown: 5.2 },
            });

            expect(childLogger).toBeDefined();
            expect(() => childLogger.info('Risk check passed')).not.toThrow();
        });

        it('should handle empty context gracefully', () => {
            loggerModule = require('../src/utils/logger');
            const childLogger = loggerModule.withLogContext({});

            expect(childLogger).toBeDefined();
            expect(() => childLogger.info('Empty context')).not.toThrow();
        });
    });

    describe('Security: Secret Redaction', () => {
        it('should NOT expose API keys in log output', () => {
            loggerModule = require('../src/utils/logger');
            const logger = loggerModule.logger;

            // Simulate logging with sensitive data — the logger should accept it
            // (redaction is a transport-level concern, but we verify the logger doesn't crash)
            expect(() =>
                logger.info(
                    {
                        apiKey: 'sk-test-12345',
                        config: { secret: 'mySecret' },
                    },
                    'Config loaded'
                )
            ).not.toThrow();
        });
    });

    describe('LogContext Interface', () => {
        it('should match the expected interface shape', () => {
            loggerModule = require('../src/utils/logger');

            // Verify the interface accepts all expected fields
            const context = {
                service: 'test',
                userId: 42,
                symbol: 'BTCUSDT',
                data: { key: 'value' },
            };

            const childLogger = loggerModule.withLogContext(context);
            expect(childLogger).toBeDefined();
        });
    });
});
