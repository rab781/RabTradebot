import * as CC from 'cryptocompare';
import { NewsArticle } from 'cryptocompare';

export interface NewsAnalysisResult {
  symbol: string;
  timestamp: Date;
  traditionalNews: {
    articles: NewsArticle[];
    sentiment: string;
    score: number;
  };

  combinedSentiment: {
    score: number;
    label: string;
    confidence: number;
  };
  summary: string;
}

export class NewsAnalyzer {
  constructor() {}

  async analyzeNews(symbol: string): Promise<string> {
    try {
      const result = await this.analyzeComprehensiveNews(symbol);
      return this.formatBasicAnalysis(result);
    } catch (error) {
      console.error('Error in news analysis:', error);
      throw error;
    }
  }

  async analyzeComprehensiveNews(symbol: string): Promise<NewsAnalysisResult> {
    try {
      const cryptoName = this.getBaseCurrency(symbol);

      // Get traditional news from CryptoCompare API
      const newsData = await CC.newsList('EN');
      const relevantNews = newsData.filter((article: NewsArticle) => {
        const text = (article.title + ' ' + article.body).toLowerCase();
        return text.includes(cryptoName.toLowerCase());
      });

      // Calculate traditional news sentiment
      const traditionalSentimentScore = this.calculateSentiment(relevantNews);
      const traditionalSentiment = this.getSentimentDescription(traditionalSentimentScore);

      // Combine sentiments (now just traditional)
      const combinedSentiment = this.combineSentiments(traditionalSentimentScore);

      // Generate comprehensive summary
      const summary = this.generateComprehensiveSummary(
        symbol,
        relevantNews,
        traditionalSentiment,
        combinedSentiment
      );

      return {
        symbol,
        timestamp: new Date(),
        traditionalNews: {
          articles: relevantNews,
          sentiment: traditionalSentiment,
          score: traditionalSentimentScore,
        },
        combinedSentiment,
        summary,
      };
    } catch (error) {
      console.error('Error in comprehensive news analysis:', error);
      throw error;
    }
  }

  private formatBasicAnalysis(result: NewsAnalysisResult): string {
    let analysis = `📰 News Analysis for ${result.symbol}:\n\n`;

    // Traditional news section
    if (result.traditionalNews.articles.length > 0) {
      analysis += `🔹 TRADITIONAL NEWS:\n`;
      analysis += `Found ${result.traditionalNews.articles.length} relevant articles\n`;
      analysis += `Sentiment: ${result.traditionalNews.sentiment}\n\n`;

      analysis += `Top Headlines:\n`;
      result.traditionalNews.articles.slice(0, 3).forEach((news: NewsArticle) => {
        const date = new Date(news.published_on * 1000).toLocaleDateString();
        analysis += `• [${date}] ${news.title} (${news.source})\n`;
      });
    } else {
      analysis += `🔹 TRADITIONAL NEWS: No significant news found\n`;
    }

    // Twitter analysis section (REMOVED)

    // Combined sentiment
    analysis += `\n🎯 COMBINED SENTIMENT: ${result.combinedSentiment.label}\n`;
    analysis += `Confidence: ${result.combinedSentiment.confidence.toFixed(1)}%\n`;

    return analysis;
  }

  private combineSentiments(traditionalScore: number): {
    score: number;
    label: string;
    confidence: number;
  } {
    // Only traditional news available
    return {
      score: traditionalScore,
      label: this.getSentimentDescription(traditionalScore),
      confidence: Math.min(Math.abs(traditionalScore) * 20, 70),
    };
  }

  private generateComprehensiveSummary(
    symbol: string,
    articles: NewsArticle[],
    traditionalSentiment: string,
    combinedSentiment?: { score: number; label: string; confidence: number }
  ): string {
    let summary = `📊 Comprehensive News Analysis for ${symbol}\n\n`;

    summary += `🔹 TRADITIONAL MEDIA:\n`;
    summary += `Articles: ${articles.length}\n`;
    summary += `Sentiment: ${traditionalSentiment}\n\n`;

    if (combinedSentiment) {
      summary += `🎯 OVERALL SENTIMENT: ${combinedSentiment.label}\n`;
      summary += `Market Confidence: ${combinedSentiment.confidence.toFixed(1)}%\n\n`;
    }

    summary += `⏰ Analysis Time: ${new Date().toLocaleString()}\n`;

    return summary;
  }

  private calculateSentiment(articles: NewsArticle[]): number {
    // Enhanced sentiment analysis using both title and body
    const positiveWords = [
      'surge',
      'bull',
      'up',
      'gain',
      'positive',
      'rise',
      'growth',
      'bullish',
      'breakthrough',
      'support',
      'adoption',
      'partnership',
    ];
    const negativeWords = [
      'crash',
      'bear',
      'down',
      'loss',
      'negative',
      'fall',
      'decline',
      'bearish',
      'resistance',
      'ban',
      'hack',
      'scam',
    ];

    let score = 0;

    articles.forEach((article) => {
      const text = (article.title + ' ' + article.body).toLowerCase();
      positiveWords.forEach((word) => {
        if (text.includes(word)) score += 1;
      });
      negativeWords.forEach((word) => {
        if (text.includes(word)) score -= 1;
      });
    });

    return score;
  }

  private getSentimentDescription(score: number): string {
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
