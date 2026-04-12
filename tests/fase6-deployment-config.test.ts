/**
 * F6: Deployment Configuration Tests
 * Tests ecosystem.config.js (PM2), deploy.sh, Dockerfile,
 * and Prisma schema integrity.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('F6: Deployment Configuration', () => {
    // ─── PM2 Ecosystem Config ──────────────────────────────────────────────────

    describe('ecosystem.config.js (PM2)', () => {
        let config: any;

        beforeAll(() => {
            config = require(path.join(ROOT, 'ecosystem.config.js'));
        });

        it('should export a valid PM2 config object', () => {
            expect(config).toBeDefined();
            expect(config.apps).toBeDefined();
            expect(Array.isArray(config.apps)).toBe(true);
            expect(config.apps.length).toBeGreaterThan(0);
        });

        it('should define app name as rabtradebot', () => {
            const app = config.apps[0];
            expect(app.name).toBe('rabtradebot');
        });

        it('should use fork mode (NOT cluster) for Telegram bot', () => {
            const app = config.apps[0];
            expect(app.exec_mode).toBe('fork');
            expect(app.instances).toBe(1);
        });

        it('should have auto-restart enabled', () => {
            const app = config.apps[0];
            expect(app.autorestart).toBe(true);
        });

        it('should have max_memory_restart set', () => {
            const app = config.apps[0];
            expect(app.max_memory_restart).toBeDefined();
            expect(typeof app.max_memory_restart).toBe('string');
        });

        it('should define production and development environments', () => {
            const app = config.apps[0];
            expect(app.env).toBeDefined();
            expect(app.env.NODE_ENV).toBe('development');
            expect(app.env_production).toBeDefined();
            expect(app.env_production.NODE_ENV).toBe('production');
        });

        it('should configure log files', () => {
            const app = config.apps[0];
            expect(app.out_file).toBeDefined();
            expect(app.error_file).toBeDefined();
            expect(typeof app.out_file).toBe('string');
        });

        it('should point to correct script path', () => {
            const app = config.apps[0];
            expect(app.script).toContain('enhancedBot.js');
        });
    });

    // ─── deploy.sh ─────────────────────────────────────────────────────────────

    describe('deploy.sh', () => {
        const deployScript = path.join(ROOT, 'scripts', 'deploy.sh');
        let content: string;

        beforeAll(() => {
            content = fs.readFileSync(deployScript, 'utf8');
        });

        it('should exist', () => {
            expect(fs.existsSync(deployScript)).toBe(true);
        });

        it('should have a shebang line', () => {
            expect(content.startsWith('#!/')).toBe(true);
        });

        it('should use set -euo pipefail for safety', () => {
            expect(content).toContain('set -euo pipefail');
        });

        it('should pull from git', () => {
            expect(content).toContain('git pull');
        });

        it('should install dependencies', () => {
            expect(content).toMatch(/npm (ci|install)/);
        });

        it('should run prisma migrations', () => {
            expect(content).toContain('prisma migrate deploy');
        });

        it('should build the project', () => {
            expect(content).toContain('npm run build');
        });

        it('should restart PM2', () => {
            expect(content).toContain('pm2');
        });
    });

    // ─── Dockerfile ────────────────────────────────────────────────────────────

    describe('Dockerfile', () => {
        const dockerfilePath = path.join(ROOT, 'Dockerfile');
        let content: string;

        beforeAll(() => {
            content = fs.readFileSync(dockerfilePath, 'utf8');
        });

        it('should exist', () => {
            expect(fs.existsSync(dockerfilePath)).toBe(true);
        });

        it('should use multi-stage build (builder + runner)', () => {
            expect(content).toContain('AS builder');
            expect(content).toContain('AS runner');
        });

        it('should use node:20-alpine base image', () => {
            expect(content).toContain('node:20-alpine');
        });

        it('should set NODE_ENV=production in final stage', () => {
            expect(content).toContain('NODE_ENV=production');
        });

        it('should include HEALTHCHECK instruction', () => {
            expect(content).toContain('HEALTHCHECK');
        });

        it('should expose port 3000', () => {
            expect(content).toContain('EXPOSE 3000');
        });

        it('should use npm ci (not npm install) for deterministic builds', () => {
            expect(content).toContain('npm ci');
        });

        it('should run prisma generate before build', () => {
            const genIndex = content.indexOf('prisma generate');
            const buildIndex = content.indexOf('npm run build');
            expect(genIndex).toBeGreaterThan(-1);
            expect(buildIndex).toBeGreaterThan(-1);
            expect(genIndex).toBeLessThan(buildIndex);
        });
    });

    // ─── Prisma PostgreSQL Schema ──────────────────────────────────────────────

    describe('Prisma PostgreSQL Schema', () => {
        const schemaPath = path.join(ROOT, 'prisma', 'schema.postgres.prisma');
        let content: string;

        beforeAll(() => {
            content = fs.readFileSync(schemaPath, 'utf8');
        });

        it('should exist', () => {
            expect(fs.existsSync(schemaPath)).toBe(true);
        });

        it('should use postgresql provider', () => {
            expect(content).toContain('provider = "postgresql"');
        });

        it('should read DATABASE_URL from environment', () => {
            expect(content).toContain('env("DATABASE_URL")');
        });

        it('should use @db.Text for large text columns', () => {
            expect(content).toContain('@db.Text');
        });

        it('should define all core models', () => {
            const requiredModels = [
                'User', 'Trade', 'StrategyMetric', 'HistoricalData',
                'BacktestResult', 'ErrorLog', 'Prediction', 'Alert',
            ];

            for (const model of requiredModels) {
                expect(content).toContain(`model ${model}`);
            }
        });
    });

    // ─── Migration Script ──────────────────────────────────────────────────────

    describe('SQLite → Postgres Migration Script', () => {
        const migrationPath = path.join(ROOT, 'scripts', 'migrate-sqlite-to-postgres.ts');
        let content: string;

        beforeAll(() => {
            content = fs.readFileSync(migrationPath, 'utf8');
        });

        it('should exist', () => {
            expect(fs.existsSync(migrationPath)).toBe(true);
        });

        it('should handle all core tables', () => {
            const requiredTables = ['User', 'Trade', 'HistoricalData', 'ErrorLog'];
            for (const table of requiredTables) {
                expect(content).toContain(table);
            }
        });

        it('should use transactions for safety', () => {
            expect(content).toContain('BEGIN');
            expect(content).toContain('COMMIT');
            expect(content).toContain('ROLLBACK');
        });

        it('should support dry-run mode', () => {
            expect(content).toMatch(/dry.?run/i);
        });

        it('should handle boolean column conversions', () => {
            expect(content).toContain('BOOLEAN_COLUMNS');
        });
    });
});
