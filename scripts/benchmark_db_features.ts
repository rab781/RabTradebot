
import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { OHLCVCandle } from '../src/types/dataframe';
import { getDatabase, closeDatabase } from '../src/database/database';
import * as fs from 'fs';
import * as path from 'path';

function generateDummyCandles(count: number): OHLCVCandle[] {
    const candles: OHLCVCandle[] = [];
    let currentTime = 1600000000000;
    let price = 10000;

    for (let i = 0; i < count; i++) {
        const open = price;
        const change = (Math.random() - 0.5) * 100;
        const close = open + change;
        const high = Math.max(open, close) + Math.random() * 10;
        const low = Math.min(open, close) - Math.random() * 10;
        const volume = Math.random() * 1000;

        candles.push({
            timestamp: currentTime,
            open,
            high,
            low,
            close,
            volume,
            date: new Date(currentTime)
        });

        price = close;
        currentTime += 3600000; // 1 hour
    }
    return candles;
}

async function runBenchmark() {
    console.log('🚀 Starting Benchmark: Feature Extraction');
    const dbPath = 'benchmark.db';

    // Clean up previous run
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
    // Also clean up WAL/SHM files if they exist
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');

    closeDatabase();

    // Initialize DB
    const db = getDatabase(dbPath);

    // Generate data
    const candleCount = 2000;
    console.log(`Generating ${candleCount} dummy candles...`);
    const data = generateDummyCandles(candleCount);

    const service = new FeatureEngineeringService(true);

    // First run (Populate Cache/DB)
    console.log('Running extraction (Empty DB)...');
    const start1 = performance.now();
    const features1 = service.extractFeatures(data, 'TEST_SYMBOL');
    const end1 = performance.now();

    console.log(`✅ Extracted ${features1.length} features`);
    console.log(`⏱️  Time taken (Empty DB): ${(end1 - start1).toFixed(2)}ms`);

    // Reset service internal memory cache to force DB usage
    // We can't access private cache, so we create a new service instance
    const service2 = new FeatureEngineeringService(true);

    // Second run (Read from DB Cache)
    console.log('Running extraction (Populated DB - N+1 Issue here)...');
    const start2 = performance.now();
    const features2 = service2.extractFeatures(data, 'TEST_SYMBOL');
    const end2 = performance.now();

    console.log(`✅ Extracted ${features2.length} features`);
    console.log(`⏱️  Time taken (Populated DB): ${(end2 - start2).toFixed(2)}ms`);

    closeDatabase();

    // Cleanup
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
}

runBenchmark().catch(console.error);
