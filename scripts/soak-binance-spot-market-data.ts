import { BinanceSpotRestMarketDataClient } from '../src/services/marketData/binanceSpotRestMarketDataClient';
import { BinanceSpotWebSocketClient } from '../src/services/marketData/binanceSpotWebSocketClient';
import { SpotMarketDataEngine } from '../src/services/marketData/spotMarketDataEngine';
import { BinanceSpotDepthRestClient } from '../src/services/marketData/binanceSpotDepthRestClient';
import { BinanceSpotDepthWebSocketClient } from '../src/services/marketData/binanceSpotDepthWebSocketClient';
import { SpotDepthOrderBookEngine } from '../src/services/marketData/spotDepthOrderBookEngine';

function arg(name: string, fallback: string): string {
    const prefix = `--${name}=`;
    const match = process.argv.find((item) => item.startsWith(prefix));
    return match ? match.slice(prefix.length) : fallback;
}

async function main(): Promise<void> {
    const symbol = arg('symbol', 'BTCUSDT').toUpperCase();
    const interval = arg('interval', '1m');
    const minutes = Number(arg('minutes', '30'));
    if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('--minutes must be positive.');

    const market = new SpotMarketDataEngine(
        new BinanceSpotRestMarketDataClient(),
        new BinanceSpotWebSocketClient(),
        { symbol, interval, staleAfterMs: 10_000 },
    );
    const depth = new SpotDepthOrderBookEngine(
        new BinanceSpotDepthRestClient(),
        new BinanceSpotDepthWebSocketClient(),
        { symbol, outputLevels: 20, staleAfterMs: 5_000 },
    );

    let marketMaxAge = 0;
    let depthMaxAge = 0;
    let marketEvents = 0;
    let depthEvents = 0;
    market.on('candle', (event) => { marketEvents += 1; marketMaxAge = Math.max(marketMaxAge, Date.now() - event.receivedAt); });
    market.on('bookTicker', (event) => { marketEvents += 1; marketMaxAge = Math.max(marketMaxAge, Date.now() - event.receivedAt); });
    market.on('aggTrade', (event) => { marketEvents += 1; marketMaxAge = Math.max(marketMaxAge, Date.now() - event.receivedAt); });
    depth.on('depth', (book) => { depthEvents += 1; depthMaxAge = Math.max(depthMaxAge, Date.now() - book.receivedAt); });

    console.log(`Starting ${minutes}-minute Binance Spot soak test for ${symbol} ${interval}...`);
    await Promise.all([market.start(), depth.start()]);
    const startedAt = Date.now();
    const reportEveryMs = 60_000;
    const timer = setInterval(() => {
        const elapsedMin = (Date.now() - startedAt) / 60_000;
        console.log(`[${elapsedMin.toFixed(1)}m] market=${market.getHealth().status} depth=${depth.getHealth().status} marketEvents=${marketEvents} depthEvents=${depthEvents}`);
    }, reportEveryMs);
    timer.unref?.();

    await new Promise<void>((resolve) => setTimeout(resolve, minutes * 60_000));
    clearInterval(timer);
    const marketHealth = market.getHealth();
    const depthHealth = depth.getHealth();
    const book = depth.getSnapshot(20);
    await Promise.all([market.stop(), depth.stop()]);

    console.log('\nMarketData health:', marketHealth);
    console.log('Depth health:', depthHealth);
    console.log('Top book:', book.metrics);
    console.log(`market max event age=${marketMaxAge}ms; depth max event age=${depthMaxAge}ms`);

    const failures: string[] = [];
    if (marketHealth.outOfOrderEvents > 0) failures.push(`market outOfOrder=${marketHealth.outOfOrderEvents}`);
    if (marketHealth.tradeGapCount > 0) failures.push(`trade gaps=${marketHealth.tradeGapCount}`);
    if (marketHealth.candleGapCount > 0) failures.push(`candle gaps=${marketHealth.candleGapCount}`);
    if (depthHealth.invalidBookCount > 0) failures.push(`invalid books=${depthHealth.invalidBookCount}`);
    if (depthHealth.status !== 'LIVE') failures.push(`depth status=${depthHealth.status}`);
    if (marketHealth.status !== 'LIVE') failures.push(`market status=${marketHealth.status}`);

    if (failures.length > 0) {
        console.error(`❌ SOAK NOT CLEAN: ${failures.join(', ')}`);
        process.exitCode = 1;
    } else {
        console.log(`✅ SOAK CLEAN. Depth resyncs=${depthHealth.resyncCount}, reconnects=${depthHealth.reconnectCount}, sequence gaps=${depthHealth.sequenceGapCount}.`);
    }
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
