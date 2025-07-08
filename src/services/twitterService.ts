// Install twitter-api-v2 package: npm install twitter-api-v2
import { TwitterApi } from 'twitter-api-v2';

export interface TwitterConfig {
    apiKey: string;
    apiKeySecret: string;
    accessToken: string;
    accessTokenSecret: string;
    bearerToken: string;
}

export interface TwitterPost {
    id: string;
    text: string;
    createdAt: Date;
    author: {
        username: string;
        name: string;
        followers: number;
    };
    metrics: {
        likes: number;
        retweets: number;
        replies: number;
    };
    url: string;
}

export interface TwitterAnalysis {
    posts: TwitterPost[];
    sentiment: {
        score: number;
        label: string;
        confidence: number;
    };
    influencers: {
        username: string;
        influence: number;
        sentiment: string;
    }[];
    trends: string[];
    summary: string;
}

export class TwitterService {
    private client: TwitterApi | null = null;
    private isInitialized = false;
    private requestCount = 0;
    private lastRequestTime = 0;
    private readonly rateLimitDelay = 5000; // 5 seconds between requests (increased)
    private readonly maxRequestsPerMinute = 15; // More conservative limit (reduced from 25)
    private readonly maxRequestsPer15Minutes = 180; // Twitter's actual limit for most endpoints
    private requestTimes: number[] = [];
    private request15MinTimes: number[] = [];
    private cache = new Map<string, { data: any; timestamp: number }>();
    private readonly cacheExpiry = 10 * 60 * 1000; // 10 minutes cache (increased)
    private isRateLimited = false;
    private rateLimitResetTime = 0;

    constructor(config?: TwitterConfig) {
        if (config) {
            this.initialize(config);
        }
    }

    initialize(config: TwitterConfig): void {
        try {
            this.client = new TwitterApi({
                appKey: config.apiKey,
                appSecret: config.apiKeySecret,
                accessToken: config.accessToken,
                accessSecret: config.accessTokenSecret,
            });
            this.isInitialized = true;
            console.log('Twitter service initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Twitter service:', error);
            throw error;
        }
    }

    async searchTweets(query: string, maxResults: number = 5): Promise<TwitterPost[]> {
        if (!this.isInitialized || !this.client) {
            throw new Error('Twitter service not initialized. Please provide API credentials.');
        }

        // Check if we're currently rate limited
        if (this.isRateLimited && Date.now() < this.rateLimitResetTime) {
            const waitTime = Math.ceil((this.rateLimitResetTime - Date.now()) / 1000);
            throw new Error(`Twitter API rate limited. Please wait ${waitTime} seconds.`);
        }

        const cacheKey = this.getCacheKey('search', { query, maxResults });

        return this.makeTwitterRequest(async () => {
            // Twitter API v2 requires max_results to be between 5 and 100
            const validMaxResults = Math.max(5, Math.min(maxResults, 100));

            const tweets = await this.client!.v2.search(query, {
                max_results: validMaxResults,
                'tweet.fields': ['created_at', 'public_metrics', 'author_id'],
                'user.fields': ['username', 'name', 'public_metrics'],
                expansions: ['author_id'],
            });

            console.log(`Twitter API search returned ${Array.isArray(tweets.data) ? tweets.data.length : 0} tweets for query: ${query}`);

            const posts: TwitterPost[] = [];

            if (tweets.data && Array.isArray(tweets.data)) {
                tweets.data.forEach(tweet => {
                    const author = tweets.includes?.users?.find((user: any) => user.id === tweet.author_id);

                    posts.push({
                        id: tweet.id,
                        text: tweet.text,
                        createdAt: new Date(tweet.created_at || Date.now()),
                        author: {
                            username: author?.username || 'unknown',
                            name: author?.name || 'Unknown',
                            followers: author?.public_metrics?.followers_count || 0,
                        },
                        metrics: {
                            likes: tweet.public_metrics?.like_count || 0,
                            retweets: tweet.public_metrics?.retweet_count || 0,
                            replies: tweet.public_metrics?.reply_count || 0,
                        },
                        url: `https://twitter.com/${author?.username}/status/${tweet.id}`,
                    });
                });
            }

            return posts;
        }, cacheKey);
    }

