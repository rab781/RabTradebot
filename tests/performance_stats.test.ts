
import { FeatureEngineeringService } from '../src/services/featureEngineering';

describe('FeatureEngineeringService Statistics Optimization', () => {
    const service = new FeatureEngineeringService(false);

    const generateData = (count: number) => {
        const data: number[] = [];
        for (let i = 0; i < count; i++) {
            data.push(Math.random() * 100 - 50);
        }
        return data;
    };

    test('calculateAdvancedStats matches old implementation', () => {
        const data = generateData(20);

        // Access private methods via any
        const s = service as any;

        // Old implementation calls
        const meanOld = data.reduce((a, b) => a + b, 0) / data.length;
        const stdDevOld = s.calculateStdDev(data, 0, data.length);
        const skewOld = s.calculateSkewness(data);
        const kurtOld = s.calculateKurtosis(data);

        // New implementation call
        const statsNew = s.calculateAdvancedStats(data, 0, data.length);

        const EPSILON = 1e-10;

        expect(Math.abs(meanOld - statsNew.mean)).toBeLessThan(EPSILON);
        expect(Math.abs(stdDevOld - statsNew.stdDev)).toBeLessThan(EPSILON);
        expect(Math.abs(skewOld - statsNew.skewness)).toBeLessThan(EPSILON);
        expect(Math.abs(kurtOld - statsNew.kurtosis)).toBeLessThan(EPSILON);
    });

    test('calculateAutocorrelationWithMean matches old implementation', () => {
        const data = generateData(20);
        const s = service as any;

        const mean = data.reduce((a, b) => a + b, 0) / data.length;

        const lag = 1;
        const autoCorrOld = s.calculateAutocorrelation(data, lag);
        const autoCorrNew = s.calculateAutocorrelationWithMean(data, lag, mean, 0, data.length);

        const EPSILON = 1e-10;
        expect(Math.abs(autoCorrOld - autoCorrNew)).toBeLessThan(EPSILON);

        const lag5 = 5;
        const autoCorrOld5 = s.calculateAutocorrelation(data, lag5);
        const autoCorrNew5 = s.calculateAutocorrelationWithMean(data, lag5, mean, 0, data.length);

        expect(Math.abs(autoCorrOld5 - autoCorrNew5)).toBeLessThan(EPSILON);
    });
});
