import axios, { AxiosError, AxiosProxyConfig, AxiosRequestConfig, AxiosResponse } from 'axios';
import crypto from 'crypto';
import { rateLimiter, RateLimiterSnapshot } from './rateLimiter';

export type BinanceOrderSide = 'BUY' | 'SELL';

export interface BinanceOrderResponse {
    symbol: string;
    orderId: number;
    status: string;
    executedQty: string;
    cummulativeQuoteQty: string;
    price: string;
    origQty: string;
    type: string;
    side: BinanceOrderSide;
    stopPrice?: string;
}

export interface BinanceOpenOrder {
    symbol: string;
    orderId: number;
    price: string;
    origQty: string;
    executedQty: string;
    status: string;
    type: string;
    side: BinanceOrderSide;
    stopPrice: string;
    time: number;
}

export interface BinanceBalance {
    asset: string;
    free: string;
    locked: string;
}

export interface SymbolTradeRules {
    minQty: number;
    maxQty: number;
    stepSize: number;
    minNotional: number;
    tickSize: number;
}

type RateLimitBucket = 'rest' | 'order';

export class BinanceOrderService {
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly apiSecret: string;
    private readonly timeoutMs: number;
    private readonly recvWindow: number;

    private readonly defaultEndpointWeight: number;
    private readonly rateLimiterTimeoutMs: number;

    constructor() {
        const testnetEnabled = /^(1|true|yes)$/i.test(process.env.BINANCE_TESTNET || '');
        const explicitBaseUrl = process.env.BINANCE_BASE_URL;
        const testnetUrl = process.env.BINANCE_TESTNET_URL || 'https://testnet.binance.vision';

        this.baseUrl = explicitBaseUrl || (testnetEnabled ? testnetUrl : 'https://api.binance.com');
        this.apiKey = process.env.BINANCE_API_KEY || '';
        this.apiSecret = process.env.BINANCE_API_SECRET || '';
        this.timeoutMs = parseInt(process.env.BINANCE_ORDER_TIMEOUT_MS || '12000', 10);
        this.recvWindow = parseInt(process.env.BINANCE_RECV_WINDOW || '5000', 10);

        this.defaultEndpointWeight = parseInt(process.env.BINANCE_DEFAULT_ENDPOINT_WEIGHT || '1', 10);
        this.rateLimiterTimeoutMs = parseInt(process.env.BINANCE_RATE_LIMITER_TIMEOUT_MS || '30000', 10);
    }

    isConfigured(): boolean {
        return !!this.apiKey && !!this.apiSecret;
    }

    getBaseUrl(): string {
        return this.baseUrl;
    }

    getRateLimiterSnapshot(): RateLimiterSnapshot {
        return rateLimiter.getSnapshot();
    }

    roundToStepSize(quantity: number, stepSize: number): number {
        if (stepSize <= 0) {
            throw new Error('stepSize must be greater than 0');
        }

        const factor = Math.floor(quantity / stepSize);
        const rounded = factor * stepSize;
        const precision = this.decimalPlaces(stepSize);
        return Number(rounded.toFixed(precision));
    }

    async placeMarketOrder(symbol: string, side: BinanceOrderSide, quantity: number): Promise<BinanceOrderResponse> {
        return this.privateRequest<BinanceOrderResponse>(
            'POST',
            '/api/v3/order',
            {
                symbol: symbol.toUpperCase(),
                side,
                type: 'MARKET',
                quantity,
            },
            1,
            'order',
        );
    }

    async placeLimitOrder(symbol: string, side: BinanceOrderSide, quantity: number, price: number): Promise<BinanceOrderResponse> {
        return this.privateRequest<BinanceOrderResponse>(
            'POST',
            '/api/v3/order',
            {
                symbol: symbol.toUpperCase(),
                side,
                type: 'LIMIT',
                timeInForce: 'GTC',
                quantity,
                price,
            },
            1,
            'order',
        );
    }

    async placeStopLossLimitOrder(
        symbol: string,
        side: BinanceOrderSide,
        quantity: number,
        stopPrice: number,
        limitPrice: number,
    ): Promise<BinanceOrderResponse> {
        return this.privateRequest<BinanceOrderResponse>(
            'POST',
            '/api/v3/order',
            {
                symbol: symbol.toUpperCase(),
                side,
                type: 'STOP_LOSS_LIMIT',
                timeInForce: 'GTC',
                quantity,
                stopPrice,
                price: limitPrice,
            },
            1,
            'order',
        );
    }

