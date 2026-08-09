import { BinanceSpotRestMarketDataClient } from '../src/services/marketData/binanceSpotRestMarketDataClient';
import { BinanceSpotWebSocketClient } from '../src/services/marketData/binanceSpotWebSocketClient';
import { SpotMarketDataEngine } from '../src/services/marketData/spotMarketDataEngine';
import { BinanceSpotDepthRestClient } from '../src/services/marketData/binanceSpotDepthRestClient';
import { BinanceSpotDepthWebSocketClient } from '../src/services/marketData/binanceSpotDepthWebSocketClient';
import { SpotDepthOrderBookEngine } from '../src/services/marketData/spotDepthOrderBookEngine';
import { SpotMicrostructureFeatureEngine } from '../src/services/marketData/spotMicrostructureFeatureEngine';

function arg(name: string, fallback: string): string {
    const item = process.argv.find((value) => value.startsWith(`--${name}=`));
    return item ? item.slice(name.length + 3) : fallback;
}

async function main(): Promise<void> {
    const symbol = arg('symbol', 'BTCUSDT').toUpperCase();
    const interval = arg('interval', '1m');
    const seconds = Number(arg('seconds', '30'));

    const market = new SpotMarketDataEngine(
        new BinanceSpotRestMarketDataClient(),
        new BinanceSpotWebSocketClient(),
        { symbol, interval, candleBootstrapLimit: 100, aggregateTradeBootstrapLimit: 500 },
    );
    const depth = new SpotDepthOrderBookEngine(
        new BinanceSpotDepthRestClient(),
        new BinanceSpotDepthWebSocketClient(),
        { symbol, outputLevels: 20 },
    );

    console.log(`Binance Spot microstructure diagnostic — ${symbol}`);
    console.log('Canonical aggTrade + synchronized local depth → MD3 features');

    await Promise.all([market.start(), depth.start()]);
    const features = new SpotMicrostructureFeatureEngine(market, depth, { symbol });
    features.start();

    const started = Date.now();
    let samples = 0;
    const timer = setInterval(() => {
        const s = features.getSnapshot();
        samples += 1;
        console.log({
            t: `${((Date.now() - started) / 1000).toFixed(1)}s`,
            healthy: s.quality.healthy,
            spreadBps: Number(s.spreadBps.toFixed(4)),
            microDevBps: Number(s.microPriceDeviationBps.toFixed(4)),
            qi1: Number(s.depth1.queueImbalance.toFixed(4)),
            qi10: Number(s.depth10.queueImbalance.toFixed(4)),
            cvd5s: Number(s.trade5s.signedBaseCvd.toFixed(6)),
            tradeImb5s: Number(s.trade5s.takerVolumeImbalance.toFixed(4)),
            ofi5s: Number(s.depthFlow5s.ofi.toFixed(6)),
            ofiNorm5s: Number(s.depthFlow5s.ofiNormalized.toFixed(4)),
            visiblePressure5s: Number(s.depthFlow5s.visibleLiquidityPressure.toFixed(4)),
        });
    }, 5_000);

    await new Promise((resolve) => setTimeout(resolve, seconds * 1_000));
    clearInterval(timer);
    const final = features.getSnapshot();
    const vector = features.toFlatVector(final);
    console.log('\nFinal quality:', final.quality);
    console.log(`Feature vector: schema=${vector.schemaVersion}, dimensions=${vector.values.length}, finite=${vector.values.every(Number.isFinite)}`);

    features.stop();
    await Promise.all([market.stop(), depth.stop()]);

    if (!final.quality.healthy || samples === 0) {
        process.exitCode = 1;
        console.error('❌ NOT READY — microstructure quality gate failed.');
        return;
    }
    console.log('✅ READY — live Spot microstructure feature stream is healthy.');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
