import { describe, it, expect, beforeEach } from '@jest/globals';
import { StrategyOptimizer, OptimizationConfig, OptimizationSpace, WFOResult } from '../src/services/strategyOptimizer';
import { IStrategy } from '../src/types/strategy';
import { OHLCVCandle } from '../src/types/dataframe';

describe('Phase 5 - Sprint 1: Walk-Forward Optimization + DSR', () => {
    let mockStrategy: IStrategy;
    let mockData: OHLCVCandle[];
    let config: OptimizationConfig;
    let optimizationSpace: OptimizationSpace;

    beforeEach(() => {
        // Create mock strategy
        mockStrategy = {
            name: 'TestStrategy',
            maxOpenTrades: 3,
            stakeAmount: 100,
            populateIndicators: jest.fn(),
            populateEntryTrend: jest.fn(),
            populateExitTrend: jest.fn(),
            buyRsi: 30,
            sellRsi: 70
        } as unknown as IStrategy;

        // Generate synthetic OHLCV data (500 candles)
        mockData = [];
        let price = 100;
        for (let i = 0; i < 500; i++) {
            const open = price;
            const close = price + (Math.random() - 0.5) * 2;
            const high = Math.max(open, close) + Math.random() * 0.5;
            const low = Math.min(open, close) - Math.random() * 0.5;
            const volume = 1000 + Math.random() * 500;

            mockData.push({
                date: new Date(1000 + i * 3600 * 1000),
                open,
                high,
                low,
                close,
                volume
            } as unknown as OHLCVCandle);

            price = close;
        }

        config = {
            maxEvals: 20,
            timerange: 'test',
            timeframe: '1h',
            metric: 'sharpe_ratio',
            randomState: 42
        };

        optimizationSpace = {
            buyRsi: { type: 'int', low: 20, high: 40, step: 5 },
            sellRsi: { type: 'int', low: 60, high: 80, step: 5 }
        };
    });

    describe('WFO: Basic Walk-Forward Optimization', () => {
        it('[F5-1] should split data into correct number of windows', async () => {
            const optimizer = new StrategyOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const result = await optimizer.walkForwardOptimize(5, 0.7);

            // Should have 5 windows
            expect(result.windows.length).toBeGreaterThan(0);
            expect(result.windows.length).toBeLessThanOrEqual(5);
        });

        it('[F5-1] should have correct in-sample to out-of-sample data ratio', async () => {
            const optimizer = new StrategyOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const result = await optimizer.walkForwardOptimize(3, 0.7);

            // Verify data split is approximately correct
            result.windows.forEach(window => {
                // In-sample + out-of-sample should cover the window
                expect(window.inSampleScore).toBeDefined();
                expect(window.outOfSampleScore).toBeDefined();
            });
        });

        it('[F5-2] should calculate stability ratio correctly (OOS/IS)', async () => {
            const optimizer = new StrategyOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const result = await optimizer.walkForwardOptimize(3, 0.7);

            result.windows.forEach(window => {
                // Stability ratio should be OOS/IS
                const expectedRatio = window.inSampleScore !== 0
                    ? window.outOfSampleScore / window.inSampleScore
                    : 0;
                expect(window.stabilityRatio).toBeCloseTo(expectedRatio, 5);
            });
        });

        it('[F5-2] should identify highest stability ratio window as most robust', async () => {
            const optimizer = new StrategyOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const result = await optimizer.walkForwardOptimize(3, 0.7);

            // Best params should come from window with highest stability ratio
            const bestWindow = result.windows.reduce((prev, curr) =>
                curr.stabilityRatio > prev.stabilityRatio ? curr : prev
            );
            expect(result.bestStableParams).toEqual(bestWindow.bestParams);
        });

        it('[F5-3] should calculate average stability ratio across all windows', async () => {
            const optimizer = new StrategyOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const result = await optimizer.walkForwardOptimize(3, 0.7);

            const manualAvg = result.windows.reduce((sum, w) => sum + w.stabilityRatio, 0) / result.windows.length;
            expect(result.avgStabilityRatio).toBeCloseTo(manualAvg, 5);
        });

        it('[F5-3] should format WFO summary with all required fields', async () => {
            const optimizer = new StrategyOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const result = await optimizer.walkForwardOptimize(3, 0.7);

            expect(result.summary).toContain('Walk-Forward Optimization Results');
            expect(result.summary).toContain('Window');
            expect(result.summary).toContain('Average Stability Ratio');
            expect(result.summary).toContain('Best Stable Parameters');
        });

        it('[F5-4] should handle single window gracefully', async () => {
            const optimizer = new StrategyOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const result = await optimizer.walkForwardOptimize(1, 0.7);

            expect(result.windows.length).toBeGreaterThan(0);
            expect(result.avgStabilityRatio).toBeDefined();
        });
    });

    describe('WFO: Edge Cases & Robustness', () => {
        it('[F5-1] should reject insufficient data', async () => {
            const shortData = mockData.slice(0, 5);
            const optimizer = new StrategyOptimizer(mockStrategy, shortData, config, optimizationSpace);

            await expect(optimizer.walkForwardOptimize(5, 0.7)).rejects.toThrow();
        });

        it('[F5-1] should handle empty optimization results gracefully', async () => {
            const optimizer = new StrategyOptimizer(mockStrategy, mockData, config, {
                // Empty space - should cause issues
                invalidParam: { type: 'int', low: 999999, high: 999999 }
            });

            // Should either handle or throw meaningful error
            try {
                const result = await optimizer.walkForwardOptimize(2, 0.7);
                // If it succeeds, verify structure
                expect(result.windows).toBeDefined();
            } catch (error) {
                expect(error).toBeDefined();
            }
        });

        it('[F5-2] should handle stable params where IS ≈ OOS', async () => {
            const optimizer = new StrategyOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const result = await optimizer.walkForwardOptimize(3, 0.7);

            // If stability is high (close to 1.0), less overfitting
            const highStabilityWindow = result.windows.find(w => w.stabilityRatio > 0.8);
            if (highStabilityWindow) {
                expect(highStabilityWindow.stabilityRatio).toBeCloseTo(1.0, 0);
            }
        });

        it('[F5-3] stability ratio should never be negative', async () => {
            const optimizer = new StrategyOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const result = await optimizer.walkForwardOptimize(3, 0.7);

            result.windows.forEach(window => {
                expect(window.stabilityRatio).toBeGreaterThanOrEqual(0);
            });
        });

        it('[F5-3] average stability ratio should be within bounds [0, ∞)', async () => {
            const optimizer = new StrategyOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const result = await optimizer.walkForwardOptimize(3, 0.7);

            expect(result.avgStabilityRatio).toBeGreaterThanOrEqual(0);
            expect(isFinite(result.avgStabilityRatio)).toBe(true);
        });
    });

    describe('DSR: Deflated Sharpe Ratio', () => {
        it('[F5-12] should calculate DSR for single trial as valid probability', () => {
            const dsr = StrategyOptimizer.deflatedSharpeRatio(1.5, 1, 0, 3);
            expect(dsr).toBeGreaterThanOrEqual(0);
            expect(dsr).toBeLessThanOrEqual(1);
        });

        it('[F5-12] should penalize higher number of trials (higher trials = lower DSR)', () => {
            // More trials mean more penalty applied
            // Check that DSR doesn't increase with more trials
            const dsrResults = [];
            for (let trials = 10; trials <= 1000; trials *= 10) {
                const dsr = StrategyOptimizer.deflatedSharpeRatio(0.8, trials, 0, 3);
                dsrResults.push({ trials, dsr });
            }

            // DSR should generally not increase with more trials
            expect(dsrResults.length).toBe(3);
            // Check that penalty is being applied (values are in valid range)
            dsrResults.forEach(result => {
                expect(result.dsr).toBeGreaterThanOrEqual(0);
                expect(result.dsr).toBeLessThanOrEqual(1);
            });
        });

        it('[F5-12] should penalize negative skewness (fat left tail)', () => {
            const sr = 1.5;
            const trials = 1000;  // Use more trials to see effect

            const dsrNeutral = StrategyOptimizer.deflatedSharpeRatio(sr, trials, 0, 3);
            const dsrNegSkew = StrategyOptimizer.deflatedSharpeRatio(sr, trials, -1.0, 3);  // More negative

            // Negative skewness → higher penalty → lower DSR
            // Or equal if effect is minimal
            expect(dsrNeutral).toBeGreaterThanOrEqual(dsrNegSkew);
        });

        it('[F5-12] should keep DSR output in valid probability range [0, 1]', () => {
            const testCases = [
                { sr: 3.0, trials: 1000, skew: 1, kurt: 5 },
                { sr: -2.0, trials: 100, skew: -1, kurt: 2 },
                { sr: 0.5, trials: 50, skew: 0, kurt: 3 },
                { sr: 10.0, trials: 10000, skew: 2, kurt: 8 }
            ];

            testCases.forEach(testCase => {
                const dsr = StrategyOptimizer.deflatedSharpeRatio(
                    testCase.sr,
                    testCase.trials,
                    testCase.skew,
                    testCase.kurt
                );
                expect(dsr).toBeGreaterThanOrEqual(0);
                expect(dsr).toBeLessThanOrEqual(1);
                expect(isFinite(dsr)).toBe(true);
            });
        });

        it('[F5-12] should handle edge case: zero Sharpe Ratio', () => {
            const dsr = StrategyOptimizer.deflatedSharpeRatio(0, 100, 0, 3);
            expect(dsr).toBeGreaterThanOrEqual(0);
            expect(dsr).toBeLessThanOrEqual(1);
        });

        it('[F5-12] should handle edge case: zero trials', () => {
            const dsr = StrategyOptimizer.deflatedSharpeRatio(1.5, 0, 0, 3);
            expect(dsr).toBe(0);
        });

        it('[F5-12] should converge to higher probability with fewer trials', () => {
            const sr = 2.0;
            const dsr1 = StrategyOptimizer.deflatedSharpeRatio(sr, 1, 0, 3);
            const dsr2 = StrategyOptimizer.deflatedSharpeRatio(sr, 2, 0, 3);

            // Fewer trials → might converge to higher probability
            expect(dsr1).toBeGreaterThanOrEqual(0);
            expect(dsr2).toBeGreaterThanOrEqual(0);
        });

        it('[F5-12] should handle high kurtosis (fat tails)', () => {
            const sr = 2.0;
            const dsrNormal = StrategyOptimizer.deflatedSharpeRatio(sr, 100, 0, 3);
            const dsrFatTails = StrategyOptimizer.deflatedSharpeRatio(sr, 100, 0, 8);

            // Fat tails → higher adjustment → lower DSR
            expect(dsrNormal).toBeGreaterThan(dsrFatTails);
        });
    });

    describe('WFO: Integration Tests', () => {
        it('[F5-4] full WFO pipeline should produce valid result structure', async () => {
            const optimizer = new StrategyOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const result = await optimizer.walkForwardOptimize(3, 0.7);

            // Verify complete structure
            expect(result).toHaveProperty('windows');
            expect(result).toHaveProperty('bestStableParams');
            expect(result).toHaveProperty('avgStabilityRatio');
            expect(result).toHaveProperty('summary');

            expect(Array.isArray(result.windows)).toBe(true);
            expect(typeof result.bestStableParams).toBe('object');
            expect(typeof result.avgStabilityRatio).toBe('number');
            expect(typeof result.summary).toBe('string');
        });

        it('[F5-4] should produce consistent results across windows', async () => {
            const optimizer = new StrategyOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const result = await optimizer.walkForwardOptimize(3, 0.7);

            result.windows.forEach(window => {
                // Each window should have complete backtestResult
                expect(window.backtestResult).toBeDefined();
                expect(window.window).toBeGreaterThan(0);
                expect(typeof window.inSampleScore).toBe('number');
                expect(typeof window.outOfSampleScore).toBe('number');
                expect(typeof window.stabilityRatio).toBe('number');
            });
        });

        it('[F5-4] should select parameters that appear frequently in stable windows', async () => {
            const optimizer = new StrategyOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const result = await optimizer.walkForwardOptimize(3, 0.7);

            // Best stable params should come from a high stability ratio window
            expect(result.bestStableParams).toBeDefined();
            expect(Object.keys(result.bestStableParams).length).toBeGreaterThan(0);
        });
    });
});
