
import { ImageChartService } from './services/imageChartService';
import * as fs from 'fs';
import * as path from 'path';

async function testChart() {
    console.log('Testing Local ImageChartService (chartjs-node-canvas)...');

    // Create instance
    const service = new ImageChartService();

    // Mock data
    const mockData = Array.from({ length: 30 }, (_, i) => {
        const t = new Date();
        t.setDate(t.getDate() - (30 - i));
        return {
            t: t.getTime(),
            o: 50000 + Math.random() * 1000,
            h: 51000 + Math.random() * 1000,
            l: 49000 + Math.random() * 1000,
            c: 50000 + Math.random() * 1000,
            v: 100
        };
    });

    try {
        console.log('Generating chart...');
        const imageBuffer = await service.generateCandlestickChart('BTCUSDT', '1d', mockData);

        const outputPath = path.join(__dirname, '..', 'chart_local_test.png');
        fs.writeFileSync(outputPath, imageBuffer);
        console.log(`✅ Local Chart generated successfully! Saved to ${outputPath}`);
        console.log('Size:', imageBuffer.length, 'bytes');
    } catch (error: any) {
        console.error('❌ Chart generation failed!');
        console.error('Error:', error.message);
        if (error.stack) console.error(error.stack);
    }
}

testChart();
