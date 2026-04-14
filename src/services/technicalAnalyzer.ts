// eslint-disable-next-line @typescript-eslint/no-var-requires
const BinanceFactory = require('node-binance-api');
import { RSI, MACD } from 'technicalindicators';
import 'dotenv/config';
import { TimeFrame } from '../types/trading';
import { PublicCryptoService } from './publicCryptoService';
import { logger } from '../utils/logger';

interface Candle {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp: number;
}

interface MACDResult {
    MACD: number;
    signal: number;
    histogram: number;
}

export class TechnicalAnalyzer {
    private binance: any;
    private publicService: PublicCryptoService;
    private usePublicOnly: boolean = false;

    constructor() {
        // Initialize public service first
        this.publicService = new PublicCryptoService();
        
        // Try to initialize private API, but don't fail if it doesn't work
        try {
            if (process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET) {
                this.binance = new BinanceFactory({
                    APIKEY: process.env.BINANCE_API_KEY,
                    APISECRET: process.env.BINANCE_API_SECRET
                });
                logger.info('[TechnicalAnalyzer] Private API initialized');
            } else {
                logger.info('[TechnicalAnalyzer] No API credentials found, using public API only');
                this.usePublicOnly = true;
            }
        } catch (error) {
            logger.warn({ err: error }, '[TechnicalAnalyzer] Failed to initialize private API, falling back to public API:');
            this.usePublicOnly = true;
        }
    }

