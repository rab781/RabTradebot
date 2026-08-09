import path from 'path';
import { BinanceSpotRestMarketDataClient } from '../src/services/marketData/binanceSpotRestMarketDataClient';
import { BinanceSpotWebSocketClient } from '../src/services/marketData/binanceSpotWebSocketClient';
import { SpotMarketDataEngine } from '../src/services/marketData/spotMarketDataEngine';
import { BinanceSpotDepthRestClient } from '../src/services/marketData/binanceSpotDepthRestClient';
import { BinanceSpotDepthWebSocketClient } from '../src/services/marketData/binanceSpotDepthWebSocketClient';
import { SpotDepthOrderBookEngine } from '../src/services/marketData/spotDepthOrderBookEngine';
import { SpotMicrostructureFeatureEngine } from '../src/services/marketData/spotMicrostructureFeatureEngine';
import { JsonlResearchDatasetStore } from '../src/services/research/jsonlResearchDatasetStore';
import { SpotMicrostructureDatasetRecorder } from '../src/services/research/spotMicrostructureDatasetRecorder';

function arg(name: string, fallback: string): string {
    const item = process.argv.find((value) => value.startsWith(`--${name}=`));
    return item ? item.slice(name.length + 3) : fallback;
}

async function main(): Promise<void> {
    const symbol = arg('symbol', 'BTCUSDT').toUpperCase();
    const interval = arg('interval', '1m');
    const minutes = Number(arg('minutes', '30'));
    const sampleMs = Number(arg('sampleMs', '1000'));
    const output = path.resolve(arg('output', `data/research/${symbol.toLowerCase()}-microstructure-v1`));
    if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('--minutes must be > 0');

    const market = new SpotMarketDataEngine(
        new BinanceSpotRestMarketDataClient(), new BinanceSpotWebSocketClient(),
        { symbol, interval, candleBootstrapLimit: 100, aggregateTradeBootstrapLimit: 1000 },
    );
    const depth = new SpotDepthOrderBookEngine(
        new BinanceSpotDepthRestClient(), new BinanceSpotDepthWebSocketClient(),
        { symbol, outputLevels: 20 },
    );

    console.log(`Recording ${symbol} Spot microstructure research dataset for ${minutes} minutes`);
    console.log(`output=${output}`);
    console.log('Features and future outcomes are stored in separate append-only JSONL files.');

    await Promise.all([market.start(), depth.start()]);
    const features = new SpotMicrostructureFeatureEngine(market, depth, { symbol });
    features.start();
    const store = new JsonlResearchDatasetStore(output);
    const recorder = new SpotMicrostructureDatasetRecorder(features, store, {
        symbol, sampleIntervalMs: sampleMs,
        horizonsMs: [1_000, 5_000, 15_000, 30_000, 60_000],
        maxObservationLagMs: Math.max(2_000, sampleMs * 2),
        recordOnlyHealthy: true,
    });
    const manifest = await recorder.initialize();
    console.log(`schema=${manifest.schemaVersion}; features=${manifest.featureNames.length}; horizons=${manifest.horizonsMs.join(',')}`);

    let busy = false;
    const timer = setInterval(() => {
        if (busy) return;
        busy = true;
        recorder.sample().catch((error) => console.error('sample failed:', error)).finally(() => { busy = false; });
    }, sampleMs);

    const progress = setInterval(() => {
        const s = recorder.getStats();
        console.log({ features: s.featureRecords, outcomes: s.outcomeRecords, pending: s.pendingOutcomes, skippedUnhealthy: s.skippedUnhealthySamples, expired: s.expiredOutcomes });
    }, 60_000);

    await new Promise((resolve) => setTimeout(resolve, minutes * 60_000));
    clearInterval(timer); clearInterval(progress);
    while (busy) await new Promise((resolve) => setTimeout(resolve, 20));
    await recorder.flush();
    const final = recorder.getStats();
    features.stop();
    await Promise.all([market.stop(), depth.stop()]);
    console.log('Final recorder stats:', final);
    console.log('✅ Research dataset capture complete. Do not train directly until dataset QA/forward-label coverage is checked.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
