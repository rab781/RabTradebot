/**
 * Lightweight GRU Model (Faster than LSTM)
 * Uses GRU instead of LSTM for better performance in pure JS
 */

import * as tf from '@tensorflow/tfjs';
import { FeatureSet } from '../services/featureEngineering';

export interface SimplePrediction {
    direction: number;
    confidence: number;
    priceChange: number;
}

export class SimpleGRUModel {
    private model: tf.LayersModel | null = null;
    private sequenceLength = 20;
    private featureCount = 60;

    /**
     * Build ultra-lightweight GRU model
     */
    buildModel(): void {
        console.log('🚀 Building lightweight GRU model...');

        const input = tf.input({ shape: [this.sequenceLength, this.featureCount] });

        // Single GRU layer (much faster than LSTM)
        let x = tf.layers.gru({
            units: 16, // Small unit count
            kernelInitializer: 'glorotUniform',
            recurrentInitializer: 'glorotUniform',
            dropout: 0.2
        }).apply(input) as tf.SymbolicTensor;

        // Simple dense output
        const output = tf.layers.dense({
            units: 1,
            activation: 'tanh',
            kernelInitializer: 'glorotUniform'
        }).apply(x) as tf.SymbolicTensor;

        this.model = tf.model({ inputs: input, outputs: output });

        this.model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError',
            metrics: ['mae']
        });

        console.log('✅ GRU Model built (lightweight)');
        this.model.summary();
    }

    /**
     * Quick train with minimal epochs
     */
    async quickTrain(features: FeatureSet[], targets: number[]): Promise<void> {
        if (!this.model) this.buildModel();

        const { X, y } = this.prepareSequences(features, targets);

        console.log(`\n🏃 Quick training (5 epochs)...`);
        console.log(`   Samples: ${X.shape[0]}`);

        const startTime = Date.now();

        await this.model!.fit(X, y, {
            epochs: 5,
            batchSize: 4, // Very small
            verbose: 1,
            shuffle: true
        });

        X.dispose();
        y.dispose();

        const time = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ Training done in ${time}s`);
    }

    /**
     * Make prediction
     */
    async predict(features: FeatureSet[]): Promise<SimplePrediction> {
        if (!this.model) {
            this.buildModel();
        }

        if (features.length < this.sequenceLength) {
            throw new Error(`Need ${this.sequenceLength} features`);
        }

        const sequence = features.slice(-this.sequenceLength);
        const X = this.prepareSequence(sequence);

        const prediction = this.model!.predict(X) as tf.Tensor;
        const value = (await prediction.data())[0];

        X.dispose();
        prediction.dispose();

        return {
            direction: value,
            confidence: Math.abs(value),
            priceChange: value * 5
        };
    }

    /**
     * Prepare sequences for training
     */
    private prepareSequences(features: FeatureSet[], targets: number[]): { X: tf.Tensor3D; y: tf.Tensor2D } {
        const sequences: number[][][] = [];
        const labels: number[] = [];

        for (let i = this.sequenceLength; i < features.length; i++) {
            const sequence = features.slice(i - this.sequenceLength, i);
            const featureArray = this.featuresToArray(sequence);
            sequences.push(featureArray);
            labels.push(targets[i]);
        }

        const X = tf.tensor3d(sequences);
        const y = tf.tensor2d(labels, [labels.length, 1]);

        return { X, y };
    }

    /**
     * Prepare single sequence
     */
    private prepareSequence(sequence: FeatureSet[]): tf.Tensor3D {
        const featureArray = this.featuresToArray(sequence);
        return tf.tensor3d([featureArray]);
    }

    /**
     * Convert features to array
     */
    private featuresToArray(sequence: FeatureSet[]): number[][] {
        return sequence.map(feat => {
            const values: number[] = [];
            
            for (const [key, value] of Object.entries(feat)) {
                if (key !== 'timestamp' && key !== 'symbol') {
                    let val = value as number;
                    
                    // Handle NaN/Infinity
                    if (!isFinite(val) || isNaN(val)) {
                        val = 0;
                    }
                    
                    // Clip extreme values
                    val = Math.max(-10, Math.min(10, val));
                    
                    values.push(val);
                }
            }
            
            return values;
        });
    }
}
