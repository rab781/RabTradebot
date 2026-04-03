import { IStrategy, StrategyOptimizationParams, StrategyOptimizationResult, BacktestResult } from '../types/strategy';
import { BacktestEngine } from './backtestEngine';
import { OHLCVCandle } from '../types/dataframe';

export interface OptimizationConfig {
    maxEvals: number;
    timerange: string;
    timeframe: string;
    metric: 'total_profit' | 'sharpe_ratio' | 'profit_factor' | 'win_rate' | 'calmar_ratio';
    randomState?: number;
    jobs?: number;
}

export interface OptimizationSpace {
    [paramName: string]: {
        type: 'int' | 'real' | 'categorical';
        low?: number;
        high?: number;
        values?: any[];
        step?: number;
    };
}

export interface WFOWindowResult {
    window: number;
    inSampleScore: number;
    outOfSampleScore: number;
    stabilityRatio: number;
    bestParams: Record<string, any>;
    backtestResult: BacktestResult;
}

export interface WFOResult {
    windows: WFOWindowResult[];
    bestStableParams: Record<string, any>;
    avgStabilityRatio: number;
    summary: string;
}

export interface MonteCarloResult {
    simulations: number;
    profitDistribution: { p5: number; p25: number; median: number; p75: number; p95: number };
    drawdownDistribution: { p5: number; p25: number; median: number; p75: number; p95: number };
    sharpeDistribution: { p5: number; p25: number; median: number; p75: number; p95: number };
    summary: string;
}

export interface ParetoPoint {
    params: Record<string, any>;
    objectives: { returnPct: number; drawdownPct: number; winRate: number; profitFactor: number };
    isDominated: boolean;
}

export interface ParetoResult {
    frontier: ParetoPoint[];
    allPoints: ParetoPoint[];
    frontierSize: number;
    summary: string;
}

export interface SensitivityResult {
    paramName: string;
    sensitivityScore: number;
    isRobust: boolean;
    neighborhoodPerformance: number[];
}

export class StrategyOptimizer {
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

    async optimize(): Promise<StrategyOptimizationResult[]> {
        console.log(`Starting strategy optimization for ${this.strategy.name}`);
        console.log(`Max evaluations: ${this.config.maxEvals}`);
        console.log(`Optimization metric: ${this.config.metric}`);

        const results: StrategyOptimizationResult[] = [];
        
        // Generate parameter combinations
        const parameterCombinations = this.generateParameterCombinations();
        const totalCombinations = Math.min(parameterCombinations.length, this.config.maxEvals);
        
        console.log(`Generated ${parameterCombinations.length} parameter combinations`);
        console.log(`Testing ${totalCombinations} combinations...`);

        for (let i = 0; i < totalCombinations; i++) {
            const params = parameterCombinations[i];
            
            try {
                // Apply parameters to strategy
                const modifiedStrategy = this.applyParameters(params);
                
                // Run backtest
                const backtestConfig = {
                    strategy: modifiedStrategy.name,
                    timerange: this.config.timerange,
                    timeframe: this.config.timeframe,
                    maxOpenTrades: modifiedStrategy.maxOpenTrades,
                    stakeAmount: typeof modifiedStrategy.stakeAmount === 'number' ? modifiedStrategy.stakeAmount : 100,
                    startingBalance: 1000,
                    feeOpen: 0.001,
                    feeClose: 0.001,
                    enableProtections: false,
                    dryRunWallet: 1000
                };

                const backtestEngine = new BacktestEngine(modifiedStrategy, backtestConfig);
                const backtestResult = await backtestEngine.runBacktest(this.data);
                
                // Calculate optimization score
                const score = this.calculateScore(backtestResult);
                
                results.push({
                    params: params,
                    score: score,
                    backtestResult: backtestResult
                });

                // Progress logging
                if ((i + 1) % 10 === 0 || i === totalCombinations - 1) {
                    console.log(`Progress: ${i + 1}/${totalCombinations} (${((i + 1) / totalCombinations * 100).toFixed(1)}%)`);
                    console.log(`Best score so far: ${Math.max(...results.map(r => r.score)).toFixed(4)}`);
                }

            } catch (error) {
                console.error(`Error testing parameters ${JSON.stringify(params)}:`, error);
                // Continue with next combination
            }
        }

        // Sort results by score (descending)
        results.sort((a, b) => b.score - a.score);
        
        console.log(`Optimization completed. Best ${Math.min(10, results.length)} results:`);
        for (let i = 0; i < Math.min(10, results.length); i++) {
            const result = results[i];
            console.log(`${i + 1}. Score: ${result.score.toFixed(4)}, Params: ${JSON.stringify(result.params)}`);
            console.log(`   Total Profit: ${result.backtestResult.totalProfitPct.toFixed(2)}%, Win Rate: ${result.backtestResult.winRate.toFixed(1)}%`);
        }

        return results;
    }

