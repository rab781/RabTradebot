import { TradingViewService } from './TradingViewService';
import { AdvancedAnalyzer } from './advancedAnalyzer';
import { NewsAnalyzer } from './newsAnalyzer';
import { RSI, MACD, BollingerBands, SMA, EMA } from 'technicalindicators';

export interface SimpleAnalysisResult {
    symbol: string;
    currentPrice: number;
    timestamp: Date;

    // Technical Analysis
    rsi: number;
    macd: {
        signal: string;
        histogram: number;
        line: number;
    };
    trend: string;
    strength: number;

    // Support/Resistance
    support: number;
    resistance: number;

    // Volume
    volumeStatus: string;
    volumeChange24h: number;

    // Moving Averages
    ema10: number;
    ema20: number;
    sma50: number;
    sma200: number;

    // Multi-timeframe
    timeframes: {
        '1h': string;
        '4h': string;
        '1d': string;
    };

    // Recommendation
    recommendation: {
        action: string;
        confidence: number;
        reasoning: string[];
        entryPrice: number;
        stopLoss: number;
        takeProfit: number;
    };
}

export class SimpleComprehensiveAnalyzer {
    private tradingViewService: TradingViewService;
    private advancedAnalyzer: AdvancedAnalyzer;
    private newsAnalyzer: NewsAnalyzer;

    constructor() {
        this.tradingViewService = new TradingViewService({
            theme: 'dark',
            interval: '5m',
            symbol: 'BINANCE:BTCUSDT',
            containerId: 'analysis-chart'
        });
        this.advancedAnalyzer = new AdvancedAnalyzer();
        this.newsAnalyzer = new NewsAnalyzer();
    }

    async analyzeComprehensive(symbol: string): Promise<SimpleAnalysisResult> {
        console.log(`🔍 Starting comprehensive analysis for ${symbol}...`);

        try {
            // Get market data
            const marketData = await this.tradingViewService.getMarketData(symbol, '5m');
            if (!marketData) {
                throw new Error('Failed to fetch market data');
            }

            const currentPrice = marketData.close[marketData.close.length - 1];

            // Calculate technical indicators
            const rsiValues = RSI.calculate({
                values: marketData.close,
                period: 14
            });
            const currentRSI = rsiValues[rsiValues.length - 1] || 50;

            const macdResult = MACD.calculate({
                values: marketData.close,
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9,
                SimpleMAOscillator: false,
                SimpleMASignal: false
            });
            const currentMACD = macdResult[macdResult.length - 1] || { MACD: 0, signal: 0, histogram: 0 };

            // Moving averages
            const ema10Values = EMA.calculate({ period: 10, values: marketData.close });
            const ema20Values = EMA.calculate({ period: 20, values: marketData.close });
            const sma50Values = SMA.calculate({ period: 50, values: marketData.close });
            const sma200Values = SMA.calculate({ period: 200, values: marketData.close });

            const ema10 = ema10Values[ema10Values.length - 1] || currentPrice;
            const ema20 = ema20Values[ema20Values.length - 1] || currentPrice;
            const sma50 = sma50Values[sma50Values.length - 1] || currentPrice;
            const sma200 = sma200Values[sma200Values.length - 1] || currentPrice;

            // Get support/resistance and volume analysis
            const srLevels = await this.advancedAnalyzer.findSupportResistance(symbol);
            const volumeAnalysis = await this.advancedAnalyzer.analyzeVolume(symbol);

            // Determine trend
            const trend = this.determineTrend(currentPrice, ema10, ema20, sma50, sma200);

            // Multi-timeframe analysis
            const timeframes = await this.getMultiTimeframeAnalysis(symbol);

            // Generate recommendation
            const recommendation = this.generateRecommendation(
                currentRSI,
                currentMACD,
                trend,
                volumeAnalysis,
                timeframes,
                currentPrice
            );

            return {
                symbol,
                currentPrice,
                timestamp: new Date(),
                rsi: currentRSI,
                macd: {
                    signal: (currentMACD.MACD || 0) > (currentMACD.signal || 0) ? 'bullish' : 'bearish',
                    histogram: currentMACD.histogram || 0,
                    line: currentMACD.MACD || 0
                },
                trend: trend.direction,
                strength: trend.strength,
                support: srLevels.nearestSupport,
                resistance: srLevels.nearestResistance,
                volumeStatus: volumeAnalysis.unusualVolume ? 'high' : 'normal',
                volumeChange24h: volumeAnalysis.volumeChange24h,
                ema10,
                ema20,
                sma50,
                sma200,
                timeframes,
                recommendation
            };

        } catch (error) {
            console.error(`Error in comprehensive analysis for ${symbol}:`, error);
            throw error;
        }
    }

