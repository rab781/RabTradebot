const fs = require('fs');
const path = 'src/services/strategyOptimizer.ts';
let code = fs.readFileSync(path, 'utf8');
code = code.replace(
    /        \/\/ Calculate percentiles[\s\S]*?summary: ''\n        };\n\n        result\.summary = this\.formatMonteCarloSummary\(result\);\n        return result;\n    }/,
    `        // ⚡ Bolt Optimization: Sort distribution arrays exactly once and extract all percentiles in O(1) time
        // This avoids 15 redundant O(N log N) sorting operations during simulation evaluation
        const sortedProfit = [...profitResults].sort((a, b) => a - b);
        const sortedDrawdown = [...drawdownResults].sort((a, b) => a - b);
        const sortedSharpe = [...sharpeResults].sort((a, b) => a - b);

        const getPercentile = (sorted: number[], p: number) => {
            const idx = Math.ceil((p / 100) * sorted.length) - 1;
            return sorted[Math.max(0, idx)];
        };

        const medianIndex = Math.floor(sortedProfit.length / 2);

        const result: MonteCarloResult = {
            simulations: numSimulations,
            profitDistribution: {
                p5: getPercentile(sortedProfit, 5),
                p25: getPercentile(sortedProfit, 25),
                median: sortedProfit[medianIndex] || 0,
                p75: getPercentile(sortedProfit, 75),
                p95: getPercentile(sortedProfit, 95)
            },
            drawdownDistribution: {
                p5: getPercentile(sortedDrawdown, 5),
                p25: getPercentile(sortedDrawdown, 25),
                median: sortedDrawdown[medianIndex] || 0,
                p75: getPercentile(sortedDrawdown, 75),
                p95: getPercentile(sortedDrawdown, 95)
            },
            sharpeDistribution: {
                p5: getPercentile(sortedSharpe, 5),
                p25: getPercentile(sortedSharpe, 25),
                median: sortedSharpe[medianIndex] || 0,
                p75: getPercentile(sortedSharpe, 75),
                p95: getPercentile(sortedSharpe, 95)
            },
            summary: ''
        };

        result.summary = this.formatMonteCarloSummary(result);
        return result;
    }`
);
fs.writeFileSync(path, code);
