import 'dotenv/config';
import { BinanceSpotRestMarketDataClient } from '../src/services/marketData/binanceSpotRestMarketDataClient';
import { BinanceSpotWebSocketClient } from '../src/services/marketData/binanceSpotWebSocketClient';
import { SpotMarketDataEngine } from '../src/services/marketData/spotMarketDataEngine';

function arg(name: string, fallback: string): string {
    const prefix = `--${name}=`;
    const found = process.argv.find((item) => item.startsWith(prefix));
    return found ? found.slice(prefix.length) : fallback;
}

async function main(): Promise<void> {
    const symbol = arg('symbol', process.env.BINANCE_DATA_SYMBOL ?? 'BTCUSDT').toUpperCase();
    const interval = arg('interval', '1m');
    const durationSeconds = Math.max(5, Number(arg('seconds', '20')));

    if (String(process.env.ALLOW_INSECURE_TLS ?? '').toLowerCase() !== 'false') {
        throw new Error('Set ALLOW_INSECURE_TLS=false before running canonical Binance data diagnostics.');
    }

    const rest = new BinanceSpotRestMarketDataClient();
    const ws = new BinanceSpotWebSocketClient();
    const engine = new SpotMarketDataEngine(rest, ws, {
        symbol,
        interval,
        candleBootstrapLimit: 100,
        aggregateTradeBootstrapLimit: 100,
        maxCandleCache: 250,
        maxAggregateTradeCache: 2_000,
        staleAfterMs: 10_000,
    });

    let candleEvents = 0;
    let bookEvents = 0;
    let tradeEvents = 0;
    let maxEventAgeMs = 0;

    engine.on('candle', (data) => {
        candleEvents += 1;
        if (data.eventTime) maxEventAgeMs = Math.max(maxEventAgeMs, Date.now() - data.eventTime);
    });
    engine.on('bookTicker', () => { bookEvents += 1; });
    engine.on('aggTrade', (data) => {
        tradeEvents += 1;
        if (data.eventTime) maxEventAgeMs = Math.max(maxEventAgeMs, Date.now() - data.eventTime);
    });
    engine.on('gap', (gap) => console.warn('⚠️ gap detected', gap));
    engine.on('lifecycle', (event) => {
        if (event.type !== 'connected') console.log('WS lifecycle:', event);
    });

    console.log(`Binance Spot canonical market-data diagnostic — ${symbol} ${interval}`);
    console.log('WebSocket-first buffering → REST bootstrap → replay → LIVE');
    await engine.start();
    console.log('✅ bootstrap complete');

    await new Promise((resolve) => setTimeout(resolve, durationSeconds * 1_000));
    const snapshot = engine.getSnapshot();
    await engine.stop();

    console.log('\nSnapshot:');
    console.log(`candles=${snapshot.candles.length}`);
    console.log(`aggTrades=${snapshot.aggregateTrades.length}`);
    console.log(`bid=${snapshot.bookTicker?.bidPrice} ask=${snapshot.bookTicker?.askPrice}`);
    console.log('\nRealtime events:');
    console.log(`candle=${candleEvents} bookTicker=${bookEvents} aggTrade=${tradeEvents}`);
    console.log(`max event age=${maxEventAgeMs}ms`);
    console.log('\nIntegrity:');
    console.log(snapshot.health);

    const fail =
        snapshot.health.status === 'STALE' ||
        snapshot.health.candleGapCount > 0 ||
        snapshot.health.tradeGapCount > 0 ||
        snapshot.health.outOfOrderEvents > 0 ||
        bookEvents === 0 ||
        tradeEvents === 0 ||
        candleEvents === 0;

    if (fail) {
        process.exitCode = 1;
        console.error('❌ NOT READY — investigate integrity/realtime counters.');
    } else {
        console.log('✅ READY for next MarketData subphase (local depth/order book + soak test).');
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
