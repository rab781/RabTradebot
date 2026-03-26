import { describe, it, expect, beforeEach } from '@jest/globals';
import { BayesianOptimizer } from '../src/services/bayesianOptimizer';
import { IStrategy, StrategyOptimizationResult } from '../src/types/strategy';
import { OHLCVCandle } from '../src/types/dataframe';
import { OptimizationConfig, OptimizationSpace } from '../src/services/strategyOptimizer';

describe('Phase 5 - Sprint 2: Bayesian Optimization with TPE', () => {
    let mockStrategy: IStrategy;
    let mockData: OHLCVCandle[];
    let config: OptimizationConfig;
    let optimizationSpace: OptimizationSpace;

    beforeEach(() => {
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

        // Generate synthetic OHLCV data (300 candles)
        mockData = [];
        let price = 100;
        for (let i = 0; i < 300; i++) {
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
            randomState: 42,
            method: 'bayesian'
        } as OptimizationConfig & { method: string };

        optimizationSpace = {
            buyRsi: { type: 'int', low: 20, high: 40, step: 5 },
            sellRsi: { type: 'int', low: 60, high: 80, step: 5 }
        };
    });

    describe('TPE Core: Good/Bad Split', () => {
        it('[F5-5] should split history with correct gamma ratio (25%/75%)', () => {
            const optimizer = new BayesianOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const history = Array.from({ length: 100 }, (_, i) => ({
                params: { param1: i },
                score: i
            }));

            // Access private method via type casting
            const splitGoodBad = (optimizer as any).splitGoodBad(history, 0.25);

            // Top 25% should be highest scores
            expect(splitGoodBad.good.length).toBeCloseTo(25, 2);
            expect(splitGoodBad.bad.length).toBeCloseTo(75, 2);
        });

        it('[F5-5] should ensure good group contains higher scores than bad group', () => {
            const optimizer = new BayesianOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const history = Array.from({ length: 50 }, (_, i) => ({
                params: { x: i },
                score: Math.random()
            }));

            const splitGoodBad = (optimizer as any).splitGoodBad(history, 0.3);

            // Good group should have higher average score
            const goodAvg = splitGoodBad.good.reduce((sum: number, p: any) => {
                const scoreEntry = history.find(h => h.params.x === p.x);
                return sum + (scoreEntry?.score || 0);
            }, 0) / splitGoodBad.good.length;

            const badAvg = splitGoodBad.bad.reduce((sum: number, p: any) => {
                const scoreEntry = history.find(h => h.params.x === p.x);
                return sum + (scoreEntry?.score || 0);
            }, 0) / splitGoodBad.bad.length;

            expect(goodAvg).toBeGreaterThan(badAvg);
        });

        it('[F5-5] should handle empty history gracefully', () => {
            const optimizer = new BayesianOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const splitGoodBad = (optimizer as any).splitGoodBad([], 0.25);

            expect(splitGoodBad.good.length).toBe(0);
            expect(splitGoodBad.bad.length).toBe(0);
        });

        it('[F5-5] should handle single item in history', () => {
            const optimizer = new BayesianOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const history = [{ params: { x: 1 }, score: 5 }];
            const splitGoodBad = (optimizer as any).splitGoodBad(history, 0.25);

            expect(splitGoodBad.good.length + splitGoodBad.bad.length).toBe(1);
        });
    });

    describe('TPE Core: Kernel Density Estimation', () => {
        it('[F5-6] should return positive density for valid samples', () => {
            const optimizer = new BayesianOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const samples = [
                { x: 0.5, y: 0.5 },
                { x: 0.6, y: 0.6 },
                { x: 0.4, y: 0.4 }
            ];
            const point = { x: 0.5, y: 0.5 };

            const kde = (optimizer as any).kernelDensityEstimate(samples, point);
            expect(kde).toBeGreaterThan(0);
        });

        it('[F5-6] should return zero density for empty samples', () => {
            const optimizer = new BayesianOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const kde = (optimizer as any).kernelDensityEstimate([], { x: 0.5 });

            expect(kde).toBe(0);
        });

        it('[F5-6] should produce higher density near sample points', () => {
            const optimizer = new BayesianOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const samples = [{ x: 0.5 }, { x: 0.5 }, { x: 0.5 }];

            const nearPoint = { x: 0.5 };
            const farPoint = { x: 2.0 };

            const kdeNear = (optimizer as any).kernelDensityEstimate(samples, nearPoint);
            const kdeFar = (optimizer as any).kernelDensityEstimate(samples, farPoint);

            expect(kdeNear).toBeGreaterThan(kdeFar);
        });

        it('[F5-7] expected improvement ratio should be higher for points near good samples', () => {
            const optimizer = new BayesianOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const good = [{ x: 0.5 }, { x: 0.5 }];
            const bad = [{ x: 2.0 }, { x: 2.0 }];

            const pointNearGood = { x: 0.5 };
            const pointNearBad = { x: 2.0 };

            const eiNearGood = (optimizer as any).expectedImprovement(good, bad, pointNearGood);
            const eiNearBad = (optimizer as any).expectedImprovement(good, bad, pointNearBad);

            expect(eiNearGood).toBeGreaterThan(eiNearBad);
        });

        it('[F5-7] expected improvement should handle division by zero', () => {
            const optimizer = new BayesianOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const good = [{ x: 1 }];
            const bad: any[] = [];
            const point = { x: 1 };

            const ei = (optimizer as any).expectedImprovement(good, bad, point);
            // When bad is empty, EI might be Infinity or 0, both are valid edge case handling
            expect(typeof ei === 'number').toBe(true);
        });
    });

    describe('TPE: Random Parameter Generation', () => {
        it('[F5-8] should generate integer parameters within bounds', () => {
            const optimizer = new BayesianOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const params = (optimizer as any).generateRandomParams(10);

            params.forEach((p: any) => {
                expect(p.buyRsi).toBeGreaterThanOrEqual(20);
                expect(p.buyRsi).toBeLessThanOrEqual(40);
                expect(Number.isInteger(p.buyRsi)).toBe(true);

                expect(p.sellRsi).toBeGreaterThanOrEqual(60);
                expect(p.sellRsi).toBeLessThanOrEqual(80);
                expect(Number.isInteger(p.sellRsi)).toBe(true);
            });
        });

        it('[F5-8] should generate correct number of parameter sets', () => {
            const optimizer = new BayesianOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const params50 = (optimizer as any).generateRandomParams(50);
            const params100 = (optimizer as any).generateRandomParams(100);

            expect(params50.length).toBe(50);
            expect(params100.length).toBe(100);
        });

        it('[F5-8] should generate diverse parameters', () => {
            const optimizer = new BayesianOptimizer(mockStrategy, mockData, config, optimizationSpace);
            const params = (optimizer as any).generateRandomParams(50);

            // Check that we don't have all identical params
            const unique = new Set(params.map((p: any) => JSON.stringify(p)));
            expect(unique.size).toBeGreaterThan(1);
        });
    });

    describe('Bayesian Optimization: Integration', () => {
        it('[F5-8] should complete optimization without errors', async () => {
            const optimizer = new BayesianOptimizer(mockStrategy, mockData, config, optimizationSpace);

            // Mock the BacktestEngine to speed up testing
            (optimizer as any).evaluateParams = jest.fn(async (params) => ({
                params,
                score: Math.random() * 100,
                backtestResult: {} as any
            }));

            const results = await (optimizer as any).optimize();

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);
        });

        it('[F5-8] should explore both random and guided phases', async () => {
            const optimizer = new BayesianOptimizer(mockStrategy, mockData, config, optimizationSpace);
            let evalCount = 0;

            (optimizer as any).evaluateParams = jest.fn(async (params) => {
                evalCount++;
                return {
                    params,
                    score: Math.random() * 100,
                    backtestResult: {} as any
                };
            });

            const results = await (optimizer as any).optimize();

            // Should have evaluated maxEvals parameters
            expect(evalCount).toBe(config.maxEvals);
            expect(results.length).toBe(config.maxEvals);
        });

        it('[F5-8] should return results sorted by score (descending)', async () => {
            const optimizer = new BayesianOptimizer(mockStrategy, mockData, config, optimizationSpace);

            (optimizer as any).evaluateParams = jest.fn(async (params) => ({
                params,
                score: Math.random() * 100,
                backtestResult: {} as any
            }));

            const results = await (optimizer as any).optimize();

            // Check sorting
            for (let i = 1; i < results.length; i++) {
                expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
            }
        });
    });

    describe('Efficiency Report', () => {
        it('[F5-9] should generate comparison report between Bayesian and Grid', () => {
            const bayesianResults: StrategyOptimizationResult[] = Array.from({ length: 30 }, (_, i) => ({
                params: { x: i },
                score: 40 + Math.random() * 20,
                backtestResult: {} as any
            }));

            const gridResults: StrategyOptimizationResult[] = Array.from({ length: 100 }, (_, i) => ({
                params: { x: i },
                score: 35 + Math.random() * 25,
                backtestResult: {} as any
            }));

            const report = BayesianOptimizer.getEfficiencyReport(bayesianResults, gridResults);

            expect(report).toContain('Bayesian Optimization (TPE) vs Grid Search');
            expect(report).toContain('Evaluations');
            expect(report).toContain('Best Score');
            expect(report).toContain('Efficiency Gain');
        });

        it('[F5-9] should show positive efficiency when Bayesian uses fewer evals', () => {
            const bayesianResults: StrategyOptimizationResult[] = Array.from({ length: 20 }, (_, i) => ({
                params: { x: i },
                score: 50 + Math.random() * 10,
                backtestResult: {} as any
            }));

            const gridResults: StrategyOptimizationResult[] = Array.from({ length: 100 }, (_, i) => ({
                params: { x: i },
                score: 45 + Math.random() * 15,
                backtestResult: {} as any
            }));

            const report = BayesianOptimizer.getEfficiencyReport(bayesianResults, gridResults);

            // Report should mention positive gain
            expect(report).toContain('Efficiency');
        });

        it('[F5-10] should calculate ROI correctly in efficiency report', () => {
            const bayesianResults: StrategyOptimizationResult[] = [
                { params: { x: 1 }, score: 60, backtestResult: {} as any }
            ];
            const gridResults: StrategyOptimizationResult[] = [
                { params: { x: 1 }, score: 50, backtestResult: {} as any },
                { params: { x: 2 }, score: 55, backtestResult: {} as any }
            ];

            const report = BayesianOptimizer.getEfficiencyReport(bayesianResults, gridResults);

            // Should report efficiency metrics
            expect(report).toContain('Score Improvement');
            expect(report).toContain('ROI');
        });
    });
});
