/**
 * ML Bot Commands Integration
 * Integrates all Phase 2 ML services with the existing bot
 */

import TelegramBot from 'node-telegram-bot-api';
import { EnsembleStrategyService } from '../services/ensembleStrategyService';
import { RandomForestService } from '../services/randomForestService';
import { LSTMPredictionService } from '../services/lstmPredictionService';
import { AdvancedSentimentService } from '../services/advancedSentimentService';
import { Candle } from '../types/trading';

export class MLBotIntegration {
  private bot: TelegramBot;
  private ensembleService: EnsembleStrategyService;
  private randomForestService: RandomForestService;
  private lstmService: LSTMPredictionService;
  // private sentimentService: AdvancedSentimentService; // Temporarily disabled
  private isInitialized: boolean = false;

  constructor(bot: TelegramBot) {
    this.bot = bot;
    this.ensembleService = new EnsembleStrategyService();
    this.randomForestService = new RandomForestService();
    this.lstmService = new LSTMPredictionService();
    // this.sentimentService = new AdvancedSentimentService(); // Temporarily disabled

    console.log('🤖 ML Bot Integration initialized');
  }

  /**
   * Helper function to get error message
   */
  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  /**
   * Initialize all ML services
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing ML Bot Integration...');

      await this.ensembleService.initialize();
      await this.randomForestService.initialize();
      await this.lstmService.initialize();

      this.isInitialized = true;
      console.log('✅ ML Bot Integration initialized successfully');

    } catch (error) {
      console.error('❌ ML Bot Integration initialization failed:', error);
      throw error;
    }
  }

  /**
   * Register all ML commands with the bot
   */
  registerCommands(): void {
    // ML Prediction Commands
    this.bot.onText(/\/mlpredict (.+)/, this.handleMLPredict.bind(this));
    this.bot.onText(/\/ensemble (.+)/, this.handleEnsemble.bind(this));
    this.bot.onText(/\/randomforest (.+)/, this.handleRandomForest.bind(this));
    this.bot.onText(/\/lstm (.+)/, this.handleLSTM.bind(this));
    this.bot.onText(/\/sentiment (.+)/, this.handleSentiment.bind(this));

    // ML Analysis Commands
    this.bot.onText(/\/mlanalysis (.+)/, this.handleMLAnalysis.bind(this));
    this.bot.onText(/\/marketregime/, this.handleMarketRegime.bind(this));
    this.bot.onText(/\/mlstats/, this.handleMLStats.bind(this));

    // ML Configuration Commands
    this.bot.onText(/\/mlconfig/, this.handleMLConfig.bind(this));
    this.bot.onText(/\/mlweights/, this.handleMLWeights.bind(this));

    console.log('🔧 ML commands registered');
  }

  /**
   * Handle ML prediction command
   */
  private async handleMLPredict(msg: TelegramBot.Message, match: RegExpExecArray | null): Promise<void> {
    if (!match) return;

    const symbol = match[1].toUpperCase();
    const chatId = msg.chat.id;

    if (!this.isInitialized) {
      this.bot.sendMessage(chatId, '❌ ML services not initialized. Please wait...');
      return;
    }

    try {
      const loadingMsg = await this.bot.sendMessage(chatId, '🤖 Generating ML prediction...');

      // Generate sample candle data (in production, this would come from real data)
      const sampleCandles = this.generateSampleCandles();

      // Get ensemble prediction
      const ensembleResult = await this.ensembleService.generateEnsembleSignal(
        symbol,
        sampleCandles,
        ['Market looks bullish today', 'Strong technical indicators'],
        ['Moon soon!', 'HODL the line', 'This is the way']
      );

      let response = `🤖 **ML Prediction for ${symbol}**\n\n`;
      response += `🎯 **Final Signal**: ${ensembleResult.final_signal}\n`;
      response += `📊 **Confidence**: ${(ensembleResult.confidence * 100).toFixed(1)}%\n`;
      response += `⚖️ **Weighted Score**: ${ensembleResult.weighted_score.toFixed(3)}\n`;
      response += `💰 **Risk-Adjusted Size**: ${(ensembleResult.risk_adjusted_size * 100).toFixed(1)}%\n\n`;

      response += `🔍 **Individual Signals**:\n`;
      ensembleResult.individual_signals.forEach(signal => {
        response += `• ${signal.strategy_name}: ${signal.signal} (${(signal.confidence * 100).toFixed(1)}%)\n`;
      });

      response += `\n⏰ Generated: ${ensembleResult.timestamp.toLocaleString()}`;

      await this.bot.editMessageText(response, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown'
      });

    } catch (error) {
      console.error('ML Predict error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.bot.sendMessage(chatId, `❌ ML prediction failed: ${errorMsg}`);
    }
  }

