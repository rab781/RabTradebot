import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { Chart, registerables, Plugin, ChartConfiguration } from 'chart.js';
import { logger } from '../utils/logger';

Chart.register(...registerables);

export interface ImageChartConfig {
  width?: number;
  height?: number;
  backgroundColor?: string;
}

export interface EquityPoint {
  timestamp: Date | number;
  balance: number;
}

interface SwingPoint {
  index: number;
  type: 'HH' | 'HL' | 'LH' | 'LL';
  price: number;
  timestamp: number;
  isHigh: boolean;
}

interface CandleData {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

interface DetectedPattern {
  name: string;
  type: 'reversal' | 'continuation';
  direction: 'bullish' | 'bearish';
  confidence: number;
  points: { index: number; price: number }[];
  target?: number;
  description: string;
}

interface SupportResistance {
  price: number;
  strength: number;
  type: 'support' | 'resistance';
}

export class ImageChartService {
  private chartJSNodeCanvas: ChartJSNodeCanvas;
  private config: ImageChartConfig;

  constructor(config: ImageChartConfig = {}) {
    this.config = {
      width: 1000,
      height: 700,
      backgroundColor: '#1a1a2e',
      ...config,
    };

    this.chartJSNodeCanvas = new ChartJSNodeCanvas({
      width: this.config.width!,
      height: this.config.height!,
      backgroundColour: this.config.backgroundColor,
    });
  }

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
        swingPoints.push({
          index: i,
          type,
          price: currentHigh,
          timestamp: data[i].t,
          isHigh: true,
        });
        lastSwingHigh = currentHigh;
      }

