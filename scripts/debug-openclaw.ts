import { PublicCryptoService } from '../src/services/publicCryptoService';
import { DataFrame, OHLCVCandle } from '../src/types/dataframe';
import { OpenClawStrategy } from '../src/strategies/OpenClawStrategy';

async function debugStrategy() {
    console.log('\n🔍 Debugging OpenClawStrategy Indicators\n');
    console.log('='.repeat(70));

    const symbol = 'BTCUSDT';
    const days = 90;

    // Download data
    const publicService = new PublicCryptoService();
    const limit = Math.min(days * 24, 1000); // Max 1000 candles
    const rawCandles = await publicService.getCandlestickData(symbol, '1h', limit);

    const candles: OHLCVCandle[] = rawCandles.map((c: any) => ({
        timestamp: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
        date: new Date(c[0])
    }));

    console.log(`📊 Downloaded ${candles.length} candles for ${symbol}`);

    // Create DataFrame
    const dataframe: DataFrame = {
        open: candles.map((c: OHLCVCandle) => c.open),
        high: candles.map((c: OHLCVCandle) => c.high),
        low: candles.map((c: OHLCVCandle) => c.low),
        close: candles.map((c: OHLCVCandle) => c.close),
        volume: candles.map((c: OHLCVCandle) => c.volume),
        date: candles.map((c: OHLCVCandle) => c.date)
    };

    // Initialize strategy and populate indicators
    const strategy = new OpenClawStrategy();
    const metadata = { pair: symbol, timeframe: '1h', stake_currency: 'USDT' };

    console.log('\n🔧 Populating indicators...');
    strategy.populateIndicators(dataframe, metadata);

    console.log('\n🎯 Populating entry signals...');
    strategy.populateEntryTrend(dataframe, metadata);

    // Check for entry signals
    const enterLong = dataframe.enter_long as number[];
    const enterShort = dataframe.enter_short as number[];
    const enterTag = dataframe.enter_tag as string[];

    const longSignals = enterLong.filter(v => v === 1).length;
    const shortSignals = enterShort.filter(v => v === 1).length;

    console.log('\n📈 Signal Summary:');
    console.log(`   Long Signals:  ${longSignals}`);
    console.log(`   Short Signals: ${shortSignals}`);
    console.log(`   Total Signals: ${longSignals + shortSignals}`);

    // Show sample of last 20 candles with indicators
    console.log('\n📊 Last 20 Candles (indicators):');
    console.log('='.repeat(120));
    console.log('Index | Close    | RSI   | MACD_Hist | ADX   | Vol_Ratio | Enter_Long | Enter_Tag');
    console.log('-'.repeat(120));

    const startIdx = Math.max(0, dataframe.close.length - 20);
    for (let i = startIdx; i < dataframe.close.length; i++) {
        const close = dataframe.close[i].toFixed(2);
        const rsi = ((dataframe.rsi as number[])[i] || 0).toFixed(2);
        const macdHist = ((dataframe.macd_histogram as number[])[i] || 0).toFixed(4);
        const adx = ((dataframe.adx as number[])[i] || 0).toFixed(2);
        const volRatio = ((dataframe.volume_ratio as number[])[i] || 0).toFixed(2);
        const enterL = enterLong[i];
        const tag = enterTag[i] || '';

        console.log(`${i.toString().padStart(5)} | ${close.padStart(8)} | ${rsi.padStart(5)} | ${macdHist.padStart(9)} | ${adx.padStart(5)} | ${volRatio.padStart(9)} | ${enterL.toString().padStart(10)} | ${tag}`);
    }

    // Verify arrays are properly structured
    console.log('\n🔍 DataFrame Verification:');
    console.log(`   Total rows: ${dataframe.close.length}`);
    console.log(`   enter_long type: ${Array.isArray(dataframe.enter_long) ? 'Array' : typeof dataframe.enter_long}`);
    console.log(`   enter_long length: ${(dataframe.enter_long as number[]).length}`);
    console.log(`   Sample enter_long[986]: ${(dataframe.enter_long as number[])[986]}`);
    console.log(`   Sample enter_tag[986]: ${(dataframe.enter_tag as string[])[986]}`);

    // Find and display signal candles
    console.log('\n✅ Signal Candles:');
    if (longSignals + shortSignals === 0) {
        console.log('   ❌ No signals found');

        // Debug: show why signals might not trigger
        console.log('\n🔍 Analyzing last 10 candles:');
        const start = Math.max(0, dataframe.close.length - 10);
        for (let i = start; i < dataframe.close.length; i++) {
            const rsi = (dataframe.rsi as number[])[i] || 50;
            const macdHist = (dataframe.macd_histogram as number[])[i] || 0;
            const priceVsEma9 = (dataframe.price_vs_ema9 as number[])[i] || 0;
            const volumeRatio = (dataframe.volume_ratio as number[])[i] || 1;
            const bbPercentB = (dataframe.bb_percentb as number[])[i] || 0.5;

            // Calculate scores (same as strategy)
            let momentumScore = 0;
            if (rsi > 50) {
                momentumScore += (rsi - 50) / 50;
            } else {
                momentumScore -= (50 - rsi) / 50;
            }
            if (macdHist > 0) momentumScore += 0.3;
            else momentumScore -= 0.3;
            momentumScore += priceVsEma9 / 10;
            momentumScore = Math.max(-1, Math.min(1, momentumScore / 2));

            let volumeScore = 0;
            const priceChange = ((dataframe.close[i] - dataframe.close[i - 1]) / dataframe.close[i - 1]) * 100;
            if (volumeRatio > 1.5 && priceChange > 0) volumeScore = 0.5;
            else if (volumeRatio > 1.5 && priceChange < 0) volumeScore = -0.5;

            const totalScore = (momentumScore * 0.5) + (volumeScore * 0.3);

            console.log(`   [${i}] Score: ${totalScore.toFixed(3)}, Momentum: ${momentumScore.toFixed(3)}, Volume: ${volumeScore.toFixed(3)}, RSI: ${rsi.toFixed(1)}, BB%B: ${bbPercentB.toFixed(2)}`);
        }

        console.log(`\n   Required score for long: > 0.4`);
        console.log(`   Required score for short: < -0.4`);
    } else {
        const signalIndices = enterLong.map((v, i) => v === 1 ? i : -1).filter(i => i >= 0);
        signalIndices.forEach(i => {
            console.log(`   Index ${i}: ${enterTag[i]} - Close: $${dataframe.close[i].toFixed(2)}`);
        });
    }
}

debugStrategy().catch(console.error);
