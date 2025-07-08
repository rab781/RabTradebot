import { TwitterService } from '../src/services/twitterService';
import { config } from 'dotenv';

// Load environment variables
config();

async function testTwitterIntegration() {
    console.log('🐦 Testing Twitter Integration...\n');

    try {
        // Check if Twitter credentials are available
        const twitterConfig = {
            apiKey: process.env.TWITTER_API_KEY || '',
            apiKeySecret: process.env.TWITTER_API_KEY_SECRET || '',
            accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
            accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
            bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
        };

        if (!twitterConfig.apiKey || !twitterConfig.apiKeySecret) {
            console.log('❌ Twitter API credentials not found in environment variables');
            console.log('Please add the following to your .env file:');
            console.log('TWITTER_API_KEY=your_api_key');
            console.log('TWITTER_API_KEY_SECRET=your_api_key_secret');
            console.log('TWITTER_ACCESS_TOKEN=your_access_token');
            console.log('TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret');
            console.log('TWITTER_BEARER_TOKEN=your_bearer_token');
            console.log('\nSee TWITTER_SETUP.md for detailed instructions.');
            return;
        }

        console.log('✅ Twitter API credentials found');
        console.log('🔄 Initializing Twitter service...');

        const twitterService = new TwitterService();

        try {
            twitterService.initialize(twitterConfig);
            console.log('✅ Twitter service initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Twitter service:', error);
            return;
        }

        // Test 1: Search for Bitcoin tweets
        console.log('\n📊 Test 1: Searching for Bitcoin tweets...');
        try {
            const bitcoinTweets = await twitterService.searchTweets('Bitcoin BTC', 5);
            console.log(`✅ Found ${bitcoinTweets.length} Bitcoin tweets`);

            if (bitcoinTweets.length > 0) {
                console.log('Sample tweet:');
                const sample = bitcoinTweets[0];
                console.log(`- @${sample.author.username}: ${sample.text.substring(0, 100)}...`);
                console.log(`- Engagement: ${sample.metrics.likes} likes, ${sample.metrics.retweets} retweets`);
            }
        } catch (error) {
            console.error('❌ Failed to search tweets:', error);
        }

        // Test 2: Analyze crypto sentiment
        console.log('\n📊 Test 2: Analyzing BTCUSDT sentiment...');
        try {
            const sentiment = await twitterService.analyzeCryptoSentiment('BTCUSDT');
            console.log('✅ Sentiment analysis completed');
            console.log(`- Sentiment: ${sentiment.sentiment.label}`);
            console.log(`- Confidence: ${sentiment.sentiment.confidence.toFixed(1)}%`);
            console.log(`- Posts analyzed: ${sentiment.posts.length}`);
            console.log(`- Influencers found: ${sentiment.influencers.length}`);
            console.log(`- Trends: ${sentiment.trends.join(', ')}`);
        } catch (error) {
            console.error('❌ Failed to analyze sentiment:', error);
        }

        // Test 3: Get tweets from a specific user (if available)
        console.log('\n📊 Test 3: Getting tweets from @elonmusk...');
        try {
            const elonTweets = await twitterService.getTweetsFromUser('elonmusk', 3);
            console.log(`✅ Found ${elonTweets.length} tweets from @elonmusk`);

            if (elonTweets.length > 0) {
                console.log('Recent tweets:');
                elonTweets.forEach((tweet, index) => {
                    console.log(`${index + 1}. ${tweet.text.substring(0, 80)}...`);
                });
            }
        } catch (error) {
            console.error('❌ Failed to get user tweets:', error);
        }

        console.log('\n🎉 Twitter integration test completed!');

    } catch (error) {
        console.error('❌ Unexpected error during Twitter test:', error);
    }
}

// Run the test
testTwitterIntegration().catch(console.error);
