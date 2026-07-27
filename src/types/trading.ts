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

export type TimeFrame =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '8h'
  | '12h'
  | '1d'
  | '3d'
  | '1w'
  | '1M';
