import axios from 'axios';
import { config } from 'dotenv';

config();

async function testChutesAPI() {
    const apiKey = process.env.CHUTES_API_KEY;

    console.log('🧪 Testing Chutes API Connection\n');
    console.log('API Key:', apiKey ? '✓ Found' : '✗ Not found');

    if (!apiKey) {
        console.log('❌ Please set CHUTES_API_KEY in your .env file');
        return;
    }

    console.log('\n📡 Sending request to Chutes API...\n');

    try {
        const response = await axios.post(
            'https://llm.chutes.ai/v1/chat/completions',
            {
                model: "Qwen/Qwen3-32B",
                messages: [
                    {
                        role: "user",
                        content: "Say 'Hello from Chutes!' and nothing else."
                    }
                ],
                max_tokens: 50,
                temperature: 0.7,
                stream: false  // IMPORTANT: Disable streaming
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        console.log('✅ SUCCESS! Response received:\n');
        console.log('Status:', response.status);
        console.log('Model:', response.data.model);
        console.log('\nResponse Content:');
        console.log(response.data.choices[0].message.content);
        console.log('\nFull Response Object:');
        console.log(JSON.stringify(response.data, null, 2));

    } catch (error: any) {
        console.log('❌ ERROR:\n');
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.log('No response received');
            console.log('Request:', error.message);
        } else {
            console.log('Error:', error.message);
        }
    }
}

testChutesAPI();
