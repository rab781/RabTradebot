import {
    ExecutionFill,
    MarketExecutionCommand,
    UnsupportedPositionCommandError,
} from '../../domain/execution';
import { binanceOrderService } from '../binanceOrderService';
import { ExecutionRouter, MarketExecutionBroker } from './executionRouter';
import { SpotExecutionBroker } from './spotExecutionBroker';

/**
 * Production router for RabTradebot.
 *
 * The repository still contains USD-M Futures research/execution code, but
 * production is intentionally Binance Spot-only. The Futures slot therefore
 * fails closed without constructing a Futures API client.
 */
const parkedFuturesBroker: MarketExecutionBroker<'USDM_FUTURES'> = {
    product: 'USDM_FUTURES',
    async executeMarket(_command: MarketExecutionCommand): Promise<ExecutionFill> {
        throw new UnsupportedPositionCommandError(
            'USD-M Futures execution is parked and disabled in production. RabTradebot live execution is Binance Spot-only.',
        );
    },
};

export const spotExecutionBroker = new SpotExecutionBroker(binanceOrderService);

export const spotOnlyExecutionRouter = new ExecutionRouter(
    spotExecutionBroker,
    parkedFuturesBroker,
);
