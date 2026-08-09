import axios, { AxiosError, AxiosInstance } from 'axios';
import crypto from 'crypto';
import WebSocket from 'ws';

export type HealthStatus = 'PASS' | 'WARN' | 'FAIL' | 'SKIP';

export interface HealthCheckResult {
    scope: 'CONFIG' | 'SPOT_REST' | 'SPOT_WS' | 'FUTURES_REST' | 'FUTURES_WS' | 'PRIVATE';
    check: string;
    status: HealthStatus;
    detail: string;
    latencyMs?: number;
}

export interface BinanceDataHealthOptions {
    symbol?: string;
    interval?: string;
    spotBaseUrl?: string;
    futuresBaseUrl?: string;
    spotWsBaseUrl?: string;
    futuresWsBaseUrl?: string;
    timeoutMs?: number;
    websocketTimeoutMs?: number;
    apiKey?: string;
    apiSecret?: string;
    includePrivate?: boolean;
}

interface TimedResponse<T> {
    data: T;
    latencyMs: number;
    headers: Record<string, unknown>;
}

interface SpotExchangeInfo {
    symbols?: Array<{
        symbol: string;
        status: string;
        baseAsset: string;
        quoteAsset: string;
        filters: Array<Record<string, unknown>>;
    }>;
}

interface FuturesExchangeInfo {
    symbols?: Array<{
        symbol: string;
        status: string;
        contractType?: string;
        baseAsset: string;
        quoteAsset: string;
        filters: Array<Record<string, unknown>>;
    }>;
}

interface BookTicker {
    symbol?: string;
    bidPrice?: string;
    bidQty?: string;
    askPrice?: string;
    askQty?: string;
}

interface DepthSnapshot {
    lastUpdateId?: number;
    bids?: Array<[string, string]>;
    asks?: Array<[string, string]>;
}

interface ServerTimeResponse {
    serverTime: number;
}

interface FuturesPremiumIndex {
    symbol: string;
    markPrice: string;
    indexPrice?: string;
    lastFundingRate?: string;
    nextFundingTime?: number;
    time?: number;
}

export function classifyClockDrift(offsetMs: number): HealthStatus {
    const abs = Math.abs(offsetMs);
    if (abs <= 1_000) return 'PASS';
    if (abs <= 4_000) return 'WARN';
    return 'FAIL';
}

export function validateKlines(
    rows: unknown,
    expectedIntervalMs: number,
): { ok: boolean; detail: string } {
    if (!Array.isArray(rows) || rows.length < 2) {
        return { ok: false, detail: 'Kline payload must contain at least 2 rows.' };
    }

    let previousOpenTime: number | null = null;
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (!Array.isArray(row) || row.length < 7) {
            return { ok: false, detail: `Row ${index} has invalid kline shape.` };
        }

        const openTime = Number(row[0]);
        const open = Number(row[1]);
        const high = Number(row[2]);
        const low = Number(row[3]);
        const close = Number(row[4]);
        const volume = Number(row[5]);
        const closeTime = Number(row[6]);

        const numeric = [openTime, open, high, low, close, volume, closeTime];
        if (numeric.some((value) => !Number.isFinite(value))) {
            return { ok: false, detail: `Row ${index} contains non-finite values.` };
        }
        if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0) {
            return { ok: false, detail: `Row ${index} contains invalid OHLCV values.` };
        }
        if (low > Math.min(open, close) || high < Math.max(open, close) || high < low) {
            return { ok: false, detail: `Row ${index} violates OHLC bounds.` };
        }
        if (closeTime <= openTime) {
            return { ok: false, detail: `Row ${index} has closeTime <= openTime.` };
        }

        if (previousOpenTime !== null) {
            const delta = openTime - previousOpenTime;
            if (delta <= 0) {
                return { ok: false, detail: `Klines are duplicated or out of order at row ${index}.` };
            }
            if (delta !== expectedIntervalMs) {
                return {
                    ok: false,
                    detail: `Kline gap detected at row ${index}: ${delta}ms instead of ${expectedIntervalMs}ms.`,
                };
            }
        }
        previousOpenTime = openTime;
    }

    return { ok: true, detail: `${rows.length} chronological klines with no gaps or OHLC violations.` };
}

