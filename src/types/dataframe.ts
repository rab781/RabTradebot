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
        const len = dataframe.high.length;
        const result = new Array(len);
        const highs = dataframe.high;
        const lows = dataframe.low;
        const closes = dataframe.close;

        for (let i = 0; i < len; i++) {
            result[i] = (highs[i] + lows[i] + closes[i]) / 3;
        }
        return result;
    }

    // Helper method to calculate percentage change
    static getPercentageChange(values: number[], periods: number = 1): number[] {
        const len = values.length;
        const result: number[] = new Array(len);

        // Fill initial periods with 0
        for (let i = 0; i < periods && i < len; i++) {
            result[i] = 0;
        }

        for (let i = periods; i < len; i++) {
            const currentValue = values[i];
            const previousValue = values[i - periods];
            result[i] = ((currentValue - previousValue) / previousValue) * 100;
        }
        return result;
    }

    // Helper method to calculate simple moving average
    static getSMA(values: number[], period: number): number[] {
        const len = values.length;
        const result: number[] = new Array(len).fill(NaN);

        if (len < period) return result;

        let sum = 0;
        // Calculate initial sum
        for (let i = 0; i < period; i++) {
            sum += values[i];
        }

        result[period - 1] = sum / period;

        // Calculate sliding window sum
        for (let i = period; i < len; i++) {
            sum = sum - values[i - period] + values[i];
            result[i] = sum / period;
        }

        return result;
    }

    // Helper method to calculate exponential moving average
    static getEMA(values: number[], period: number): number[] {
        const len = values.length;
        const result: number[] = new Array(len);
        if (len === 0) return result;

        const multiplier = 2 / (period + 1);
        
        // First value is just the first price
        result[0] = values[0];
        
        for (let i = 1; i < len; i++) {
            result[i] = (values[i] * multiplier) + (result[i - 1] * (1 - multiplier));
        }
        
        return result;
    }

    // Helper method for crossed above condition
    static crossedAbove(series1: number[], series2: number[] | number): boolean[] {
        const len = series1.length;
        const result = new Array<boolean>(len);

        if (len === 0) return result;

        result[0] = false;

        if (typeof series2 === 'number') {
            for (let i = 1; i < len; i++) {
                result[i] = series1[i] > series2 && series1[i - 1] <= series2;
            }
        } else {
            for (let i = 1; i < len; i++) {
                result[i] = series1[i] > series2[i] && series1[i - 1] <= series2[i - 1];
            }
        }
            
        return result;
    }

    // Helper method for crossed below condition
    static crossedBelow(series1: number[], series2: number[] | number): boolean[] {
        const len = series1.length;
        const result = new Array<boolean>(len);

        if (len === 0) return result;

        result[0] = false;

        if (typeof series2 === 'number') {
            for (let i = 1; i < len; i++) {
                result[i] = series1[i] < series2 && series1[i - 1] >= series2;
            }
        } else {
            for (let i = 1; i < len; i++) {
                result[i] = series1[i] < series2[i] && series1[i - 1] >= series2[i - 1];
            }
        }
            
        return result;
    }
}
