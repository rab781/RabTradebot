import { UnsupportedPositionCommandError } from '../src/domain/execution';
import { mapPositionCommandToOrder } from '../src/services/execution/orderIntentMapper';

describe('Phase B1 - product/position/order semantics', () => {
    it('maps SPOT LONG OPEN to BUY', () => {
        expect(mapPositionCommandToOrder({ product: 'SPOT', intent: 'LONG', effect: 'OPEN' }))
            .toEqual({ product: 'SPOT', side: 'BUY', reduceOnly: false });
    });

    it('maps SPOT LONG CLOSE to SELL without pretending SELL means SHORT', () => {
        expect(mapPositionCommandToOrder({ product: 'SPOT', intent: 'LONG', effect: 'CLOSE' }))
            .toEqual({ product: 'SPOT', side: 'SELL', reduceOnly: true });
    });

    it('rejects SPOT SHORT OPEN', () => {
        expect(() => mapPositionCommandToOrder({ product: 'SPOT', intent: 'SHORT', effect: 'OPEN' }))
            .toThrow(UnsupportedPositionCommandError);
    });

    it('rejects SPOT SHORT CLOSE because no native short position exists in this product model', () => {
        expect(() => mapPositionCommandToOrder({ product: 'SPOT', intent: 'SHORT', effect: 'CLOSE' }))
            .toThrow(UnsupportedPositionCommandError);
    });

    it('maps FUTURES LONG OPEN to BUY and non-reducing', () => {
        expect(mapPositionCommandToOrder({ product: 'USDM_FUTURES', intent: 'LONG', effect: 'OPEN' }))
            .toEqual({
                product: 'USDM_FUTURES',
                side: 'BUY',
                reduceOnly: false,
                positionSide: 'LONG',
            });
    });

    it('maps FUTURES LONG CLOSE to SELL reduce-only', () => {
        expect(mapPositionCommandToOrder({ product: 'USDM_FUTURES', intent: 'LONG', effect: 'CLOSE' }))
            .toEqual({
                product: 'USDM_FUTURES',
                side: 'SELL',
                reduceOnly: true,
                positionSide: 'LONG',
            });
    });

    it('maps FUTURES SHORT OPEN to SELL and non-reducing', () => {
        expect(mapPositionCommandToOrder({ product: 'USDM_FUTURES', intent: 'SHORT', effect: 'OPEN' }))
            .toEqual({
                product: 'USDM_FUTURES',
                side: 'SELL',
                reduceOnly: false,
                positionSide: 'SHORT',
            });
    });

    it('maps FUTURES SHORT CLOSE to BUY reduce-only', () => {
        expect(mapPositionCommandToOrder({ product: 'USDM_FUTURES', intent: 'SHORT', effect: 'CLOSE' }))
            .toEqual({
                product: 'USDM_FUTURES',
                side: 'BUY',
                reduceOnly: true,
                positionSide: 'SHORT',
            });
    });

    it('makes SHORT and SELL observably different concepts', () => {
        const openShort = mapPositionCommandToOrder({
            product: 'USDM_FUTURES',
            intent: 'SHORT',
            effect: 'OPEN',
        });
        const closeLong = mapPositionCommandToOrder({
            product: 'USDM_FUTURES',
            intent: 'LONG',
            effect: 'CLOSE',
        });

        expect(openShort.side).toBe('SELL');
        expect(closeLong.side).toBe('SELL');
        expect(openShort.reduceOnly).toBe(false);
        expect(closeLong.reduceOnly).toBe(true);
        expect(openShort.positionSide).toBe('SHORT');
        expect(closeLong.positionSide).toBe('LONG');
    });
});
