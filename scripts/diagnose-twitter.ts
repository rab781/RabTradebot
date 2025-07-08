import { TwitterService } from '../src/services/twitterService';
import { config } from 'dotenv';

// Load environment variables
config();

async function diagnoseTwitterIssues() {
    console.log('🔍 DIAGNOSING TWITTER API ISSUES...\n');

    const twitterConfig = {
        apiKey: process.env.TWITTER_API_KEY || '',
        apiKeySecret: process.env.TWITTER_API_KEY_SECRET || '',
        accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
        accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
        bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
    };

    if (!twitterConfig.apiKey || !twitterConfig.apiKeySecret) {
        console.error('❌ Twitter API credentials not found in .env file');
        return;
    }

    const twitterService = new TwitterService();

    try {
        console.log('🔧 Initializing Twitter service...');
        twitterService.initialize(twitterConfig);
        console.log('✅ Twitter service initialized\n');

        // Test 1: Simple search with different queries
        const testQueries = [
            'bitcoin',
            'BTC',
            '$BTC',
            'crypto',
            'cryptocurrency',
            'blockchain'
        ];

        for (const query of testQueries) {
            try {
                console.log(`🔍 Testing query: "${query}"`);

                const tweets = await twitterService.searchTweets(query, 5);
                console.log(`  ✅ Found ${tweets.length} tweets`);

                if (tweets.length > 0) {
                    console.log(`  📝 Sample tweet: "${tweets[0].text.substring(0, 100)}..."`);
                    console.log(`  👤 Author: @${tweets[0].author.username} (${tweets[0].author.followers} followers)`);
                    console.log(`  💚 Engagement: ${tweets[0].metrics.likes} likes, ${tweets[0].metrics.retweets} retweets\n`);
                } else {
                    console.log(`  ⚠️ No tweets found for "${query}"\n`);
                }

                // Wait between requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 6000));

            } catch (error: any) {
                console.error(`  ❌ Error searching for "${query}": ${error.message}\n`);

                if (error.message?.includes('rate limit')) {
                    console.log('⏸️ Rate limited, stopping further tests\n');
                    break;
                }
            }
        }

        // Test 2: Check API access level
        console.log('🔐 CHECKING API ACCESS LEVEL:');
        try {
            // Try to get rate limit status - this works with basic access
            const response = await (twitterService as any).client.v2.get('tweets/search/recent', {
                query: 'test',
                max_results: 5
            });

            if (response.data && response.data.length > 0) {
                console.log('✅ API is working - you have proper access');
            } else {
                console.log('⚠️ API responds but returns no data');
            }
        } catch (error: any) {
            console.error('❌ API Access Error:', error.message);

            if (error.code === 401) {
                console.log('💡 Issue: Authentication failed');
                console.log('   - Check your API credentials');
                console.log('   - Make sure your Twitter app has the right permissions');
            } else if (error.code === 403) {
                console.log('💡 Issue: Access forbidden');
                console.log('   - Your app might need elevated access');
                console.log('   - Apply for Twitter API v2 access at developer.twitter.com');
            } else if (error.code === 429) {
                console.log('💡 Issue: Rate limited');
                console.log('   - You have made too many requests');
                console.log('   - Wait 15 minutes and try again');
            }
        }

        // Test 3: Check credentials format
        console.log('\n🔑 CREDENTIAL CHECK:');
        console.log(`API Key length: ${twitterConfig.apiKey.length}`);
        console.log(`API Secret length: ${twitterConfig.apiKeySecret.length}`);
        console.log(`Access Token length: ${twitterConfig.accessToken.length}`);
        console.log(`Access Secret length: ${twitterConfig.accessTokenSecret.length}`);
        console.log(`Bearer Token length: ${twitterConfig.bearerToken.length}`);

        // Test 4: Alternative search method
        console.log('\n🔄 TRYING ALTERNATIVE SEARCH METHOD:');
        try {
            // Try using Bearer token only (for v2 API)
            const TwitterApi = require('twitter-api-v2').TwitterApi;
            const bearerClient = new TwitterApi(twitterConfig.bearerToken);

            const alternativeSearch = await bearerClient.v2.search('bitcoin', {
                max_results: 5,
                'tweet.fields': ['created_at', 'public_metrics']
            });

            console.log(`✅ Bearer token search found ${alternativeSearch.data?.length || 0} tweets`);

            if (alternativeSearch.data && alternativeSearch.data.length > 0) {
                console.log(`📝 Sample: "${alternativeSearch.data[0].text.substring(0, 100)}..."`);
            }

        } catch (error: any) {
            console.error('❌ Bearer token search failed:', error.message);
        }

    } catch (error: any) {
        console.error('\n❌ Diagnosis failed:', error.message);
        console.error('Full error:', error);
    }
}

// Run the diagnosis
diagnoseTwitterIssues().catch(console.error);
