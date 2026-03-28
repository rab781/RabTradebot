/* eslint-disable no-console */
import 'dotenv/config';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client } = require('pg');

type JsonMap = Record<string, unknown>;

const TABLE_ORDER = [
    'User',
    'UserPreference',
    'Trade',
    'StrategyMetric',
    'HistoricalData',
    'MLModelMetric',
    'Prediction',
    'Alert',
    'BacktestResult',
    'ErrorLog',
] as const;

const BOOLEAN_COLUMNS: Record<string, string[]> = {
    User: ['notificationsEnabled'],
    Prediction: ['wasCorrect'],
    Alert: ['isActive', 'triggered'],
};

function quoteIdent(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
}

function parseBoolean(value: unknown): boolean | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number') {
        return value !== 0;
    }

    if (typeof value === 'string') {
        const lowered = value.toLowerCase();
        return lowered === '1' || lowered === 'true';
    }

    return Boolean(value);
}

function resolveSqlitePath(sqliteUrl: string): string {
    if (sqliteUrl === ':memory:') {
        return sqliteUrl;
    }

    const withoutPrefix = sqliteUrl.startsWith('file:') ? sqliteUrl.slice('file:'.length) : sqliteUrl;

    if (!withoutPrefix) {
        throw new Error('Invalid SQLITE_DATABASE_URL: empty path');
    }

    return path.isAbsolute(withoutPrefix)
        ? withoutPrefix
        : path.resolve(process.cwd(), withoutPrefix);
}

function getSqliteTableColumns(db: Database.Database, tableName: string): string[] {
    const rows = db.prepare(`PRAGMA table_info(${quoteIdent(tableName)})`).all() as Array<{ name: string }>;
    return rows.map((row) => row.name);
}

function tableExists(db: Database.Database, tableName: string): boolean {
    const row = db
        .prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1')
        .get('table', tableName) as { name?: string } | undefined;
    return Boolean(row?.name);
}

async function run(): Promise<void> {
    const sqliteUrl = process.env.SQLITE_DATABASE_URL || process.env.DATABASE_URL || 'file:./prisma/dev.db';
    const postgresUrl = process.env.POSTGRES_DATABASE_URL;

    const dryRun = (process.env.MIGRATION_DRY_RUN ?? 'false').toLowerCase() === 'true';
    const truncateTarget = (process.env.MIGRATION_TRUNCATE_TARGET ?? 'false').toLowerCase() === 'true';
    const batchSizeRaw = Number(process.env.MIGRATION_BATCH_SIZE ?? 500);
    const batchSize = Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? Math.floor(batchSizeRaw) : 500;

    if (!postgresUrl && !dryRun) {
        throw new Error('POSTGRES_DATABASE_URL is required when MIGRATION_DRY_RUN=false');
    }

    const sqlitePath = resolveSqlitePath(sqliteUrl);
    if (sqlitePath !== ':memory:' && !fs.existsSync(sqlitePath)) {
        throw new Error(`SQLite source not found: ${sqlitePath}`);
    }

    console.log('[migrate] Starting SQLite -> PostgreSQL migration');
    console.log(`[migrate] SQLite source: ${sqlitePath}`);
    console.log(`[migrate] Dry run: ${dryRun ? 'yes' : 'no'}`);
    console.log(`[migrate] Truncate target: ${truncateTarget ? 'yes' : 'no'}`);
    console.log(`[migrate] Batch size: ${batchSize}`);

    const sqliteDb = new Database(sqlitePath, { readonly: true });
    const pgClient = dryRun ? null : new Client({ connectionString: postgresUrl });

    try {
        if (pgClient) {
            await pgClient.connect();
            await pgClient.query('BEGIN');

            if (truncateTarget) {
                const truncation = TABLE_ORDER
                    .slice()
                    .reverse()
                    .map((table) => quoteIdent(table))
                    .join(', ');
                await pgClient.query(`TRUNCATE TABLE ${truncation} RESTART IDENTITY CASCADE`);
            }
        }

        const summary: Array<{ table: string; rows: number }> = [];

        for (const tableName of TABLE_ORDER) {
            if (!tableExists(sqliteDb, tableName)) {
                console.log(`[migrate] Skip ${tableName}: table not found in source`);
                continue;
            }

            const columns = getSqliteTableColumns(sqliteDb, tableName);
            if (columns.length === 0) {
                console.log(`[migrate] Skip ${tableName}: no columns`);
                continue;
            }

            const selectQuery = `SELECT * FROM ${quoteIdent(tableName)}`;
            const rows = sqliteDb.prepare(selectQuery).all() as JsonMap[];
            summary.push({ table: tableName, rows: rows.length });

            if (rows.length === 0) {
                console.log(`[migrate] ${tableName}: 0 rows`);
                continue;
            }

            console.log(`[migrate] ${tableName}: ${rows.length} rows`);

            if (dryRun || !pgClient) {
                continue;
            }

            const quotedColumns = columns.map((column) => quoteIdent(column)).join(', ');
            const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
            const insertQuery = `INSERT INTO ${quoteIdent(tableName)} (${quotedColumns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

            for (let start = 0; start < rows.length; start += batchSize) {
                const batch = rows.slice(start, start + batchSize);
                for (const row of batch) {
                    const values = columns.map((column) => {
                        const rawValue = row[column];
                        if (BOOLEAN_COLUMNS[tableName]?.includes(column)) {
                            return parseBoolean(rawValue);
                        }
                        return rawValue;
                    });
                    await pgClient.query(insertQuery, values);
                }
            }
        }

        if (pgClient) {
            await pgClient.query('COMMIT');
        }

        console.log('[migrate] Migration completed');
        for (const item of summary) {
            console.log(`[migrate] ${item.table}: ${item.rows} row(s)`);
        }
    } catch (error) {
        if (pgClient) {
            await pgClient.query('ROLLBACK');
        }
        throw error;
    } finally {
        sqliteDb.close();
        if (pgClient) {
            await pgClient.end();
        }
    }
}

run().catch((error: Error) => {
    console.error('[migrate] Failed:', error.message);
    process.exit(1);
});
