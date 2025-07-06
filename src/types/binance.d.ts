declare module 'node-binance-api' {
    export type TimeInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '8h' | '12h' | '1d' | '3d' | '1w' | '1M';

    export interface BinanceAPI {
        options(opts: { APIKEY: string; APISECRET: string }): BinanceAPI;
        prices(symbol?: string): Promise<{ [key: string]: number }>;
        trades(symbol: string): Promise<any[]>;
        candlesticks(symbol: string, interval: TimeInterval, options?: { limit?: number }): Promise<any[]>;
        prevDay(symbol: string): Promise<{
            symbol: string;
            priceChange: number;
            priceChangePercent: number;
            weightedAvgPrice: number;
            prevClosePrice: number;
            lastPrice: number;
            lastQty: number;
            bidPrice: number;
            bidQty: number;
            askPrice: number;
            askQty: number;
            openPrice: number;
            highPrice: number;
            lowPrice: number;
            volume: number;
            quoteVolume: number;
            openTime: number;
            closeTime: number;
            firstId: number;
            lastId: number;
            count: number;
        }>;
    }

    interface BinanceFactory {
        (): BinanceAPI;
        options(opts: { APIKEY: string; APISECRET: string }): BinanceAPI;
    }

    const binanceApi: BinanceFactory;
    export = binanceApi;
}
