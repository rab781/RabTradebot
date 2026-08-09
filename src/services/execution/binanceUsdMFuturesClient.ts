import axios from 'axios';
import crypto from 'crypto';
import {
    FuturesMarginType,
    FuturesPositionSide,
    OrderSide,
} from '../../domain/execution';

export interface FuturesHttpRequest {
    method: 'GET' | 'POST';
    url: string;
    headers?: Record<string, string>;
}

export interface FuturesHttpTransport {
    request<T>(config: FuturesHttpRequest): Promise<{ data: T }>;
}

export interface BinanceUsdMFuturesClientOptions {
    apiKey?: string;
    apiSecret?: string;
    baseUrl?: string;
    recvWindow?: number;
    timeoutMs?: number;
    transport?: FuturesHttpTransport;
    now?: () => number;
}

export interface FuturesMarketOrderRequest {
    symbol: string;
    side: OrderSide;
    quantity: number;
    positionSide: FuturesPositionSide;
    reduceOnly?: boolean;
    newClientOrderId?: string;
}

export interface FuturesOrderResponse {
    symbol: string;
    orderId: number;
    clientOrderId: string;
    status: string;
    avgPrice?: string;
    price?: string;
    origQty: string;
    executedQty: string;
    cumQuote: string;
    side: OrderSide;
    positionSide: FuturesPositionSide;
    reduceOnly?: boolean;
    type: string;
    updateTime?: number;
}

export interface FuturesPositionModeResponse {
    dualSidePosition: boolean;
}

export interface FuturesPositionRisk {
    symbol: string;
    positionSide: FuturesPositionSide;
    positionAmt: string;
    entryPrice: string;
    breakEvenPrice?: string;
    markPrice: string;
    unRealizedProfit: string;
    liquidationPrice: string;
    leverage: string;
    marginType: string;
    isolatedMargin?: string;
    updateTime?: number;
}

export interface FuturesLeverageResponse {
    leverage: number;
    maxNotionalValue: string;
    symbol: string;
}

export interface FuturesMarginTypeResponse {
    code: number;
    msg: string;
}

export interface FuturesMarkPriceResponse {
    symbol: string;
    markPrice: string;
    indexPrice: string;
    estimatedSettlePrice?: string;
    lastFundingRate?: string;
    interestRate?: string;
    nextFundingTime?: number;
    time?: number;
}

export interface FuturesIncomeRecord {
    symbol: string;
    incomeType: string;
    income: string;
    asset: string;
    info?: string;
    time: number;
    tranId?: number;
    tradeId?: string;
}

/**
 * Low-level Binance USDⓈ-M Futures REST client.
 *
 * This class owns transport/signing only. Portfolio semantics (LONG/SHORT,
 * OPEN/CLOSE and reduce behaviour) belong to UsdMFuturesExecutionBroker.
 */
export class BinanceUsdMFuturesClient {
    private readonly apiKey: string;
    private readonly apiSecret: string;
    private readonly recvWindow: number;
    private readonly transport: FuturesHttpTransport;
    private readonly now: () => number;

    constructor(options: BinanceUsdMFuturesClientOptions = {}) {
        this.apiKey = options.apiKey ?? process.env.BINANCE_API_KEY ?? '';
        this.apiSecret = options.apiSecret ?? process.env.BINANCE_API_SECRET ?? '';
        this.recvWindow = options.recvWindow ?? 5000;
        this.now = options.now ?? Date.now;

        const baseUrl = options.baseUrl ?? 'https://fapi.binance.com';
        const timeout = options.timeoutMs ?? 10_000;
        this.transport = options.transport ?? this.createAxiosTransport(baseUrl, timeout);
    }

    isConfigured(): boolean {
        return this.apiKey.trim().length > 0 && this.apiSecret.trim().length > 0;
    }

