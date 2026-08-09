import 'dotenv/config';
import {
    BinanceDataHealthChecker,
    HealthCheckResult,
} from '../src/services/marketData/binanceDataHealth';

const includePrivate = process.argv.includes('--private');
const symbolArg = process.argv.find((arg) => arg.startsWith('--symbol='));
const symbol = symbolArg?.split('=')[1] || process.env.BINANCE_DATA_SYMBOL || 'BTCUSDT';

function icon(status: HealthCheckResult['status']): string {
    if (status === 'PASS') return '✅';
    if (status === 'WARN') return '⚠️';
    if (status === 'SKIP') return '⏭️';
    return '❌';
}

async function main(): Promise<void> {
    console.log(`\nBinance Data Health Check — ${symbol.toUpperCase()}`);
    console.log(`Mode: public market data${includePrivate ? ' + authenticated READ-ONLY checks' : ''}`);
    console.log('No order-placement endpoint is called by this diagnostic.\n');

    const checker = new BinanceDataHealthChecker({ symbol, includePrivate });
    const results = await checker.run();

    for (const result of results) {
        const latency = result.latencyMs !== undefined ? ` (${result.latencyMs}ms)` : '';
        console.log(`${icon(result.status)} [${result.scope}] ${result.check}${latency}`);
        console.log(`   ${result.detail}`);
    }

    const fail = results.filter((item) => item.status === 'FAIL').length;
    const warn = results.filter((item) => item.status === 'WARN').length;
    const pass = results.filter((item) => item.status === 'PASS').length;
    const skip = results.filter((item) => item.status === 'SKIP').length;

    console.log(`\nSummary: PASS=${pass} WARN=${warn} FAIL=${fail} SKIP=${skip}`);
    if (fail > 0) {
        console.log('Result: NOT READY — fix FAIL items before using Binance as canonical trading data source.');
        process.exitCode = 1;
    } else if (warn > 0) {
        console.log('Result: USABLE WITH WARNINGS — review WARN items before production live trading.');
    } else {
        console.log('Result: HEALTHY — connectivity/data contracts passed this diagnostic run.');
    }
}

main().catch((error) => {
    console.error('Fatal health-check error:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