    async getTweetsFromUser(username: string, maxResults: number = 5): Promise<TwitterPost[]> {
        if (!this.isInitialized || !this.client) {
            throw new Error('Twitter service not initialized. Please provide API credentials.');
        }

        // Check if we're currently rate limited
        if (this.isRateLimited && Date.now() < this.rateLimitResetTime) {
            const waitTime = Math.ceil((this.rateLimitResetTime - Date.now()) / 1000);
            throw new Error(`Twitter API rate limited. Please wait ${waitTime} seconds.`);
        }

        const cacheKey = this.getCacheKey('userTimeline', { username, maxResults });

        return this.makeTwitterRequest(async () => {
            const user = await this.client!.v2.userByUsername(username);
            if (!user.data) {
                throw new Error(`User @${username} not found`);
            }

            const tweets = await this.client!.v2.userTimeline(user.data.id, {
                max_results: Math.max(5, Math.min(maxResults, 100)), // Ensure valid range
                'tweet.fields': ['created_at', 'public_metrics'],
                'user.fields': ['username', 'name', 'public_metrics'],
                expansions: ['author_id'],
            });

            console.log(`Twitter API returned ${Array.isArray(tweets.data) ? tweets.data.length : 0} tweets for user: @${username}`);

            const posts: TwitterPost[] = [];

            if (tweets.data && Array.isArray(tweets.data)) {
                tweets.data.forEach(tweet => {
                    posts.push({
                        id: tweet.id,
                        text: tweet.text,
                        createdAt: new Date(tweet.created_at || Date.now()),
                        author: {
                            username: username,
                            name: user.data.name,
                            followers: user.data.public_metrics?.followers_count || 0,
                        },
                        metrics: {
                            likes: tweet.public_metrics?.like_count || 0,
                            retweets: tweet.public_metrics?.retweet_count || 0,
                            replies: tweet.public_metrics?.reply_count || 0,
                        },
                        url: `https://twitter.com/${username}/status/${tweet.id}`,
                    });
                });
            }

            return posts;
        }, cacheKey);
    }

    async analyzeCryptoSentiment(symbol: string): Promise<TwitterAnalysis> {
        if (!this.isInitialized || !this.client) {
            throw new Error('Twitter service not initialized. Please provide API credentials.');
        }

        try {
            const cryptoName = this.getBaseCurrency(symbol);

            // Check if we're currently rate limited
            if (this.isRateLimited && Date.now() < this.rateLimitResetTime) {
                const waitTime = Math.ceil((this.rateLimitResetTime - Date.now()) / 1000);
                throw new Error(`Twitter API rate limited. Please wait ${waitTime} seconds.`);
            }

            // Search for tweets about the cryptocurrency - reduced queries to minimize API usage
            const queries = [
                `${cryptoName} crypto`,
                `$${cryptoName}`,
            ];

            let allPosts: TwitterPost[] = [];

            // Search with reduced queries and longer delays
            for (let i = 0; i < queries.length; i++) {
                const query = queries[i];
                try {
                    console.log(`Searching Twitter for: ${query} (${i + 1}/${queries.length})`);
                    const posts = await this.searchTweets(query, 10); // Use 10 (minimum safe value above 5)
                    console.log(`Found ${posts.length} posts for query: ${query}`);
                    allPosts = allPosts.concat(posts);

                    // Add much longer delay between requests to avoid rate limiting
                    if (i < queries.length - 1) {
                        console.log('Waiting 10 seconds before next search...');
                        await new Promise(resolve => setTimeout(resolve, 10000)); // Increased to 10 seconds
                    }
                } catch (error: any) {
                    console.warn(`Failed to search for query: ${query}`, error.message);
                    if (error.message?.includes('rate limit') || error.code === 429) {
                        console.log('Rate limit detected, stopping additional searches');
                        this.isRateLimited = true;
                        this.rateLimitResetTime = Date.now() + (15 * 60 * 1000); // 15 minutes
                        break; // Stop further searches if rate limited
                    }
                }
            }

            console.log(`Total posts collected: ${allPosts.length}`);

            // Remove duplicates
            const uniquePosts = allPosts.filter((post, index, self) =>
                index === self.findIndex(p => p.id === post.id)
            );

            console.log(`Unique posts after deduplication: ${uniquePosts.length}`);

            // Sort by engagement (likes + retweets)
            uniquePosts.sort((a, b) => {
                const engagementA = a.metrics.likes + a.metrics.retweets;
                const engagementB = b.metrics.likes + b.metrics.retweets;
                return engagementB - engagementA;
            });

            // Take top 15 posts for analysis (reduced from 30)
            const topPosts = uniquePosts.slice(0, 15);
            console.log(`Using top ${topPosts.length} posts for sentiment analysis`);

            // Analyze sentiment
            const sentiment = this.analyzeSentiment(topPosts);

            // Identify influencers
            const influencers = this.identifyInfluencers(topPosts);

            // Extract trends
            const trends = this.extractTrends(topPosts);

            // Generate summary
            const summary = this.generateSummary(topPosts, sentiment, influencers);

            return {
                posts: topPosts.slice(0, 5), // Return top 5 for display (reduced from 10)
                sentiment,
                influencers,
                trends,
                summary,
            };

        } catch (error) {
            console.error('Error analyzing crypto sentiment:', error);
            throw error;
        }
    }

