import axios from 'axios';

export interface PerplexityNewsItem {
    title: string;
    content: string;
    url: string;
    publishedAt: Date;
    source: string;
    relevanceScore: number;
    sentimentScore: number;
    impactLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface PerplexityAnalysis {
    symbol: string;
    newsItems: PerplexityNewsItem[];
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
    timestamp: Date;
}

export class PerplexityService {
    private apiKey: string;
    private baseUrl = 'https://api.perplexity.ai';
    private cache = new Map<string, { data: any; timestamp: number }>();
    private cacheTimeout = 10 * 60 * 1000; // 10 minutes

    constructor() {
        this.apiKey = process.env.PERPLEXITY_API_KEY || '';
        if (!this.apiKey) {
            console.warn('⚠️ PERPLEXITY_API_KEY not found in environment variables');
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

    async searchCryptoNews(symbol: string, limit: number = 10): Promise<PerplexityNewsItem[]> {
        if (!this.isConfigured()) {
            throw new Error('Perplexity API not configured');
        }

        const cacheKey = this.getCacheKey(symbol, 'news');
        const cachedData = this.getCachedData(cacheKey);
        if (cachedData) {
            console.log('Using cached news data for', symbol);
            return cachedData;
        }

        const cryptoName = this.getCryptoName(symbol);
        const query = `Latest breaking news about ${cryptoName} ${symbol} cryptocurrency price impact market analysis today`;

        try {
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: "sonar-pro",
                    messages: [
                        {
                            role: "user",
                            content: `Find and analyze the latest cryptocurrency news about ${cryptoName} (${symbol}). Please provide current market news, sentiment analysis, and potential price impact. Focus on recent developments that could affect the price.`
                        }
                    ],
                    max_tokens: 1500,
                    temperature: 0.2
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            const content = response.data.choices[0].message.content;

            // Parse JSON response
            let newsItems: PerplexityNewsItem[] = [];
            try {
                // Extract JSON array from response
                const jsonMatch = content.match(/\[[\s\S]*?\]/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    newsItems = parsed.map((item: any) => ({
                        title: item.title || 'News Update',
                        content: item.content || 'No content available',
                        url: item.url || '',
                        publishedAt: new Date(item.publishedAt || Date.now()),
                        source: item.source || 'Perplexity',
                        relevanceScore: Math.max(0, Math.min(1, item.relevanceScore || 0.5)),
                        sentimentScore: Math.max(-1, Math.min(1, item.sentimentScore || 0)),
                        impactLevel: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(item.impactLevel) ?
                                   item.impactLevel : 'MEDIUM'
                    }));
                }
            } catch (parseError) {
                console.warn('Failed to parse JSON response, extracting manually...');
                newsItems = this.extractNewsFromText(content, symbol);
            }

            // Filter and limit results
            const filteredNews = newsItems
                .filter(item => item.title && item.title.length > 10)
                .slice(0, limit);

            // Cache the results
            this.setCachedData(cacheKey, filteredNews);

            return filteredNews;

        } catch (error: any) {
            console.error('Perplexity API error:', error);

            if (error.response?.status === 401) {
                throw new Error('Invalid Perplexity API key');
            } else if (error.response?.status === 429) {
                throw new Error('Perplexity API rate limit exceeded');
            } else if (error.code === 'ECONNABORTED') {
                throw new Error('Request timeout - Perplexity API is slow');
            } else {
                throw new Error(`Perplexity API error: ${error.message}`);
            }
        }
    }

    async analyzeNewsImpact(symbol: string, newsItems: PerplexityNewsItem[]): Promise<PerplexityAnalysis> {
        if (!this.isConfigured()) {
            throw new Error('Perplexity API not configured');
        }

        if (newsItems.length === 0) {
            return this.createFallbackAnalysis(symbol);
        }

        const cacheKey = this.getCacheKey(symbol, 'analysis');
        const cachedData = this.getCachedData(cacheKey);
        if (cachedData) {
            console.log('Using cached analysis data for', symbol);
            return cachedData;
        }

        const cryptoName = this.getCryptoName(symbol);
        const newsContext = newsItems.map(item =>
            `Title: ${item.title}\nContent: ${item.content}\nSentiment: ${item.sentimentScore}\nImpact: ${item.impactLevel}`
        ).join('\n\n');

        try {
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: "sonar-pro",
                    messages: [
                        {
                            role: "system",
                            content: `You are a cryptocurrency market analyst. Analyze news impact for ${symbol} (${cryptoName}).

Return this JSON format:
{
  "overallSentiment": "BULLISH",
  "impactPrediction": {
    "shortTerm": "24h prediction",
    "mediumTerm": "7d prediction",
    "longTerm": "30d prediction"
  },
  "keyFactors": ["factor1", "factor2"],
  "marketMovement": {
    "direction": "UP",
    "confidence": 0.75,
    "expectedRange": {
      "low": -3.5,
      "high": 8.2
    }
  }
}

Use: BULLISH/BEARISH/NEUTRAL, UP/DOWN/SIDEWAYS, confidence 0.0-1.0`
                        },
                        {
                            role: "user",
                            content: `Analyze news for ${symbol}: ${newsContext.substring(0, 800)}`
                        }
                    ],
                    max_tokens: 1000,
                    temperature: 0.2
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            const content = response.data.choices[0].message.content;

            // Parse the analysis
            let analysis: any = {};
            try {
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    analysis = JSON.parse(jsonMatch[0]);
                }
            } catch (parseError) {
                console.warn('Failed to parse analysis JSON, using fallback...');
                analysis = this.parseAnalysisFromText(content, newsItems);
            }

            const result: PerplexityAnalysis = {
                symbol,
                newsItems,
                overallSentiment: this.validateSentiment(analysis.overallSentiment),
                impactPrediction: {
                    shortTerm: analysis.impactPrediction?.shortTerm || 'Insufficient data for prediction',
                    mediumTerm: analysis.impactPrediction?.mediumTerm || 'Insufficient data for prediction',
                    longTerm: analysis.impactPrediction?.longTerm || 'Insufficient data for prediction'
                },
                keyFactors: Array.isArray(analysis.keyFactors) ? analysis.keyFactors : [],
                marketMovement: {
                    direction: this.validateDirection(analysis.marketMovement?.direction),
                    confidence: Math.max(0, Math.min(1, analysis.marketMovement?.confidence || 0.5)),
                    expectedRange: {
                        low: analysis.marketMovement?.expectedRange?.low || -2,
                        high: analysis.marketMovement?.expectedRange?.high || 2
                    }
                },
                timestamp: new Date()
            };

            // Cache the results
            this.setCachedData(cacheKey, result);

            return result;

        } catch (error: any) {
            console.error('Analysis error:', error);

            if (error.response?.status === 401) {
                throw new Error('Invalid Perplexity API key');
            } else if (error.response?.status === 429) {
                throw new Error('Perplexity API rate limit exceeded');
            } else {
                throw new Error(`Analysis failed: ${error.message}`);
            }
        }
    }

    private createFallbackAnalysis(symbol: string): PerplexityAnalysis {
        return {
            symbol,
            newsItems: [],
            overallSentiment: 'NEUTRAL',
            impactPrediction: {
                shortTerm: 'No recent news found for analysis',
                mediumTerm: 'Unable to predict without news data',
                longTerm: 'Insufficient information for long-term outlook'
            },
            keyFactors: ['No recent news available', 'Market data analysis recommended'],
            marketMovement: {
                direction: 'SIDEWAYS',
                confidence: 0.3,
                expectedRange: { low: -1, high: 1 }
            },
            timestamp: new Date()
        };
    }

    private validateSentiment(sentiment: any): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
        if (typeof sentiment === 'string') {
            const upper = sentiment.toUpperCase();
            if (['BULLISH', 'BEARISH', 'NEUTRAL'].includes(upper)) {
                return upper as 'BULLISH' | 'BEARISH' | 'NEUTRAL';
            }
        }
        return 'NEUTRAL';
    }

