import { ImageChartService } from './services/imageChartService';
import * as fs from 'fs';
import * as path from 'path';

async function testCandlestickChart() {
    console.log('Testing Local Candlestick Chart with Swing Analysis...');

    const service = new ImageChartService();

    // Generate realistic mock data with clear swing patterns
    const mockData: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> = [];
    let basePrice = 100000;
    const now = Date.now();

    for (let i = 0; i < 60; i++) {
        const t = now - (60 - i) * 3600000; // 1h intervals

        // Create wave pattern for visible swings
        const wave = Math.sin(i / 5) * 2000;
        const noise = (Math.random() - 0.5) * 500;
        const trend = i * 30; // Slight uptrend

        const o = basePrice + wave + noise;
        const c = o + (Math.random() - 0.4) * 800; // Slight bullish bias
        const h = Math.max(o, c) + Math.random() * 400;
        const l = Math.min(o, c) - Math.random() * 400;

        mockData.push({ t, o, h, l, c, v: 100 });
        basePrice = c;
    }

    try {
        console.log('Generating candlestick chart...');
        const imageBuffer = await service.generateCandlestickChart('BTCUSDT', '1h', mockData);

        const outputPath = path.join(__dirname, '..', 'chart_candlestick_test.png');
        fs.writeFileSync(outputPath, imageBuffer);
        console.log(`✅ Candlestick Chart generated successfully!`);
        console.log(`📊 Saved to: ${outputPath}`);
        console.log(`📦 Size: ${imageBuffer.length} bytes`);
    } catch (error: any) {
        console.error('❌ Chart generation failed!');
        console.error('Error:', error.message);
        if (error.stack) console.error(error.stack);
    }
}

testCandlestickChart();