    private generateParameterCombinations(): Array<{ [key: string]: any }> {
        const combinations: Array<{ [key: string]: any }> = [];
        const paramNames = Object.keys(this.optimizationSpace);
        
        if (paramNames.length === 0) {
            return [{}];
        }

        // Simple grid search approach
        // For real optimization, you'd want to use more sophisticated algorithms like Bayesian optimization
        const generateRecursive = (index: number, currentParams: { [key: string]: any }) => {
            if (index >= paramNames.length) {
                combinations.push({ ...currentParams });
                return;
            }

            const paramName = paramNames[index];
            const paramConfig = this.optimizationSpace[paramName];
            let values: any[] = [];

            if (paramConfig.type === 'categorical') {
                values = paramConfig.values || [];
            } else if (paramConfig.type === 'int') {
                const low = paramConfig.low || 0;
                const high = paramConfig.high || 100;
                const step = paramConfig.step || 1;
                
                // Limit number of values to prevent explosion
                const maxValues = 10;
                const actualStep = Math.max(step, Math.ceil((high - low) / maxValues));
                
                for (let value = low; value <= high; value += actualStep) {
                    values.push(Math.round(value));
                }
            } else if (paramConfig.type === 'real') {
                const low = paramConfig.low || 0;
                const high = paramConfig.high || 1;
                const step = paramConfig.step || (high - low) / 10;
                
                // Limit number of values to prevent explosion
                const maxValues = 10;
                const actualStep = Math.max(step, (high - low) / maxValues);
                
                for (let value = low; value <= high; value += actualStep) {
                    values.push(Math.round(value * 10000) / 10000); // Round to 4 decimal places
                }
            }

            for (const value of values) {
                currentParams[paramName] = value;
                generateRecursive(index + 1, currentParams);
            }
        };

        generateRecursive(0, {});
        
        // Shuffle combinations for better exploration
        for (let i = combinations.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [combinations[i], combinations[j]] = [combinations[j], combinations[i]];
        }

        return combinations;
    }

    private applyParameters(params: { [key: string]: any }): IStrategy {
        // Create a copy of the strategy with modified parameters
        const modifiedStrategy = Object.create(Object.getPrototypeOf(this.strategy));
        Object.assign(modifiedStrategy, this.strategy);

        // Apply parameters
        for (const [paramName, value] of Object.entries(params)) {
            if (paramName in modifiedStrategy) {
                (modifiedStrategy as any)[paramName] = value;
            }
        }

        return modifiedStrategy;
    }

    private calculateScore(result: BacktestResult): number {
        switch (this.config.metric) {
            case 'total_profit':
                return result.totalProfitPct;
            
            case 'sharpe_ratio':
                return result.sharpeRatio;
            
            case 'profit_factor':
                return result.profitFactor;
            
            case 'win_rate':
                return result.winRate;
            
            case 'calmar_ratio':
                return result.calmarRatio;
            
            default:
                // Default composite score
                return this.calculateCompositeScore(result);
        }
    }

    private calculateCompositeScore(result: BacktestResult): number {
        // Composite score combining multiple metrics
        const profitWeight = 0.3;
        const sharpeWeight = 0.2;
        const winRateWeight = 0.2;
        const profitFactorWeight = 0.15;
        const drawdownWeight = 0.15;

        // Normalize profit (0-100 scale)
        const normalizedProfit = Math.max(0, Math.min(100, result.totalProfitPct));
        
        // Normalize Sharpe ratio (typically -3 to 3, scale to 0-100)
        const normalizedSharpe = Math.max(0, Math.min(100, (result.sharpeRatio + 3) / 6 * 100));
        
        // Win rate is already 0-100
        const normalizedWinRate = result.winRate;
        
        // Normalize profit factor (typically 0-5, scale to 0-100)
        const normalizedProfitFactor = Math.max(0, Math.min(100, result.profitFactor / 5 * 100));
        
        // Drawdown penalty (0-100, lower is better)
        const drawdownPenalty = Math.max(0, 100 - result.maxDrawdownPct);

        const compositeScore = 
            normalizedProfit * profitWeight +
            normalizedSharpe * sharpeWeight +
            normalizedWinRate * winRateWeight +
            normalizedProfitFactor * profitFactorWeight +
            drawdownPenalty * drawdownWeight;

        return compositeScore;
    }

