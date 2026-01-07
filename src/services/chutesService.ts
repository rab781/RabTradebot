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
            console.warn('⚠️ CHUTES_API_KEY not found in environment variables');
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
            console.log('✅ Using cached news data for', symbol);
            return cachedData;
        }

        const cryptoName = this.getCryptoName(symbol);

        // Optimized prompt for Chutes AI to fetch crypto news
        const prompt = `You are a cryptocurrency news aggregator and analyzer. Your task is to find and analyze the latest news about ${cryptoName} (${symbol}).

CRITICAL INSTRUCTIONS:
1. Search for the most recent news (last 24-48 hours) from reliable sources
2. Focus on news that directly impacts price movement
3. Include both positive and negative news for balanced analysis
4. Analyze regulatory news, partnerships, technical developments, market sentiment
5. Return structured data with sentiment scoring

For each news item, provide:
- Exact headline/title
- Brief summary (2-3 sentences focusing on price impact)
- Source credibility
- Sentiment score (-1 to 1, where -1=very bearish, 0=neutral, 1=very bullish)
- Impact level (LOW/MEDIUM/HIGH/CRITICAL)
- URL to original article if available

Format response as JSON array:
[
  {
    "title": "exact headline",
    "content": "concise summary with price implications",
    "url": "source URL",
    "publishedAt": "ISO timestamp",
    "source": "source name",
    "sentimentScore": 0.0,
    "impactLevel": "MEDIUM",
    "relevanceScore": 0.0
  }
]

Focus on:
- Price predictions from analysts
- Whale movements and large transactions
- Exchange listings/delistings
- Protocol upgrades or hard forks
- Regulatory decisions
- Major partnerships or integrations
- Market manipulation signals
- Technical analysis from credible traders
- On-chain metrics changes
- Social media sentiment shifts`;

        try {
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: "Qwen/Qwen3-32B",
                    messages: [
                        {
                            role: "system",
                            content: "You are an expert cryptocurrency market analyst specializing in news impact analysis and price prediction. Always provide accurate, structured data in JSON format."
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    max_tokens: 2000,
                    temperature: 0.3,
                    stream: false
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000000
                }
            );

            const content = this.cleanModelResponse(response.data.choices[0].message.content);
            console.log('📰 Chutes API Response received for', symbol);

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
                console.warn('⚠️ Failed to parse JSON response, extracting manually...');
                newsItems = this.extractNewsFromText(content, symbol);
            }

            // Filter and limit results
            const filteredNews = newsItems
                .filter(item => item.title && item.title.length > 10)
                .slice(0, limit);

            // Cache the results
            this.setCachedData(cacheKey, filteredNews);
            console.log(`✅ Found ${filteredNews.length} news items for ${symbol}`);

            return filteredNews;

        } catch (error: any) {
            console.error('❌ Chutes API error:', error.message);

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
            console.log('✅ Using cached analysis data for', symbol);
            return cachedData;
        }

        const cryptoName = this.getCryptoName(symbol);
        const newsContext = newsItems.map((item, idx) =>
            `[News ${idx + 1}]
Title: ${item.title}
Content: ${item.content}
Source: ${item.source}
Sentiment: ${item.sentimentScore}
Impact: ${item.impactLevel}
Published: ${item.publishedAt.toISOString()}`
        ).join('\n\n');

        const priceContext = currentPrice ? `Current ${symbol} price: $${currentPrice}` : '';

        // Advanced prompt for maximum prediction accuracy
        const analysisPrompt = `You are an elite cryptocurrency trading analyst with expertise in technical analysis, fundamental analysis, and market psychology. Analyze the following news for ${cryptoName} (${symbol}) and provide actionable trading insights.

${priceContext}

NEWS CONTEXT:
${newsContext}

ANALYSIS REQUIREMENTS:

1. SENTIMENT ANALYSIS:
- Aggregate sentiment from all news items
- Weight recent news more heavily
- Consider source credibility
- Identify sentiment shifts

2. MARKET IMPACT PREDICTION:
- SHORT TERM (24h): Immediate price reaction expected
- MEDIUM TERM (7d): Weekly trend prediction
- LONG TERM (30d): Monthly outlook

3. KEY FACTORS IDENTIFICATION:
- List 3-5 most critical factors affecting price
- Prioritize by impact magnitude
- Include both bullish and bearish factors

4. PRICE MOVEMENT PREDICTION:
- Direction: UP/DOWN/SIDEWAYS
- Confidence level (0-100%)
- Expected price range (low-high)
- Price targets for each scenario

5. TRADING RECOMMENDATIONS:
- Entry points (if bullish)
- Exit points and stop losses
- Risk/reward ratio
- Position sizing advice

CRITICAL CONSIDERATIONS:
✓ Factor in market manipulation signals
✓ Analyze whale wallet movements if mentioned
✓ Consider broader market conditions
✓ Evaluate correlation with BTC/ETH
✓ Check for FUD vs legitimate concerns
✓ Assess regulatory impact
✓ Review on-chain metrics if available

Return ONLY valid JSON in this exact format:
{
  "overallSentiment": "BULLISH|BEARISH|NEUTRAL",
  "impactPrediction": {
    "shortTerm": "detailed 24h prediction with specific expectations",
    "mediumTerm": "detailed 7d prediction with trend analysis",
    "longTerm": "detailed 30d prediction with fundamental outlook"
  },
  "keyFactors": [
    "Most important factor affecting price",
    "Second critical factor",
    "Third factor"
  ],
  "marketMovement": {
    "direction": "UP|DOWN|SIDEWAYS",
    "confidence": 75,
    "expectedRange": {
      "low": 0,
      "high": 0
    }
  },
  "priceTarget": {
    "bullish": 0,
    "bearish": 0,
    "neutral": 0
  },
  "tradingAdvice": {
    "action": "BUY|SELL|HOLD",
    "entryZone": {"low": 0, "high": 0},
    "stopLoss": 0,
    "takeProfit": [0, 0, 0],
    "riskReward": "1:3"
  }
}

Be precise, data-driven, and conservative in predictions. Quality over hype.`;

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
                    max_tokens: 2500,
                    temperature: 0.2,
                    stream: false
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000000
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
            console.log(`✅ Analysis completed for ${symbol}`);

            return analysis;

        } catch (error: any) {
            console.error('❌ Chutes analysis error:', error.message);
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
}
