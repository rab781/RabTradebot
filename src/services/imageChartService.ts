import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration } from 'chart.js';

export interface ImageChartConfig {
    width?: number;
    height?: number;
    backgroundColor?: string;
}

export class ImageChartService {
    private chartJSNodeCanvas: ChartJSNodeCanvas;
    private config: ImageChartConfig;

    constructor(config: ImageChartConfig = {}) {
        this.config = {
            width: 800,
            height: 500,
            backgroundColor: 'white',
            ...config
        };

        // Initialize local chart renderer
        this.chartJSNodeCanvas = new ChartJSNodeCanvas({
            width: this.config.width!,
            height: this.config.height!,
            backgroundColour: this.config.backgroundColor // Note: specific property name for canvas
        });
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
        // Format data for Chart.js
        // We limit to last 60 candles to keep chart readable
        const limitedData = data.slice(-60);

        // Explicitly using Line Chart (Close Price) for robustness and stability
        // as confirmed by testing.
        const configuration: ChartConfiguration = {
            type: 'line',
            data: {
                labels: limitedData.map(d => new Date(d.t).toISOString().split('T')[0]), // Simple date labels
                datasets: [{
                    label: `${symbol} - ${timeframe} Close`,
                    data: limitedData.map(d => d.c),
                    borderColor: '#0ecb81',
                    backgroundColor: 'rgba(14, 203, 129, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    pointRadius: 0,
                    tension: 0.1
                }]
            },
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: `${symbol} - ${timeframe} Chart`,
                        font: {
                            size: 20
                        }
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Price (USDT)'
                        },
                        grid: {
                            color: 'rgba(0,0,0,0.05)'
                        }
                    }
                }
            }
        };

        try {
            console.log(`Generating local chart for ${symbol}...`);
            const imageBuffer = await this.chartJSNodeCanvas.renderToBuffer(configuration);
            return imageBuffer;
        } catch (error: any) {
            console.error('Error generating local chart image:', error.message);
            throw new Error('Failed to generate chart image');
        }
    }
}
