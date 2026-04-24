import { DataFrame, DataFrameBuilder } from '../types/dataframe';
import { IStrategy, StrategyMetadata, Trade, StrategyResult } from '../types/strategy';
import { RSI, MACD, BollingerBands, SMA, EMA } from 'technicalindicators';
import { TradingViewService } from '../services/TradingViewService';
import { logger } from '../utils/logger';

export class SampleStrategy implements IStrategy {
  // Strategy metadata
  name = 'SampleStrategy';
  version = '1.0.0';
  timeframe = '5m';
  canShort = false;

  // Risk management
  stoploss = -0.05; // 5% stop loss
  minimalRoi = {
    '60': 0.01, // 1% ROI after 60 minutes
    '30': 0.02, // 2% ROI after 30 minutes
    '0': 0.04, // 4% ROI immediately
  };
  trailingStop = false;
  trailingStopPositive = 0.01;
  trailingStopPositiveOffset = 0.0;

  // Position sizing
  stakeAmount = 100; // USDT
  maxOpenTrades = 3;

  // Strategy configuration
  startupCandleCount = 30;
  processOnlyNewCandles = true;
  useExitSignal = true;
  exitProfitOnly = false;
  exitProfitOffset = 0.0;
  ignoreRoiIfEntrySignal = false;

  // Hyperoptable parameters
  buyRsi = 30;
  sellRsi = 70;
  shortRsi = 70;
  exitShortRsi = 30;

  // Add TradingView service for better data
  private tradingViewService: TradingViewService;

  constructor() {
    this.tradingViewService = new TradingViewService({
      theme: 'dark',
      interval: this.timeframe,
      symbol: 'BINANCE:BTCUSDT',
      containerId: 'tradingview-chart',
    });
  }

  populateIndicators(dataframe: DataFrame, metadata: StrategyMetadata): DataFrame {
    // Calculate RSI
    const rsiValues = RSI.calculate({
      values: dataframe.close,
      period: 14,
    });
    const rsiColumn = new Array(dataframe.close.length - rsiValues.length)
      .fill(NaN)
      .concat(rsiValues);

    // Calculate MACD
    const macdResult = MACD.calculate({
      values: dataframe.close,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });

    const macdLength = macdResult.length;
    const macdPad = dataframe.close.length - macdLength;
    const macdValues = new Array(macdPad).fill(NaN).concat(macdResult.map((m) => m.MACD || 0));
    const macdSignalValues = new Array(macdPad)
      .fill(NaN)
      .concat(macdResult.map((m) => m.signal || 0));
    const macdHistValues = new Array(macdPad)
      .fill(NaN)
      .concat(macdResult.map((m) => m.histogram || 0));

    // Calculate Bollinger Bands
    const bbResult = BollingerBands.calculate({
      period: 20,
      values: dataframe.close,
      stdDev: 2,
    });

    const bbLength = bbResult.length;
    const bbPad = dataframe.close.length - bbLength;
    const bbUpperValues = new Array(bbPad).fill(NaN).concat(bbResult.map((bb) => bb.upper));
    const bbMiddleValues = new Array(bbPad).fill(NaN).concat(bbResult.map((bb) => bb.middle));
    const bbLowerValues = new Array(bbPad).fill(NaN).concat(bbResult.map((bb) => bb.lower));

    // Calculate moving averages
    const ema10Values = EMA.calculate({
      period: 10,
      values: dataframe.close,
    });
    const ema10Column = new Array(dataframe.close.length - ema10Values.length)
      .fill(NaN)
      .concat(ema10Values);

    const sma20Values = SMA.calculate({
      period: 20,
      values: dataframe.close,
    });
    const sma20Column = new Array(dataframe.close.length - sma20Values.length)
      .fill(NaN)
      .concat(sma20Values);

    // Add indicators to dataframe
    dataframe.rsi = rsiColumn;
    dataframe.macd = macdValues;
    dataframe.macd_signal = macdSignalValues;
    dataframe.macd_hist = macdHistValues;
    dataframe.bb_upper = bbUpperValues;
    dataframe.bb_middle = bbMiddleValues;
    dataframe.bb_lower = bbLowerValues;
    dataframe.ema10 = ema10Column;
    dataframe.sma20 = sma20Column;

    return dataframe;
  }

