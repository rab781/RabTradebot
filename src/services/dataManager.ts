import { DataFrame, OHLCVCandle, DataFrameBuilder } from '../types/dataframe';
import axios from 'axios';

export interface HistoricalDataConfig {
  symbol: string;
  timeframe: string;
  startDate: Date;
  endDate: Date;
  limit?: number;
}

export class DataManager {
  private baseUrl = 'https://api.binance.com/api/v3';
  private dataCache = new Map<string, OHLCVCandle[]>();

  constructor() {}

  async downloadHistoricalData(config: HistoricalDataConfig): Promise<OHLCVCandle[]> {
    const cacheKey = `${config.symbol}_${config.timeframe}_${config.startDate.getTime()}_${config.endDate.getTime()}`;

    // Check cache first
    if (this.dataCache.has(cacheKey)) {
      console.log(`Retrieved cached data for ${config.symbol}`);
      return this.dataCache.get(cacheKey)!;
    }

    console.log(
      `Downloading historical data for ${config.symbol} from ${config.startDate} to ${config.endDate}`
    );

    try {
      const interval = this.convertTimeframeToInterval(config.timeframe);
      const startTime = config.startDate.getTime();
      const endTime = config.endDate.getTime();
      const limit = config.limit || 1000;

      const allCandles: OHLCVCandle[] = [];
      let currentStartTime = startTime;

      // Download data in chunks if date range is large
      while (currentStartTime < endTime) {
        const response = await axios.get(`${this.baseUrl}/klines`, {
          params: {
            symbol: config.symbol,
            interval: interval,
            startTime: currentStartTime,
            endTime: endTime,
            limit: limit,
          },
        });

        const rawCandles = response.data;
        if (!rawCandles || rawCandles.length === 0) {
          break;
        }

        const candles: OHLCVCandle[] = rawCandles.map((candle: any[]) => ({
          timestamp: candle[0],
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5]),
          date: new Date(candle[0]),
        }));

        allCandles.push(...candles);

        // Update start time for next chunk
        const lastCandle = candles[candles.length - 1];
        currentStartTime = lastCandle.timestamp + this.getTimeframeMs(config.timeframe);

        // Rate limiting
        await this.sleep(100);
      }

      // Filter by exact date range
      const filteredCandles = allCandles.filter(
        (candle) => candle.date >= config.startDate && candle.date <= config.endDate
      );

      // Cache the result
      this.dataCache.set(cacheKey, filteredCandles);

