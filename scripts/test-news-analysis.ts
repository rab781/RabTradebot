import { NewsAnalyzer } from '../src/services/newsAnalyzer';
import { config } from 'dotenv';

// Load environment variables
config();

async function testNewsAnalysis() {
    console.log('🧪 Testing News Analysis with Twitter Integration...\n');

    const newsAnalyzer = new NewsAnalyzer();

    try {
        console.log('📰 Testing comprehensive news analysis for BTCUSDT...');

        const analysis = await newsAnalyzer.analyzeComprehensiveNews('BTCUSDT');

        console.log('\n✅ Analysis completed successfully!');
        console.log('\n📊 RESULTS:');
        console.log(`• Symbol: ${analysis.symbol}`);
        console.log(`• Traditional News Articles: ${analysis.traditionalNews.articles.length}`);
        console.log(`• Traditional Sentiment: ${analysis.traditionalNews.sentiment}`);

        if (analysis.twitterAnalysis) {
            console.log(`• Twitter Posts Analyzed: ${analysis.twitterAnalysis.posts.length}`);
            console.log(`• Twitter Sentiment: ${analysis.twitterAnalysis.sentiment.label}`);
            console.log(`• Twitter Confidence: ${analysis.twitterAnalysis.sentiment.confidence.toFixed(1)}%`);

            if (analysis.twitterAnalysis.posts.length === 0) {
                console.log('⚠️ Twitter analysis returned fallback data (no posts)');
                console.log('📝 Twitter summary:', analysis.twitterAnalysis.summary);
            }
        } else {
            console.log('• Twitter Analysis: Not available');
        }

        console.log(`• Combined Sentiment: ${analysis.combinedSentiment.label}`);
        console.log(`• Combined Confidence: ${analysis.combinedSentiment.confidence.toFixed(1)}%`);

        console.log('\n📄 FULL SUMMARY:');
        console.log(analysis.summary);

    } catch (error: any) {
        console.error('❌ Test failed:', error.message);
        console.error('Full error:', error);
    }
}

// Run the test
testNewsAnalysis().catch(console.error);
