# Advanced Crypto Trading Bot

A comprehensive Telegram bot that provides cryptocurrency trading signals, market analysis, backtesting, and paper trading capabilities.

## Features

### Analysis Tools

- Comprehensive market analysis with `/analyze` command
- Technical Analysis using multiple indicators (RSI, MACD, Bollinger Bands, Moving Averages)
- Multi-timeframe analysis (1H, 4H, 1D)
- Support and resistance detection
- News sentiment analysis from major crypto news sources
- Real-time price monitoring and alerts
- Advanced Volume Analysis

### Trading Capabilities

- Backtesting strategies with historical data
- Paper trading simulation
- Strategy optimization
- Performance tracking and portfolio management
- Support & Resistance Detection
- Multiple Timeframe Analysis
- Interactive Price Charts
- Customizable Price Alerts
- Entry/Exit Points Suggestions
- Easy-to-use Telegram commands
- **Robust Error Handling**: Automatic retry mechanism for API failures
- **Public API Fallback**: Uses public Binance API when private API fails
- **Comprehensive Logging**: Detailed logs for debugging and monitoring
- **Rate Limit Protection**: Intelligent retry with exponential backoff

## Setup

1. **Clone the repository**:

   ```bash
   git clone https://github.com/yourusername/crypto-signal-bot.git
   cd crypto-signal-bot
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Setup environment variables**:

   ```bash
   # Copy the example environment file
   copy .env.example .env

   # Edit the .env file with your credentials
   # At minimum, you need TELEGRAM_BOT_TOKEN
   # BINANCE_API_KEY and BINANCE_API_SECRET are optional
   ```

4. **Configure your `.env` file**:

   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   BINANCE_API_KEY=your_binance_api_key_here  # Optional
   BINANCE_API_SECRET=your_binance_api_secret_here  # Optional
   ```

5. **Start the bot**:
   ```bash
   npm start
   ```

## Available Commands

Basic Commands:

- `/start` - Start the bot
- `/help` - Show available commands
- `/signal [symbol]` - Get trading signals for a cryptocurrency (e.g., `/signal BTCUSDT`)
- `/watch [symbol]` - Start watching a cryptocurrency for signals
- `/unwatch [symbol]` - Stop watching a cryptocurrency
- `/list` - List all cryptocurrencies being watched

Advanced Analysis:

- `/volume [symbol]` - Get detailed volume analysis
- `/sr [symbol]` - Get support and resistance levels
- `/timeframes [symbol]` - Analyze multiple timeframes
- `/chart [symbol]` - Generate interactive price chart
- `/depth [symbol]` - Get order book depth analysis

Price Alerts:

- `/alert [symbol] [price] [above/below]` - Set price alert
- `/alerts` - List your active price alerts
- `/delalert [symbol]` - Delete price alert

## Requirements

- Node.js v16 or higher
- Telegram Bot Token (get it from @BotFather)
- Binance API credentials (if using Binance data)

## Development

To run in development mode with hot reloading:

```bash
npm run dev
```

## Tech Stack

- TypeScript
- Node.js
- Telegraf (Telegram Bot Framework)
- Technical Indicators
- Binance API (with public API fallback)
- Cheerio (Web Scraping)
- Axios (HTTP Client)
- Comprehensive Error Handling & Logging

## Troubleshooting

### Common Issues

1. **Error 403 (API Access Denied)**

   - Check if your Binance API credentials are correct
   - Ensure your IP is whitelisted (if IP restriction is enabled)
   - The bot automatically falls back to public API if private API fails

2. **Rate Limiting**

   - The bot includes automatic retry mechanism with exponential backoff
   - Public API fallback helps avoid rate limits on private API

3. **Invalid Symbol Errors**

   - Ensure you're using correct Binance symbol format (e.g., BTCUSDT, not BTC/USDT)
   - Check if the symbol exists on Binance

4. **Network Issues**
   - The bot includes retry mechanisms for temporary network failures
   - Check your internet connection if issues persist

### Logs

The bot provides comprehensive logging:

- User interactions (commands, requests)
- API calls and responses
- Error details with timestamps
- Service status and fallback usage

All logs include timestamps in ISO format for easy debugging.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This bot is for educational and informational purposes only. It should not be considered as financial advice. Always do your own research before making any trading decisions.

## Support

If you find this project helpful, please give it a ⭐ on GitHub!

For issues and questions, please use the GitHub Issues page.

# 🚀 Advanced Crypto Trading Bot

## 🎯 NEW COMPREHENSIVE ANALYSIS FEATURE

### `/analyze` Command - Complete Market Analysis

The most powerful feature of this bot! Get a complete market analysis in one command:

```
/analyze BTCUSDT
```

**What you get:**

- 📊 **Technical Analysis**: RSI, MACD, Bollinger Bands, Moving Averages
- ⏰ **Multi-timeframe Analysis**: 1H, 4H, 1D trends
- 🔬 **Backtesting Results**: 30-day strategy performance
- 🎯 **Precise Recommendations**: Entry/exit levels with reasoning
- 📈 **Chart Links**: Direct links to TradingView charts
- 💡 **Risk Management**: Stop loss, take profit, risk/reward ratios

