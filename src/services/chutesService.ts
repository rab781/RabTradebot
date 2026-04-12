import { logger } from '../utils/logger';
import axios from 'axios';

export interface ChutesNewsItem {
    title: string;
    content: string;
    url: string;
    publishedAt: Date;
    source: string;
    relevanceScore: number;
    sentimentScore: number;
    impactLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface ChutesAnalysis {
    symbol: string;
    newsItems: ChutesNewsItem[];
    overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    impactPrediction: {
        shortTerm: string; // 24h
        mediumTerm: string; // 7d
        longTerm: string; // 30d
    };
    keyFactors: string[];
    marketMovement: {
        direction: 'UP' | 'DOWN' | 'SIDEWAYS';
        confidence: number;
        expectedRange: {
            low: number;
            high: number;
        };
    };
    priceTarget: {
        bullish: number;
        bearish: number;
        neutral: number;
    };
    timestamp: Date;
}

export class ChutesService {
    private apiKey: string;
    private baseUrl = 'https://llm.chutes.ai/v1';
    private cache = new Map<string, { data: any; timestamp: number }>();
    private cacheTimeout = 10 * 60 * 1000; // 10 minutes

    constructor() {
        this.apiKey = process.env.CHUTES_API_KEY || '';
        if (!this.apiKey) {
            logger.warn('⚠️ CHUTES_API_KEY not found in environment variables');
        }
    }

    isConfigured(): boolean {
        return !!this.apiKey;
    }

    private getCacheKey(symbol: string, query: string): string {
        return `${symbol}_${query}`.replace(/\s+/g, '_');
    }

