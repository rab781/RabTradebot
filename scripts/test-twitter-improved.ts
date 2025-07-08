import { TwitterService } from '../src/services/twitterService';
import { config } from 'dotenv';

// Load environment variables
config();

async function testTwitterService() {
    console.log('🧪 Testing Twitter Service with improved rate limiting...\n');

    const twitterConfig = {
        apiKey: process.env.TWITTER_API_KEY || '',
        apiKeySecret: process.env.TWITTER_API_KEY_SECRET || '',
        accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
        accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
        bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
    };

    if (!twitterConfig.apiKey || !twitterConfig.apiKeySecret) {
        console.error('❌ Twitter API credentials not found in .env file');
        process.exit(1);
    }

    const twitterService = new TwitterService();

    try {
        console.log('🔧 Initializing Twitter service...');
        twitterService.initialize(twitterConfig);
        console.log('✅ Twitter service initialized successfully\n');

        // Test 1: Check rate limit status
        console.log('📊 Initial rate limit status:');
        const initialStatus = twitterService.getRateLimitStatus();
        console.log(`  • Requests in last minute: ${initialStatus.requestsInLastMinute}/15`);
        console.log(`  • Requests in last 15 min: ${initialStatus.requestsInLast15Minutes}/180`);
        console.log(`  • Is rate limited: ${initialStatus.isRateLimited}\n`);

        // Test 2: Search tweets with valid parameters
        console.log('🔍 Testing tweet search with valid parameters...');
        const tweets = await twitterService.searchTweets('bitcoin', 10);
        console.log(`✅ Found ${tweets.length} tweets\n`);

        // Test 3: Check rate limit after request
        console.log('📊 Rate limit status after first request:');
        const statusAfterRequest = twitterService.getRateLimitStatus();
        console.log(`  • Requests in last minute: ${statusAfterRequest.requestsInLastMinute}/15`);
        console.log(`  • Next available slot: ${Math.ceil(statusAfterRequest.nextAvailableSlot/1000)}s\n`);

        // Test 4: Test crypto sentiment analysis
        console.log('🎯 Testing crypto sentiment analysis...');
        const sentiment = await twitterService.analyzeCryptoSentiment('BTCUSDT');
        console.log(`✅ Sentiment analysis completed:`);
        console.log(`  • Posts analyzed: ${sentiment.posts.length}`);
        console.log(`  • Sentiment: ${sentiment.sentiment.label}`);
        console.log(`  • Confidence: ${sentiment.sentiment.confidence.toFixed(1)}%\n`);

        // Test 5: Check cache stats
        console.log('💾 Cache statistics:');
        const cacheStats = twitterService.getCacheStats();
        console.log(`  • Cache entries: ${cacheStats.size}`);
        console.log(`  • Oldest entry: ${cacheStats.oldestEntry}s ago\n`);

        // Test 6: Final rate limit check
        console.log('📊 Final rate limit status:');
        const finalStatus = twitterService.getRateLimitStatus();
        console.log(`  • Requests in last minute: ${finalStatus.requestsInLastMinute}/15`);
        console.log(`  • Requests in last 15 min: ${finalStatus.requestsInLast15Minutes}/180`);
        console.log(`  • Is rate limited: ${finalStatus.isRateLimited}`);

        if (finalStatus.rateLimitResetTime > 0) {
            const resetMinutes = Math.ceil(finalStatus.rateLimitResetTime / (60 * 1000));
            console.log(`  • Reset in: ${resetMinutes} minutes`);
        }

        console.log('\n🎉 All tests completed successfully!');

    } catch (error: any) {
        console.error('\n❌ Test failed:', error.message);

        if (error.message?.includes('rate limit')) {
            console.log('\n💡 This is expected behavior - the rate limiting is working correctly!');
            console.log('🕐 Please wait and try again later, or use the cache.');
        } else if (error.message?.includes('between 5 and 100')) {
            console.log('\n🔧 Parameter validation error - this should be fixed now.');
        } else {
            console.error('Full error details:', error);
        }
    }
}

// Run the test
testTwitterService().catch(console.error);