export function validateTopOfBook(
    bid: number,
    ask: number,
    bidQty?: number,
    askQty?: number,
): { ok: boolean; detail: string } {
    if (![bid, ask].every((value) => Number.isFinite(value) && value > 0)) {
        return { ok: false, detail: 'Best bid/ask must be finite positive numbers.' };
    }
    if (bid >= ask) {
        return { ok: false, detail: `Crossed/locked book: bid=${bid}, ask=${ask}.` };
    }
    if (bidQty !== undefined && (!Number.isFinite(bidQty) || bidQty <= 0)) {
        return { ok: false, detail: `Invalid best-bid quantity: ${bidQty}.` };
    }
    if (askQty !== undefined && (!Number.isFinite(askQty) || askQty <= 0)) {
        return { ok: false, detail: `Invalid best-ask quantity: ${askQty}.` };
    }
    const mid = (bid + ask) / 2;
    const spreadBps = ((ask - bid) / mid) * 10_000;
    return { ok: true, detail: `bid=${bid}, ask=${ask}, spread=${spreadBps.toFixed(3)} bps.` };
}

export class BinanceDataHealthChecker {
    private readonly symbol: string;
    private readonly interval: string;
    private readonly spotBaseUrl: string;
    private readonly futuresBaseUrl: string;
    private readonly spotWsBaseUrl: string;
    private readonly futuresWsBaseUrl: string;
    private readonly timeoutMs: number;
    private readonly websocketTimeoutMs: number;
    private readonly apiKey: string;
    private readonly apiSecret: string;
    private readonly includePrivate: boolean;
    private readonly spotHttp: AxiosInstance;
    private readonly futuresHttp: AxiosInstance;

    constructor(options: BinanceDataHealthOptions = {}) {
        this.symbol = (options.symbol ?? process.env.BINANCE_DATA_SYMBOL ?? 'BTCUSDT').trim().toUpperCase();
        this.interval = options.interval ?? process.env.BINANCE_DATA_INTERVAL ?? '1m';
        this.spotBaseUrl = (options.spotBaseUrl ?? process.env.BINANCE_BASE_URL ?? 'https://api.binance.com').replace(/\/$/, '');
        this.futuresBaseUrl = (options.futuresBaseUrl ?? process.env.BINANCE_FUTURES_BASE_URL ?? 'https://fapi.binance.com').replace(/\/$/, '');
        this.spotWsBaseUrl = (options.spotWsBaseUrl ?? process.env.BINANCE_SPOT_WS_BASE_URL ?? 'wss://stream.binance.com:9443').replace(/\/$/, '');
        this.futuresWsBaseUrl = (options.futuresWsBaseUrl ?? process.env.BINANCE_FUTURES_WS_BASE_URL ?? 'wss://fstream.binance.com').replace(/\/$/, '');
        this.timeoutMs = options.timeoutMs ?? 10_000;
        this.websocketTimeoutMs = options.websocketTimeoutMs ?? 15_000;
        this.apiKey = options.apiKey ?? process.env.BINANCE_API_KEY ?? '';
        this.apiSecret = options.apiSecret ?? process.env.BINANCE_API_SECRET ?? '';
        this.includePrivate = options.includePrivate ?? false;

        this.spotHttp = axios.create({ baseURL: this.spotBaseUrl, timeout: this.timeoutMs });
        this.futuresHttp = axios.create({ baseURL: this.futuresBaseUrl, timeout: this.timeoutMs });
    }

    async run(): Promise<HealthCheckResult[]> {
        const results: HealthCheckResult[] = [];
        results.push(...this.checkConfiguration());
        results.push(...await this.checkSpotRest());
        results.push(...await this.checkFuturesRest());
        results.push(await this.checkWebSocket('SPOT_WS'));
        results.push(await this.checkWebSocket('FUTURES_WS'));

        if (this.includePrivate) {
            results.push(...await this.checkPrivateReadOnly());
        } else {
            results.push({
                scope: 'PRIVATE',
                check: 'authenticated read-only API',
                status: 'SKIP',
                detail: 'Skipped. Re-run with --private to verify BINANCE_API_KEY/BINANCE_API_SECRET without placing orders.',
            });
        }

        return results;
    }

