import {
    BinanceSpotExchangeSymbol,
    floorToStepSize,
    parseBinanceSpotSymbolRules,
    toLegacySpotMarketTradeRules,
    validateSpotMarketOrder,
} from '../src/services/exchangeRules/binanceSpotRules';

function liveStyleBtc(overrides: Partial<BinanceSpotExchangeSymbol> = {}): BinanceSpotExchangeSymbol {
    return {
        symbol: 'BTCUSDT',
        status: 'TRADING',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        filters: [
            { filterType: 'PRICE_FILTER', minPrice: '0.01000000', maxPrice: '10000000.00000000', tickSize: '0.01000000' },
            { filterType: 'LOT_SIZE', minQty: '0.00001000', maxQty: '9000.00000000', stepSize: '0.00001000' },
            // Deliberately stricter than LOT_SIZE to prove MARKET rules win/intersect.
            { filterType: 'MARKET_LOT_SIZE', minQty: '0.00010000', maxQty: '120.00000000', stepSize: '0.00010000' },
            {
                filterType: 'NOTIONAL',
                minNotional: '5.00000000',
                applyMinToMarket: true,
                maxNotional: '1000000.00000000',
                applyMaxToMarket: true,
                avgPriceMins: 5,
            },
            { filterType: 'PERCENT_PRICE_BY_SIDE', bidMultiplierUp: '5', bidMultiplierDown: '0.2' },
        ],
        ...overrides,
    };
}

