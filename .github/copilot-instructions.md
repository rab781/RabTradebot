# GitHub Copilot Instructions for Crypto Trading Bot

## Project Overview
This is a comprehensive cryptocurrency trading bot built with TypeScript, Node.js, and Telegram Bot API. The bot provides technical analysis, news sentiment analysis, backtesting, paper trading, and automated trading capabilities.

## Architecture & Tech Stack

### Core Technologies
- **Language**: TypeScript
- **Runtime**: Node.js
- **Bot Framework**: node-telegram-bot-api
- **Data Sources**: Binance API, Perplexity AI
- **Technical Analysis**: Custom indicators (RSI, MACD, Bollinger Bands, etc.)
- **News Analysis**: Perplexity AI integration
- **Paper Trading**: Custom engine with portfolio simulation

### Project Structure
```
src/
├── services/
│   ├── binanceService.ts          # Market data & trading
│   ├── perplexityService.ts       # AI news analysis
│   ├── comprehensiveAnalyzer.ts   # Technical analysis
│   ├── paperTradingEngine.ts      # Portfolio simulation
│   └── backtestingEngine.ts       # Strategy backtesting
├── strategies/
│   ├── baseStrategy.ts            # Strategy interface
│   ├── rsiStrategy.ts             # RSI-based trading
│   └── macdStrategy.ts            # MACD-based trading
├── types/
│   └── tradingTypes.ts            # Type definitions
└── enhancedBot.ts                 # Main bot logic
```

## Development Guidelines

### 1. Code Style & Patterns
- Use TypeScript strict mode
- Implement proper error handling with try-catch blocks
- Use async/await for asynchronous operations
- Follow consistent naming conventions:
  - Services: `camelCase` with `Service` suffix
  - Types: `PascalCase` with descriptive names
  - Constants: `UPPER_SNAKE_CASE`
- Add comprehensive JSDoc comments for public methods

### 2. Trading Bot Commands Structure
When adding new commands, follow this pattern:
```typescript
bot.command('commandname', async (ctx) => {
    const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
    
    if (!symbol) {
        return ctx.reply('Please provide a symbol. Example: /commandname BTCUSDT');
    }
    
    try {
        const loadingMsg = await ctx.reply('🔄 Processing...');
        
        // Your logic here
        const result = await someService.process(symbol);
        
        // Format response with emojis and clear structure
        const response = formatResponse(result);
        await ctx.reply(response);
        
        // Clean up loading message
        try {
            await ctx.deleteMessage(loadingMsg.message_id);
        } catch (error) {
            // Ignore delete errors
        }
        
    } catch (error) {
        console.error(`Command error:`, error);
        ctx.reply(`❌ Error: ${error.message}`);
    }
});
```

### 3. Service Implementation Pattern
```typescript
export class ServiceName {
    private apiKey: string;
    private cache: Map<string, any> = new Map();
    
    constructor() {
        this.apiKey = process.env.API_KEY || '';
    }
    
    isConfigured(): boolean {
        return !!this.apiKey;
    }
    
    async method(param: string): Promise<ResultType> {
        // Check cache first
        const cacheKey = `method_${param}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        // API call with error handling
        try {
            const result = await this.apiCall(param);
            
            // Cache result with TTL
            this.cache.set(cacheKey, result);
            setTimeout(() => this.cache.delete(cacheKey), 600000); // 10 minutes
            
            return result;
        } catch (error) {
            throw new Error(`API call failed: ${error.message}`);
        }
    }
}
```

## Current Features & Commands

### Technical Analysis Commands
- `/analyze [symbol]` - Comprehensive technical analysis + news sentiment
- `/signal [symbol]` - Trading signals with entry/exit points
- `/sr [symbol]` - Support and resistance levels
- `/volume [symbol]` - Volume analysis and trends
- `/chart [symbol]` - Price charts with indicators

### News & Sentiment Analysis
- `/pnews [symbol]` - Perplexity AI news analysis
- `/impact [symbol]` - Quick news impact assessment
- `/fullanalysis [symbol]` - Combined technical + fundamental analysis
- `/pstatus` - Check Perplexity AI configuration
- `/news [symbol]` - Basic news analysis
- `/twitter [symbol]` - Twitter sentiment analysis

### Trading & Backtesting
- `/backtest [symbol] [days]` - Strategy backtesting
- `/papertrade [symbol]` - Start paper trading
- `/portfolio` - View current positions
- `/performance` - Trading performance metrics
- `/optimize [symbol] [days]` - Parameter optimization

### Data & Utilities
- `/download [symbol] [days]` - Download historical data
- `/strategies` - List available strategies
- `/alert [symbol] [price] [above/below]` - Set price alerts
- `/alerts` - List active alerts

## Future Development Priorities

### Phase 1: Infrastructure (Immediate)
1. **Database Integration**
   - Add PostgreSQL with Prisma ORM
   - Store historical data, user preferences, performance metrics
   - Implement data migration scripts

2. **Enhanced Risk Management**
   - Dynamic position sizing based on volatility
   - VaR (Value at Risk) calculations
   - Correlation analysis for portfolio risk

3. **Performance Monitoring**
   - Detailed strategy performance tracking
   - Real-time metrics dashboard
   - Error monitoring and alerting

### Phase 2: Machine Learning (Medium-term)
1. **Predictive Models**
   - LSTM networks for price prediction
   - Random Forest for signal classification
   - Feature engineering from technical indicators

2. **Advanced Sentiment Analysis**
   - FinBERT for financial text analysis
   - Multi-source sentiment aggregation
   - Sentiment-price correlation models

3. **Ensemble Trading Systems**
   - Combine multiple strategies with weighted voting
   - Dynamic strategy allocation based on market conditions
   - Meta-learning for strategy selection

### Phase 3: Advanced Features (Long-term)
1. **Real-time Market Data**
   - WebSocket connections to multiple exchanges
   - Order book analysis and market microstructure
   - High-frequency trading capabilities

2. **Portfolio Optimization**
   - Modern Portfolio Theory implementation
   - Multi-asset allocation optimization
   - Rebalancing algorithms

3. **Alternative Data Integration**
   - Google Trends analysis
   - GitHub activity metrics
   - Whale wallet movements
   - Network metrics (hash rate, active addresses)

## Code Generation Guidelines

### When implementing ML features:
```typescript
// Use TensorFlow.js for browser compatibility
import * as tf from '@tensorflow/tfjs-node';

