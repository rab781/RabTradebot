/**
 * Bot State Manager
 * Central service untuk share data antara Telegram bot dan Web Dashboard
 */

export interface Trade {
    id: string;
    symbol: string;
    action: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    timestamp: Date;
    profit?: number;
    status: 'OPEN' | 'CLOSED';
}

export interface Signal {
    symbol: string;
    action: 'BUY' | 'SELL' | 'HOLD';
    price: number;
    confidence: number;
    timestamp: Date;
    indicators: {
        rsi?: number;
        macd?: { value: number; signal: number };
        bbands?: { upper: number; middle: number; lower: number };
    };
}

export interface NewsItem {
    symbol: string;
    title: string;
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    timestamp: Date;
}

export interface Portfolio {
    totalValue: number;
    positions: {
        symbol: string;
        quantity: number;
        averagePrice: number;
        currentPrice: number;
        pnl: number;
        pnlPercentage: number;
    }[];
    performance: {
        totalPnl: number;
        totalPnlPercentage: number;
        winRate: number;
        totalTrades: number;
    };
}

export interface BotStats {
    uptime: number;
    totalCommands: number;
    activeUsers: number;
    lastUpdate: Date;
}

class BotStateManager {
    private static instance: BotStateManager;

    private trades: Trade[] = [];
    private signals: Signal[] = [];
    private news: NewsItem[] = [];
    private portfolio: Portfolio = {
        totalValue: 10000, // Starting capital
        positions: [],
        performance: {
            totalPnl: 0,
            totalPnlPercentage: 0,
            winRate: 0,
            totalTrades: 0
        }
    };
    private stats: BotStats = {
        uptime: 0,
        totalCommands: 0,
        activeUsers: 0,
        lastUpdate: new Date()
    };

    private eventListeners: Map<string, ((data: any) => void)[]> = new Map();
    private startTime: Date = new Date();

    private constructor() {
        // Update uptime every second
        setInterval(() => {
            this.stats.uptime = Date.now() - this.startTime.getTime();
        }, 1000);
    }

    public static getInstance(): BotStateManager {
        if (!BotStateManager.instance) {
            BotStateManager.instance = new BotStateManager();
        }
        return BotStateManager.instance;
    }

    // Event listener system
    public on(event: string, callback: (data: any) => void) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)!.push(callback);
    }

    private emit(event: string, data: any) {
        const listeners = this.eventListeners.get(event) || [];
        listeners.forEach(callback => callback(data));
    }

    // Trade management
    public addTrade(trade: Trade) {
        this.trades.unshift(trade); // Add to beginning
        if (this.trades.length > 100) {
            this.trades = this.trades.slice(0, 100); // Keep last 100
        }
        this.updateStats();
        this.emit('trade', trade);
    }

    public getTrades(limit: number = 50): Trade[] {
        return this.trades.slice(0, limit);
    }

    public getOpenTrades(): Trade[] {
        return this.trades.filter(t => t.status === 'OPEN');
    }

    // Signal management
    public addSignal(signal: Signal) {
        this.signals.unshift(signal);
        if (this.signals.length > 50) {
            this.signals = this.signals.slice(0, 50);
        }
        this.emit('signal', signal);
    }

    public getSignals(limit: number = 20): Signal[] {
        return this.signals.slice(0, limit);
    }

    // News management
    public addNews(newsItem: NewsItem) {
        this.news.unshift(newsItem);
        if (this.news.length > 50) {
            this.news = this.news.slice(0, 50);
        }
        this.emit('news', newsItem);
    }

    public getNews(limit: number = 20): NewsItem[] {
        return this.news.slice(0, limit);
    }

    // Portfolio management
    public updatePortfolio(portfolio: Partial<Portfolio>) {
        this.portfolio = { ...this.portfolio, ...portfolio };
        this.emit('portfolio', this.portfolio);
    }

    public getPortfolio(): Portfolio {
        return this.portfolio;
    }

    // Stats management
    public incrementCommandCount() {
        this.stats.totalCommands++;
        this.stats.lastUpdate = new Date();
    }

    public setActiveUsers(count: number) {
        this.stats.activeUsers = count;
    }

    public getStats(): BotStats {
        return {
            ...this.stats,
            uptime: Date.now() - this.startTime.getTime()
        };
    }

    private updateStats() {
        const closedTrades = this.trades.filter(t => t.status === 'CLOSED');
        const winningTrades = closedTrades.filter(t => (t.profit || 0) > 0);

        this.portfolio.performance.totalTrades = closedTrades.length;
        this.portfolio.performance.winRate = closedTrades.length > 0
            ? winningTrades.length / closedTrades.length
            : 0;

        const totalProfit = closedTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
        this.portfolio.performance.totalPnl = totalProfit;
        this.portfolio.performance.totalPnlPercentage = (totalProfit / 10000) * 100;
    }

    // Get all data for dashboard
    public getDashboardData() {
        return {
            trades: this.getTrades(50),
            signals: this.getSignals(20),
            news: this.getNews(20),
            portfolio: this.getPortfolio(),
            stats: this.getStats(),
            openTrades: this.getOpenTrades()
        };
    }
}

export default BotStateManager;
