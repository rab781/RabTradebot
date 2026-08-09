import {
    InvalidExecutionCommandError,
    UnsupportedPositionCommandError,
} from '../src/domain/execution';
import {
    mapLegacyEntrySignalToPosition,
    mapLegacyTradeSideToClosePosition,
    resolveTradeProductFromMetadata,
} from '../src/services/execution/liveExecutionSemantics';

describe('Phase B4.1 - legacy live execution semantics', () => {
    it('maps Spot BUY entry to LONG OPEN', () => {
        expect(mapLegacyEntrySignalToPosition('SPOT', 'BUY')).toEqual({
            product: 'SPOT', intent: 'LONG', effect: 'OPEN',
        });
    });

    it('rejects Spot SELL as an entry instead of silently treating SELL as SHORT', () => {
        expect(() => mapLegacyEntrySignalToPosition('SPOT', 'SELL'))
            .toThrow(UnsupportedPositionCommandError);
    });

    it('maps Futures BUY entry to LONG OPEN', () => {
        expect(mapLegacyEntrySignalToPosition('USDM_FUTURES', 'BUY')).toEqual({
            product: 'USDM_FUTURES', intent: 'LONG', effect: 'OPEN',
        });
    });

    it('maps Futures SELL entry to SHORT OPEN', () => {
        expect(mapLegacyEntrySignalToPosition('USDM_FUTURES', 'SELL')).toEqual({
            product: 'USDM_FUTURES', intent: 'SHORT', effect: 'OPEN',
        });
    });

    it.each(['SPOT', 'USDM_FUTURES'] as const)('maps HOLD on %s to no entry command', (product: 'SPOT' | 'USDM_FUTURES') => {
        expect(mapLegacyEntrySignalToPosition(product, 'HOLD')).toBeNull();
    });

    it.each(['BUY', 'LONG'] as const)('maps legacy %s trade to LONG CLOSE', (side: 'BUY' | 'LONG') => {
        expect(mapLegacyTradeSideToClosePosition('SPOT', side)).toEqual({
            product: 'SPOT', intent: 'LONG', effect: 'CLOSE',
        });
    });

    it.each(['SELL', 'SHORT'] as const)('maps Futures legacy %s trade to SHORT CLOSE', (side: 'SELL' | 'SHORT') => {
        expect(mapLegacyTradeSideToClosePosition('USDM_FUTURES', side)).toEqual({
            product: 'USDM_FUTURES', intent: 'SHORT', effect: 'CLOSE',
        });
    });

    it.each(['SELL', 'SHORT'] as const)('rejects impossible legacy Spot %s short trade', (side: 'SELL' | 'SHORT') => {
        expect(() => mapLegacyTradeSideToClosePosition('SPOT', side))
            .toThrow(UnsupportedPositionCommandError);
    });

    it('defaults old trade metadata with no product to SPOT', () => {
        expect(resolveTradeProductFromMetadata({ live: true })).toBe('SPOT');
        expect(resolveTradeProductFromMetadata(undefined)).toBe('SPOT');
    });

    it('preserves explicit Futures product metadata', () => {
        expect(resolveTradeProductFromMetadata({ product: 'USDM_FUTURES' }))
            .toBe('USDM_FUTURES');
    });

    it('fails closed when persisted product metadata is unknown', () => {
        expect(() => resolveTradeProductFromMetadata({ product: 'MARGIN' }))
            .toThrow(InvalidExecutionCommandError);
    });
});
