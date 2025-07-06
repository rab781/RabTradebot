interface BinanceClient {
    options(options: { APIKEY: string; APISECRET: string }): BinanceClient;
    prices(symbol?: string): Promise<{ [symbol: string]: number }>;
    trades(symbol: string): Promise<any[]>;
    candlesticks(symbol: string, interval: string, options?: { limit?: number }): Promise<any[]>;
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

export { BinanceClient };
