/**
 * F0-3 Tests: getPrisma() reads DATABASE_URL from environment
 *
 * Uses jest.resetModules() + jest.doMock() per-test so the module-level
 * Prisma singleton is always fresh (avoids cached instance across tests).
 */

describe('F0-3: getPrisma() reads DATABASE_URL from environment', () => {
    const originalEnv = process.env.DATABASE_URL;

    afterEach(() => {
        jest.resetModules();
        // Restore env after each test
        if (originalEnv === undefined) {
            delete process.env.DATABASE_URL;
        } else {
            process.env.DATABASE_URL = originalEnv;
        }
    });

    it('passes DATABASE_URL value to PrismaLibSql when env var is set', () => {
        const mockPrismaLibSql = jest.fn();
        jest.doMock('@prisma/adapter-libsql', () => ({ PrismaLibSql: mockPrismaLibSql }));
        jest.doMock('@prisma/client', () => ({ PrismaClient: jest.fn().mockReturnValue({}) }));

        process.env.DATABASE_URL = 'file:./test-custom.db';

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getPrisma } = require('../src/services/databaseService');
        getPrisma();

        expect(mockPrismaLibSql).toHaveBeenCalledWith({ url: 'file:./test-custom.db' });
    });

    it('falls back to file:./prisma/dev.db when DATABASE_URL is not set', () => {
        const mockPrismaLibSql = jest.fn();
        jest.doMock('@prisma/adapter-libsql', () => ({ PrismaLibSql: mockPrismaLibSql }));
        jest.doMock('@prisma/client', () => ({ PrismaClient: jest.fn().mockReturnValue({}) }));

        delete process.env.DATABASE_URL;

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getPrisma } = require('../src/services/databaseService');
        getPrisma();

        expect(mockPrismaLibSql).toHaveBeenCalledWith({ url: 'file:./prisma/dev.db' });
    });

    it('does NOT use the hardcoded path when DATABASE_URL points to a different file', () => {
        const mockPrismaLibSql = jest.fn();
        jest.doMock('@prisma/adapter-libsql', () => ({ PrismaLibSql: mockPrismaLibSql }));
        jest.doMock('@prisma/client', () => ({ PrismaClient: jest.fn().mockReturnValue({}) }));

        process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/prod';

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getPrisma } = require('../src/services/databaseService');
        getPrisma();

        expect(mockPrismaLibSql).not.toHaveBeenCalledWith({ url: 'file:./prisma/dev.db' });
        expect(mockPrismaLibSql).toHaveBeenCalledWith({ url: 'postgresql://user:pass@localhost:5432/prod' });
    });
});
