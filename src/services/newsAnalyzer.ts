import axios from 'axios';
import * as cheerio from 'cheerio';
import { ChutesService, ChutesAnalysis } from './chutesService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewsItem {
    title: string;
    url: string;
    source: string;
    publishedAt: Date;
    summary: string;
}

export interface RedditPost {
    title: string;
    url: string;
    subreddit: string;
    score: number;
    numComments: number;
    createdAt: Date;
}

export interface NewsAnalysisResult {
    symbol: string;
    timestamp: Date;
    /** Backward-compatible shape — articles now use NewsItem instead of cryptocompare's NewsArticle */
    traditionalNews: {
        articles: NewsItem[];
        sentiment: string;
        score: number;
    };
    redditSentiment: {
        posts: RedditPost[];
        score: number;
        label: string;
    };
    combinedSentiment: {
        score: number;
        label: string;
        confidence: number;
    };
    summary: string;
    /** AI-powered deep analysis from Chutes (only present when ChutesService is configured) */
    aiAnalysis?: ChutesAnalysis;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const RSS_SOURCES = [
    { url: 'https://cointelegraph.com/rss',                    name: 'CoinTelegraph' },
    { url: 'https://decrypt.co/feed',                          name: 'Decrypt'       },
    { url: 'https://cryptoslate.com/feed/',                    name: 'CryptoSlate'   },
    { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',  name: 'CoinDesk'      },
];

// Per-coin subreddit mapping
const COIN_SUBREDDITS: Record<string, string> = {
    BTC:  'Bitcoin',
    ETH:  'ethereum',
    SOL:  'solana',
    BNB:  'binance',
    XRP:  'Ripple',
    DOGE: 'dogecoin',
    ADA:  'cardano',
    DOT:  'dot',
    MATIC:'0xPolygon',
    AVAX: 'Avax',
};

const POSITIVE_WORDS = ['surge', 'bull', 'up', 'gain', 'positive', 'rise', 'growth', 'bullish',
    'breakthrough', 'support', 'adoption', 'partnership', 'record', 'rally', 'soar',
    'recover', 'inflow', 'buy', 'high', 'profit', 'win', 'moon', 'pump'];
const NEGATIVE_WORDS = ['crash', 'bear', 'down', 'loss', 'negative', 'fall', 'decline', 'bearish',
    'resistance', 'ban', 'hack', 'scam', 'fraud', 'fear', 'dump', 'sell', 'outflow',
    'warning', 'collapse', 'suspect', 'penalty', 'fine', 'low', 'panic'];

// ─── Class ────────────────────────────────────────────────────────────────────

export class NewsAnalyzer {
    private cryptoPanicKey: string | null;
    private chutesService: ChutesService | null;

    constructor(chutesService?: ChutesService) {
        this.cryptoPanicKey = process.env.CRYPTOPANIC_API_KEY || null;
        this.chutesService = chutesService || null;
    }

    /** Inject ChutesService after construction (e.g. from bot init order) */
    setChutesService(chutesService: ChutesService) {
        this.chutesService = chutesService;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    async analyzeNews(symbol: string): Promise<string> {
        const result = await this.analyzeComprehensiveNews(symbol);
        return this.formatBasicAnalysis(result);
    }

    async analyzeComprehensiveNews(symbol: string, currentPrice?: number): Promise<NewsAnalysisResult> {
        const coinName = this.getBaseCurrency(symbol);

        const [rssResult, redditResult, cryptoPanicResult] = await Promise.allSettled([
            this.fetchRSSFeeds(coinName),
            this.fetchReddit(coinName),
            this.fetchCryptoPanic(coinName),
        ]);

        const articles: NewsItem[] = [
            ...(rssResult.status         === 'fulfilled' ? rssResult.value         : []),
            ...(cryptoPanicResult.status === 'fulfilled' ? cryptoPanicResult.value : []),
        ];
        const reddit: RedditPost[] = redditResult.status === 'fulfilled' ? redditResult.value : [];

        const newsScore   = this.scoreTexts(articles.map(a => a.title + ' ' + a.summary));
        const redditScore = this.scoreReddit(reddit);

        const combinedScore = articles.length > 0 && reddit.length > 0
            ? newsScore * 0.6 + redditScore * 0.4
            : articles.length > 0 ? newsScore : redditScore;

        const confidence = Math.min(
            Math.abs(combinedScore) * 10 + (articles.length + reddit.length) * 1.5,
            90
        );

        // If Chutes AI is configured, send REAL scraped data for deep analysis
        let aiAnalysis: ChutesAnalysis | undefined;
        if (this.chutesService?.isConfigured() && (articles.length > 0 || reddit.length > 0)) {
            try {
                console.log(`🤖 [NewsAnalyzer] Sending ${articles.length} articles + ${reddit.length} reddit posts to Chutes AI for ${symbol}...`);
                aiAnalysis = await this.chutesService.analyzeRealNews(
                    symbol,
                    articles.map(a => ({ title: a.title, summary: a.summary, source: a.source, url: a.url })),
                    reddit.map(p => ({ title: p.title, subreddit: p.subreddit, score: p.score })),
                    currentPrice
                );
                console.log(`✅ [NewsAnalyzer] Chutes AI analysis done for ${symbol}: ${aiAnalysis.overallSentiment}`);
            } catch (err: any) {
                console.warn(`⚠️ [NewsAnalyzer] Chutes AI analysis skipped: ${err.message}`);
            }
        }

        return {
            symbol,
            timestamp: new Date(),
            traditionalNews: {
                articles,
                sentiment: this.sentimentLabel(newsScore),
                score: newsScore,
            },
            redditSentiment: {
                posts: reddit,
                score: redditScore,
                label: this.sentimentLabel(redditScore),
            },
            combinedSentiment: {
                score: combinedScore,
                label: this.sentimentLabel(combinedScore),
                confidence,
            },
            summary: this.buildSummary(symbol, articles.length, reddit.length, combinedScore, confidence),
            aiAnalysis,
        };
    }

    formatBasicAnalysis(result: NewsAnalysisResult): string {
        let out = `📰 News Analysis for ${result.symbol}:\n\n`;

        if (result.traditionalNews.articles.length > 0) {
            out += `🔹 NEWS ARTICLES (${result.traditionalNews.articles.length} found):\n`;
            out += `Sentiment: ${result.traditionalNews.sentiment}\n\n`;
            out += `Top Headlines:\n`;
            result.traditionalNews.articles.slice(0, 5).forEach(a => {
                out += `• [${a.source}] ${a.title}\n`;
            });
        } else {
            out += `🔹 NEWS: No significant news found\n`;
        }

        if (result.redditSentiment.posts.length > 0) {
            out += `\n🔹 REDDIT SENTIMENT (${result.redditSentiment.posts.length} posts):\n`;
            out += `Community Mood: ${result.redditSentiment.label}\n\n`;
            out += `Top Discussions:\n`;
            result.redditSentiment.posts.slice(0, 3).forEach(p => {
                out += `• [r/${p.subreddit}] ${p.title} (↑${p.score})\n`;
            });
        }

        // If AI analysis is available, show it prominently instead of keyword-based sentiment
        if (result.aiAnalysis) {
            const ai = result.aiAnalysis;
            const sentEmoji = ai.overallSentiment === 'BULLISH' ? '🟢' : ai.overallSentiment === 'BEARISH' ? '🔴' : '🟡';
            const dirEmoji  = ai.marketMovement.direction === 'UP' ? '📈' : ai.marketMovement.direction === 'DOWN' ? '📉' : '➡️';
            out += `\n🤖 AI ANALYSIS (Chutes — based on ${result.traditionalNews.articles.length} real articles + ${result.redditSentiment.posts.length} Reddit posts):\n`;
            out += `${sentEmoji} Overall: ${ai.overallSentiment}  ${dirEmoji} Direction: ${ai.marketMovement.direction} (${ai.marketMovement.confidence}% confidence)\n\n`;
            out += `📋 Key Factors:\n`;
            ai.keyFactors.slice(0, 3).forEach((f, i) => { out += `${i + 1}. ${f}\n`; });
            out += `\n⏰ Impact:\n`;
            out += `• 24h: ${ai.impactPrediction.shortTerm}\n`;
            out += `• 7d:  ${ai.impactPrediction.mediumTerm}\n`;
            out += `• 30d: ${ai.impactPrediction.longTerm}\n`;
        } else {
            out += `\n🎯 COMBINED SENTIMENT: ${result.combinedSentiment.label}\n`;
            out += `Confidence: ${result.combinedSentiment.confidence.toFixed(1)}%\n`;
        }

        return out;
    }

    // ── Fetchers ──────────────────────────────────────────────────────────────

    private async fetchRSSFeeds(coinName: string): Promise<NewsItem[]> {
        const settled = await Promise.allSettled(
            RSS_SOURCES.map(s => this.fetchSingleRSS(s.url, s.name, coinName))
        );
        const articles: NewsItem[] = [];
        for (const r of settled) {
            if (r.status === 'fulfilled') articles.push(...r.value);
        }
        return articles
            .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
            .slice(0, 25);
    }

    private async fetchSingleRSS(url: string, sourceName: string, coinName: string): Promise<NewsItem[]> {
        const response = await axios.get(url, {
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CryptoBot/1.0)' },
        });

        const $ = cheerio.load(response.data, { xmlMode: true });
        const articles: NewsItem[] = [];
        const coinLower = coinName.toLowerCase();

        $('item').each((_, el) => {
            const title = $(el).find('title').first().text().trim();
            if (!title) return;

            const link      = $(el).find('link').first().text().trim()
                           || $(el).find('link').attr('href')
                           || '';
            const pubDate   = $(el).find('pubDate').first().text().trim();
            const rawDesc   = $(el).find('description').first().text();
            const summary   = rawDesc.replace(/<[^>]*>/g, '').trim().slice(0, 300);

            const text = (title + ' ' + summary).toLowerCase();
            // Include if coin-specific OR general crypto content
            if (text.includes(coinLower) || text.includes('crypto') || text.includes('bitcoin') || text.includes('blockchain')) {
                articles.push({
                    title,
                    url: link,
                    source: sourceName,
                    publishedAt: pubDate ? new Date(pubDate) : new Date(),
                    summary,
                });
            }
        });

        return articles;
    }

    private async fetchReddit(coinName: string): Promise<RedditPost[]> {
        const coinUpper = coinName.toUpperCase();
        const specificSub = COIN_SUBREDDITS[coinUpper];
        const subreddits = specificSub
            ? [specificSub, 'CryptoCurrency', 'CryptoMarkets']
            : ['CryptoCurrency', 'CryptoMarkets'];

        const settled = await Promise.allSettled(
            subreddits.map(sub => this.fetchSubreddit(sub, coinName))
        );

        const posts: RedditPost[] = [];
        for (const r of settled) {
            if (r.status === 'fulfilled') posts.push(...r.value);
        }

        // Deduplicate by URL
        const seen = new Set<string>();
        return posts
            .filter(p => { if (seen.has(p.url)) return false; seen.add(p.url); return true; })
            .sort((a, b) => b.score - a.score)
            .slice(0, 15);
    }

    private async fetchSubreddit(subreddit: string, coinName: string): Promise<RedditPost[]> {
        const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(coinName)}&sort=hot&limit=10&t=day`;
        const response = await axios.get(url, {
            timeout: 8000,
            headers: {
                'User-Agent': 'CryptoNewsBot/1.0 (by /u/cryptobot)',
                'Accept': 'application/json',
            },
        });

        const children: any[] = response.data?.data?.children || [];
        return children.map(c => ({
            title:       c.data.title,
            url:         `https://reddit.com${c.data.permalink}`,
            subreddit:   c.data.subreddit,
            score:       c.data.score        || 0,
            numComments: c.data.num_comments || 0,
            createdAt:   new Date(c.data.created_utc * 1000),
        }));
    }

    /** Optional: CryptoPanic free tier — set CRYPTOPANIC_API_KEY in .env */
    private async fetchCryptoPanic(coinName: string): Promise<NewsItem[]> {
        if (!this.cryptoPanicKey) return [];

        const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${this.cryptoPanicKey}&currencies=${coinName.toUpperCase()}&public=true&kind=news`;
        const response = await axios.get(url, { timeout: 8000 });
        const results: any[] = response.data?.results || [];

        return results.map(item => ({
            title:       item.title,
            url:         item.url,
            source:      `CryptoPanic/${item.domain || 'unknown'}`,
            publishedAt: new Date(item.published_at),
            summary:     item.title,
        }));
    }

    // ── Sentiment Helpers ─────────────────────────────────────────────────────

    private scoreTexts(texts: string[]): number {
        let score = 0;
        for (const text of texts) {
            const t = text.toLowerCase();
            for (const w of POSITIVE_WORDS) if (t.includes(w)) score += 1;
            for (const w of NEGATIVE_WORDS) if (t.includes(w)) score -= 1;
        }
        return score;
    }

    private scoreReddit(posts: RedditPost[]): number {
        let score = 0;
        for (const post of posts) {
            const t      = post.title.toLowerCase();
            const weight = Math.log2(Math.max(post.score, 1) + 1);
            for (const w of POSITIVE_WORDS) if (t.includes(w)) score += weight;
            for (const w of NEGATIVE_WORDS) if (t.includes(w)) score -= weight;
        }
        return score;
    }

    private sentimentLabel(score: number): string {
        if (score >  5) return '🟢 Very Positive';
        if (score >  0) return '🟡 Slightly Positive';
        if (score < -5) return '🔴 Very Negative';
        if (score <  0) return '🟠 Slightly Negative';
        return '⚪ Neutral';
    }

    // ── Misc ──────────────────────────────────────────────────────────────────

    private buildSummary(symbol: string, newsCount: number, redditCount: number, score: number, confidence: number): string {
        return [
            `📊 News Analysis for ${symbol}`,
            `📰 News articles: ${newsCount}`,
            `🗣️  Reddit posts:  ${redditCount}`,
            `🎯 Sentiment:     ${this.sentimentLabel(score)}`,
            `📈 Confidence:    ${confidence.toFixed(1)}%`,
            `⏰ ${new Date().toLocaleString()}`,
        ].join('\n');
    }

    private getBaseCurrency(symbol: string): string {
        return symbol.replace(/USDT$|USD$|BUSD$|BTC$|ETH$/, '');
    }
}
