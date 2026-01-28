import axios from 'axios';

export interface ImageChartConfig {
    width?: number;
    height?: number;
    backgroundColor?: string;
}

export class ImageChartService {
    private baseUrl = 'https://quickchart.io/chart';
    private config: ImageChartConfig;

    constructor(config: ImageChartConfig = {}) {
        this.config = {
            width: 800,
            height: 500,
            backgroundColor: 'white',
            ...config
        };
    }

    async generateCandlestickChart(
        symbol: string,
        timeframe: string,
        data: Array<{
            t: number; // timestamp
            o: number; // open
            h: number; // high
            l: number; // low
            c: number; // close
            v?: number; // volume
        }>
    ): Promise<Buffer> {
        // Format data for QuickChart/Chart.js
        // We limit to last 60 candles to keep chart readable
        const limitedData = data.slice(-60);

        // Proven robust config: Labels (ISO Strings) + Data (Numbers)
        // This avoids object-parsing issues in QuickChart's Chart.js v2 env

        const chartConfig = {
            type: 'line',
            data: {
                labels: limitedData.map(d => new Date(d.t).toISOString()),
                datasets: [{
                    label: `${symbol} ${timeframe} Close`,
                    data: limitedData.map(d => d.c), // Direct numbers
                    borderColor: '#0ecb81',
                    backgroundColor: 'rgba(14, 203, 129, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    pointRadius: 0
                }]
            },
            options: {
                title: {
                    display: true,
                    text: `${symbol} - ${timeframe} Chart`
                },
                legend: {
                    display: false
                },
                scales: {
                    xAxes: [{
                        type: 'time',
                        time: {
                            unit: 'auto'
                        },
                        gridLines: {
                            display: false
                        }
                    }],
                    yAxes: [{
                        scaleLabel: {
                            display: true,
                            labelString: 'Price (USDT)'
                        },
                        gridLines: {
                            color: 'rgba(0,0,0,0.05)'
                        }
                    }]
                }
            }
        };

        try {
            // DEBUG: Log the chart config payload
            console.log('Sending Chart Config:', JSON.stringify(chartConfig).substring(0, 500) + '...');

            const response = await axios.post(
                this.baseUrl,
                {
                    chart: chartConfig,
                    width: this.config.width,
                    height: this.config.height,
                    backgroundColor: this.config.backgroundColor,
                    format: 'png'
                },
                {
                    responseType: 'arraybuffer'
                }
            );

            return Buffer.from(response.data, 'binary');
        } catch (error: any) {
            if (error.response) {
                console.error('QuickChart Error Data:', JSON.stringify(error.response.data));
            }
            console.error('Error generating chart image:', error.message);
            throw new Error('Failed to generate chart image');
        }
    }
}