    // New method for comprehensive analysis compatible with /analyze command
    async analyzeComprehensiveForBot(symbol: string): Promise<any> {
        console.log(`🔍 Starting real comprehensive analysis for ${symbol}...`);

        try {
            // Use the existing real analysis method
            const realAnalysis = await this.analyzeComprehensive(symbol);

            // Map the flat result to the nested structure expected by the bot
            return {
                symbol: realAnalysis.symbol,
                timestamp: realAnalysis.timestamp,
                currentPrice: realAnalysis.currentPrice || 0,
                technical: {
                    trend: realAnalysis.trend || 'NEUTRAL',
                    strength: realAnalysis.strength || 0,
                    rsi: realAnalysis.rsi || 50,
                    macd: realAnalysis.macd || { signal: 'neutral', histogram: 0, line: 0 },
                    // Derived/Mocked fields that aren't in SimpleAnalysisResult but needed by bot
                    bollinger: {
                        position: (realAnalysis.rsi || 50) > 70 ? 'above' : (realAnalysis.rsi || 50) < 30 ? 'below' : 'middle',
                        squeeze: false,
                        breakout: false
                    },
                    supportResistance: {
                        support: realAnalysis.support || 0,
                        resistance: realAnalysis.resistance || 0,
                        distanceToSupport: realAnalysis.currentPrice && realAnalysis.support ? ((realAnalysis.currentPrice - realAnalysis.support) / realAnalysis.currentPrice) * 100 : 0,
                        distanceToResistance: realAnalysis.currentPrice && realAnalysis.resistance ? ((realAnalysis.resistance - realAnalysis.currentPrice) / realAnalysis.currentPrice) * 100 : 0
                    },
                    volume: {
                        status: realAnalysis.volumeStatus || 'normal',
                        change24h: realAnalysis.volumeChange24h || 0,
                        volumeProfile: 'balanced'
                    },
                    movingAverages: {
                        ema10: realAnalysis.ema10 || 0,
                        ema20: realAnalysis.ema20 || 0,
                        sma50: realAnalysis.sma50 || 0,
                        sma200: realAnalysis.sma200 || 0,
                        alignment: (realAnalysis.currentPrice || 0) > (realAnalysis.ema10 || 0) ? 'bullish' : 'bearish'
                    }
                },
                timeframes: {
                    '1h': {
                        trend: realAnalysis.timeframes['1h'],
                        signal: realAnalysis.timeframes['1h'] === 'bullish' ? 'buy' : realAnalysis.timeframes['1h'] === 'bearish' ? 'sell' : 'hold',
                        strength: 0.7
                    },
                    '4h': {
                        trend: realAnalysis.timeframes['4h'],
                        signal: realAnalysis.timeframes['4h'] === 'bullish' ? 'buy' : realAnalysis.timeframes['4h'] === 'bearish' ? 'sell' : 'hold',
                        strength: 0.7
                    },
                    '1d': {
                        trend: realAnalysis.timeframes['1d'],
                        signal: realAnalysis.timeframes['1d'] === 'bullish' ? 'buy' : realAnalysis.timeframes['1d'] === 'bearish' ? 'sell' : 'hold',
                        strength: 0.7
                    }
                },
                // Keep mock backtest (or implement real one later) as it requires heavy computation/history
                backtests: [{
                    strategy: 'SampleStrategy',
                    period: '30 days',
                    winRate: 65.5,
                    totalReturn: 12.5,
                    sharpeRatio: 1.8,
                    maxDrawdown: 5.2,
                    totalTrades: 42,
                    bestTrade: 8.5,
                    worstTrade: -3.2,
                    avgTradeDuration: 14400
                }],
                recommendation: {
                    ...realAnalysis.recommendation,
                    exitPrice: realAnalysis.recommendation.takeProfit
                },
                charts: {
                    '1h': `https://www.tradingview.com/chart/?symbol=${symbol}&interval=1H`,
                    '4h': `https://www.tradingview.com/chart/?symbol=${symbol}&interval=4H`,
                    '1d': `https://www.tradingview.com/chart/?symbol=${symbol}&interval=1D`
                },
                sentiment: {
                    score: 0.5,
                    label: 'neutral',
                    sources: 10
                }
            };

        } catch (error) {
            console.error('Comprehensive analysis error:', error);
            throw error;
        }
    }

