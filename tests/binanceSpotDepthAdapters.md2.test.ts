import { parseRestDepthSnapshot } from '../src/services/marketData/binanceSpotDepthRestClient';
import { buildBinanceSpotDepthStreamUrl, parseSpotDepthUpdate } from '../src/services/marketData/binanceSpotDepthWebSocketClient';

describe('Binance Spot depth adapters MD2', () => {
    it('parses REST depth snapshots', () => {
        const snapshot = parseRestDepthSnapshot('BTCUSDT', {
            lastUpdateId: 100,
            bids: [['100', '2'], ['99', '3']],
            asks: [['101', '4'], ['102', '5']],
        }, 10);
        expect(snapshot.lastUpdateId).toBe(100);
        expect(snapshot.bids[0]).toEqual({ price: 100, quantity: 2 });
    });

    it('rejects crossed REST depth snapshots', () => {
        expect(() => parseRestDepthSnapshot('BTCUSDT', {
            lastUpdateId: 1, bids: [['101', '1']], asks: [['101', '1']],
        })).toThrow(/Crossed or locked/);
    });

    it('rejects malformed REST levels', () => {
        expect(() => parseRestDepthSnapshot('BTCUSDT', {
            lastUpdateId: 1, bids: [['x', '1']], asks: [['101', '1']],
        })).toThrow(/price/);
    });

    it('builds dedicated 100ms market-data-only depth URL', () => {
        expect(buildBinanceSpotDepthStreamUrl('BTCUSDT')).toBe(
            'wss://data-stream.binance.vision/ws/btcusdt@depth@100ms',
        );
    });

    it('parses diff-depth WebSocket events', () => {
        const event = parseSpotDepthUpdate({
            e: 'depthUpdate', E: 10, s: 'BTCUSDT', U: 100, u: 102,
            b: [['100', '3'], ['99', '0']], a: [['101', '4']],
        }, 11);
        expect(event).toMatchObject({ symbol: 'BTCUSDT', firstUpdateId: 100, finalUpdateId: 102, receivedAt: 11 });
        expect(event?.bids[1].quantity).toBe(0);
    });

    it('rejects invalid update ID ranges', () => {
        expect(() => parseSpotDepthUpdate({
            e: 'depthUpdate', E: 10, s: 'BTCUSDT', U: 103, u: 102, b: [], a: [],
        })).toThrow(/update IDs/);
    });

    it('ignores non-depth and serverShutdown events', () => {
        expect(parseSpotDepthUpdate({ e: 'trade' })).toBeNull();
        expect(parseSpotDepthUpdate({ e: 'serverShutdown', E: 1 })).toBeNull();
    });
});
