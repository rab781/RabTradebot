/**
 * Advanced Sentiment Service
 * Enhanced sentiment analysis using natural language processing
 */

import { SentimentResult, NewsAnalysis } from '../types/mlTypes';
import natural from 'natural';

// Define sentiment types since @types/sentiment doesn't exist
interface SentimentAnalyzer {
  analyze(text: string, options?: any): {
    score: number;
    comparative: number;
    tokens: string[];
    words: string[];
    positive: string[];
    negative: string[];
  };
  registerLanguage(name: string, lexicon: { [key: string]: number }): void;
}

// Import sentiment as any to avoid type issues
const Sentiment = require('sentiment');

export class AdvancedSentimentService {
  private sentimentAnalyzer: SentimentAnalyzer;
  private tokenizer: any;
  private cache: Map<string, SentimentResult & { cachedAt: Date }> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes

  // Financial sentiment lexicon for crypto
  private cryptoLexicon: { [key: string]: number } = {
    // Positive
    'moon': 3, 'bullish': 2, 'pump': 2, 'hodl': 1, 'buy': 2,
    'profit': 2, 'gains': 2, 'rally': 2, 'surge': 2, 'breakthrough': 2,
    'adoption': 1, 'partnership': 1, 'upgrade': 1, 'innovation': 1,
    'institutional': 1, 'mainstream': 1, 'regulation': 1,

    // Negative
    'dump': -2, 'bearish': -2, 'crash': -3, 'sell': -2, 'loss': -2,
    'fear': -2, 'panic': -3, 'fud': -2, 'scam': -3, 'hack': -3,
    'ban': -3, 'bubble': -2, 'correction': -1, 'volatile': -1,
    'manipulation': -2, 'whale': -1, 'resistance': -1,

    // Neutral but important
    'analysis': 0, 'technical': 0, 'support': 0, 'fibonacci': 0,
    'volume': 0, 'liquidity': 0, 'market': 0, 'trading': 0
  };

  constructor() {
    this.sentimentAnalyzer = new Sentiment();

    // Initialize tokenizer
    this.tokenizer = new natural.WordTokenizer();

    console.log('💭 Advanced Sentiment Service initialized');
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return true; // No external APIs required for basic sentiment
  }

