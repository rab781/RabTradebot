export interface Candle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface VolumeAnalysis {
    symbol: string;
    volumeChange24h: number;
    volumeRank: number;
    unusualVolume: boolean;
    recommendation: string;
}

export interface SupportResistance {
    symbol: string;
    supports: number[];
    resistances: number[];
    currentPrice: number;
    nearestSupport: number;
    nearestResistance: number;
}

export interface PriceAlert {
    symbol: string;
    userId: number;
    targetPrice: number;
    type: 'above' | 'below';
    triggered: boolean;
}

export interface MACDResult {
    MACD: number;
    signal: number;
    histogram: number;
}

export interface TradeSignal {
    symbol: string;
    action: 'BUY' | 'SELL' | 'HOLD';
    price: number;
    confidence: number;
    entryPrice?: number;
    exitPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    quantity?: number;
    timestamp: number;
    reason: string;
    indicators?: {
        rsi?: number;
        macd?: MACDResult;
        volume?: number;
    };
}

export interface Position {
    symbol: string;
    side: 'LONG' | 'SHORT';
    size: number;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    unrealizedPnLPercent: number;
    timestamp: number;
}

export interface Portfolio {
    totalValue: number;
    availableBalance: number;
    totalPnL: number;
    totalPnLPercent: number;
    positions: Position[];
}

export interface PerformanceMetrics {
    totalReturn: number;
    totalReturnPercent: number;
    totalTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
}

export interface Trade {
    id: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    fee: number;
    timestamp: number;
    pnl?: number;
    pnlPercent?: number;
}

export interface BacktestResult {
    strategy: string;
    period: string;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalReturn: number;
    totalReturnPercent: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    volatility: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
    bestTrade: Trade | null;
    worstTrade: Trade | null;
    trades: Trade[];
}

export interface RiskMetrics {
    var95: number;
    var99: number;
    expectedShortfall: number;
    maxDrawdown: number;
    volatility: number;
    sharpeRatio: number;
    beta?: number;
    correlations?: { [symbol: string]: number };
}

export interface PaperTradingConfig {
    initialBalance: number;
    leverage: number;
    commission: number;
}

export interface BacktestConfig {
    startDate: Date;
    endDate: Date;
    initialBalance: number;
    commission: number;
}

export type TimeFrame = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '8h' | '12h' | '1d' | '3d' | '1w' | '1M';
