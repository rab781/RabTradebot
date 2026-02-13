import { FeatureEngineeringService } from './src/services/featureEngineering';
import { OHLCVCandle } from './src/types/dataframe';

// Mock technicalindicators to avoid installing if missing or slow
// But wait, the service imports them. I should try to run it with ts-node.
// If technicalindicators is not available, I might need to mock it or install it.
// Let's assume it is available since it is in package.json (I assume).

// Generate dummy data
const generateData = (count: number): OHLCVCandle[] => {
    const data: OHLCVCandle[] = [];
    let price = 1000;
    for (let i = 0; i < count; i++) {
        price = price * (1 + (Math.random() - 0.5) * 0.02);
        data.push({
            timestamp: i * 60000,
            open: price,
            high: price * 1.01,
            low: price * 0.99,
            close: price * (1 + (Math.random() - 0.5) * 0.01),
            volume: Math.random() * 100,
            date: new Date(i * 60000)
        });
    }
    return data;
};

const data = generateData(1000);
const service = new FeatureEngineeringService(false); // Disable DB cache

console.time('extractFeatures');
try {
    const features = service.extractFeatures(data, 'BTCUSDT');
    console.log(`Extracted ${features.length} feature sets`);
} catch (e) {
    console.error(e);
}
console.timeEnd('extractFeatures');