  /**
   * Handle ensemble command
   */
  private async handleEnsemble(msg: TelegramBot.Message, match: RegExpExecArray | null): Promise<void> {
    if (!match) return;

    const symbol = match[1].toUpperCase();
    const chatId = msg.chat.id;

    try {
      const loadingMsg = await this.bot.sendMessage(chatId, '🎯 Running ensemble analysis...');

      const sampleCandles = this.generateSampleCandles();
      const result = await this.ensembleService.generateEnsembleSignal(symbol, sampleCandles);
      const stats = this.ensembleService.getEnsembleStats();

      let response = `🎯 **Ensemble Analysis for ${symbol}**\n\n`;
      response += `📊 **Signal**: ${result.final_signal}\n`;
      response += `🎪 **Confidence**: ${(result.confidence * 100).toFixed(1)}%\n`;
      response += `📈 **Weighted Score**: ${result.weighted_score.toFixed(3)}\n`;
      response += `🏛️ **Market Regime**: ${stats.currentRegime}\n\n`;

      response += `⚖️ **Current Weights**:\n`;
      Object.entries(stats.weights).forEach(([strategy, weight]) => {
        response += `• ${strategy}: ${(weight * 100).toFixed(1)}%\n`;
      });

      response += `\n📊 **Ensemble Stats**:\n`;
      response += `• Total Predictions: ${stats.totalPredictions}\n`;
      response += `• Symbols Covered: ${stats.symbolsCovered}\n`;

      await this.bot.editMessageText(response, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown'
      });

    } catch (error) {
      console.error('Ensemble error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.bot.sendMessage(chatId, `❌ Ensemble analysis failed: ${errorMsg}`);
    }
  }