describe('Spot exchange-rule correctness', () => {
    it('parses NOTIONAL and MARKET_LOT_SIZE from a modern Spot exchangeInfo payload', () => {
        const rules = parseBinanceSpotSymbolRules(liveStyleBtc());

        expect(rules.marketLotSize?.stepSize).toBe('0.00010000');
        expect(rules.effectiveMarketQuantity).toEqual({
            minQty: '0.00010000',
            maxQty: '120.00000000',
            stepSize: '0.0001',
        });
        expect(rules.marketNotional).toMatchObject({
            minNotional: '5.00000000',
            maxNotional: '1000000.00000000',
            minAvgPriceMins: 5,
            maxAvgPriceMins: 5,
            sourceFilters: ['NOTIONAL'],
        });
    });

    it('keeps legacy minQty/maxQty/stepSize mapped to effective MARKET rules', () => {
        const legacy = toLegacySpotMarketTradeRules(parseBinanceSpotSymbolRules(liveStyleBtc()));

        expect(legacy.minQty).toBe(0.0001);
        expect(legacy.maxQty).toBe(120);
        expect(legacy.stepSize).toBe(0.0001);
        expect(legacy.minNotional).toBe(5);
        expect(legacy.maxNotional).toBe(1_000_000);
        expect(legacy.quantityRuleSource).toBe('LOT_SIZE+MARKET_LOT_SIZE');
        expect(legacy.notionalRuleSources).toEqual(['NOTIONAL']);
    });

    it('supports legacy MIN_NOTIONAL when it applies to market orders', () => {
        const payload = liveStyleBtc({
            filters: [
                { filterType: 'PRICE_FILTER', minPrice: '0.01', maxPrice: '1000000', tickSize: '0.01' },
                { filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '100', stepSize: '0.001' },
                { filterType: 'MIN_NOTIONAL', minNotional: '10', applyToMarket: true, avgPriceMins: 5 },
            ],
        });

        const rules = parseBinanceSpotSymbolRules(payload);
        expect(rules.marketNotional.minNotional).toBe('10');
        expect(rules.marketNotional.sourceFilters).toEqual(['MIN_NOTIONAL']);
        expect(toLegacySpotMarketTradeRules(rules).minNotional).toBe(10);
    });

    it('does not incorrectly enforce MIN_NOTIONAL on MARKET when applyToMarket=false', () => {
        const payload = liveStyleBtc({
            filters: [
                { filterType: 'PRICE_FILTER', minPrice: '0.01', maxPrice: '1000000', tickSize: '0.01' },
                { filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '100', stepSize: '0.001' },
                { filterType: 'MIN_NOTIONAL', minNotional: '100', applyToMarket: false, avgPriceMins: 5 },
            ],
        });

        expect(toLegacySpotMarketTradeRules(parseBinanceSpotSymbolRules(payload)).minNotional).toBe(0);
    });

    it('does not incorrectly enforce NOTIONAL min/max on MARKET when flags are false', () => {
        const payload = liveStyleBtc({
            filters: [
                { filterType: 'PRICE_FILTER', minPrice: '0.01', maxPrice: '1000000', tickSize: '0.01' },
                { filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '100', stepSize: '0.001' },
                {
                    filterType: 'NOTIONAL',
                    minNotional: '100',
                    maxNotional: '1000',
                    applyMinToMarket: false,
                    applyMaxToMarket: false,
                    avgPriceMins: 5,
                },
            ],
        });

        const legacy = toLegacySpotMarketTradeRules(parseBinanceSpotSymbolRules(payload));
        expect(legacy.minNotional).toBe(0);
        expect(legacy.maxNotional).toBeUndefined();
    });

    it('intersects LOT_SIZE and MARKET_LOT_SIZE rather than blindly replacing LOT_SIZE', () => {
        const payload = liveStyleBtc({
            filters: [
                { filterType: 'PRICE_FILTER', minPrice: '0.01', maxPrice: '1000000', tickSize: '0.01' },
                { filterType: 'LOT_SIZE', minQty: '0.002', maxQty: '10', stepSize: '0.002' },
                { filterType: 'MARKET_LOT_SIZE', minQty: '0.003', maxQty: '8', stepSize: '0.003' },
            ],
        });

        const effective = parseBinanceSpotSymbolRules(payload).effectiveMarketQuantity;
        expect(effective.minQty).toBe('0.003');
        expect(effective.maxQty).toBe('8');
        expect(effective.stepSize).toBe('0.006');
    });

    it('ignores zero-valued MARKET_LOT_SIZE constraints and falls back to active LOT_SIZE constraints', () => {
        const payload = liveStyleBtc({
            filters: [
                { filterType: 'PRICE_FILTER', minPrice: '0.01', maxPrice: '1000000', tickSize: '0.01' },
                { filterType: 'LOT_SIZE', minQty: '0.00001', maxQty: '9000', stepSize: '0.00001' },
                { filterType: 'MARKET_LOT_SIZE', minQty: '0', maxQty: '0', stepSize: '0' },
            ],
        });

        expect(parseBinanceSpotSymbolRules(payload).effectiveMarketQuantity).toEqual({
            minQty: '0.00001',
            maxQty: '9000',
            stepSize: '0.00001',
        });
    });

    it('floors quantities to step size without binary floating-point modulo drift', () => {
        expect(floorToStepSize(0.123456789, 0.00001)).toBeCloseTo(0.12345, 12);
        expect(floorToStepSize('0.000199999999', '0.0001')).toBeCloseTo(0.0001, 12);
        expect(floorToStepSize(1.23456789e-5, 1e-8)).toBeCloseTo(0.00001234, 12);
    });

    it('validates a legal Spot MARKET order', () => {
        const rules = parseBinanceSpotSymbolRules(liveStyleBtc());
        expect(validateSpotMarketOrder(rules, 0.001, 64_800)).toEqual([]);
    });

    it('rejects quantity below the effective market minimum', () => {
        const rules = parseBinanceSpotSymbolRules(liveStyleBtc());
        expect(validateSpotMarketOrder(rules, 0.00001, 64_800).map((issue: any) => issue.code))
            .toContain('QUANTITY_BELOW_MIN');
    });

    it('rejects quantity that is not aligned to the effective market step', () => {
        const rules = parseBinanceSpotSymbolRules(liveStyleBtc());
        expect(validateSpotMarketOrder(rules, 0.00105, 64_800).map((issue: any) => issue.code))
            .toContain('QUANTITY_STEP_MISMATCH');
    });

    it('rejects estimated market notional below modern NOTIONAL minimum', () => {
        const rules = parseBinanceSpotSymbolRules(liveStyleBtc());
        const codes = validateSpotMarketOrder(rules, 0.0001, 10_000).map((issue: any) => issue.code);
        expect(codes).toContain('NOTIONAL_BELOW_MIN');
    });

    it('rejects estimated market notional above modern NOTIONAL maximum when enabled', () => {
        const rules = parseBinanceSpotSymbolRules(liveStyleBtc());
        const codes = validateSpotMarketOrder(rules, 20, 64_800).map((issue: any) => issue.code);
        expect(codes).toContain('NOTIONAL_ABOVE_MAX');
    });

    it('fails closed when symbol status is not TRADING', () => {
        const parsed = parseBinanceSpotSymbolRules(liveStyleBtc({ status: 'HALT' }));
        expect(() => toLegacySpotMarketTradeRules(parsed)).toThrow(/not TRADING/);
    });

    it('fails closed when required PRICE_FILTER is missing', () => {
        const payload = liveStyleBtc({
            filters: [{ filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '100', stepSize: '0.001' }],
        });
        expect(() => parseBinanceSpotSymbolRules(payload)).toThrow(/PRICE_FILTER/);
    });

    it('fails closed when required LOT_SIZE is missing', () => {
        const payload = liveStyleBtc({
            filters: [{ filterType: 'PRICE_FILTER', minPrice: '0.01', maxPrice: '1000000', tickSize: '0.01' }],
        });
        expect(() => parseBinanceSpotSymbolRules(payload)).toThrow(/LOT_SIZE/);
    });
});