    // Utility method to create optimization space for common strategy parameters
    static createDefaultOptimizationSpace(): OptimizationSpace {
        return {
            buyRsi: {
                type: 'int',
                low: 20,
                high: 40,
                step: 2
            },
            sellRsi: {
                type: 'int',
                low: 60,
                high: 80,
                step: 2
            },
            shortRsi: {
                type: 'int',
                low: 60,
                high: 80,
                step: 2
            },
            exitShortRsi: {
                type: 'int',
                low: 20,
                high: 40,
                step: 2
            },
            stoploss: {
                type: 'real',
                low: -0.15,
                high: -0.02,
                step: 0.01
            }
        };
    }

    // Method to analyze optimization results
    static analyzeResults(results: StrategyOptimizationResult[]): {
        bestParams: { [key: string]: any };
        parameterImportance: { [key: string]: number };
        correlations: { [key: string]: number };
        summary: string;
    } {
        if (results.length === 0) {
            throw new Error('No optimization results to analyze');
        }

        const bestResult = results[0]; // Results are sorted by score
        const bestParams = bestResult.params;

        // Calculate parameter importance (simplified)
        const parameterImportance: { [key: string]: number } = {};
        const correlations: { [key: string]: number } = {};
        
        const paramNames = Object.keys(bestParams);
        for (const paramName of paramNames) {
            // Calculate correlation between parameter value and score
            const paramValues = results.map(r => r.params[paramName]);
            const scores = results.map(r => r.score);
            
            const correlation = this.calculateCorrelation(paramValues, scores);
            correlations[paramName] = correlation;
            parameterImportance[paramName] = Math.abs(correlation);
        }

        // Generate summary
        const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
        const scoreStd = Math.sqrt(results.reduce((sum, r) => sum + Math.pow(r.score - avgScore, 2), 0) / results.length);
        
        const summary = `
Optimization Analysis Summary:
- Total evaluations: ${results.length}
- Best score: ${bestResult.score.toFixed(4)}
- Average score: ${avgScore.toFixed(4)} ± ${scoreStd.toFixed(4)}
- Best total profit: ${bestResult.backtestResult.totalProfitPct.toFixed(2)}%
- Best win rate: ${bestResult.backtestResult.winRate.toFixed(1)}%
- Best Sharpe ratio: ${bestResult.backtestResult.sharpeRatio.toFixed(3)}

Parameter Importance (by correlation with score):
${Object.entries(parameterImportance)
    .sort(([,a], [,b]) => b - a)
    .map(([param, importance]) => `- ${param}: ${importance.toFixed(3)}`)
    .join('\n')}
        `;

        return {
            bestParams,
            parameterImportance,
            correlations,
            summary
        };
    }

    private static calculateCorrelation(x: number[], y: number[]): number {
        if (x.length !== y.length || x.length === 0) {
            return 0;
        }

        const n = x.length;

        // ⚡ Bolt Optimization: Replace 5 separate O(N) .reduce() iterations with 1 O(N) loop
        let sumX = 0;
        let sumY = 0;
        let sumXY = 0;
        let sumX2 = 0;
        let sumY2 = 0;

        for (let i = 0; i < n; i++) {
            const xi = x[i];
            const yi = y[i];
            sumX += xi;
            sumY += yi;
            sumXY += xi * yi;
            sumX2 += xi * xi;
            sumY2 += yi * yi;
        }

        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt(Math.max(0, (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)));

        if (denominator === 0) {
            return 0;
        }

        return numerator / denominator;
    }

