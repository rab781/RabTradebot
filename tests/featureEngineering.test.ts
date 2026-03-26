import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { OHLCVCandle } from '../src/types/dataframe';

function makeCandles(count: number, startPrice = 100): OHLCVCandle[] {
    const baseTime = 1_700_000_000_000;
    const candles: OHLCVCandle[] = [];

    for (let i = 0; i < count; i++) {
        const drift = i * 0.08;
        const wave = Math.sin(i / 8) * 1.5;
        const close = startPrice + drift + wave;
        const open = close - 0.2;
        const high = close + 0.6;
        const low = close - 0.7;
        const volume = 1000 + i * 3;
        const timestamp = baseTime + i * 60 * 60 * 1000;

        candles.push({
            timestamp,
            open,
            high,
            low,
            close,
            volume,
            date: new Date(timestamp),
        });
    }

    return candles;
}

describe('FeatureEngineeringService', () => {
    it('throws when data is below minimum candle requirement', () => {
        const service = new FeatureEngineeringService(false);
        const data = makeCandles(150);

        expect(() => service.extractFeatures(data, 'BTCUSDT')).toThrow('Need at least 200 candles');
    });

    it('returns expected feature row count and finite numeric values', () => {
        const service = new FeatureEngineeringService(false);
        const data = makeCandles(260);

        const features = service.extractFeatures(data, 'BTCUSDT');

        expect(features.length).toBe(60);

        for (const row of features) {
            expect(row.symbol).toBe('BTCUSDT');
            expect(typeof row.timestamp).toBe('number');

            for (const [key, value] of Object.entries(row)) {
                if (key === 'symbol') {
                    continue;
                }

                expect(typeof value).toBe('number');
                expect(Number.isFinite(value as number)).toBe(true);
            }
        }
    });

    it('reuses memory cache on repeated extraction for the same symbol and candles', () => {
        const service = new FeatureEngineeringService(false);
        const data = makeCandles(240);

        const firstRun = service.extractFeatures(data, 'ETHUSDT');
        const cacheAfterFirst = service.getCacheSize();

        const secondRun = service.extractFeatures(data, 'ETHUSDT');
        const cacheAfterSecond = service.getCacheSize();

        expect(firstRun.length).toBe(secondRun.length);
        expect(cacheAfterFirst).toBeGreaterThan(0);
        expect(cacheAfterSecond).toBe(cacheAfterFirst);
        expect(secondRun[0]).toEqual(firstRun[0]);
    });
});
