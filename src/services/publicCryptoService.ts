import axios from 'axios';
import * as fs from 'fs';
import * as https from 'https';
import { logger } from '../utils/logger';

export class PublicCryptoService {
  private readonly BASE_URL: string;
  private readonly insecureAgent = new https.Agent({ rejectUnauthorized: false });
  private readonly secureAgent?: https.Agent;

  constructor() {
    const configuredBase = process.env.BINANCE_BASE_URL || 'https://api.binance.com';
    this.BASE_URL = `${configuredBase.replace(/\/$/, '')}/api/v3`;

    const caCertPath = process.env.BINANCE_CA_CERT_PATH || '';
    if (caCertPath) {
      try {
        const ca = fs.readFileSync(caCertPath, 'utf-8');
        this.secureAgent = new https.Agent({ ca, rejectUnauthorized: true });
        logger.info(`[PublicCryptoService] Loaded custom CA certificate from ${caCertPath}`);
      } catch (error) {
        logger.error(
          `[PublicCryptoService] Failed to load BINANCE_CA_CERT_PATH (${caCertPath}): ${(error as Error).message}`
        );
      }
    }
  }

  private shouldRetryInsecureTls(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();

    return (
      code.includes('CERT') ||
      code.includes('UNABLE_TO_GET_ISSUER_CERT') ||
      message.includes('unable to get local issuer certificate') ||
      message.includes('self signed certificate')
    );
  }

  private async getWithTlsFallback(url: string, config: any): Promise<any> {
    const requestConfig = this.secureAgent
      ? {
          ...config,
          httpsAgent: this.secureAgent,
        }
      : config;

    try {
      return await axios.get(url, requestConfig);
    } catch (error: any) {
      const allowInsecure = process.env.ALLOW_INSECURE_TLS !== 'false';
      if (!allowInsecure || !this.shouldRetryInsecureTls(error)) {
        throw error;
      }

      logger.warn(
        '[PublicCryptoService] TLS certificate validation failed, retrying with insecure TLS fallback.'
      );

      return axios.get(url, {
        ...requestConfig,
        httpsAgent: this.insecureAgent,
      });
    }
  }

  async getCandlestickData(
    symbol: string,
    interval: string = '1h',
    limit: number = 100
  ): Promise<any[]> {
    try {
      logger.info(
        `[PublicCryptoService] Fetching candlestick data for ${symbol} (${interval}, limit: ${limit})`
      );

      const response = await this.getWithTlsFallback(`${this.BASE_URL}/klines`, {
        params: {
          symbol,
          interval,
          limit,
        },
        timeout: 10000,
      });

      logger.info(
        `[PublicCryptoService] Successfully fetched ${response.data.length} candles for ${symbol}`
      );
      return response.data;
    } catch (error: any) {
      logger.error(
        { err: error.message },
        `[PublicCryptoService] Error fetching candlestick data for ${symbol}:`
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
      logger.info(`[PublicCryptoService] Fetching 24hr ticker for ${symbol}`);

      const response = await this.getWithTlsFallback(`${this.BASE_URL}/ticker/24hr`, {
        params: { symbol },
        timeout: 10000,
      });

      logger.info(`[PublicCryptoService] Successfully fetched ticker for ${symbol}`);
      return response.data;
    } catch (error: any) {
      logger.error(
        { err: error.message },
        `[PublicCryptoService] Error fetching ticker for ${symbol}:`
      );

      if (error.response?.status === 400) {
        throw new Error(`Invalid symbol: ${symbol}. Please check if the symbol exists on Binance.`);
      }

      throw error;
    }
  }

  async getRecentTrades(symbol: string, limit: number = 500): Promise<any[]> {
    try {
      logger.info(`[PublicCryptoService] Fetching recent trades for ${symbol} (limit: ${limit})`);

      const response = await this.getWithTlsFallback(`${this.BASE_URL}/trades`, {
        params: {
          symbol,
          limit,
        },
        timeout: 10000,
      });

      logger.info(
        `[PublicCryptoService] Successfully fetched ${response.data.length} trades for ${symbol}`
      );
      return response.data;
    } catch (error: any) {
      logger.error(
        { err: error.message },
        `[PublicCryptoService] Error fetching trades for ${symbol}:`
      );

      if (error.response?.status === 400) {
        throw new Error(`Invalid symbol: ${symbol}. Please check if the symbol exists on Binance.`);
      }

      throw error;
    }
  }
}
