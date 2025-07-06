import * as fs from 'fs';
import * as path from 'path';

interface ChartData {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export class ChartGenerator {
    private chartDir: string;

    constructor() {
        this.chartDir = path.join(process.cwd(), 'charts');
        if (!fs.existsSync(this.chartDir)) {
            fs.mkdirSync(this.chartDir);
        }
    }

    async generateChart(symbol: string, data: ChartData[]): Promise<string> {
        const htmlContent = this.generateHtmlContent(symbol, data);
        const fileName = `${symbol.toLowerCase()}_${Date.now()}.html`;
        const filePath = path.join(this.chartDir, fileName);
        
        fs.writeFileSync(filePath, htmlContent);
        return filePath;
    }

    private generateHtmlContent(symbol: string, data: ChartData[]): string {
        const chartData = JSON.stringify(data);
        
        return `
<!DOCTYPE html>
<html>
<head>
    <title>${symbol} Technical Analysis</title>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
</head>
<body>
    <div id="chart"></div>
    <script>
        const data = ${chartData};
        
        const candlesticks = {
            x: data.map(d => new Date(d.timestamp)),
            close: data.map(d => d.close),
            high: data.map(d => d.high),
            low: data.map(d => d.low),
            open: data.map(d => d.open),
            
            type: 'candlestick',
            name: 'Price',
            yaxis: 'y2'
        };

        const volumes = {
            x: data.map(d => new Date(d.timestamp)),
            y: data.map(d => d.volume),
            type: 'bar',
            name: 'Volume',
            yaxis: 'y1'
        };

        const layout = {
            title: '${symbol} Technical Analysis',
            yaxis: {
                title: 'Volume',
                domain: [0, 0.2]
            },
            yaxis2: {
                title: 'Price',
                domain: [0.3, 1]
            },
            xaxis: {
                rangeslider: {
                    visible: false
                }
            }
        };

        Plotly.newPlot('chart', [candlesticks, volumes], layout);
    </script>
</body>
</html>`;
    }
}
