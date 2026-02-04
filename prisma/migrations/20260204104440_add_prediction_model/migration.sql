-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "predictedDirection" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "predictedChange" REAL NOT NULL,
    "currentPrice" REAL NOT NULL,
    "actualDirection" TEXT,
    "actualChange" REAL,
    "actualPrice" REAL,
    "wasCorrect" BOOLEAN,
    "predictionTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationTime" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Prediction_userId_idx" ON "Prediction"("userId");

-- CreateIndex
CREATE INDEX "Prediction_symbol_idx" ON "Prediction"("symbol");

-- CreateIndex
CREATE INDEX "Prediction_modelName_idx" ON "Prediction"("modelName");

-- CreateIndex
CREATE INDEX "Prediction_predictionTime_idx" ON "Prediction"("predictionTime");

-- CreateIndex
CREATE INDEX "Prediction_wasCorrect_idx" ON "Prediction"("wasCorrect");
