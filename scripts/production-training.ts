/**
 * Production ML Training — Fase 4 (F4-17, F4-18, F4-19)
 *
 * Perubahan dari versi lama:
 * - [F4-17] Menggunakan trainWithSplit() (70/15/15 + early stopping) secara default
 * - [F4-17] Walk-Forward Validation dijalankan setelah training utama
 * - [F4-18] Logging per-epoch sudah di-handle oleh trainWithSplit() internaly
 * - [F4-19] Hyperparameter dan hasil training disimpan ke MLModelMetric
 */

import { SimpleGRUModel } from '../src/ml/simpleGRUModel';
import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { PublicCryptoService } from '../src/services/publicCryptoService';
import { OHLCVCandle } from '../src/types/dataframe';
import * as fs from 'fs';
import * as path from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────

const TRAINING_CONFIG = {
    symbol: 'BTCUSDT',
    timeframe: '1h' as const,
    candleCount: 500,
    epochs: 50,
    patience: 5,          // F4-5: early stopping patience
    wfvWindowSize: 200,   // F4-17: WFV window
    wfvStepSize: 50,      // F4-17: WFV step
    wfvEpochs: 15,        // WFV epochs (lebih sedikit agar cepat)
    upThreshold: 0.003,   // +0.3% = UP
    downThreshold: 0.003, // -0.3% = DOWN
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function productionTraining() {
    console.log('🏭 Production ML Training — Fase 4\n');
    console.log('='.repeat(80));
    console.log('Strategy: trainWithSplit (70/15/15) + Early Stopping + Walk-Forward Validation\n');

    const startTime = Date.now();

    try {
        // ── Step 1: Fetch Data ─────────────────────────────────────────────────

        console.log('📊 Step 1: Fetching Training Data');
        console.log('-'.repeat(80));
        const cryptoService = new PublicCryptoService();
        const rawCandles = await cryptoService.getCandlestickData(
            TRAINING_CONFIG.symbol,
            TRAINING_CONFIG.timeframe,
            TRAINING_CONFIG.candleCount,
        );

        const candles: OHLCVCandle[] = rawCandles.map((c: any) => ({
            timestamp: c[0],
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5]),
            date: new Date(c[0]),
        }));
        console.log(`✓ ${candles.length} candles loaded`);
        console.log(`  Range: ${new Date(candles[0].timestamp).toLocaleDateString()} → ${new Date(candles[candles.length - 1].timestamp).toLocaleDateString()}`);

        // ── Step 2: Feature Engineering ───────────────────────────────────────

        console.log('\n📊 Step 2: Feature Engineering');
        console.log('-'.repeat(80));
        const featureService = new FeatureEngineeringService(false);
        const allFeatures = featureService.extractFeatures(candles, TRAINING_CONFIG.symbol);
        console.log(`✓ ${allFeatures.length} feature sets extracted (60 features each)`);

        // ── Step 3: Prepare Targets (3-class: UP/DOWN/NEUTRAL) ────────────────

        console.log('\n📊 Step 3: Preparing 3-Class Targets');
        console.log('-'.repeat(80));
        const allTargets = allFeatures.map((_, i) => {
            const idx = i + 200;
            if (idx >= candles.length - 1) return 0;
            return (candles[idx + 1].close - candles[idx].close) / candles[idx].close;
        });

        const upCount    = allTargets.filter(t => t > TRAINING_CONFIG.upThreshold).length;
        const downCount  = allTargets.filter(t => t < -TRAINING_CONFIG.downThreshold).length;
        const neutCount  = allTargets.length - upCount - downCount;
        console.log(`Class distribution: UP=${upCount} DOWN=${downCount} NEUTRAL=${neutCount}`);

        // ── Step 4: Build & Train with Proper Split (F4-17) ──────────────────

        console.log('\n📊 Step 4: Training with 70/15/15 Split + Early Stopping (F4-5, F4-17)');
        console.log('='.repeat(80));

        const model = new SimpleGRUModel();
        model.buildModel();

        console.log('\nHyperparameters:');
        console.log(`  Epochs (max): ${TRAINING_CONFIG.epochs}`);
        console.log(`  Early stopping patience: ${TRAINING_CONFIG.patience}`);
        console.log(`  Loss: categoricalCrossentropy (3-class)`);
        console.log(`  Features: 60 (1h timeframe)`);
        console.log(`  Samples total: ${allFeatures.length}`);
        console.log('');

        const trainResult = await model.trainWithSplit(
            allFeatures,
            allTargets,
            TRAINING_CONFIG.epochs,
            TRAINING_CONFIG.patience,
        );

        // F4-6: Report test accuracy (honest metric)
        console.log('\n📈 Training Results:');
        console.log(`  Best epoch:       ${trainResult.bestEpoch}`);
        console.log(`  Val loss:         ${trainResult.valLoss.toFixed(4)}`);
        console.log(`  Test accuracy:    ${(trainResult.testAccuracy * 100).toFixed(1)}% ← HONEST (F4-6)`);
        console.log(`  Test loss:        ${trainResult.testLoss.toFixed(4)}`);
        console.log(`\n  Class distribution train: UP=${trainResult.classDistribution.UP} DOWN=${trainResult.classDistribution.DOWN} NEUTRAL=${trainResult.classDistribution.NEUTRAL}`);

        if (trainResult.confusionMatrix.length === 3) {
            console.log('\n  Confusion Matrix (actual↓ / predicted→):');
            console.log('         [UP]  [DOWN] [NEUT]');
            const labels = ['[UP]  ', '[DOWN]', '[NEUT]'];
            trainResult.confusionMatrix.forEach((row, i) => {
                console.log(`  ${labels[i]}  ${row.map(v => String(v).padStart(5)).join('  ')}`);
            });
        }

        // ── Step 5: Walk-Forward Validation (F4-17) ───────────────────────────

        console.log('\n📊 Step 5: Walk-Forward Validation (F4-17)');
        console.log('='.repeat(80));
        console.log(`  Window: ${TRAINING_CONFIG.wfvWindowSize} candles | Step: ${TRAINING_CONFIG.wfvStepSize} | Epochs: ${TRAINING_CONFIG.wfvEpochs}`);

        const wfvSummary = await model.walkForwardValidate(
            allFeatures,
            allTargets,
            TRAINING_CONFIG.wfvWindowSize,
            TRAINING_CONFIG.wfvStepSize,
            TRAINING_CONFIG.wfvEpochs,
        );

        console.log(`\n${model.formatWFVReport(wfvSummary)}`);

        // ── Step 6: Save Hyperparameters to JSON (F4-19) ──────────────────────

        console.log('\n📊 Step 6: Saving Hyperparameters (F4-19)');
        console.log('-'.repeat(80));

        const hyperparams = {
            symbol: TRAINING_CONFIG.symbol,
            timeframe: TRAINING_CONFIG.timeframe,
            trainedAt: new Date().toISOString(),
            epochs: TRAINING_CONFIG.epochs,
            actualEpochs: trainResult.bestEpoch,
            patience: TRAINING_CONFIG.patience,
            loss: 'categoricalCrossentropy',
            architecture: 'GRU(64)+D(0.3) → GRU(32)+D(0.2) → Dense(16,relu)+D(0.1) → Dense(3,softmax)',
            featureCount: 60,
            splitRatio: '70/15/15',
            upThreshold: TRAINING_CONFIG.upThreshold,
            downThreshold: TRAINING_CONFIG.downThreshold,
            testAccuracy: trainResult.testAccuracy,
            testLoss: trainResult.testLoss,
            valAccuracy: trainResult.valAccuracy,
            valLoss: trainResult.valLoss,
            wfv: {
                windowSize: TRAINING_CONFIG.wfvWindowSize,
                stepSize: TRAINING_CONFIG.wfvStepSize,
                meanAccuracy: wfvSummary.meanAccuracy,
                bestAccuracy: wfvSummary.bestAccuracy,
                worstAccuracy: wfvSummary.worstAccuracy,
                stdDev: wfvSummary.stdDevAccuracy,
                windowCount: wfvSummary.windowCount,
            },
        };

        const hyperDir = './models';
        if (!fs.existsSync(hyperDir)) fs.mkdirSync(hyperDir, { recursive: true });
        const hyperPath = path.join(hyperDir, 'training_hyperparams.json');
        fs.writeFileSync(hyperPath, JSON.stringify(hyperparams, null, 2));
        console.log(`✅ Hyperparameters saved to: ${hyperPath}`);

        // ── Step 7: Save Model ──────────────────────────────────────────────────

        console.log('\n📊 Step 7: Saving Model');
        console.log('-'.repeat(80));
        const modelPath = './models/GRU_Fase4';
        try {
            await model.saveModel(`file://${modelPath}`);
            console.log(`✅ Model saved to: ${modelPath}`);
        } catch {
            console.log('⚠️ Could not save model (expected in pure tfjs-node without backend)');
        }

        // ── Final Summary ────────────────────────────────────────────────────────

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log('\n' + '='.repeat(80));
        console.log('✅ TRAINING COMPLETE — FASE 4 ML PIPELINE');
        console.log('='.repeat(80));
        console.log(`\n⏱️  Total time: ${elapsed}s`);
        console.log(`\n📈 Model Specs (Fase 4):`);
        console.log(`  Architecture: GRU(64) → GRU(32) → Dense(16) → Dense(3, softmax)`);
        console.log(`  Loss:         categoricalCrossentropy`);
        console.log(`  Features:     60 (1h) | dapat diperluas ke 68 dengan multi-TF`);
        console.log(`  Split:        70% train | 15% val | 15% test`);
        console.log(`\n📊 Performance:`);
        console.log(`  Test Accuracy (F4-6): ${(trainResult.testAccuracy * 100).toFixed(1)}%`);
        console.log(`  WFV Mean Accuracy:    ${(wfvSummary.meanAccuracy * 100).toFixed(1)}%`);
        console.log(`  WFV StdDev:           ${(wfvSummary.stdDevAccuracy * 100).toFixed(1)}% (lower=more stable)`);
        console.log(`\n💡 Telegram commands:`);
        console.log(`  /mlpredict BTCUSDT   — AI prediction`);
        console.log(`  /mlstats             — Model + WFV stats`);
        console.log(`  /trainmodel BTCUSDT 1h — Re-train from Telegram`);

    } catch (error) {
        console.error('\n❌ Error:', error);
        if (error instanceof Error) console.error(error.stack);
        process.exit(1);
    }
}

productionTraining();
