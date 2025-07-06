# 🚀 Advanced Crypto Signal Bot - Freqtrade Inspired

A powerful Telegram bot for cryptocurrency trading analysis, now enhanced with freqtrade-inspired features including backtesting, paper trading, strategy optimization, and comprehensive portfolio management.

## 🌟 Features

### 📊 Basic Analysis (Original Features)
- **Real-time Signals**: Get trading signals based on technical analysis
- **Volume Analysis**: Detect unusual volume patterns and market anomalies
- **Support & Resistance**: Identify key price levels
- **Multi-timeframe Analysis**: Analyze across different timeframes
- **Interactive Charts**: Generate price charts with indicators
- **Price Alerts**: Set custom price alerts with notifications

### 🎯 Advanced Trading (New Freqtrade-Inspired Features)
- **Strategy Framework**: Modular strategy system similar to freqtrade's IStrategy
- **Backtesting Engine**: Test strategies against historical data with detailed metrics
- **Paper Trading**: Real-time virtual trading simulation
- **Portfolio Management**: Track positions, performance, and risk metrics
- **Strategy Optimization**: Hyperparameter tuning to find optimal strategy parameters
- **Data Management**: Historical data download, validation, and caching
- **Risk Management**: Stop-loss, take-profit, position sizing, and drawdown control
- **Performance Analytics**: Comprehensive metrics including Sharpe ratio, Calmar ratio, profit factor

## 🛠️ Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd crypto-signal-bot
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment Setup**
Create a `.env` file in the root directory:
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
BINANCE_API_KEY=your_binance_api_key (optional)
BINANCE_API_SECRET=your_binance_api_secret (optional)
```

4. **Configuration**
The bot uses a JSON configuration system. A default config is created automatically, or you can customize `config/config.json`.

## 🚀 Usage

### Start the Enhanced Bot
```bash
npm run enhanced
```

### Development Mode
```bash
npm run dev-enhanced
```

### Original Bot (Basic Features)
```bash
npm start
```

## 📱 Telegram Commands

### 🔹 Basic Analysis Commands
```
/signal [symbol]     - Get trading signals (e.g., /signal BTCUSDT)
/volume [symbol]     - Analyze volume patterns
/sr [symbol]         - Support and resistance levels
/timeframes [symbol] - Multi-timeframe analysis
/chart [symbol]      - Generate price chart
```

### 🔹 Advanced Trading Commands
```
/backtest [symbol] [days]    - Run strategy backtest
                               Example: /backtest BTCUSDT 30

/papertrade [symbol]         - Start paper trading simulation
/stoptrading                 - Stop current paper trading
/portfolio                   - View current positions and balance
/performance                 - Detailed performance metrics
```

### 🔹 Strategy & Optimization
```
/optimize [symbol] [days]    - Optimize strategy parameters
                               Example: /optimize BTCUSDT 60

/strategies                  - List available trading strategies
```

### 🔹 Data Management
```
/download [symbol] [days]    - Download historical data
                               Example: /download BTCUSDT 90

/datainfo [symbol]           - Check data quality and summary
```

### 🔹 Price Alerts
```
/alert [symbol] [price] [above/below]  - Set price alert
/alerts                                - List active alerts
/delalert [symbol]                     - Delete price alert
```

## 📊 Strategy System

### Creating Custom Strategies

The bot uses a strategy interface similar to freqtrade. Here's a basic example:

```typescript
import { IStrategy, DataFrame, StrategyMetadata } from '../types/strategy';

export class MyCustomStrategy implements IStrategy {
    name = 'MyCustomStrategy';
    version = '1.0.0';
    timeframe = '5m';
    
    // Risk management
    stoploss = -0.05; // 5% stop loss
    minimalRoi = {
        '60': 0.01,  // 1% ROI after 60 minutes
        '30': 0.02,  // 2% ROI after 30 minutes  
        '0': 0.04    // 4% ROI immediately
    };
    
    // Position sizing
    stakeAmount = 100; // USDT
    maxOpenTrades = 3;
    
    populateIndicators(dataframe: DataFrame, metadata: StrategyMetadata): DataFrame {
        // Add your technical indicators here
        // Example: RSI, MACD, Bollinger Bands, etc.
        return dataframe;
    }
    
    populateEntryTrend(dataframe: DataFrame, metadata: StrategyMetadata): DataFrame {
        // Define entry conditions
        // Set dataframe.enter_long = 1 for long entries
        // Set dataframe.enter_short = 1 for short entries
        return dataframe;
    }
    
