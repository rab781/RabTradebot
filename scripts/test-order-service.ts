import { config } from 'dotenv';
import { BinanceOrderService } from '../src/services/binanceOrderService';

config();

async function main(): Promise<void> {
    const service = new BinanceOrderService();

    console.log('=== BinanceOrderService Test Script ===');
    console.log(`Base URL: ${service.getBaseUrl()}`);
    console.log(`Configured: ${service.isConfigured()}`);

    if (!service.isConfigured()) {
        throw new Error('BINANCE_API_KEY/BINANCE_API_SECRET are required to run this script.');
    }

    const symbol = (process.env.TEST_SYMBOL || 'BTCUSDT').toUpperCase();

    const [price, balances, rules, openOrders] = await Promise.all([
        service.getCurrentPrice(symbol),
        service.getAccountBalance(),
        service.getSymbolInfo(symbol),
        service.getOpenOrders(symbol),
    ]);

    console.log(`\nSymbol: ${symbol}`);
    console.log(`Current Price: ${price}`);
    console.log('Trade Rules:', rules);
    console.log(`Open Orders (${openOrders.length}):`, openOrders.map((o) => o.orderId));
    console.log(`Non-zero Balances (${balances.length}):`, balances.map((b) => `${b.asset}:${b.free}`));

    const canPlaceWriteOrders = /^(1|true|yes)$/i.test(process.env.TEST_PLACE_ORDER || '');
    if (!canPlaceWriteOrders) {
        console.log('\nWrite-order test is skipped. Set TEST_PLACE_ORDER=true to enable place/cancel test on Testnet.');
        return;
    }

    const qty = parseFloat(process.env.TEST_ORDER_QTY || '0.001');
    const roundedQty = service.roundToStepSize(qty, rules.stepSize);

    console.log(`\nPlacing MARKET BUY ${symbol} qty=${roundedQty}...`);
    const order = await service.placeMarketOrder(symbol, 'BUY', roundedQty);
    console.log('Order response:', {
        orderId: order.orderId,
        status: order.status,
        executedQty: order.executedQty,
        cummulativeQuoteQty: order.cummulativeQuoteQty,
    });

    const orderStatus = await service.getOrderStatus(symbol, order.orderId);
    console.log('Fetched order status:', { orderId: orderStatus.orderId, status: orderStatus.status });
}

main().catch((error) => {
    console.error('test-order-service failed:', (error as Error).message);
    process.exit(1);
});
