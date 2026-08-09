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
    const seconds = Number(arg('seconds', '30'));
    const levels = Number(arg('levels', '10'));
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('--seconds must be positive.');
    if (!Number.isInteger(levels) || levels <= 0) throw new Error('--levels must be a positive integer.');

    console.log(`Binance Spot local order-book diagnostic — ${symbol}`);
    console.log('Dedicated @depth@100ms → REST snapshot → sequence replay → LIVE');

    const rest = new BinanceSpotDepthRestClient();
    const ws = new BinanceSpotDepthWebSocketClient();
    const engine = new SpotDepthOrderBookEngine(rest, ws, {
        symbol,
        outputLevels: levels,
        staleAfterMs: 5_000,
    });

    let depthEvents = 0;
    let maxEventAge = 0;
    let maxSpreadBps = 0;
    let minSpreadBps = Number.POSITIVE_INFINITY;
    engine.on('depth', (book) => {
        depthEvents += 1;
        maxSpreadBps = Math.max(maxSpreadBps, book.metrics.spreadBps);
        minSpreadBps = Math.min(minSpreadBps, book.metrics.spreadBps);
        maxEventAge = Math.max(maxEventAge, Math.max(0, Date.now() - book.receivedAt));
    });
    engine.on('gap', (gap) => console.warn('Depth sequence gap detected:', gap));
    engine.on('lifecycle', (event) => {
        if (event.type !== 'connected') console.log('Depth WS lifecycle:', event);
    });
    engine.on('error', (error) => console.error('Depth engine error:', error));

    await engine.start();
    console.log('✅ local order book bootstrap complete');
    await new Promise<void>((resolve) => setTimeout(resolve, seconds * 1_000));

    const snapshot = engine.getSnapshot(levels);
    const health = engine.getHealth();
    await engine.stop();

    console.log('\nBook:');
    console.log(`updateId=${snapshot.lastUpdateId}`);
    console.log(`bestBid=${snapshot.metrics.bestBid} x ${snapshot.metrics.bestBidQty}`);
    console.log(`bestAsk=${snapshot.metrics.bestAsk} x ${snapshot.metrics.bestAskQty}`);
    console.log(`spread=${snapshot.metrics.spreadBps.toFixed(4)} bps`);
    console.log(`mid=${snapshot.metrics.midPrice}`);
    console.log(`microprice=${snapshot.metrics.microPrice}`);
    console.log(`imbalance(${levels})=${snapshot.metrics.queueImbalance.toFixed(6)}`);
    console.log(`bidDepth=${snapshot.metrics.bidDepth} askDepth=${snapshot.metrics.askDepth}`);

    console.log('\nObservation:');
    console.log(`depth events=${depthEvents}`);
    console.log(`max event age=${maxEventAge}ms`);
    console.log(`spread range=${Number.isFinite(minSpreadBps) ? minSpreadBps.toFixed(4) : 'n/a'}..${maxSpreadBps.toFixed(4)} bps`);

    console.log('\nIntegrity:');
    console.log(health);

    const ready = health.sequenceGapCount === 0
        && health.invalidBookCount === 0
        && health.status === 'LIVE'
        && depthEvents > 0;
    if (!ready) {
        console.error('❌ NOT READY — inspect gap/resync/invalid-book counters.');
        process.exitCode = 1;
    } else {
        console.log('✅ READY — local order book stayed synchronized during the observation window.');
    }
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
