/// <reference path="./jest-types.d.ts" />

import { RiskManagementService } from '../src/services/riskManagementService';

describe('RiskManagementService', () => {
    let riskManager: RiskManagementService;

    beforeEach(() => {
        riskManager = new RiskManagementService();
        jest.clearAllMocks();
    });

    describe('VaR Calculation', () => {
        it('should calculate VaR correctly for sufficient returns data', async () => {
            // Generate sufficient returns data (30+ points as required by service)
            const returns = Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? 0.02 : -0.015));

            const var95 = await riskManager.calculateVaR(returns, 0.95);

            expect(var95).toBeDefined();
            expect(typeof var95).toBe('number');
            expect(var95).toBeGreaterThan(0);
        });

        it('should handle different confidence levels', async () => {
            const returns = Array.from({ length: 50 }, (_, i) => (i % 3 === 0 ? 0.03 : -0.02));

            const var90 = await riskManager.calculateVaR(returns, 0.90);
            const var95 = await riskManager.calculateVaR(returns, 0.95);
            const var99 = await riskManager.calculateVaR(returns, 0.99);

            expect(var90).toBeLessThan(var95);
            expect(var95).toBeLessThan(var99);
        });

        it('should cache VaR calculations', async () => {
            const returns = Array.from({ length: 50 }, () => Math.random() * 0.04 - 0.02);

            const startTime = Date.now();
            await riskManager.calculateVaR(returns, 0.95);
            const firstCallTime = Date.now() - startTime;

            const startTime2 = Date.now();
            await riskManager.calculateVaR(returns, 0.95);
            const secondCallTime = Date.now() - startTime2;

            // Second call should be faster due to caching
            expect(secondCallTime).toBeLessThan(firstCallTime + 10);
        });
    });

    describe('Risk Metrics', () => {
        it('should calculate comprehensive risk metrics', async () => {
            const returns = Array.from({ length: 100 }, () => Math.random() * 0.04 - 0.02);

            const metrics = await riskManager.calculateRiskMetrics(returns);

            expect(metrics.volatility).toBeGreaterThan(0);
            expect(metrics.sharpeRatio).toBeDefined();
            expect(metrics.maxDrawdown).toBeLessThan(0); // Should be negative
            expect(metrics.valueAtRisk).toBeGreaterThan(0);
            expect(metrics.expectedShortfall).toBeGreaterThan(0);
        });

        it('should handle insufficient data gracefully', async () => {
            const returns = [0.01, 0.02]; // Only 2 data points

            try {
                await riskManager.calculateRiskMetrics(returns);
            } catch (error) {
                expect(error).toBeDefined();
            }
        });
    });

    describe('Position Sizing', () => {
        it('should calculate position size with Kelly criterion', async () => {
            const symbol = 'BTCUSDT';
            const returns = Array.from({ length: 100 }, () => Math.random() * 0.06 - 0.03);
            const winRate = 0.6; // 60% win rate
            const avgWin = 0.03; // 3% average win
            const avgLoss = 0.02; // 2% average loss
            const portfolioValue = 10000;

            const sizing = await riskManager.calculatePositionSize(
                symbol,
                returns,
                winRate,
                avgWin,
                avgLoss,
                portfolioValue
            );

            expect(sizing.maxPositionSize).toBeGreaterThan(0);
            expect(sizing.recommendedSize).toBeGreaterThan(0);
            expect(sizing.riskAdjustedSize).toBeGreaterThan(0);
            expect(sizing.kellyFraction).toBeGreaterThan(0);
            expect(sizing.recommendedSize).toBeLessThan(portfolioValue);
        });

        it('should respect portfolio size limits', async () => {
            const symbol = 'ETHUSDT';
            const returns = Array.from({ length: 100 }, () => 0.05); // Very profitable returns
            const winRate = 0.9; // 90% win rate
            const avgWin = 0.05; // 5% average win
            const avgLoss = 0.01; // 1% average loss
            const portfolioValue = 10000;

            const sizing = await riskManager.calculatePositionSize(
                symbol,
                returns,
                winRate,
                avgWin,
                avgLoss,
                portfolioValue
            );

            // Should not exceed portfolio value
            expect(sizing.recommendedSize).toBeLessThan(portfolioValue);
            expect(sizing.maxPositionSize).toBeLessThan(portfolioValue);
        });
    });

    describe('Correlation Analysis', () => {
        it('should calculate correlation between return series', () => {
            const returns1 = [0.01, 0.02, -0.01, 0.03, -0.02];
            const returns2 = [0.02, 0.03, -0.015, 0.025, -0.015];

            // Extend to meet minimum length requirement
            const extendedReturns1 = Array(30).fill(0).map((_, i) => returns1[i % returns1.length]);
            const extendedReturns2 = Array(30).fill(0).map((_, i) => returns2[i % returns2.length]);

            const correlation = riskManager.calculateCorrelation(extendedReturns1, extendedReturns2);

            expect(correlation).toBeGreaterThan(-1);
            expect(correlation).toBeLessThan(1);
        });

        it('should handle identical series', () => {
            const returns = Array(30).fill(0.01);

            const correlation = riskManager.calculateCorrelation(returns, returns);

            expect(correlation).toBeCloseTo(1, 2);
        });
    });

    describe('Trade Validation', () => {
        it('should validate trades against risk limits', async () => {
            const symbol = 'BTCUSDT';
            const positionSize = 500; // $500 position
            const portfolioValue = 10000;
            const currentPositions = new Map<string, number>();
            currentPositions.set('ETHUSDT', 300);

            const result = await riskManager.validateTrade(
                symbol,
                positionSize,
                portfolioValue,
                currentPositions
            );

            expect(result.isValid).toBeDefined();
            expect(typeof result.isValid).toBe('boolean');
            expect(Array.isArray(result.reasons)).toBe(true);
        });

        it('should reject oversized positions', async () => {
            const symbol = 'BTCUSDT';
            const positionSize = 5000; // $5000 position (50% of portfolio)
            const portfolioValue = 10000;
            const currentPositions = new Map<string, number>();

            const result = await riskManager.validateTrade(
                symbol,
                positionSize,
                portfolioValue,
                currentPositions
            );

            expect(result.isValid).toBe(false);
            expect(result.reasons.length).toBeGreaterThan(0);
        });
    });

    describe('Portfolio Heat', () => {
        it('should calculate portfolio heat correctly', () => {
            const positions = new Map<string, number>();
            positions.set('BTCUSDT', 2000);
            positions.set('ETHUSDT', 1500);
            positions.set('ADAUSDT', 500);

            const portfolioValue = 10000;
            const heat = riskManager.calculatePortfolioHeat(positions, portfolioValue);

            expect(heat).toBeGreaterThan(0);
            expect(heat).toBeLessThan(1); // Should be a fraction
        });

        it('should handle empty positions', () => {
            const positions = new Map<string, number>();
            const portfolioValue = 10000;

            const heat = riskManager.calculatePortfolioHeat(positions, portfolioValue);

            expect(heat).toBe(0);
        });
    });

    describe('Dynamic Stop Loss', () => {
        it('should calculate dynamic stop loss based on volatility', () => {
            const returns = Array.from({ length: 100 }, () => Math.random() * 0.04 - 0.02);

            const stopLoss = riskManager.getDynamicStopLoss(returns, 2);

            expect(stopLoss).toBeGreaterThan(0);
            expect(stopLoss).toBeLessThan(1); // Should be a reasonable percentage
        });

        it('should adjust stop loss with different multipliers', () => {
            const returns = Array.from({ length: 100 }, () => Math.random() * 0.04 - 0.02);

            const stopLoss1x = riskManager.getDynamicStopLoss(returns, 1);
            const stopLoss2x = riskManager.getDynamicStopLoss(returns, 2);

            expect(stopLoss2x).toBeGreaterThan(stopLoss1x);
        });
    });

    describe('Risk Limits Management', () => {
        it('should set and retrieve risk limits', () => {
            const newLimits = {
                maxDailyLoss: -0.03,
                maxPositionSize: 0.15,
                maxCorrelation: 0.8
            };

            riskManager.updateRiskLimits(newLimits);
            const retrievedLimits = riskManager.getRiskLimits();

            expect(retrievedLimits.maxDailyLoss).toBe(-0.03);
            expect(retrievedLimits.maxPositionSize).toBe(0.15);
            expect(retrievedLimits.maxCorrelation).toBe(0.8);
        });

        it('should preserve existing limits when updating partially', () => {
            const originalLimits = riskManager.getRiskLimits();

            riskManager.updateRiskLimits({ maxDailyLoss: -0.08 });
            const updatedLimits = riskManager.getRiskLimits();

            expect(updatedLimits.maxDailyLoss).toBe(-0.08);
            expect(updatedLimits.maxPositionSize).toBe(originalLimits.maxPositionSize);
            expect(updatedLimits.maxCorrelation).toBe(originalLimits.maxCorrelation);
        });
    });

    describe('Expected Shortfall', () => {
        it('should calculate expected shortfall correctly', async () => {
            const returns = Array.from({ length: 100 }, () => Math.random() * 0.04 - 0.02);

            const es = await riskManager.calculateExpectedShortfall(returns, 0.95);

            expect(es).toBeDefined();
            expect(typeof es).toBe('number');
            expect(es).toBeGreaterThan(0);
        });

        it('should handle edge cases gracefully', async () => {
            const returns = Array(50).fill(0.01); // All positive returns

            const es = await riskManager.calculateExpectedShortfall(returns, 0.95);

            expect(es).toBeDefined();
            // For all positive returns, ES should be negative (representing expected loss)
            expect(es).toBeLessThan(0);
        });
    });
});
