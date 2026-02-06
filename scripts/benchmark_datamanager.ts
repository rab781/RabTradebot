import { DataManager } from '../src/services/dataManager';
import { OHLCVCandle } from '../src/types/dataframe';

// Mock large dataset generator
function generateMockCandles(count: number): OHLCVCandle[] {
    const candles: OHLCVCandle[] = [];
    const baseDate = new Date('2023-01-01');
    const basePrice = 50000;

    for (let i = 0; i < count; i++) {
        const timestamp = baseDate.getTime() + i * 60000;
        const volatility = (Math.random() - 0.5) * 100;

        candles.push({
            timestamp,
            open: basePrice + volatility,
            high: basePrice + volatility + 50,
            low: basePrice + volatility - 50,
            close: basePrice + volatility + 10,
            volume: Math.random() * 100,
            date: new Date(timestamp)
        });
    }
    return candles;
}

async function runBenchmark() {
    console.log('Starting DataManager benchmark...');
    const dataManager = new DataManager();

    // Test with increasing sizes until failure or limit
    const sizes = [1000, 10000, 50000, 100000, 200000];

    for (const size of sizes) {
        console.log(`\nTesting with ${size} candles...`);
        const candles = generateMockCandles(size);

        try {
            const start = process.hrtime();
            const summary = dataManager.getDataSummary(candles);
            const end = process.hrtime(start);
            const durationMs = (end[0] * 1000 + end[1] / 1e6).toFixed(2);

            console.log(`✅ Success! Duration: ${durationMs}ms`);
            console.log(`   Min: ${summary.priceRange.min.toFixed(2)}, Max: ${summary.priceRange.max.toFixed(2)}`);
        } catch (error: any) {
            console.error(`❌ Failed with ${size} candles!`);
            console.error(`   Error: ${error.message}`);
            if (error.stack) {
               // console.error(error.stack);
            }
            break; // Stop on first failure
        }
    }
}

runBenchmark().catch(console.error);
