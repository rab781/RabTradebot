const BinanceFactory = require('node-binance-api');
import { PublicCryptoService } from './publicCryptoService';

interface PriceAlert {
    symbol: string;
    userId: number;
    targetPrice: number;
    type: 'above' | 'below';
    triggered: boolean;
}

export class PriceAlertManager {
    private alerts: PriceAlert[] = [];    private binance: any;
    private publicService: PublicCryptoService;
    private usePublicOnly: boolean = false;

    constructor() {
        // Initialize public service first
        this.publicService = new PublicCryptoService();
        
        // Try to initialize private API, but don't fail if it doesn't work
        try {
            if (process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET) {
                this.binance = new BinanceFactory({
                    APIKEY: process.env.BINANCE_API_KEY,
                    APISECRET: process.env.BINANCE_API_SECRET
                });
                console.log('[PriceAlertManager] Private API initialized');
            } else {
                console.log('[PriceAlertManager] No API credentials found, using public API only');
                this.usePublicOnly = true;
            }
        } catch (error) {
            console.warn('[PriceAlertManager] Failed to initialize private API, falling back to public API:', error);
            this.usePublicOnly = true;
        }
    }

    addAlert(userId: number, symbol: string, targetPrice: number, type: 'above' | 'below'): void {
        this.alerts.push({
            userId,
            symbol,
            targetPrice,
            type,
            triggered: false
        });
    }

    removeAlert(userId: number, symbol: string): void {
        this.alerts = this.alerts.filter(
            alert => !(alert.userId === userId && alert.symbol === symbol)
        );
    }

    async checkAlerts(): Promise<{ userId: number; message: string }[]> {
        const notifications: { userId: number; message: string }[] = [];

        for (const alert of this.alerts) {
            if (alert.triggered) continue;

            try {                const ticker = await this.binance.prices(alert.symbol);
                const currentPrice = parseFloat(String(ticker[alert.symbol]));

                if ((alert.type === 'above' && currentPrice >= alert.targetPrice) ||
                    (alert.type === 'below' && currentPrice <= alert.targetPrice)) {
                    alert.triggered = true;
                    notifications.push({
                        userId: alert.userId,
                        message: `🔔 Price Alert: ${alert.symbol} has reached ${currentPrice} ${alert.type === 'above' ? 'above' : 'below'} your target of ${alert.targetPrice}`
                    });
                }
            } catch (error) {
                console.error(`Error checking price for ${alert.symbol}:`, error);
            }
        }

        return notifications;
    }

    getAlerts(userId: number): PriceAlert[] {
        return this.alerts.filter(alert => alert.userId === userId);
    }
}