    private checkConfiguration(): HealthCheckResult[] {
        const results: HealthCheckResult[] = [];
        const insecureTls = process.env.ALLOW_INSECURE_TLS !== 'false';
        results.push({
            scope: 'CONFIG',
            check: 'TLS fail-closed',
            status: insecureTls ? 'FAIL' : 'PASS',
            detail: insecureTls
                ? 'ALLOW_INSECURE_TLS is not explicitly false; current PublicCryptoService can retry with certificate verification disabled.'
                : 'ALLOW_INSECURE_TLS=false.',
        });

        results.push({
            scope: 'CONFIG',
            check: 'symbol',
            status: /^[A-Z0-9]{5,20}$/.test(this.symbol) ? 'PASS' : 'FAIL',
            detail: this.symbol,
        });
        return results;
    }

    private async checkSpotRest(): Promise<HealthCheckResult[]> {
        const out: HealthCheckResult[] = [];
        out.push(await this.restCheck('SPOT_REST', 'ping', async () => {
            const response = await this.timedGet<Record<string, never>>(this.spotHttp, '/api/v3/ping');
            return { latencyMs: response.latencyMs, detail: 'Spot REST reachable.' };
        }));

        out.push(await this.restCheck('SPOT_REST', 'server clock', async () => {
            const { offsetMs, latencyMs } = await this.measureClock(this.spotHttp, '/api/v3/time');
            return {
                latencyMs,
                status: classifyClockDrift(offsetMs),
                detail: `server offset=${offsetMs.toFixed(0)}ms; RTT=${latencyMs}ms.`,
            };
        }));

        out.push(await this.restCheck('SPOT_REST', 'exchangeInfo + filters', async () => {
            const response = await this.timedGet<SpotExchangeInfo>(this.spotHttp, '/api/v3/exchangeInfo', { symbol: this.symbol });
            const info = response.data.symbols?.find((item) => item.symbol === this.symbol);
            if (!info) throw new Error(`${this.symbol} absent from Spot exchangeInfo.`);
            const filterTypes = info.filters.map((filter) => String(filter.filterType ?? '')).filter(Boolean);
            const required = ['PRICE_FILTER', 'LOT_SIZE'];
            const missing = required.filter((filter) => !filterTypes.includes(filter));
            if (missing.length > 0) throw new Error(`Missing filters: ${missing.join(', ')}`);
            const notional = filterTypes.includes('NOTIONAL') || filterTypes.includes('MIN_NOTIONAL');
            const marketLot = filterTypes.includes('MARKET_LOT_SIZE');
            return {
                latencyMs: response.latencyMs,
                status: info.status === 'TRADING' && notional ? (marketLot ? 'PASS' : 'WARN') : 'FAIL',
                detail: `status=${info.status}, base=${info.baseAsset}, quote=${info.quoteAsset}, filters=${filterTypes.join('|')}`,
            };
        }));

        out.push(await this.restCheck('SPOT_REST', 'klines integrity', async () => {
            const response = await this.timedGet<unknown[]>(this.spotHttp, '/api/v3/klines', {
                symbol: this.symbol,
                interval: this.interval,
                limit: 30,
            });
            const result = validateKlines(response.data, this.intervalToMs(this.interval));
            if (!result.ok) throw new Error(result.detail);
            return { latencyMs: response.latencyMs, detail: result.detail };
        }));

        out.push(await this.restCheck('SPOT_REST', 'bookTicker', async () => {
            const response = await this.timedGet<BookTicker>(this.spotHttp, '/api/v3/ticker/bookTicker', { symbol: this.symbol });
            const result = validateTopOfBook(
                Number(response.data.bidPrice),
                Number(response.data.askPrice),
                Number(response.data.bidQty),
                Number(response.data.askQty),
            );
            if (!result.ok) throw new Error(result.detail);
            return { latencyMs: response.latencyMs, detail: result.detail };
        }));

        out.push(await this.restCheck('SPOT_REST', 'depth snapshot', async () => {
            const response = await this.timedGet<DepthSnapshot>(this.spotHttp, '/api/v3/depth', { symbol: this.symbol, limit: 20 });
            const bestBid = response.data.bids?.[0];
            const bestAsk = response.data.asks?.[0];
            if (!bestBid || !bestAsk || !Number.isFinite(response.data.lastUpdateId)) {
                throw new Error('Depth snapshot lacks lastUpdateId/top levels.');
            }
            const result = validateTopOfBook(Number(bestBid[0]), Number(bestAsk[0]), Number(bestBid[1]), Number(bestAsk[1]));
            if (!result.ok) throw new Error(result.detail);
            return { latencyMs: response.latencyMs, detail: `updateId=${response.data.lastUpdateId}; ${result.detail}` };
        }));

        out.push(await this.restCheck('SPOT_REST', 'aggregate trades', async () => {
            const response = await this.timedGet<Array<{ a?: number; p?: string; q?: string; T?: number }>>(
                this.spotHttp,
                '/api/v3/aggTrades',
                { symbol: this.symbol, limit: 20 },
            );
            if (!Array.isArray(response.data) || response.data.length === 0) throw new Error('No aggregate trades returned.');
            const bad = response.data.find((trade) => Number(trade.p) <= 0 || Number(trade.q) <= 0 || !Number.isFinite(Number(trade.T)));
            if (bad) throw new Error('Aggregate trade contains invalid price/qty/time.');
            return { latencyMs: response.latencyMs, detail: `${response.data.length} valid aggregate trades.` };
        }));

        return out;
    }

