-- CreateTable
CREATE TABLE "price_data" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "change24h" REAL NOT NULL,
    "changePercent24h" REAL NOT NULL,
    "volume24h" REAL NOT NULL,
    "high24h" REAL NOT NULL,
    "low24h" REAL NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "exchange" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "trade_data" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "quantity" REAL NOT NULL,
    "side" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "exchange" TEXT NOT NULL,
    "totalValue" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "orderbook_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "exchange" TEXT NOT NULL,
    "bids" TEXT NOT NULL,
    "asks" TEXT NOT NULL,
    "totalBidVolume" REAL NOT NULL,
    "totalAskVolume" REAL NOT NULL,
    "spread" REAL NOT NULL,
    "imbalanceRatio" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "displayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "throttleMs" INTEGER NOT NULL DEFAULT 3000,
    "volumeThreshold" REAL NOT NULL DEFAULT 10000.0,
    "favoriteSymbols" TEXT NOT NULL,
    "alertSettings" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "price_alerts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "targetPrice" REAL NOT NULL,
    "direction" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "triggeredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "whale_alerts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "amountUsd" REAL NOT NULL,
    "blockchain" TEXT NOT NULL,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "txHash" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "alertType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "performance_metrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT,
    "metricType" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "calculatedAt" DATETIME NOT NULL,
    "timeframe" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "arbitrage_opportunities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "buyExchange" TEXT NOT NULL,
    "sellExchange" TEXT NOT NULL,
    "buyPrice" REAL NOT NULL,
    "sellPrice" REAL NOT NULL,
    "priceDifference" REAL NOT NULL,
    "percentageGain" REAL NOT NULL,
    "volume" REAL NOT NULL,
    "detectedAt" DATETIME NOT NULL,
    "isStillActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "system_metrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metricName" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "exchange" TEXT,
    "timestamp" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "error_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "errorType" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "exchange" TEXT,
    "symbol" TEXT,
    "stackTrace" TEXT,
    "severity" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");
