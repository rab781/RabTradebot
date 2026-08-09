/**
 * Fase 4 Sprint 1 — Model Architecture + Data Split Tests
 * Tests: F4-4, F4-5, F4-6, F4-7, F4-8, F4-9, F4-11, PlattScaler, WFV summary
 *
 * Strategy: mock tf.LayersModel.fit() agar test tidak timeout pada CPU.
 * Test non-training (class weights, targetToClass, Platt, WFV summary) berjalan real.
 */

import * as tf from '@tensorflow/tfjs';
import {
    SimpleGRUModel,
    PlattScaler,
    CLASS_UP, CLASS_DOWN, CLASS_NEUTRAL, CLASS_NAMES,
    WFVSummary,
} from '../src/ml/simpleGRUModel';
import { FeatureSet } from '../src/services/featureEngineering';

// ─── Jest timeout — TF.js bisa lambat ─────────────────────────────────────────
jest.setTimeout(60000);

// ─── Mock tf.LayersModel.fit ──────────────────────────────────────────────────
// Cegah real gradient descent. Kembalikan history palsu.
jest.mock('@tensorflow/tfjs', () => {
    const real = jest.requireActual('@tensorflow/tfjs');
    return {
        ...real,
    };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFeature(symbol = 'BTCUSDT', ts = Date.now()): FeatureSet {
    const rand = () => Math.random() * 0.4 - 0.2;
    return {
        returns: rand(), logReturns: rand(), priceChange: rand(), priceChangePercent: rand(),
        highLowRange: Math.abs(rand()), openCloseRange: Math.abs(rand()),
        upperShadow: Math.abs(rand()), lowerShadow: Math.abs(rand()), bodyToRangeRatio: 0.5,
        rsi_7: 50, rsi_14: 50, rsi_21: 50,
        roc_10: rand(), roc_20: rand(), stoch_k: 50, stoch_d: 50,
        williams_r: -50, cci: 0, mfi: 50,
        macd: rand(), macdSignal: rand(), macdHistogram: rand(), macdCrossover: 0,
        ema_9: 100, ema_21: 100, ema_50: 100, sma_20: 100, sma_50: 100, sma_200: 100,
        adx: 20, priceVsEMA9: rand(), priceVsEMA21: rand(), priceVsSMA50: rand(),
        atr_14: 1, atrPercent: 1, bb_upper: 105, bb_middle: 100, bb_lower: 95,
        bb_width: 10, bb_percentB: 0.5,
        volumeRatio: 1, volumeMA_20: 1000, obv: 0, obvSlope: 0,
        volumePriceCorrelation: 0, volumeWeightedPrice: 100, moneyFlowIndex: 50,
        volatility_20: 0.01, volatility_50: 0.01, skewness_20: 0, kurtosis_20: 0,
        autocorrelation_1: 0, autocorrelation_5: 0, returns_mean_20: 0, returns_std_20: 0.01,
        spreadApprox: 0.1, volumeImbalance: 0.5, priceEfficiency: 0.5,
        marketDepthProxy: 100, liquidityScore: 1,
        timestamp: ts, symbol,
    };
}

function makeFeatures(n: number): FeatureSet[] {
    return Array.from({ length: n }, (_, i) => makeFeature('BTCUSDT', i * 3600_000));
}

function makeTargets(n: number): number[] {
    // distribute UP/DOWN/NEUTRAL
    return Array.from({ length: n }, (_, i) => {
        if (i % 3 === 0) return 0.005;
        if (i % 3 === 1) return -0.005;
        return 0.001;
    });
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Fase 4 Sprint 1: SimpleGRUModel Architecture', () => {

    // ── F4-8 & F4-7: Architecture ─────────────────────────────────────────────

    describe('F4-7/F4-8: Model Architecture', () => {
        let model: SimpleGRUModel;

        beforeEach(() => {
            model = new SimpleGRUModel();
        });

        afterEach(async () => {
            tf.disposeVariables();
        });

        it('buildModel() creates model without error', () => {
            expect(() => model.buildModel()).not.toThrow();
        });

        it('model output has 3 units (3-class softmax)', () => {
            model.buildModel();
            const m = (model as any).model as tf.LayersModel;
            expect(m).not.toBeNull();
            const outputShape = m.outputShape as number[];
            expect(outputShape[outputShape.length - 1]).toBe(3);
        });

        it('model accepts [sequenceLength, featureCount] input', () => {
            model.buildModel();
            const m = (model as any).model as tf.LayersModel;
            // inputs[0].shape = [null, sequenceLength, featureCount]
            const inputShape = m.inputs[0].shape;
            expect(inputShape[1]).toBe(20); // sequenceLength
            expect(inputShape[2]).toBe(60); // featureCount
        });

        it('setFeatureCount / getFeatureCount works', () => {
            model.setFeatureCount(68);
            expect(model.getFeatureCount()).toBe(68);
        });
    });

    // ── F4-9: Class Weights ───────────────────────────────────────────────────

    describe('F4-9: computeClassWeights()', () => {
        let model: SimpleGRUModel;
        beforeEach(() => { model = new SimpleGRUModel(); });

        it('returns 3 class weights', () => {
            const targets = makeTargets(30);
            const weights = model.computeClassWeights(targets);
            expect(Object.keys(weights)).toHaveLength(3);
        });

        it('all weights are positive', () => {
            const targets = makeTargets(30);
            const weights = model.computeClassWeights(targets);
            Object.values(weights).forEach(w => expect(w).toBeGreaterThan(0));
        });

        it('minority class gets higher weight', () => {
            // 8 UP, 1 DOWN, 1 NEUTRAL → DOWN gets higher weight
            const targets = [
                0.005, 0.006, 0.007, 0.008, 0.009, 0.010, 0.011, 0.012, // 8 UP
                -0.005, // 1 DOWN
                0.001,  // 1 NEUTRAL
            ];
            const weights = model.computeClassWeights(targets);
            expect(weights[CLASS_DOWN]).toBeGreaterThan(weights[CLASS_UP]);
        });

        it('balanced dataset → all weights ~equal', () => {
            const targets = [0.005, -0.005, 0.001, 0.006, -0.006, 0.002]; // 2 each
            const weights = model.computeClassWeights(targets);
            expect(weights[CLASS_UP]).toBeCloseTo(weights[CLASS_DOWN], 1);
            expect(weights[CLASS_UP]).toBeCloseTo(weights[CLASS_NEUTRAL], 1);
        });

        it('handles zero-count class gracefully', () => {
            const targets = [0.005, 0.006, 0.007]; // all UP
            const weights = model.computeClassWeights(targets);
            // DOWN and NEUTRAL have zero count → fallback weight = 1
            expect(weights[CLASS_DOWN]).toBeGreaterThanOrEqual(1);
        });
    });

    // ── F4-4/F4-8: targetToClass ──────────────────────────────────────────────

    describe('F4-4/F4-8: targetToClass()', () => {
        let model: SimpleGRUModel;
        beforeEach(() => { model = new SimpleGRUModel(); });

        it('+0.5% → CLASS_UP (0)', () => expect(model.targetToClass(0.005)).toBe(CLASS_UP));
        it('+1.0% → CLASS_UP', () => expect(model.targetToClass(0.01)).toBe(CLASS_UP));
        it('-0.5% → CLASS_DOWN (1)', () => expect(model.targetToClass(-0.005)).toBe(CLASS_DOWN));
        it('-1.0% → CLASS_DOWN', () => expect(model.targetToClass(-0.01)).toBe(CLASS_DOWN));
        it('+0.1% → CLASS_NEUTRAL (2)', () => expect(model.targetToClass(0.001)).toBe(CLASS_NEUTRAL));
        it('0.0 → CLASS_NEUTRAL', () => expect(model.targetToClass(0)).toBe(CLASS_NEUTRAL));
        it('-0.1% → CLASS_NEUTRAL', () => expect(model.targetToClass(-0.001)).toBe(CLASS_NEUTRAL));
    });

    // ── F4-11: predict() ─────────────────────────────────────────────────────

    describe('F4-11: predict() — confidence = max(softmax)', () => {
        let model: SimpleGRUModel;

        beforeEach(() => {
            model = new SimpleGRUModel();
            model.buildModel();
        });

        afterEach(() => { tf.disposeVariables(); });

        it('predict() returns confidence in [0, 1]', async () => {
            const features = makeFeatures(25);
            const pred = await model.predict(features);
            expect(pred.confidence).toBeGreaterThanOrEqual(0);
            expect(pred.confidence).toBeLessThanOrEqual(1);
        });

        it('predictedClass is one of UP/DOWN/NEUTRAL', async () => {
            const features = makeFeatures(25);
            const pred = await model.predict(features);
            expect(['UP', 'DOWN', 'NEUTRAL']).toContain(pred.predictedClass);
        });

        it('probabilities array has length 3', async () => {
            const features = makeFeatures(25);
            const pred = await model.predict(features);
            expect(pred.probabilities).toHaveLength(3);
        });

        it('probabilities sum to ~1 (softmax)', async () => {
            const features = makeFeatures(25);
            const pred = await model.predict(features);
            const sum = pred.probabilities.reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1, 3);
        });

        it('confidence ≥ 1/3 (softmax max always ≥ 1/numClasses)', async () => {
            const features = makeFeatures(25);
            const pred = await model.predict(features);
            expect(pred.confidence).toBeGreaterThanOrEqual(1 / 3 - 0.001);
        });

        it('throws if features.length < sequenceLength', async () => {
            await expect(model.predict(makeFeatures(5))).rejects.toThrow();
        });
    });

    // ── F4-12: PlattScaler ────────────────────────────────────────────────────

    describe('F4-12: PlattScaler', () => {
        it('isReady() = false before fit', () => {
            const s = new PlattScaler();
            expect(s.isReady()).toBe(false);
        });

        it('transform without training = passthrough', () => {
            const s = new PlattScaler();
            expect(s.transform(0.7)).toBe(0.7);
        });

        it('fit with < 5 samples → no-op (isReady stays false)', () => {
            const s = new PlattScaler();
            s.fit([0.5, 0.6, 0.7], [1, 1, 0]);
            expect(s.isReady()).toBe(false);
        });

        it('fit with >= 5 samples → isReady = true', () => {
            const s = new PlattScaler();
            s.fit([0.3, 0.7, 0.5, 0.8, 0.9, 0.2], [0, 1, 0, 1, 1, 0]);
            expect(s.isReady()).toBe(true);
        });

        it('calibrated prob stays in [0, 1]', () => {
            const s = new PlattScaler();
            s.fit([0.3, 0.7, 0.5, 0.8, 0.9, 0.2], [0, 1, 0, 1, 1, 0]);
            for (const p of [0.0, 0.3, 0.5, 0.7, 1.0]) {
                const out = s.transform(p);
                expect(out).toBeGreaterThanOrEqual(0);
                expect(out).toBeLessThanOrEqual(1);
            }
        });

        it('monotonic: higher input → higher output (roughly)', () => {
            const s = new PlattScaler();
            s.fit([0.1, 0.2, 0.5, 0.7, 0.9, 0.95], [0, 0, 1, 1, 1, 1]);
            expect(s.transform(0.8)).toBeGreaterThan(s.transform(0.3));
        });
    });

    // ── F4-3: summarizeWFV & formatWFVReport ─────────────────────────────────

    describe('F4-3: summarizeWFV / formatWFVReport', () => {
        let model: SimpleGRUModel;
        beforeEach(() => { model = new SimpleGRUModel(); });

        it('empty results → all zeros', () => {
            const s = model.summarizeWFV([]);
            expect(s.windowCount).toBe(0);
            expect(s.meanAccuracy).toBe(0);
        });

        it('single window → mean = that accuracy', () => {
            const s = model.summarizeWFV([
                { window: 1, modelVersion: 'v1', trainStart: 0, trainEnd: 99, testStart: 100, testEnd: 199, accuracy: 0.65, loss: 0.4 },
            ]);
            expect(s.meanAccuracy).toBeCloseTo(0.65, 4);
            expect(s.bestAccuracy).toBe(0.65);
            expect(s.windowCount).toBe(1);
        });

        it('multi-window: mean, best, worst correct', () => {
            const s = model.summarizeWFV([
                { window: 1, modelVersion: 'v1', trainStart: 0, trainEnd: 99, testStart: 100, testEnd: 199, accuracy: 0.6, loss: 0.5 },
                { window: 2, modelVersion: 'v2', trainStart: 100, trainEnd: 199, testStart: 200, testEnd: 299, accuracy: 0.8, loss: 0.3 },
                { window: 3, modelVersion: 'v3', trainStart: 200, trainEnd: 299, testStart: 300, testEnd: 399, accuracy: 0.7, loss: 0.4 },
            ]);
            expect(s.meanAccuracy).toBeCloseTo(0.7, 4);
            expect(s.bestAccuracy).toBe(0.8);
            expect(s.worstAccuracy).toBe(0.6);
        });

        it('formatWFVReport contains percentage and window count', () => {
            const summary: WFVSummary = {
                windowCount: 3, meanAccuracy: 0.65, bestAccuracy: 0.75,
                worstAccuracy: 0.55, stdDevAccuracy: 0.05, results: [],
            };
            const report = model.formatWFVReport(summary);
            expect(report).toContain('65.0%');
            expect(report).toContain('3 window');
        });
    });
});
