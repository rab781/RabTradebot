import * as CC from 'cryptocompare';
import { NewsArticle } from 'cryptocompare';
import { TwitterService, TwitterAnalysis } from './twitterService';

export interface NewsAnalysisResult {
    symbol: string;
    timestamp: Date;
    traditionalNews: {
        articles: NewsArticle[];
        sentiment: string;
        score: number;
    };
    twitterAnalysis?: TwitterAnalysis;
    combinedSentiment: {
        score: number;
        label: string;
        confidence: number;
    };
    summary: string;
}

export class NewsAnalyzer {
    private twitterService: TwitterService;

    constructor() {
        this.twitterService = new TwitterService();
        this.initializeTwitter();
    }

    private initializeTwitter(): void {
        // Initialize Twitter service with environment variables
        const twitterConfig = {
            apiKey: process.env.TWITTER_API_KEY || '',
            apiKeySecret: process.env.TWITTER_API_KEY_SECRET || '',
            accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
            accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
            bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
        };

        // Only initialize if all required credentials are present
        if (twitterConfig.apiKey && twitterConfig.apiKeySecret &&
            twitterConfig.accessToken && twitterConfig.accessTokenSecret) {
            try {
                this.twitterService.initialize(twitterConfig);
            } catch (error) {
                console.warn('Twitter service initialization failed:', error);
            }
        } else {
            console.warn('Twitter API credentials not found in environment variables');
        }
    }

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

            // Get Twitter analysis if available
            let twitterAnalysis: TwitterAnalysis | undefined;
            if (this.twitterService.isConfigured()) {
                try {
                    console.log('Starting Twitter sentiment analysis...');
                    twitterAnalysis = await this.twitterService.analyzeCryptoSentiment(symbol);
                    console.log('Twitter sentiment analysis completed successfully');
                } catch (error: any) {
                    console.warn('Twitter analysis failed:', error.message);
                    if (error.message?.includes('rate limit')) {
                        console.log('Twitter rate limit hit - using traditional news only');
                    }
                    // Continue without Twitter data
                }
            }

            // Combine sentiments
            const combinedSentiment = this.combineSentiments(
                traditionalSentimentScore,
                twitterAnalysis?.sentiment
            );

            // Generate comprehensive summary
            const summary = this.generateComprehensiveSummary(
                symbol,
                relevantNews,
                traditionalSentiment,
                twitterAnalysis,
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
                twitterAnalysis,
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

        // Twitter analysis section
        if (result.twitterAnalysis) {
            analysis += `\n🔹 TWITTER SENTIMENT:\n`;
            analysis += `Posts Analyzed: ${result.twitterAnalysis.posts.length}\n`;
            analysis += `Sentiment: ${result.twitterAnalysis.sentiment.label}\n`;
            analysis += `Confidence: ${result.twitterAnalysis.sentiment.confidence.toFixed(1)}%\n`;

            if (result.twitterAnalysis.influencers.length > 0) {
                analysis += `\nTop Influencers:\n`;
                result.twitterAnalysis.influencers.slice(0, 3).forEach(influencer => {
                    analysis += `• @${influencer.username}: ${influencer.sentiment}\n`;
                });
            }
        } else {
            analysis += `\n🔹 TWITTER ANALYSIS: Not available\n`;
        }

        // Combined sentiment
        analysis += `\n🎯 COMBINED SENTIMENT: ${result.combinedSentiment.label}\n`;
        analysis += `Confidence: ${result.combinedSentiment.confidence.toFixed(1)}%\n`;

        return analysis;
    }

    private combineSentiments(
        traditionalScore: number,
        twitterSentiment?: { score: number; label: string; confidence: number }
    ): { score: number; label: string; confidence: number } {
        if (!twitterSentiment) {
            // Only traditional news available
            return {
                score: traditionalScore,
                label: this.getSentimentDescription(traditionalScore),
                confidence: Math.min(Math.abs(traditionalScore) * 20, 70), // Lower confidence without Twitter
            };
        }

        // Weight traditional news (40%) and Twitter sentiment (60%)
        const traditionalWeight = 0.4;
        const twitterWeight = 0.6;

        // Normalize traditional score to -1 to 1 range
        const normalizedTraditional = Math.max(-1, Math.min(1, traditionalScore / 5));

        const combinedScore = (normalizedTraditional * traditionalWeight) + (twitterSentiment.score * twitterWeight);

        let label: string;
        let confidence: number;

        if (combinedScore > 0.3) {
            label = '🟢 Very Positive';
            confidence = Math.min(combinedScore * 100, 90);
        } else if (combinedScore > 0.1) {
            label = '🟡 Positive';
            confidence = Math.min(combinedScore * 80, 75);
        } else if (combinedScore < -0.3) {
            label = '🔴 Very Negative';
            confidence = Math.min(Math.abs(combinedScore) * 100, 90);
        } else if (combinedScore < -0.1) {
            label = '🟠 Negative';
            confidence = Math.min(Math.abs(combinedScore) * 80, 75);
        } else {
            label = '⚪ Neutral';
            confidence = 50;
        }

        return { score: combinedScore, label, confidence };
    }

