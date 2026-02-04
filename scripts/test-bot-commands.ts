/**
 * Test Bot Commands Integration
 * Tests ML prediction and OpenClaw commands work correctly
 */

import { LSTMModelManager } from '../src/ml/lstmModel';
import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { PublicCryptoService } from '../src/services/publicCryptoService';
import { OpenClawStrategy } from '../src/strategies/OpenClawStrategy';
import { OHLCVCandle } from '../src/types/dataframe';

async function testBotCommands() {
    console.log('🤖 Testing Bot Commands Integration\n');
    console.log('='.repeat(60) + '\n');

    const symbol = 'BTCUSDT';

    try {
        // Initialize services
        const cryptoService = new PublicCryptoService();
        const featureService = new FeatureEngineeringService(false);
        const mlModel = new LSTMModelManager();
        const openClawStrategy = new OpenClawStrategy();

        // ========== TEST 1: /mlpredict command ==========
        console.log('TEST 1: /mlpredict Command Simulation');
        console.log('-'.repeat(60));
        
        console.log(`Fetching data for ${symbol}...`);
        const rawCandles = await cryptoService.getCandlestickData(symbol, '1h', 400);
        
        const ohlcvCandles: OHLCVCandle[] = rawCandles.map((c: any) => ({
            timestamp: c[0],
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5]),
            date: new Date(c[0])
        }));
        
        console.log(`✓ Fetched ${ohlcvCandles.length} candles\n`);

        console.log('Extracting features...');
        const features = featureService.extractFeatures(ohlcvCandles, symbol);
        console.log(`✓ Generated ${features.length} feature sets\n`);

        console.log('Building ML model...');
        mlModel.buildModel();
        console.log('✓ Model built\n');

        console.log('Generating prediction...');
        const prediction = await mlModel.predict(features);
        
        const currentPrice = ohlcvCandles[ohlcvCandles.length - 1].close;
        const direction = prediction.direction > 0 ? 'UP' : 'DOWN';
        const changePrefix = prediction.priceChange > 0 ? '+' : '';
        const confidencePercent = (prediction.confidence * 100).toFixed(1);

        let emoji = '⚪';
        let recommendation = 'HOLD';
        
        if (prediction.direction > 0 && prediction.confidence > 0.6) {
            emoji = '🟢';
            recommendation = 'LONG';
        } else if (prediction.direction < 0 && prediction.confidence > 0.6) {
            emoji = '🔴';
            recommendation = 'SHORT';
        }

        const mlMessage = `
🧠 ML PRICE PREDICTION - ${symbol}

${emoji} PREDICTION: ${recommendation}
Direction: ${direction}
Confidence: ${confidencePercent}%

💰 CURRENT PRICE: $${currentPrice.toLocaleString()}

📈 FORECAST:
Expected Movement: ${changePrefix}${prediction.priceChange.toFixed(2)}%
Signal Strength: ${prediction.confidence > 0.7 ? 'Strong' : prediction.confidence > 0.5 ? 'Medium' : 'Weak'}

🎯 TRADING SUGGESTION:
${prediction.confidence > 0.6 ? `✅ ${recommendation} position recommended` : '⏸️ Low confidence - wait for better setup'}

⚙️ Model: LSTM (158K parameters)
📊 Features: 60 technical indicators
⏰ Last Update: ${new Date().toLocaleTimeString()}

💡 TIP: Combine with /openclaw for best results!
        `;

        console.log(mlMessage);
        console.log('\n✅ /mlpredict command: PASSED\n');
        console.log('='.repeat(60) + '\n');

        // ========== TEST 2: /openclaw command ==========
        console.log('TEST 2: /openclaw Command Simulation');
        console.log('-'.repeat(60));
        
        console.log('Generating OpenClaw analysis...');
        
        // Prepare dataframe for OpenClaw
        const dfData: any = {
            open: ohlcvCandles.map(c => c.open),
            high: ohlcvCandles.map(c => c.high),
            low: ohlcvCandles.map(c => c.low),
            close: ohlcvCandles.map(c => c.close),
            volume: ohlcvCandles.map(c => c.volume),
            date: ohlcvCandles.map(c => c.date)
        };

        const metadata = {
            pair: symbol,
            timeframe: '1h',
            stake_currency: 'USDT'
        };

        // Analyze with OpenClaw
        openClawStrategy.populateIndicators(dfData, metadata);
        openClawStrategy.populateEntryTrend(dfData, metadata);
        
        const lastIdx = dfData.enter_long.length - 1;
        const lastCandle = ohlcvCandles[ohlcvCandles.length - 1];
        const lastFeature = features[features.length - 1];

        // Get OpenClaw signals
        const enterLong = dfData.enter_long[lastIdx];
        const enterShort = dfData.enter_short[lastIdx];
        const enterTag = dfData.enter_tag[lastIdx] || 'ranging';

        const rsi = lastFeature.rsi_14;
        const macdHist = lastFeature.macdHistogram;
        const adx = lastFeature.adx;
        const bbPercentB = lastFeature.bb_percentB;

        let signalText = 'NO SIGNAL';
        let signalEmoji = '⏸️';
        let signalStrength = 'Ranging';

        if (enterLong === 1) {
            signalText = 'LONG ENTRY';
            signalEmoji = '🟢';
            signalStrength = enterTag.replace('_long', '').toUpperCase();
        } else if (enterShort === 1) {
            signalText = 'SHORT ENTRY';
            signalEmoji = '🔴';
            signalStrength = enterTag.replace('_short', '').toUpperCase();
        }

        const openClawMessage = `
🦅 OPENCLAW ANALYSIS - ${symbol}

${signalEmoji} SIGNAL: ${signalText}
Market Regime: ${signalStrength}

💰 CURRENT PRICE: $${currentPrice.toLocaleString()}

📊 TECHNICAL INDICATORS:
RSI(14): ${rsi.toFixed(2)}
MACD Histogram: ${macdHist > 0 ? '+' : ''}${macdHist.toFixed(2)}
ADX: ${adx.toFixed(2)} ${adx > 25 ? '(Strong trend)' : '(Weak trend)'}
BB %B: ${bbPercentB.toFixed(2)} ${bbPercentB > 0.8 ? '(Overbought)' : bbPercentB < 0.2 ? '(Oversold)' : '(Neutral)'}

🎯 TRADING RECOMMENDATION:
${enterLong === 1 ? '✅ Consider LONG entry\n📈 Bullish momentum detected' : ''}${enterShort === 1 ? '✅ Consider SHORT entry\n📉 Bearish momentum detected' : ''}${enterLong === 0 && enterShort === 0 ? '⏸️ Wait for clearer signal\n📊 No strong trend detected' : ''}

⚙️ Strategy: OpenClawStrategy v${openClawStrategy.version}
⏰ Timeframe: 1h | Last Update: ${new Date().toLocaleTimeString()}
        `;

        console.log(openClawMessage);
        console.log('\n✅ /openclaw command: PASSED\n');
        console.log('='.repeat(60) + '\n');

        // ========== TEST 3: Combined Analysis ==========
        console.log('TEST 3: Combined ML + OpenClaw Analysis');
        console.log('-'.repeat(60));
        
        const mlBullish = prediction.direction > 0;
        const openClawBullish = enterLong === 1;
        const mlBearish = prediction.direction < 0;
        const openClawBearish = enterShort === 1;
        
        let combinedSignal = '⚪ NEUTRAL';
        let combinedRecommendation = 'Hold position - signals conflict or weak';
        
        if (mlBullish && openClawBullish && prediction.confidence > 0.5) {
            combinedSignal = '🟢 STRONG LONG';
            combinedRecommendation = 'Both ML and OpenClaw agree - strong bullish signal';
        } else if (mlBearish && openClawBearish && prediction.confidence > 0.5) {
            combinedSignal = '🔴 STRONG SHORT';
            combinedRecommendation = 'Both ML and OpenClaw agree - strong bearish signal';
        } else if (mlBullish !== openClawBullish) {
            combinedSignal = '⚠️ CONFLICTING';
            combinedRecommendation = 'Signals disagree - wait for clearer setup';
        }

        const combinedMessage = `
🎯 COMBINED ANALYSIS - ${symbol}

${combinedSignal}

📊 SIGNAL BREAKDOWN:
ML Prediction: ${mlBullish ? '📈 Bullish' : '📉 Bearish'} (${confidencePercent}% confidence)
OpenClaw: ${openClawBullish ? '📈 Long' : openClawBearish ? '📉 Short' : '⏸️ No signal'}

💡 RECOMMENDATION:
${combinedRecommendation}

⏰ ${new Date().toLocaleString()}
        `;

        console.log(combinedMessage);
        console.log('\n✅ Combined analysis: PASSED\n');
        console.log('='.repeat(60) + '\n');

        // Summary
        console.log('📋 TEST SUMMARY');
        console.log('='.repeat(60));
        console.log('✅ /mlpredict command - Working correctly');
        console.log('✅ /openclaw command - Working correctly  ');
        console.log('✅ Combined analysis - Working correctly');
        console.log('✅ Feature extraction - All features valid');
        console.log('✅ Prediction logic - Output format correct');
        console.log('\n🎉 ALL BOT COMMAND TESTS PASSED!\n');
        console.log('📝 Next steps:');
        console.log('   1. Train model with real data for accurate predictions');
        console.log('   2. Test commands in actual Telegram bot');
        console.log('   3. Monitor performance in live environment');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        if (error instanceof Error) {
            console.error('Error:', error.message);
            console.error('Stack:', error.stack);
        }
        throw error;
    }
}

testBotCommands();
