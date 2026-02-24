// eslint-disable-next-line @typescript-eslint/no-var-requires
const BinanceFactory = require('node-binance-api');
import { VolumeAnalysis, SupportResistance, Candle, TimeFrame } from '../types/trading';
import { PublicCryptoService } from './publicCryptoService';

export class AdvancedAnalyzer {
  private binance: any;
  private publicService: PublicCryptoService;
  private usePublicOnly: boolean = false;

  constructor() {
    // Initialize public service first
    this.publicService = new PublicCryptoService();

    // Try to initialize private API, but don't fail if it doesn't work
    try {
      if (process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET) {
        this.binance = new BinanceFactory({
          APIKEY: process.env.BINANCE_API_KEY,
          APISECRET: process.env.BINANCE_API_SECRET,
        });
        console.log('[AdvancedAnalyzer] Private API initialized');
      } else {
        console.log('[AdvancedAnalyzer] No API credentials found, using public API only');
        this.usePublicOnly = true;
      }
    } catch (error) {
      console.warn(
        '[AdvancedAnalyzer] Failed to initialize private API, falling back to public API:',
        error
      );
      this.usePublicOnly = true;
    }
  }

  async analyzeVolume(symbol: string): Promise<VolumeAnalysis> {
    console.log(`[AdvancedAnalyzer] Starting volume analysis for ${symbol}`);

    try {
      // Prefer public API to avoid 403 errors
      let ticker: any;
      let trades: any[];

      if (this.usePublicOnly) {
        console.log(`[AdvancedAnalyzer] Using public API only for ${symbol}`);
        ticker = await this.publicService.get24hrTicker(symbol);
        trades = await this.publicService.getRecentTrades(symbol, 500);
      } else {
        try {
          // Try public API first (more reliable)
          console.log(`[AdvancedAnalyzer] Trying public API first for ${symbol}`);
          ticker = await this.publicService.get24hrTicker(symbol);
          trades = await this.publicService.getRecentTrades(symbol, 500);
          console.log(`[AdvancedAnalyzer] Used public API for volume analysis of ${symbol}`);
        } catch (publicApiError) {
          console.log(`[AdvancedAnalyzer] Public API failed for ${symbol}, trying private API...`);
          // Fallback to private API
          ticker = await this.retryApiCall(async () => {
            return await this.binance.prevDay(symbol);
          }, 2);

          // Get recent trades for volume analysis with retry mechanism
          trades = await this.retryApiCall(async () => {
            return await this.binance.trades(symbol);
          }, 2);

          console.log(
            `[AdvancedAnalyzer] Used private API fallback for volume analysis of ${symbol}`
          );
        }
      }

      console.log(`[AdvancedAnalyzer] Retrieved ticker and ${trades.length} trades for ${symbol}`);

      // Calculate volume metrics
      const volumeChange24h = parseFloat(ticker.priceChangePercent);
      const baseVolume = parseFloat(ticker.volume);

      // Calculate average volume from recent trades
      const avgVolume =
        trades.reduce((acc: number, trade: any) => acc + parseFloat(trade.qty), 0) / trades.length;
      const unusualVolume = baseVolume > avgVolume * 2;

      // Generate recommendation based on volume and price action
      let recommendation = 'NEUTRAL';
      if (unusualVolume && volumeChange24h > 0) {
        recommendation = 'STRONG BUY - High volume with price increase';
      } else if (unusualVolume && volumeChange24h < 0) {
        recommendation = 'STRONG SELL - High volume with price decrease';
      }

      return {
        symbol,
        volumeChange24h,
        volumeRank: baseVolume > avgVolume ? 1 : 2,
        unusualVolume,
        recommendation,
      };
    } catch (error: any) {
      console.error(`[AdvancedAnalyzer] Error in volume analysis for ${symbol}:`, error);
      throw new Error(
        `Failed to analyze volume for ${symbol}: ${error.message || 'Unknown error'}`
      );
    }
  }
  async findSupportResistance(symbol: string): Promise<SupportResistance> {
    console.log(`[AdvancedAnalyzer] Finding support/resistance for ${symbol}`);

    try {
      // Prefer public API first for reliability and consistency
      let candles: any[];

      try {
        console.log(`[AdvancedAnalyzer] Using public API for ${symbol} candles`);
        candles = await this.publicService.getCandlestickData(symbol, '4h', 100);
      } catch (publicError) {
        console.warn(`[AdvancedAnalyzer] Public API failed, trying private API fallback...`);
        // Fallback to private API with retry
        candles = await this.retryApiCall(async () => {
          return await this.binance.candlesticks(symbol, '4h', { limit: 100 });
        });
      }

      if (!candles || !Array.isArray(candles) || candles.length === 0) {
        throw new Error('No candle data available');
      }

      console.log(`[AdvancedAnalyzer] Retrieved ${candles.length} candles for ${symbol}`);

      const prices = candles
        .map((candle: any) => ({
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
        }))
        .filter((p) => !isNaN(p.close)); // Filter out invalid data

      if (prices.length === 0) {
        throw new Error('No valid price data extracted');
      }

      // Find support levels (look for price bounces)
      const supports = this.findLevels(prices, 'support');

      // Find resistance levels (look for price rejections)
      const resistances = this.findLevels(prices, 'resistance');

      // Get current price safely
      const lastPrice = prices[prices.length - 1];
      if (!lastPrice) {
        throw new Error('Latest price data is missing');
      }
      const currentPrice = lastPrice.close;

      // Find nearest levels
      const nearestSupport = this.findNearestLevel(currentPrice, supports, 'below');
      const nearestResistance = this.findNearestLevel(currentPrice, resistances, 'above');

      return {
        symbol,
        supports,
        resistances,
        currentPrice,
        nearestSupport,
        nearestResistance,
      };
    } catch (error: any) {
      console.error(`[AdvancedAnalyzer] Error finding support/resistance for ${symbol}:`, error);
      // Return zero values instead of crashing
      return {
        symbol,
        supports: [],
        resistances: [],
        currentPrice: 0,
        nearestSupport: 0,
        nearestResistance: 0,
      };
    }
  }

