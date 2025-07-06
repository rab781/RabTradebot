import * as CC from 'cryptocompare';
import { NewsArticle } from 'cryptocompare';

export class NewsAnalyzer {
    async analyzeNews(symbol: string): Promise<string> {
        try {
            const cryptoName = this.getBaseCurrency(symbol);
            
            // Get news from CryptoCompare API
            const newsData = await CC.newsList('EN');
            const relevantNews = newsData.filter((article: NewsArticle) => {
                const text = (article.title + ' ' + article.body).toLowerCase();
                return text.includes(cryptoName.toLowerCase());
            });

            // Calculate sentiment and prepare analysis
            const sentimentScore = this.calculateSentiment(relevantNews);
            let newsAnalysis = `News Analysis for ${symbol}:\n`;
            
            if (relevantNews.length > 0) {
                newsAnalysis += `Found ${relevantNews.length} relevant articles\n`;
                newsAnalysis += `Overall sentiment: ${this.getSentimentDescription(sentimentScore)}\n`;
                newsAnalysis += '\nTop Headlines:\n';
                
                relevantNews.slice(0, 3).forEach((news: NewsArticle) => {
                    const date = new Date(news.published_on * 1000).toLocaleDateString();
                    newsAnalysis += `- [${date}] ${news.title} (${news.source})\n`;
                });
            } else {
                newsAnalysis += 'No significant news found\n';
            }

            return newsAnalysis;

        } catch (error) {
            console.error('Error in news analysis:', error);
            throw error;
        }
    }    private calculateSentiment(articles: NewsArticle[]): number {
        // Enhanced sentiment analysis using both title and body
        const positiveWords = ['surge', 'bull', 'up', 'gain', 'positive', 'rise', 'growth', 'bullish', 'breakthrough', 'support', 'adoption', 'partnership'];
        const negativeWords = ['crash', 'bear', 'down', 'loss', 'negative', 'fall', 'decline', 'bearish', 'resistance', 'ban', 'hack', 'scam'];

        let score = 0;

        articles.forEach(article => {
            const text = (article.title + ' ' + article.body).toLowerCase();
            positiveWords.forEach(word => {
                if (text.includes(word)) score += 1;
            });
            negativeWords.forEach(word => {
                if (text.includes(word)) score -= 1;
            });
        });

        return score;
    }    private getSentimentDescription(score: number): string {
        if (score > 3) return '🟢 Very Positive';
        if (score > 0) return '🟡 Slightly Positive';
        if (score < -3) return '🔴 Very Negative';
        if (score < 0) return '🟠 Slightly Negative';
        return '⚪ Neutral';
    }

    private getBaseCurrency(symbol: string): string {
        // Extract the base currency from trading pair (e.g., 'BTC' from 'BTCUSDT')
        return symbol.replace(/USDT$|USD$|BTC$|ETH$/, '');
    }
}
