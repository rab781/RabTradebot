import { config } from 'dotenv';
import { ChutesService } from '../src/services/chutesService';

// Load environment variables
config();

async function testChutesService() {
    console.log('🧪 Testing Chutes AI Service\n');

    const chutesService = new ChutesService();

    // Test 1: Check configuration
    console.log('📋 Test 1: Configuration Check');
    console.log('✓ Chutes configured:', chutesService.isConfigured());

    if (!chutesService.isConfigured()) {
        console.log('❌ CHUTES_API_KEY not found in environment variables');
        console.log('Please add CHUTES_API_KEY to your .env file');
        return;
    }
    console.log('');

    // Test 2: Search crypto news
    console.log('📋 Test 2: Search Crypto News for BTC');
    try {
        const symbol = 'BTCUSDT';
        console.log(`Searching news for ${symbol}...`);

        const newsItems = await chutesService.searchCryptoNews(symbol, 5);
        console.log(`✓ Found ${newsItems.length} news items\n`);

        newsItems.forEach((item, idx) => {
            console.log(`News ${idx + 1}:`);
            console.log(`  Title: ${item.title}`);
            console.log(`  Source: ${item.source}`);
            console.log(`  Impact: ${item.impactLevel}`);
            console.log(`  Sentiment: ${item.sentimentScore.toFixed(2)}`);
            console.log(`  Published: ${item.publishedAt.toLocaleDateString()}`);
            console.log('');
        });
    } catch (error) {
        console.log('❌ Error:', (error as Error).message);
    }

    // Test 3: Analyze news impact
    console.log('📋 Test 3: Analyze News Impact for ETH');
    try {
        const symbol = 'ETHUSDT';
        console.log(`Fetching and analyzing news for ${symbol}...`);

        const newsItems = await chutesService.searchCryptoNews(symbol, 5);
        const analysis = await chutesService.analyzeNewsImpact(symbol, newsItems, 3500);

        console.log('✓ Analysis completed\n');
        console.log('📊 ANALYSIS RESULTS:');
        console.log(`  Symbol: ${analysis.symbol}`);
        console.log(`  Overall Sentiment: ${analysis.overallSentiment}`);
        console.log(`  Market Direction: ${analysis.marketMovement.direction}`);
        console.log(`  Confidence: ${analysis.marketMovement.confidence}%`);
        console.log('');

        console.log('💰 PRICE TARGETS:');
        console.log(`  Bullish: $${analysis.priceTarget.bullish.toFixed(2)}`);
        console.log(`  Neutral: $${analysis.priceTarget.neutral.toFixed(2)}`);
        console.log(`  Bearish: $${analysis.priceTarget.bearish.toFixed(2)}`);
        console.log('');

        console.log('📈 PREDICTIONS:');
        console.log(`  24h: ${analysis.impactPrediction.shortTerm}`);
        console.log(`  7d: ${analysis.impactPrediction.mediumTerm}`);
        console.log(`  30d: ${analysis.impactPrediction.longTerm}`);
        console.log('');

        if (analysis.keyFactors.length > 0) {
            console.log('🔑 KEY FACTORS:');
            analysis.keyFactors.forEach((factor, idx) => {
                console.log(`  ${idx + 1}. ${factor}`);
            });
            console.log('');
        }

    } catch (error) {
        console.log('❌ Error:', (error as Error).message);
    }

    // Test 4: Quick impact analysis
    console.log('📋 Test 4: Quick Impact for SOL');
    try {
        const symbol = 'SOLUSDT';
        console.log(`Getting quick impact for ${symbol}...`);

        const quickImpact = await chutesService.getQuickImpact(symbol);
        console.log('✓ Quick impact retrieved\n');
        console.log(quickImpact);
        console.log('');

    } catch (error) {
        console.log('❌ Error:', (error as Error).message);
    }

    // Test 5: Format message
    console.log('📋 Test 5: Format Analysis Message for BNB');
    try {
        const symbol = 'BNBUSDT';
        console.log(`Creating formatted message for ${symbol}...`);

        const newsItems = await chutesService.searchCryptoNews(symbol, 3);
        const analysis = await chutesService.analyzeNewsImpact(symbol, newsItems, 600);
        const message = chutesService.formatAnalysisMessage(analysis);

        console.log('✓ Message formatted\n');
        console.log('📱 TELEGRAM MESSAGE PREVIEW:');
        console.log('─'.repeat(50));
        console.log(message);
        console.log('─'.repeat(50));
        console.log('');

    } catch (error) {
        console.log('❌ Error:', (error as Error).message);
    }

    // Test 6: Multiple symbols in parallel
    console.log('📋 Test 6: Parallel Analysis (BTC, ETH, SOL)');
    try {
        console.log('Running parallel news fetches...');

        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
        const results = await Promise.all(
            symbols.map(symbol =>
                chutesService.searchCryptoNews(symbol, 3)
                    .then(news => ({ symbol, news, error: null }))
                    .catch(error => ({ symbol, news: [], error: error.message }))
            )
        );

        console.log('✓ Parallel analysis completed\n');
        results.forEach(result => {
            if (result.error) {
                console.log(`${result.symbol}: ❌ ${result.error}`);
            } else {
                console.log(`${result.symbol}: ✓ ${result.news.length} news items`);
            }
        });
        console.log('');

    } catch (error) {
        console.log('❌ Error:', (error as Error).message);
    }

    console.log('🎉 All tests completed!');
}

// Run tests
testChutesService().catch(console.error);
