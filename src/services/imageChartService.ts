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

        // Calculate percentage change over the displayed period
        const startPrice = limitedData[0].c;
        const endPrice = limitedData[limitedData.length - 1].c;
        const changePercent = ((endPrice - startPrice) / startPrice) * 100;
        const sign = changePercent >= 0 ? '+' : '';
        const changeText = `${sign}${changePercent.toFixed(2)}%`;
        const titleColor = changePercent >= 0 ? '#0ecb81' : '#f6465d'; // Green or Red

        // Explicitly using Line Chart (Close Price) for robustness and stability
        // as confirmed by testing.
        const configuration: ChartConfiguration = {
            type: 'line',
            data: {
                labels: limitedData.map(d => new Date(d.t).toISOString().split('T')[0]), // Simple date labels
                datasets: [{
                    label: `${symbol} - ${timeframe} Close`,
                    data: limitedData.map(d => d.c),
                    borderColor: changePercent >= 0 ? '#0ecb81' : '#f6465d', // Line color matches trend
                    backgroundColor: changePercent >= 0 ? 'rgba(14, 203, 129, 0.1)' : 'rgba(246, 70, 93, 0.1)', // Fill color matches trend
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
                        text: `${symbol} - ${timeframe} Chart (${changeText})`,
                        color: titleColor,
                        font: {
                            size: 20,
                            weight: 'bold'
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
