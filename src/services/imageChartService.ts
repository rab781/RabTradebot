import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { Chart, registerables, Plugin, ChartConfiguration } from 'chart.js';

// Register base Chart.js components only
Chart.register(...registerables);

export interface ImageChartConfig {
    width?: number;
    height?: number;
    backgroundColor?: string;
}

interface SwingPoint {
    index: number;
    type: 'HH' | 'HL' | 'LH' | 'LL';
    price: number;
    timestamp: number;
}

interface CandleData {
    t: number;
    o: number;
    h: number;
    l: number;
    c: number;
    v?: number;
}

export class ImageChartService {
    private chartJSNodeCanvas: ChartJSNodeCanvas;
    private config: ImageChartConfig;

    constructor(config: ImageChartConfig = {}) {
        this.config = {
            width: 900,
            height: 600,
            backgroundColor: '#1a1a2e',
            ...config
        };

        this.chartJSNodeCanvas = new ChartJSNodeCanvas({
            width: this.config.width!,
            height: this.config.height!,
            backgroundColour: this.config.backgroundColor
        });
    }

    /**
     * Detects swing points (pivots) in the price data
     */
    private calculateSwingPoints(data: CandleData[]): SwingPoint[] {
        const swingPoints: SwingPoint[] = [];
        const lookback = 3;

        if (data.length < lookback * 2 + 1) return swingPoints;

        let lastSwingHigh: number | null = null;
        let lastSwingLow: number | null = null;

        for (let i = lookback; i < data.length - lookback; i++) {
            const currentHigh = data[i].h;
            const currentLow = data[i].l;

            let isSwingHigh = true;
            for (let j = 1; j <= lookback; j++) {
                if (data[i - j].h >= currentHigh || data[i + j].h >= currentHigh) {
                    isSwingHigh = false;
                    break;
                }
            }

            let isSwingLow = true;
            for (let j = 1; j <= lookback; j++) {
                if (data[i - j].l <= currentLow || data[i + j].l <= currentLow) {
                    isSwingLow = false;
                    break;
                }
            }

            if (isSwingHigh) {
                let type: 'HH' | 'LH' = 'HH';
                if (lastSwingHigh !== null && currentHigh < lastSwingHigh) {
                    type = 'LH';
                }
                swingPoints.push({ index: i, type, price: currentHigh, timestamp: data[i].t });
                lastSwingHigh = currentHigh;
            }

            if (isSwingLow) {
                let type: 'LL' | 'HL' = 'LL';
                if (lastSwingLow !== null && currentLow > lastSwingLow) {
                    type = 'HL';
                }
                swingPoints.push({ index: i, type, price: currentLow, timestamp: data[i].t });
                lastSwingLow = currentLow;
            }
        }

        return swingPoints;
    }

    /**
     * Format timestamp to short date string
     */
    private formatDate(timestamp: number): string {
        const d = new Date(timestamp);
        return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
    }

