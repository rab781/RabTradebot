import { TechnicalAnalyzer } from './technicalAnalyzer';
import { NewsAnalyzer } from './newsAnalyzer';

export class SignalGenerator {
    constructor(
        private technicalAnalyzer: TechnicalAnalyzer,
        private newsAnalyzer: NewsAnalyzer
    ) {}

    async generateSignal(symbol: string): Promise<string> {
        try {
            // Get both technical and news analysis
            const [technicalAnalysis, newsAnalysis] = await Promise.all([
                this.technicalAnalyzer.analyzeSymbol(symbol),
                this.newsAnalyzer.analyzeNews(symbol)
            ]);

            // Combine the analyses
            let signal = `🔍 Analysis Report for ${symbol}\n`;
            signal += '═══════════════════════\n\n';
            
            // Add technical analysis
            signal += '📊 Technical Analysis\n';
            signal += '───────────────────────\n';
            signal += technicalAnalysis;
            signal += '\n\n';

            // Add news analysis
            signal += '📰 News Analysis\n';
            signal += '───────────────────────\n';
            signal += newsAnalysis;

            return signal;

        } catch (error) {
            console.error('Error generating signal:', error);
            throw error;
        }
    }
}
