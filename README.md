# Crypto Signal Bot

A Telegram bot that provides cryptocurrency trading signals based on technical analysis and news sentiment.

## Features

- Technical Analysis using multiple indicators (RSI, MACD)
- News sentiment analysis from major crypto news sources
- Real-time price monitoring
- Advanced Volume Analysis
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