      if (isSwingLow) {
        let type: 'LL' | 'HL' = 'LL';
        if (lastSwingLow !== null && currentLow > lastSwingLow) {
          type = 'HL';
        }
        swingPoints.push({
          index: i,
          type,
          price: currentLow,
          timestamp: data[i].t,
          isHigh: false,
        });
        lastSwingLow = currentLow;
      }
    }

    return swingPoints;
  }

  private detectPatterns(data: CandleData[], swingPoints: SwingPoint[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const highs = swingPoints.filter((sp) => sp.isHigh);
    const lows = swingPoints.filter((sp) => !sp.isHigh);

    // Double Top Detection
    for (let i = 0; i < highs.length - 1; i++) {
      const first = highs[i];
      const second = highs[i + 1];
      const priceDiff = Math.abs(first.price - second.price) / first.price;

      if (priceDiff < 0.02) {
        // Within 2%
        const middleLow = lows.find((l) => l.index > first.index && l.index < second.index);
        if (middleLow) {
          const neckline = middleLow.price;
          const height = first.price - neckline;
          patterns.push({
            name: 'Double Top',
            type: 'reversal',
            direction: 'bearish',
            confidence: 75,
            points: [
              { index: first.index, price: first.price },
              { index: middleLow.index, price: middleLow.price },
              { index: second.index, price: second.price },
            ],
            target: neckline - height,
            description: 'Bearish reversal - Break below neckline confirms',
          });
        }
      }
    }

    // Double Bottom Detection
    for (let i = 0; i < lows.length - 1; i++) {
      const first = lows[i];
      const second = lows[i + 1];
      const priceDiff = Math.abs(first.price - second.price) / first.price;

      if (priceDiff < 0.02) {
        const middleHigh = highs.find((h) => h.index > first.index && h.index < second.index);
        if (middleHigh) {
          const neckline = middleHigh.price;
          const height = neckline - first.price;
          patterns.push({
            name: 'Double Bottom',
            type: 'reversal',
            direction: 'bullish',
            confidence: 75,
            points: [
              { index: first.index, price: first.price },
              { index: middleHigh.index, price: middleHigh.price },
              { index: second.index, price: second.price },
            ],
            target: neckline + height,
            description: 'Bullish reversal - Break above neckline confirms',
          });
        }
      }
    }

    // Head and Shoulders Detection
    for (let i = 0; i < highs.length - 2; i++) {
      const left = highs[i];
      const head = highs[i + 1];
      const right = highs[i + 2];

      if (head.price > left.price && head.price > right.price) {
        const shoulderDiff = Math.abs(left.price - right.price) / left.price;
        if (shoulderDiff < 0.03) {
          const necklineLows = lows.filter((l) => l.index > left.index && l.index < right.index);
          if (necklineLows.length >= 2) {
            const neckline =
              (necklineLows[0].price + necklineLows[necklineLows.length - 1].price) / 2;
            const height = head.price - neckline;
            patterns.push({
              name: 'Head & Shoulders',
              type: 'reversal',
              direction: 'bearish',
              confidence: 80,
              points: [
                { index: left.index, price: left.price },
                { index: necklineLows[0].index, price: necklineLows[0].price },
                { index: head.index, price: head.price },
                {
                  index: necklineLows[necklineLows.length - 1].index,
                  price: necklineLows[necklineLows.length - 1].price,
                },
                { index: right.index, price: right.price },
              ],
              target: neckline - height,
              description: 'Strong bearish reversal pattern',
            });
          }
        }
      }
    }

    // Triangle Detection (Ascending/Descending/Symmetrical)
    if (highs.length >= 3 && lows.length >= 3) {
      const recentHighs = highs.slice(-4);
      const recentLows = lows.slice(-4);

      if (recentHighs.length >= 2 && recentLows.length >= 2) {
        const highSlope =
          (recentHighs[recentHighs.length - 1].price - recentHighs[0].price) /
          (recentHighs[recentHighs.length - 1].index - recentHighs[0].index);
        const lowSlope =
          (recentLows[recentLows.length - 1].price - recentLows[0].price) /
          (recentLows[recentLows.length - 1].index - recentLows[0].index);

        let triangleType = '';
        let direction: 'bullish' | 'bearish' = 'bullish';

        if (Math.abs(highSlope) < 0.5 && lowSlope > 0.5) {
          triangleType = 'Ascending Triangle';
          direction = 'bullish';
        } else if (highSlope < -0.5 && Math.abs(lowSlope) < 0.5) {
          triangleType = 'Descending Triangle';
          direction = 'bearish';
        } else if (highSlope < -0.3 && lowSlope > 0.3) {
          triangleType = 'Symmetrical Triangle';
          direction = data[data.length - 1].c > data[0].c ? 'bullish' : 'bearish';
        }

        if (triangleType) {
          const allPoints = [...recentHighs, ...recentLows].sort((a, b) => a.index - b.index);
          patterns.push({
            name: triangleType,
            type: 'continuation',
            direction,
            confidence: 65,
            points: allPoints.map((p) => ({ index: p.index, price: p.price })),
            description: `${direction === 'bullish' ? 'Bullish' : 'Bearish'} continuation pattern`,
          });
        }
      }
    }

    return patterns;
  }

  private calculateSupportResistance(
    data: CandleData[],
    swingPoints: SwingPoint[]
  ): SupportResistance[] {
    const levels: SupportResistance[] = [];
    const currentPrice = data[data.length - 1].c;
    const priceRange = Math.max(...data.map((d) => d.h)) - Math.min(...data.map((d) => d.l));
    const tolerance = priceRange * 0.01;

    const priceZones: { price: number; count: number; isResistance: boolean }[] = [];

    swingPoints.forEach((sp) => {
      const existingZone = priceZones.find((z) => Math.abs(z.price - sp.price) < tolerance);
      if (existingZone) {
        existingZone.count++;
      } else {
        priceZones.push({
          price: sp.price,
          count: 1,
          isResistance: sp.price > currentPrice,
        });
      }
    });

    priceZones
      .filter((z) => z.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
      .forEach((zone) => {
        levels.push({
          price: zone.price,
          strength: Math.min(100, zone.count * 25),
          type: zone.isResistance ? 'resistance' : 'support',
        });
      });

    return levels;
  }

  private formatDate(timestamp: number): string {
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  async generateCandlestickChart(
    symbol: string,
    timeframe: string,
    data: CandleData[]
  ): Promise<{ buffer: Buffer; patterns: DetectedPattern[]; srLevels: SupportResistance[] }> {
    const limitedData = data.slice(-60);
    const swingPoints = this.calculateSwingPoints(limitedData);
    const patterns = this.detectPatterns(limitedData, swingPoints);
    const srLevels = this.calculateSupportResistance(limitedData, swingPoints);

    const startPrice = limitedData[0].c;
    const endPrice = limitedData[limitedData.length - 1].c;
    const changePercent = ((endPrice - startPrice) / startPrice) * 100;
    const sign = changePercent >= 0 ? '+' : '';
    const changeText = `${sign}${changePercent.toFixed(2)}%`;
    const titleColor = changePercent >= 0 ? '#0ecb81' : '#f6465d';

    const allHighs = limitedData.map((d) => d.h);
    const allLows = limitedData.map((d) => d.l);
    const minPrice = Math.min(...allLows) * 0.995;
    const maxPrice = Math.max(...allHighs) * 1.005;

    const labels = limitedData.map((d, i) => {
      if (i % 10 === 0 || i === limitedData.length - 1) {
        return this.formatDate(d.t);
      }
      return '';
    });

    // Candlestick Plugin
    const candlestickPlugin: Plugin = {
      id: 'customCandlestick',
      afterDatasetsDraw: (chart) => {
        const ctx = chart.ctx;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;

        ctx.save();
        const barWidth = Math.max(4, (chart.width / limitedData.length) * 0.6);

        limitedData.forEach((candle, i) => {
          const x = xScale.getPixelForValue(i);
          const openY = yScale.getPixelForValue(candle.o);
          const closeY = yScale.getPixelForValue(candle.c);
          const highY = yScale.getPixelForValue(candle.h);
          const lowY = yScale.getPixelForValue(candle.l);

          const isBullish = candle.c >= candle.o;
          const color = isBullish ? '#0ecb81' : '#f6465d';

          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, highY);
          ctx.lineTo(x, lowY);
          ctx.stroke();

          ctx.fillStyle = color;
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.abs(closeY - openY) || 1;
          ctx.fillRect(x - barWidth / 2, bodyTop, barWidth, bodyHeight);
        });

        ctx.restore();
      },
    };

    // S/R Zones Plugin
    const srPlugin: Plugin = {
      id: 'srZones',
      beforeDatasetsDraw: (chart) => {
        const ctx = chart.ctx;
        const yScale = chart.scales.y;
        const chartArea = chart.chartArea;

        ctx.save();

        srLevels.forEach((level) => {
          const y = yScale.getPixelForValue(level.price);
          const color =
            level.type === 'resistance' ? 'rgba(246, 70, 93, 0.15)' : 'rgba(14, 203, 129, 0.15)';
          const borderColor = level.type === 'resistance' ? '#f6465d' : '#0ecb81';

          // Draw zone band
          ctx.fillStyle = color;
          ctx.fillRect(chartArea.left, y - 8, chartArea.right - chartArea.left, 16);

          // Draw line
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 3]);
          ctx.beginPath();
          ctx.moveTo(chartArea.left, y);
          ctx.lineTo(chartArea.right, y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Label
          ctx.fillStyle = borderColor;
          ctx.font = 'bold 9px Arial';
          ctx.textAlign = 'left';
          ctx.fillText(
            `${level.type.toUpperCase()} (${level.strength}%)`,
            chartArea.left + 5,
            y - 10
          );
        });

        ctx.restore();
      },
    };

    // Pattern & Trendline Plugin
    const patternPlugin: Plugin = {
      id: 'patterns',
      afterDatasetsDraw: (chart) => {
        const ctx = chart.ctx;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;

        ctx.save();

        patterns.forEach((pattern) => {
          const color = pattern.direction === 'bullish' ? '#0ecb81' : '#f6465d';

          // Draw trendlines connecting pattern points
          if (pattern.points.length >= 2) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();

            pattern.points.forEach((pt, i) => {
              const x = xScale.getPixelForValue(pt.index);
              const y = yScale.getPixelForValue(pt.price);
              if (i === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
            });
            ctx.stroke();

            // Draw circles at pattern points
            pattern.points.forEach((pt) => {
              const x = xScale.getPixelForValue(pt.index);
              const y = yScale.getPixelForValue(pt.price);
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(x, y, 4, 0, Math.PI * 2);
              ctx.fill();
            });
          }

          // Draw target line
          if (pattern.target) {
            const targetY = yScale.getPixelForValue(pattern.target);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.setLineDash([8, 4]);
            ctx.beginPath();
            ctx.moveTo(chart.chartArea.left, targetY);
            ctx.lineTo(chart.chartArea.right, targetY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Target label
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(chart.chartArea.right - 80, targetY - 10, 75, 16);
            ctx.fillStyle = color;
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(`TARGET`, chart.chartArea.right - 10, targetY + 3);
          }

          // Pattern label
          if (pattern.points.length > 0) {
            const labelPt = pattern.points[Math.floor(pattern.points.length / 2)];
            const labelX = xScale.getPixelForValue(labelPt.index);
            const labelY = yScale.getPixelForValue(labelPt.price) - 25;

            const text = `${pattern.name} (${pattern.confidence}%)`;
            const textWidth = ctx.measureText(text).width + 10;

            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(labelX - textWidth / 2, labelY - 12, textWidth, 18);

            ctx.fillStyle = color;
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(text, labelX, labelY);
          }
        });

        ctx.restore();
      },
    };

    // Swing Label Plugin
    const swingLabelPlugin: Plugin = {
      id: 'swingLabels',
      afterDatasetsDraw: (chart) => {
        const ctx = chart.ctx;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;

        ctx.save();
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';

        swingPoints.forEach((sp) => {
          const x = xScale.getPixelForValue(sp.index);
          const y = yScale.getPixelForValue(sp.price);
          const yOffset = sp.isHigh ? -10 : 14;
          const textColor = sp.type === 'HH' || sp.type === 'HL' ? '#0ecb81' : '#f6465d';

          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          const textWidth = ctx.measureText(sp.type).width + 4;
          ctx.fillRect(x - textWidth / 2, y + yOffset - 8, textWidth, 12);

          ctx.fillStyle = textColor;
          ctx.fillText(sp.type, x, y + yOffset);
        });

        ctx.restore();
      },
    };

    const configuration: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Price',
            data: limitedData.map(() => 0),
            backgroundColor: 'transparent',
            borderColor: 'transparent',
          },
        ],
      },
      options: {
        responsive: false,
        animation: false,
        plugins: {
          title: {
            display: true,
            text: `${symbol} - ${timeframe} (${changeText}) | Patterns: ${patterns.length}`,
            color: titleColor,
            font: { size: 16, weight: 'bold' },
          },
          legend: { display: false },
        },
        scales: {
          x: {
            display: true,
            ticks: { color: '#888', maxRotation: 45, autoSkip: false },
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
          },
          y: {
            position: 'right',
            min: minPrice,
            max: maxPrice,
            title: { display: true, text: 'Price (USDT)', color: '#888' },
            ticks: { color: '#888' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
          },
        },
      },
      plugins: [srPlugin, candlestickPlugin, patternPlugin, swingLabelPlugin],
    };

    try {
      logger.info(
        `Generating chart for ${symbol} - ${timeframe} | Patterns: ${patterns.length}, S/R: ${srLevels.length}`
      );
      const imageBuffer = await this.chartJSNodeCanvas.renderToBuffer(configuration);
      return { buffer: imageBuffer, patterns, srLevels };
    } catch (error: any) {
      logger.error({ err: error.message }, 'Error generating chart:');
      throw new Error('Failed to generate chart image');
    }
  }

  async generateEquityCurveChart(
    title: string,
    data: EquityPoint[]
  ): Promise<{ buffer: Buffer; minBalance: number; maxBalance: number; changePct: number }> {
    if (data.length === 0) {
      throw new Error('No equity data available');
    }

    const normalized = data.map((point) => ({
      timestamp: point.timestamp instanceof Date ? point.timestamp : new Date(point.timestamp),
      balance: point.balance,
    }));

    const limited = normalized.slice(-200);
    const startBalance = limited[0].balance;
    const endBalance = limited[limited.length - 1].balance;
    const minBalance = Math.min(...limited.map((p) => p.balance));
    const maxBalance = Math.max(...limited.map((p) => p.balance));
    const changePct = startBalance !== 0 ? ((endBalance - startBalance) / startBalance) * 100 : 0;
    const lineColor = changePct >= 0 ? '#0ecb81' : '#f6465d';
    const fillColor = changePct >= 0 ? 'rgba(14, 203, 129, 0.15)' : 'rgba(246, 70, 93, 0.15)';
    const sign = changePct >= 0 ? '+' : '';

    const labels = limited.map((point, i) => {
      if (i % 20 === 0 || i === limited.length - 1) {
        return this.formatDate(point.timestamp.getTime());
      }
      return '';
    });

    const padding = Math.max((maxBalance - minBalance) * 0.1, maxBalance * 0.002);
    const chartMin = Math.max(0, minBalance - padding);
    const chartMax = maxBalance + padding;

    const configuration: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Equity Curve',
            data: limited.map((p) => p.balance),
            borderColor: lineColor,
            backgroundColor: fillColor,
            borderWidth: 2,
            fill: true,
            pointRadius: 0,
            tension: 0.2,
          },
        ],
      },
      options: {
        responsive: false,
        animation: false,
        plugins: {
          title: {
            display: true,
            text: `${title} | Equity Curve (${sign}${changePct.toFixed(2)}%)`,
            color: lineColor,
            font: { size: 16, weight: 'bold' },
          },
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: '#888', maxRotation: 45, autoSkip: false },
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
          },
          y: {
            min: chartMin,
            max: chartMax,
            ticks: {
              color: '#888',
              callback: (value) => `$${Number(value).toFixed(2)}`,
            },
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
          },
        },
      },
    };

    try {
      const imageBuffer = await this.chartJSNodeCanvas.renderToBuffer(configuration);
      return { buffer: imageBuffer, minBalance, maxBalance, changePct };
    } catch (error: any) {
      logger.error({ err: error.message }, 'Error generating equity curve chart:');
      throw new Error('Failed to generate equity curve chart');
    }
  }
}
