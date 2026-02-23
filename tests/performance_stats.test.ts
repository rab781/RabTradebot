
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
        const stdDevOld = s.calculateStdDev(data);
        const skewOld = s.calculateSkewness(data);
        const kurtOld = s.calculateKurtosis(data);

        // New implementation call
        const statsNew = s.calculateAdvancedStats(data);

        const EPSILON = 1e-10;

        expect(Math.abs(meanOld - statsNew.mean)).toBeLessThan(EPSILON);
        // stdDev, skewness, kurtosis helpers also updated to support new signature but still work with (values)
        // However, calculateStdDev might have changed signature in a way that breaks existing calls?
        // Let's check calculateStdDev signature. It is (values, startIndex, length).
        // If length is undefined, it uses values.length. This is backward compatible.

        expect(Math.abs(stdDevOld - statsNew.stdDev)).toBeLessThan(EPSILON);
        expect(Math.abs(skewOld - statsNew.skewness)).toBeLessThan(EPSILON);
        expect(Math.abs(kurtOld - statsNew.kurtosis)).toBeLessThan(EPSILON);
    });

    test('calculateAutocorrelationWithMean matches old implementation', () => {
        const data = generateData(20);
        const s = service as any;

        const mean = data.reduce((a, b) => a + b, 0) / data.length;

        // Inline legacy implementation for comparison
        const calculateAutocorrelationOld = (values: number[], lag: number): number => {
            if (values.length <= lag) return 0;
            const m = values.reduce((a, b) => a + b, 0) / values.length;
            let numerator = 0;
            let denominator = 0;
            for (let i = 0; i < values.length - lag; i++) {
                numerator += (values[i] - m) * (values[i + lag] - m);
            }
            for (let i = 0; i < values.length; i++) {
                denominator += Math.pow(values[i] - m, 2);
            }
            return denominator !== 0 ? numerator / denominator : 0;
        };

        const lag = 1;
        const autoCorrOld = calculateAutocorrelationOld(data, lag);
        // New signature: values, startIndex, length, lag, mean
        const autoCorrNew = s.calculateAutocorrelationWithMean(data, 0, data.length, lag, mean);

        const EPSILON = 1e-10;
        expect(Math.abs(autoCorrOld - autoCorrNew)).toBeLessThan(EPSILON);

        const lag5 = 5;
        const autoCorrOld5 = calculateAutocorrelationOld(data, lag5);
        const autoCorrNew5 = s.calculateAutocorrelationWithMean(data, 0, data.length, lag5, mean);

        expect(Math.abs(autoCorrOld5 - autoCorrNew5)).toBeLessThan(EPSILON);
    });
});
