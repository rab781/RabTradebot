/**
 * Enhanced Risk Management Service
 * Implements dynamic position sizing, VaR calculations, and correlation analysis
 */

export interface RiskMetrics {
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  valueAtRisk: number;
  expectedShortfall: number;
  correlationMatrix?: Map<string, number>;
}

export interface PositionSizing {
  maxPositionSize: number;
  recommendedSize: number;
  riskAdjustedSize: number;
  kellyFraction?: number;
}

export interface RiskLimits {
  maxDailyLoss: number;
  maxPositionSize: number;
  maxCorrelation: number;
  maxDrawdown: number;
  minSharpeRatio: number;
}

export class RiskManagementService {
  private cache: Map<string, any> = new Map();
  private riskLimits: RiskLimits;

  constructor(riskLimits?: Partial<RiskLimits>) {
    this.riskLimits = {
      maxDailyLoss: -0.05, // -5%
      maxPositionSize: 0.1, // 10% of portfolio
      maxCorrelation: 0.7,
      maxDrawdown: -0.15, // -15%
      minSharpeRatio: 0.5,
      ...riskLimits
    };
  }

  /**
   * Calculate Value at Risk using parametric method
   */
  async calculateVaR(
    returns: number[],
    confidenceLevel: number = 0.95,
    timeHorizon: number = 1
  ): Promise<number> {
    const cacheKey = `var_${returns.length}_${confidenceLevel}_${timeHorizon}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (returns.length < 30) {
      throw new Error('Insufficient data for VaR calculation. Need at least 30 observations.');
    }

    // Calculate mean and standard deviation
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    // Z-score for confidence level
    const zScore = this.getZScore(confidenceLevel);

    // Parametric VaR
    const var95 = -(mean + zScore * stdDev) * Math.sqrt(timeHorizon);

    // Cache result for 5 minutes
    this.cache.set(cacheKey, var95);
    setTimeout(() => this.cache.delete(cacheKey), 300000);

    return var95;
  }

  /**
   * Calculate Expected Shortfall (Conditional VaR)
   */
  async calculateExpectedShortfall(
    returns: number[],
    confidenceLevel: number = 0.95
  ): Promise<number> {
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const cutoffIndex = Math.floor((1 - confidenceLevel) * sortedReturns.length);

    if (cutoffIndex === 0) {
      return sortedReturns[0];
    }

    const tailReturns = sortedReturns.slice(0, cutoffIndex);
    return -tailReturns.reduce((sum, ret) => sum + ret, 0) / tailReturns.length;
  }

  /**
   * Calculate portfolio volatility and risk metrics
   */
  async calculateRiskMetrics(
    returns: number[],
    benchmarkReturns?: number[]
  ): Promise<RiskMetrics> {
    if (returns.length < 30) {
      throw new Error('Insufficient data for risk metrics calculation');
    }

    // Calculate volatility (annualized)
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
    const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized

    // Calculate Sharpe Ratio (assuming risk-free rate of 2%)
    const riskFreeRate = 0.02;
    const excessReturn = mean * 252 - riskFreeRate;
    const sharpeRatio = excessReturn / volatility;

    // Calculate Maximum Drawdown
    const maxDrawdown = this.calculateMaxDrawdown(returns);

    // Calculate VaR and Expected Shortfall
    const valueAtRisk = await this.calculateVaR(returns);
    const expectedShortfall = await this.calculateExpectedShortfall(returns);

    return {
      volatility,
      sharpeRatio,
      maxDrawdown,
      valueAtRisk,
      expectedShortfall
    };
  }

  /**
   * Calculate optimal position size using Kelly Criterion and volatility scaling
   */
  async calculatePositionSize(
    symbol: string,
    returns: number[],
    winRate: number,
    avgWin: number,
    avgLoss: number,
    portfolioValue: number
  ): Promise<PositionSizing> {
    if (returns.length < 30) {
      throw new Error('Insufficient data for position sizing');
    }

    // Calculate Kelly Fraction
    const b = avgWin / Math.abs(avgLoss); // Win/Loss ratio
    const p = winRate; // Win probability
    const q = 1 - p; // Loss probability
    const kellyFraction = Math.max(0, (b * p - q) / b);

    // Calculate volatility-based sizing
    const volatility = this.calculateVolatility(returns);
    const targetVolatility = 0.15; // 15% target volatility
    const volatilityScaler = Math.min(1, targetVolatility / volatility);

    // Risk-adjusted position size
    const baseSize = this.riskLimits.maxPositionSize;
    const kellyAdjustedSize = Math.min(baseSize, kellyFraction * 0.25); // Cap at 25% of Kelly
    const riskAdjustedSize = kellyAdjustedSize * volatilityScaler;

    return {
      maxPositionSize: baseSize * portfolioValue,
      recommendedSize: kellyAdjustedSize * portfolioValue,
      riskAdjustedSize: riskAdjustedSize * portfolioValue,
      kellyFraction
    };
  }

  /**
   * Calculate correlation between two assets
   */
  calculateCorrelation(returns1: number[], returns2: number[]): number {
    if (returns1.length !== returns2.length || returns1.length < 30) {
      throw new Error('Invalid data for correlation calculation');
    }

    const mean1 = returns1.reduce((sum, ret) => sum + ret, 0) / returns1.length;
    const mean2 = returns2.reduce((sum, ret) => sum + ret, 0) / returns2.length;

    let numerator = 0;
    let sumSq1 = 0;
    let sumSq2 = 0;

    for (let i = 0; i < returns1.length; i++) {
      const diff1 = returns1[i] - mean1;
      const diff2 = returns2[i] - mean2;

      numerator += diff1 * diff2;
      sumSq1 += diff1 * diff1;
      sumSq2 += diff2 * diff2;
    }

    const denominator = Math.sqrt(sumSq1 * sumSq2);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Check if a trade meets risk criteria
   */
  async validateTrade(
    symbol: string,
    positionSize: number,
    portfolioValue: number,
    currentPositions: Map<string, number>
  ): Promise<{ isValid: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    // Check position size limit
    const positionPercentage = positionSize / portfolioValue;
    if (positionPercentage > this.riskLimits.maxPositionSize) {
      reasons.push(`Position size (${(positionPercentage * 100).toFixed(2)}%) exceeds limit (${(this.riskLimits.maxPositionSize * 100).toFixed(2)}%)`);
    }

    // Check correlation with existing positions
    // This would require historical data for correlation calculation
    // Implementation would go here...

    return {
      isValid: reasons.length === 0,
      reasons
    };
  }

  /**
   * Calculate portfolio heat (total risk exposure)
   */
  calculatePortfolioHeat(positions: Map<string, number>, portfolioValue: number): number {
    let totalExposure = 0;
    for (const [symbol, size] of positions) {
      totalExposure += Math.abs(size) / portfolioValue;
    }
    return totalExposure;
  }

  /**
   * Get dynamic stop loss based on volatility
   */
  getDynamicStopLoss(returns: number[], multiplier: number = 2): number {
    const volatility = this.calculateVolatility(returns);
    return volatility * multiplier;
  }

  // Private helper methods
  private calculateVolatility(returns: number[]): number {
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
    return Math.sqrt(variance) * Math.sqrt(252); // Annualized
  }

  private calculateMaxDrawdown(returns: number[]): number {
    let peak = 0;
    let maxDrawdown = 0;
    let cumulativeReturn = 0;

    for (const ret of returns) {
      cumulativeReturn = (1 + cumulativeReturn) * (1 + ret) - 1;
      peak = Math.max(peak, cumulativeReturn);
      const drawdown = (cumulativeReturn - peak) / (1 + peak);
      maxDrawdown = Math.min(maxDrawdown, drawdown);
    }

    return maxDrawdown;
  }

  private getZScore(confidenceLevel: number): number {
    // Approximate Z-scores for common confidence levels
    const zScores: { [key: number]: number } = {
      0.90: -1.28,
      0.95: -1.65,
      0.99: -2.33
    };

    return zScores[confidenceLevel] || -1.65;
  }

  /**
   * Update risk limits
   */
  updateRiskLimits(newLimits: Partial<RiskLimits>): void {
    this.riskLimits = { ...this.riskLimits, ...newLimits };
  }

  /**
   * Get current risk limits
   */
  getRiskLimits(): RiskLimits {
    return { ...this.riskLimits };
  }
}
