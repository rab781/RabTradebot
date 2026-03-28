import { IStrategy, StrategyOptimizationResult } from '../types/strategy';
import { OHLCVCandle } from '../types/dataframe';
import { StrategyOptimizer, OptimizationConfig, OptimizationSpace } from './strategyOptimizer';

/**
 * Tree Parzen Estimator (TPE) - Bayesian Optimization Algorithm
 * Smart parameter exploration using kernel density estimation
 */
export class BayesianOptimizer {
    private evaluationHistory: Array<{
        params: Record<string, any>;
        score: number;
    }> = [];

    private strategy: IStrategy;
    private data: OHLCVCandle[];
    private config: OptimizationConfig;
    private optimizationSpace: OptimizationSpace;

    constructor(
        strategy: IStrategy,
        data: OHLCVCandle[],
        config: OptimizationConfig,
        optimizationSpace: OptimizationSpace
    ) {
        this.strategy = strategy;
        this.data = data;
        this.config = config;
        this.optimizationSpace = optimizationSpace;
    }

    /**
     * Main Bayesian Optimization Loop using TPE
     * 1. Random exploration (10 evals)
     * 2. Split results into good (top 25%) and bad (bottom 75%)
     * 3. Fit Gaussian KDE to both groups
     * 4. Sample next point maximizing l(x)/g(x) ratio
     * 5. Repeat until maxEvals
     */
    async optimize(): Promise<StrategyOptimizationResult[]> {
        console.log(`Starting Bayesian Optimization (TPE) with max ${this.config.maxEvals} evaluations`);

        const results: StrategyOptimizationResult[] = [];
        const initialRandomEvals = Math.min(10, Math.ceil(this.config.maxEvals * 0.2));

        // Phase 1: Random exploration
        console.log(`Phase 1: Random exploration with ${initialRandomEvals} evaluations...`);
        const randomParams = this.generateRandomParams(initialRandomEvals);

        for (let i = 0; i < randomParams.length; i++) {
            const params = randomParams[i];
            const result = await this.evaluateParams(params);
            results.push(result);
            this.evaluationHistory.push({ params, score: result.score });

            if ((i + 1) % 5 === 0) {
                console.log(`Random phase: ${i + 1}/${initialRandomEvals}`);
            }
        }

        // Phase 2: Guided exploration with TPE
        console.log(`Phase 2: Guided exploration with TPE for ${this.config.maxEvals - initialRandomEvals} evaluations...`);

        for (let i = initialRandomEvals; i < this.config.maxEvals; i++) {
            // Split results into good (top 25%) and bad (bottom 75%)
            const { good, bad } = this.splitGoodBad(this.evaluationHistory, 0.25);

            // Sample next candidate
            const nextParams = this.sampleNextParams(good, bad);
            const result = await this.evaluateParams(nextParams);

            results.push(result);
            this.evaluationHistory.push({ params: nextParams, score: result.score });

            // Progress logging
            if ((i + 1) % 10 === 0 || i === this.config.maxEvals - 1) {
                const bestScore = Math.max(...results.map(r => r.score));
                console.log(`TPE phase: ${i + 1}/${this.config.maxEvals} (Best: ${bestScore.toFixed(4)})`);
            }
        }

        // Sort by score
        results.sort((a, b) => b.score - a.score);

        console.log(`Bayesian Optimization completed!`);
        console.log(`Best ${Math.min(5, results.length)} results:`);
        for (let i = 0; i < Math.min(5, results.length); i++) {
            console.log(`${i + 1}. Score: ${results[i].score.toFixed(4)}, Params: ${JSON.stringify(results[i].params)}`);
        }

        return results;
    }

