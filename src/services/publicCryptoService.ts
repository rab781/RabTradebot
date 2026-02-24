import axios from 'axios';

export class PublicCryptoService {
  private readonly BASE_URL = 'https://api.binance.com/api/v3';

  async getCandlestickData(
    symbol: string,
    interval: string = '1h',
    limit: number = 100
  ): Promise<any[]> {
    try {
      console.log(
        `[PublicCryptoService] Fetching candlestick data for ${symbol} (${interval}, limit: ${limit})`
      );

      const response = await axios.get(`${this.BASE_URL}/klines`, {
        params: {
          symbol,
          interval,
          limit,
        },
        timeout: 10000,
      });

      console.log(
        `[PublicCryptoService] Successfully fetched ${response.data.length} candles for ${symbol}`
      );
      return response.data;
    } catch (error: any) {
      console.error(
        `[PublicCryptoService] Error fetching candlestick data for ${symbol}:`,
        error.message
      );

      if (error.response?.status === 400) {
        throw new Error(`Invalid symbol: ${symbol}. Please check if the symbol exists on Binance.`);
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error(
          `Network error while fetching data for ${symbol}. Please check your internet connection.`
        );
      } else if (error.response?.status === 429) {
        throw new Error(`Rate limit exceeded for ${symbol}. Please try again in a few moments.`);
      }

      throw error;
    }
  }

  async get24hrTicker(symbol: string): Promise<any> {
    try {
      console.log(`[PublicCryptoService] Fetching 24hr ticker for ${symbol}`);

      const response = await axios.get(`${this.BASE_URL}/ticker/24hr`, {
        params: { symbol },
        timeout: 10000,
      });

      console.log(`[PublicCryptoService] Successfully fetched ticker for ${symbol}`);
      return response.data;
    } catch (error: any) {
      console.error(`[PublicCryptoService] Error fetching ticker for ${symbol}:`, error.message);

      if (error.response?.status === 400) {
        throw new Error(`Invalid symbol: ${symbol}. Please check if the symbol exists on Binance.`);
      }

      throw error;
    }
  }

  async getRecentTrades(symbol: string, limit: number = 500): Promise<any[]> {
    try {
      console.log(`[PublicCryptoService] Fetching recent trades for ${symbol} (limit: ${limit})`);

      const response = await axios.get(`${this.BASE_URL}/trades`, {
        params: {
          symbol,
          limit,
        },
        timeout: 10000,
      });

      console.log(
        `[PublicCryptoService] Successfully fetched ${response.data.length} trades for ${symbol}`
      );
      return response.data;
    } catch (error: any) {
      console.error(`[PublicCryptoService] Error fetching trades for ${symbol}:`, error.message);

      if (error.response?.status === 400) {
        throw new Error(`Invalid symbol: ${symbol}. Please check if the symbol exists on Binance.`);
      }

      throw error;
    }
  }
}
