import axios from 'axios';
import { DataFrame } from '../types/dataframe';

export interface TradingViewConfig {
    theme: 'light' | 'dark';
    interval: string;
    symbol: string;
    containerId: string;
}

export class TradingViewService {
    private config: TradingViewConfig;
    
    constructor(config: TradingViewConfig) {
        this.config = config;
    }

    /**
     * Create TradingView widget (FREE - No rate limits)
     * Best for visualization and manual analysis
     */
    createWidget(): string {
        return `
        <div class="tradingview-widget-container" style="height: 500px; width: 100%;">
            <div class="tradingview-widget-container__widget"></div>
            <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js" async>
            {
                "autosize": true,
                "symbol": "${this.config.symbol}",
                "interval": "${this.config.interval}",
                "timezone": "Etc/UTC",
                "theme": "${this.config.theme}",
                "style": "1",
                "locale": "en",
                "toolbar_bg": "#f1f3f6",
                "enable_publishing": false,
                "allow_symbol_change": true,
                "container_id": "${this.config.containerId}",
                "studies": [
                    "RSI@tv-basicstudies",
                    "MACD@tv-basicstudies",
                    "BB@tv-basicstudies"
                ]
            }
            </script>
        </div>
        `;
    }

    /**
     * Get free financial data from multiple sources
     * Fallback chain: Yahoo Finance -> Alpha Vantage -> Binance
     */
    async getMarketData(symbol: string, interval: string = '5m'): Promise<DataFrame | null> {
        // Try Yahoo Finance first (FREE)
        try {
            return await this.getYahooFinanceData(symbol, interval);
        } catch (error) {
            console.log('Yahoo Finance failed, trying Alpha Vantage...');
        }

        // Try Alpha Vantage (FREE with API key)
        try {
            return await this.getAlphaVantageData(symbol, interval);
        } catch (error) {
            console.log('Alpha Vantage failed, trying Binance...');
        }

        // Try Binance (FREE with generous limits)
        try {
            return await this.getBinanceData(symbol, interval);
        } catch (error) {
            console.error('All data sources failed:', error);
            return null;
        }
    }

    private async getYahooFinanceData(symbol: string, interval: string): Promise<DataFrame> {
        // Yahoo Finance is free but unofficial
        const yahooSymbol = symbol.replace('USDT', '-USD');
        const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`, {
            params: {
                interval: this.convertInterval(interval),
                range: '1d'
            }
        });

        const result = response.data.chart.result[0];
        const timestamps = result.timestamp;
        const ohlcv = result.indicators.quote[0];

        return {
            date: timestamps.map((t: number) => new Date(t * 1000)),
            open: ohlcv.open,
            high: ohlcv.high,
            low: ohlcv.low,
            close: ohlcv.close,
            volume: ohlcv.volume
        };
    }

    private async getAlphaVantageData(symbol: string, interval: string): Promise<DataFrame> {
        // Free API key from: https://www.alphavantage.co/support/#api-key
        const API_KEY = 'YOUR_FREE_API_KEY'; // Replace with your free API key
        const response = await axios.get('https://www.alphavantage.co/query', {
            params: {
                function: 'CRYPTO_INTRADAY',
                symbol: symbol.replace('USDT', ''),
                market: 'USD',
                interval: this.convertInterval(interval),
                apikey: API_KEY
            }
        });

        // Transform Alpha Vantage data to DataFrame
        const timeSeries = response.data[`Time Series Crypto (${interval})`];
        
        interface AlphaVantageData {
            date: Date;
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
        }

        const data: AlphaVantageData[] = Object.entries(timeSeries).map(([time, values]: [string, any]) => ({
            date: new Date(time),
            open: parseFloat(values['1. open']),
            high: parseFloat(values['2. high']),
            low: parseFloat(values['3. low']),
            close: parseFloat(values['4. close']),
            volume: parseFloat(values['5. volume'])
        }));

        return {
            date: data.map((d: AlphaVantageData) => d.date),
            open: data.map((d: AlphaVantageData) => d.open),
            high: data.map((d: AlphaVantageData) => d.high),
            low: data.map((d: AlphaVantageData) => d.low),
            close: data.map((d: AlphaVantageData) => d.close),
            volume: data.map((d: AlphaVantageData) => d.volume)
        };
    }

    private async getBinanceData(symbol: string, interval: string): Promise<DataFrame> {
        // Binance is free with generous rate limits
        const binanceInterval = this.convertToBinanceInterval(interval);
        const response = await axios.get('https://api.binance.com/api/v3/klines', {
            params: {
                symbol: symbol,
                interval: binanceInterval,
                limit: 500
            }
        });

        interface BinanceKlineData {
            date: Date;
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
        }

        const data: BinanceKlineData[] = response.data.map((kline: any[]) => ({
            date: new Date(kline[0]),
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[5])
        }));

        return {
            date: data.map((d: BinanceKlineData) => d.date),
            open: data.map((d: BinanceKlineData) => d.open),
            high: data.map((d: BinanceKlineData) => d.high),
            low: data.map((d: BinanceKlineData) => d.low),
            close: data.map((d: BinanceKlineData) => d.close),
            volume: data.map((d: BinanceKlineData) => d.volume)
        };
    }

    private convertToBinanceInterval(interval: string): string {
        // Binance specific interval mapping
        const binanceIntervalMap: { [key: string]: string } = {
            '1m': '1m',
            '5m': '5m',
            '15m': '15m',
            '30m': '30m',
            '1h': '1h',
            '4h': '4h',
            '1d': '1d'
        };
        return binanceIntervalMap[interval] || interval;
    }

    private convertInterval(interval: string): string {
        // Convert interval for different APIs
        const intervalMap: { [key: string]: string } = {
            // Yahoo Finance & Alpha Vantage format
            '1m': '1min',
            '5m': '5min',
            '15m': '15min',
            '30m': '30min',
            '1h': '60min',
            '4h': '4h',
            '1d': '1day'
        };
        
        // For Binance API, use direct mapping
        const binanceIntervalMap: { [key: string]: string } = {
            '1m': '1m',
            '5m': '5m',
            '15m': '15m',
            '30m': '30m',
            '1h': '1h',
            '4h': '4h',
            '1d': '1d'
        };
        
        return intervalMap[interval] || binanceIntervalMap[interval] || interval;
    }
}