  /**
   * Analyze sentiment for a cryptocurrency
   */
  async analyzeSentiment(
    symbol: string,
    texts: string[],
    includeNews: boolean = false
  ): Promise<SentimentResult> {
    const cacheKey = `${symbol}_${includeNews}_${texts.length}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (Date.now() - cached.cachedAt.getTime() < this.CACHE_TTL) {
        // Return the sentiment result without the cachedAt property
        const { cachedAt, ...result } = cached;
        return result;
      }
    }

    try {
      // Analyze each text
      const analyses = texts.map(text => this.analyzeSingleText(text));

      // Calculate aggregate sentiment
      const overallSentiment = this.calculateOverallSentiment(analyses);
      const sentimentStrength = this.calculateSentimentStrength(analyses);

      // Separate news and social sentiment
      const newsSentiment = includeNews ?
        this.calculateNewsSentiment(analyses.slice(0, Math.floor(analyses.length / 2))) : 0;
      const socialSentiment = this.calculateSocialSentiment(analyses);

      // Extract key phrases
      const keyPhrases = this.extractKeyPhrases(texts);

      // Determine sentiment trend
      const sentimentTrend = this.determineSentimentTrend(overallSentiment, sentimentStrength);

      const result: SentimentResult = {
        symbol,
        overall_sentiment: overallSentiment,
        sentiment_strength: sentimentStrength,
        news_sentiment: newsSentiment,
        social_sentiment: socialSentiment,
        sources: {
          news_articles: includeNews ? Math.floor(texts.length / 2) : 0,
          social_posts: texts.length,
          analysis_date: new Date()
        },
        key_phrases: keyPhrases,
        sentiment_trend: sentimentTrend
      };

      // Cache result
      this.cache.set(cacheKey, { ...result, cachedAt: new Date() });

      // Clean up old cache entries
      this.cleanupCache();

      console.log(`💭 Sentiment analysis for ${symbol}:`, {
        overall: overallSentiment.toFixed(3),
        trend: sentimentTrend,
        strength: sentimentStrength.toFixed(3)
      });

      return result;

    } catch (error) {
      console.error(`❌ Sentiment analysis failed for ${symbol}:`, error);

      // Return neutral sentiment on error
      return {
        symbol,
        overall_sentiment: 0,
        sentiment_strength: 0,
        news_sentiment: 0,
        social_sentiment: 0,
        sources: {
          news_articles: 0,
          social_posts: 0,
          analysis_date: new Date()
        },
        key_phrases: [],
        sentiment_trend: 'neutral'
      };
    }
  }

  /**
   * Analyze sentiment of a single text
   */
  private analyzeSingleText(text: string): {
    score: number;
    comparative: number;
    tokens: string[];
    words: string[];
    positive: string[];
    negative: string[];
  } {
    // Clean and preprocess text
    const cleanText = this.preprocessText(text);

    // Analyze with standard sentiment (no custom language)
    const result = this.sentimentAnalyzer.analyze(cleanText);

    return result;
  }

  /**
   * Preprocess text for better sentiment analysis
   */
  private preprocessText(text: string): string {
    // Convert to lowercase
    let clean = text.toLowerCase();

    // Remove URLs
    clean = clean.replace(/https?:\/\/[^\s]+/g, '');

    // Remove special characters but keep important crypto symbols
    clean = clean.replace(/[^\w\s$@#]/g, ' ');

    // Remove extra whitespace
    clean = clean.replace(/\s+/g, ' ').trim();

    // Handle crypto-specific terms
    clean = clean.replace(/\bto the moon\b/g, 'moon');
    clean = clean.replace(/\bdiamond hands\b/g, 'hodl');
    clean = clean.replace(/\bpaper hands\b/g, 'sell');
    clean = clean.replace(/\bfear uncertainty doubt\b/g, 'fud');

    return clean;
  }

  /**
   * Calculate overall sentiment from multiple analyses
   */
  private calculateOverallSentiment(analyses: any[]): number {
    if (analyses.length === 0) return 0;

    // Weight more recent/longer texts higher
    let weightedSum = 0;
    let totalWeight = 0;

    analyses.forEach((analysis, index) => {
      const weight = Math.log(analysis.tokens.length + 1); // Length-based weight
      weightedSum += analysis.comparative * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Calculate sentiment strength (confidence)
   */
  private calculateSentimentStrength(analyses: any[]): number {
    if (analyses.length === 0) return 0;

    const scores = analyses.map(a => Math.abs(a.comparative));
    const avgAbsScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    // Normalize to 0-1 range
    return Math.min(1, avgAbsScore * 2);
  }

  /**
   * Calculate news-specific sentiment
   */
  private calculateNewsSentiment(newsAnalyses: any[]): number {
    if (newsAnalyses.length === 0) return 0;

    // News sentiment tends to be more formal, weight accordingly
    const newsScores = newsAnalyses.map(a => a.comparative * 1.2); // Slight boost for news
    return newsScores.reduce((sum, score) => sum + score, 0) / newsScores.length;
  }

  /**
   * Calculate social media sentiment
   */
  private calculateSocialSentiment(analyses: any[]): number {
    if (analyses.length === 0) return 0;

    // Social sentiment tends to be more emotional/extreme
    const socialScores = analyses.map(a => a.comparative);
    return socialScores.reduce((sum, score) => sum + score, 0) / socialScores.length;
  }

  /**
   * Extract key phrases from texts
   */
  private extractKeyPhrases(texts: string[]): string[] {
    const allWords: string[] = [];
    const phrases: { [key: string]: number } = {};

    texts.forEach(text => {
      const tokens = this.tokenizer.tokenize(this.preprocessText(text));
      allWords.push(...tokens);

      // Extract 2-3 word phrases
      for (let i = 0; i < tokens.length - 1; i++) {
        // 2-word phrases
        const phrase2 = `${tokens[i]} ${tokens[i + 1]}`;
        if (this.isImportantPhrase(phrase2)) {
          phrases[phrase2] = (phrases[phrase2] || 0) + 1;
        }

        // 3-word phrases
        if (i < tokens.length - 2) {
          const phrase3 = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
          if (this.isImportantPhrase(phrase3)) {
            phrases[phrase3] = (phrases[phrase3] || 0) + 1;
          }
        }
      }
    });

    // Get top phrases by frequency
    return Object.entries(phrases)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([phrase]) => phrase);
  }

  /**
   * Check if phrase is important for crypto sentiment
   */
  private isImportantPhrase(phrase: string): boolean {
    const words = phrase.split(' ');

    // Must contain at least one crypto-relevant word
    const hasCryptoWord = words.some(word =>
      word in this.cryptoLexicon ||
      ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'blockchain', 'defi'].includes(word)
    );

    // Must be longer than 2 characters per word on average
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;

    return hasCryptoWord && avgWordLength > 2;
  }

  /**
   * Determine sentiment trend
   */
  private determineSentimentTrend(
    overallSentiment: number,
    sentimentStrength: number
  ): 'bullish' | 'bearish' | 'neutral' {
    if (sentimentStrength < 0.3) return 'neutral';

    if (overallSentiment > 0.1) return 'bullish';
    if (overallSentiment < -0.1) return 'bearish';

    return 'neutral';
  }

  /**
   * Analyze news articles specifically
   */
  async analyzeNewsArticles(articles: NewsAnalysis[]): Promise<SentimentResult> {
    const texts = articles.map(article => `${article.title} ${article.content}`);

    const result = await this.analyzeSentiment('NEWS', texts, true);

    // Add news-specific enhancements
    result.sources.news_articles = articles.length;

    return result;
  }

  /**
   * Get sentiment for multiple symbols
   */
  async analyzeBulkSentiment(
    symbolTexts: { [symbol: string]: string[] }
  ): Promise<{ [symbol: string]: SentimentResult }> {
    const results: { [symbol: string]: SentimentResult } = {};

    for (const [symbol, texts] of Object.entries(symbolTexts)) {
      try {
        results[symbol] = await this.analyzeSentiment(symbol, texts);
      } catch (error) {
        console.error(`❌ Bulk sentiment analysis failed for ${symbol}:`, error);
      }
    }

    return results;
  }

  /**
   * Update crypto lexicon
   */
  updateCryptoLexicon(additions: { [key: string]: number }): void {
    this.cryptoLexicon = { ...this.cryptoLexicon, ...additions };
    this.sentimentAnalyzer.registerLanguage('crypto', this.cryptoLexicon);
    console.log('📝 Crypto lexicon updated with', Object.keys(additions).length, 'new terms');
  }

  /**
   * Get lexicon statistics
   */
  getLexiconStats(): { total: number; positive: number; negative: number; neutral: number } {
    const entries = Object.values(this.cryptoLexicon);

    return {
      total: entries.length,
      positive: entries.filter(score => score > 0).length,
      negative: entries.filter(score => score < 0).length,
      neutral: entries.filter(score => score === 0).length
    };
  }

  /**
   * Clean up old cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, result] of this.cache.entries()) {
      if (now - result.cachedAt.getTime() > this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; memoryUsage: string } {
    const memoryUsage = `${(JSON.stringify([...this.cache.entries()]).length / 1024).toFixed(2)} KB`;

    return {
      size: this.cache.size,
      memoryUsage
    };
  }

  /**
   * Clear sentiment cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🧹 Sentiment cache cleared');
  }
}