      console.log(`Downloaded ${filteredCandles.length} candles for ${config.symbol}`);
      return filteredCandles;
    } catch (error) {
      console.error(`Error downloading data for ${config.symbol}:`, error);
      throw error;
    }
  }

  async getRecentData(
    symbol: string,
    timeframe: string,
    limit: number = 100
  ): Promise<OHLCVCandle[]> {
    try {
      const interval = this.convertTimeframeToInterval(timeframe);

      const response = await axios.get(`${this.baseUrl}/klines`, {
        params: {
          symbol: symbol,
          interval: interval,
          limit: limit,
        },
      });

      const rawCandles = response.data;
      const candles: OHLCVCandle[] = rawCandles.map((candle: any[]) => ({
        timestamp: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
        date: new Date(candle[0]),
      }));

      return candles;
    } catch (error) {
      console.error(`Error fetching recent data for ${symbol}:`, error);
      throw error;
    }
  }

  convertToDataFrame(candles: OHLCVCandle[]): DataFrame {
    return DataFrameBuilder.fromCandles(candles);
  }

  private convertTimeframeToInterval(timeframe: string): string {
    const mapping: { [key: string]: string } = {
      '1m': '1m',
      '3m': '3m',
      '5m': '5m',
      '15m': '15m',
      '30m': '30m',
      '1h': '1h',
      '2h': '2h',
      '4h': '4h',
      '6h': '6h',
      '8h': '8h',
      '12h': '12h',
      '1d': '1d',
      '3d': '3d',
      '1w': '1w',
      '1M': '1M',
    };

    if (!mapping[timeframe]) {
      throw new Error(`Unsupported timeframe: ${timeframe}`);
    }

    return mapping[timeframe];
  }

  private getTimeframeMs(timeframe: string): number {
    const mapping: { [key: string]: number } = {
      '1m': 60 * 1000,
      '3m': 3 * 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '2h': 2 * 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '8h': 8 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
      '1M': 30 * 24 * 60 * 60 * 1000, // Approximation
    };

    return mapping[timeframe] || 60 * 1000;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Utility methods for data analysis
  getDataSummary(candles: OHLCVCandle[]): {
    count: number;
    startDate: Date;
    endDate: Date;
    priceRange: { min: number; max: number };
    avgVolume: number;
  } {
    if (candles.length === 0) {
      throw new Error('No candles provided');
    }

    const prices = candles.flatMap((c) => [c.open, c.high, c.low, c.close]);
    const volumes = candles.map((c) => c.volume);

    return {
      count: candles.length,
      startDate: candles[0].date,
      endDate: candles[candles.length - 1].date,
      priceRange: {
        min: Math.min(...prices),
        max: Math.max(...prices),
      },
      avgVolume: volumes.reduce((sum, v) => sum + v, 0) / volumes.length,
    };
  }

  validateDataQuality(candles: OHLCVCandle[]): {
    isValid: boolean;
    issues: string[];
    gaps: { index: number; expectedTime: number; actualTime: number }[];
  } {
    const issues: string[] = [];
    const gaps: { index: number; expectedTime: number; actualTime: number }[] = [];

    if (candles.length === 0) {
      return { isValid: false, issues: ['No data provided'], gaps: [] };
    }

    // Check for basic data integrity
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];

      // Check for invalid OHLC relationships
      if (candle.high < candle.low) {
        issues.push(`Invalid OHLC at index ${i}: high (${candle.high}) < low (${candle.low})`);
      }

      if (candle.high < candle.open || candle.high < candle.close) {
        issues.push(`Invalid OHLC at index ${i}: high is not the highest price`);
      }

      if (candle.low > candle.open || candle.low > candle.close) {
        issues.push(`Invalid OHLC at index ${i}: low is not the lowest price`);
      }

      // Check for zero or negative values
      if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0) {
        issues.push(`Invalid prices at index ${i}: zero or negative values`);
      }

      if (candle.volume < 0) {
        issues.push(`Invalid volume at index ${i}: negative volume`);
      }
    }

    // Check for time gaps (assuming consistent timeframe)
    if (candles.length > 1) {
      const timeInterval = candles[1].timestamp - candles[0].timestamp;

      for (let i = 1; i < candles.length; i++) {
        const expectedTime = candles[i - 1].timestamp + timeInterval;
        const actualTime = candles[i].timestamp;

        if (Math.abs(actualTime - expectedTime) > timeInterval * 0.1) {
          // Allow 10% tolerance
          gaps.push({ index: i, expectedTime, actualTime });
        }
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      gaps,
    };
  }

  // Data export/import functions
  async exportToJson(candles: OHLCVCandle[], filename: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs').promises;
    const data = {
      metadata: {
        count: candles.length,
        startDate: candles[0]?.date,
        endDate: candles[candles.length - 1]?.date,
        exported: new Date(),
      },
      candles: candles,
    };

    await fs.writeFile(filename, JSON.stringify(data, null, 2));
    console.log(`Exported ${candles.length} candles to ${filename}`);
  }

  async importFromJson(filename: string): Promise<OHLCVCandle[]> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs').promises;
    const data = JSON.parse(await fs.readFile(filename, 'utf8'));

    if (!data.candles || !Array.isArray(data.candles)) {
      throw new Error('Invalid data format in JSON file');
    }

    return data.candles.map((candle: any) => ({
      ...candle,
      date: new Date(candle.date),
    }));
  }

  clearCache(): void {
    this.dataCache.clear();
    console.log('Data cache cleared');
  }

  getCacheSize(): number {
    return this.dataCache.size;
  }
}