    /**
     * Walk-Forward Optimization: Validates parameter robustness on rolling out-of-sample data
     * Splits data into numWindows rolling windows, optimizes on in-sample, validates on OOS
     */
    async walkForwardOptimize(
        numWindows: number = 5,
        inSampleRatio: number = 0.7
    ): Promise<WFOResult> {
        console.log(`Starting Walk-Forward Optimization with ${numWindows} windows, ${(inSampleRatio*100).toFixed(0)}% in-sample`);

        if (numWindows < 1 || this.data.length < numWindows * 2) {
            throw new Error('Insufficient data for Walk-Forward Optimization');
        }

        const windows: WFOWindowResult[] = [];
        const windowSize = Math.floor(this.data.length / numWindows);
        const allBestParams: Array<{ params: Record<string, any>; oos: number }> = [];

        for (let w = 0; w < numWindows; w++) {
            const windowStart = w * windowSize;
            const windowEnd = Math.min((w + 1) * windowSize, this.data.length);
            const windowData = this.data.slice(windowStart, windowEnd);

            const splitPoint = Math.floor(windowData.length * inSampleRatio);
            const inSampleData = windowData.slice(0, splitPoint);
            const outOfSampleData = windowData.slice(splitPoint);

            if (inSampleData.length < 10 || outOfSampleData.length < 10) {
                console.warn(`Window ${w + 1}: insufficient data, skipping`);
                continue;
            }

            // Optimize on in-sample data
            const inSampleOptimizer = new StrategyOptimizer(
                this.strategy,
                inSampleData,
                this.config,
                this.optimizationSpace
            );
            const inSampleResults = await inSampleOptimizer.optimize();

            if (inSampleResults.length === 0) {
                console.warn(`Window ${w + 1}: no valid results, skipping`);
                continue;
            }

            const bestInSampleResult = inSampleResults[0];
            const isScore = bestInSampleResult.score;

            // Validate best params on out-of-sample data
            const outOfSampleOptimizer = new StrategyOptimizer(
                this.strategy,
                outOfSampleData,
                this.config,
                this.optimizationSpace
            );
            const modifiedStrategy = outOfSampleOptimizer.applyParameters(bestInSampleResult.params);
            const backtestEngine = new BacktestEngine(modifiedStrategy, {
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
            const oosBacktest = await backtestEngine.runBacktest(outOfSampleData);
            const oosScore = this.calculateScore(oosBacktest);

            const stabilityRatio = isScore !== 0 ? oosScore / isScore : 0;
            const windowResult: WFOWindowResult = {
                window: w + 1,
                inSampleScore: isScore,
                outOfSampleScore: oosScore,
                stabilityRatio,
                bestParams: bestInSampleResult.params,
                backtestResult: oosBacktest
            };

            windows.push(windowResult);
            allBestParams.push({ params: bestInSampleResult.params, oos: oosScore });

            console.log(
                `Window ${w + 1}: IS=${isScore.toFixed(4)}, OOS=${oosScore.toFixed(4)}, Stability=${stabilityRatio.toFixed(3)}`
            );
        }

        if (windows.length === 0) {
            throw new Error('No valid windows for Walk-Forward Optimization');
        }

        // Find most stable parameters
        const bestStableWindow = windows.reduce((prev, current) =>
            current.stabilityRatio > prev.stabilityRatio ? current : prev
        );

        const avgStabilityRatio = windows.reduce((sum, w) => sum + w.stabilityRatio, 0) / windows.length;
        const summary = this.formatWFOSummary({ windows, bestStableParams: bestStableWindow.bestParams, avgStabilityRatio, summary: '' });

        return {
            windows,
            bestStableParams: bestStableWindow.bestParams,
            avgStabilityRatio,
            summary
        };
    }

    private formatWFOSummary(result: WFOResult): string {
        const windowSummaries = result.windows.map(w =>
            `Window ${w.window}: IS=${w.inSampleScore.toFixed(3)}, OOS=${w.outOfSampleScore.toFixed(3)}, Stability=${w.stabilityRatio.toFixed(3)}`
        ).join('\n');

        return `
Walk-Forward Optimization Results:
${windowSummaries}

Average Stability Ratio: ${result.avgStabilityRatio.toFixed(3)}
Best Stable Parameters: ${JSON.stringify(result.bestStableParams)}

Note: Stability Ratio = OOS Score / IS Score
Higher ratio (closer to 1.0) indicates less overfitting.
        `;
    }

    /**
     * Deflated Sharpe Ratio (DSR): Corrects Sharpe Ratio for multiple testing bias
     * Uses Bailey & Lopez de Prado (2014) formula
     * Returns probability that observed Sharpe is genuine, not from data mining
     */
    static deflatedSharpeRatio(
        observedSR: number,
        totalTrials: number,
        returnSkewness: number = 0,
        returnKurtosis: number = 3
    ): number {
        // Formula: P(DSR) = Φ((SR_obs * √n) / √(1 - γ₃*SR + ((γ₄-1)/4)*SR²))
        // Where: Φ = standard normal CDF, γ₃ = skewness, γ₄ = kurtosis

        if (totalTrials < 1) {
            return 0;
        }

        const sqrtN = Math.sqrt(totalTrials);
        const denomPart = 1 - returnSkewness * observedSR + ((returnKurtosis - 1) / 4) * observedSR * observedSR;

        if (denomPart <= 0) {
            return 0;
        }

        const denominator = Math.sqrt(denomPart);
        const zScore = (observedSR * sqrtN) / denominator;

        // Standard normal CDF approximation
        const cdf = 0.5 * (1 + this.erf(zScore / Math.sqrt(2)));
        return Math.max(0, Math.min(1, cdf));
    }

    // Helper: Error function for normal CDF
    private static erf(x: number): number {
        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const p = 0.3275911;

        const sign = x >= 0 ? 1 : -1;
        x = Math.abs(x);

        const t = 1.0 / (1.0 + p * x);
        const t2 = t * t;
        const t3 = t2 * t;
        const t4 = t3 * t;
        const t5 = t4 * t;

        const result = 1.0 - sign * (a1 * t + a2 * t2 + a3 * t3 + a4 * t4 + a5 * t5) * Math.exp(-x * x);

        return result;
    }

    /**
     * Compute Pareto Frontier: Find non-dominated parameter sets across multiple objectives
     * Non-dominated = cannot improve one objective without worsening another
     */
    computeParetoFrontier(results: StrategyOptimizationResult[]): ParetoResult {
        if (results.length === 0) {
            return {
                frontier: [],
                allPoints: [],
                frontierSize: 0,
                summary: 'No results to analyze'
            };
        }

        // Convert results to Pareto points
        const allPoints: ParetoPoint[] = results.map(r => ({
            params: r.params,
            objectives: {
                returnPct: r.backtestResult.totalProfitPct,
                drawdownPct: r.backtestResult.maxDrawdownPct,
                winRate: r.backtestResult.winRate,
                profitFactor: r.backtestResult.profitFactor
            },
            isDominated: false
        }));

        // Find non-dominated points (simple pairwise comparison)
        for (let i = 0; i < allPoints.length; i++) {
            for (let j = 0; j < allPoints.length; j++) {
                if (i === j) continue;

                // Check if i dominates j
                const iObj = allPoints[i].objectives;
                const jObj = allPoints[j].objectives;

                // i dominates j if: return >= j.return AND drawdown <= j.drawdown AND winrate >= j.winrate
                const idominatesj = 
                    iObj.returnPct >= jObj.returnPct &&
                    iObj.drawdownPct <= jObj.drawdownPct &&
                    iObj.winRate >= jObj.winRate &&
                    (iObj.returnPct > jObj.returnPct || iObj.drawdownPct < jObj.drawdownPct);

                if (idominatesj) {
                    allPoints[j].isDominated = true;
                }
            }
        }

        const frontier = allPoints.filter(p => !p.isDominated);
        const summary = this.formatParetoSummary({
            frontier,
            allPoints,
            frontierSize: frontier.length,
            summary: ''
        });

        return {
            frontier,
            allPoints,
            frontierSize: frontier.length,
            summary
        };
    }

    private formatParetoSummary(result: ParetoResult): string {
        const frontierDetails = result.frontier.map(p =>
            `Return: ${p.objectives.returnPct.toFixed(2)}%, Drawdown: ${p.objectives.drawdownPct.toFixed(1)}%, ` +
            `Win Rate: ${p.objectives.winRate.toFixed(1)}%, Profit Factor: ${p.objectives.profitFactor.toFixed(2)}`
        ).join('\n');

        return `
Pareto Frontier Analysis:
========================

Non-dominated Solutions (${result.frontierSize} found):
${frontierDetails}

Trade-offs Identified:
- Higher returns usually associated with higher drawdowns
- Best for profit maximization: ${result.frontier.reduce((max, p) => p.objectives.returnPct > max.objectives.returnPct ? p : max).objectives.returnPct.toFixed(2)}% return
- Best for risk minimization: ${result.frontier.reduce((min, p) => p.objectives.drawdownPct < min.objectives.drawdownPct ? p : min).objectives.drawdownPct.toFixed(1)}% maximum drawdown
        `;
    }

    /**
     * Parameter Sensitivity Analysis: Test robustness of each parameter
     * Evaluates performance at ±10% of optimal value
     */
    parameterSensitivity(results: StrategyOptimizationResult[], bestParams: Record<string, any>): SensitivityResult[] {
        const sensitivities: SensitivityResult[] = [];

        for (const [paramName, optimalValue] of Object.entries(bestParams)) {
            // Find performance at ±10% of optimal
            const neighborhood = results.filter(r => {
                const param = r.params[paramName];
                if (typeof param !== 'number' || typeof optimalValue !== 'number') return false;

                const delta = Math.abs(optimalValue * 0.1);
                return Math.abs(param - optimalValue) <= delta;
            });

            if (neighborhood.length === 0) {
                sensitivities.push({
                    paramName,
                    sensitivityScore: Infinity,
                    isRobust: false,
                    neighborhoodPerformance: []
                });
                continue;
            }

            const performances = neighborhood.map(r => r.score);
            const bestPerf = Math.max(...performances);
            const mean = performances.reduce((a, b) => a + b, 0) / performances.length;
            const stdDev = Math.sqrt(performances.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / performances.length);

            // Sensitivity score: coefficient of variation (std/mean)
            const sensitivityScore = mean !== 0 ? stdDev / mean : 0;
            const isRobust = sensitivityScore < 0.3; // Less than 30% variation = robust

            sensitivities.push({
                paramName,
                sensitivityScore,
                isRobust,
                neighborhoodPerformance: performances
            });
        }

        return sensitivities;
    }

    /**
     * Compute Overfitting Probability (PBO): Compares in-sample vs out-of-sample parameter rankings
     * High PBO = strategy likely overfit
     */
    static computeOverfittingProbability(wfoResults: WFOWindowResult[]): number {
        if (wfoResults.length < 2) {
            return 0;
        }

        // Track if best IS params match best OOS params
        let paramsMismatch = 0;

        for (const window of wfoResults) {
            // Find which parameter value had best IS performance
            // Find which parameter value had best OOS performance
            // If they differ → overfitting detected

            // Simplified: check if stability ratio is far from 1.0
            // Stability ratio close to 1.0 = good alignment (no overfitting)
            if (Math.abs(window.stabilityRatio - 1.0) > 0.5) {
                // High divergence between IS and OOS = likely overfitting
                paramsMismatch++;
            }
        }

        // PBO = fraction of mismatches
        return paramsMismatch / wfoResults.length;
    }

    /**
     * Monte Carlo Robustness Test: Stress-test strategy under randomized trade ordering
     * Evaluates profit, drawdown, Sharpe ratio under different random permutations
     */
    monteCarloTest(trades: Array<{profit: number; maxDrawdown: number}>, numSimulations: number = 1000): MonteCarloResult {
        if (trades.length === 0) {
            return {
                simulations: numSimulations,
                profitDistribution: { p5: 0, p25: 0, median: 0, p75: 0, p95: 0 },
                drawdownDistribution: { p5: 0, p25: 0, median: 0, p75: 0, p95: 0 },
                sharpeDistribution: { p5: 0, p25: 0, median: 0, p75: 0, p95: 0 },
                summary: 'No trades to analyze'
            };
        }

        // ⚡ Bolt Optimization: Pre-allocate arrays instead of using push
        const profitResults: number[] = new Array(numSimulations);
        const drawdownResults: number[] = new Array(numSimulations);
        const sharpeResults: number[] = new Array(numSimulations);

        const numTrades = trades.length;
        // ⚡ Bolt Optimization: Clone once outside the hot loop to avoid repeated O(N) allocations
        const shuffledTrades = [...trades];

        for (let sim = 0; sim < numSimulations; sim++) {
            // Fisher-Yates shuffle in-place
            for (let i = numTrades - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const temp = shuffledTrades[i];
                shuffledTrades[i] = shuffledTrades[j];
                shuffledTrades[j] = temp;
            }

            // Calculate metrics from shuffled trades
            // ⚡ Bolt Optimization: Single-pass for loop replacing multiple .reduce() and .map() calls
            let totalProfit = 0;
            let sumProfitSq = 0;
            let maxDrawdown = -Infinity;

            for (let i = 0; i < numTrades; i++) {
                const t = shuffledTrades[i];
                totalProfit += t.profit;
                sumProfitSq += t.profit * t.profit;
                if (t.maxDrawdown > maxDrawdown) {
                    maxDrawdown = t.maxDrawdown;
                }
            }

            const avgProfit = totalProfit / numTrades;
            // Var(X) = E[X^2] - (E[X])^2
            const expectedSq = sumProfitSq / numTrades;
            let variance = expectedSq - (avgProfit * avgProfit);
            // Prevent NaN from floating-point negative zero errors
            variance = Math.max(0, variance);

            const stdDev = Math.sqrt(variance);
            const sharpe = stdDev !== 0 ? avgProfit / stdDev : 0;

            profitResults[sim] = totalProfit;
            drawdownResults[sim] = maxDrawdown;
            sharpeResults[sim] = sharpe;
        }

        // Calculate percentiles
        const getPercentile = (data: number[], p: number) => {
            const sorted = [...data].sort((a, b) => a - b);
            const idx = Math.ceil((p / 100) * sorted.length) - 1;
            return sorted[Math.max(0, idx)];
        };

        const medianIndex = Math.floor(profitResults.length / 2);
        
        const result: MonteCarloResult = {
            simulations: numSimulations,
            profitDistribution: {
                p5: getPercentile(profitResults, 5),
                p25: getPercentile(profitResults, 25),
                median: profitResults.sort((a, b) => a - b)[medianIndex],
                p75: getPercentile(profitResults, 75),
                p95: getPercentile(profitResults, 95)
            },
            drawdownDistribution: {
                p5: getPercentile(drawdownResults, 5),
                p25: getPercentile(drawdownResults, 25),
                median: drawdownResults.sort((a, b) => a - b)[medianIndex],
                p75: getPercentile(drawdownResults, 75),
                p95: getPercentile(drawdownResults, 95)
            },
            sharpeDistribution: {
                p5: getPercentile(sharpeResults, 5),
                p25: getPercentile(sharpeResults, 25),
                median: sharpeResults.sort((a, b) => a - b)[medianIndex],
                p75: getPercentile(sharpeResults, 75),
                p95: getPercentile(sharpeResults, 95)
            },
            summary: ''
        };

        result.summary = this.formatMonteCarloSummary(result);
        return result;
    }

    /**
     * Format Monte Carlo test results for human-readable output
     */
    private formatMonteCarloSummary(result: MonteCarloResult): string {
        return `
Monte Carlo Robustness Test Results (${result.simulations} simulations):
=========================================================

Profit Distribution:
  P5:     ${result.profitDistribution.p5.toFixed(2)}
  P25:    ${result.profitDistribution.p25.toFixed(2)}
  Median: ${result.profitDistribution.median.toFixed(2)}
  P75:    ${result.profitDistribution.p75.toFixed(2)}
  P95:    ${result.profitDistribution.p95.toFixed(2)}

Max Drawdown Distribution:
  P5:     ${result.drawdownDistribution.p5.toFixed(2)}%
  P25:    ${result.drawdownDistribution.p25.toFixed(2)}%
  Median: ${result.drawdownDistribution.median.toFixed(2)}%
  P75:    ${result.drawdownDistribution.p75.toFixed(2)}%
  P95:    ${result.drawdownDistribution.p95.toFixed(2)}%

Sharpe Ratio Distribution:
  P5:     ${result.sharpeDistribution.p5.toFixed(3)}
  P25:    ${result.sharpeDistribution.p25.toFixed(3)}
  Median: ${result.sharpeDistribution.median.toFixed(3)}
  P75:    ${result.sharpeDistribution.p75.toFixed(3)}
  P95:    ${result.sharpeDistribution.p95.toFixed(3)}

Key Insights:
- Dalam 95% skenario, max drawdown < ${result.drawdownDistribution.p95.toFixed(1)}%
- Dalam 5% skenario terburuk, profit = ${result.profitDistribution.p5.toFixed(2)}
- Median Sharpe Ratio di ${result.sharpeDistribution.median.toFixed(3)} menunjukkan robustness
        `;
    }
}
