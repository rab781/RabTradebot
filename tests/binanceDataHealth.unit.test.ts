import {
    classifyClockDrift,
    validateKlines,
    validateTopOfBook,
} from '../src/services/marketData/binanceDataHealth';

describe('Binance Data Health validators', () => {
    test.each([
        [0, 'PASS'],
        [999, 'PASS'],
        [-999, 'PASS'],
        [1001, 'WARN'],
        [-3999, 'WARN'],
        [4001, 'FAIL'],
    ])('classifies clock offset %dms as %s', (offset, expected) => {
        expect(classifyClockDrift(offset)).toBe(expected);
    });

    it('accepts chronological valid klines', () => {
        const rows = [
            [0, '100', '105', '99', '102', '10', 59_999],
            [60_000, '102', '106', '101', '104', '11', 119_999],
            [120_000, '104', '108', '103', '107', '12', 179_999],
        ];
        expect(validateKlines(rows, 60_000).ok).toBe(true);
    });

    it('rejects missing candle intervals', () => {
        const rows = [
            [0, '100', '105', '99', '102', '10', 59_999],
            [120_000, '102', '106', '101', '104', '11', 179_999],
        ];
        const result = validateKlines(rows, 60_000);
        expect(result.ok).toBe(false);
        expect(result.detail).toContain('gap');
    });

    it('rejects duplicated or out-of-order candles', () => {
        const rows = [
            [60_000, '100', '105', '99', '102', '10', 119_999],
            [60_000, '102', '106', '101', '104', '11', 119_999],
        ];
        expect(validateKlines(rows, 60_000).ok).toBe(false);
    });

    it('rejects invalid OHLC bounds', () => {
        const rows = [
            [0, '100', '101', '99', '102', '10', 59_999],
            [60_000, '102', '106', '101', '104', '11', 119_999],
        ];
        expect(validateKlines(rows, 60_000).ok).toBe(false);
    });

    it('accepts a normal top of book', () => {
        const result = validateTopOfBook(100, 100.1, 2, 3);
        expect(result.ok).toBe(true);
        expect(result.detail).toContain('spread=');
    });

    it('rejects crossed/locked books', () => {
        expect(validateTopOfBook(100.1, 100).ok).toBe(false);
        expect(validateTopOfBook(100, 100).ok).toBe(false);
    });

    it('rejects zero quantities', () => {
        expect(validateTopOfBook(100, 101, 0, 2).ok).toBe(false);
        expect(validateTopOfBook(100, 101, 2, 0).ok).toBe(false);
    });
});