    private generateComprehensiveSummary(
        symbol: string,
        articles: NewsArticle[],
        traditionalSentiment: string,
        twitterAnalysis?: TwitterAnalysis,
        combinedSentiment?: { score: number; label: string; confidence: number }
    ): string {
        let summary = `📊 Comprehensive News Analysis for ${symbol}\n\n`;

        summary += `🔹 TRADITIONAL MEDIA:\n`;
        summary += `Articles: ${articles.length}\n`;
        summary += `Sentiment: ${traditionalSentiment}\n\n`;

        if (twitterAnalysis) {
            summary += `🔹 SOCIAL MEDIA (Twitter):\n`;
            summary += `Posts: ${twitterAnalysis.posts.length}\n`;
            summary += `Sentiment: ${twitterAnalysis.sentiment.label}\n`;
            summary += `Confidence: ${twitterAnalysis.sentiment.confidence.toFixed(1)}%\n\n`;

            if (twitterAnalysis.trends.length > 0) {
                summary += `Trending: ${twitterAnalysis.trends.join(', ')}\n\n`;
            }
        }

        if (combinedSentiment) {
            summary += `🎯 OVERALL SENTIMENT: ${combinedSentiment.label}\n`;
            summary += `Market Confidence: ${combinedSentiment.confidence.toFixed(1)}%\n\n`;
        }

        summary += `⏰ Analysis Time: ${new Date().toLocaleString()}\n`;

        return summary;
    }

    // Method to get tweets from specific crypto influencers
    async getInfluencerTweets(influencers: string[]): Promise<string> {
        if (!this.twitterService.isConfigured()) {
            return '❌ Twitter service not configured. Please set up Twitter API credentials.';
        }

        let result = '🔥 Crypto Influencer Tweets:\n\n';

        for (const username of influencers) {
            try {
                const tweets = await this.twitterService.getTweetsFromUser(username, 5);

                if (tweets.length > 0) {
                    result += `📱 @${username} (${tweets[0].author.followers.toLocaleString()} followers):\n`;

                    tweets.slice(0, 3).forEach((tweet, index) => {
                        const date = tweet.createdAt.toLocaleDateString();
                        result += `${index + 1}. [${date}] ${tweet.text.substring(0, 100)}...\n`;
                        result += `   💚 ${tweet.metrics.likes} 🔄 ${tweet.metrics.retweets}\n`;
                    });

                    result += '\n';
                }
            } catch (error) {
                result += `❌ Error fetching tweets from @${username}\n\n`;
            }
        }

        return result;
    }

    // Method to search for specific crypto-related keywords on Twitter
    async searchCryptoNews(keywords: string[], symbol: string): Promise<string> {
        if (!this.twitterService.isConfigured()) {
            return '❌ Twitter service not configured. Please set up Twitter API credentials.';
        }

        const cryptoName = this.getBaseCurrency(symbol);
        let result = `🔍 Twitter Search Results for ${symbol}:\n\n`;

        for (const keyword of keywords) {
            try {
                const searchQuery = `${cryptoName} ${keyword} -RT`;
                const tweets = await this.twitterService.searchTweets(searchQuery, 10);

                if (tweets.length > 0) {
                    result += `📌 Keyword: "${keyword}"\n`;

                    tweets.slice(0, 3).forEach((tweet, index) => {
                        const date = tweet.createdAt.toLocaleDateString();
                        result += `${index + 1}. @${tweet.author.username} [${date}]\n`;
                        result += `   ${tweet.text.substring(0, 120)}...\n`;
                        result += `   💚 ${tweet.metrics.likes} 🔄 ${tweet.metrics.retweets}\n\n`;
                    });
                }
            } catch (error) {
                result += `❌ Error searching for "${keyword}"\n\n`;
            }
        }

        return result;
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
