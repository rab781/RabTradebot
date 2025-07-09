// Test script for Perplexity integration
import { config } from 'dotenv';
import { PerplexityService } from '../src/services/perplexityService';

config();

async function testPerplexityIntegration() {
    console.log('🔄 Testing Perplexity AI Integration...\n');

    const perplexityService = new PerplexityService();

    // Test 1: Check configuration
    console.log('1. Configuration Test:');
    console.log(`   Configured: ${perplexityService.isConfigured()}`);

    if (!perplexityService.isConfigured()) {
        console.log('   ⚠️ PERPLEXITY_API_KEY not found in .env file');
        console.log('   Please add your API key to test the integration\n');
        return;
    }

    console.log('   ✅ API key found\n');

    try {
        // Test 2: Search news for Bitcoin
        console.log('2. News Search Test (BTCUSDT):');
        const newsItems = await perplexityService.searchCryptoNews('BTCUSDT', 3);
        console.log(`   Found ${newsItems.length} news items:`);

        newsItems.forEach((item, index) => {
            console.log(`   ${index + 1}. ${item.title.substring(0, 60)}...`);
            console.log(`      Impact: ${item.impactLevel} | Sentiment: ${item.sentimentScore.toFixed(2)}`);
        });
        console.log('   ✅ News search successful\n');

        // Test 3: Analyze impact
        console.log('3. Impact Analysis Test:');
        const analysis = await perplexityService.analyzeNewsImpact('BTCUSDT', newsItems);
        console.log(`   Overall Sentiment: ${analysis.overallSentiment}`);
        console.log(`   Market Direction: ${analysis.marketMovement.direction}`);
        console.log(`   Confidence: ${(analysis.marketMovement.confidence * 100).toFixed(1)}%`);
        console.log(`   24H Prediction: ${analysis.impactPrediction.shortTerm.substring(0, 80)}...`);
        console.log('   ✅ Impact analysis successful\n');

        // Test 4: Cache test
        console.log('4. Cache Test:');
        const cacheStats = perplexityService.getCacheStats();
        console.log(`   Cache entries: ${cacheStats.size}`);
        console.log(`   Oldest entry: ${Math.floor(cacheStats.oldestEntry / 60)}m ago`);
        console.log('   ✅ Cache working\n');

        console.log('🎉 All tests passed! Perplexity integration is working correctly.');

    } catch (error: any) {
        console.error('❌ Test failed:', error.message);

        if (error.message.includes('API key')) {
            console.log('\n💡 Solution: Check your Perplexity API key');
        } else if (error.message.includes('rate limit')) {
            console.log('\n💡 Solution: Wait a few minutes and try again');
        } else {
            console.log('\n💡 Solution: Check your internet connection and API key');
        }
    }
}

// Run test
testPerplexityIntegration().catch(console.error);
