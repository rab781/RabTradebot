import { SimpleComprehensiveAnalyzer } from './services/simpleComprehensiveAnalyzer';

async function testStrategy() {
  console.log('🤖 Testing Advanced Strategy Logic...');

  const analyzer = new SimpleComprehensiveAnalyzer();

  try {
    console.log('📊 Analyzing BTCUSDT...');
    // We use the 'ForBot' method as it returns the nested structure we updated
    const result = await analyzer.analyzeComprehensiveForBot('BTCUSDT');

    console.log('\n✅ Analysis Result:');
    console.log(`Symbol: ${result.symbol}`);
    console.log(`Price: $${result.currentPrice}`);
    console.log(`\n🧠 Context Awareness:`);
    console.log(`   - Market Regime: ${result.technical.regime}`);
    console.log(`   - ADX Strength: ${result.technical.adx.toFixed(2)}`);

    console.log(`\n⏰ Multi-Timeframe Alignment:`);
    Object.entries(result.timeframes).forEach(([tf, data]: [string, any]) => {
      console.log(`   - ${tf}: ${data.trend.toUpperCase()} (Signal: ${data.signal})`);
    });

    console.log(`\n🎯 Recommendation:`);
    console.log(`   - Action: ${result.recommendation.action}`);
    console.log(`   - Confidence: ${result.recommendation.confidence}%`);
    console.log(`   - Risk/Reward: ${result.recommendation.riskReward}`);
    console.log(`   - Dynamic SL: $${result.recommendation.stopLoss.toFixed(2)}`);

    console.log(`\n💡 Reasoning:`);
    result.recommendation.reasoning.forEach((r: string) => console.log(`   • ${r}`));
  } catch (error) {
    console.error('❌ Strategy Test Failed:', error);
  }
}

testStrategy();
