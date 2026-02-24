import { DataFrame } from './dataframe';

export interface IStrategy {
  // Strategy metadata
  name: string;
  version: string;
  timeframe: string;
  canShort: boolean;

  // Risk management
  stoploss: number; // Negative value, e.g., -0.05 for 5% stop loss
  minimalRoi: { [key: string]: number }; // Time-based ROI targets
  trailingStop: boolean;
  trailingStopPositive?: number;
  trailingStopPositiveOffset?: number;

  // Position sizing
  stakeAmount: number | 'unlimited';
  maxOpenTrades: number;

  // Strategy configuration
  startupCandleCount: number;
  processOnlyNewCandles: boolean;
  useExitSignal: boolean;
  exitProfitOnly: boolean;
  exitProfitOffset: number;
  ignoreRoiIfEntrySignal: boolean;

  // Required strategy methods
  populateIndicators(dataframe: DataFrame, metadata: StrategyMetadata): DataFrame;
  populateEntryTrend(dataframe: DataFrame, metadata: StrategyMetadata): DataFrame;
  populateExitTrend(dataframe: DataFrame, metadata: StrategyMetadata): DataFrame;

  // Optional callbacks
  customStoploss?(
    trade: Trade,
    currentTime: Date,
    currentRate: number,
    currentProfit: number
  ): number | null;
  customExitPrice?(
    pair: string,
    trade: Trade,
    currentTime: Date,
    proposedRate: number,
    currentProfit: number
  ): number;
  customEntryPrice?(pair: string, currentTime: Date, proposedRate: number): number;
  confirmTradeEntry?(
    pair: string,
    orderType: string,
    amount: number,
    rate: number,
    time: Date
  ): boolean;
  confirmTradeExit?(
    pair: string,
    trade: Trade,
    orderType: string,
    amount: number,
    rate: number,
    time: Date
  ): boolean;
  botStart?(): void;
  botLoopStart?(currentTime: Date): void;
}

export interface StrategyMetadata {
  pair: string;
  timeframe: string;
  stake_currency: string;
}

export interface Trade {
  id: string;
  pair: string;
  isOpen: boolean;
  side: 'long' | 'short';
  amount: number;
  openRate: number;
  openDate: Date;
  closeRate?: number;
  closeDate?: Date;
  stoplossRate?: number;
  fee: number;
  profit?: number;
  profitPct?: number;
  exitReason?: string;
  entryTag?: string;
  exitTag?: string;
}

export interface StrategyResult {
  enter_long?: number;
  enter_short?: number;
  exit_long?: number;
  exit_short?: number;
  enter_tag?: string;
  exit_tag?: string;
}

export interface BacktestConfig {
  strategy: string;
  timerange: string;
  timeframe: string;
  maxOpenTrades: number;
  stakeAmount: number;
  startingBalance: number;
  feeOpen: number;
  feeClose: number;
  enableProtections: boolean;
  dryRunWallet: number;
}

export interface BacktestResult {
  trades: Trade[];
  finalBalance: number;
  totalTrades: number;
  profitableTrades: number;
  lossTrades: number;
  totalProfit: number;
  totalProfitPct: number;
  avgProfit: number;
  avgProfitPct: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  winRate: number;
  avgTradeDuration: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  calmarRatio: number;
  sortinoRatio: number;
  profitFactor: number;
  startDate: Date;
  endDate: Date;
}

export interface StrategyOptimizationParams {
  [paramName: string]: {
    type: 'int' | 'real' | 'categorical';
    low?: number;
    high?: number;
    values?: any[];
    step?: number;
    default: any;
  };
}

export interface StrategyOptimizationResult {
  params: { [key: string]: any };
  score: number;
  backtestResult: BacktestResult;
}

export interface Position {
  pair: string;
  side: 'long' | 'short';
  amount: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  entryTime: Date;
  stoplossPrice?: number;
  takeProfitPrice?: number;
}