    async placeTakeProfitLimitOrder(
        symbol: string,
        side: BinanceOrderSide,
        quantity: number,
        stopPrice: number,
        limitPrice: number,
    ): Promise<BinanceOrderResponse> {
        return this.privateRequest<BinanceOrderResponse>(
            'POST',
            '/api/v3/order',
            {
                symbol: symbol.toUpperCase(),
                side,
                type: 'TAKE_PROFIT_LIMIT',
                timeInForce: 'GTC',
                quantity,
                stopPrice,
                price: limitPrice,
            },
            1,
            'order',
        );
    }

    async cancelOrder(symbol: string, orderId: number): Promise<Record<string, unknown>> {
        return this.privateRequest<Record<string, unknown>>(
            'DELETE',
            '/api/v3/order',
            {
                symbol: symbol.toUpperCase(),
                orderId,
            },
            1,
            'order',
        );
    }

    async cancelAllOpenOrders(symbol: string): Promise<Array<Record<string, unknown>>> {
        return this.privateRequest<Array<Record<string, unknown>>>(
            'DELETE',
            '/api/v3/openOrders',
            {
                symbol: symbol.toUpperCase(),
            },
            1,
            'order',
        );
    }

    async getOpenOrders(symbol?: string): Promise<BinanceOpenOrder[]> {
        const params = symbol ? { symbol: symbol.toUpperCase() } : undefined;
        return this.privateRequest<BinanceOpenOrder[]>('GET', '/api/v3/openOrders', params, 1, 'rest');
    }

    async getOrderStatus(symbol: string, orderId: number): Promise<BinanceOrderResponse> {
        return this.privateRequest<BinanceOrderResponse>(
            'GET',
            '/api/v3/order',
            {
                symbol: symbol.toUpperCase(),
                orderId,
            },
            1,
            'rest',
        );
    }

    async getCurrentPrice(symbol: string): Promise<number> {
        const data = await this.publicRequest<{ symbol: string; price: string }>(
            '/api/v3/ticker/price',
            { symbol: symbol.toUpperCase() },
            1,
        );
        return parseFloat(data.price);
    }

    async getAccountBalance(): Promise<BinanceBalance[]> {
        const account = await this.privateRequest<{ balances: BinanceBalance[] }>('GET', '/api/v3/account', undefined, 10);
        return (account.balances || []).filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
    }

    async getSymbolInfo(symbol: string): Promise<SymbolTradeRules> {
        const res = await this.publicRequest<{ symbols: Array<{ symbol: string; filters: Array<Record<string, string>> }> }>(
            '/api/v3/exchangeInfo',
            { symbol: symbol.toUpperCase() },
            10,
        );

        const info = res.symbols?.find((s) => s.symbol === symbol.toUpperCase());
        if (!info) {
            throw new Error(`Symbol not found in exchangeInfo: ${symbol.toUpperCase()}`);
        }

        const lotSize = info.filters.find((f) => f.filterType === 'LOT_SIZE');
        const minNotional = info.filters.find((f) => f.filterType === 'MIN_NOTIONAL');
        const priceFilter = info.filters.find((f) => f.filterType === 'PRICE_FILTER');

        if (!lotSize || !priceFilter) {
            throw new Error(`Missing LOT_SIZE or PRICE_FILTER for ${symbol.toUpperCase()}`);
        }

        return {
            minQty: parseFloat(lotSize.minQty),
            maxQty: parseFloat(lotSize.maxQty),
            stepSize: parseFloat(lotSize.stepSize),
            minNotional: minNotional ? parseFloat(minNotional.minNotional) : 0,
            tickSize: parseFloat(priceFilter.tickSize),
        };
    }

    private async publicRequest<T>(path: string, params?: Record<string, unknown>, weight?: number): Promise<T> {
        return this.requestWithRetry<T>(
            async () => {
                const config = this.buildRequestConfig({ method: 'GET', url: `${this.baseUrl}${path}`, params });
                return axios.request<T>(config);
            },
            weight ?? this.defaultEndpointWeight,
            'rest',
        );
    }

