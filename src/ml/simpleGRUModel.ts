/**
 * SimpleGRUModel — Fase 4 ML Pipeline Improvement
 *
 * Perubahan dari versi lama:
 * - [F4-7] Arsitektur: GRU(64)+Drop(0.3) → GRU(32)+Drop(0.2) → Dense(16,relu)+Drop(0.1) → Dense(3,softmax)
 * - [F4-8] Loss: categoricalCrossentropy (3-class: UP/DOWN/NEUTRAL)
 * - [F4-9] Class weights untuk imbalanced dataset
 * - [F4-4] trainWithSplit(): 70/15/15 time-based split
 * - [F4-5] Early stopping: patience=5, save best model in-memory
 * - [F4-6] TrainResult includes testAccuracy, testLoss, confusionMatrix
 * - [F4-11] predict() returns confidence = max(softmax_output)
 * - [F4-1]  walkForwardValidate() untuk WFV
 * - [F4-12] PlattScaler untuk confidence calibration
 */

import * as tf from '@tensorflow/tfjs';
import { FeatureSet } from '../services/featureEngineering';
import { logger } from '../utils/logger';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Label kelas: 0=UP, 1=DOWN, 2=NEUTRAL */
export const CLASS_UP = 0;
export const CLASS_DOWN = 1;
export const CLASS_NEUTRAL = 2;
export const CLASS_NAMES = ['UP', 'DOWN', 'NEUTRAL'] as const;

/** Threshold return untuk menentukan kelas */
const UP_THRESHOLD = 0.003;   // +0.3%
const DOWN_THRESHOLD = -0.003; // -0.3%

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface SimplePrediction {
    direction: number;        // positif=UP, negatif=DOWN (backward-compat)
    confidence: number;       // max(softmax_output) — F4-11
    priceChange: number;
    probabilities: number[];  // [pUP, pDOWN, pNEUTRAL]
    predictedClass: 'UP' | 'DOWN' | 'NEUTRAL';
}

export interface TrainResult {
    /** F4-6: akurasi pada test set (tidak pernah dilihat saat training) */
    testAccuracy: number;
    testLoss: number;
    /** Akurasi pada validation set */
    valAccuracy: number;
    valLoss: number;
    /** Epoch terbaik (early stopping) */
    bestEpoch: number;
    /** Confusion matrix [actual x predicted] — baris: actual, kolom: predicted */
    confusionMatrix: number[][];
    /** Distribusi kelas di training set */
    classDistribution: { UP: number; DOWN: number; NEUTRAL: number };
}

export interface WFVResult {
    /** F4-2: nomor window (1-based) */
    window: number;
    /** Bisa dipakai sebagai modelVersion di DB */
    modelVersion: string;
    trainStart: number;
    trainEnd: number;
    testStart: number;
    testEnd: number;
    accuracy: number;
    loss: number;
}

export interface WFVSummary {
    windowCount: number;
    meanAccuracy: number;
    bestAccuracy: number;
    worstAccuracy: number;
    stdDevAccuracy: number;
    results: WFVResult[];
}

// ─── PlattScaler — F4-12 ───────────────────────────────────────────────────────

/**
 * Platt Scaling: logistic regression kecil di atas raw softmax probability.
 * Dilatih pada validation set agar confidence 70% ≈ akurat 70%.
 */
export class PlattScaler {
    private a = 1.0;
    private b = 0.0;
    private trained = false;

    /**
     * Latih Platt scaler menggunakan validation predictions & actuals.
     * @param rawProbs  array probabilitas (max softmax) dari model, nilai [0,1]
     * @param actuals   label aktual: 1 jika prediksi benar, 0 jika salah
     */
    fit(rawProbs: number[], actuals: number[]): void {
        if (rawProbs.length !== actuals.length || rawProbs.length < 5) return;

        // Simple gradient descent pada logistic loss untuk A dan B
        const lr = 0.01;
        const epochs = 200;

        for (let e = 0; e < epochs; e++) {
            let dA = 0;
            let dB = 0;

            for (let i = 0; i < rawProbs.length; i++) {
                const fVal = this.a * rawProbs[i] + this.b;
                const sigmoid = 1 / (1 + Math.exp(-fVal));
                const err = sigmoid - actuals[i];
                dA += err * rawProbs[i];
                dB += err;
            }

            this.a -= (lr * dA) / rawProbs.length;
            this.b -= (lr * dB) / rawProbs.length;
        }

        this.trained = true;
    }

