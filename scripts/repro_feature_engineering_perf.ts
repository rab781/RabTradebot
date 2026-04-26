
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Module = require('module');
const originalRequire = Module.prototype.require;

// Mock the database module before importing anything that uses it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Module.prototype.require = function(path: string, ...args: any[]) {
  if (path.includes('database/database')) {
      return {
          getDatabase: () => ({
              getFeatureCache: () => null,
              insertFeatureCache: () => {},
              getStats: () => ({})
          }),
          closeDatabase: () => {}
      };
  }
  return originalRequire.apply(this, [path, ...args]);
};

import { FeatureEngineeringService, FeatureSet } from '../src/services/featureEngineering';
import { OHLCVCandle } from '../src/types/dataframe';

const generateCandles = (count: number): OHLCVCandle[] => {
    const candles: OHLCVCandle[] = [];
    let price = 100;
    const now = Date.now();
    for (let i = 0; i < count; i++) {
        const change = (Math.random() - 0.5) * 2;
        price += change;
        candles.push({
            timestamp: now - (count - i) * 60000,
            open: price,
            high: price + Math.random(),
            low: price - Math.random(),
            close: price + (Math.random() - 0.5),
            volume: Math.random() * 1000,
            date: new Date(now - (count - i) * 60000)
        });
    }
    return candles;
};

const run = async () => {
    console.log('Generating candles...');
    const count = 1000;
    const candles = generateCandles(count);
    const service = new FeatureEngineeringService(false); // No DB

    console.log('Running 1st pass (cold cache)...');
    const start1 = process.hrtime();
    const result1 = service.extractFeatures(candles, 'BTCUSDT');
    const end1 = process.hrtime(start1);
    const time1 = end1[0] * 1000 + end1[1] / 1e6;
    console.log(`1st pass took ${time1.toFixed(2)}ms`);

    console.log('Running 2nd pass (warm cache)...');
    const start2 = process.hrtime();
    const result2 = service.extractFeatures(candles, 'BTCUSDT');
    const end2 = process.hrtime(start2);
    const time2 = end2[0] * 1000 + end2[1] / 1e6;
    console.log(`2nd pass took ${time2.toFixed(2)}ms`);

    // Verify results match
    if (result1.length !== result2.length) {
        console.error('Mismatch in result length!');
        process.exit(1);
    }

    const json1 = JSON.stringify(result1);
    const json2 = JSON.stringify(result2);
    if (json1 !== json2) {
        console.error('Mismatch in result content!');
        process.exit(1);
    } else {
        console.log('Results match perfectly.');
    }
};

run().catch(console.error);