class MLPredictor {
    private model: tf.LayersModel | null = null;
    
    async loadModel(modelPath: string) {
        this.model = await tf.loadLayersModel(modelPath);
    }
    
    async predict(features: number[]): Promise<PredictionResult> {
        if (!this.model) throw new Error('Model not loaded');
        
        const tensor = tf.tensor2d([features]);
        const prediction = this.model.predict(tensor) as tf.Tensor;
        const result = await prediction.data();
        
        // Clean up tensors
        tensor.dispose();
        prediction.dispose();
        
        return this.formatPrediction(result);
    }
}
```

### For database operations:
```typescript
// Use Prisma for type-safe database operations
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function saveTradeResult(trade: TradeResult) {
    return await prisma.trade.create({
        data: {
            symbol: trade.symbol,
            action: trade.action,
            price: trade.price,
            quantity: trade.quantity,
            profit: trade.profit,
            timestamp: new Date()
        }
    });
}
```

### For real-time data:
```typescript
// WebSocket pattern for real-time data
import WebSocket from 'ws';

class RealTimeDataManager {
    private ws: WebSocket | null = null;
    private subscribers: Map<string, Function[]> = new Map();
    
    connect(url: string) {
        this.ws = new WebSocket(url);
        
        this.ws.on('message', (data) => {
            const parsed = JSON.parse(data.toString());
            this.notifySubscribers(parsed.symbol, parsed);
        });
    }
    
    subscribe(symbol: string, callback: Function) {
        if (!this.subscribers.has(symbol)) {
            this.subscribers.set(symbol, []);
        }
        this.subscribers.get(symbol)!.push(callback);
    }
}
```

## Environment Variables Required
```bash
# Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Exchange APIs
BINANCE_API_KEY=your_binance_api_key
BINANCE_API_SECRET=your_binance_secret

# News & Sentiment
PERPLEXITY_API_KEY=your_perplexity_api_key
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_secret
TWITTER_BEARER_TOKEN=your_twitter_bearer

# Database (for future implementation)
DATABASE_URL=postgresql://user:password@localhost:5432/trading_bot

# ML Models (for future implementation)
MODEL_STORAGE_PATH=./models/
FEATURE_STORE_URL=your_feature_store_url
```

## Testing Guidelines
- Write unit tests for all service methods
- Mock external API calls in tests
- Test error handling scenarios
- Use Jest for testing framework
- Maintain >80% code coverage

## Security Considerations
- Never expose API keys in code
- Validate all user inputs
- Implement rate limiting for bot commands
- Use secure WebSocket connections (WSS)
- Encrypt sensitive data in database

## Performance Guidelines
- Implement caching for frequently accessed data
- Use connection pooling for database
- Optimize API calls with batching where possible
- Monitor memory usage for ML models
- Implement graceful degradation for service failures

This bot is designed to be a production-ready cryptocurrency trading system with advanced analytics, ML capabilities, and robust risk management. Always prioritize security, performance, and user experience in all implementations.
