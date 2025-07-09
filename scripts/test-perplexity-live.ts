#!/usr/bin/env ts-node

import { PerplexityService } from '../src/services/perplexityService';
import { config } from 'dotenv';

// Load environment variables
config();

async function testPerplexityLive() {
    console.log('🧪 Testing Perplexity Service with live API...\n');

    const perplexityService = new PerplexityService();

    // Test 1: Check if configured
    console.log('1️⃣ Testing configuration...');
    console.log(`✅ Is configured: ${perplexityService.isConfigured()}`);

    if (!perplexityService.isConfigured()) {
        console.log('❌ PERPLEXITY_API_KEY not found in .env file');
        return;
    }

    console.log('✅ API Key found!\n');

    // Test 2: Test news search
    console.log('2️⃣ Testing news search for BTCUSDT...');
    try {
        const newsItems = await perplexityService.searchCryptoNews('BTCUSDT', 5);
        console.log('✅ News search received!');
        console.log(`📰 News items found: ${newsItems.length}`);

        if (newsItems.length > 0) {
            console.log('\n📈 Sample news item:');
            const sample = newsItems[0];
            console.log(`   Title: ${sample.title.substring(0, 80)}...`);
            console.log(`   Impact: ${sample.impactLevel}`);
            console.log(`   Sentiment: ${sample.sentimentScore}`);
        }
    } catch (error: any) {
        console.error('❌ News search failed:', error.message);
    }

    console.log('\n3️⃣ Testing impact analysis for ETHUSDT...');
    try {
        const newsItems = await perplexityService.searchCryptoNews('ETHUSDT', 5);
        const impactAnalysis = await perplexityService.analyzeNewsImpact('ETHUSDT', newsItems);
        console.log('✅ Impact analysis received!');
        console.log(`📊 Overall sentiment: ${impactAnalysis.overallSentiment}`);
        console.log(`🎯 Short-term prediction: ${impactAnalysis.impactPrediction.shortTerm}`);
        console.log(`📈 Market direction: ${impactAnalysis.marketMovement.direction}`);
    } catch (error: any) {
        console.error('❌ Impact analysis failed:', error.message);
    }

    console.log('\n🎉 Perplexity service test completed!');
}

testPerplexityLive().catch(console.error);
