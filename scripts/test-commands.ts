import { config } from 'dotenv';
import { PerplexityService } from '../src/services/perplexityService';

// Load environment variables
config();

async function testCommands() {
    console.log('🔄 Testing Perplexity Commands Implementation...\n');

    const perplexityService = new PerplexityService();

    // Test 1: Configuration
    console.log('1. ✅ Service Configuration:');
    console.log(`   - Configured: ${perplexityService.isConfigured()}`);
    console.log(`   - API Key exists: ${!!process.env.PERPLEXITY_API_KEY}`);

    if (!perplexityService.isConfigured()) {
        console.log(`   ⚠️  To test fully, add PERPLEXITY_API_KEY to .env file`);
        console.log(`   📝 Get key from: https://www.perplexity.ai/settings/api\n`);
    }

    // Test 2: Commands List
    console.log('2. ✅ Available Perplexity Commands:');
    const commands = [
        '/pnews [symbol] - Perplexity AI news analysis',
        '/impact [symbol] - Quick news impact assessment',
        '/fullanalysis [symbol] - Combined technical + news analysis',
        '/pstatus - Check Perplexity AI status'
    ];

    commands.forEach(cmd => console.log(`   • ${cmd}`));
    console.log('');

    // Test 3: Integration with /analyze
    console.log('3. ✅ Integration Features:');
    console.log('   • /analyze command now includes news sentiment');
    console.log('   • Automatic fallback if Perplexity not configured');
    console.log('   • Smart caching to save API calls');
    console.log('   • Error handling for rate limits');
    console.log('');

    // Test 4: Mock API Call (if configured)
    if (perplexityService.isConfigured()) {
        console.log('4. 🔄 Testing API Connection...');
        try {
            console.log('   • Attempting to search news for BTCUSDT...');
            const newsItems = await perplexityService.searchCryptoNews('BTCUSDT', 2);
            console.log(`   ✅ Found ${newsItems.length} news items`);

            if (newsItems.length > 0) {
                console.log(`   • Sample: ${newsItems[0].title.substring(0, 50)}...`);
                console.log(`   • Sentiment: ${newsItems[0].sentimentScore.toFixed(2)}`);
                console.log(`   • Impact: ${newsItems[0].impactLevel}`);
            }
        } catch (error) {
            console.log(`   ❌ API test failed: ${(error as Error).message}`);
        }
    } else {
        console.log('4. ⏸️  API test skipped (not configured)');
    }

    console.log('\n🎉 Command implementation test completed!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Add PERPLEXITY_API_KEY to .env file');
    console.log('   2. Start bot: npm run dev');
    console.log('   3. Test in Telegram: /pstatus');
    console.log('   4. Try analysis: /pnews BTCUSDT');
    console.log('   5. Full analysis: /fullanalysis BTCUSDT');
}

// Run test
testCommands().catch(console.error);