    populateExitTrend(dataframe: DataFrame, metadata: StrategyMetadata): DataFrame {
        // Define exit conditions
        // Set dataframe.exit_long = 1 for long exits
        // Set dataframe.exit_short = 1 for short exits
        return dataframe;
    }
}
```

### Available Indicators

The bot includes popular technical indicators:
- **RSI** (Relative Strength Index)
- **MACD** (Moving Average Convergence Divergence)
- **Bollinger Bands**
- **EMA/SMA** (Exponential/Simple Moving Averages)
- **Stochastic Oscillator**
- **Volume indicators**

## 📈 Backtesting

Run comprehensive backtests to evaluate strategy performance:

```
/backtest BTCUSDT 30
```

**Metrics Provided:**
- Total Profit/Loss
- Win Rate
- Sharpe Ratio
- Maximum Drawdown
- Profit Factor
- Calmar Ratio
- Best/Worst Trades
- Average Trade Duration

## 🎯 Paper Trading

Simulate real trading without risking capital:

```
/papertrade BTCUSDT
```

**Features:**
- Real-time price data
- Virtual portfolio management
- Live performance tracking
- Risk management simulation
- Position monitoring

## 🔧 Strategy Optimization

Find optimal parameters for your strategies:

```
/optimize BTCUSDT 60
```

**Optimization Methods:**
- Grid search across parameter space
- Multiple evaluation metrics
- Parameter importance analysis
- Performance correlation analysis

## 📊 Performance Metrics

**Financial Metrics:**
- Total Return %
- Sharpe Ratio
- Sortino Ratio
- Calmar Ratio
- Maximum Drawdown
- Profit Factor

**Trading Metrics:**
- Win Rate
- Average Profit per Trade
- Best/Worst Trade
- Average Trade Duration
- Total Number of Trades

## 🔧 Configuration

### JSON Configuration (config/config.json)

```json
{
  "trading": {
    "stake_currency": "USDT",
    "stake_amount": 100,
    "max_open_trades": 3,
    "timeframe": "5m",
    "dry_run": true,
    "dry_run_wallet": 1000
  },
  "exchange": {
    "name": "binance",
    "pair_whitelist": [
      "BTC/USDT",
      "ETH/USDT",
      "BNB/USDT"
    ]
  },
  "strategy": "SampleStrategy"
}
```

### Environment Variables

```env
TELEGRAM_BOT_TOKEN=your_bot_token
BINANCE_API_KEY=your_api_key
BINANCE_API_SECRET=your_api_secret
STAKE_CURRENCY=USDT
STAKE_AMOUNT=100
MAX_OPEN_TRADES=3
```

## 🛡️ Risk Management

### Built-in Risk Controls

- **Position Sizing**: Configurable stake amount per trade
- **Stop Loss**: Percentage-based stop losses
- **Take Profit**: ROI-based profit targets
- **Maximum Drawdown**: Protection against large losses
- **Trade Limits**: Maximum number of concurrent trades

### Paper Trading Safety

- All paper trading is simulated
- No real money is ever at risk
- Perfect for strategy testing and learning

## 📚 Example Usage Workflow

1. **Start with Analysis**
   ```
   /signal BTCUSDT
   /volume BTCUSDT
   /sr BTCUSDT
   ```

2. **Test Strategy with Backtesting**
   ```
   /backtest BTCUSDT 30
   ```

3. **Optimize Strategy Parameters**
   ```
   /optimize BTCUSDT 60
   ```

4. **Start Paper Trading**
   ```
   /papertrade BTCUSDT
   ```

5. **Monitor Performance**
   ```
   /portfolio
   /performance
   ```

## 🚨 Important Notes

### ⚠️ Disclaimer
- This bot is for educational and research purposes
- Past performance does not guarantee future results
- Always do your own research before making trading decisions
- Never invest more than you can afford to lose

### 🔒 Security
- API keys are optional for basic functionality
- Use environment variables for sensitive data
- The bot only reads market data by default
- No trading orders are placed without explicit paper trading mode

### 📊 Data Sources
- **Price Data**: Binance Public API
- **News Sentiment**: Multiple news sources
- **Technical Analysis**: Real-time calculations
- **Historical Data**: Cached for performance

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add your enhancements
4. Submit a pull request

### Areas for Contribution
- New trading strategies
- Additional technical indicators
- Enhanced risk management features
- UI/UX improvements
- Performance optimizations

## 📖 Documentation

### Strategy Development Guide
See `src/strategies/SampleStrategy.ts` for a complete example of strategy implementation.

### API Reference
- Technical indicators: `technicalindicators` library
- Data management: Custom DataFrame implementation
- Backtesting: Comprehensive engine with multiple metrics

## 🆘 Support

If you encounter issues:

1. Check the console logs for detailed error messages
2. Verify your environment variables are set correctly
3. Ensure you have a stable internet connection
4. Check that the symbol format is correct (e.g., BTCUSDT, not BTC-USDT)

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🎉 Acknowledgments

- Inspired by the [Freqtrade](https://github.com/freqtrade/freqtrade) project
- Built with TypeScript and modern Node.js practices
- Uses Binance API for reliable market data
- Telegram Bot API for user interaction

---

**Happy Trading! 🚀📈**

*Remember: This bot is a tool to assist in analysis and learning. Always make informed decisions and never risk more than you can afford to lose.*
