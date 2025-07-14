/**
 * Performance Monitoring Service
 * Provides detailed strategy performance tracking, real-time metrics, and error monitoring
 */

export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  largestWin: number;
  largestLoss: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  averageTradeTime: number; // in minutes
}

export interface TradeRecord {
  id: string;
  symbol: string;
  strategy: string;
  entryTime: Date;
  exitTime?: Date;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  side: 'long' | 'short';
  profit?: number;
  commission: number;
  tags: string[];
  metadata?: Record<string, any>;
}

export interface StrategyPerformance {
  strategyName: string;
  metrics: PerformanceMetrics;
  trades: TradeRecord[];
  equity: { timestamp: Date; value: number }[];
  drawdown: { timestamp: Date; value: number }[];
}

export interface SystemMetrics {
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: number;
  errorCount: number;
  lastError?: { timestamp: Date; message: string; stack?: string };
  apiCallsPerMinute: number;
  activeConnections: number;
}

export class PerformanceMonitoringService {
  private trades: Map<string, TradeRecord[]> = new Map(); // strategy -> trades
  private equityHistory: Map<string, { timestamp: Date; value: number }[]> = new Map();
  private systemErrors: Array<{ timestamp: Date; message: string; stack?: string }> = [];
  private apiCalls: Array<{ timestamp: Date; endpoint: string; duration: number }> = [];
  private startTime: Date = new Date();

  constructor() {
    // Start system monitoring
    this.startSystemMonitoring();
  }

  /**
   * Record a new trade
   */
  recordTrade(strategyName: string, trade: Omit<TradeRecord, 'id'>): string {
    const tradeId = this.generateTradeId();
    const fullTrade: TradeRecord = {
      id: tradeId,
      ...trade
    };

    if (!this.trades.has(strategyName)) {
      this.trades.set(strategyName, []);
    }

    this.trades.get(strategyName)!.push(fullTrade);

    // Update equity if trade is closed
    if (trade.exitTime && trade.profit !== undefined) {
      this.updateEquity(strategyName, trade.exitTime, trade.profit);
    }

    return tradeId;
  }

  /**
   * Update an existing trade (e.g., when closing a position)
   */
  updateTrade(
    strategyName: string,
    tradeId: string,
    updates: Partial<Pick<TradeRecord, 'exitTime' | 'exitPrice' | 'profit'>>
  ): boolean {
    const strategyTrades = this.trades.get(strategyName);
    if (!strategyTrades) return false;

    const tradeIndex = strategyTrades.findIndex(t => t.id === tradeId);
    if (tradeIndex === -1) return false;

    const trade = strategyTrades[tradeIndex];
    Object.assign(trade, updates);

    // Calculate profit if exit data is provided
    if (updates.exitPrice && trade.entryPrice) {
      const multiplier = trade.side === 'long' ? 1 : -1;
      trade.profit = (updates.exitPrice - trade.entryPrice) * trade.quantity * multiplier - trade.commission;
    }

    // Update equity if trade is now closed
    if (updates.exitTime && trade.profit !== undefined) {
      this.updateEquity(strategyName, updates.exitTime, trade.profit);
    }

    return true;
  }

  /**
   * Calculate comprehensive performance metrics for a strategy
   */
  calculatePerformanceMetrics(strategyName: string, initialCapital: number = 10000): PerformanceMetrics {
    const trades = this.trades.get(strategyName) || [];
    const closedTrades = trades.filter(t => t.exitTime && t.profit !== undefined);

    if (closedTrades.length === 0) {
      return this.getEmptyMetrics();
    }

    const profits = closedTrades.map(t => t.profit!);
    const wins = profits.filter(p => p > 0);
    const losses = profits.filter(p => p < 0);

    // Basic metrics
    const totalReturn = profits.reduce((sum, p) => sum + p, 0);
    const totalReturnPct = totalReturn / initialCapital;

    // Time-based calculations
    const firstTrade = closedTrades[0];
    const lastTrade = closedTrades[closedTrades.length - 1];
    const tradingPeriodDays = (lastTrade.exitTime!.getTime() - firstTrade.entryTime.getTime()) / (1000 * 60 * 60 * 24);
    const annualizedReturn = tradingPeriodDays > 0 ? (Math.pow(1 + totalReturnPct, 365 / tradingPeriodDays) - 1) : 0;

    // Risk metrics
    const returns = this.calculateDailyReturns(closedTrades, initialCapital);
    const volatility = this.calculateVolatility(returns);
    const downside = returns.filter(r => r < 0);
    const downsideVolatility = downside.length > 0 ? this.calculateVolatility(downside) : 0;

    // Performance ratios
    const sharpeRatio = volatility > 0 ? (annualizedReturn - 0.02) / volatility : 0; // Assuming 2% risk-free rate
    const sortinoRatio = downsideVolatility > 0 ? (annualizedReturn - 0.02) / downsideVolatility : 0;

    // Drawdown calculation
    const { maxDrawdown } = this.calculateDrawdown(closedTrades, initialCapital);
    const calmarRatio = maxDrawdown !== 0 ? Math.abs(annualizedReturn / maxDrawdown) : 0;

    // Trade analysis
    const winRate = wins.length / closedTrades.length;
    const profitFactor = losses.length > 0 ?
      Math.abs(wins.reduce((sum, w) => sum + w, 0) / losses.reduce((sum, l) => sum + l, 0)) :
      Infinity;

    const averageWin = wins.length > 0 ? wins.reduce((sum, w) => sum + w, 0) / wins.length : 0;
    const averageLoss = losses.length > 0 ? losses.reduce((sum, l) => sum + l, 0) / losses.length : 0;

    // Consecutive wins/losses
    const { maxConsecutiveWins, maxConsecutiveLosses } = this.calculateConsecutiveWinsLosses(profits);

    // Average trade time
    const averageTradeTime = closedTrades.reduce((sum, t) => {
      if (t.exitTime) {
        return sum + (t.exitTime.getTime() - t.entryTime.getTime());
      }
      return sum;
    }, 0) / (closedTrades.length * 1000 * 60); // Convert to minutes

    return {
      totalReturn: totalReturnPct,
      annualizedReturn,
      volatility,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      calmarRatio,
      winRate,
      profitFactor,
      averageWin,
      averageLoss,
      totalTrades: closedTrades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      largestWin: wins.length > 0 ? Math.max(...wins) : 0,
      largestLoss: losses.length > 0 ? Math.min(...losses) : 0,
      consecutiveWins: maxConsecutiveWins,
      consecutiveLosses: maxConsecutiveLosses,
      averageTradeTime
    };
  }