    private validateDirection(direction: any): 'UP' | 'DOWN' | 'SIDEWAYS' {
        if (typeof direction === 'string') {
            const upper = direction.toUpperCase();
            if (['UP', 'DOWN', 'SIDEWAYS'].includes(upper)) {
                return upper as 'UP' | 'DOWN' | 'SIDEWAYS';
            }
        }
        return 'SIDEWAYS';
    }

    private getCryptoName(symbol: string): string {
        const cryptoNames: { [key: string]: string } = {
            'BTCUSDT': 'Bitcoin',
            'ETHUSDT': 'Ethereum',
            'BNBUSDT': 'Binance Coin',
            'ADAUSDT': 'Cardano',
            'DOTUSDT': 'Polkadot',
            'LINKUSDT': 'Chainlink',
            'LTCUSDT': 'Litecoin',
            'BCHUSDT': 'Bitcoin Cash',
            'XLMUSDT': 'Stellar',
            'XRPUSDT': 'Ripple',
            'SOLUSDT': 'Solana',
            'AVAXUSDT': 'Avalanche',
            'MATICUSDT': 'Polygon',
            'DOGEUSDT': 'Dogecoin',
            'SHIBUSDT': 'Shiba Inu'
        };

        return cryptoNames[symbol] || symbol.replace('USDT', '').replace('BUSD', '');
    }