    /**
     * Generate random parameter combinations from optimization space
     */
    private generateRandomParams(count: number): Array<Record<string, any>> {
        const params: Array<Record<string, any>> = [];

        for (let i = 0; i < count; i++) {
            const paramSet: Record<string, any> = {};

            for (const [paramName, config] of Object.entries(this.optimizationSpace)) {
                if (config.type === 'categorical') {
                    const values = config.values || [];
                    paramSet[paramName] = values[Math.floor(Math.random() * values.length)];
                } else if (config.type === 'int') {
                    const low = config.low || 0;
                    const high = config.high || 100;
                    paramSet[paramName] = Math.floor(Math.random() * (high - low + 1)) + low;
                } else if (config.type === 'real') {
                    const low = config.low || 0;
                    const high = config.high || 1;
                    paramSet[paramName] = Math.random() * (high - low) + low;
                }
            }

            params.push(paramSet);
        }

        return params;
    }

    /**
     * Split evaluation history into good and bad groups
     * good: top gamma% of results
     * bad: bottom (1-gamma)% of results
     */
    private splitGoodBad(
        history: Array<{ params: Record<string, any>; score: number }>,
        gamma: number = 0.25
    ): { good: Array<Record<string, any>>; bad: Array<Record<string, any>> } {
        // Sort by score descending
        const sorted = [...history].sort((a, b) => b.score - a.score);

        const splitIndex = Math.ceil(sorted.length * gamma);
        const good = sorted.slice(0, splitIndex).map(h => h.params);
        const bad = sorted.slice(splitIndex).map(h => h.params);

        return { good, bad };
    }

    /**
     * Kernel Density Estimation using Gaussian kernel
     * Estimates probability density at a point given a set of samples
     */
    private kernelDensityEstimate(samples: Array<Record<string, any>>, point: Record<string, any>): number {
        if (samples.length === 0) {
            return 0;
        }

        // Scott's bandwidth rule
        const bandwidth = Math.pow(samples.length, -1 / 5);

        let density = 0;
        for (const sample of samples) {
            // Calculate Euclidean distance
            let distSq = 0;
            let dimensions = 0;

            for (const [key, value] of Object.entries(point)) {
                if (key in sample) {
                    const diff = (sample[key] as number) - (value as number);
                    distSq += diff * diff;
                    dimensions++;
                }
            }

            if (dimensions === 0) continue;

            // Gaussian kernel
            const dist = Math.sqrt(distSq);
            const kernelValue = Math.exp(-0.5 * Math.pow(dist / bandwidth, 2));
            density += kernelValue;
        }

        return density / (samples.length * Math.pow(bandwidth, Object.keys(point).length));
    }

    /**
     * Expected Improvement ratio: p(good|x) / p(bad|x)
     * High ratio = likely to be good
     */
    private expectedImprovement(
        good: Array<Record<string, any>>,
        bad: Array<Record<string, any>>,
        point: Record<string, any>
    ): number {
        const pGood = this.kernelDensityEstimate(good, point);
        const pBad = this.kernelDensityEstimate(bad, point);

        if (pBad === 0 && pGood > 0) {
            return Infinity;
        }
        if (pBad === 0) {
            return 0;
        }

        return pGood / pBad;
    }

    /**
     * Sample next parameter set by maximizing expected improvement
     */
    private sampleNextParams(
        good: Array<Record<string, any>>,
        bad: Array<Record<string, any>>
    ): Record<string, any> {
        // Generate candidate pool
        const candidates = this.generateRandomParams(100);

        // Evaluate EI for each candidate
        let bestCandidate = candidates[0];
        let bestEI = this.expectedImprovement(good, bad, candidates[0]);

        for (let i = 1; i < candidates.length; i++) {
            const ei = this.expectedImprovement(good, bad, candidates[i]);
            if (ei > bestEI) {
                bestEI = ei;
                bestCandidate = candidates[i];
            }
        }

        return bestCandidate;
    }