  /**
   * Get strategy performance including trades and equity curve
   */
  getStrategyPerformance(strategyName: string, initialCapital: number = 10000): StrategyPerformance | null {
    const trades = this.trades.get(strategyName);
    if (!trades) return null;

    const metrics = this.calculatePerformanceMetrics(strategyName, initialCapital);
    const equity = this.equityHistory.get(strategyName) || [];
    const drawdown = this.calculateDrawdownHistory(trades, initialCapital);

    return {
      strategyName,
      metrics,
      trades: [...trades],
      equity: [...equity],
      drawdown
    };
  }

  /**
   * Get all strategies performance summary
   */
  getAllStrategiesPerformance(initialCapital: number = 10000): Map<string, PerformanceMetrics> {
    const performance = new Map<string, PerformanceMetrics>();

    for (const strategyName of this.trades.keys()) {
      performance.set(strategyName, this.calculatePerformanceMetrics(strategyName, initialCapital));
    }

    return performance;
  }

  /**
   * Record system error
   */
  recordError(message: string, stack?: string): void {
    this.systemErrors.push({
      timestamp: new Date(),
      message,
      stack
    });

    // Keep only last 1000 errors
    if (this.systemErrors.length > 1000) {
      this.systemErrors = this.systemErrors.slice(-1000);
    }
  }

  /**
   * Record API call metrics
   */
  recordApiCall(endpoint: string, duration: number): void {
    this.apiCalls.push({
      timestamp: new Date(),
      endpoint,
      duration
    });

    // Keep only last hour of API calls
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    this.apiCalls = this.apiCalls.filter(call => call.timestamp > oneHourAgo);
  }

  /**
   * Get system performance metrics
   */
  getSystemMetrics(): SystemMetrics {
    const now = new Date();
    const uptime = (now.getTime() - this.startTime.getTime()) / 1000; // seconds

    // Calculate API calls per minute
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentApiCalls = this.apiCalls.filter(call => call.timestamp > oneMinuteAgo);

    // Get recent errors
    const recentErrors = this.systemErrors.filter(error =>
      error.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
    );

    return {
      uptime,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage().user / 1000000, // Convert to seconds
      errorCount: recentErrors.length,
      lastError: this.systemErrors.length > 0 ? this.systemErrors[this.systemErrors.length - 1] : undefined,
      apiCallsPerMinute: recentApiCalls.length,
      activeConnections: 0 // This would be updated by the connection manager
    };
  }