    private analyzeSentiment(posts: TwitterPost[]): { score: number; label: string; confidence: number } {
        const positiveWords = [
            'bull', 'bullish', 'moon', 'pump', 'surge', 'rally', 'breakout', 'support',
            'buy', 'hold', 'hodl', 'diamond', 'hands', 'rocket', 'green', 'profit',
            'gains', 'up', 'rise', 'breakthrough', 'adoption', 'partnership', 'upgrade',
            'positive', 'optimistic', 'confident', 'strong', 'momentum', 'recovery'
        ];

        const negativeWords = [
            'bear', 'bearish', 'dump', 'crash', 'drop', 'dip', 'resistance', 'sell',
            'fear', 'panic', 'red', 'loss', 'losses', 'down', 'fall', 'decline',
            'negative', 'pessimistic', 'weak', 'correction', 'bubble', 'scam',
            'hack', 'ban', 'regulation', 'concern', 'warning', 'risk'
        ];

        let score = 0;
        let totalWords = 0;

        posts.forEach(post => {
            const text = post.text.toLowerCase();
            const weight = this.calculatePostWeight(post);

            positiveWords.forEach(word => {
                const count = (text.match(new RegExp(word, 'g')) || []).length;
                if (count > 0) {
                    score += count * weight;
                    totalWords += count;
                }
            });

            negativeWords.forEach(word => {
                const count = (text.match(new RegExp(word, 'g')) || []).length;
                if (count > 0) {
                    score -= count * weight;
                    totalWords += count;
                }
            });
        });

        // Normalize score
        const normalizedScore = totalWords > 0 ? score / totalWords : 0;

        let label: string;
        let confidence: number;

        if (normalizedScore > 0.3) {
            label = '🟢 Very Bullish';
            confidence = Math.min(normalizedScore * 100, 95);
        } else if (normalizedScore > 0.1) {
            label = '🟡 Bullish';
            confidence = Math.min(normalizedScore * 80, 80);
        } else if (normalizedScore < -0.3) {
            label = '🔴 Very Bearish';
            confidence = Math.min(Math.abs(normalizedScore) * 100, 95);
        } else if (normalizedScore < -0.1) {
            label = '🟠 Bearish';
            confidence = Math.min(Math.abs(normalizedScore) * 80, 80);
        } else {
            label = '⚪ Neutral';
            confidence = 50;
        }

        return { score: normalizedScore, label, confidence };
    }

    private calculatePostWeight(post: TwitterPost): number {
        // Weight based on author influence and engagement
        const baseWeight = 1;
        const followerWeight = Math.log10(post.author.followers + 1) / 10;
        const engagementWeight = Math.log10(post.metrics.likes + post.metrics.retweets + 1) / 10;

        return baseWeight + followerWeight + engagementWeight;
    }

    private identifyInfluencers(posts: TwitterPost[]): { username: string; influence: number; sentiment: string }[] {
        const influencerMap = new Map<string, {
            posts: TwitterPost[];
            totalEngagement: number;
            followers: number
        }>();

        // Group posts by author
        posts.forEach(post => {
            const key = post.author.username;
            if (!influencerMap.has(key)) {
                influencerMap.set(key, { posts: [], totalEngagement: 0, followers: post.author.followers });
            }

            const data = influencerMap.get(key)!;
            data.posts.push(post);
            data.totalEngagement += post.metrics.likes + post.metrics.retweets;
        });

        // Calculate influence and sentiment for each influencer
        const influencers = Array.from(influencerMap.entries())
            .map(([username, data]) => {
                const influence = Math.log10(data.followers + 1) + Math.log10(data.totalEngagement + 1);
                const sentiment = this.analyzeSentiment(data.posts);

                return {
                    username,
                    influence,
                    sentiment: sentiment.label,
                };
            })
            .sort((a, b) => b.influence - a.influence)
            .slice(0, 5); // Top 5 influencers

        return influencers;
    }