  /**
   * Handle Random Forest command
   */
  private async handleRandomForest(msg: TelegramBot.Message, match: RegExpExecArray | null): Promise<void> {
    if (!match) return;

    const symbol = match[1].toUpperCase();
    const chatId = msg.chat.id;

    try {
      const loadingMsg = await this.bot.sendMessage(chatId, '🌲 Running Random Forest analysis...');

      const sampleCandles = this.generateSampleCandles();
      const prediction = await this.randomForestService.predict(symbol, sampleCandles, '1h');
      const stats = this.randomForestService.getTrainingStats(symbol);

      let response = `🌲 **Random Forest Prediction for ${symbol}**\n\n`;
      response += `💰 **Predicted Price**: $${prediction.predicted_price.toFixed(4)}\n`;
      response += `📈 **Direction**: ${prediction.direction.toUpperCase()}\n`;
      response += `🎯 **Confidence**: ${(prediction.confidence * 100).toFixed(1)}%\n`;
      response += `🕐 **Timeframe**: ${prediction.timeframe}\n`;
      response += `🔮 **Horizon**: ${prediction.horizon}h\n\n`;

      if (stats) {
        response += `📊 **Model Stats**:\n`;
        response += `• Training Samples: ${stats.samples}\n`;
        response += `• Features: ${stats.features}\n`;
        response += `• Model Accuracy: ${(stats.accuracy * 100).toFixed(1)}%\n`;
      }

      response += `\n🔧 **Features Used**:\n`;
      prediction.features_used.slice(0, 5).forEach(feature => {
        response += `• ${feature}\n`;
      });

      await this.bot.editMessageText(response, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown'
      });

    } catch (error) {
      console.error('Random Forest error:', error);
      this.bot.sendMessage(chatId, `❌ Random Forest analysis failed: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Handle LSTM command
   */
  private async handleLSTM(msg: TelegramBot.Message, match: RegExpExecArray | null): Promise<void> {
    if (!match) return;

    const symbol = match[1].toUpperCase();
    const chatId = msg.chat.id;

    try {
      const loadingMsg = await this.bot.sendMessage(chatId, '🧠 Running LSTM analysis...');

      const sampleCandles = this.generateSampleCandles();
      const prediction = await this.lstmService.predict(symbol, sampleCandles, '1h');
      const lstmPrediction = await this.lstmService.getLSTMPrediction(symbol, sampleCandles, 6);

      let response = `🧠 **LSTM Prediction for ${symbol}**\n\n`;
      response += `💰 **Next Hour Price**: $${prediction.predicted_price.toFixed(4)}\n`;
      response += `📈 **Direction**: ${prediction.direction.toUpperCase()}\n`;
      response += `🎯 **Confidence**: ${(prediction.confidence * 100).toFixed(1)}%\n\n`;

      response += `📊 **6-Hour Forecast**:\n`;
      lstmPrediction.predicted_prices.slice(0, 6).forEach((price, i) => {
        const confidence = lstmPrediction.confidence_intervals[i];
        response += `• ${i + 1}h: $${price.toFixed(2)} (${(confidence * 100).toFixed(1)}%)\n`;
      });

      response += `\n🧠 **Model Confidence**: ${(lstmPrediction.model_confidence * 100).toFixed(1)}%\n`;

      const modelStats = this.lstmService.getModelStats(symbol);
      if (modelStats) {
        response += `\n🔧 **Model Stats**:\n`;
        response += `• Parameters: ${modelStats.parameters.toLocaleString()}\n`;
        response += `• Training Data: ${modelStats.trainingData}\n`;
        response += `• Last Trained: ${modelStats.lastTrained.toLocaleDateString()}\n`;
      }

      await this.bot.editMessageText(response, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown'
      });

    } catch (error) {
      console.error('LSTM error:', error);
      this.bot.sendMessage(chatId, `❌ LSTM analysis failed: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Handle sentiment command
   */
  private async handleSentiment(msg: TelegramBot.Message, match: RegExpExecArray | null): Promise<void> {
    if (!match) return;

    const symbol = match[1].toUpperCase();
    const chatId = msg.chat.id;

    try {
      const loadingMsg = await this.bot.sendMessage(chatId, '💭 Analyzing sentiment...');

      // Sample texts for sentiment analysis
      const sampleTexts = [
        `${symbol} is looking very bullish today with strong volume`,
        `Great news for ${symbol} holders, institutional adoption increasing`,
        `${symbol} breaking resistance levels, moon incoming!`,
        `Technical analysis shows ${symbol} in strong uptrend`,
        `${symbol} community is very optimistic about upcoming developments`
      ];

      // const sentimentResult = await this.sentimentService.analyzeSentiment(symbol, sampleTexts, true);

      let response = `💭 **Sentiment Analysis for ${symbol}**\n\n`;
      response += `🚧 **Status**: Temporarily disabled for debugging\n`;
      response += `🎯 **Coming Soon**: Full sentiment analysis\n\n`;

      /*
      response += `🎭 **Overall Sentiment**: ${sentimentResult.overall_sentiment.toFixed(3)}\n`;
      response += `💪 **Sentiment Strength**: ${(sentimentResult.sentiment_strength * 100).toFixed(1)}%\n`;
      response += `📈 **Trend**: ${sentimentResult.sentiment_trend.toUpperCase()}\n\n`;

      response += `📊 **Breakdown**:\n`;
      response += `• News Sentiment: ${sentimentResult.news_sentiment.toFixed(3)}\n`;
      response += `• Social Sentiment: ${sentimentResult.social_sentiment.toFixed(3)}\n\n`;

      response += `📈 **Sources Analyzed**:\n`;
      response += `• News Articles: ${sentimentResult.sources.news_articles}\n`;
      response += `• Social Posts: ${sentimentResult.sources.social_posts}\n\n`;

      if (sentimentResult.key_phrases.length > 0) {
        response += `🔑 **Key Phrases**:\n`;
        sentimentResult.key_phrases.slice(0, 5).forEach(phrase => {
          response += `• "${phrase}"\n`;
        });
      }

      const cacheStats = this.sentimentService.getCacheStats();
      response += `\n📊 **Cache Stats**: ${cacheStats.size} entries, ${cacheStats.memoryUsage}`;
      */

      await this.bot.editMessageText(response, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown'
      });

    } catch (error) {
      console.error('Sentiment error:', error);
      this.bot.sendMessage(chatId, `❌ Sentiment analysis failed: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Handle ML analysis command
   */
  private async handleMLAnalysis(msg: TelegramBot.Message, match: RegExpExecArray | null): Promise<void> {
    if (!match) return;

    const symbol = match[1].toUpperCase();
    const chatId = msg.chat.id;

    try {
      const loadingMsg = await this.bot.sendMessage(chatId, '🔬 Running comprehensive ML analysis...');

      const sampleCandles = this.generateSampleCandles();

      // Get all predictions in parallel
      const [
        ensembleResult,
        rfPrediction,
        lstmPrediction
        // sentimentResult
      ] = await Promise.all([
        this.ensembleService.generateEnsembleSignal(symbol, sampleCandles),
        this.randomForestService.predict(symbol, sampleCandles, '1h'),
        this.lstmService.predict(symbol, sampleCandles, '1h')
        // this.sentimentService.analyzeSentiment(symbol, [
        //   `${symbol} technical analysis shows strong signals`,
        //   `Market sentiment for ${symbol} is positive`
        // ])
      ]);

      let response = `🔬 **Comprehensive ML Analysis for ${symbol}**\n\n`;

      response += `🎯 **ENSEMBLE DECISION**\n`;
      response += `• Signal: ${ensembleResult.final_signal}\n`;
      response += `• Confidence: ${(ensembleResult.confidence * 100).toFixed(1)}%\n`;
      response += `• Position Size: ${(ensembleResult.risk_adjusted_size * 100).toFixed(1)}%\n\n`;

      response += `🌲 **RANDOM FOREST**\n`;
      response += `• Direction: ${rfPrediction.direction}\n`;
      response += `• Price: $${rfPrediction.predicted_price.toFixed(4)}\n`;
      response += `• Confidence: ${(rfPrediction.confidence * 100).toFixed(1)}%\n\n`;

      response += `🧠 **LSTM NEURAL NETWORK**\n`;
      response += `• Direction: ${lstmPrediction.direction}\n`;
      response += `• Price: $${lstmPrediction.predicted_price.toFixed(4)}\n`;
      response += `• Confidence: ${(lstmPrediction.confidence * 100).toFixed(1)}%\n\n`;

      response += `💭 **SENTIMENT ANALYSIS**\n`;
      response += `• Status: 🚧 Temporarily disabled\n\n`;
      /*
      response += `• Trend: ${sentimentResult.sentiment_trend}\n`;
      response += `• Score: ${sentimentResult.overall_sentiment.toFixed(3)}\n`;
      response += `• Strength: ${(sentimentResult.sentiment_strength * 100).toFixed(1)}%\n\n`;
      */

      response += `⚖️ **CONSENSUS**: `;
      const signals = [rfPrediction.direction, lstmPrediction.direction]; // removed sentimentResult.sentiment_trend
      const bullishCount = signals.filter(s => s === 'up').length;
      const bearishCount = signals.filter(s => s === 'down').length;

      if (bullishCount > bearishCount) {
        response += `BULLISH (${bullishCount}/3 models)`;
      } else if (bearishCount > bullishCount) {
        response += `BEARISH (${bearishCount}/3 models)`;
      } else {
        response += `NEUTRAL (Mixed signals)`;
      }

      await this.bot.editMessageText(response, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown'
      });

    } catch (error) {
      console.error('ML Analysis error:', error);
      this.bot.sendMessage(chatId, `❌ ML analysis failed: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Handle ML stats command
   */
  private async handleMLStats(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    try {
      const rfStats = this.randomForestService.getServiceStats();
      const lstmStats = this.lstmService.getServiceStats();
      const ensembleStats = this.ensembleService.getEnsembleStats();
      // const sentimentStats = this.sentimentService.getCacheStats();

      let response = `📊 **ML Services Statistics**\n\n`;

      response += `🌲 **Random Forest**\n`;
      response += `• Models Loaded: ${rfStats.modelsLoaded}\n`;
      response += `• Features: ${rfStats.featuresCount}\n`;
      response += `• Initialized: ${rfStats.isInitialized ? '✅' : '❌'}\n\n`;

      response += `🧠 **LSTM Service**\n`;
      response += `• Models Loaded: ${lstmStats.modelsLoaded}\n`;
      response += `• Features: ${lstmStats.featuresCount}\n`;
      response += `• Initialized: ${lstmStats.isInitialized ? '✅' : '❌'}\n\n`;

      response += `🎯 **Ensemble Service**\n`;
      response += `• Total Predictions: ${ensembleStats.totalPredictions}\n`;
      response += `• Symbols Covered: ${ensembleStats.symbolsCovered}\n`;
      response += `• Current Regime: ${ensembleStats.currentRegime}\n\n`;

      response += `💭 **Sentiment Service**\n`;
      response += `• Status: 🚧 Temporarily disabled\n`;
      /*
      response += `• Cache Size: ${sentimentStats.size}\n`;
      response += `• Memory Usage: ${sentimentStats.memoryUsage}\n`;
      response += `• Configured: ${this.sentimentService.isConfigured() ? '✅' : '❌'}\n\n`;
      */

      response += `🤖 **Overall Status**: ${this.isInitialized ? '✅ Ready' : '❌ Not Ready'}`;

      this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('ML Stats error:', error);
      this.bot.sendMessage(chatId, `❌ Failed to get ML stats: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Generate sample candle data for testing
   */
  private generateSampleCandles(): Candle[] {
    const candles: Candle[] = [];
    let basePrice = 50000;
    const now = Date.now();

    for (let i = 99; i >= 0; i--) {
      const time = now - (i * 60 * 60 * 1000); // 1 hour intervals
      const change = (Math.random() - 0.5) * 0.02; // ±1% change
      const high = basePrice * (1 + Math.abs(change) + Math.random() * 0.01);
      const low = basePrice * (1 - Math.abs(change) - Math.random() * 0.01);
      const close = basePrice * (1 + change);
      const volume = Math.random() * 1000 + 500;

      candles.push({
        timestamp: time,
        open: basePrice,
        high,
        low,
        close,
        volume
      });

      basePrice = close;
    }

    return candles;
  }

  /**
   * Handle other ML commands
   */
  private async handleMarketRegime(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const stats = this.ensembleService.getEnsembleStats();

    let response = `🏛️ **Current Market Regime Analysis**\n\n`;
    response += `📊 **Detected Regime**: ${stats.currentRegime.toUpperCase()}\n\n`;

    switch (stats.currentRegime) {
      case 'trending':
        response += `📈 **Trending Market Characteristics**:\n`;
        response += `• Strong directional movement\n`;
        response += `• LSTM models perform better\n`;
        response += `• Higher position sizes recommended\n`;
        break;
      case 'ranging':
        response += `↔️ **Ranging Market Characteristics**:\n`;
        response += `• Sideways price action\n`;
        response += `• Random Forest models preferred\n`;
        response += `• Moderate position sizes\n`;
        break;
      case 'volatile':
        response += `⚡ **Volatile Market Characteristics**:\n`;
        response += `• High price swings\n`;
        response += `• Reduced confidence in all models\n`;
        response += `• Smaller position sizes recommended\n`;
        break;
    }

    response += `\n⚖️ **Current Strategy Weights**:\n`;
    Object.entries(stats.weights).forEach(([strategy, weight]) => {
      response += `• ${strategy}: ${(weight * 100).toFixed(1)}%\n`;
    });

    this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  }

  private async handleMLConfig(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    let response = `🔧 **ML Configuration Status**\n\n`;
    response += `🌲 **Random Forest Config**:\n`;
    const rfConfig = this.randomForestService.getConfig();
    response += `• Estimators: ${rfConfig.n_estimators}\n`;
    response += `• Max Features: ${rfConfig.max_features}\n`;
    response += `• Random State: ${rfConfig.random_state}\n\n`;

    response += `🧠 **LSTM Config**:\n`;
    const lstmConfig = this.lstmService.getConfig();
    response += `• Sequence Length: ${lstmConfig.sequence_length}\n`;
    response += `• Hidden Units: ${lstmConfig.hidden_units}\n`;
    response += `• Learning Rate: ${lstmConfig.learning_rate}\n`;
    response += `• Epochs: ${lstmConfig.epochs}\n\n`;

    response += `🤖 **Services Status**:\n`;
    response += `• Random Forest: ${this.randomForestService.isConfigured() ? '✅' : '❌'}\n`;
    response += `• LSTM: ${this.lstmService.isConfigured() ? '✅' : '❌'}\n`;
    response += `• Sentiment: 🚧 Disabled\n`; // ${this.sentimentService.isConfigured() ? '✅' : '❌'}\n`;
    response += `• Ensemble: ${this.ensembleService.isConfigured() ? '✅' : '❌'}\n`;

    this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  }

  private async handleMLWeights(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    const currentWeights = this.ensembleService.getCurrentWeights();

    let response = `⚖️ **Current Strategy Weights**\n\n`;
    Object.entries(currentWeights).forEach(([strategy, weight]) => {
      const percentage = (weight * 100).toFixed(1);
      const bar = '█'.repeat(Math.floor(weight * 20));
      response += `${strategy}: ${percentage}% ${bar}\n`;
    });

    const stats = this.ensembleService.getEnsembleStats();
    response += `\n🏛️ Market Regime: ${stats.currentRegime}\n`;
    response += `📊 Total Predictions: ${stats.totalPredictions}\n`;
    response += `🎯 Symbols Covered: ${stats.symbolsCovered}`;

    this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  }

  /**
   * Check if ML integration is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get integration status
   */
  getStatus(): {
    initialized: boolean;
    services: {
      ensemble: boolean;
      randomForest: boolean;
      lstm: boolean;
      sentiment: boolean;
    };
  } {
    return {
      initialized: this.isInitialized,
      services: {
        ensemble: this.ensembleService.isConfigured(),
        randomForest: this.randomForestService.isConfigured(),
        lstm: this.lstmService.isConfigured(),
        sentiment: false // this.sentimentService.isConfigured()
      }
    };
  }
}