  /**
   * Export performance data to JSON
   */
  exportPerformanceData(strategyName?: string): any {
    if (strategyName) {
      return this.getStrategyPerformance(strategyName);
    }

    const allData: any = {
      strategies: {},
      systemMetrics: this.getSystemMetrics(),
      exportTime: new Date()
    };

    for (const strategy of this.trades.keys()) {
      allData.strategies[strategy] = this.getStrategyPerformance(strategy);
    }

    return allData;
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(strategyName: string): string {
    const performance = this.getStrategyPerformance(strategyName);
    if (!performance) {
      return `❌ No performance data found for strategy: ${strategyName}`;
    }

    const metrics = performance.metrics;

    return `
📊 **Performance Report - ${strategyName}**

**Returns:**
• Total Return: ${(metrics.totalReturn * 100).toFixed(2)}%
• Annualized Return: ${(metrics.annualizedReturn * 100).toFixed(2)}%
• Max Drawdown: ${(metrics.maxDrawdown * 100).toFixed(2)}%

**Risk Metrics:**
• Volatility: ${(metrics.volatility * 100).toFixed(2)}%
• Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}
• Sortino Ratio: ${metrics.sortinoRatio.toFixed(2)}
• Calmar Ratio: ${metrics.calmarRatio.toFixed(2)}

**Trade Analysis:**
• Total Trades: ${metrics.totalTrades}
• Win Rate: ${(metrics.winRate * 100).toFixed(2)}%
• Profit Factor: ${metrics.profitFactor.toFixed(2)}
• Average Win: $${metrics.averageWin.toFixed(2)}
• Average Loss: $${metrics.averageLoss.toFixed(2)}
• Largest Win: $${metrics.largestWin.toFixed(2)}
• Largest Loss: $${metrics.largestLoss.toFixed(2)}

**Consistency:**
• Max Consecutive Wins: ${metrics.consecutiveWins}
• Max Consecutive Losses: ${metrics.consecutiveLosses}
• Average Trade Time: ${metrics.averageTradeTime.toFixed(1)} minutes
    `.trim();
  }

  // Private helper methods
  private generateTradeId(): string {
    return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateEquity(strategyName: string, timestamp: Date, profit: number): void {
    if (!this.equityHistory.has(strategyName)) {
      this.equityHistory.set(strategyName, []);
    }

    const equity = this.equityHistory.get(strategyName)!;
    const lastValue = equity.length > 0 ? equity[equity.length - 1].value : 10000; // Default initial capital

    equity.push({
      timestamp,
      value: lastValue + profit
    });
  }

  private calculateDailyReturns(trades: TradeRecord[], initialCapital: number): number[] {
    // Group trades by day and calculate daily returns
    const dailyProfits = new Map<string, number>();

    for (const trade of trades) {
      if (trade.exitTime && trade.profit !== undefined) {
        const dateKey = trade.exitTime.toISOString().split('T')[0];
        dailyProfits.set(dateKey, (dailyProfits.get(dateKey) || 0) + trade.profit);
      }
    }

    let capital = initialCapital;
    const returns: number[] = [];

    for (const profit of dailyProfits.values()) {
      const returnPct = profit / capital;
      returns.push(returnPct);
      capital += profit;
    }

    return returns;
  }

  private calculateVolatility(returns: number[]): number {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);

    return Math.sqrt(variance) * Math.sqrt(252); // Annualized
  }

  private calculateDrawdown(trades: TradeRecord[], initialCapital: number): { maxDrawdown: number; currentDrawdown: number } {
    let peak = initialCapital;
    let current = initialCapital;
    let maxDrawdown = 0;

    for (const trade of trades) {
      if (trade.profit !== undefined) {
        current += trade.profit;
        peak = Math.max(peak, current);
        const drawdown = (current - peak) / peak;
        maxDrawdown = Math.min(maxDrawdown, drawdown);
      }
    }

    const currentDrawdown = (current - peak) / peak;
    return { maxDrawdown, currentDrawdown };
  }

  private calculateDrawdownHistory(trades: TradeRecord[], initialCapital: number): { timestamp: Date; value: number }[] {
    let peak = initialCapital;
    let current = initialCapital;
    const drawdownHistory: { timestamp: Date; value: number }[] = [];

    for (const trade of trades) {
      if (trade.exitTime && trade.profit !== undefined) {
        current += trade.profit;
        peak = Math.max(peak, current);
        const drawdown = (current - peak) / peak;

        drawdownHistory.push({
          timestamp: trade.exitTime,
          value: drawdown
        });
      }
    }

    return drawdownHistory;
  }

  private calculateConsecutiveWinsLosses(profits: number[]): { maxConsecutiveWins: number; maxConsecutiveLosses: number } {
    let currentWins = 0;
    let currentLosses = 0;
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;

    for (const profit of profits) {
      if (profit > 0) {
        currentWins++;
        currentLosses = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins);
      } else {
        currentLosses++;
        currentWins = 0;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
      }
    }

    return { maxConsecutiveWins, maxConsecutiveLosses };
  }

  private getEmptyMetrics(): PerformanceMetrics {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      volatility: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      maxDrawdown: 0,
      calmarRatio: 0,
      winRate: 0,
      profitFactor: 0,
      averageWin: 0,
      averageLoss: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      largestWin: 0,
      largestLoss: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      averageTradeTime: 0
    };
  }

  private startSystemMonitoring(): void {
    // Monitor system metrics every minute
    setInterval(() => {
      // This could be expanded to include more sophisticated monitoring
      const metrics = this.getSystemMetrics();

      // Log warnings for high memory usage
      if (metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal > 0.9) {
        this.recordError('High memory usage detected', `Heap used: ${(metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      }
    }, 60000); // Every minute
  }
}
