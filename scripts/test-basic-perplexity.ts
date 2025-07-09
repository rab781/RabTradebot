#!/usr/bin/env ts-node

import axios from 'axios';
import { config } from 'dotenv';

// Load environment variables
config();

async function testPerplexityBasic() {
    console.log('🧪 Testing Perplexity API with basic request...\n');
    
    const apiKey = process.env.PERPLEXITY_API_KEY;
    
    if (!apiKey) {
        console.log('❌ PERPLEXITY_API_KEY not found');
        return;
    }
    
    console.log('✅ API Key found:', apiKey.substring(0, 10) + '...');
    
    try {
        const response = await axios.post(
            'https://api.perplexity.ai/chat/completions',
            {
                model: "llama-3.1-sonar-small-128k-online",
                messages: [
                    {
                        role: "user",
                        content: "What is Bitcoin?"
                    }
                ]
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
        
        console.log('✅ API Response received!');
        console.log('Status:', response.status);
        console.log('Response data:', JSON.stringify(response.data, null, 2));
        
    } catch (error: any) {
        console.error('❌ API Error:');
        console.error('Status:', error.response?.status);
        console.error('Message:', error.message);
        console.error('Response data:', error.response?.data);
    }
}

testPerplexityBasic().catch(console.error);