    private getCachedData(key: string): any {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    private setCachedData(key: string, data: any): void {
        this.cache.set(key, { data, timestamp: Date.now() });

        // Clean old cache entries
        for (const [cacheKey, cached] of this.cache.entries()) {
            if (Date.now() - cached.timestamp > this.cacheTimeout) {
                this.cache.delete(cacheKey);
            }
        }
    }

    private getCryptoName(symbol: string): string {
        const cryptoMap: Record<string, string> = {
            'BTCUSDT': 'Bitcoin',
            'ETHUSDT': 'Ethereum',
            'BNBUSDT': 'Binance Coin',
            'XRPUSDT': 'Ripple',
            'ADAUSDT': 'Cardano',
            'DOGEUSDT': 'Dogecoin',
            'SOLUSDT': 'Solana',
            'DOTUSDT': 'Polkadot',
            'MATICUSDT': 'Polygon',
            'SHIBUSDT': 'Shiba Inu',
            'AVAXUSDT': 'Avalanche',
            'LINKUSDT': 'Chainlink',
            'UNIUSDT': 'Uniswap',
            'ATOMUSDT': 'Cosmos',
            'LTCUSDT': 'Litecoin'
        };
        return cryptoMap[symbol] || symbol.replace('USDT', '').replace('BUSD', '');
    }

    private cleanModelResponse(content: string): string {
        // Remove Qwen thinking tags
        let cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '');
        cleaned = cleaned.replace(/<think>[\s\S]*$/g, ''); // Unclosed think tags

        // Remove markdown code blocks (```json, ```, etc.)
        cleaned = cleaned.replace(/```json\s*/g, '');
        cleaned = cleaned.replace(/```\s*/g, '');
        cleaned = cleaned.replace(/`/g, ''); // Remove any remaining backticks

        // Trim whitespace
        cleaned = cleaned.trim();

        return cleaned;
    }

    async searchCryptoNews(symbol: string, limit: number = 10): Promise<ChutesNewsItem[]> {
        if (!this.isConfigured()) {
            throw new Error('Chutes API not configured');
        }

        const cacheKey = this.getCacheKey(symbol, 'news');
        const cachedData = this.getCachedData(cacheKey);
        if (cachedData) {
            logger.info({ symbol }, '✅ Using cached news data');
            return cachedData;
        }

        const cryptoName = this.getCryptoName(symbol);

        // Optimized prompt for multiple news items
        const prompt = `Find ${limit} latest ${cryptoName} (${symbol}) crypto news from last 24-48h.

Return JSON array with EXACTLY ${limit} news items:
[
  {"title":"headline 1","content":"summary","source":"source","sentimentScore":0.5,"impactLevel":"HIGH"},
  {"title":"headline 2","content":"summary","source":"source","sentimentScore":-0.3,"impactLevel":"MEDIUM"},
  ...(continue for ${limit} items)
]

Focus on: price movements, partnerships, regulations, whale activity, exchange news.`;

        try {
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: "Qwen/Qwen3-32B",
                    messages: [
                        {
                            role: "system",
                            content: "You are a news researcher tasked with analyzing recent news and trends over the past week. Please write a comprehensive report of the current state of the world that is relevant for trading and macroeconomics. Always provide accurate, structured data in JSON format."
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    max_tokens: 10000,
                    temperature: 0.3,
                    stream: false  // Disable streaming to get complete response
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 300000  // 5 minutes for quality results
                }
            );

            // Check if response has valid structure
            if (!response.data?.choices?.[0]?.message?.content) {
                logger.error({ response: JSON.stringify(response.data, null, 2) }, 'Invalid Chutes API response structure');
                throw new Error('Invalid API response structure');
            }

            const content = this.cleanModelResponse(response.data.choices[0].message.content);
            logger.info({ symbol }, '📰 Chutes API Response received');

            // Parse JSON response
            let newsItems: ChutesNewsItem[] = [];
            try {
                const parsed = JSON.parse(content);
                const newsArray = Array.isArray(parsed) ? parsed : (parsed.news || parsed.articles || []);

                newsItems = newsArray.map((item: any) => ({
                    title: item.title || 'News Update',
                    content: item.content || item.summary || 'No content available',
                    url: item.url || item.link || '',
                    publishedAt: new Date(item.publishedAt || item.timestamp || Date.now()),
                    source: item.source || 'Chutes AI',
                    relevanceScore: Math.max(0, Math.min(1, item.relevanceScore || 0.7)),
                    sentimentScore: Math.max(-1, Math.min(1, item.sentimentScore || 0)),
                    impactLevel: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(item.impactLevel) ?
                               item.impactLevel : 'MEDIUM'
                }));
            } catch (parseError) {
                logger.warn('⚠️ Failed to parse JSON response, extracting manually...');
                newsItems = this.extractNewsFromText(content, symbol);
            }

            // Filter and limit results
            const filteredNews = newsItems
                .filter(item => item.title && item.title.length > 10)
                .slice(0, limit);

            // Cache the results
            this.setCachedData(cacheKey, filteredNews);
            logger.info(`✅ Found ${filteredNews.length} news items for ${symbol}`);

            return filteredNews;

        } catch (error: any) {
            logger.error({ err: error.message }, '❌ Chutes API error:');

            if (error.response?.status === 401) {
                throw new Error('Invalid Chutes API key');
            } else if (error.response?.status === 429) {
                throw new Error('Chutes API rate limit exceeded');
            } else if (error.code === 'ECONNABORTED') {
                throw new Error('Request timeout - Chutes API is slow');
            } else {
                throw new Error(`Chutes API error: ${error.message}`);
            }
        }
    }

    async analyzeNewsImpact(symbol: string, newsItems: ChutesNewsItem[], currentPrice?: number): Promise<ChutesAnalysis> {
        if (!this.isConfigured()) {
            throw new Error('Chutes API not configured');
        }

        if (newsItems.length === 0) {
            return this.createFallbackAnalysis(symbol, currentPrice);
        }

        const cacheKey = this.getCacheKey(symbol, 'analysis');
        const cachedData = this.getCachedData(cacheKey);
        if (cachedData) {
            logger.info({ symbol }, '✅ Using cached analysis data');
            return cachedData;
        }

        const cryptoName = this.getCryptoName(symbol);
        const newsContext = newsItems.map((item, idx) =>
            `${idx + 1}. ${item.title} (${item.impactLevel}, sentiment: ${item.sentimentScore.toFixed(2)})`
        ).join('\n');

        const priceContext = currentPrice ? `Price: $${currentPrice}` : '';

        // Detailed prompt for high-quality analysis
        const analysisPrompt = `You are an elite cryptocurrency analyst. Analyze ${cryptoName} (${symbol}) news thoroughly.

${priceContext}

NEWS ANALYSIS:
${newsContext}

Provide comprehensive analysis covering:

1. SENTIMENT ANALYSIS:
   - Aggregate overall market sentiment
   - Weight recent news more heavily
   - Consider source credibility
   - Identify any sentiment shifts

2. PRICE IMPACT PREDICTIONS:
   - SHORT TERM (24h): Expected immediate price reaction
   - MEDIUM TERM (7 days): Weekly trend prediction
   - LONG TERM (30 days): Monthly outlook and fundamentals

3. KEY MARKET FACTORS:
   - List 3-5 most critical factors affecting price
   - Include both bullish and bearish considerations
   - Analyze whale activity, regulations, partnerships

4. PRICE TARGETS:
   - Bullish scenario target price
   - Neutral/base case target price
   - Bearish scenario target price

5. MARKET MOVEMENT:
   - Direction: UP, DOWN, or SIDEWAYS
   - Confidence level (0-100%)
   - Expected price range

CRITICAL ANALYSIS POINTS:
✓ Check for market manipulation signals
✓ Analyze whale wallet movements
✓ Consider broader crypto market conditions
✓ Evaluate BTC/ETH correlation impact
✓ Distinguish FUD from legitimate concerns
✓ Assess regulatory and compliance impact
✓ Review on-chain metrics if mentioned

Return detailed JSON:
{
  "overallSentiment": "BULLISH|BEARISH|NEUTRAL",
  "impactPrediction": {
    "shortTerm": "detailed 24h prediction with specific price expectations and reasoning",
    "mediumTerm": "detailed 7-day trend analysis with technical and fundamental factors",
    "longTerm": "comprehensive 30-day outlook with market dynamics and catalysts"
  },
  "keyFactors": [
    "Most critical factor with detailed explanation",
    "Second important factor with context",
    "Third key factor with impact assessment"
  ],
  "marketMovement": {
    "direction": "UP|DOWN|SIDEWAYS",
    "confidence": 75,
    "expectedRange": {"low": 0, "high": 0}
  },
  "priceTarget": {"bullish": 0, "bearish": 0, "neutral": 0}
}

Be thorough, data-driven, and provide actionable insights.`;

        try {
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: "Qwen/Qwen3-32B",
                    messages: [
                        {
                            role: "system",
                            content: "You are a professional cryptocurrency analyst with 10+ years of trading experience. You provide accurate, conservative predictions based on data analysis, not speculation. Always return valid JSON."
                        },
                        {
                            role: "user",
                            content: analysisPrompt
                        }
                    ],
                    max_tokens: 3000,  // More tokens for detailed quality analysis
                    temperature: 0.2,
                    stream: false
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 300000  // 5 minutes for detailed analysis
                }
            );

            const content = this.cleanModelResponse(response.data.choices[0].message.content);
            const parsed = JSON.parse(content);

            const analysis: ChutesAnalysis = {
                symbol,
                newsItems,
                overallSentiment: parsed.overallSentiment || 'NEUTRAL',
                impactPrediction: parsed.impactPrediction || {
                    shortTerm: 'Insufficient data',
                    mediumTerm: 'Insufficient data',
                    longTerm: 'Insufficient data'
                },
                keyFactors: parsed.keyFactors || [],
                marketMovement: {
                    direction: parsed.marketMovement?.direction || 'SIDEWAYS',
                    confidence: Math.max(0, Math.min(100, parsed.marketMovement?.confidence || 50)),
                    expectedRange: parsed.marketMovement?.expectedRange || { low: 0, high: 0 }
                },
                priceTarget: parsed.priceTarget || {
                    bullish: currentPrice ? currentPrice * 1.05 : 0,
                    bearish: currentPrice ? currentPrice * 0.95 : 0,
                    neutral: currentPrice || 0
                },
                timestamp: new Date()
            };

            // Cache the analysis
            this.setCachedData(cacheKey, analysis);
            logger.info(`✅ Analysis completed for ${symbol}`);

            return analysis;

        } catch (error: any) {
            logger.error({ err: error.message }, '❌ Chutes analysis error:');
            throw new Error(`Failed to analyze news impact: ${error.message}`);
        }
    }

    async getQuickImpact(symbol: string): Promise<string> {
        try {
            const news = await this.searchCryptoNews(symbol, 5);
            if (news.length === 0) {
                return `No recent news found for ${symbol}`;
            }

            const avgSentiment = news.reduce((sum, item) => sum + item.sentimentScore, 0) / news.length;
            const highImpactCount = news.filter(item => item.impactLevel === 'HIGH' || item.impactLevel === 'CRITICAL').length;

            let sentiment = '😐 Neutral';
            if (avgSentiment > 0.3) sentiment = '🟢 Bullish';
            else if (avgSentiment < -0.3) sentiment = '🔴 Bearish';

            return `📊 Quick Impact for ${symbol}:
Sentiment: ${sentiment} (${(avgSentiment * 100).toFixed(1)}%)
High Impact News: ${highImpactCount}/${news.length}
Latest: ${news[0].title}`;

        } catch (error: any) {
            throw new Error(`Quick impact analysis failed: ${error.message}`);
        }
    }

    private extractNewsFromText(text: string, symbol: string): ChutesNewsItem[] {
        const newsItems: ChutesNewsItem[] = [];
        const lines = text.split('\n');

        let currentItem: Partial<ChutesNewsItem> = {};

        for (const line of lines) {
            if (line.includes('Title:') || line.includes('Headline:')) {
                if (currentItem.title) {
                    newsItems.push(this.completeNewsItem(currentItem));
                    currentItem = {};
                }
                currentItem.title = line.split(':').slice(1).join(':').trim();
            } else if (line.includes('Content:') || line.includes('Summary:')) {
                currentItem.content = line.split(':').slice(1).join(':').trim();
            } else if (line.includes('Sentiment:')) {
                const sentStr = line.split(':')[1].trim();
                currentItem.sentimentScore = parseFloat(sentStr) || 0;
            } else if (line.includes('Impact:')) {
                const impact = line.split(':')[1].trim().toUpperCase();
                currentItem.impactLevel = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(impact) ?
                    impact as any : 'MEDIUM';
            }
        }

        if (currentItem.title) {
            newsItems.push(this.completeNewsItem(currentItem));
        }

        return newsItems.length > 0 ? newsItems : [this.createDummyNewsItem(text, symbol)];
    }

    private completeNewsItem(partial: Partial<ChutesNewsItem>): ChutesNewsItem {
        return {
            title: partial.title || 'News Update',
            content: partial.content || 'No details available',
            url: partial.url || '',
            publishedAt: partial.publishedAt || new Date(),
            source: partial.source || 'Chutes AI',
            relevanceScore: partial.relevanceScore || 0.7,
            sentimentScore: partial.sentimentScore || 0,
            impactLevel: partial.impactLevel || 'MEDIUM'
        };
    }

    private createDummyNewsItem(content: string, symbol: string): ChutesNewsItem {
        const sentimentWords = ['bullish', 'positive', 'surge', 'gain', 'up'];
        const bearishWords = ['bearish', 'negative', 'drop', 'fall', 'down'];

        const contentLower = content.toLowerCase();
        let sentiment = 0;

        sentimentWords.forEach(word => {
            if (contentLower.includes(word)) sentiment += 0.2;
        });
        bearishWords.forEach(word => {
            if (contentLower.includes(word)) sentiment -= 0.2;
        });

        return {
            title: `${this.getCryptoName(symbol)} Market Update`,
            content: content.substring(0, 200),
            url: '',
            publishedAt: new Date(),
            source: 'Chutes AI',
            relevanceScore: 0.7,
            sentimentScore: Math.max(-1, Math.min(1, sentiment)),
            impactLevel: 'MEDIUM'
        };
    }

    private createFallbackAnalysis(symbol: string, currentPrice?: number): ChutesAnalysis {
        return {
            symbol,
            newsItems: [],
            overallSentiment: 'NEUTRAL',
            impactPrediction: {
                shortTerm: 'No recent news available for 24h prediction',
                mediumTerm: 'Insufficient data for 7-day forecast',
                longTerm: 'No significant news for long-term outlook'
            },
            keyFactors: ['No recent news available', 'Market following general crypto trends'],
            marketMovement: {
                direction: 'SIDEWAYS',
                confidence: 30,
                expectedRange: {
                    low: currentPrice ? currentPrice * 0.98 : 0,
                    high: currentPrice ? currentPrice * 1.02 : 0
                }
            },
            priceTarget: {
                bullish: currentPrice ? currentPrice * 1.05 : 0,
                bearish: currentPrice ? currentPrice * 0.95 : 0,
                neutral: currentPrice || 0
            },
            timestamp: new Date()
        };
    }

    formatAnalysisMessage(analysis: ChutesAnalysis): string {
        const sentimentEmoji = {
            'BULLISH': '🟢',
            'BEARISH': '🔴',
            'NEUTRAL': '😐'
        };

        const directionEmoji = {
            'UP': '📈',
            'DOWN': '📉',
            'SIDEWAYS': '➡️'
        };

        let message = `📰 *${analysis.symbol} News Analysis* (Powered by Chutes AI)\n\n`;

        message += `${sentimentEmoji[analysis.overallSentiment]} *Overall Sentiment:* ${analysis.overallSentiment}\n`;
        message += `${directionEmoji[analysis.marketMovement.direction]} *Expected Movement:* ${analysis.marketMovement.direction}\n`;
        message += `🎯 *Confidence:* ${analysis.marketMovement.confidence}%\n\n`;

        if (analysis.priceTarget.neutral > 0) {
            message += `💰 *Price Targets:*\n`;
            message += `  • Bullish: $${analysis.priceTarget.bullish.toFixed(2)}\n`;
            message += `  • Neutral: $${analysis.priceTarget.neutral.toFixed(2)}\n`;
            message += `  • Bearish: $${analysis.priceTarget.bearish.toFixed(2)}\n\n`;
        }

        message += `📊 *Impact Predictions:*\n`;
        message += `⏱ 24h: ${analysis.impactPrediction.shortTerm}\n`;
        message += `📅 7d: ${analysis.impactPrediction.mediumTerm}\n`;
        message += `📆 30d: ${analysis.impactPrediction.longTerm}\n\n`;

        if (analysis.keyFactors.length > 0) {
            message += `🔑 *Key Factors:*\n`;
            analysis.keyFactors.forEach((factor, idx) => {
                message += `${idx + 1}. ${factor}\n`;
            });
            message += `\n`;
        }

        if (analysis.newsItems.length > 0) {
            message += `📰 *Recent News (${analysis.newsItems.length}):*\n`;
            analysis.newsItems.slice(0, 3).forEach((item, idx) => {
                const impactEmoji = {
                    'CRITICAL': '🔥',
                    'HIGH': '⚠️',
                    'MEDIUM': 'ℹ️',
                    'LOW': '💬'
                };
                message += `\n${impactEmoji[item.impactLevel]} *${item.title}*\n`;
                message += `   ${item.content.substring(0, 100)}...\n`;
                message += `   Sentiment: ${item.sentimentScore > 0 ? '🟢' : item.sentimentScore < 0 ? '🔴' : '😐'} ${(item.sentimentScore * 100).toFixed(0)}%\n`;
            });
        }

        message += `\n⏰ Analysis Time: ${analysis.timestamp.toLocaleString()}`;

        return message;
    }

    /**
     * Analyze REAL scraped news articles + Reddit posts using Chutes AI.
     * This is more accurate than searchCryptoNews() because the AI analyzes
     * actual scraped content instead of generating its own.
     */
    async analyzeRealNews(
        symbol: string,
        articles: { title: string; summary: string; source: string; url: string }[],
        redditPosts: { title: string; subreddit: string; score: number }[],
        currentPrice?: number
    ): Promise<ChutesAnalysis> {
        if (!this.isConfigured()) {
            throw new Error('Chutes API not configured');
        }

        if (articles.length === 0 && redditPosts.length === 0) {
            return this.createFallbackAnalysis(symbol, currentPrice);
        }

        const cacheKey = this.getCacheKey(symbol, `real_news_${articles.length}_${redditPosts.length}`);
        const cached = this.getCachedData(cacheKey);
        if (cached) {
            logger.info({ symbol }, '✅ Using cached real-news analysis');
            return cached;
        }

        const cryptoName = this.getCryptoName(symbol);
        const priceContext = currentPrice ? `Current Price: $${currentPrice.toFixed(4)}` : '';

        // Build article context (max 20 articles to stay within token limit)
        const articleContext = articles.slice(0, 20).map((a, i) =>
            `[Article ${i + 1}] Source: ${a.source}\nHeadline: ${a.title}\nSummary: ${a.summary.slice(0, 200)}`
        ).join('\n\n');

        // Build Reddit context (max 10 posts)
        const redditContext = redditPosts.slice(0, 10).map((p, i) =>
            `[Reddit ${i + 1}] r/${p.subreddit} (↑${p.score}): ${p.title}`
        ).join('\n');

        const prompt = `You are an elite cryptocurrency market analyst. Analyze the following REAL scraped news and Reddit posts for ${cryptoName} (${symbol}).

${priceContext}

═══ SCRAPED NEWS ARTICLES (${articles.length} total) ═══
${articleContext || 'No articles scraped.'}

═══ REDDIT COMMUNITY POSTS (${redditPosts.length} total) ═══
${redditContext || 'No Reddit posts scraped.'}

Based ONLY on the above real data (do NOT invent news), provide:

1. Overall market sentiment (BULLISH / BEARISH / NEUTRAL)
2. Key factors driving sentiment
3. Short-term (24h), medium-term (7d), long-term (30d) impact predictions
4. Expected price movement direction and confidence
5. Price targets if current price is provided

Return JSON:
{
  "overallSentiment": "BULLISH|BEARISH|NEUTRAL",
  "impactPrediction": {
    "shortTerm": "24h prediction based on scraped news",
    "mediumTerm": "7-day outlook based on trends in articles",
    "longTerm": "30-day forecast based on fundamental factors"
  },
  "keyFactors": [
    "Key factor 1 with evidence from articles",
    "Key factor 2 with evidence",
    "Key factor 3 with evidence"
  ],
  "marketMovement": {
    "direction": "UP|DOWN|SIDEWAYS",
    "confidence": 70,
    "expectedRange": {"low": 0, "high": 0}
  },
  "priceTarget": {"bullish": 0, "bearish": 0, "neutral": 0},
  "sentiment_breakdown": {
    "news_sentiment": "BULLISH|BEARISH|NEUTRAL",
    "reddit_sentiment": "BULLISH|BEARISH|NEUTRAL",
    "dominant_themes": ["theme1", "theme2"]
  }
}`;

        try {
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: 'Qwen/Qwen3-32B',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a professional cryptocurrency analyst. Analyze only the provided real scraped news data. Do NOT invent or hallucinate news. Base all predictions strictly on the given articles and Reddit posts. Return valid JSON.'
                        },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 2000,
                    temperature: 0.1,
                    stream: false
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 120000
                }
            );

            const content = this.cleanModelResponse(response.data.choices[0].message.content);
            const parsed = JSON.parse(content);

            // Convert scraped articles to ChutesNewsItem format for compatibility
            const newsItems: ChutesNewsItem[] = articles.slice(0, 10).map(a => ({
                title: a.title,
                content: a.summary,
                url: a.url,
                publishedAt: new Date(),
                source: a.source,
                relevanceScore: 0.8,
                sentimentScore: 0,
                impactLevel: 'MEDIUM' as const
            }));

            const analysis: ChutesAnalysis = {
                symbol,
                newsItems,
                overallSentiment: parsed.overallSentiment || 'NEUTRAL',
                impactPrediction: parsed.impactPrediction || {
                    shortTerm: 'Insufficient data',
                    mediumTerm: 'Insufficient data',
                    longTerm: 'Insufficient data'
                },
                keyFactors: parsed.keyFactors || [],
                marketMovement: {
                    direction: parsed.marketMovement?.direction || 'SIDEWAYS',
                    confidence: Math.max(0, Math.min(100, parsed.marketMovement?.confidence || 50)),
                    expectedRange: parsed.marketMovement?.expectedRange || { low: 0, high: 0 }
                },
                priceTarget: parsed.priceTarget || {
                    bullish: currentPrice ? currentPrice * 1.05 : 0,
                    bearish: currentPrice ? currentPrice * 0.95 : 0,
                    neutral: currentPrice || 0
                },
                timestamp: new Date()
            };

            this.setCachedData(cacheKey, analysis);
            logger.info(`✅ Real-news AI analysis completed for ${symbol} (${articles.length} articles, ${redditPosts.length} reddit posts)`);
            return analysis;

        } catch (error: any) {
            logger.error({ err: error.message }, '❌ Chutes real-news analysis error:');
            throw new Error(`Real-news analysis failed: ${error.message}`);
        }
    }
}