    private async checkFuturesRest(): Promise<HealthCheckResult[]> {
        const out: HealthCheckResult[] = [];
        out.push(await this.restCheck('FUTURES_REST', 'ping', async () => {
            const response = await this.timedGet<Record<string, never>>(this.futuresHttp, '/fapi/v1/ping');
            return { latencyMs: response.latencyMs, detail: 'USDⓈ-M Futures REST reachable.' };
        }));

        out.push(await this.restCheck('FUTURES_REST', 'server clock', async () => {
            const { offsetMs, latencyMs } = await this.measureClock(this.futuresHttp, '/fapi/v1/time');
            return {
                latencyMs,
                status: classifyClockDrift(offsetMs),
                detail: `server offset=${offsetMs.toFixed(0)}ms; RTT=${latencyMs}ms.`,
            };
        }));

        out.push(await this.restCheck('FUTURES_REST', 'exchangeInfo + filters', async () => {
            const response = await this.timedGet<FuturesExchangeInfo>(this.futuresHttp, '/fapi/v1/exchangeInfo');
            const info = response.data.symbols?.find((item) => item.symbol === this.symbol);
            if (!info) throw new Error(`${this.symbol} absent from Futures exchangeInfo.`);
            const filterTypes = info.filters.map((filter) => String(filter.filterType ?? '')).filter(Boolean);
            const required = ['PRICE_FILTER', 'LOT_SIZE', 'MARKET_LOT_SIZE'];
            const missing = required.filter((filter) => !filterTypes.includes(filter));
            if (missing.length > 0) throw new Error(`Missing filters: ${missing.join(', ')}`);
            return {
                latencyMs: response.latencyMs,
                status: info.status === 'TRADING' && info.contractType === 'PERPETUAL' ? 'PASS' : 'WARN',
                detail: `status=${info.status}, contract=${info.contractType}, filters=${filterTypes.join('|')}`,
            };
        }));

        out.push(await this.restCheck('FUTURES_REST', 'klines integrity', async () => {
            const response = await this.timedGet<unknown[]>(this.futuresHttp, '/fapi/v1/klines', {
                symbol: this.symbol,
                interval: this.interval,
                limit: 30,
            });
            const result = validateKlines(response.data, this.intervalToMs(this.interval));
            if (!result.ok) throw new Error(result.detail);
            return { latencyMs: response.latencyMs, detail: result.detail };
        }));

        out.push(await this.restCheck('FUTURES_REST', 'bookTicker', async () => {
            const response = await this.timedGet<BookTicker>(this.futuresHttp, '/fapi/v1/ticker/bookTicker', { symbol: this.symbol });
            const result = validateTopOfBook(
                Number(response.data.bidPrice),
                Number(response.data.askPrice),
                Number(response.data.bidQty),
                Number(response.data.askQty),
            );
            if (!result.ok) throw new Error(result.detail);
            return { latencyMs: response.latencyMs, detail: result.detail };
        }));

        out.push(await this.restCheck('FUTURES_REST', 'depth snapshot', async () => {
            const response = await this.timedGet<DepthSnapshot>(this.futuresHttp, '/fapi/v1/depth', { symbol: this.symbol, limit: 20 });
            const bestBid = response.data.bids?.[0];
            const bestAsk = response.data.asks?.[0];
            if (!bestBid || !bestAsk || !Number.isFinite(response.data.lastUpdateId)) {
                throw new Error('Futures depth snapshot lacks lastUpdateId/top levels.');
            }
            const result = validateTopOfBook(Number(bestBid[0]), Number(bestAsk[0]), Number(bestBid[1]), Number(bestAsk[1]));
            if (!result.ok) throw new Error(result.detail);
            return { latencyMs: response.latencyMs, detail: `updateId=${response.data.lastUpdateId}; ${result.detail}` };
        }));

        out.push(await this.restCheck('FUTURES_REST', 'mark price + funding metadata', async () => {
            const response = await this.timedGet<FuturesPremiumIndex>(this.futuresHttp, '/fapi/v1/premiumIndex', { symbol: this.symbol });
            const mark = Number(response.data.markPrice);
            const index = Number(response.data.indexPrice);
            if (!(mark > 0) || !(index > 0)) throw new Error('Invalid mark/index price.');
            const basisBps = ((mark - index) / index) * 10_000;
            return {
                latencyMs: response.latencyMs,
                detail: `mark=${mark}, index=${index}, mark-index=${basisBps.toFixed(3)} bps, funding=${response.data.lastFundingRate ?? 'n/a'}`,
            };
        }));

        return out;
    }

