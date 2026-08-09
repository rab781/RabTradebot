import {
    ExchangeOrderIntent,
    PositionCommand,
    UnsupportedPositionCommandError,
} from '../../domain/execution';

/**
 * Converts portfolio/position semantics into exchange order semantics.
 *
 * Critical invariant:
 *   SHORT is a position intent. SELL is an order side.
 * They must never be treated as synonyms.
 */
export function mapPositionCommandToOrder(command: PositionCommand): ExchangeOrderIntent {
    if (command.product === 'SPOT') {
        if (command.intent === 'SHORT') {
            throw new UnsupportedPositionCommandError(
                'SPOT does not support opening or closing a native SHORT position. Use USDM_FUTURES (or an explicit margin product) for short exposure.',
            );
        }

        return {
            product: 'SPOT',
            side: command.effect === 'OPEN' ? 'BUY' : 'SELL',
            reduceOnly: command.effect === 'CLOSE',
        };
    }

    if (command.intent === 'LONG') {
        return {
            product: 'USDM_FUTURES',
            side: command.effect === 'OPEN' ? 'BUY' : 'SELL',
            reduceOnly: command.effect === 'CLOSE',
            positionSide: 'LONG',
        };
    }

    return {
        product: 'USDM_FUTURES',
        side: command.effect === 'OPEN' ? 'SELL' : 'BUY',
        reduceOnly: command.effect === 'CLOSE',
        positionSide: 'SHORT',
    };
}