    private extractTrends(posts: TwitterPost[]): string[] {
        const hashtags = new Map<string, number>();
        const mentions = new Map<string, number>();

        posts.forEach(post => {
            // Extract hashtags
            const hashtagMatches = post.text.match(/#\w+/g);
            if (hashtagMatches) {
                hashtagMatches.forEach(hashtag => {
                    const count = hashtags.get(hashtag) || 0;
                    hashtags.set(hashtag, count + 1);
                });
            }

            // Extract mentions
            const mentionMatches = post.text.match(/@\w+/g);
            if (mentionMatches) {
                mentionMatches.forEach(mention => {
                    const count = mentions.get(mention) || 0;
                    mentions.set(mention, count + 1);
                });
            }
        });

        // Get top trends
        const topHashtags = Array.from(hashtags.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([hashtag]) => hashtag);

        const topMentions = Array.from(mentions.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([mention]) => mention);

        return [...topHashtags, ...topMentions];
    }

    private generateSummary(
        posts: TwitterPost[],
        sentiment: { score: number; label: string; confidence: number },
        influencers: { username: string; influence: number; sentiment: string }[]
    ): string {
        const totalPosts = posts.length;
        const totalEngagement = posts.reduce((sum, post) =>
            sum + post.metrics.likes + post.metrics.retweets, 0
        );
        const avgEngagement = totalEngagement / totalPosts;

        let summary = `📊 Twitter Analysis Summary\n`;
        summary += `Posts Analyzed: ${totalPosts}\n`;
        summary += `Overall Sentiment: ${sentiment.label} (${sentiment.confidence.toFixed(1)}% confidence)\n`;
        summary += `Average Engagement: ${avgEngagement.toFixed(1)} interactions per post\n`;

        if (influencers.length > 0) {
            summary += `\n🔥 Top Influencers:\n`;
            influencers.slice(0, 3).forEach(influencer => {
                summary += `@${influencer.username}: ${influencer.sentiment}\n`;
            });
        }

        return summary;
    }

    private getBaseCurrency(symbol: string): string {
        // Extract the base currency from trading pair (e.g., 'BTC' from 'BTCUSDT')
        return symbol.replace(/USDT$|USD$|BTC$|ETH$/, '');
    }

    isConfigured(): boolean {
        return this.isInitialized && this.client !== null;
    }

    private async rateLimitCheck(): Promise<void> {
        const now = Date.now();

        // Remove requests older than 1 minute
        this.requestTimes = this.requestTimes.filter(time => now - time < 60000);

        // Remove requests older than 15 minutes
        this.request15MinTimes = this.request15MinTimes.filter(time => now - time < 15 * 60 * 1000);

        // Check if we're hitting 15-minute rate limits
        if (this.request15MinTimes.length >= this.maxRequestsPer15Minutes) {
            const oldestRequest = Math.min(...this.request15MinTimes);
            const waitTime = (15 * 60 * 1000) - (now - oldestRequest) + 1000;
            console.log(`15-minute rate limit protection: waiting ${Math.ceil(waitTime/1000)} seconds`);
            this.isRateLimited = true;
            this.rateLimitResetTime = now + waitTime;
            throw new Error(`Twitter API rate limit exceeded. Please wait ${Math.ceil(waitTime/1000)} seconds.`);
        }

        // Check if we're hitting per-minute rate limits
        if (this.requestTimes.length >= this.maxRequestsPerMinute) {
            const oldestRequest = Math.min(...this.requestTimes);
            const waitTime = 60000 - (now - oldestRequest) + 1000; // Wait a bit longer
            console.log(`Per-minute rate limit protection: waiting ${waitTime}ms before next request`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // Ensure minimum delay between requests
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.rateLimitDelay) {
            const waitTime = this.rateLimitDelay - timeSinceLastRequest;
            console.log(`Rate limiting: waiting ${waitTime}ms between requests`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime = Date.now();
        this.requestTimes.push(this.lastRequestTime);
        this.request15MinTimes.push(this.lastRequestTime);
    }

    private getCacheKey(method: string, params: any): string {
        return `${method}:${JSON.stringify(params)}`;
    }

    private getFromCache<T>(key: string): T | null {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            console.log(`Cache hit for: ${key}`);
            return cached.data;
        }

        if (cached) {
            this.cache.delete(key); // Remove expired cache
        }

        return null;
    }

    private setCache(key: string, data: any): void {
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    private async makeTwitterRequest<T>(requestFn: () => Promise<T>, cacheKey: string): Promise<T> {
        // Check cache first
        const cached = this.getFromCache<T>(cacheKey);
        if (cached) {
            return cached;
        }

        // Check if we're currently rate limited
        if (this.isRateLimited && Date.now() < this.rateLimitResetTime) {
            const waitTime = Math.ceil((this.rateLimitResetTime - Date.now()) / 1000);
            throw new Error(`Twitter API rate limited. Please wait ${waitTime} seconds.`);
        }

        // Apply rate limiting
        await this.rateLimitCheck();

        try {
            const result = await requestFn();
            this.setCache(cacheKey, result);

            // Reset rate limit flag on successful request
            if (this.isRateLimited && Date.now() >= this.rateLimitResetTime) {
                this.isRateLimited = false;
                this.rateLimitResetTime = 0;
                console.log('Twitter rate limit reset - service available again');
            }

            return result;
        } catch (error: any) {
            console.error('Twitter API request failed:', {
                error: error.message,
                code: error.code,
                data: error.data
            });

            // Handle different types of rate limit errors
            if (error.code === 429 || error.message?.includes('rate limit') || error.message?.includes('Too Many Requests')) {
                this.isRateLimited = true;
                this.rateLimitResetTime = Date.now() + (15 * 60 * 1000); // Wait 15 minutes
                console.warn('Twitter rate limit hit, service disabled for 15 minutes');
                throw new Error('Twitter API rate limit exceeded. Please try again in 15 minutes.');
            }

            // Handle other Twitter API errors
            if (error.code === 401) {
                throw new Error('Twitter API authentication failed. Please check your credentials.');
            }

            if (error.code === 403) {
                throw new Error('Twitter API access forbidden. Your app may not have the required permissions.');
            }

            if (error.code >= 500) {
                throw new Error('Twitter API server error. Please try again later.');
            }

            // Re-throw other errors as-is
            throw error;
        }
    }

    clearCache(): void {
        this.cache.clear();
        console.log('Twitter service cache cleared');
    }

    getCacheStats(): { size: number; oldestEntry: number } {
        const now = Date.now();
        let oldestEntry = now;

        for (const [, value] of this.cache) {
            if (value.timestamp < oldestEntry) {
                oldestEntry = value.timestamp;
            }
        }

        return {
            size: this.cache.size,
            oldestEntry: oldestEntry === now ? 0 : Math.floor((now - oldestEntry) / 1000)
        };
    }

    getRateLimitStatus(): {
        requestsInLastMinute: number;
        requestsInLast15Minutes: number;
        nextAvailableSlot: number;
        isRateLimited: boolean;
        rateLimitResetTime: number;
    } {
        const now = Date.now();
        const recentRequests = this.requestTimes.filter(time => now - time < 60000);
        const recent15MinRequests = this.request15MinTimes.filter(time => now - time < 15 * 60 * 1000);
        const nextSlot = this.lastRequestTime + this.rateLimitDelay;

        return {
            requestsInLastMinute: recentRequests.length,
            requestsInLast15Minutes: recent15MinRequests.length,
            nextAvailableSlot: Math.max(0, nextSlot - now),
            isRateLimited: this.isRateLimited,
            rateLimitResetTime: Math.max(0, this.rateLimitResetTime - now)
        };
    }

    // Method to manually reset rate limit (for testing or admin purposes)
    resetRateLimit(): void {
        this.isRateLimited = false;
        this.rateLimitResetTime = 0;
        this.requestTimes = [];
        this.request15MinTimes = [];
        console.log('Twitter rate limit manually reset');
    }
}
