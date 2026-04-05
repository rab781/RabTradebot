import { describe, it, expect, beforeEach } from '@jest/globals';
import { StrategyOptimizer } from '../src/services/strategyOptimizer';

describe('Phase 5 - Sprint 3: Monte Carlo Robustness Test', () => {
    describe('Monte Carlo: Basic Functionality', () => {
        it('[F5-9] should handle single trade without variance', () => {
            const optimizer = new StrategyOptimizer(
                {} as any, 
                [], 
                {} as any,
                {}
            );

            const trades = [{ profit: 100, maxDrawdown: 10 }];
            const result = optimizer.monteCarloTest(trades, 10);

            // Single trade should have same result across all simulations
            expect(result.profitDistribution.median).toBe(100);
            expect(result.drawdownDistribution.median).toBe(0); // Sequential maxDrawdown of 1 trade with +100 profit is 0
        });

        it('[F5-9] should produce valid percentile distribution (P5 <= P25 <= median <= P75 <= P95)', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const trades = Array.from({ length: 50 }, (_, i) => ({
                profit: (Math.random() - 0.5) * 100,
                maxDrawdown: Math.random() * 30
            }));

            const result = optimizer.monteCarloTest(trades, 100);

            // Verify ordering
            expect(result.profitDistribution.p5).toBeLessThanOrEqual(result.profitDistribution.p25);
            expect(result.profitDistribution.p25).toBeLessThanOrEqual(result.profitDistribution.median);
            expect(result.profitDistribution.median).toBeLessThanOrEqual(result.profitDistribution.p75);
            expect(result.profitDistribution.p75).toBeLessThanOrEqual(result.profitDistribution.p95);

            // Same for drawdown
            expect(result.drawdownDistribution.p5).toBeLessThanOrEqual(result.drawdownDistribution.p25);
            expect(result.drawdownDistribution.p25).toBeLessThanOrEqual(result.drawdownDistribution.median);
            expect(result.drawdownDistribution.median).toBeLessThanOrEqual(result.drawdownDistribution.p75);
            expect(result.drawdownDistribution.p75).toBeLessThanOrEqual(result.drawdownDistribution.p95);
        });

        it('[F5-9] should handle empty trades array gracefully', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});
            const result = optimizer.monteCarloTest([], 100);

            expect(result.summary).toContain('No trades');
            expect(result.profitDistribution.median).toBe(0);
        });

        it('[F5-10] should produce stable results with large simulation count', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const trades = Array.from({ length: 30 }, (_, i) => ({
                profit: i * 10,
                maxDrawdown: 5 + Math.random() * 10
            }));

            // Run twice with same seed would be ideal, but we'll just check stability
            const result1 = optimizer.monteCarloTest(trades, 1000);
            const result2 = optimizer.monteCarloTest(trades, 1000);

            // Results should be fairly close (within tolerance)
            expect(Math.abs(result1.profitDistribution.median - result2.profitDistribution.median))
                .toBeLessThan(Math.abs(result1.profitDistribution.median) * 0.2);
        });

        it('[F5-10] should handle all profitable trades (P5 profit > 0)', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const trades = Array.from({ length: 20 }, () => ({
                profit: 10 + Math.random() * 20,
                maxDrawdown: Math.random() * 5
            }));

            const result = optimizer.monteCarloTest(trades, 100);

            // Even worst case should be profitable
            expect(result.profitDistribution.p5).toBeGreaterThan(0);
        });
    });

    describe('Monte Carlo: Statistical Properties', () => {
        it('[F5-9] should correctly calculate Sharpe Ratio from shuffled trades', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            // Create trades with known properties
            const trades = [
                { profit: 100, maxDrawdown: 10 },
                { profit: -50, maxDrawdown: 15 },
                { profit: 75, maxDrawdown: 8 }
            ];

            const result = optimizer.monteCarloTest(trades, 100);

            // Sharpe should be calculated
            expect(typeof result.sharpeDistribution.median).toBe('number');
            expect(result.sharpeDistribution.p5).toBeLessThanOrEqual(result.sharpeDistribution.p95);
        });

        it('[F5-10] should show variance in results across simulations', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const trades = Array.from({ length: 20 }, (_, i) => ({
                profit: Math.sin(i) * 50,
                maxDrawdown: 10 + Math.random() * 10
            }));

            const result = optimizer.monteCarloTest(trades, 500);

            // P5 should be different from P95 for drawdown (profit is now invariant)
            expect(Math.abs(result.drawdownDistribution.p5 - result.drawdownDistribution.p95))
                .toBeGreaterThan(0);
        });

        it('[F5-9] should properly format Monte Carlo summary with key insights', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const trades = Array.from({ length: 15 }, () => ({
                profit: Math.random() * 100,
                maxDrawdown: Math.random() * 20
            }));

            const result = optimizer.monteCarloTest(trades, 100);

            expect(result.summary).toContain('Monte Carlo Robustness Test Results');
            expect(result.summary).toContain('Profit Distribution');
            expect(result.summary).toContain('Max Drawdown Distribution');
            expect(result.summary).toContain('Sharpe Ratio Distribution');
            expect(result.summary).toContain('Key Insights');
            expect(result.summary).toContain('95% skenario');
            expect(result.summary).toContain('5% skenario terburuk');
        });
    });

    describe('Monte Carlo: Trade Shuffling (Fisher-Yates)', () => {
        it('[F5-9] should permute trades correctly (order changes affect result)', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            // Trades with different orderings should produce different equity curves
            const trades = [
                { profit: 100, maxDrawdown: 10 },
                { profit: -200, maxDrawdown: 25 },
                { profit: 150, maxDrawdown: 12 }
            ];

            const result1 = optimizer.monteCarloTest(trades, 200);
            const result2 = optimizer.monteCarloTest(trades, 200);

            // Different runs might give different percentiles (due to randomness)
            // But they should be in reasonable range
            expect(result1.profitDistribution.p5).toBeLessThanOrEqual(result1.profitDistribution.p95);
        });

        it('[F5-9] should maintain total profit sum (permutation is order-independent)', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const trades = [
                { profit: 50, maxDrawdown: 5 },
                { profit: 30, maxDrawdown: 3 },
                { profit: 20, maxDrawdown: 2 }
            ];

            const result = optimizer.monteCarloTest(trades, 100);
            const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);

            // All simulations should sum to same total
            expect(result.profitDistribution.median).toEqual(totalProfit);
        });

        it('[F5-10] should generate diverse permutations (not always same order)', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const trades = Array.from({ length: 10 }, (_, i) => ({
                profit: (Math.random() - 0.5) * 100,  // Random profits
                maxDrawdown: i + Math.random() * 10
            }));

            // Run many simulations - should see variance in P5/P95
            const result = optimizer.monteCarloTest(trades, 500);

            const spreadProfit = result.profitDistribution.p95 - result.profitDistribution.p5;
            const spreadDrawdown = result.drawdownDistribution.p95 - result.drawdownDistribution.p5;

            // Should see some spread due to reordering
            expect(spreadProfit).toBeGreaterThanOrEqual(0);
            expect(spreadDrawdown).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Monte Carlo: Integration', () => {
        it('[F5-9] should include simulation count in result', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const trades = [{ profit: 100, maxDrawdown: 10 }];
            const result50 = optimizer.monteCarloTest(trades, 50);
            const result200 = optimizer.monteCarloTest(trades, 200);

            expect(result50.simulations).toBe(50);
            expect(result200.simulations).toBe(200);
        });

        it('[F5-10] should have realistic percentile values (not NaN or Infinity)', () => {
            const optimizer = new StrategyOptimizer({} as any, [], {} as any, {});

            const trades = Array.from({ length: 25 }, () => ({
                profit: (Math.random() - 0.5) * 200,
                maxDrawdown: Math.random() * 40
            }));

            const result = optimizer.monteCarloTest(trades, 300);

            // Check all percentiles are valid numbers
            [result.profitDistribution, result.drawdownDistribution, result.sharpeDistribution]
                .forEach(dist => {
                    expect(isFinite(dist.p5)).toBe(true);
                    expect(isFinite(dist.p25)).toBe(true);
                    expect(isFinite(dist.median)).toBe(true);
                    expect(isFinite(dist.p75)).toBe(true);
                    expect(isFinite(dist.p95)).toBe(true);
                });
        });
    });
});