    /**
     * Evaluate a parameter set and return StrategyOptimizationResult
     */
    private async evaluateParams(params: Record<string, any>): Promise<StrategyOptimizationResult> {
        const optimizer = new StrategyOptimizer(
            this.strategy,
            this.data,
            this.config,
            this.optimizationSpace
        );

        const modifiedStrategy = (optimizer as any).applyParameters(params);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const backtestEngine = require('./backtestEngine').BacktestEngine;

        const engine = new backtestEngine(modifiedStrategy, {
            strategy: modifiedStrategy.name,
            timerange: this.config.timerange,
            timeframe: this.config.timeframe,
            maxOpenTrades: (modifiedStrategy as any).maxOpenTrades || 3,
            stakeAmount: typeof (modifiedStrategy as any).stakeAmount === 'number' ? (modifiedStrategy as any).stakeAmount : 100,
            startingBalance: 1000,
            feeOpen: 0.001,
            feeClose: 0.001,
            enableProtections: false,
            dryRunWallet: 1000
        });

        const backtestResult = await engine.runBacktest(this.data);

        // Calculate score using same logic as StrategyOptimizer
        let score = 0;
        switch (this.config.metric) {
            case 'total_profit':
                score = backtestResult.totalProfitPct;
                break;
            case 'sharpe_ratio':
                score = backtestResult.sharpeRatio;
                break;
            case 'profit_factor':
                score = backtestResult.profitFactor;
                break;
            case 'win_rate':
                score = backtestResult.winRate;
                break;
            case 'calmar_ratio':
                score = backtestResult.calmarRatio;
                break;
            default:
                score = this.calculateCompositeScore(backtestResult);
        }

        return {
            params,
            score,
            backtestResult
        };
    }

    /**
     * Composite score = weighted avg of metrics
     */
    private calculateCompositeScore(result: any): number {
        const profitWeight = 0.3;
        const sharpeWeight = 0.2;
        const winRateWeight = 0.2;
        const profitFactorWeight = 0.15;
        const drawdownWeight = 0.15;

        const normalizedProfit = Math.max(0, Math.min(100, result.totalProfitPct));
        const normalizedSharpe = Math.max(0, Math.min(100, (result.sharpeRatio + 3) / 6 * 100));
        const normalizedWinRate = result.winRate;
        const normalizedProfitFactor = Math.max(0, Math.min(100, result.profitFactor / 5 * 100));
        const drawdownPenalty = Math.max(0, 100 - result.maxDrawdownPct);

        return (
            normalizedProfit * profitWeight +
            normalizedSharpe * sharpeWeight +
            normalizedWinRate * winRateWeight +
            normalizedProfitFactor * profitFactorWeight +
            drawdownPenalty * drawdownWeight
        );
    }

    /**
     * Generate efficiency report comparing Bayesian vs Grid Search
     */
    static getEfficiencyReport(
        bayesianResults: StrategyOptimizationResult[],
        gridResults: StrategyOptimizationResult[]
    ): string {
        const bayesianBest = bayesianResults.reduce((max, r) => r.score > max.score ? r : max);
        const gridBest = gridResults.reduce((max, r) => r.score > max.score ? r : max);

        const bayesianImprovement = ((bayesianBest.score - gridBest.score) / Math.abs(gridBest.score)) * 100;
        const efficiencyGain = (gridResults.length / bayesianResults.length - 1) * 100;

        return `
Bayesian Optimization (TPE) vs Grid Search Efficiency Report:
================================================

Grid Search Results:
- Evaluations: ${gridResults.length}
- Best Score: ${gridBest.score.toFixed(4)}

Bayesian Optimization Results:
- Evaluations: ${bayesianResults.length}
- Best Score: ${bayesianBest.score.toFixed(4)}

Performance:
- Score Improvement: ${bayesianImprovement.toFixed(1)}%
- Evaluations Saved: ${gridResults.length - bayesianResults.length}
- Efficiency Gain: ${efficiencyGain.toFixed(0)}% fewer evaluations for better/equal result
- ROI: ${((bayesianImprovement * gridResults.length) / bayesianResults.length).toFixed(1)}% total efficiency gain
        `;
    }
}
