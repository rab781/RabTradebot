import {
    InvalidExecutionCommandError,
    PositionCommand,
    TradingProduct,
    UnsupportedPositionCommandError,
} from '../../domain/execution';

/** Compatibility surface for the current SignalResult contract. */
export type LegacySignalAction = 'BUY' | 'SELL' | 'HOLD';
export type LegacyTradeSide = 'BUY' | 'SELL' | 'LONG' | 'SHORT';

/**
 * Translate the current BUY/SELL/HOLD signal contract into explicit position
 * semantics without pretending that SELL always means SHORT.
 *
 * This is a migration adapter only. Phase C should replace it with a unified
 * SignalDecision / target-position contract.
 */
export function mapLegacyEntrySignalToPosition(
    product: TradingProduct,
    action: LegacySignalAction,
): PositionCommand | null {
    if (action === 'HOLD') return null;

    if (product === 'SPOT') {
        if (action === 'SELL') {
            throw new UnsupportedPositionCommandError(
                'A legacy SELL signal cannot OPEN a Spot SHORT. On Spot it must either close an existing LONG or result in WAIT.',
            );
        }

        return { product: 'SPOT', intent: 'LONG', effect: 'OPEN' };
    }

    if (product === 'USDM_FUTURES') {
        return {
            product: 'USDM_FUTURES',
            intent: action === 'BUY' ? 'LONG' : 'SHORT',
            effect: 'OPEN',
        };
    }

    throw new InvalidExecutionCommandError(`Unsupported trading product: ${String(product)}.`);
}

/**
 * Translate persisted legacy trade side into an explicit CLOSE command.
 * Legacy Spot trades must only represent LONG inventory. A persisted Spot
 * SELL/SHORT trade is rejected instead of being silently reinterpreted.
 */
export function mapLegacyTradeSideToClosePosition(
    product: TradingProduct,
    side: LegacyTradeSide,
): PositionCommand {
    const intent = side === 'BUY' || side === 'LONG' ? 'LONG' : 'SHORT';

    if (product === 'SPOT' && intent === 'SHORT') {
        throw new UnsupportedPositionCommandError(
            `Legacy Spot trade side ${side} implies SHORT exposure, which cannot be safely closed through native Spot execution.`,
        );
    }

    return { product, intent, effect: 'CLOSE' };
}

/**
 * Backward-compatible product resolution for existing LIVE_OPEN trades.
 * Old trades predate the product field and are therefore treated as SPOT.
 * If a product field is present but invalid, fail closed rather than guessing.
 */
export function resolveTradeProductFromMetadata(metadata: unknown): TradingProduct {
    if (metadata === null || metadata === undefined || typeof metadata !== 'object') {
        return 'SPOT';
    }

    const value = (metadata as { product?: unknown }).product;
    if (value === undefined || value === null || value === '') {
        return 'SPOT';
    }
    if (value === 'SPOT' || value === 'USDM_FUTURES') {
        return value;
    }

    throw new InvalidExecutionCommandError(
        `Persisted trade contains unsupported product metadata: ${String(value)}.`,
    );
}
