/**
 * SQLite Database Manager
 * Handles all database operations including schema creation and migrations
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export interface Trade {
  id?: number;
  symbol: string;
  strategy: string;
  action: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  profit?: number;
  profitPct?: number;
  entryTime: number;
  exitTime?: number;
  reason: string;
  metadata?: string;
}

export interface BacktestResult {
  id?: number;
  strategy: string;
  symbol: string;
  startDate: number;
  endDate: number;
  initialBalance: number;
  finalBalance: number;
  totalProfit: number;
  totalProfitPct: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  profitFactor: number;
  parameters: string;
  createdAt: number;
}

export interface ModelVersion {
  id?: number;
  modelName: string;
  version: string;
  architecture: string;
  accuracy: number;
  mae: number;
  rmse: number;
  directionalAccuracy: number;
  trainedOn: string;
  trainingPeriod: string;
  filePath: string;
  metadata: string;
  createdAt: number;
}

export interface FeatureCache {
  id?: number;
  symbol: string;
  timestamp: number;
  features: string;
  createdAt: number;
}

export class TradingDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string = './data/trading.db') {
    this.dbPath = dbPath;

    // Create data directory if it doesn't exist
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
    this.initializeSchema();
  }

  private initializeSchema(): void {
    // Create trades table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                strategy TEXT NOT NULL,
                action TEXT NOT NULL CHECK(action IN ('BUY', 'SELL')),
                entryPrice REAL NOT NULL,
                exitPrice REAL,
                quantity REAL NOT NULL,
                profit REAL,
                profitPct REAL,
                entryTime INTEGER NOT NULL,
                exitTime INTEGER,
                reason TEXT,
                metadata TEXT,
                createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )
        `);

    // Create backtest_results table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS backtest_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                strategy TEXT NOT NULL,
                symbol TEXT NOT NULL,
                startDate INTEGER NOT NULL,
                endDate INTEGER NOT NULL,
                initialBalance REAL NOT NULL,
                finalBalance REAL NOT NULL,
                totalProfit REAL NOT NULL,
                totalProfitPct REAL NOT NULL,
                totalTrades INTEGER NOT NULL,
                winningTrades INTEGER NOT NULL,
                losingTrades INTEGER NOT NULL,
                winRate REAL NOT NULL,
                maxDrawdown REAL NOT NULL,
                maxDrawdownPct REAL NOT NULL,
                sharpeRatio REAL NOT NULL,
                sortinoRatio REAL NOT NULL,
                calmarRatio REAL NOT NULL,
                profitFactor REAL NOT NULL,
                parameters TEXT,
                createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )
        `);

    // Create model_versions table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS model_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                modelName TEXT NOT NULL,
                version TEXT NOT NULL,
                architecture TEXT NOT NULL,
                accuracy REAL NOT NULL,
                mae REAL NOT NULL,
                rmse REAL NOT NULL,
                directionalAccuracy REAL NOT NULL,
                trainedOn TEXT NOT NULL,
                trainingPeriod TEXT NOT NULL,
                filePath TEXT NOT NULL,
                metadata TEXT,
                createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                UNIQUE(modelName, version)
            )
        `);

    // Create feature_cache table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS feature_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                features TEXT NOT NULL,
                createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                UNIQUE(symbol, timestamp)
            )
        `);

    // Create indexes for better query performance
    this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
            CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategy);
            CREATE INDEX IF NOT EXISTS idx_trades_entryTime ON trades(entryTime);
            CREATE INDEX IF NOT EXISTS idx_backtest_strategy ON backtest_results(strategy);
            CREATE INDEX IF NOT EXISTS idx_backtest_symbol ON backtest_results(symbol);
            CREATE INDEX IF NOT EXISTS idx_model_name ON model_versions(modelName);
            CREATE INDEX IF NOT EXISTS idx_feature_symbol_timestamp ON feature_cache(symbol, timestamp);
        `);
  }

  // ==================== TRADE OPERATIONS ====================

  insertTrade(trade: Trade): number {
    const stmt = this.db.prepare(`
            INSERT INTO trades (symbol, strategy, action, entryPrice, exitPrice, quantity, profit, profitPct, entryTime, exitTime, reason, metadata)
            VALUES (@symbol, @strategy, @action, @entryPrice, @exitPrice, @quantity, @profit, @profitPct, @entryTime, @exitTime, @reason, @metadata)
        `);
    const result = stmt.run({
      symbol: trade.symbol,
      strategy: trade.strategy,
      action: trade.action,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice || null,
      quantity: trade.quantity,
      profit: trade.profit || null,
      profitPct: trade.profitPct || null,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime || null,
      reason: trade.reason,
      metadata: trade.metadata || null,
    });
    return result.lastInsertRowid as number;
  }

  updateTrade(id: number, updates: Partial<Trade>): void {
    const allowedColumns = [
      'symbol',
      'strategy',
      'action',
      'entryPrice',
      'exitPrice',
      'quantity',
      'profit',
      'profitPct',
      'entryTime',
      'exitTime',
      'reason',
      'metadata',
    ];
    const validUpdates = Object.keys(updates).filter((key) => allowedColumns.includes(key));
    if (validUpdates.length === 0) return;

    const fields = validUpdates.map((key) => `${key} = @${key}`).join(', ');
    const stmt = this.db.prepare(`UPDATE trades SET ${fields} WHERE id = @id`);
    stmt.run({ ...updates, id });
  }

  getTrade(id: number): Trade | undefined {
    const stmt = this.db.prepare('SELECT * FROM trades WHERE id = ?');
    return stmt.get(id) as Trade | undefined;
  }

  getTradesBySymbol(symbol: string, limit: number = 100): Trade[] {
    const stmt = this.db.prepare(
      'SELECT * FROM trades WHERE symbol = ? ORDER BY entryTime DESC LIMIT ?'
    );
    return stmt.all(symbol, limit) as Trade[];
  }

  getTradesByStrategy(strategy: string, limit: number = 100): Trade[] {
    const stmt = this.db.prepare(
      'SELECT * FROM trades WHERE strategy = ? ORDER BY entryTime DESC LIMIT ?'
    );
    return stmt.all(strategy, limit) as Trade[];
  }

  // ==================== BACKTEST OPERATIONS ====================

  insertBacktestResult(result: BacktestResult): number {
    const stmt = this.db.prepare(`
            INSERT INTO backtest_results (
                strategy, symbol, startDate, endDate, initialBalance, finalBalance,
                totalProfit, totalProfitPct, totalTrades, winningTrades, losingTrades,
                winRate, maxDrawdown, maxDrawdownPct, sharpeRatio, sortinoRatio,
                calmarRatio, profitFactor, parameters
            ) VALUES (
                @strategy, @symbol, @startDate, @endDate, @initialBalance, @finalBalance,
                @totalProfit, @totalProfitPct, @totalTrades, @winningTrades, @losingTrades,
                @winRate, @maxDrawdown, @maxDrawdownPct, @sharpeRatio, @sortinoRatio,
                @calmarRatio, @profitFactor, @parameters
            )
        `);
    const res = stmt.run(result);
    return res.lastInsertRowid as number;
  }

  getBacktestResults(strategy?: string, symbol?: string, limit: number = 50): BacktestResult[] {
    let query = 'SELECT * FROM backtest_results WHERE 1=1';
    const params: any[] = [];

    if (strategy) {
      query += ' AND strategy = ?';
      params.push(strategy);
    }
    if (symbol) {
      query += ' AND symbol = ?';
      params.push(symbol);
    }

    query += ' ORDER BY createdAt DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    return stmt.all(...params) as BacktestResult[];
  }

  getBestBacktestResult(
    strategy: string,
    symbol: string,
    metric: 'sharpeRatio' | 'totalProfitPct' | 'winRate' = 'sharpeRatio'
  ): BacktestResult | undefined {
    // 🛡️ Sentinel: Enforce runtime whitelisting for dynamic SQL identifiers to prevent injection
    const allowedMetrics = ['sharpeRatio', 'totalProfitPct', 'winRate'];
    const safeMetric = allowedMetrics.includes(metric) ? metric : 'sharpeRatio';

    const stmt = this.db.prepare(`
            SELECT * FROM backtest_results
            WHERE strategy = ? AND symbol = ?
            ORDER BY ${safeMetric} DESC
            LIMIT 1
        `);
    return stmt.get(strategy, symbol) as BacktestResult | undefined;
  }

  // ==================== MODEL VERSION OPERATIONS ====================

  insertModelVersion(model: ModelVersion): number {
    const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO model_versions (
                modelName, version, architecture, accuracy, mae, rmse,
                directionalAccuracy, trainedOn, trainingPeriod, filePath, metadata
            ) VALUES (
                @modelName, @version, @architecture, @accuracy, @mae, @rmse,
                @directionalAccuracy, @trainedOn, @trainingPeriod, @filePath, @metadata
            )
        `);
    const result = stmt.run(model);
    return result.lastInsertRowid as number;
  }

  getLatestModelVersion(modelName: string): ModelVersion | undefined {
    const stmt = this.db.prepare(`
            SELECT * FROM model_versions
            WHERE modelName = ?
            ORDER BY createdAt DESC
            LIMIT 1
        `);
    return stmt.get(modelName) as ModelVersion | undefined;
  }

  getAllModelVersions(modelName?: string): ModelVersion[] {
    if (modelName) {
      const stmt = this.db.prepare(
        'SELECT * FROM model_versions WHERE modelName = ? ORDER BY createdAt DESC'
      );
      return stmt.all(modelName) as ModelVersion[];
    }
    const stmt = this.db.prepare('SELECT * FROM model_versions ORDER BY createdAt DESC');
    return stmt.all() as ModelVersion[];
  }

  // ==================== FEATURE CACHE OPERATIONS ====================

  insertFeatureCache(cache: FeatureCache): number {
    const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO feature_cache (symbol, timestamp, features)
            VALUES (@symbol, @timestamp, @features)
        `);
    const result = stmt.run(cache);
    return result.lastInsertRowid as number;
  }

  getFeatureCache(symbol: string, timestamp: number): FeatureCache | undefined {
    const stmt = this.db.prepare('SELECT * FROM feature_cache WHERE symbol = ? AND timestamp = ?');
    return stmt.get(symbol, timestamp) as FeatureCache | undefined;
  }

  cleanOldFeatureCache(olderThanDays: number = 30): number {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const stmt = this.db.prepare('DELETE FROM feature_cache WHERE createdAt < ?');
    const result = stmt.run(cutoffTime);
    return result.changes;
  }

  // ==================== UTILITY OPERATIONS ====================

  getStats(): {
    totalTrades: number;
    totalBacktests: number;
    totalModels: number;
    totalCachedFeatures: number;
    dbSize: number;
  } {
    const trades = this.db.prepare('SELECT COUNT(*) as count FROM trades').get() as any;
    const backtests = this.db
      .prepare('SELECT COUNT(*) as count FROM backtest_results')
      .get() as any;
    const models = this.db.prepare('SELECT COUNT(*) as count FROM model_versions').get() as any;
    const features = this.db.prepare('SELECT COUNT(*) as count FROM feature_cache').get() as any;

    const dbSize = fs.existsSync(this.dbPath) ? fs.statSync(this.dbPath).size : 0;

    return {
      totalTrades: trades.count,
      totalBacktests: backtests.count,
      totalModels: models.count,
      totalCachedFeatures: features.count,
      dbSize,
    };
  }

  vacuum(): void {
    this.db.exec('VACUUM');
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let dbInstance: TradingDatabase | null = null;

export function getDatabase(dbPath?: string): TradingDatabase {
  if (!dbInstance) {
    dbInstance = new TradingDatabase(dbPath);
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
