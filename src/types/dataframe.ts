export interface DataFrame {
    open: number[];
    high: number[];
    low: number[];
    close: number[];
    volume: number[];
    date: Date[];
    [column: string]: number[] | string[] | Date[];
}

export interface OHLCVCandle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    date: Date;
}

export class DataFrameBuilder {
    private data: DataFrame;
    private columnNames: string[];

    constructor() {
        this.data = {
            open: [],
            high: [],
            low: [],
            close: [],
            volume: [],
            date: []
        };
        this.columnNames = ['open', 'high', 'low', 'close', 'volume', 'date'];
    }

    addCandle(candle: OHLCVCandle): this {
        this.data.open.push(candle.open);
        this.data.high.push(candle.high);
        this.data.low.push(candle.low);
        this.data.close.push(candle.close);
        this.data.volume.push(candle.volume);
        this.data.date.push(candle.date);
        return this;
    }

    addCandles(candles: OHLCVCandle[]): this {
        const len = candles.length;
        if (len === 0) return this;

        // Fast path for empty dataframe - pre-allocate arrays
        if (this.data.open.length === 0) {
            const open = new Array(len);
            const high = new Array(len);
            const low = new Array(len);
            const close = new Array(len);
            const volume = new Array(len);
            const date = new Array(len);

            for (let i = 0; i < len; i++) {
                const c = candles[i];
                open[i] = c.open;
                high[i] = c.high;
                low[i] = c.low;
                close[i] = c.close;
                volume[i] = c.volume;
                date[i] = c.date;
            }

            this.data.open = open;
            this.data.high = high;
            this.data.low = low;
            this.data.close = close;
            this.data.volume = volume;
            this.data.date = date;
        } else {
            // Fallback for appending to existing data
            for (let i = 0; i < len; i++) {
                this.addCandle(candles[i]);
            }
        }

        return this;
    }

    addColumn(name: string, values: number[] | string[] | Date[]): this {
        if (values.length !== this.data.open.length) {
            throw new Error(`Column ${name} length (${values.length}) doesn't match existing data length (${this.data.open.length})`);
        }
        if (!(name in this.data)) {
            this.columnNames.push(name);
        }
        this.data[name] = values;
        return this;
    }

    getColumn(name: string): number[] | string[] | Date[] | undefined {
        return this.data[name];
    }

    setColumn(name: string, values: number[] | string[] | Date[]): this {
        if (!(name in this.data)) {
            this.columnNames.push(name);
        }
        this.data[name] = values;
        return this;
    }

    getLength(): number {
        return this.data.open.length;
    }

    slice(start: number, end?: number): DataFrame {
        const result: DataFrame = {
            open: [],
            high: [],
            low: [],
            close: [],
            volume: [],
            date: []
        };

        for (const key of this.columnNames) {
            const values = this.data[key];
            if (values) {
                result[key] = (values as any[]).slice(start, end);
            }
        }

        return result;
    }

    tail(n: number = 5): DataFrame {
        return this.slice(-n);
    }

    head(n: number = 5): DataFrame {
        return this.slice(0, n);
    }

    build(): DataFrame {
        return { ...this.data };
    }

    static fromCandles(candles: OHLCVCandle[]): DataFrame {
        const builder = new DataFrameBuilder();
        return builder.addCandles(candles).build();
    }

    static empty(): DataFrame {
        return new DataFrameBuilder().build();
    }

    // Helper method to get typical price (hlc3)
    static getTypicalPrice(dataframe: DataFrame): number[] {
        return dataframe.high.map((high, i) => 
            (high + dataframe.low[i] + dataframe.close[i]) / 3
        );
    }

    // Helper method to calculate percentage change
    static getPercentageChange(values: number[], periods: number = 1): number[] {
        const result: number[] = new Array(periods).fill(0);
        for (let i = periods; i < values.length; i++) {
            const currentValue = values[i];
            const previousValue = values[i - periods];
            result.push(((currentValue - previousValue) / previousValue) * 100);
        }
        return result;
    }

    // Helper method to calculate simple moving average
    static getSMA(values: number[], period: number): number[] {
        const result: number[] = new Array(period - 1).fill(NaN);
        for (let i = period - 1; i < values.length; i++) {
            const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            result.push(sum / period);
        }
        return result;
    }

    // Helper method to calculate exponential moving average
    static getEMA(values: number[], period: number): number[] {
        const result: number[] = [];
        const multiplier = 2 / (period + 1);
        
        // First value is just the first price
        result.push(values[0]);
        
        for (let i = 1; i < values.length; i++) {
            const ema = (values[i] * multiplier) + (result[i - 1] * (1 - multiplier));
            result.push(ema);
        }
        
        return result;
    }

    // Helper method for crossed above condition
    static crossedAbove(series1: number[], series2: number[] | number): boolean[] {
        const series2Array = typeof series2 === 'number' 
            ? new Array(series1.length).fill(series2) 
            : series2;
            
        return series1.map((value, i) => {
            if (i === 0) return false;
            return value > series2Array[i] && series1[i - 1] <= series2Array[i - 1];
        });
    }

    // Helper method for crossed below condition
    static crossedBelow(series1: number[], series2: number[] | number): boolean[] {
        const series2Array = typeof series2 === 'number' 
            ? new Array(series1.length).fill(series2) 
            : series2;
            
        return series1.map((value, i) => {
            if (i === 0) return false;
            return value < series2Array[i] && series1[i - 1] >= series2Array[i - 1];
        });
    }
}