  private findLevels(prices: any[], type: 'support' | 'resistance'): number[] {
    const levels: number[] = [];
    const sensitivity = 0.02; // 2% price difference threshold

    for (let i = 1; i < prices.length - 1; i++) {
      const prev = prices[i - 1];
      const curr = prices[i];
      const next = prices[i + 1];

      if (type === 'support' && curr.low < prev.low && curr.low < next.low) {
        levels.push(curr.low);
      } else if (type === 'resistance' && curr.high > prev.high && curr.high > next.high) {
        levels.push(curr.high);
      }
    }

    // Remove duplicate levels (within sensitivity range)
    return this.consolidateLevels(levels, sensitivity);
  }

  private consolidateLevels(levels: number[], sensitivity: number): number[] {
    const consolidated: number[] = [];
    levels.sort((a, b) => a - b);

    for (const level of levels) {
      const shouldAdd = !consolidated.some(
        (existing) => Math.abs((level - existing) / existing) < sensitivity
      );
      if (shouldAdd) {
        consolidated.push(level);
      }
    }

    return consolidated;
  }

  private findNearestLevel(price: number, levels: number[], direction: 'above' | 'below'): number {
    if (levels.length === 0) return 0;

    if (direction === 'below') {
      return Math.max(...levels.filter((level) => level < price), 0);
    } else {
      return Math.min(...levels.filter((level) => level > price), Infinity);
    }
  }
  async analyzeMultipleTimeframes(symbol: string): Promise<string> {
    console.log(`[AdvancedAnalyzer] Analyzing multiple timeframes for ${symbol}`);

    try {
      const timeframes: TimeFrame[] = ['15m', '1h', '4h', '1d'];
      let analysis = `Multiple Timeframe Analysis for ${symbol}:\n`;

      for (const timeframe of timeframes) {
        console.log(`[AdvancedAnalyzer] Analyzing ${timeframe} timeframe for ${symbol}`);
        const candles = await this.retryApiCall(async () => {
          return await this.binance.candlesticks(symbol, timeframe, { limit: 30 });
        });
        const trend = this.determineTrend(candles);
        analysis += `${timeframe}: ${trend}\n`;
      }

      return analysis;
    } catch (error: any) {
      console.error(
        `[AdvancedAnalyzer] Error in multiple timeframe analysis for ${symbol}:`,
        error
      );
      throw new Error(
        `Failed to analyze timeframes for ${symbol}: ${error.message || 'Unknown error'}`
      );
    }
  }

  private determineTrend(candles: any[]): string {
    const closes = candles.map((candle) => parseFloat(candle[4]));
    const sma20 = this.calculateSMA(closes, 20);
    const lastClose = closes[closes.length - 1];
    const lastSMA = sma20[sma20.length - 1];

    if (lastClose > lastSMA) {
      return '📈 Bullish - Price above SMA20';
    } else if (lastClose < lastSMA) {
      return '📉 Bearish - Price below SMA20';
    }
    return '↔️ Sideways - Price near SMA20';
  }

  private calculateSMA(data: number[], period: number): number[] {
    const sma = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
    return sma;
  }

  private async retryApiCall<T>(apiCall: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[AdvancedAnalyzer] API call attempt ${attempt}/${maxRetries}`);
        const result = await apiCall();
        if (attempt > 1) {
          console.log(`[AdvancedAnalyzer] API call succeeded on attempt ${attempt}`);
        }
        return result;
      } catch (error: any) {
        lastError = error;
        console.error(
          `[AdvancedAnalyzer] API call failed (attempt ${attempt}/${maxRetries}):`,
          error.message || error
        );

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`[AdvancedAnalyzer] Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    console.error(`[AdvancedAnalyzer] All API call attempts failed`);
    throw lastError;
  }
}
