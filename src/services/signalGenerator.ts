import { TechnicalAnalyzer } from './technicalAnalyzer';
import { ChutesService } from './chutesService';

export class SignalGenerator {
  constructor(
    private technicalAnalyzer: TechnicalAnalyzer,
    private chutesService: ChutesService
  ) {}

  async generateSignal(symbol: string): Promise<string> {
    try {
      // Get technical analysis first
      const technicalAnalysis = await this.technicalAnalyzer.analyzeSymbol(symbol);

      let signal = `🔍 Analysis Report for ${symbol}\n`;
      signal += '═══════════════════════\n\n';

      // Add technical analysis
      signal += '📊 Technical Analysis\n';
      signal += '───────────────────────\n';
      signal += technicalAnalysis;

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
          } else {
            signal += 'No recent news found\n';
          }
        } catch (error) {
          console.error('Error getting news analysis:', error);
          signal += 'News analysis unavailable\n';
        }
      } else {
        signal += '\n\n💡 Tip: Configure CHUTES_API_KEY for real-time news analysis\n';
      }

      return signal;
    } catch (error) {
      console.error('Error generating signal:', error);
      throw error;
    }
  }
}
