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
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
        const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

        if (denominator === 0) {
            return 0;
        }

        return numerator / denominator;
    }
}
