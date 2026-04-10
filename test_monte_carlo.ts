import { StrategyOptimizer } from './src/services/strategyOptimizer';

const optimizer = new StrategyOptimizer(null as any, null as any, null as any, null as any);

const trades = [
  { profit: 10, maxDrawdown: 2 },
  { profit: -5, maxDrawdown: 5 },
  { profit: 20, maxDrawdown: 0 },
  { profit: -10, maxDrawdown: 10 },
  { profit: 15, maxDrawdown: 1 }
];

const result = optimizer.monteCarloTest(trades, 100);
console.log('Profit P50:', result.profitDistribution.median);
console.log('Drawdown P50:', result.drawdownDistribution.median);