  populateEntryTrend(dataframe: DataFrame, metadata: StrategyMetadata): DataFrame {
    const length = dataframe.close.length;

    // Initialize signal columns
    dataframe.enter_long = new Array(length).fill(0);
    dataframe.enter_short = new Array(length).fill(0);
    dataframe.enter_tag = new Array(length).fill('');

    // Long entry signals
    for (let i = 1; i < length; i++) {
      // RSI crosses above 30 and price is above EMA10
      const rsiCrossedAbove =
        (dataframe.rsi as number[])[i] > this.buyRsi &&
        (dataframe.rsi as number[])[i - 1] <= this.buyRsi;

      const priceAboveEma = dataframe.close[i] > (dataframe.ema10 as number[])[i];
      const volumePositive = dataframe.volume[i] > 0;
      const macdPositive = (dataframe.macd_hist as number[])[i] > 0;

      if (rsiCrossedAbove && priceAboveEma && volumePositive && macdPositive) {
        (dataframe.enter_long as number[])[i] = 1;
        (dataframe.enter_tag as string[])[i] = 'rsi_cross_up';
      }
    }

    // Short entry signals (if shorting is enabled)
    if (this.canShort) {
      for (let i = 1; i < length; i++) {
        const rsiCrossedBelow =
          (dataframe.rsi as number[])[i] < this.shortRsi &&
          (dataframe.rsi as number[])[i - 1] >= this.shortRsi;

        const priceBelowEma = dataframe.close[i] < (dataframe.ema10 as number[])[i];
        const volumePositive = dataframe.volume[i] > 0;
        const macdNegative = (dataframe.macd_hist as number[])[i] < 0;

        if (rsiCrossedBelow && priceBelowEma && volumePositive && macdNegative) {
          (dataframe.enter_short as number[])[i] = 1;
          (dataframe.enter_tag as string[])[i] = 'rsi_cross_down';
        }
      }
    }

    return dataframe;
  }

  populateExitTrend(dataframe: DataFrame, metadata: StrategyMetadata): DataFrame {
    const length = dataframe.close.length;

    // Initialize exit signal columns
    dataframe.exit_long = new Array(length).fill(0);
    dataframe.exit_short = new Array(length).fill(0);
    dataframe.exit_tag = new Array(length).fill('');

    // Long exit signals
    for (let i = 1; i < length; i++) {
      // RSI crosses above 70
      const rsiCrossedAbove =
        (dataframe.rsi as number[])[i] > this.sellRsi &&
        (dataframe.rsi as number[])[i - 1] <= this.sellRsi;

      const volumePositive = dataframe.volume[i] > 0;
      const macdNegative = (dataframe.macd_hist as number[])[i] < 0;

      if (rsiCrossedAbove && volumePositive && macdNegative) {
        (dataframe.exit_long as number[])[i] = 1;
        (dataframe.exit_tag as string[])[i] = 'rsi_overbought';
      }
    }

    // Short exit signals
    if (this.canShort) {
      for (let i = 1; i < length; i++) {
        const rsiCrossedBelow =
          (dataframe.rsi as number[])[i] < this.exitShortRsi &&
          (dataframe.rsi as number[])[i - 1] >= this.exitShortRsi;

        const volumePositive = dataframe.volume[i] > 0;
        const macdPositive = (dataframe.macd_hist as number[])[i] > 0;

        if (rsiCrossedBelow && volumePositive && macdPositive) {
          (dataframe.exit_short as number[])[i] = 1;
          (dataframe.exit_tag as string[])[i] = 'rsi_oversold';
        }
      }
    }

    return dataframe;
  }

  // Optional callbacks
  customStoploss(
    trade: Trade,
    currentTime: Date,
    currentRate: number,
    currentProfit: number
  ): number | null {
    // Implement trailing stop loss
    if (this.trailingStop && currentProfit > 0.01) {
      // If profit > 1%
      return -0.02; // Trail with 2% stop loss
    }
    return null; // Use default stop loss
  }

  confirmTradeEntry(
    pair: string,
    orderType: string,
    amount: number,
    rate: number,
    time: Date
  ): boolean {
    // Add custom entry confirmation logic here
    // For example, check volume, spread, market conditions, etc.
    return true; // Confirm all entries for now
  }

  confirmTradeExit(
    pair: string,
    trade: Trade,
    orderType: string,
    amount: number,
    rate: number,
    time: Date
  ): boolean {
    // Add custom exit confirmation logic here
    return true; // Confirm all exits for now
  }

  botStart(): void {
    logger.info(`Strategy ${this.name} v${this.version} started`);
  }

  botLoopStart(currentTime: Date): void {
    // Called at the start of each bot iteration
    // Can be used for periodic tasks, logging, etc.
  }

  /**
   * Enhanced data fetching using multiple free sources
   */
  async getEnhancedMarketData(symbol: string): Promise<DataFrame | null> {
    try {
      // Try to get data from free sources
      const marketData = await this.tradingViewService.getMarketData(symbol, this.timeframe);

      if (marketData) {
        logger.info(`✅ Data berhasil diambil dari sumber gratis untuk ${symbol}`);
        return marketData;
      }

      logger.info(`❌ Gagal mengambil data untuk ${symbol}`);
      return null;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching enhanced market data:');
      return null;
    }
  }

  /**
   * Enhanced populate indicators with better data source
   */
  async populateIndicatorsEnhanced(
    symbol: string,
    metadata: StrategyMetadata
  ): Promise<DataFrame | null> {
    // Get fresh data from free sources
    const dataframe = await this.getEnhancedMarketData(symbol);

    if (!dataframe) {
      logger.info('⚠️  Menggunakan data fallback atau cache');
      return null;
    }

    // Apply existing indicator logic
    return this.populateIndicators(dataframe, metadata);
  }
}
