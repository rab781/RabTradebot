import axios from 'axios';
import {
    BinanceSpotExchangeSymbol,
    parseBinanceSpotSymbolRules,
    toLegacySpotMarketTradeRules,
} from '../src/services/exchangeRules/binanceSpotRules';

async function main(): Promise<void> {
    const arg = process.argv.find((value) => value.startsWith('--symbol='));
    const symbol = (arg?.split('=')[1] || process.env.BINANCE_DATA_SYMBOL || 'BTCUSDT').toUpperCase();
    const baseUrl = process.env.BINANCE_BASE_URL || 'https://api.binance.com';

    const response = await axios.get<{ symbols: BinanceSpotExchangeSymbol[] }>(
        `${baseUrl}/api/v3/exchangeInfo`,
        { params: { symbol }, timeout: 12_000 },
    );

    const info = response.data.symbols?.find((item) => item.symbol === symbol);
    if (!info) throw new Error(`Symbol ${symbol} not returned by exchangeInfo.`);

    const parsed = parseBinanceSpotSymbolRules(info);
    const legacy = toLegacySpotMarketTradeRules(parsed);

    console.log(`\nBinance Spot rules — ${symbol}`);
    console.log(`status: ${parsed.status}`);
    console.log(`base/quote: ${parsed.baseAsset}/${parsed.quoteAsset}`);
    console.log(`filters: ${parsed.rawFilterTypes.join(' | ')}`);
    console.log('LOT_SIZE:', parsed.lotSize);
    console.log('MARKET_LOT_SIZE:', parsed.marketLotSize ?? '(not present)');
    console.log('effective MARKET quantity:', parsed.effectiveMarketQuantity);
    console.log('market NOTIONAL:', parsed.marketNotional);
    console.log('legacy RealTradingEngine view:', legacy);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
