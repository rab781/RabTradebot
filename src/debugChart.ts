
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

async function testChart() {
    console.log('Testing QuickChart Payload (Robust Line Chart)...');

    // Robust Config: Labels array + Data array (no objects in data)
    const chartConfig = {
        type: 'line',
        data: {
            labels: [
                '2021-04-01T00:00:00Z',
                '2021-04-02T00:00:00Z',
                '2021-04-03T00:00:00Z'
            ],
            datasets: [{
                label: 'BTCUSDT Test',
                data: [50000, 51000, 50500], // Simple numbers
                borderColor: 'rgb(75, 192, 192)',
                fill: false
            }]
        },
        options: {
            scales: {
                xAxes: [{
                    type: 'time',
                    time: {
                        unit: 'day'
                    }
                }]
            }
        }
    };

    try {
        console.log('Sending config...');

        const response = await axios.post(
            'https://quickchart.io/chart',
            {
                chart: chartConfig,
                width: 500,
                height: 300,
                format: 'png',
                backgroundColor: 'white'
            },
            { responseType: 'arraybuffer' }
        );

        const outputPath = path.join(__dirname, '..', 'chart_test_robust.png');
        fs.writeFileSync(outputPath, response.data);
        console.log(`✅ Robust Line Chart generated successfully! Saved to ${outputPath}`);
        console.log('Size:', response.data.length, 'bytes');

    } catch (error: any) {
        console.error('❌ Chart generation failed!');
        if (error.response) {
            console.error('Status:', error.response.status);
            if (Buffer.isBuffer(error.response.data)) {
                console.log('Error Body: [Image Buffer - likely error message image]');
                // Save it to see the text
                fs.writeFileSync(path.join(__dirname, '..', 'chart_error_debug.png'), error.response.data);
                console.log('Saved error image to chart_error_debug.png');
            } else {
                console.log('Error Body:', error.response.data);
            }
        } else {
            console.log('Error:', error.message);
        }
    }
}

testChart();
