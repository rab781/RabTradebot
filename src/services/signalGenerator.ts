import { TechnicalAnalyzer } from './technicalAnalyzer';
import { ChutesService } from './chutesService';
import { logger } from '../utils/logger';

export interface SignalResult {
    action: 'BUY' | 'SELL' | 'HOLD';
    price: number;        // 0 = use current market price
    stopLoss: number;     // 0 = not determined
    takeProfit: number;   // 0 = not determined
    confidence: number;   // 0.0 – 1.0
    reason: string;
    text: string;         // Full formatted Telegram message
}

export class SignalGenerator {
    constructor(
        private technicalAnalyzer: TechnicalAnalyzer,
        private chutesService: ChutesService
    ) {}

    async generateSignal(symbol: string): Promise<SignalResult> {
        try {
            // Get technical analysis first
            const technicalAnalysis = await this.technicalAnalyzer.analyzeSymbol(symbol);

            let signal = `🔍 Analysis Report for ${symbol}\n`;
            signal += '═══════════════════════\n\n';

            // Add technical analysis
            signal += '📊 Technical Analysis\n';
            signal += '───────────────────────\n';
            signal += technicalAnalysis;

            // Default structured values
            let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
            let confidence = 0.5;
            let reason = 'Based on technical analysis';

            // Add Chutes news analysis if configured
            if (this.chutesService.isConfigured()) {
                try {
                    signal += '\n\n';
                    signal += '📰 Real-time News Analysis (Chutes AI)\n';
                    signal += '───────────────────────\n';

                    const newsItems = await this.chutesService.searchCryptoNews(symbol, 5);
                    if (newsItems.length > 0) {
                        const newsAnalysis = await this.chutesService.analyzeNewsImpact(symbol, newsItems);
                        signal += `Sentiment: ${newsAnalysis.overallSentiment} ${newsAnalysis.overallSentiment === 'BULLISH' ? '🟢' : newsAnalysis.overallSentiment === 'BEARISH' ? '🔴' : '🟡'}\n`;
                        signal += `Direction: ${newsAnalysis.marketMovement.direction} (Confidence: ${(newsAnalysis.marketMovement.confidence * 100).toFixed(1)}%)\n`;
                        signal += `24H Impact: ${newsAnalysis.impactPrediction.shortTerm}\n`;

                        // Capture structured data directly from analysis results
                        action = newsAnalysis.overallSentiment === 'BULLISH' ? 'BUY'
                               : newsAnalysis.overallSentiment === 'BEARISH' ? 'SELL'
                               : 'HOLD';
                        confidence = newsAnalysis.marketMovement.confidence;
                        reason = newsAnalysis.impactPrediction.shortTerm || newsAnalysis.overallSentiment;
                    } else {
                        signal += 'No recent news found\n';
                    }
                } catch (error) {
                    logger.error({ err: error }, 'Error getting news analysis:');
                    signal += 'News analysis unavailable\n';
                }
            } else {
                signal += '\n\n💡 Tip: Configure CHUTES_API_KEY for real-time news analysis\n';
            }

            return {
                action,
                price: 0,
                stopLoss: 0,
                takeProfit: 0,
                confidence,
                reason,
                text: signal
            };

        } catch (error) {
            logger.error({ err: error }, 'Error generating signal:');
            throw error;
        }
    }
}