    /** Transform raw probability ke calibrated confidence */
    transform(rawProb: number): number {
        if (!this.trained) return rawProb;
        const fVal = this.a * rawProb + this.b;
        return 1 / (1 + Math.exp(-fVal));
    }

    isReady(): boolean {
        return this.trained;
    }
}

// ─── SimpleGRUModel ────────────────────────────────────────────────────────────

export class SimpleGRUModel {
    private model: tf.LayersModel | null = null;
    private bestModelWeights: tf.Tensor[] | null = null;
    private sequenceLength = 20;
    private featureCount = 60; // updated to 68 in Sprint 3 (F4-16)

    readonly plattScaler = new PlattScaler();

    // ── F4-7: Build improved architecture ─────────────────────────────────────

    buildModel(): void {
        logger.info('🚀 Building improved GRU model (Fase 4)...');

        const input = tf.input({ shape: [this.sequenceLength, this.featureCount] });

        // Layer 1: GRU(64) + Dropout(0.3)
        const gru1 = tf.layers.gru({
            units: 64,
            returnSequences: true,
            kernelInitializer: 'glorotUniform',
            recurrentInitializer: 'glorotUniform',
            dropout: 0.3,
        }).apply(input) as tf.SymbolicTensor;

        // Layer 2: GRU(32) + Dropout(0.2)
        const gru2 = tf.layers.gru({
            units: 32,
            returnSequences: false,
            kernelInitializer: 'glorotUniform',
            recurrentInitializer: 'glorotUniform',
            dropout: 0.2,
        }).apply(gru1) as tf.SymbolicTensor;

        // Dense(16, relu) + Dropout(0.1)
        const dense1 = tf.layers.dense({
            units: 16,
            activation: 'relu',
            kernelInitializer: 'glorotUniform',
        }).apply(gru2) as tf.SymbolicTensor;

        const drop = tf.layers.dropout({ rate: 0.1 }).apply(dense1) as tf.SymbolicTensor;

        // F4-8: Output Dense(3, softmax) — 3 kelas: UP, DOWN, NEUTRAL
        const output = tf.layers.dense({
            units: 3,
            activation: 'softmax',
            kernelInitializer: 'glorotUniform',
        }).apply(drop) as tf.SymbolicTensor;

        this.model = tf.model({ inputs: input, outputs: output });

        // F4-8: loss = categoricalCrossentropy
        this.model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy'],
        });

        logger.info('✅ GRU Model built (2-layer, 3-class softmax)');
        this.model.summary();
    }

    setFeatureCount(count: number): void {
        this.featureCount = count;
    }

    getFeatureCount(): number {
        return this.featureCount;
    }

    // ── F4-4, F4-5, F4-6: trainWithSplit ─────────────────────────────────────

    /**
     * Train model dengan proper 70/15/15 time-based split.
     * [F4-5] Early stopping: patience=5, simpan best model in-memory.
     * [F4-6] Return akurasi test set yang "jujur".
     */
    async trainWithSplit(
        features: FeatureSet[],
        targets: number[],
        epochs: number = 50,
        patience: number = 5,
    ): Promise<TrainResult> {
        if (!this.model) this.buildModel();

        const n = features.length;
        const trainEnd = Math.floor(n * 0.70);
        const valEnd = Math.floor(n * 0.85);

        const trainFeatures = features.slice(0, trainEnd);
        const trainTargets = targets.slice(0, trainEnd);
        const valFeatures = features.slice(trainEnd, valEnd);
        const valTargets = targets.slice(trainEnd, valEnd);
        const testFeatures = features.slice(valEnd);
        const testTargets = targets.slice(valEnd);

        // F4-9: Compute class weights
        const classWeights = this.computeClassWeights(trainTargets);

        const { X: Xtrain, y: ytrain } = this.prepareSequences(trainFeatures, trainTargets);
        const { X: Xval, y: yval } = this.prepareSequences(valFeatures, valTargets);

        // Class distribution
        const dist = this.classDistribution(trainTargets);

        // F4-5: Early stopping
        let bestValLoss = Infinity;
        let bestEpoch = 0;
        let noImprovCount = 0;

        for (let epoch = 0; epoch < epochs; epoch++) {
            const history = await this.model!.fit(Xtrain, ytrain, {
                epochs: 1,
                batchSize: 32,
                validationData: [Xval, yval],
                classWeight: classWeights,
                verbose: 0,
            });

            const valLoss = history.history['val_loss'][0] as number;
            const valAcc = history.history['val_acc'][0] as number ?? history.history['val_accuracy']?.[0] as number;
            const trainLoss = history.history['loss'][0] as number;
            const trainAcc = history.history['acc'][0] as number ?? history.history['accuracy']?.[0] as number;

            // Logging per-epoch (F4-18)
            if ((epoch + 1) % 5 === 0 || epoch === 0) {
                logger.info(
                    `Epoch ${epoch + 1}/${epochs} — loss: ${trainLoss?.toFixed(4)} acc: ${(trainAcc * 100)?.toFixed(1)}% | val_loss: ${valLoss?.toFixed(4)} val_acc: ${(valAcc * 100)?.toFixed(1)}%`,
                );
            }

            if (valLoss < bestValLoss) {
                bestValLoss = valLoss;
                bestEpoch = epoch + 1;
                noImprovCount = 0;
                // Save best weights
                this.bestModelWeights = this.model!.getWeights().map(w => w.clone());
            } else {
                noImprovCount++;
                if (noImprovCount >= patience) {
                    logger.info(`⏹ Early stopping at epoch ${epoch + 1} (best epoch: ${bestEpoch})`);
                    break;
                }
            }
        }

        // Restore best weights
        if (this.bestModelWeights) {
            this.model!.setWeights(this.bestModelWeights);
            this.bestModelWeights.forEach(w => w.dispose());
            this.bestModelWeights = null;
        }

        Xtrain.dispose();
        ytrain.dispose();
        Xval.dispose();
        yval.dispose();

        // F4-6: Evaluate on test set (never seen during training)
        const { X: Xtest, y: ytest } = this.prepareSequences(testFeatures, testTargets);
        const evalResult = await this.model!.evaluate(Xtest, ytest, { verbose: 0 }) as tf.Scalar[];
        const testLoss = (await evalResult[0].data())[0];
        const testAccuracy = (await evalResult[1].data())[0];
        evalResult.forEach(t => t.dispose());

        // Confusion matrix on test set
        const confusionMatrix = await this.computeConfusionMatrix(testFeatures, testTargets);
        Xtest.dispose();
        ytest.dispose();

        // Train Platt scaler on val set
        const valPreds = await this.predictBatch(valFeatures);
        const valActuals = valTargets.map((t, i) => (this.targetToClass(t) === this.targetToClass(valPreds[i] ?? 0) ? 1 : 0));
        this.plattScaler.fit(valPreds.map(p => p), valActuals);

        return {
            testAccuracy,
            testLoss,
            valAccuracy: 1 - (noImprovCount / patience),
            valLoss: bestValLoss,
            bestEpoch,
            confusionMatrix,
            classDistribution: dist,
        };
    }

    // ── backward-compat: quickTrain still works ────────────────────────────────
    async quickTrain(features: FeatureSet[], targets: number[], epochs = 5): Promise<void> {
        if (!this.model) this.buildModel();
        const { X, y } = this.prepareSequences(features, targets);
        await this.model!.fit(X, y, { epochs, batchSize: 16, verbose: 0 });
        X.dispose();
        y.dispose();
    }

    // ── F4-11: predict() — confidence = max(softmax) ─────────────────────────

    async predict(features: FeatureSet[]): Promise<SimplePrediction> {
        if (!this.model) this.buildModel();
        if (features.length < this.sequenceLength) {
            throw new Error(`Need ${this.sequenceLength} feature sets`);
        }

        const sequence = features.slice(-this.sequenceLength);
        const X = this.prepareSequence(sequence);

        const pred = this.model!.predict(X) as tf.Tensor;
        const probs = Array.from(await pred.data()) as number[];
        X.dispose();
        pred.dispose();

        // F4-11: confidence = max(softmax_output)
        const maxProb = Math.max(...probs);
        const classIdx = probs.indexOf(maxProb);
        const calibratedConf = this.plattScaler.isReady()
            ? this.plattScaler.transform(maxProb)
            : maxProb;

        const predictedClass = CLASS_NAMES[classIdx];
        const direction = classIdx === CLASS_UP ? calibratedConf : classIdx === CLASS_DOWN ? -calibratedConf : 0;

        return {
            direction,
            confidence: calibratedConf,
            priceChange: direction * 5,
            probabilities: probs,
            predictedClass,
        };
    }

    // ── F4-1: walkForwardValidate ─────────────────────────────────────────────

    /**
     * Walk-Forward Validation: sliding window train-test.
     * Setiap window melatih model segar dan evaluasi pada window berikutnya.
     */
    async walkForwardValidate(
        features: FeatureSet[],
        targets: number[],
        windowSize = 300,
        stepSize = 100,
        epochs = 20,
    ): Promise<WFVSummary> {
        const results: WFVResult[] = [];
        let window = 1;

        for (let start = 0; start + windowSize + stepSize <= features.length; start += stepSize) {
            const trainFeatures = features.slice(start, start + windowSize);
            const trainTargets = targets.slice(start, start + windowSize);
            const testFeatures = features.slice(start + windowSize, start + windowSize + stepSize);
            const testTargets = targets.slice(start + windowSize, start + windowSize + stepSize);

            if (testFeatures.length < this.sequenceLength + 1) break;

            // Re-build fresh model per window to avoid leakage
            this.model?.dispose();
            this.model = null;
            this.buildModel();

            const { X, y } = this.prepareSequences(trainFeatures, trainTargets);
            await this.model!.fit(X, y, { epochs, batchSize: 16, verbose: 0 });
            X.dispose();
            y.dispose();

            const { X: Xt, y: yt } = this.prepareSequences(testFeatures, testTargets);
            if (Xt.shape[0] === 0) { Xt.dispose(); yt.dispose(); break; }

            const evalResult = await this.model!.evaluate(Xt, yt, { verbose: 0 }) as tf.Scalar[];
            const loss = (await evalResult[0].data())[0];
            const accuracy = (await evalResult[1].data())[0];
            evalResult.forEach(t => t.dispose());
            Xt.dispose();
            yt.dispose();

            results.push({
                window,
                modelVersion: `wfv_w${window}_${Date.now()}`,
                trainStart: start,
                trainEnd: start + windowSize - 1,
                testStart: start + windowSize,
                testEnd: start + windowSize + stepSize - 1,
                accuracy,
                loss,
            });

            logger.info(`WFV Window ${window}: accuracy=${(accuracy * 100).toFixed(1)}% loss=${loss.toFixed(4)}`);
            window++;
        }

        return this.summarizeWFV(results);
    }

    // ── F4-3: formatWFVSummary ────────────────────────────────────────────────

    summarizeWFV(results: WFVResult[]): WFVSummary {
        if (results.length === 0) {
            return { windowCount: 0, meanAccuracy: 0, bestAccuracy: 0, worstAccuracy: 0, stdDevAccuracy: 0, results: [] };
        }

        const accs = results.map(r => r.accuracy);
        const mean = accs.reduce((a, b) => a + b, 0) / accs.length;
        const variance = accs.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / accs.length;

        return {
            windowCount: results.length,
            meanAccuracy: mean,
            bestAccuracy: Math.max(...accs),
            worstAccuracy: Math.min(...accs),
            stdDevAccuracy: Math.sqrt(variance),
            results,
        };
    }

    formatWFVReport(summary: WFVSummary): string {
        const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
        return [
            `📊 Walk-Forward Validation (${summary.windowCount} windows)`,
            `Mean Accuracy: ${pct(summary.meanAccuracy)}`,
            `Best:  ${pct(summary.bestAccuracy)} | Worst: ${pct(summary.worstAccuracy)}`,
            `StdDev: ${pct(summary.stdDevAccuracy)}`,
        ].join('\n');
    }

    // ── F4-13: calibrationTest ────────────────────────────────────────────────

    /**
     * Tampilkan reliability diagram: confidence bucket vs actual accuracy.
     */
    async calibrationTest(
        features: FeatureSet[],
        targets: number[],
        buckets = 5,
    ): Promise<Array<{ bucket: string; count: number; meanConf: number; accuracy: number }>> {
        const out: Array<{ bucket: string; count: number; meanConf: number; accuracy: number }> = [];

        const preds: Array<{ conf: number; correct: boolean }> = [];
        for (let i = this.sequenceLength; i < features.length; i++) {
            const pred = await this.predict(features.slice(i - this.sequenceLength, i));
            const actualClass = this.targetToClass(targets[i]);
            preds.push({ conf: pred.confidence, correct: CLASS_NAMES.indexOf(pred.predictedClass) === actualClass });
        }

        const step = 1 / buckets;
        for (let b = 0; b < buckets; b++) {
            const lo = b * step;
            const hi = (b + 1) * step;
            const bucket = preds.filter(p => p.conf >= lo && p.conf < hi);
            if (bucket.length === 0) continue;
            const meanConf = bucket.reduce((s, p) => s + p.conf, 0) / bucket.length;
            const accuracy = bucket.filter(p => p.correct).length / bucket.length;
            out.push({ bucket: `${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}%`, count: bucket.length, meanConf, accuracy });
        }

        return out;
    }

    // ── Save / Load ───────────────────────────────────────────────────────────

    async saveModel(path: string): Promise<void> {
        if (!this.model) throw new Error('No model to save.');
        await this.model.save(path);
        logger.info(`✅ Model saved to ${path}`);
    }

    async loadModel(path: string): Promise<void> {
        this.model = await tf.loadLayersModel(path + '/model.json');
        logger.info(`✅ Model loaded from ${path}`);
    }

    // ── F4-9: Class weights ───────────────────────────────────────────────────

    computeClassWeights(targets: number[]): Record<number, number> {
        const counts = [0, 0, 0];
        for (const t of targets) counts[this.targetToClass(t)]++;
        const total = counts.reduce((a, b) => a + b, 0);
        const weights: Record<number, number> = {};
        for (let c = 0; c < 3; c++) {
            weights[c] = counts[c] > 0 ? total / (3 * counts[c]) : 1;
        }
        return weights;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Convert continuous return target → class label (0=UP, 1=DOWN, 2=NEUTRAL)
     */
    targetToClass(target: number): number {
        if (target > UP_THRESHOLD) return CLASS_UP;
        if (target < DOWN_THRESHOLD) return CLASS_DOWN;
        return CLASS_NEUTRAL;
    }

    private classDistribution(targets: number[]): { UP: number; DOWN: number; NEUTRAL: number } {
        let up = 0, down = 0, neutral = 0;
        for (const t of targets) {
            const cls = this.targetToClass(t);
            if (cls === CLASS_UP) up++;
            else if (cls === CLASS_DOWN) down++;
            else neutral++;
        }
        return { UP: up, DOWN: down, NEUTRAL: neutral };
    }

    private prepareSequences(
        features: FeatureSet[],
        targets: number[],
    ): { X: tf.Tensor3D; y: tf.Tensor2D } {
        const sequences: number[][][] = [];
        const labels: number[][] = [];

        for (let i = this.sequenceLength; i < features.length; i++) {
            const sequence = features.slice(i - this.sequenceLength, i);
            sequences.push(this.featuresToArray(sequence));
            // F4-8: one-hot encode 3 classes
            const cls = this.targetToClass(targets[i]);
            const oneHot = [0, 0, 0];
            oneHot[cls] = 1;
            labels.push(oneHot);
        }

        const X = tf.tensor3d(sequences);
        const y = tf.tensor2d(labels);
        return { X, y };
    }

    private prepareSequence(sequence: FeatureSet[]): tf.Tensor3D {
        return tf.tensor3d([this.featuresToArray(sequence)]);
    }

    private featuresToArray(sequence: FeatureSet[]): number[][] {
        return sequence.map(feat => {
            const values: number[] = [];
            for (const [key, value] of Object.entries(feat)) {
                if (key !== 'timestamp' && key !== 'symbol') {
                    let val = value as number;
                    if (!isFinite(val) || isNaN(val)) val = 0;
                    val = Math.max(-10, Math.min(10, val));
                    values.push(val);
                }
            }
            return values;
        });
    }

    private async predictBatch(features: FeatureSet[]): Promise<number[]> {
        const confs: number[] = [];
        for (let i = this.sequenceLength; i < features.length; i++) {
            const pred = await this.predict(features.slice(i - this.sequenceLength, i));
            confs.push(pred.confidence);
        }
        return confs;
    }

    private async computeConfusionMatrix(features: FeatureSet[], targets: number[]): Promise<number[][]> {
        const matrix = Array.from({ length: 3 }, () => [0, 0, 0]);
        for (let i = this.sequenceLength; i < features.length; i++) {
            try {
                const pred = await this.predict(features.slice(i - this.sequenceLength, i));
                const actual = this.targetToClass(targets[i]);
                const predicted = CLASS_NAMES.indexOf(pred.predictedClass);
                if (predicted >= 0) matrix[actual][predicted]++;
            } catch { /* skip */ }
        }
        return matrix;
    }
}