    private async retryApiCall<T>(apiCall: () => Promise<T>, maxRetries: number = 3): Promise<T> {
        let lastError: any;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.info(`[TechnicalAnalyzer] API call attempt ${attempt}/${maxRetries}`);
                const result = await apiCall();
                if (attempt > 1) {
                    logger.info(`[TechnicalAnalyzer] API call succeeded on attempt ${attempt}`);
                }
                return result;
            } catch (error: any) {
                lastError = error;
                logger.error(`[TechnicalAnalyzer] API call failed (attempt ${attempt}/${maxRetries}):`, error.message || error);
                
                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
                    logger.info(`[TechnicalAnalyzer] Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        logger.error(`[TechnicalAnalyzer] All API call attempts failed`);
        throw lastError;
    }

    async analyzeSymbol(symbol: string): Promise<string> {
        logger.info(`[TechnicalAnalyzer] Starting analysis for ${symbol}`);
        
        try {
            // Try to get candlestick data, prefer public API to avoid 403 errors
            let candlesData: any[];
            
            if (this.usePublicOnly) {
                logger.info(`[TechnicalAnalyzer] Using public API only for ${symbol}`);
                candlesData = await this.publicService.getCandlestickData(symbol, '1h', 100);
            } else {
                try {
                    // First try with public API (more reliable)
                    logger.info(`[TechnicalAnalyzer] Trying public API first for ${symbol}`);
                    candlesData = await this.publicService.getCandlestickData(symbol, '1h', 100);
                    logger.info(`[TechnicalAnalyzer] Used public API for ${symbol}`);
                } catch (publicApiError) {
                    logger.info(`[TechnicalAnalyzer] Public API failed for ${symbol}, trying private API...`);
                    // Fallback to private API
                    candlesData = await this.retryApiCall(async () => {
                        return await this.binance.candlesticks(symbol, '1h' as TimeFrame, { limit: 100 });
                    }, 2);
                    logger.info(`[TechnicalAnalyzer] Used private API fallback for ${symbol}`);
                }
            }
            
            logger.info(`[TechnicalAnalyzer] Retrieved ${candlesData.length} candles for ${symbol}`);
            
            // ⚡ Bolt Optimization: Replace 3 O(N) map calls with a single pre-allocated loop
            const dataLen = candlesData.length;
            const candles: Candle[] = new Array(dataLen);
            const closePrices: number[] = new Array(dataLen);
            const volumes: number[] = new Array(dataLen);

            for (let i = 0; i < dataLen; i++) {
                const candleData = candlesData[i];
                const close = parseFloat(candleData[4]);
                const volume = parseFloat(candleData[5]);

                closePrices[i] = close;
                volumes[i] = volume;

                candles[i] = {
                    timestamp: parseInt(candleData[0]),
                    open: parseFloat(candleData[1]),
                    high: parseFloat(candleData[2]),
                    low: parseFloat(candleData[3]),
                    close,
                    volume
                };
            }
            
            const rsiValues = RSI.calculate({
                values: closePrices,
                period: 14
            });
            const currentRSI = rsiValues[rsiValues.length - 1];

            const macdResult = MACD.calculate({
                values: closePrices,
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9,
                SimpleMAOscillator: false,
                SimpleMASignal: false
            }) as MACDResult[];

            const currentMACD = macdResult[macdResult.length - 1];
            const previousMACD = macdResult[macdResult.length - 2];

            // Calculate trend strength
            // ⚡ Bolt Optimization: Avoid intermediate array creation from slice().reduce()
            let volumeSum = 0;
            const volCount = Math.min(20, volumes.length);
            for (let i = volumes.length - volCount; i < volumes.length; i++) {
                volumeSum += volumes[i];
            }
            const volumeAvg = volCount > 0 ? volumeSum / volCount : 0;
            const currentVolume = volumes[volumes.length - 1];
            const volumeStrength = currentVolume > volumeAvg ? 'Strong' : 'Weak';

            // Generate analysis and recommendations
            let analysis = `Technical Analysis for ${symbol}:\n\n`;
            analysis += `RSI (14): ${currentRSI.toFixed(2)}\n`;
            
            if (currentMACD) {
                analysis += `MACD Line: ${currentMACD.MACD.toFixed(4)}\n`;
                analysis += `Signal Line: ${currentMACD.signal.toFixed(4)}\n`;
                analysis += `Histogram: ${currentMACD.histogram.toFixed(4)}\n`;
            }

            analysis += `\nVolume Strength: ${volumeStrength}\n`;

            // Generate trading signals
            let signal = 'NEUTRAL';
            const reasoning: string[] = [];

            // Oversold/Overbought conditions
            if (currentRSI < 30) {
                reasoning.push('RSI indicates oversold conditions');
                signal = 'POTENTIAL BUY';
            } else if (currentRSI > 70) {
                reasoning.push('RSI indicates overbought conditions');
                signal = 'POTENTIAL SELL';
            }

            // MACD crossover signals
            if (currentMACD && previousMACD) {
                if (currentMACD.histogram > 0 && previousMACD.histogram < 0) {
                    reasoning.push('MACD shows bullish crossover');
                    signal = signal === 'POTENTIAL BUY' ? 'STRONG BUY' : 'POTENTIAL BUY';
                } else if (currentMACD.histogram < 0 && previousMACD.histogram > 0) {
                    reasoning.push('MACD shows bearish crossover');
                    signal = signal === 'POTENTIAL SELL' ? 'STRONG SELL' : 'POTENTIAL SELL';
                }
            }

            // Volume confirmation
            if (volumeStrength === 'Strong') {
                reasoning.push('High volume confirms the trend');
                if (signal.includes('BUY') || signal.includes('SELL')) {
                    signal = 'STRONG ' + signal;
                }
            }

            analysis += `\nSignal: ${signal}\n`;
            if (reasoning.length > 0) {
                analysis += `Reasoning:\n${reasoning.map(r => '- ' + r).join('\n')}\n`;
            }

            // Add entry/exit recommendations
            if (signal.includes('BUY')) {
                // ⚡ Bolt Optimization: Avoid intermediate arrays from slice(-5).map(...) and spread operator
                let stopLoss = Infinity;
                const lookbackCount = Math.min(5, candles.length);
                for (let i = candles.length - lookbackCount; i < candles.length; i++) {
                    if (candles[i].low < stopLoss) stopLoss = candles[i].low;
                }
                const takeProfit = candles[candles.length - 1].close * 1.02; // 2% profit target
                analysis += `\nEntry/Exit Levels:\n`;
                analysis += `- Entry: Current price (${candles[candles.length - 1].close.toFixed(4)})\n`;
                analysis += `- Stop Loss: ${stopLoss.toFixed(4)} (${((stopLoss - candles[candles.length - 1].close) / candles[candles.length - 1].close * 100).toFixed(2)}%)\n`;
                analysis += `- Take Profit: ${takeProfit.toFixed(4)} (2.00%)\n`;
            } else if (signal.includes('SELL')) {
                // ⚡ Bolt Optimization: Avoid intermediate arrays from slice(-5).map(...) and spread operator
                let stopLoss = -Infinity;
                const lookbackCount = Math.min(5, candles.length);
                for (let i = candles.length - lookbackCount; i < candles.length; i++) {
                    if (candles[i].high > stopLoss) stopLoss = candles[i].high;
                }
                const takeProfit = candles[candles.length - 1].close * 0.98; // 2% profit target
                analysis += `\nEntry/Exit Levels:\n`;
                analysis += `- Entry: Current price (${candles[candles.length - 1].close.toFixed(4)})\n`;
                analysis += `- Stop Loss: ${stopLoss.toFixed(4)} (${((stopLoss - candles[candles.length - 1].close) / candles[candles.length - 1].close * 100).toFixed(2)}%)\n`;
                analysis += `- Take Profit: ${takeProfit.toFixed(4)} (-2.00%)\n`;
            }

            return analysis;

        } catch (error: any) {
            logger.error({ err: error }, `[TechnicalAnalyzer] Error analyzing ${symbol}:`);
            
            // Handle specific error types
            if (error.message && error.message.includes('403')) {
                throw new Error(`API access denied for ${symbol}. This might be due to rate limits or invalid API credentials.`);
            } else if (error.message && error.message.includes('400')) {
                throw new Error(`Invalid symbol: ${symbol}. Please check if the symbol exists on Binance.`);
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                throw new Error(`Network error while fetching data for ${symbol}. Please check your internet connection.`);
            } else {
                throw new Error(`Failed to analyze ${symbol}: ${error.message || 'Unknown error occurred'}`);
            }
        }
    }
}
