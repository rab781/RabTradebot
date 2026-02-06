
import { FeatureEngineeringService } from './featureEngineering';
import { OHLCVCandle } from '../types/dataframe';

describe('FeatureEngineeringService', () => {
    let service: FeatureEngineeringService;

    beforeEach(() => {
        service = new FeatureEngineeringService(false);
    });

    function generateCandles(count: number): OHLCVCandle[] {
        const candles: OHLCVCandle[] = [];
        let price = 100;
        const now = Date.now();

        for (let i = 0; i < count; i++) {
            const timestamp = now - (count - i) * 60000;
            const change = (Math.random() - 0.5) * 2;
            const open = price;
            const close = price + change;
            const high = Math.max(open, close) + Math.random();
            const low = Math.min(open, close) - Math.random();
            const volume = Math.random() * 1000 + 100;

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

    it('should extract features correctly', () => {
        const candles = generateCandles(300);
        const features = service.extractFeatures(candles, 'TEST');

        expect(features.length).toBe(100); // 300 - 200 = 100

        const firstFeature = features[0];
        expect(firstFeature.symbol).toBe('TEST');
        expect(firstFeature.returns_mean_20).toBeDefined();
        expect(firstFeature.volatility_20).toBeDefined();
        expect(firstFeature.volatility_50).toBeDefined();

        // Sanity check values
        expect(firstFeature.volatility_20).not.toBeNaN();
        expect(firstFeature.volatility_50).not.toBeNaN();
    });
});
