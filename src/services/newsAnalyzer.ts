import axios from 'axios';
import * as cheerio from 'cheerio';

export class NewsAnalyzer {
    private newsUrls = [
        'https://cointelegraph.com',
        'https://www.coindesk.com',
        // Add more crypto news sources as needed
    ];

    async analyzeNews(symbol: string): Promise<string> {
        try {
            const cryptoName = this.getBaseCurrency(symbol);
            let relevantNews: string[] = [];
            let sentimentScore = 0;

            for (const url of this.newsUrls) {
                const articles = await this.fetchNews(url, cryptoName);
                relevantNews.push(...articles);
            }

            // Calculate basic sentiment
            sentimentScore = this.calculateSentiment(relevantNews);

            let newsAnalysis = `News Analysis for ${symbol}:\n`;
            
            if (relevantNews.length > 0) {
                newsAnalysis += `Found ${relevantNews.length} relevant articles\n`;
                newsAnalysis += `Overall sentiment: ${this.getSentimentDescription(sentimentScore)}\n`;
                newsAnalysis += '\nTop Headlines:\n';
                relevantNews.slice(0, 3).forEach(news => {
                    newsAnalysis += `- ${news}\n`;
                });
            } else {
                newsAnalysis += 'No significant news found\n';
            }

            return newsAnalysis;

        } catch (error) {
            console.error('Error in news analysis:', error);
            throw error;
        }
    }

    private async fetchNews(url: string, cryptoName: string): Promise<string[]> {
        try {
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);
            const articles: string[] = [];

            // This is a basic implementation - you might need to adjust selectors based on the specific news site
            $('article').each((_, element) => {
                const title = $(element).find('h1, h2, h3').text().trim();
                if (title.toLowerCase().includes(cryptoName.toLowerCase())) {
                    articles.push(title);
                }
            });

            return articles;
        } catch (error) {
            console.error(`Error fetching news from ${url}:`, error);
            return [];
        }
    }

    private calculateSentiment(articles: string[]): number {
        // This is a very basic sentiment analysis
        // In a production environment, you might want to use a proper NLP library
        const positiveWords = ['surge', 'bull', 'up', 'gain', 'positive', 'rise', 'growth'];
        const negativeWords = ['crash', 'bear', 'down', 'loss', 'negative', 'fall', 'decline'];

        let score = 0;

        articles.forEach(article => {
            const text = article.toLowerCase();
            positiveWords.forEach(word => {
                if (text.includes(word)) score += 1;
            });
            negativeWords.forEach(word => {
                if (text.includes(word)) score -= 1;
            });
        });

        return score;
    }

    private getSentimentDescription(score: number): string {
        if (score > 2) return '🟢 Very Positive';
        if (score > 0) return '🟡 Slightly Positive';
        if (score < -2) return '🔴 Very Negative';
        if (score < 0) return '🟠 Slightly Negative';
        return '⚪ Neutral';
    }

    private getBaseCurrency(symbol: string): string {
        // Extract the base currency from trading pair (e.g., 'BTC' from 'BTCUSDT')
        return symbol.replace(/USDT$|USD$|BTC$|ETH$/, '');
    }
}