    private determineTrend(currentPrice: number, ema10: number, ema20: number, sma50: number, sma200: number): { direction: string; strength: number } {
        let strength = 0;
        if (currentPrice > ema10) strength += 1;
        if (ema10 > ema20) strength += 1;
        if (ema20 > sma50) strength += 1;
        if (sma50 > sma200) strength += 1;

        return {
            direction: strength > 2 ? 'bullish' : strength < 2 ? 'bearish' : 'neutral',
            strength: strength / 4 * 100
        };
    }

    private async getMultiTimeframeAnalysis(symbol: string): Promise<{ '1h': string; '4h': string; '1d': string }> {
        const timeframes = ['1h', '4h', '1d'];
        const results: any = {};

        for (const tf of timeframes) {
            try {
                // Use TradingView service to get real data for timeframes
                const marketData = await this.tradingViewService.getMarketData(symbol, tf);
                if (marketData && marketData.close && marketData.close.length > 0) {
                    const rsiValues = RSI.calculate({
                        values: marketData.close,
                        period: 14
                    });
                    const currentRSI = rsiValues[rsiValues.length - 1] || 50;

                    let signal = 'neutral';
                    if (currentRSI < 30) signal = 'oversold';
                    else if (currentRSI > 70) signal = 'overbought';
                    else if (currentRSI > 50) signal = 'bullish';
                    else signal = 'bearish';

                    results[tf] = signal;
                } else {
                    results[tf] = 'neutral';
                }
            } catch (error) {
                console.error(`Error analyzing timeframe ${tf}:`, error);
                results[tf] = 'neutral';
            }
        }

        return results;
    }

    private generateRecommendation(
        rsi: number,
        macd: any,
        trend: any,
        volumeAnalysis: any,
        timeframes: any,
        currentPrice: number
    ) {
        const signals: number[] = [];
        const reasoning: string[] = [];

        // RSI signals
        if (rsi < 30) {
            signals.push(1);
            reasoning.push(`RSI (${rsi.toFixed(1)}) oversold - potential bounce`);
        } else if (rsi > 70) {
            signals.push(-1);
            reasoning.push(`RSI (${rsi.toFixed(1)}) overbought - potential pullback`);
        }

        // MACD signals
        if (macd.signal === 'bullish') {
            signals.push(1);
            reasoning.push('MACD bullish crossover');
        } else if (macd.signal === 'bearish') {
            signals.push(-1);
            reasoning.push('MACD bearish crossover');
        }

        // Trend signals
        if (trend.direction === 'bullish') {
            signals.push(0.5);
            reasoning.push('Overall trend is bullish');
        } else if (trend.direction === 'bearish') {
            signals.push(-0.5);
            reasoning.push('Overall trend is bearish');
        }

        // Volume signals
        if (volumeAnalysis.unusualVolume) {
            // Check direction of price vs volume
            if (volumeAnalysis.volumeChange24h > 0) {
                signals.push(0.5);
                reasoning.push('High volume supports price rise');
            } else {
                signals.push(-0.5);
                reasoning.push('High volume supports price drop');
            }
        }

        // Multi-timeframe signals
        const bullishTF = Object.values(timeframes).filter(tf => tf === 'bullish' || tf === 'oversold').length;
        const bearishTF = Object.values(timeframes).filter(tf => tf === 'bearish' || tf === 'overbought').length;

        if (bullishTF > bearishTF) {
            signals.push(0.5);
            reasoning.push('Multiple timeframes indicate bullish/oversold');
        } else if (bearishTF > bullishTF) {
            signals.push(-0.5);
            reasoning.push('Multiple timeframes indicate bearish/overbought');
        }

        // Calculate final signal
        const avgSignal = signals.length > 0 ? signals.reduce((sum, s) => sum + s, 0) / signals.length : 0;
        const confidence = Math.min(Math.abs(avgSignal) * 100 + 50, 95); // Base 50% confidence + signal strength

        let action: string;
        if (avgSignal > 0.5) action = 'STRONG_BUY';
        else if (avgSignal > 0.2) action = 'BUY';
        else if (avgSignal > -0.2) action = 'HOLD';
        else if (avgSignal > -0.5) action = 'SELL';
        else action = 'STRONG_SELL';

        const entryPrice = currentPrice;
        const stopLoss = action.includes('BUY') ? entryPrice * 0.95 : entryPrice * 1.05;
        const takeProfit = action.includes('BUY') ? entryPrice * 1.08 : entryPrice * 0.92;
        const riskReward = Math.abs((takeProfit - entryPrice) / (stopLoss - entryPrice));

        return {
            action,
            confidence,
            reasoning,
            entryPrice,
            stopLoss,
            takeProfit,
            riskReward,
            timeframe: '5m' // Base timeframe
        };
    }
}
