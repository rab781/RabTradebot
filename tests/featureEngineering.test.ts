
import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { OHLCVCandle } from '../src/types/dataframe';

// Mock database
jest.mock('../src/database/database', () => ({
    getDatabase: jest.fn(() => ({
        getFeatureCache: jest.fn(() => null),
        insertFeatureCache: jest.fn(),
    })),
}));

describe('FeatureEngineeringService Performance', () => {
    function generateCandles(count: number): OHLCVCandle[] {
        const candles: OHLCVCandle[] = [];
        let price = 10000;
        const now = Date.now();

        for (let i = 0; i < count; i++) {
            const timestamp = now - (count - i) * 60000;
            const open = price;
            const close = price * (1 + (Math.random() - 0.5) * 0.01);
            const high = Math.max(open, close) * (1 + Math.random() * 0.005);
            const low = Math.min(open, close) * (1 - Math.random() * 0.005);
            const volume = 100 + Math.random() * 1000;

            candles.push({
                timestamp,
                open,
                high,
                low,
                close,
                volume,
                date: new Date(timestamp)
            });

            price = close;
        }
        return candles;
    }

    test('should be faster on second run', () => {
        console.log('Generating 2000 candles...');
        const candles = generateCandles(2000);
        const service = new FeatureEngineeringService(false);

        console.log('First run (cold cache)...');
        const start1 = process.hrtime();
        service.extractFeatures(candles, 'BTCUSDT');
        const end1 = process.hrtime(start1);
        const time1 = end1[0] * 1000 + end1[1] / 1e6;
        console.log(`First run took ${time1.toFixed(2)}ms`);

        console.log('Second run (warm cache)...');
        const start2 = process.hrtime();
        service.extractFeatures(candles, 'BTCUSDT');
        const end2 = process.hrtime(start2);
        const time2 = end2[0] * 1000 + end2[1] / 1e6;
        console.log(`Second run took ${time2.toFixed(2)}ms`);

        console.log(`Ratio: ${time1.toFixed(2)} / ${time2.toFixed(2)} = ${(time1/time2).toFixed(2)}x`);

        // Ensure significant performance improvement (at least 10x faster)
        expect(time2).toBeLessThan(time1 / 10);
    });
});