    async generateCandlestickChart(
        symbol: string,
        timeframe: string,
        data: CandleData[]
    ): Promise<Buffer> {
        const limitedData = data.slice(-60);
        const swingPoints = this.calculateSwingPoints(limitedData);

        const startPrice = limitedData[0].c;
        const endPrice = limitedData[limitedData.length - 1].c;
        const changePercent = ((endPrice - startPrice) / startPrice) * 100;
        const sign = changePercent >= 0 ? '+' : '';
        const changeText = `${sign}${changePercent.toFixed(2)}%`;
        const titleColor = changePercent >= 0 ? '#0ecb81' : '#f6465d';

        // Calculate price range for Y-axis
        const allHighs = limitedData.map(d => d.h);
        const allLows = limitedData.map(d => d.l);
        const minPrice = Math.min(...allLows) * 0.998;
        const maxPrice = Math.max(...allHighs) * 1.002;

        // Simple string labels for X-axis (categorical, not time-based)
        const labels = limitedData.map((d, i) => {
            // Only show label every 10 candles to reduce clutter
            if (i % 10 === 0 || i === limitedData.length - 1) {
                return this.formatDate(d.t);
            }
            return '';
        });

        // Custom Candlestick Plugin
        const candlestickPlugin: Plugin = {
            id: 'customCandlestick',
            afterDatasetsDraw: (chart) => {
                const ctx = chart.ctx;
                const xScale = chart.scales.x;
                const yScale = chart.scales.y;

                ctx.save();

                const barWidth = Math.max(4, (chart.width / limitedData.length) * 0.6);
                const wickWidth = 1;

                limitedData.forEach((candle, i) => {
                    const x = xScale.getPixelForValue(i);
                    const openY = yScale.getPixelForValue(candle.o);
                    const closeY = yScale.getPixelForValue(candle.c);
                    const highY = yScale.getPixelForValue(candle.h);
                    const lowY = yScale.getPixelForValue(candle.l);

                    const isBullish = candle.c >= candle.o;
                    const color = isBullish ? '#0ecb81' : '#f6465d';

                    // Draw wick
                    ctx.strokeStyle = color;
                    ctx.lineWidth = wickWidth;
                    ctx.beginPath();
                    ctx.moveTo(x, highY);
                    ctx.lineTo(x, lowY);
                    ctx.stroke();

                    // Draw body
                    ctx.fillStyle = color;
                    const bodyTop = Math.min(openY, closeY);
                    const bodyHeight = Math.abs(closeY - openY) || 1;
                    ctx.fillRect(x - barWidth / 2, bodyTop, barWidth, bodyHeight);
                });

                ctx.restore();
            }
        };

        // Swing Label Plugin
        const swingLabelPlugin: Plugin = {
            id: 'swingLabels',
            afterDatasetsDraw: (chart) => {
                const ctx = chart.ctx;
                const xScale = chart.scales.x;
                const yScale = chart.scales.y;

                ctx.save();
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';

                swingPoints.forEach(sp => {
                    const x = xScale.getPixelForValue(sp.index);
                    let y: number;
                    let textColor: string;
                    let yOffset: number;

                    if (sp.type === 'HH' || sp.type === 'LH') {
                        y = yScale.getPixelForValue(sp.price);
                        yOffset = -12;
                        textColor = sp.type === 'HH' ? '#0ecb81' : '#f6465d';
                    } else {
                        y = yScale.getPixelForValue(sp.price);
                        yOffset = 16;
                        textColor = sp.type === 'HL' ? '#0ecb81' : '#f6465d';
                    }

                    // Background
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    const textWidth = ctx.measureText(sp.type).width + 6;
                    ctx.fillRect(x - textWidth / 2, y + yOffset - 10, textWidth, 14);

                    // Text
                    ctx.fillStyle = textColor;
                    ctx.fillText(sp.type, x, y + yOffset);
                });

                ctx.restore();
            }
        };

        const configuration: ChartConfiguration = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Price',
                    data: limitedData.map(() => 0),
                    backgroundColor: 'transparent',
                    borderColor: 'transparent'
                }]
            },
            options: {
                responsive: false,
                animation: false,
                plugins: {
                    title: {
                        display: true,
                        text: `${symbol} - ${timeframe} Candlestick (${changeText})`,
                        color: titleColor,
                        font: {
                            size: 18,
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
                        ticks: {
                            color: '#888',
                            maxRotation: 45,
                            autoSkip: false
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        }
                    },
                    y: {
                        position: 'right',
                        min: minPrice,
                        max: maxPrice,
                        title: {
                            display: true,
                            text: 'Price (USDT)',
                            color: '#888'
                        },
                        ticks: {
                            color: '#888'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        }
                    }
                }
            },
            plugins: [candlestickPlugin, swingLabelPlugin]
        };

        try {
            console.log(`Generating candlestick chart for ${symbol} with ${swingPoints.length} swing points...`);
            const imageBuffer = await this.chartJSNodeCanvas.renderToBuffer(configuration);
            return imageBuffer;
        } catch (error: any) {
            console.error('Error generating candlestick chart:', error.message);
            throw new Error('Failed to generate chart image');
        }
    }
}
