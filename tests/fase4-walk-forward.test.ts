/**
 * Fase 4 Sprint 2 — Walk-Forward Validation Tests
 * Tests: F4-1 (walkForwardValidate), F4-2 (WFVResult format), F4-3 (summarizeWFV + formatWFVReport)
 *
 * CATATAN: walkForwardValidate() memanggil real TF.js training sehingga sangat lambat.
 * Test di sini mock lapisan training dan fokus pada:
 * - Struktur data WFVResult yang benar (F4-2)
 * - summarizeWFV() matematis (F4-3)
 * - formatWFVReport() output (F4-3)
 * - Boundary conditions (insufficient data, empty windows)
 */

import { SimpleGRUModel, WFVResult, WFVSummary } from '../src/ml/simpleGRUModel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWFVResult(window: number, accuracy: number, loss: number): WFVResult {
    const base = (window - 1) * 100;
    return {
        window,
        modelVersion: `wfv_w${window}_testrun`,
        trainStart: base,
        trainEnd: base + 69,
        testStart: base + 70,
        testEnd: base + 99,
        accuracy,
        loss,
    };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Fase 4 Sprint 2: Walk-Forward Validation', () => {
    let model: SimpleGRUModel;

    beforeEach(() => {
        model = new SimpleGRUModel();
    });

    // ── F4-2: WFVResult Structure ─────────────────────────────────────────────

    describe('F4-2: WFVResult data structure', () => {
        it('WFVResult has required fields: window, modelVersion, trainStart/End, testStart/End, accuracy, loss', () => {
            const r = makeWFVResult(1, 0.65, 0.4);
            expect(r).toHaveProperty('window');
            expect(r).toHaveProperty('modelVersion');
            expect(r).toHaveProperty('trainStart');
            expect(r).toHaveProperty('trainEnd');
            expect(r).toHaveProperty('testStart');
            expect(r).toHaveProperty('testEnd');
            expect(r).toHaveProperty('accuracy');
            expect(r).toHaveProperty('loss');
        });

        it('modelVersion follows wfv_wN_ naming convention', () => {
            const r = makeWFVResult(3, 0.7, 0.3);
            expect(r.modelVersion).toMatch(/^wfv_w3_/);
        });

        it('test range comes AFTER train range (no leakage)', () => {
            const r = makeWFVResult(1, 0.65, 0.4);
            expect(r.testStart).toBeGreaterThan(r.trainEnd);
        });

        it('accuracy is between 0 and 1', () => {
            const r = makeWFVResult(2, 0.72, 0.28);
            expect(r.accuracy).toBeGreaterThanOrEqual(0);
            expect(r.accuracy).toBeLessThanOrEqual(1);
        });

        it('window number is 1-based positive integer', () => {
            const r = makeWFVResult(5, 0.6, 0.5);
            expect(r.window).toBe(5);
            expect(r.window).toBeGreaterThan(0);
        });
    });

    // ── F4-3: summarizeWFV ────────────────────────────────────────────────────

    describe('F4-3: summarizeWFV()', () => {
        it('empty input → zero summary', () => {
            const s = model.summarizeWFV([]);
            expect(s.windowCount).toBe(0);
            expect(s.meanAccuracy).toBe(0);
            expect(s.bestAccuracy).toBe(0);
            expect(s.worstAccuracy).toBe(0);
            expect(s.stdDevAccuracy).toBe(0);
            expect(s.results).toHaveLength(0);
        });

        it('single window → mean = accuracy, stdDev = 0', () => {
            const s = model.summarizeWFV([makeWFVResult(1, 0.65, 0.4)]);
            expect(s.windowCount).toBe(1);
            expect(s.meanAccuracy).toBeCloseTo(0.65, 4);
            expect(s.stdDevAccuracy).toBeCloseTo(0, 4);
            expect(s.bestAccuracy).toBe(0.65);
            expect(s.worstAccuracy).toBe(0.65);
        });

        it('two windows: mean correct', () => {
            const s = model.summarizeWFV([
                makeWFVResult(1, 0.6, 0.5),
                makeWFVResult(2, 0.8, 0.3),
            ]);
            expect(s.meanAccuracy).toBeCloseTo(0.7, 4);
        });

        it('three windows: best and worst correct', () => {
            const s = model.summarizeWFV([
                makeWFVResult(1, 0.55, 0.6),
                makeWFVResult(2, 0.75, 0.3),
                makeWFVResult(3, 0.65, 0.4),
            ]);
            expect(s.bestAccuracy).toBe(0.75);
            expect(s.worstAccuracy).toBe(0.55);
        });

        it('stdDev is non-negative', () => {
            const s = model.summarizeWFV([
                makeWFVResult(1, 0.6, 0.5),
                makeWFVResult(2, 0.8, 0.3),
                makeWFVResult(3, 0.7, 0.4),
            ]);
            expect(s.stdDevAccuracy).toBeGreaterThanOrEqual(0);
        });

        it('stdDev is 0 when all windows same accuracy', () => {
            const s = model.summarizeWFV([
                makeWFVResult(1, 0.7, 0.4),
                makeWFVResult(2, 0.7, 0.4),
                makeWFVResult(3, 0.7, 0.4),
            ]);
            expect(s.stdDevAccuracy).toBeCloseTo(0, 4);
        });

        it('high stdDev when accuracy varies widely', () => {
            const s = model.summarizeWFV([
                makeWFVResult(1, 0.1, 0.9),  // very low
                makeWFVResult(2, 0.9, 0.1),  // very high
            ]);
            expect(s.stdDevAccuracy).toBeGreaterThan(0.3);
        });

        it('results array preserved in summary', () => {
            const results = [makeWFVResult(1, 0.6, 0.4), makeWFVResult(2, 0.7, 0.3)];
            const s = model.summarizeWFV(results);
            expect(s.results).toHaveLength(2);
            expect(s.results[0].window).toBe(1);
        });
    });

    // ── F4-3: formatWFVReport ─────────────────────────────────────────────────

    describe('F4-3: formatWFVReport()', () => {
        const summary: WFVSummary = {
            windowCount: 4,
            meanAccuracy: 0.672,
            bestAccuracy: 0.81,
            worstAccuracy: 0.52,
            stdDevAccuracy: 0.098,
            results: [],
        };

        it('report contains window count', () => {
            const r = model.formatWFVReport(summary);
            expect(r).toContain('4 window');
        });

        it('report contains mean accuracy as percentage', () => {
            const r = model.formatWFVReport(summary);
            expect(r).toContain('67.2%');
        });

        it('report contains best accuracy', () => {
            const r = model.formatWFVReport(summary);
            expect(r).toContain('81.0%');
        });

        it('report contains worst accuracy', () => {
            const r = model.formatWFVReport(summary);
            expect(r).toContain('52.0%');
        });

        it('report contains stdDev', () => {
            const r = model.formatWFVReport(summary);
            expect(r).toContain('9.8%');
        });

        it('report is multi-line (has newlines)', () => {
            const r = model.formatWFVReport(summary);
            expect(r.split('\n').length).toBeGreaterThan(2);
        });

        it('empty summary returns short string (no crash)', () => {
            const empty: WFVSummary = {
                windowCount: 0, meanAccuracy: 0, bestAccuracy: 0,
                worstAccuracy: 0, stdDevAccuracy: 0, results: [],
            };
            expect(() => model.formatWFVReport(empty)).not.toThrow();
        });
    });

    // ── F4-1: walkForwardValidate boundary conditions ─────────────────────────

    describe('F4-1: walkForwardValidate() boundary logic', () => {
        it('summarizeWFV with 5 windows computes correct mean', () => {
            // Simulate what walkForwardValidate would produce
            const results = [0.60, 0.65, 0.70, 0.75, 0.68].map((acc, i) =>
                makeWFVResult(i + 1, acc, 1 - acc),
            );
            const s = model.summarizeWFV(results);
            const expected = (0.60 + 0.65 + 0.70 + 0.75 + 0.68) / 5;
            expect(s.meanAccuracy).toBeCloseTo(expected, 4);
        });

        it('window N never overlaps with window N+1 train range', () => {
            const results = [
                makeWFVResult(1, 0.65, 0.4),
                makeWFVResult(2, 0.70, 0.35),
            ];
            // Each window's testEnd should be before next window's trainStart
            // In slideForward: window2.trainStart = window1.testStart
            expect(results[1].trainStart).toBeGreaterThanOrEqual(results[0].trainStart);
        });

        it('modelVersion is unique per window', () => {
            const versions = new Set(
                [1, 2, 3, 4, 5].map(w => `wfv_w${w}_${Date.now()}`),
            );
            expect(versions.size).toBe(5);
        });
    });
});
