-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "defaultSymbol" TEXT NOT NULL DEFAULT 'BTCUSDT',
    "riskTolerance" REAL NOT NULL DEFAULT 0.02,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "entryPrice" REAL NOT NULL,
    "exitPrice" REAL,
    "quantity" REAL NOT NULL,
    "leverage" REAL NOT NULL DEFAULT 1,
    "strategyName" TEXT NOT NULL,
    "strategyVersion" TEXT,
    "signalStrength" REAL,
    "mlConfidence" REAL,
    "entryTime" DATETIME NOT NULL,
    "exitTime" DATETIME,
    "status" TEXT NOT NULL,
    "profit" REAL,
    "profitPct" REAL,
    "fees" REAL NOT NULL DEFAULT 0,
    "stopLoss" REAL,
    "takeProfit" REAL,
    "maxDrawdown" REAL,
    "notes" TEXT,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StrategyMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyName" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "totalTrades" INTEGER NOT NULL,
    "winningTrades" INTEGER NOT NULL,
    "losingTrades" INTEGER NOT NULL,
    "winRate" REAL NOT NULL,
    "avgProfit" REAL NOT NULL,
    "avgLoss" REAL NOT NULL,
    "profitFactor" REAL NOT NULL,
    "sharpeRatio" REAL NOT NULL,
    "maxDrawdown" REAL NOT NULL,
    "maxDrawdownPct" REAL NOT NULL,
    "calmarRatio" REAL NOT NULL,
    "sortinoRatio" REAL NOT NULL,
    "avgTradeDuration" REAL NOT NULL,
    "bestTrade" REAL NOT NULL,
    "worstTrade" REAL NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HistoricalData" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "open" REAL NOT NULL,
    "high" REAL NOT NULL,
    "low" REAL NOT NULL,
    "close" REAL NOT NULL,
    "volume" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MLModelMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "totalPredictions" INTEGER NOT NULL,
    "correctPredictions" INTEGER NOT NULL,
    "accuracy" REAL NOT NULL,
    "avgConfidence" REAL NOT NULL,
    "highConfAccuracy" REAL,
    "lowConfAccuracy" REAL,
    "bullishAccuracy" REAL,
    "bearishAccuracy" REAL,
    "trainingDate" DATETIME,
    "trainingSamples" INTEGER,
    "trainingEpochs" INTEGER,
    "trainingTime" REAL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "targetPrice" REAL,
    "condition" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "triggered" BOOLEAN NOT NULL DEFAULT false,
    "triggeredAt" DATETIME,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BacktestResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyName" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "initialBalance" REAL NOT NULL,
    "finalBalance" REAL NOT NULL,
    "totalProfit" REAL NOT NULL,
    "totalProfitPct" REAL NOT NULL,
    "totalTrades" INTEGER NOT NULL,
    "winRate" REAL NOT NULL,
    "profitFactor" REAL NOT NULL,
    "sharpeRatio" REAL NOT NULL,
    "maxDrawdown" REAL NOT NULL,
    "maxDrawdownPct" REAL NOT NULL,
    "trades" TEXT NOT NULL,
    "equityCurve" TEXT,
    "parameters" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stackTrace" TEXT,
    "userId" INTEGER,
    "symbol" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_telegramId_idx" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "UserPreference_userId_idx" ON "UserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key_key" ON "UserPreference"("userId", "key");

-- CreateIndex
CREATE INDEX "Trade_userId_idx" ON "Trade"("userId");

-- CreateIndex
CREATE INDEX "Trade_symbol_idx" ON "Trade"("symbol");

-- CreateIndex
CREATE INDEX "Trade_status_idx" ON "Trade"("status");

-- CreateIndex
CREATE INDEX "Trade_entryTime_idx" ON "Trade"("entryTime");

-- CreateIndex
CREATE INDEX "StrategyMetric_strategyName_idx" ON "StrategyMetric"("strategyName");

-- CreateIndex
CREATE INDEX "StrategyMetric_symbol_idx" ON "StrategyMetric"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyMetric_strategyName_symbol_timeframe_startDate_key" ON "StrategyMetric"("strategyName", "symbol", "timeframe", "startDate");

-- CreateIndex
CREATE INDEX "HistoricalData_symbol_timeframe_idx" ON "HistoricalData"("symbol", "timeframe");

-- CreateIndex
CREATE INDEX "HistoricalData_timestamp_idx" ON "HistoricalData"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalData_symbol_timeframe_timestamp_key" ON "HistoricalData"("symbol", "timeframe", "timestamp");

-- CreateIndex
CREATE INDEX "MLModelMetric_modelName_idx" ON "MLModelMetric"("modelName");

-- CreateIndex
CREATE UNIQUE INDEX "MLModelMetric_modelName_symbol_startDate_key" ON "MLModelMetric"("modelName", "symbol", "startDate");

-- CreateIndex
CREATE INDEX "Alert_userId_idx" ON "Alert"("userId");

-- CreateIndex
CREATE INDEX "Alert_symbol_idx" ON "Alert"("symbol");

-- CreateIndex
CREATE INDEX "Alert_isActive_idx" ON "Alert"("isActive");

-- CreateIndex
CREATE INDEX "BacktestResult_strategyName_idx" ON "BacktestResult"("strategyName");

-- CreateIndex
CREATE INDEX "BacktestResult_symbol_idx" ON "BacktestResult"("symbol");

-- CreateIndex
CREATE INDEX "BacktestResult_startDate_idx" ON "BacktestResult"("startDate");

-- CreateIndex
CREATE INDEX "ErrorLog_level_idx" ON "ErrorLog"("level");

-- CreateIndex
CREATE INDEX "ErrorLog_source_idx" ON "ErrorLog"("source");

-- CreateIndex
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");