    async placeMarketOrder(request: FuturesMarketOrderRequest): Promise<FuturesOrderResponse> {
        const params: Record<string, string | number | boolean | undefined> = {
            symbol: this.normalizeSymbol(request.symbol),
            side: request.side,
            type: 'MARKET',
            quantity: request.quantity,
            positionSide: request.positionSide,
            reduceOnly: request.reduceOnly,
            newClientOrderId: request.newClientOrderId,
            newOrderRespType: 'RESULT',
        };

        return this.signedRequest<FuturesOrderResponse>('POST', '/fapi/v1/order', params);
    }

    async getPositionMode(): Promise<FuturesPositionModeResponse> {
        return this.signedRequest<FuturesPositionModeResponse>(
            'GET',
            '/fapi/v1/positionSide/dual',
            {},
        );
    }

    async getPositionRisk(symbol: string): Promise<FuturesPositionRisk[]> {
        return this.signedRequest<FuturesPositionRisk[]>(
            'GET',
            '/fapi/v3/positionRisk',
            { symbol: this.normalizeSymbol(symbol) },
        );
    }

    async changeInitialLeverage(symbol: string, leverage: number): Promise<FuturesLeverageResponse> {
        return this.signedRequest<FuturesLeverageResponse>(
            'POST',
            '/fapi/v1/leverage',
            { symbol: this.normalizeSymbol(symbol), leverage },
        );
    }

    async changeMarginType(
        symbol: string,
        marginType: FuturesMarginType,
    ): Promise<FuturesMarginTypeResponse> {
        return this.signedRequest<FuturesMarginTypeResponse>(
            'POST',
            '/fapi/v1/marginType',
            { symbol: this.normalizeSymbol(symbol), marginType },
        );
    }

    async getMarkPrice(symbol: string): Promise<FuturesMarkPriceResponse> {
        const query = this.encodeQuery({ symbol: this.normalizeSymbol(symbol) });
        const response = await this.transport.request<FuturesMarkPriceResponse>({
            method: 'GET',
            url: `/fapi/v1/premiumIndex?${query}`,
        });
        return response.data;
    }

    async getFundingIncome(
        symbol?: string,
        startTime?: number,
        limit = 100,
    ): Promise<FuturesIncomeRecord[]> {
        return this.signedRequest<FuturesIncomeRecord[]>(
            'GET',
            '/fapi/v1/income',
            {
                symbol: symbol ? this.normalizeSymbol(symbol) : undefined,
                incomeType: 'FUNDING_FEE',
                startTime,
                limit,
            },
        );
    }

    private async signedRequest<T>(
        method: 'GET' | 'POST',
        path: string,
        params: Record<string, string | number | boolean | undefined>,
    ): Promise<T> {
        if (!this.isConfigured()) {
            throw new Error('Binance USDⓈ-M Futures API credentials are not configured.');
        }

        const payload = {
            ...params,
            recvWindow: this.recvWindow,
            timestamp: this.now(),
        };
        const query = this.encodeQuery(payload);
        const signature = crypto
            .createHmac('sha256', this.apiSecret)
            .update(query)
            .digest('hex');
        const response = await this.transport.request<T>({
            method,
            url: `${path}?${query}&signature=${signature}`,
            headers: { 'X-MBX-APIKEY': this.apiKey },
        });

        return response.data;
    }

    private encodeQuery(
        params: Record<string, string | number | boolean | undefined>,
    ): string {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            if (value === undefined) continue;
            query.append(key, String(value));
        }
        return query.toString();
    }

    private normalizeSymbol(symbol: string): string {
        return symbol.trim().toUpperCase();
    }

    private createAxiosTransport(baseURL: string, timeout: number): FuturesHttpTransport {
        const client = axios.create({ baseURL, timeout });
        return {
            request: async <T>(config: FuturesHttpRequest): Promise<{ data: T }> => {
                const response = await client.request<T>({
                    method: config.method,
                    url: config.url,
                    headers: config.headers,
                });
                return { data: response.data };
            },
        };
    }
}
