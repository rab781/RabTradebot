/**
 * Quick test for LSTM model building
 */

import { LSTMModelManager } from '../src/ml/lstmModel';

console.log('🧪 Testing LSTM Model Build...\n');

try {
    const model = new LSTMModelManager('Test_LSTM', '0.1.0');
    
    console.log('📊 Model Configuration:');
    const info = model.getModelInfo();
    console.log(`   Name: ${info.name}`);
    console.log(`   Version: ${info.version}`);
    console.log(`   Input Shape: ${info.config.inputShape}`);
    console.log(`   Sequence Length: ${info.config.sequenceLength}`);
    console.log(`   LSTM Units: ${info.config.lstmUnits.join(', ')}`);
    console.log(`   Dropout: ${info.config.dropout}`);
    console.log(`   Learning Rate: ${info.config.learningRate}`);

    console.log('\n🏗️  Building model...');
    model.buildModel();
    
    console.log('\n✅ Model built successfully!');
    console.log(`   Is Loaded: ${model.getModelInfo().isLoaded}`);

    // Cleanup
    model.dispose();
    console.log('\n✅ Model test completed!');

} catch (error) {
    console.error('❌ Model test failed:', error);
    process.exit(1);
}
