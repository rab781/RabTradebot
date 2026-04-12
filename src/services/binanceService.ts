import axios, { AxiosProxyConfig } from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface BinancePublicHealth {
    reachable: boolean;
    latencyMs: number;
    serverTime?: number;
    serverTimeOffset?: number; // local - server (ms)
    error?: string;
}

export interface BinancePrivateHealth {
    configured: boolean;
    authenticated: boolean;
    accountType?: string;
    canTrade?: boolean;
    canWithdraw?: boolean;
    canDeposit?: boolean;
    balances?: Array<{
        asset: string;
        free: string;
        locked: string;
    }>;
    error?: string;
}

export interface BinanceRateLimitInfo {
    rateLimitType: string;
    interval: string;
    intervalNum: number;
    limit: number;
}

export interface BinanceHealthStatus {
    timestamp: Date;
    publicApi: BinancePublicHealth;
    privateApi: BinancePrivateHealth;
    rateLimits?: BinanceRateLimitInfo[];
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export class BinanceService {
    private readonly BASE_URL: string;
    private apiKey: string;
    private apiSecret: string;
    private readonly httpsAgent?: https.Agent;
    private readonly proxyConfig?: AxiosProxyConfig;

    constructor() {
        this.BASE_URL = process.env.BINANCE_BASE_URL || 'https://api.binance.com';
        this.apiKey = process.env.BINANCE_API_KEY || '';
        this.apiSecret = process.env.BINANCE_API_SECRET || '';

        const tlsInsecure = /^(1|true|yes)$/i.test(process.env.BINANCE_TLS_INSECURE || '');
        const caCertPath = process.env.BINANCE_CA_CERT_PATH || '';
        const proxyUrl = process.env.BINANCE_PROXY_URL || '';

        if (proxyUrl) {
            this.proxyConfig = this.parseProxyUrl(proxyUrl);
            if (this.proxyConfig) {
                const proxyAuth = this.proxyConfig.auth?.username ? 'with auth' : 'without auth';
                logger.info(`🌐 [BinanceService] Using proxy ${this.proxyConfig.protocol}//${this.proxyConfig.host}:${this.proxyConfig.port} (${proxyAuth})`);
            } else {
                logger.error('❌ [BinanceService] BINANCE_PROXY_URL is invalid and will be ignored');
            }
        }

        if (tlsInsecure) {
            this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
            logger.warn('⚠️  [BinanceService] BINANCE_TLS_INSECURE=true, TLS certificate verification is disabled');
        } else if (caCertPath) {
            try {
                const ca = fs.readFileSync(caCertPath, 'utf-8');
                this.httpsAgent = new https.Agent({ ca, rejectUnauthorized: true });
                logger.info(`✅ [BinanceService] Loaded custom CA certificate from ${caCertPath}`);
            } catch (error) {
                logger.error(`❌ [BinanceService] Failed to load BINANCE_CA_CERT_PATH (${caCertPath}): ${(error as Error).message}`);
            }
        }

        if (!this.apiKey || !this.apiSecret) {
            logger.warn('⚠️  [BinanceService] BINANCE_API_KEY / BINANCE_API_SECRET not set in environment');
        }

        logger.info(`🔗 [BinanceService] Using base URL: ${this.BASE_URL}`);
    }

    private requestConfig(timeout: number, extra: Record<string, any> = {}): Record<string, any> {
        if (this.proxyConfig) {
            return {
                timeout,
                proxy: this.proxyConfig,
                ...extra,
            };
        }

        if (!this.httpsAgent) {
            return { timeout, ...extra };
        }

        return {
            timeout,
            httpsAgent: this.httpsAgent,
            ...extra,
        };
    }

    private parseProxyUrl(proxyUrl: string): AxiosProxyConfig | undefined {
        try {
            const parsed = new URL(proxyUrl);
            if (!parsed.hostname || !parsed.port) {
                return undefined;
            }

            const proxyConfig: AxiosProxyConfig = {
                protocol: parsed.protocol.replace(':', ''),
                host: parsed.hostname,
                port: Number(parsed.port),
            };

            if (parsed.username || parsed.password) {
                proxyConfig.auth = {
                    username: decodeURIComponent(parsed.username),
                    password: decodeURIComponent(parsed.password),
                };
            }

            return proxyConfig;
        } catch {
            return undefined;
        }
    }

    // ── helpers ──────────────────────────────

    /** Returns true when both key and secret are present in the environment. */
    isConfigured(): boolean {
        return !!this.apiKey && !!this.apiSecret;
    }

    /**
     * Create an HMAC-SHA256 signature required by authenticated Binance endpoints.
     */
    private sign(queryString: string): string {
        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(queryString)
            .digest('hex');
    }

    // ── public health ─────────────────────────

    /**
     * Verify that the Binance public REST API is reachable.
     * Measures round-trip latency and calculates the clock offset between
     * your server and Binance's server (important for signed requests).
     */
    async checkPublicHealth(): Promise<BinancePublicHealth> {
        const start = Date.now();

        try {
            // 1. Ping – smallest possible call to measure latency
            await axios.get(`${this.BASE_URL}/api/v3/ping`, this.requestConfig(8000));
            const latencyMs = Date.now() - start;

            // 2. Server time – calculate clock drift
            const t0 = Date.now();
            const timeRes = await axios.get(`${this.BASE_URL}/api/v3/time`, this.requestConfig(8000));
            const t1 = Date.now();

            const serverTime: number = timeRes.data.serverTime;
            // Estimate local time at the moment the server generated its response
            const localTimeAtResponse = Math.round((t0 + t1) / 2);
            const serverTimeOffset = localTimeAtResponse - serverTime;

            return {
                reachable: true,
                latencyMs,
                serverTime,
                serverTimeOffset,
            };
        } catch (error: any) {
            return {
                reachable: false,
                latencyMs: Date.now() - start,
                error: this.parseAxiosError(error),
            };
        }
    }

    // ── private / authenticated health ────────

    /**
     * Attempt an authenticated call to GET /api/v3/account.
     * Returns account type, trading permissions, and any non-zero balances.
     */
    async checkPrivateAuth(): Promise<BinancePrivateHealth> {
        if (!this.isConfigured()) {
            return { configured: false, authenticated: false };
        }

        try {
            const timestamp = Date.now();
            const queryString = `timestamp=${timestamp}`;
            const signature = this.sign(queryString);

            const response = await axios.get(`${this.BASE_URL}/api/v3/account`, {
                ...this.requestConfig(12000, {
                    params: { timestamp, signature },
                    headers: { 'X-MBX-APIKEY': this.apiKey },
                }),
            });

            const data = response.data;

            // Only include non-zero balances, capped at 15 for readability
            const nonZeroBalances: BinancePrivateHealth['balances'] = (data.balances ?? [])
                .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
                .slice(0, 15)
                .map((b: any) => ({
                    asset: b.asset as string,
                    free: b.free as string,
                    locked: b.locked as string,
                }));

            return {
                configured: true,
                authenticated: true,
                accountType: data.accountType ?? 'SPOT',
                canTrade: data.canTrade,
                canWithdraw: data.canWithdraw,
                canDeposit: data.canDeposit,
                balances: nonZeroBalances,
            };
        } catch (error: any) {
            return {
                configured: true,
                authenticated: false,
                error: this.parsePrivateError(error),
            };
        }
    }

    // ── rate-limit snapshot ───────────────────

    /**
     * Fetch exchange info to read current rate-limit rules.
     * Useful for understanding how many requests per minute are allowed.
     */
    async getRateLimits(): Promise<BinanceRateLimitInfo[]> {
        try {
            const res = await axios.get(`${this.BASE_URL}/api/v3/exchangeInfo`, {
                ...this.requestConfig(10000),
            });
            return (res.data.rateLimits ?? []) as BinanceRateLimitInfo[];
        } catch {
            return [];
        }
    }

    // ── combined health check ─────────────────

    /**
     * Run all checks in parallel and return a single consolidated status object.
     */
    async getFullHealthStatus(): Promise<BinanceHealthStatus> {
        const [publicApi, privateApi, rateLimits] = await Promise.all([
            this.checkPublicHealth(),
            this.checkPrivateAuth(),
            this.getRateLimits(),
        ]);

        return {
            timestamp: new Date(),
            publicApi,
            privateApi,
            rateLimits,
        };
    }

    // ── formatted report ──────────────────────

    /**
     * Format a `BinanceHealthStatus` into a human-readable Telegram message.
     */
    formatHealthReport(status: BinanceHealthStatus): string {
        const { publicApi, privateApi, rateLimits, timestamp } = status;

        // ── Public API block ──────────────────
        const pubStatusLine = publicApi.reachable
            ? '✅ Online'
            : '❌ Offline';

        const latencyEmoji =
            !publicApi.reachable
                ? '⚫'
                : publicApi.latencyMs < 100
                ? '🟢'
                : publicApi.latencyMs < 300
                ? '🟡'
                : '🔴';

        const latencyLine = publicApi.reachable
            ? `${latencyEmoji} Latency: ${publicApi.latencyMs} ms`
            : `${latencyEmoji} Latency: N/A`;

        let offsetLine = '';
        if (publicApi.reachable && publicApi.serverTimeOffset !== undefined) {
            const absOffset = Math.abs(publicApi.serverTimeOffset);
            const direction = publicApi.serverTimeOffset > 0 ? 'behind' : 'ahead';
            const offsetEmoji = absOffset < 1000 ? '🟢' : absOffset < 3000 ? '🟡' : '🔴';

            offsetLine = `${offsetEmoji} Clock offset: ${absOffset} ms (your clock is ${direction} of Binance)`;

            if (absOffset > 1000) {
                offsetLine += '\n  ⚠️  Large offset may cause signed requests to fail!';
            }
        }

        const publicErrorLine = !publicApi.reachable
            ? `\n❌ Error: ${publicApi.error ?? 'Unknown'}`
            : '';

        const publicBlock = [
            '📡 PUBLIC API',
            `Status: ${pubStatusLine}`,
            latencyLine,
            offsetLine,
            publicErrorLine,
        ]
            .filter(Boolean)
            .join('\n');

        // ── Private API block ─────────────────
        let privateBlock: string;

        if (!privateApi.configured) {
            privateBlock = [
                '🔑 PRIVATE API (Authentication)',
                'Status: ⚠️  Not configured',
                '',
                '💡 To enable private API checks:',
                '   1. Log in to Binance',
                '   2. Go to API Management',
                '   3. Create a new API key',
                '   4. Add to your .env file:',
                '      BINANCE_API_KEY=your_key',
                '      BINANCE_API_SECRET=your_secret',
            ].join('\n');
        } else if (privateApi.authenticated) {
            const permissionsLine = [
                privateApi.canTrade ? '✅ Trade' : '❌ Trade',
                privateApi.canWithdraw ? '✅ Withdraw' : '❌ Withdraw',
                privateApi.canDeposit ? '✅ Deposit' : '❌ Deposit',
            ].join('  |  ');

            let balancesBlock = '';
            if (privateApi.balances && privateApi.balances.length > 0) {
                const rows = privateApi.balances
                    .map(
                        (b) =>
                            `  • ${b.asset.padEnd(6)} free: ${parseFloat(b.free).toFixed(6)}` +
                            (parseFloat(b.locked) > 0
                                ? `  locked: ${parseFloat(b.locked).toFixed(6)}`
                                : '')
                    )
                    .join('\n');
                balancesBlock = `\n💰 Non-zero balances:\n${rows}`;
            } else {
                balancesBlock = '\n💰 Balances: No non-zero assets found';
            }

            privateBlock = [
                '🔑 PRIVATE API (Authentication)',
                'Status: ✅ Authenticated',
                `Account type: ${privateApi.accountType ?? 'SPOT'}`,
                `Permissions: ${permissionsLine}`,
                balancesBlock,
            ]
                .filter(Boolean)
                .join('\n');
        } else {
            privateBlock = [
                '🔑 PRIVATE API (Authentication)',
                'Status: ❌ Auth failed',
                `Error: ${privateApi.error ?? 'Unknown error'}`,
                '',
                '💡 Troubleshooting:',
                '   • Verify BINANCE_API_KEY is correct',
                '   • Verify BINANCE_API_SECRET is correct',
                '   • Check that "Spot & Margin Trading" is enabled on the key',
                '   • Ensure your IP is whitelisted (if IP restriction is on)',
            ].join('\n');
        }

        // ── Rate limits block ─────────────────
        let rateLimitsBlock = '';
        if (rateLimits && rateLimits.length > 0) {
            const rows = rateLimits
                .map(
                    (r) =>
                        `  • ${r.rateLimitType}: ${r.limit} / ${r.intervalNum}${r.interval.toLowerCase()}`
                )
                .join('\n');
            rateLimitsBlock = `\n📊 Rate limits:\n${rows}`;
        }

        // ── Assemble full report ──────────────
        const separator = '─'.repeat(30);

        return [
            '🏦 BINANCE API STATUS',
            separator,
            publicBlock,
            separator,
            privateBlock,
            rateLimitsBlock,
            separator,
            `🕐 Checked at: ${timestamp.toLocaleString()}`,
        ]
            .filter(Boolean)
            .join('\n');
    }

    // ── error parsers ─────────────────────────

    private parseAxiosError(error: any): string {
        if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
            return 'DNS resolution failed – check your internet connection';
        }
        if (error.code === 'ECONNREFUSED') {
            return 'Connection refused – Binance may be temporarily down';
        }
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            return 'Request timed out – network may be slow or blocked';
        }
        if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || error.code === 'SELF_SIGNED_CERT_IN_CHAIN' || /local issuer certificate/i.test(error.message || '')) {
            return 'TLS certificate validation failed (local issuer certificate). Set BINANCE_CA_CERT_PATH to your CA bundle or BINANCE_TLS_INSECURE=true for temporary bypass';
        }
        if (error.response?.status === 429) {
            return 'Rate limit exceeded – too many requests';
        }
        if (error.response?.status === 418) {
            return 'IP banned temporarily (rate limit was exceeded repeatedly)';
        }
        if (error.response?.status === 403) {
            return 'Request blocked (403) – possible IP/region restriction, firewall/proxy policy, or endpoint access denial';
        }
        return error.message ?? 'Unknown network error';
    }

    private parsePrivateError(error: any): string {
        const status = error.response?.status as number | undefined;
        const binanceCode = error.response?.data?.code as number | undefined;
        const binanceMsg = error.response?.data?.msg as string | undefined;

        if (
            error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
            error.code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
            /local issuer certificate/i.test(error.message || '')
        ) {
            return 'TLS certificate validation failed (local issuer certificate). Set BINANCE_CA_CERT_PATH to your CA bundle or BINANCE_TLS_INSECURE=true for temporary bypass';
        }

        if (binanceCode === -2014) return 'API-key format invalid';
        if (binanceCode === -2015) return 'Invalid API-key, IP, or permissions';
        if (binanceCode === -1022) return 'Invalid signature – check your API secret';
        if (binanceCode === -1100) return 'Illegal characters in parameter';
        if (binanceCode === -1021)
            return 'Timestamp out of sync – your system clock may be drifting';
        if (status === 401) return 'Unauthorized – invalid API key or secret';
        if (status === 403) {
            return 'Forbidden (403) – possible API key permission issue, IP whitelist mismatch, or regional endpoint restriction';
        }
        if (status === 429) return 'Rate limit exceeded';

        return binanceMsg ?? error.message ?? 'Unknown authentication error';
    }
}
