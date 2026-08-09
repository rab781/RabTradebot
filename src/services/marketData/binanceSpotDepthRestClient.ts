import axios, { AxiosInstance } from 'axios';
import { SpotDepthLevel, SpotDepthRestPort, SpotDepthSnapshot } from './spotDepthTypes';

const DEFAULT_BASE_URL = 'https://data-api.binance.vision';

function parseDepthLevel(raw: unknown, side: 'bid' | 'ask'): SpotDepthLevel {
    if (!Array.isArray(raw) || raw.length < 2) {
        throw new Error(`Malformed Binance Spot depth ${side} level.`);
    }
    const price = Number(raw[0]);
    const quantity = Number(raw[1]);
    if (!Number.isFinite(price) || price <= 0) {
        throw new Error(`Invalid Binance Spot depth ${side} price: ${String(raw[0])}`);
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
        throw new Error(`Invalid Binance Spot depth ${side} quantity: ${String(raw[1])}`);
    }
    return { price, quantity };
}

export function parseRestDepthSnapshot(
    symbol: string,
    raw: unknown,
    receivedAt = Date.now(),
): SpotDepthSnapshot {
    const value = raw as Record<string, unknown>;
    if (!value || typeof value !== 'object' || !Array.isArray(value.bids) || !Array.isArray(value.asks)) {
        throw new Error('Malformed Binance Spot depth snapshot.');
    }
    const lastUpdateId = Number(value.lastUpdateId);
    if (!Number.isSafeInteger(lastUpdateId) || lastUpdateId < 0) {
        throw new Error(`Invalid Binance Spot depth lastUpdateId: ${String(value.lastUpdateId)}`);
    }
    const bids = value.bids.map((row) => parseDepthLevel(row, 'bid')).filter((level) => level.quantity > 0);
    const asks = value.asks.map((row) => parseDepthLevel(row, 'ask')).filter((level) => level.quantity > 0);
    if (bids.length === 0 || asks.length === 0) {
        throw new Error('Binance Spot depth snapshot contains an empty book side.');
    }
    const bestBid = Math.max(...bids.map((level) => level.price));
    const bestAsk = Math.min(...asks.map((level) => level.price));
    if (bestBid >= bestAsk) {
        throw new Error('Crossed or locked Binance Spot REST depth snapshot.');
    }
    return {
        symbol: symbol.toUpperCase(),
        lastUpdateId,
        bids,
        asks,
        receivedAt,
        source: 'REST',
    };
}

export class BinanceSpotDepthRestClient implements SpotDepthRestPort {
    private readonly http: AxiosInstance;

    constructor(baseUrl = DEFAULT_BASE_URL, timeoutMs = 10_000) {
        this.http = axios.create({ baseURL: baseUrl, timeout: timeoutMs });
    }

    async fetchDepthSnapshot(symbol: string, limit = 5000): Promise<SpotDepthSnapshot> {
        if (![5, 10, 20, 50, 100, 500, 1000, 5000].includes(limit)) {
            throw new Error(`Unsupported Binance Spot depth limit: ${limit}`);
        }
        const upperSymbol = symbol.toUpperCase();
        const response = await this.http.get('/api/v3/depth', {
            params: { symbol: upperSymbol, limit },
        });
        return parseRestDepthSnapshot(upperSymbol, response.data);
    }
}