**Example Output:**

```
🎯 COMPREHENSIVE ANALYSIS: BTCUSDT
💰 Current Price: $52,340.50
📅 Analysis Time: 2025-01-07 10:30:00

🔮 OVERALL RECOMMENDATION: BUY 🟢
📊 Confidence: 78.5%
🎯 Entry Price: $52,340.50
🛑 Stop Loss: $49,723.48
🎯 Take Profit: $55,440.93
```

## 🌟 Key Features

### 1. **Comprehensive Analysis** (`/analyze`)

- Complete technical and fundamental analysis
- Multi-strategy backtesting
- Real-time market sentiment
- Precise entry/exit recommendations
- Risk management calculations

### 2. **Advanced Trading Tools**

- 📊 **Backtesting**: `/backtest BTCUSDT 30`
- 🎯 **Paper Trading**: `/papertrade BTCUSDT`
- 🔧 **Strategy Optimization**: `/optimize BTCUSDT 60`
- 📈 **Portfolio Tracking**: `/portfolio`

### 3. **Data & Charts**

- 📊 **TradingView Integration**: Professional charts
- 📈 **Multiple Data Sources**: Binance, Yahoo Finance, Alpha Vantage
- 💾 **Data Management**: Download and cache historical data
- 📊 **Volume Analysis**: Detailed volume patterns

### 4. **Risk Management**

- 🎯 **Position Sizing**: Automatic calculations
- 🛑 **Stop Loss**: Dynamic stop loss levels
- 📊 **Risk/Reward**: Optimal risk/reward ratios
- 📈 **Performance Tracking**: Detailed metrics

## 🔧 **Setup for FREE Usage**

### **Data Sources (100% Free)**

1. **Binance API** - 1200 requests/minute
2. **Yahoo Finance** - Unlimited (unofficial)
3. **Alpha Vantage** - 5 calls/minute (with free API key)
4. **TradingView Widgets** - Unlimited charts

### **Charts & Visualization**

- **TradingView Widgets**: Professional, familiar interface
- **Chart.js**: Custom analysis charts
- **Real-time Updates**: WebSocket support

## 📱 **Complete Command List**

### **🎯 COMPREHENSIVE ANALYSIS**

- `/analyze [symbol]` - Complete market analysis

### **📊 BASIC ANALYSIS**

- `/signal [symbol]` - Trading signals
- `/volume [symbol]` - Volume analysis
- `/sr [symbol]` - Support/resistance levels
- `/chart [symbol]` - Generate charts

### **🎯 ADVANCED TRADING**

- `/backtest [symbol] [days]` - Strategy backtesting
- `/papertrade [symbol]` - Start paper trading
- `/stoptrading` - Stop paper trading
- `/portfolio` - View positions
- `/performance` - Performance metrics

### **🔧 OPTIMIZATION**

- `/optimize [symbol] [days]` - Parameter optimization
- `/strategies` - List available strategies

### **📈 DATA MANAGEMENT**

- `/download [symbol] [days]` - Download data
- `/datainfo [symbol]` - Data quality check

### **🔔 PRICE ALERTS**

- `/alert [symbol] [price] [above/below]` - Set alerts
- `/alerts` - List active alerts
- `/delalert [symbol]` - Delete alerts

## 🎯 **Usage Examples**

### **Complete Analysis**

```
/analyze BTCUSDT
```

_Get complete technical analysis, backtesting, and recommendations_

### **Quick Trading Signal**

```
/signal ETHUSDT
```

_Get a quick buy/sell signal_

### **Strategy Backtesting**

```
/backtest BTCUSDT 30
```

_Test strategy performance over 30 days_

### **Paper Trading**

```
/papertrade SOLUSDT
```

_Start virtual trading with real market data_

### **Optimize Strategy**

```
/optimize ADAUSDT 60
```

_Find optimal parameters for 60-day period_

## 🚀 **Why This Bot is Special**

1. **100% Free** - No hidden costs or premium features
2. **Professional Grade** - Same tools used by professional traders
3. **Multiple Strategies** - Backtesting across different approaches
4. **Real-time Data** - Live market data from multiple sources
5. **TradingView Integration** - Familiar, professional charts
6. **Risk Management** - Built-in position sizing and stop losses
7. **Multi-timeframe** - Analysis across different time horizons

## 🎯 **Perfect For**

- **Beginners**: Learn with comprehensive analysis and explanations
- **Intermediate**: Backtest strategies and optimize parameters
- **Advanced**: Multi-strategy analysis and risk management
- **All Levels**: Professional-grade tools without the cost

## 🔧 **Technical Details**

### **Free Data Sources**

- **Binance API**: Real-time crypto data
- **Yahoo Finance**: Historical data
- **Alpha Vantage**: Professional financial data
- **TradingView**: Professional charts and widgets

### **Analysis Components**

- **Technical Indicators**: RSI, MACD, Bollinger Bands, Moving Averages
- **Volume Analysis**: Volume patterns and anomalies
- **Support/Resistance**: Key price levels
