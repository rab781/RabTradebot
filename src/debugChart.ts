import { ImageChartService } from './services/imageChartService';
import * as fs from 'fs';
import * as path from 'path';

async function testPatternChart() {
    console.log('Testing Pattern Detection & Chart Analysis...');

    const service = new ImageChartService();

    // Generate mock data with intentional patterns
    const mockData: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> = [];
    const now = Date.now();
    let basePrice = 100000;

    // Create a Double Bottom pattern followed by uptrend then Double Top
    const pricePattern = [
        // Initial decline
        -500, -800, -600, -1000, -400,
        // First bottom
        -200, -100, 200, 400, 600, 800,
        // Rise to middle
        500, 700, 300, 200, 100,
        // Second bottom (similar level to first)
        -600, -800, -500, -200, 100, 400,
        // Strong uptrend with first top
        800, 1200, 1000, 1500, 1800, 2000, 1500, 1200,
        // Second top (similar level)
        1600, 1900, 2100, 1800, 1400, 1000,
        // Decline after double top
        600, 300, -200, -500, -800,
        // Some consolidation (triangle pattern)
        -400, -200, 100, -100, 50, -50, 20, -20, 100, 200,
        // Breakout
        500, 800, 1000, 1200
    ];

    for (let i = 0; i < pricePattern.length; i++) {
        const t = now - (pricePattern.length - i) * 3600000;
        const change = pricePattern[i];
        const noise = (Math.random() - 0.5) * 200;

        const o = basePrice;
        const c = basePrice + change + noise;
        const h = Math.max(o, c) + Math.random() * 300;
        const l = Math.min(o, c) - Math.random() * 300;

        mockData.push({ t, o, h, l, c, v: 100 });
        basePrice = c;
    }

    try {
        console.log('Generating pattern analysis chart...');
        const result = await service.generateCandlestickChart('BTCUSDT', '1h', mockData);

        const outputPath = path.join(__dirname, '..', 'chart_pattern_test.png');
        fs.writeFileSync(outputPath, result.buffer);

        console.log(`\n✅ Chart generated successfully!`);
        console.log(`📊 Saved to: ${outputPath}`);
        console.log(`📦 Size: ${result.buffer.length} bytes`);
        console.log(`\n📈 Detected Patterns: ${result.patterns.length}`);
        result.patterns.forEach(p => {
            console.log(`   - ${p.name} (${p.confidence}%) - ${p.direction} ${p.type}`);
            console.log(`     ${p.description}`);
            if (p.target) console.log(`     Target: $${p.target.toFixed(2)}`);
        });
        console.log(`\n🔒 S/R Levels: ${result.srLevels.length}`);
        result.srLevels.forEach(l => {
            console.log(`   - ${l.type.toUpperCase()}: $${l.price.toFixed(2)} (${l.strength}% strength)`);
        });
    } catch (error: any) {
        console.error('❌ Chart generation failed!');
        console.error('Error:', error.message);
        if (error.stack) console.error(error.stack);
    }
}

testPatternChart();
