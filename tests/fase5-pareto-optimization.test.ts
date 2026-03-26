import { describe, it, expect, beforeEach } from '@jest/globals';
import { StrategyOptimizer, WFOWindowResult } from '../src/services/strategyOptimizer';
import { StrategyOptimizationResult } from '../src/types/strategy';

describe('Phase 5 - Sprint 4: Pareto Frontier + Parameter Sensitivity + PBO', () => {
    beforeEach(() => {
        // Setup common test data if needed
    });

    describe('Pareto Frontier: Multi-Objective Optimization', () => {
        it('[F5-11] should identify single point as non-dominated', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const results: StrategyOptimizationResult[] = [
                {
                    params: { x: 1 },
                    score: 50,
                    backtestResult: {
                        totalProfitPct: 10,
                        maxDrawdownPct: 5,
                        winRate: 60,
                        profitFactor: 1.5
                    } as any
                }
            ];

            const paretoResult = optimizer.computeParetoFrontier(results);

            expect(paretoResult.frontier.length).toBe(1);
            expect(paretoResult.frontier[0].isDominated).toBe(false);
        });

        it('[F5-11] should identify dominated points correctly', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const results: StrategyOptimizationResult[] = [
                {
                    params: { x: 1 },
                    score: 100,
                    backtestResult: {
                        totalProfitPct: 20,
                        maxDrawdownPct: 5,
                        winRate: 70,
                        profitFactor: 2.0
                    } as any
                },
                {
                    params: { x: 2 },
                    score: 30,
                    backtestResult: {
                        totalProfitPct: 10,
                        maxDrawdownPct: 10,
                        winRate: 50,
                        profitFactor: 1.0
                    } as any
                }
            ];

            const paretoResult = optimizer.computeParetoFrontier(results);

            // Second point is dominated by first (lower return, higher drawdown, lower win rate)
            expect(paretoResult.frontier.length).toBe(1);
            expect(paretoResult.allPoints[1].isDominated).toBe(true);
        });

        it('[F5-11] should find true Pareto frontier with trade-offs', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const results: StrategyOptimizationResult[] = [
                {
                    params: { x: 1 },
                    score: 100,
                    backtestResult: {
                        totalProfitPct: 30,
                        maxDrawdownPct: 15,
                        winRate: 75,
                        profitFactor: 2.5
                    } as any
                },
                {
                    params: { x: 2 },
                    score: 80,
                    backtestResult: {
                        totalProfitPct: 15,
                        maxDrawdownPct: 5,
                        winRate: 80,
                        profitFactor: 1.8
                    } as any
                }
            ];

            const paretoResult = optimizer.computeParetoFrontier(results);

            // Both are on frontier - different trade-offs
            expect(paretoResult.frontier.length).toBe(2);
            expect(paretoResult.frontier.every(p => !p.isDominated)).toBe(true);
        });

        it('[F5-11] should format Pareto summary with insights', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const results: StrategyOptimizationResult[] = [
                {
                    params: { x: 1 },
                    score: 100,
                    backtestResult: {
                        totalProfitPct: 25,
                        maxDrawdownPct: 8,
                        winRate: 72,
                        profitFactor: 2.0
                    } as any
                }
            ];

            const paretoResult = optimizer.computeParetoFrontier(results);

            expect(paretoResult.summary).toContain('Pareto Frontier');
            expect(paretoResult.summary).toContain('Non-dominated Solutions');
            expect(paretoResult.summary).toContain('Trade-offs Identified');
        });

        it('[F5-11] should handle empty results gracefully', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});
            const paretoResult = optimizer.computeParetoFrontier([]);

            expect(paretoResult.frontierSize).toBe(0);
            expect(paretoResult.summary).toContain('No results');
        });

        it('[F5-11] should have all frontier points non-dominated', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const results: StrategyOptimizationResult[] = Array.from({ length: 20 }, (_, i) => ({
                params: { x: i },
                score: Math.random() * 100,
                backtestResult: {
                    totalProfitPct: Math.random() * 50,
                    maxDrawdownPct: Math.random() * 30,
                    winRate: 40 + Math.random() * 40,
                    profitFactor: 1 + Math.random() * 3
                } as any
            }));

            const paretoResult = optimizer.computeParetoFrontier(results);

            // All points on frontier should be non-dominated
            paretoResult.frontier.forEach(p => {
                expect(p.isDominated).toBe(false);
            });
        });
    });

    describe('Parameter Sensitivity Analysis', () => {
        it('[F5-13] should identify robust params (low sensitivity)', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            // Create results with stable performance around optimal
            const results: StrategyOptimizationResult[] = [
                { params: { buyRsi: 29 }, score: 95, backtestResult: {} as any },
                { params: { buyRsi: 30 }, score: 100, backtestResult: {} as any },
                { params: { buyRsi: 31 }, score: 96, backtestResult: {} as any }
            ];

            const sensitivity = optimizer.parameterSensitivity(results, { buyRsi: 30 });

            const buyRsiSens = sensitivity.find(s => s.paramName === 'buyRsi');
            expect(buyRsiSens?.isRobust).toBe(true);
            expect(buyRsiSens?.sensitivityScore).toBeLessThan(0.3);
        });

        it('[F5-13] should identify fragile params (high sensitivity)', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            // Create results with unstable performance around optimal
            const results: StrategyOptimizationResult[] = [
                { params: { buyRsi: 29 }, score: 30, backtestResult: {} as any },
                { params: { buyRsi: 30 }, score: 100, backtestResult: {} as any },
                { params: { buyRsi: 31 }, score: 20, backtestResult: {} as any }
            ];

            const sensitivity = optimizer.parameterSensitivity(results, { buyRsi: 30 });

            const buyRsiSens = sensitivity.find(s => s.paramName === 'buyRsi');
            expect(buyRsiSens?.isRobust).toBe(false);
            expect(buyRsiSens?.sensitivityScore).toBeGreaterThanOrEqual(0.3);
        });

        it('[F5-13] should calculate neighborhood performance', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const results: StrategyOptimizationResult[] = [
                { params: { x: 8 }, score: 50, backtestResult: {} as any },
                { params: { x: 9 }, score: 60, backtestResult: {} as any },
                { params: { x: 10 }, score: 75, backtestResult: {} as any },
                { params: { x: 11 }, score: 65, backtestResult: {} as any },
                { params: { x: 12 }, score: 55, backtestResult: {} as any }
            ];

            const sensitivity = optimizer.parameterSensitivity(results, { x: 10 });

            expect(sensitivity[0].neighborhoodPerformance.length).toBeGreaterThan(0);
        });

        it('[F5-13] should handle non-numeric params gracefully', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const results: StrategyOptimizationResult[] = [
                { params: { strategy: 'RSI' }, score: 50, backtestResult: {} as any },
                { params: { strategy: 'MACD' }, score: 60, backtestResult: {} as any }
            ];

            const sensitivity = optimizer.parameterSensitivity(results, { strategy: 'RSI' });

            expect(Array.isArray(sensitivity)).toBe(true);
        });
    });

    describe('Overfitting Probability (PBO)', () => {
        it('[F5-14] should return 0 for perfectly aligned IS/OOS (no overfitting)', () => {
            // Create WFO windows where IS and OOS align well (stability ≈ 1.0)
            const wfoResults: WFOWindowResult[] = [
                {
                    window: 1,
                    inSampleScore: 100,
                    outOfSampleScore: 95,
                    stabilityRatio: 0.95,
                    bestParams: { x: 1 },
                    backtestResult: {} as any
                },
                {
                    window: 2,
                    inSampleScore: 90,
                    outOfSampleScore: 92,
                    stabilityRatio: 1.02,
                    bestParams: { x: 1 },
                    backtestResult: {} as any
                }
            ];

            const pbo = StrategyOptimizer.computeOverfittingProbability(wfoResults);

            expect(pbo).toBe(0);
        });

        it('[F5-14] should return 1.0 for fully misaligned IS/OOS (complete overfitting)', () => {
            // Create WFO windows where IS and OOS diverge significantly
            const wfoResults: WFOWindowResult[] = [
                {
                    window: 1,
                    inSampleScore: 100,
                    outOfSampleScore: 10,
                    stabilityRatio: 0.1,
                    bestParams: { x: 1 },
                    backtestResult: {} as any
                },
                {
                    window: 2,
                    inSampleScore: 100,
                    outOfSampleScore: 5,
                    stabilityRatio: 0.05,
                    bestParams: { x: 1 },
                    backtestResult: {} as any
                }
            ];

            const pbo = StrategyOptimizer.computeOverfittingProbability(wfoResults);

            expect(pbo).toBe(1.0);
        });

        it('[F5-14] should compute PBO between 0 and 1 for mixed results', () => {
            const wfoResults: WFOWindowResult[] = [
                {
                    window: 1,
                    inSampleScore: 100,
                    outOfSampleScore: 95,
                    stabilityRatio: 0.95,
                    bestParams: { x: 1 },
                    backtestResult: {} as any
                },
                {
                    window: 2,
                    inSampleScore: 100,
                    outOfSampleScore: 20,
                    stabilityRatio: 0.2,
                    bestParams: { x: 2 },
                    backtestResult: {} as any
                }
            ];

            const pbo = StrategyOptimizer.computeOverfittingProbability(wfoResults);

            expect(pbo).toBeGreaterThan(0);
            expect(pbo).toBeLessThan(1);
        });

        it('[F5-14] should handle single window (return 0)', () => {
            const wfoResults: WFOWindowResult[] = [
                {
                    window: 1,
                    inSampleScore: 100,
                    outOfSampleScore: 50,
                    stabilityRatio: 0.5,
                    bestParams: { x: 1 },
                    backtestResult: {} as any
                }
            ];

            const pbo = StrategyOptimizer.computeOverfittingProbability(wfoResults);

            expect(pbo).toBe(0);
        });

        it('[F5-14] should interpret stability ratio correctly', () => {
            // Test with 2+ windows to show differentiation
            const wfoResultsBad: WFOWindowResult[] = [
                {
                    window: 1,
                    inSampleScore: 100,
                    outOfSampleScore: 20,
                    stabilityRatio: 0.2,
                    bestParams: { x: 1 },
                    backtestResult: {} as any
                },
                {
                    window: 2,
                    inSampleScore: 100,
                    outOfSampleScore: 15,
                    stabilityRatio: 0.15,
                    bestParams: { x: 1 },
                    backtestResult: {} as any
                }
            ];

            const pboBad = StrategyOptimizer.computeOverfittingProbability(wfoResultsBad);

            expect(pboBad).toBeGreaterThan(0);
        });

        it('[F5-14] should return 0 for empty array', () => {
            const pbo = StrategyOptimizer.computeOverfittingProbability([]);

            expect(pbo).toBe(0);
        });
    });

    describe('Integration: Full Sprint 4 Analysis', () => {
        it('[F5-15] should combine Pareto + Sensitivity + PBO insights', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            // Create sample results for all three analyses
            const results: StrategyOptimizationResult[] = Array.from({ length: 5 }, (_, i) => ({
                params: { buyRsi: 25 + i * 5 },
                score: 50 + Math.random() * 50,
                backtestResult: {
                    totalProfitPct: 10 + Math.random() * 20,
                    maxDrawdownPct: 5 + Math.random() * 15,
                    winRate: 50 + Math.random() * 20,
                    profitFactor: 1.5 + Math.random() * 1
                } as any
            }));

            const paretoResult = optimizer.computeParetoFrontier(results);
            const sensitivity = optimizer.parameterSensitivity(results, { buyRsi: 30 });
            const wfoResults: WFOWindowResult[] = [];
            const pbo = StrategyOptimizer.computeOverfittingProbability(wfoResults);

            // All methods should complete without error
            expect(Array.isArray(paretoResult.frontier)).toBe(true);
            expect(Array.isArray(sensitivity)).toBe(true);
            expect(typeof pbo === 'number').toBe(true);
        });
    });
});