    private async privateRequest<T>(
        method: 'GET' | 'POST' | 'DELETE',
        path: string,
        params?: Record<string, unknown>,
        weight?: number,
        bucket: RateLimitBucket = 'rest',
    ): Promise<T> {
        if (!this.isConfigured()) {
            throw new Error('Binance API keys are not configured. Set BINANCE_API_KEY and BINANCE_API_SECRET.');
        }

        return this.requestWithRetry<T>(
            async () => {
                const timestamp = Date.now();
                const signedParams: Record<string, unknown> = {
                    ...(params || {}),
                    recvWindow: this.recvWindow,
                    timestamp,
                };

                const queryString = this.toQueryString(signedParams);
                const signature = this.sign(queryString);
                const allParams = { ...signedParams, signature };

                const config = this.buildRequestConfig({
                    method,
                    url: `${this.baseUrl}${path}`,
                    params: allParams,
                    headers: {
                        'X-MBX-APIKEY': this.apiKey,
                    },
                });

                return axios.request<T>(config);
            },
            weight ?? this.defaultEndpointWeight,
            bucket,
        );
    }

    private async requestWithRetry<T>(
        requestFn: () => Promise<AxiosResponse<T>>,
        weight: number,
        bucket: RateLimitBucket,
    ): Promise<T> {
        const maxRetries = 3;
        const baseDelayMs = 1000;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await rateLimiter.acquire(bucket, weight, this.rateLimiterTimeoutMs);

            try {
                const response = await requestFn();
                rateLimiter.syncFromHeaders(response.headers as Record<string, unknown>);
                return response.data;
            } catch (error) {
                const axiosError = error as AxiosError<{ code?: number; msg?: string }>;
                const binanceCode = axiosError.response?.data?.code;
                const statusCode = axiosError.response?.status;

                if (axiosError.response?.headers) {
                    rateLimiter.syncFromHeaders(axiosError.response.headers as Record<string, unknown>);
                }

                const shouldNeverRetry = binanceCode === -2010 || binanceCode === -1121;
                const shouldRetryHttp = statusCode === 429 || (typeof statusCode === 'number' && statusCode >= 500);
                const isLastAttempt = attempt === maxRetries;

                if (shouldNeverRetry || !shouldRetryHttp || isLastAttempt) {
                    throw new Error(this.formatAxiosError(axiosError));
                }

                const delay = baseDelayMs * Math.pow(2, attempt);
                await this.sleep(delay);
            }
        }

        throw new Error('Request failed unexpectedly after retry loop');
    }

    private toQueryString(params: Record<string, unknown>): string {
        const entries = Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null)
            .sort(([a], [b]) => a.localeCompare(b));

        return entries
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join('&');
    }

    private sign(payload: string): string {
        return crypto.createHmac('sha256', this.apiSecret).update(payload).digest('hex');
    }

    private decimalPlaces(value: number): number {
        if (!Number.isFinite(value)) return 0;
        const s = value.toString().toLowerCase();
        if (s.includes('e-')) {
            const [, exp] = s.split('e-');
            return parseInt(exp, 10);
        }

        const dot = s.indexOf('.');
        return dot === -1 ? 0 : s.length - dot - 1;
    }

    private buildRequestConfig(config: AxiosRequestConfig): AxiosRequestConfig {
        const proxyUrl = process.env.BINANCE_PROXY_URL;
        if (!proxyUrl) {
            return { timeout: this.timeoutMs, ...config };
        }

        const proxy = this.parseProxyUrl(proxyUrl);
        if (!proxy) {
            return { timeout: this.timeoutMs, ...config };
        }

        return {
            timeout: this.timeoutMs,
            proxy,
            ...config,
        };
    }

    private parseProxyUrl(proxyUrl: string): AxiosProxyConfig | undefined {
        try {
            const parsed = new URL(proxyUrl);
            if (!parsed.hostname || !parsed.port) {
                return undefined;
            }

            const cfg: AxiosProxyConfig = {
                protocol: parsed.protocol.replace(':', ''),
                host: parsed.hostname,
                port: Number(parsed.port),
            };

            if (parsed.username || parsed.password) {
                cfg.auth = {
                    username: decodeURIComponent(parsed.username),
                    password: decodeURIComponent(parsed.password),
                };
            }

            return cfg;
        } catch {
            return undefined;
        }
    }

    private formatAxiosError(error: AxiosError<{ code?: number; msg?: string }>): string {
        const status = error.response?.status;
        const code = error.response?.data?.code;
        const msg = error.response?.data?.msg || error.message;

        if (status || code) {
            return `Binance request failed (status=${status ?? 'N/A'}, code=${code ?? 'N/A'}): ${msg}`;
        }

        return `Binance request failed: ${msg}`;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

export const binanceOrderService = new BinanceOrderService();
