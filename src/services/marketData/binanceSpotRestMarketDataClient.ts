import axios, { AxiosInstance } from 'axios';
import {
    SpotAggregateTrade,
    SpotBookTicker,
    SpotMarketCandle,
    SpotRestMarketDataPort,
} from './spotMarketDataTypes';

const DEFAULT_BASE_URL = 'https://data-api.binance.vision';

function finiteNumber(value: unknown, field: string): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid Binance Spot ${field}: ${String(value)}`);
    }
    return parsed;
}

function assertPositive(value: number, field: string): void {
    if (value <= 0) {
        throw new Error(`Invalid Binance Spot ${field}: ${value}`);
    }
}

export function parseRestKline(
    symbol: string,
    interval: string,
    raw: unknown,
    now = Date.now(),
): SpotMarketCandle {
    if (!Array.isArray(raw) || raw.length < 11) {
        throw new Error('Malformed Binance Spot kline payload.');
    }

    const openTime = finiteNumber(raw[0], 'kline.openTime');
    const open = finiteNumber(raw[1], 'kline.open');
    const high = finiteNumber(raw[2], 'kline.high');
    const low = finiteNumber(raw[3], 'kline.low');
    const close = finiteNumber(raw[4], 'kline.close');
    const volume = finiteNumber(raw[5], 'kline.volume');
    const closeTime = finiteNumber(raw[6], 'kline.closeTime');
    const quoteVolume = finiteNumber(raw[7], 'kline.quoteVolume');
    const trades = finiteNumber(raw[8], 'kline.trades');
    const takerBuyBaseVolume = finiteNumber(raw[9], 'kline.takerBuyBaseVolume');
    const takerBuyQuoteVolume = finiteNumber(raw[10], 'kline.takerBuyQuoteVolume');

    assertPositive(open, 'kline.open');
    assertPositive(high, 'kline.high');
    assertPositive(low, 'kline.low');
    assertPositive(close, 'kline.close');

    if (high < Math.max(open, close) || low > Math.min(open, close) || high < low) {
        throw new Error('Invalid Binance Spot OHLC bounds.');
    }

    return {
        symbol: symbol.toUpperCase(),
        interval,
        openTime,
        closeTime,
        open,
        high,
        low,
        close,
        volume,
        quoteVolume,
        trades,
        takerBuyBaseVolume,
        takerBuyQuoteVolume,
        closed: closeTime < now,
        source: 'REST',
        receivedAt: now,
    };
}

export function parseRestBookTicker(symbol: string, raw: unknown, now = Date.now()): SpotBookTicker {
    const value = raw as Record<string, unknown>;
    if (!value || typeof value !== 'object') {
        throw new Error('Malformed Binance Spot bookTicker payload.');
    }

    const bidPrice = finiteNumber(value.bidPrice, 'bookTicker.bidPrice');
    const bidQty = finiteNumber(value.bidQty, 'bookTicker.bidQty');
    const askPrice = finiteNumber(value.askPrice, 'bookTicker.askPrice');
    const askQty = finiteNumber(value.askQty, 'bookTicker.askQty');

    assertPositive(bidPrice, 'bookTicker.bidPrice');
    assertPositive(askPrice, 'bookTicker.askPrice');
    assertPositive(bidQty, 'bookTicker.bidQty');
    assertPositive(askQty, 'bookTicker.askQty');

    if (bidPrice >= askPrice) {
        throw new Error('Crossed or locked Binance Spot top-of-book.');
    }

    return {
        symbol: String(value.symbol ?? symbol).toUpperCase(),
        updateId: finiteNumber(value.lastUpdateId ?? value.updateId ?? 0, 'bookTicker.updateId'),
        bidPrice,
        bidQty,
        askPrice,
        askQty,
        source: 'REST',
        receivedAt: now,
    };
}

export function parseRestAggregateTrade(symbol: string, raw: unknown, now = Date.now()): SpotAggregateTrade {
    const value = raw as Record<string, unknown>;
    if (!value || typeof value !== 'object') {
        throw new Error('Malformed Binance Spot aggregate-trade payload.');
    }

    const price = finiteNumber(value.p, 'aggTrade.price');
    const quantity = finiteNumber(value.q, 'aggTrade.quantity');
    assertPositive(price, 'aggTrade.price');
    assertPositive(quantity, 'aggTrade.quantity');

    return {
        symbol: String(value.s ?? symbol).toUpperCase(),
        id: finiteNumber(value.a, 'aggTrade.id'),
        price,
        quantity,
        firstTradeId: finiteNumber(value.f, 'aggTrade.firstTradeId'),
        lastTradeId: finiteNumber(value.l, 'aggTrade.lastTradeId'),
        tradeTime: finiteNumber(value.T, 'aggTrade.tradeTime'),
        buyerIsMaker: Boolean(value.m),
        source: 'REST',
        receivedAt: now,
    };
}

export class BinanceSpotRestMarketDataClient implements SpotRestMarketDataPort {
    private readonly http: AxiosInstance;

    constructor(baseUrl = DEFAULT_BASE_URL, timeoutMs = 10_000) {
        this.http = axios.create({
            baseURL: baseUrl,
            timeout: timeoutMs,
        });
    }

    async fetchKlines(symbol: string, interval: string, limit: number): Promise<SpotMarketCandle[]> {
        const upperSymbol = symbol.toUpperCase();
        const response = await this.http.get('/api/v3/klines', {
            params: { symbol: upperSymbol, interval, limit },
        });
        if (!Array.isArray(response.data)) {
            throw new Error('Malformed Binance Spot klines response.');
        }
        const now = Date.now();
        return response.data.map((row: unknown) => parseRestKline(upperSymbol, interval, row, now));
    }

    async fetchBookTicker(symbol: string): Promise<SpotBookTicker> {
        const upperSymbol = symbol.toUpperCase();
        const response = await this.http.get('/api/v3/ticker/bookTicker', {
            params: { symbol: upperSymbol },
        });
        return parseRestBookTicker(upperSymbol, response.data);
    }

    async fetchAggregateTrades(symbol: string, limit: number): Promise<SpotAggregateTrade[]> {
        const upperSymbol = symbol.toUpperCase();
        const response = await this.http.get('/api/v3/aggTrades', {
            params: { symbol: upperSymbol, limit },
        });
        if (!Array.isArray(response.data)) {
            throw new Error('Malformed Binance Spot aggTrades response.');
        }
        const now = Date.now();
        return response.data.map((row: unknown) => parseRestAggregateTrade(upperSymbol, row, now));
    }
}
