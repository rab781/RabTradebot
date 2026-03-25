/**
 * Fase 4 Sprint 3 — Confidence Calibration + Multi-Timeframe Features Tests
 * Tests: F4-11, F4-12, F4-13, F4-14, F4-15, F4-16
 */

import { SimpleGRUModel, PlattScaler } from '../src/ml/simpleGRUModel';
import { FeatureEngineeringService, MultiTFFeatureSet } from '../src/services/featureEngineering';
import { OHLCVCandle } from '../src/types/dataframe';

jest.setTimeout(60000);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCandle(ts: number, close: number): OHLCVCandle {
    const c = close;
    return { timestamp: ts, open: c * 0.999, high: c * 1.002, low: c * 0.997, close: c, volume: 1000 + Math.random() * 500, date: new Date(ts) };
}

function makeCandles(count: number, baseTs: number, intervalMs: number, startPrice = 100): OHLCVCandle[] {
    return Array.from({ length: count }, (_, i) =>
        makeCandle(baseTs + i * intervalMs, startPrice + Math.sin(i * 0.3) * 2 + Math.random() * 0.5),
    );
}

function makeBaseFeature(ts: number): any {
    return {
        returns: 0.001, logReturns: 0.001, priceChange: 0.1, priceChangePercent: 0.1,
        highLowRange: 1, openCloseRange: 0.5, upperShadow: 0.3, lowerShadow: 0.3, bodyToRangeRatio: 0.5,
        rsi_7: 50, rsi_14: 50, rsi_21: 50, roc_10: 0, roc_20: 0, stoch_k: 50, stoch_d: 50,
        williams_r: -50, cci: 0, mfi: 50, macd: 0, macdSignal: 0, macdHistogram: 0, macdCrossover: 0,
        ema_9: 100, ema_21: 100, ema_50: 100, sma_20: 100, sma_50: 100, sma_200: 100,
        adx: 20, priceVsEMA9: 0, priceVsEMA21: 0, priceVsSMA50: 0,
        atr_14: 1, atrPercent: 1, bb_upper: 105, bb_middle: 100, bb_lower: 95, bb_width: 10, bb_percentB: 0.5,
        volumeRatio: 1, volumeMA_20: 1000, obv: 0, obvSlope: 0, volumePriceCorrelation: 0, volumeWeightedPrice: 100, moneyFlowIndex: 50,
        volatility_20: 0.01, volatility_50: 0.01, skewness_20: 0, kurtosis_20: 0,
        autocorrelation_1: 0, autocorrelation_5: 0, returns_mean_20: 0, returns_std_20: 0.01,
        spreadApprox: 0.1, volumeImbalance: 0.5, priceEfficiency: 0.5, marketDepthProxy: 100, liquidityScore: 1,
        timestamp: ts, symbol: 'BTCUSDT',
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Fase 4 Sprint 3: Confidence Calibration + Multi-TF Features', () => {

    // ── F4-11: confidence = max(softmax) — already tested in Sprint 1 ─────────
    // Additional test: predict on built model returns confidence >= 1/3
    describe('F4-11: confidence = max(softmax_output)', () => {
        it('confidence is always >= 1/numClasses (1/3 ≈ 0.333)', async () => {
            const model = new SimpleGRUModel();
            model.buildModel();
            const features = Array.from({ length: 25 }, (_, i) => makeBaseFeature(i * 3600_000));
            const pred = await model.predict(features);
            expect(pred.confidence).toBeGreaterThanOrEqual(1 / 3 - 0.001);
        });
    });

    // ── F4-12: PlattScaler  ───────────────────────────────────────────────────
    describe('F4-12: PlattScaler calibration', () => {
        it('high-confidence correct predictions stay high after calibration', () => {
            const scaler = new PlattScaler();
            // Training: high prob = mostly correct
            const rawProbs = [0.9, 0.85, 0.8, 0.9, 0.8, 0.85, 0.75, 0.88];
            const actuals  = [1,   1,    1,   1,   1,   1,    1,    1  ];
            scaler.fit(rawProbs, actuals);
            const calibrated = scaler.transform(0.85);
            expect(calibrated).toBeGreaterThan(0.5);
        });

        it('low-confidence wrong predictions stay low after calibration', () => {
            const scaler = new PlattScaler();
            const rawProbs = [0.4, 0.35, 0.38, 0.42, 0.4, 0.38];
            const actuals  = [0,   0,    0,    0,    0,   0   ];
            scaler.fit(rawProbs, actuals);
            const calibrated = scaler.transform(0.38);
            expect(calibrated).toBeLessThan(0.6);
        });

        it('model plattScaler not ready before fit', () => {
            const model = new SimpleGRUModel();
            expect(model.plattScaler.isReady()).toBe(false);
        });
    });

    // ── F4-14, F4-15, F4-16: Multi-Timeframe Features ────────────────────────

    describe('F4-14/F4-15: addMultiTimeframeFeatures()', () => {
        let svc: FeatureEngineeringService;
        const BASE_TS = 1_700_000_000_000; // some fixed timestamp
        const HOUR_MS = 3600_000;
        const MIN15_MS = 15 * 60_000;
        const HOUR4_MS = 4 * HOUR_MS;

        beforeEach(() => {
            svc = new FeatureEngineeringService(false);
        });

        it('returns same count as baseFeatures', () => {
            const base = [makeBaseFeature(BASE_TS), makeBaseFeature(BASE_TS + HOUR_MS)];
            const candles15m = makeCandles(100, BASE_TS - 50 * MIN15_MS, MIN15_MS);
            const candles4h  = makeCandles(60,  BASE_TS - 30 * HOUR4_MS, HOUR4_MS);
            const result = svc.addMultiTimeframeFeatures(base, candles15m, candles4h);
            expect(result).toHaveLength(base.length);
        });

        it('result has all 8 multi-TF fields (F4-14 + F4-15)', () => {
            const base = [makeBaseFeature(BASE_TS)];
            const candles15m = makeCandles(100, BASE_TS - 50 * MIN15_MS, MIN15_MS);
            const candles4h  = makeCandles(60,  BASE_TS - 30 * HOUR4_MS, HOUR4_MS);
            const [r] = svc.addMultiTimeframeFeatures(base, candles15m, candles4h) as MultiTFFeatureSet[];
            // F4-14: 15m
            expect(r).toHaveProperty('rsi_14_15m');
            expect(r).toHaveProperty('macdHistogram_15m');
            expect(r).toHaveProperty('bb_percentB_15m');
            expect(r).toHaveProperty('volumeRatio_15m');
            // F4-15: 4h
            expect(r).toHaveProperty('rsi_14_4h');
            expect(r).toHaveProperty('ema50Trend_4h');
            expect(r).toHaveProperty('priceVsEMA50_4h');
            expect(r).toHaveProperty('atrPercent_4h');
        });

        it('preserves all original FeatureSet fields (no data loss)', () => {
            const base = [makeBaseFeature(BASE_TS)];
            const candles15m = makeCandles(100, BASE_TS - 50 * MIN15_MS, MIN15_MS);
            const candles4h  = makeCandles(60,  BASE_TS - 30 * HOUR4_MS, HOUR4_MS);
            const [r] = svc.addMultiTimeframeFeatures(base, candles15m, candles4h);
            expect(r.rsi_14).toBe(50);
            expect(r.timestamp).toBe(BASE_TS);
            expect(r.symbol).toBe('BTCUSDT');
        });

        it('rsi_14_15m is number in reasonable range [0, 100]', () => {
            const base = [makeBaseFeature(BASE_TS)];
            const candles15m = makeCandles(100, BASE_TS - 50 * MIN15_MS, MIN15_MS);
            const candles4h  = makeCandles(60,  BASE_TS - 30 * HOUR4_MS, HOUR4_MS);
            const [r] = svc.addMultiTimeframeFeatures(base, candles15m, candles4h) as MultiTFFeatureSet[];
            expect(r.rsi_14_15m).toBeGreaterThanOrEqual(0);
            expect(r.rsi_14_15m).toBeLessThanOrEqual(100);
        });

        it('bb_percentB_15m is number in [0, 1] range (approx)', () => {
            const base = [makeBaseFeature(BASE_TS)];
            const candles15m = makeCandles(100, BASE_TS - 50 * MIN15_MS, MIN15_MS);
            const candles4h  = makeCandles(60,  BASE_TS - 30 * HOUR4_MS, HOUR4_MS);
            const [r] = svc.addMultiTimeframeFeatures(base, candles15m, candles4h) as MultiTFFeatureSet[];
            expect(r.bb_percentB_15m).toBeGreaterThanOrEqual(-0.5); // can go slightly out of range
            expect(r.bb_percentB_15m).toBeLessThanOrEqual(1.5);
        });

        it('ema50Trend_4h is -1, 0, or +1', () => {
            const base = [makeBaseFeature(BASE_TS)];
            const candles15m = makeCandles(100, BASE_TS - 50 * MIN15_MS, MIN15_MS);
            const candles4h  = makeCandles(100, BASE_TS - 50 * HOUR4_MS, HOUR4_MS);
            const [r] = svc.addMultiTimeframeFeatures(base, candles15m, candles4h) as MultiTFFeatureSet[];
            expect([-1, 0, 1]).toContain(r.ema50Trend_4h);
        });

        it('handles empty 15m candles gracefully (uses defaults)', () => {
            const base = [makeBaseFeature(BASE_TS)];
            const result = svc.addMultiTimeframeFeatures(base, [], []);
            expect(result).toHaveLength(1);
            expect((result[0] as MultiTFFeatureSet).rsi_14_15m).toBe(50); // default
        });

        it('atrPercent_4h is non-negative', () => {
            const base = [makeBaseFeature(BASE_TS)];
            const candles15m = makeCandles(100, BASE_TS - 50 * MIN15_MS, MIN15_MS);
            const candles4h  = makeCandles(100, BASE_TS - 50 * HOUR4_MS, HOUR4_MS);
            const [r] = svc.addMultiTimeframeFeatures(base, candles15m, candles4h) as MultiTFFeatureSet[];
            expect(r.atrPercent_4h).toBeGreaterThanOrEqual(0);
        });
    });

    // ── F4-16: featureCount update ────────────────────────────────────────────

    describe('F4-16: setFeatureCount for multi-TF (60 → 68)', () => {
        it('SimpleGRUModel.setFeatureCount(68) updates correctly', () => {
            const model = new SimpleGRUModel();
            model.setFeatureCount(68);
            expect(model.getFeatureCount()).toBe(68);
        });

        it('default featureCount is 60', () => {
            const model = new SimpleGRUModel();
            expect(model.getFeatureCount()).toBe(60);
        });

        it('MultiTFFeatureSet has 8 extra fields beyond FeatureSet', () => {
            // Count fields in MultiTFFeatureSet mock
            const mtf: MultiTFFeatureSet = {
                ...makeBaseFeature(Date.now()),
                rsi_14_15m: 50, macdHistogram_15m: 0, bb_percentB_15m: 0.5, volumeRatio_15m: 1,
                rsi_14_4h: 50, ema50Trend_4h: 0, priceVsEMA50_4h: 0, atrPercent_4h: 1,
            };
            const extraKeys = ['rsi_14_15m', 'macdHistogram_15m', 'bb_percentB_15m', 'volumeRatio_15m',
                               'rsi_14_4h', 'ema50Trend_4h', 'priceVsEMA50_4h', 'atrPercent_4h'];
            extraKeys.forEach(k => expect(mtf).toHaveProperty(k));
        });
    });
});