    private async checkWebSocket(scope: 'SPOT_WS' | 'FUTURES_WS'): Promise<HealthCheckResult> {
        const lower = this.symbol.toLowerCase();
        const streams = scope === 'SPOT_WS'
            ? [`${lower}@bookTicker`, `${lower}@aggTrade`, `${lower}@kline_${this.interval}`]
            : [`${lower}@bookTicker`, `${lower}@aggTrade`, `${lower}@markPrice@1s`, `${lower}@kline_${this.interval}`];
        const base = scope === 'SPOT_WS' ? this.spotWsBaseUrl : this.futuresWsBaseUrl;
        const url = `${base}/stream?streams=${streams.join('/')}`;
        const start = Date.now();

        return new Promise<HealthCheckResult>((resolve) => {
            const seen = new Set<string>();
            let settled = false;
            const ws = new WebSocket(url);
            const finish = (status: HealthStatus, detail: string): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                try { ws.close(); } catch { /* no-op */ }
                resolve({ scope, check: 'combined realtime streams', status, detail, latencyMs: Date.now() - start });
            };
            const timer = setTimeout(() => {
                const missing = streams.filter((stream) => !seen.has(stream));
                finish('FAIL', `Timed out waiting for streams: ${missing.join(', ')}`);
            }, this.websocketTimeoutMs);

            ws.on('error', (error) => finish('FAIL', `WebSocket error: ${error.message}`));
            ws.on('message', (raw) => {
                try {
                    const message = JSON.parse(raw.toString()) as { stream?: string; data?: Record<string, unknown> };
                    if (!message.stream || !message.data) return;
                    seen.add(message.stream);
                    if (seen.size === streams.length) {
                        finish('PASS', `Received realtime data from ${Array.from(seen).join(', ')}.`);
                    }
                } catch (error) {
                    finish('FAIL', `Invalid WebSocket JSON: ${(error as Error).message}`);
                }
            });
        });
    }

    private async checkPrivateReadOnly(): Promise<HealthCheckResult[]> {
        if (!this.apiKey || !this.apiSecret) {
            return [{
                scope: 'PRIVATE',
                check: 'authenticated read-only API',
                status: 'FAIL',
                detail: 'BINANCE_API_KEY/BINANCE_API_SECRET are missing. Do not paste them into chat; keep them in local .env.',
            }];
        }

        const results: HealthCheckResult[] = [];
        results.push(await this.restCheck('PRIVATE', 'Spot account signature/read', async () => {
            const serverTime = (await this.spotHttp.get<ServerTimeResponse>('/api/v3/time')).data.serverTime;
            const response = await this.signedGet<Record<string, unknown>>(this.spotHttp, '/api/v3/account', serverTime, { omitZeroBalances: true });
            const permissions = Array.isArray(response.data.permissions) ? response.data.permissions.join(',') : 'n/a';
            return { latencyMs: response.latencyMs, detail: `Signed Spot USER_DATA works; permissions=${permissions}. No order was placed.` };
        }));

        results.push(await this.restCheck('PRIVATE', 'Futures account signature/read', async () => {
            const serverTime = (await this.futuresHttp.get<ServerTimeResponse>('/fapi/v1/time')).data.serverTime;
            const response = await this.signedGet<Record<string, unknown>>(this.futuresHttp, '/fapi/v3/account', serverTime);
            const canTrade = String(response.data.canTrade ?? 'n/a');
            return { latencyMs: response.latencyMs, detail: `Signed Futures USER_DATA works; canTrade=${canTrade}. No order was placed.` };
        }));

        return results;
    }

    private async signedGet<T>(
        client: AxiosInstance,
        path: string,
        timestamp: number,
        extra: Record<string, string | number | boolean> = {},
    ): Promise<TimedResponse<T>> {
        const params: Record<string, string | number | boolean> = {
            ...extra,
            recvWindow: 5_000,
            timestamp,
        };
        const query = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => query.append(key, String(value)));
        const signature = crypto.createHmac('sha256', this.apiSecret).update(query.toString()).digest('hex');
        const start = Date.now();
        const response = await client.get<T>(`${path}?${query.toString()}&signature=${signature}`, {
            headers: { 'X-MBX-APIKEY': this.apiKey },
        });
        return {
            data: response.data,
            latencyMs: Date.now() - start,
            headers: response.headers as Record<string, unknown>,
        };
    }

    private async measureClock(client: AxiosInstance, path: string): Promise<{ offsetMs: number; latencyMs: number }> {
        const start = Date.now();
        const response = await client.get<ServerTimeResponse>(path);
        const end = Date.now();
        const midpoint = (start + end) / 2;
        return { offsetMs: response.data.serverTime - midpoint, latencyMs: end - start };
    }

    private async timedGet<T>(
        client: AxiosInstance,
        path: string,
        params?: Record<string, string | number>,
    ): Promise<TimedResponse<T>> {
        const start = Date.now();
        const response = await client.get<T>(path, { params });
        return {
            data: response.data,
            latencyMs: Date.now() - start,
            headers: response.headers as Record<string, unknown>,
        };
    }

    private async restCheck(
        scope: HealthCheckResult['scope'],
        check: string,
        task: () => Promise<{ detail: string; latencyMs?: number; status?: HealthStatus }>,
    ): Promise<HealthCheckResult> {
        try {
            const result = await task();
            return {
                scope,
                check,
                status: result.status ?? 'PASS',
                detail: result.detail,
                latencyMs: result.latencyMs,
            };
        } catch (error) {
            const axiosError = error as AxiosError<{ code?: number; msg?: string }>;
            const statusCode = axiosError.response?.status;
            const code = axiosError.response?.data?.code;
            const message = axiosError.response?.data?.msg ?? axiosError.message ?? String(error);
            return {
                scope,
                check,
                status: 'FAIL',
                detail: [statusCode ? `HTTP ${statusCode}` : '', code !== undefined ? `Binance ${code}` : '', message]
                    .filter(Boolean)
                    .join(' | '),
            };
        }
    }

    private intervalToMs(interval: string): number {
        const match = /^(\d+)([smhdw])$/.exec(interval);
        if (!match) throw new Error(`Health check currently supports fixed intervals s/m/h/d/w; received ${interval}.`);
        const value = Number(match[1]);
        const unit = match[2];
        const multipliers: Record<string, number> = {
            s: 1_000,
            m: 60_000,
            h: 3_600_000,
            d: 86_400_000,
            w: 604_800_000,
        };
        return value * multipliers[unit];
    }
}