    private extractNewsFromText(text: string, symbol: string): PerplexityNewsItem[] {
        // Fallback method to extract news from text if JSON parsing fails
        const lines = text.split('\n').filter(line => line.trim());
        const newsItems: PerplexityNewsItem[] = [];

        let currentTitle = '';
        let currentContent = '';

        for (let i = 0; i < lines.length && newsItems.length < 5; i++) {
            const line = lines[i].trim();

            // Look for titles (usually start with numbers or bullets)
            if (line.match(/^[\d\.\-\*\•]/) || line.length > 30) {
                if (currentTitle) {
                    newsItems.push({
                        title: currentTitle.substring(0, 120),
                        content: currentContent || 'Content extracted from Perplexity analysis',
                        url: '',
                        publishedAt: new Date(),
                        source: 'Perplexity',
                        relevanceScore: 0.7,
                        sentimentScore: this.extractSentimentFromText(currentTitle + ' ' + currentContent),
                        impactLevel: 'MEDIUM'
                    });
                }

                currentTitle = line.replace(/^[\d\.\-\*\•\s]+/, '');
                currentContent = lines[i + 1] || '';
            }
        }

        // Add the last item
        if (currentTitle && newsItems.length < 5) {
            newsItems.push({
                title: currentTitle.substring(0, 120),
                content: currentContent || 'Content extracted from Perplexity analysis',
                url: '',
                publishedAt: new Date(),
                source: 'Perplexity',
                relevanceScore: 0.7,
                sentimentScore: this.extractSentimentFromText(currentTitle + ' ' + currentContent),
                impactLevel: 'MEDIUM'
            });
        }

        return newsItems;
    }

    private extractSentimentFromText(text: string): number {
        const bullishWords = ['bull', 'surge', 'rally', 'pump', 'moon', 'breakout', 'adoption', 'positive', 'gain'];
        const bearishWords = ['bear', 'crash', 'dump', 'fall', 'drop', 'decline', 'negative', 'loss', 'fear'];

        const textLower = text.toLowerCase();
        let score = 0;

        bullishWords.forEach(word => {
            if (textLower.includes(word)) score += 0.2;
        });

        bearishWords.forEach(word => {
            if (textLower.includes(word)) score -= 0.2;
        });

        return Math.max(-1, Math.min(1, score));
    }

    private parseAnalysisFromText(text: string, newsItems: PerplexityNewsItem[]): any {
        // Fallback parsing method
        const avgSentiment = newsItems.reduce((sum, item) => sum + item.sentimentScore, 0) / newsItems.length;

        return {
            overallSentiment: avgSentiment > 0.2 ? 'BULLISH' : avgSentiment < -0.2 ? 'BEARISH' : 'NEUTRAL',
            impactPrediction: {
                shortTerm: 'Analysis based on extracted news sentiment',
                mediumTerm: 'Medium-term outlook depends on news developments',
                longTerm: 'Long-term analysis requires manual review'
            },
            keyFactors: newsItems.slice(0, 3).map(item => item.title.substring(0, 50)),
            marketMovement: {
                direction: avgSentiment > 0.1 ? 'UP' : avgSentiment < -0.1 ? 'DOWN' : 'SIDEWAYS',
                confidence: 0.6,
                expectedRange: { low: avgSentiment * -5, high: avgSentiment * 5 }
            }
        };
    }

    getCacheStats(): { size: number; oldestEntry: number } {
        let oldestEntry = 0;
        for (const cached of this.cache.values()) {
            const age = Date.now() - cached.timestamp;
            if (age > oldestEntry) {
                oldestEntry = age;
            }
        }

        return {
            size: this.cache.size,
            oldestEntry: oldestEntry / 1000 // in seconds
        };
    }

    clearCache(): void {
        this.cache.clear();
    }
}
