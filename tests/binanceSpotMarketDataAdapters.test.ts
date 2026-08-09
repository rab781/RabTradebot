import {
    parseRestAggregateTrade,
    parseRestBookTicker,
    parseRestKline,
} from '../src/services/marketData/binanceSpotRestMarketDataClient';
import {
    buildBinanceSpotCombinedStreamUrl,
    parseCombinedSpotStreamMessage,
} from '../src/services/marketData/binanceSpotWebSocketClient';

describe('Binance Spot market-data adapters', () => {
    it('parses REST klines into canonical candles', () => {
        const candle = parseRestKline('BTCUSDT', '1m', [
            60_000, '100', '110', '90', '105', '12', 119_999,
            '1234', 50, '7', '700', '0',
        ], 120_000);
        expect(candle).toMatchObject({
            symbol: 'BTCUSDT', interval: '1m', open: 100, high: 110,
            low: 90, close: 105, volume: 12, closed: true, source: 'REST',
        });
    });

    it('rejects invalid REST OHLC bounds', () => {
        expect(() => parseRestKline('BTCUSDT', '1m', [
            0, '100', '99', '90', '105', '1', 59_999, '1', 1, '1', '1', '0',
        ])).toThrow(/OHLC/);
    });

    it('parses REST top-of-book', () => {
        const ticker = parseRestBookTicker('BTCUSDT', {
            symbol: 'BTCUSDT', bidPrice: '100', bidQty: '2', askPrice: '100.1', askQty: '3',
        }, 10);
        expect(ticker.bidPrice).toBe(100);
        expect(ticker.askPrice).toBe(100.1);
    });

    it('rejects crossed REST top-of-book', () => {
        expect(() => parseRestBookTicker('BTCUSDT', {
            symbol: 'BTCUSDT', bidPrice: '100', bidQty: '2', askPrice: '100', askQty: '3',
        })).toThrow(/Crossed or locked/);
    });

    it('parses REST aggregate trades', () => {
        const trade = parseRestAggregateTrade('BTCUSDT', {
            a: 10, p: '100', q: '0.2', f: 20, l: 21, T: 123, m: true,
        }, 200);
        expect(trade).toMatchObject({ id: 10, price: 100, quantity: 0.2, buyerIsMaker: true });
    });

    it('builds a market-data-only combined stream URL', () => {
        expect(buildBinanceSpotCombinedStreamUrl('BTCUSDT', '1m')).toBe(
            'wss://data-stream.binance.vision/stream?streams=btcusdt@bookTicker/btcusdt@aggTrade/btcusdt@kline_1m',
        );
    });

    it('parses WebSocket bookTicker', () => {
        const event = parseCombinedSpotStreamMessage({
            stream: 'btcusdt@bookTicker',
            data: { u: 9, s: 'BTCUSDT', b: '100', B: '1', a: '100.1', A: '2' },
        }, 500);
        expect(event?.type).toBe('bookTicker');
        if (event?.type === 'bookTicker') expect(event.data.updateId).toBe(9);
    });

    it('parses WebSocket aggTrade', () => {
        const event = parseCombinedSpotStreamMessage({
            stream: 'btcusdt@aggTrade',
            data: { e: 'aggTrade', E: 10, s: 'BTCUSDT', a: 5, p: '100', q: '1', f: 8, l: 8, T: 9, m: false },
        }, 500);
        expect(event?.type).toBe('aggTrade');
        if (event?.type === 'aggTrade') expect(event.data.eventTime).toBe(10);
    });

    it('parses WebSocket UTC kline updates', () => {
        const event = parseCombinedSpotStreamMessage({
            stream: 'btcusdt@kline_1m',
            data: {
                e: 'kline', E: 100, s: 'BTCUSDT',
                k: { t: 60_000, T: 119_999, s: 'BTCUSDT', i: '1m', o: '100', h: '110', l: '90', c: '105', v: '2', n: 10, x: false, q: '200', V: '1', Q: '100' },
            },
        }, 500);
        expect(event?.type).toBe('candle');
        if (event?.type === 'candle') {
            expect(event.data.openTime).toBe(60_000);
            expect(event.data.closed).toBe(false);
        }
    });

    it('ignores serverShutdown payload as market data', () => {
        expect(parseCombinedSpotStreamMessage({
            stream: '!serverShutdown', data: { e: 'serverShutdown', E: 1 },
        })).toBeNull();
    });
});
