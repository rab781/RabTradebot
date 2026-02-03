/**
 * Test Feature Engineering Service
 */

import { FeatureEngineeringService } from '../src/services/featureEngineering';
import { DataManager } from '../src/services/dataManager';

async function testFeatureEngineering() {
    console.log('🧪 Testing Feature Engineering Service...\n');

    try {
        // Initialize services
        const dataManager = new DataManager();
        const featureService = new FeatureEngineeringService(false); // Disable database for test
        
        console.log('📥 Downloading BTCUSDT data (30 days)...');
        const data = await dataManager.getRecentData('BTCUSDT', '1h', 720); // 30 days of hourly data
        console.log(`✅ Downloaded ${data.length} candles`);

        console.log('\n🔧 Extracting features...');
        const startTime = Date.now();
        const features = featureService.extractFeatures(data, 'BTCUSDT');
        const endTime = Date.now();

        console.log(`✅ Extracted ${features.length} feature sets in ${endTime - startTime}ms`);
        console.log(`⚡ Performance: ${((endTime - startTime) / features.length).toFixed(2)}ms per candle`);

        // Display first feature set
        if (features.length > 0) {
            const firstFeature = features[0];
            console.log('\n📊 Sample Feature Set (first candle):');
            console.log('   Price Features:');
            console.log(`     - Returns: ${firstFeature.returns.toFixed(6)}`);
            console.log(`     - Price Change %: ${firstFeature.priceChangePercent.toFixed(2)}%`);
            console.log(`     - High-Low Range: ${firstFeature.highLowRange.toFixed(2)}`);
            
            console.log('\n   Momentum Indicators:');
            console.log(`     - RSI (14): ${firstFeature.rsi_14.toFixed(2)}`);
            console.log(`     - MACD: ${firstFeature.macd.toFixed(6)}`);
            console.log(`     - Stochastic K: ${firstFeature.stoch_k.toFixed(2)}`);
            
            console.log('\n   Trend Indicators:');
            console.log(`     - EMA (9): ${firstFeature.ema_9.toFixed(2)}`);
            console.log(`     - ADX: ${firstFeature.adx.toFixed(2)}`);
            console.log(`     - Price vs EMA9: ${firstFeature.priceVsEMA9.toFixed(2)}%`);
            
            console.log('\n   Volatility:');
            console.log(`     - ATR: ${firstFeature.atr_14.toFixed(2)}`);
            console.log(`     - BB Width: ${firstFeature.bb_width.toFixed(2)}%`);
            console.log(`     - BB %B: ${firstFeature.bb_percentB.toFixed(2)}`);
            
            console.log('\n   Volume Features:');
            console.log(`     - Volume Ratio: ${firstFeature.volumeRatio.toFixed(2)}`);
            console.log(`     - OBV Slope: ${firstFeature.obvSlope.toFixed(0)}`);
            console.log(`     - Vol-Price Correlation: ${firstFeature.volumePriceCorrelation.toFixed(3)}`);
            
            console.log('\n   Statistical:');
            console.log(`     - Volatility (20): ${(firstFeature.volatility_20 * 100).toFixed(3)}%`);
            console.log(`     - Skewness: ${firstFeature.skewness_20.toFixed(3)}`);
            console.log(`     - Kurtosis: ${firstFeature.kurtosis_20.toFixed(3)}`);
            
            console.log('\n   Market Microstructure:');
            console.log(`     - Spread Approx: ${firstFeature.spreadApprox.toFixed(3)}%`);
            console.log(`     - Liquidity Score: ${firstFeature.liquidityScore.toFixed(6)}`);
            console.log(`     - Price Efficiency: ${firstFeature.priceEfficiency.toFixed(3)}`);
        }

        // Verify all features are present
        const totalFeatures = Object.keys(features[0]).length - 2; // Exclude timestamp and symbol
        console.log(`\n✅ Total features extracted: ${totalFeatures} (target: 60+)`);

        // Check for NaN or Infinity
        let invalidCount = 0;
        for (const feature of features.slice(0, 10)) { // Check first 10
            for (const [key, value] of Object.entries(feature)) {
                if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
                    invalidCount++;
                    console.warn(`⚠️  Invalid value for ${key}: ${value}`);
                }
            }
        }

        if (invalidCount === 0) {
            console.log('✅ No invalid values detected in feature sets');
        } else {
            console.log(`⚠️  Found ${invalidCount} invalid values`);
        }

        console.log('\n✅ Feature Engineering test completed successfully!');

    } catch (error) {
        console.error('❌ Feature Engineering test failed:', error);
        process.exit(1);
    }
}

testFeatureEngineering();
