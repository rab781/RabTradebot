import Binance from 'node-binance-api';
import { RSI, MACD } from 'technicalindicators';

export class TechnicalAnalyzer {
    private binance: Binance;

    constructor() {
        this.binance = new Binance().options({
            APIKEY: process.env.BINANCE_API_KEY,
            APISECRET: process.env.BINANCE_API_SECRET
        });
    }

    async analyzeSymbol(symbol: string): Promise<string> {
        try {
            // Get candlestick data from Binance
            const candles: any[] = await this.binance.candlesticks(symbol, '1h', { limit: 100 });
            
            // Extract close prices (index 4 is the close price in Binance API)
            const closePrices = candles.map(candle => parseFloat(candle[4]));
            
            // Calculate RSI
            const rsiValues = RSI.calculate({
                values: closePrices,
                period: 14
            });
            const currentRSI = rsiValues[rsiValues.length - 1];

            // Calculate MACD
            const macdResult = MACD.calculate({
                values: closePrices,
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9,
                SimpleMAOscillator: false,
                SimpleMASignal: false
            });
            const currentMACD = macdResult[macdResult.length - 1];

            // Analyze candlestick patterns
            const lastCandles = candles.slice(-5).map(candle => ({
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4])
            }));

            // Generate analysis text
            let technicalAnalysis = `Technical Analysis for ${symbol}:\n`;
            technicalAnalysis += `RSI (14): ${currentRSI.toFixed(2)}\n`;
            
            if (currentMACD && typeof currentMACD.MACD !== 'undefined') {
                technicalAnalysis += `MACD: ${currentMACD.MACD?.toFixed(2) || 'N/A'}\n`;
                technicalAnalysis += `Signal: ${currentMACD.signal?.toFixed(2) || 'N/A'}\n`;
                technicalAnalysis += `Histogram: ${currentMACD.histogram?.toFixed(2) || 'N/A'}\n`;

                // Generate signal based on indicators
                if (currentRSI < 30 && currentMACD.histogram && currentMACD.histogram > 0) {
                    technicalAnalysis += '📈 Technical indicators suggest a potential BUY signal';
                } else if (currentRSI > 70 && currentMACD.histogram && currentMACD.histogram < 0) {
                    technicalAnalysis += '📉 Technical indicators suggest a potential SELL signal';
                } else {
                    technicalAnalysis += '📊 No clear signal from technical indicators';
                }
            } else {
                technicalAnalysis += 'MACD data not available\n';
                technicalAnalysis += '📊 No clear signal from technical indicators';
            }

            return technicalAnalysis;

        } catch (error: any) {
            console.error('Error in technical analysis:', error);
            throw error;
        }
    }
}
