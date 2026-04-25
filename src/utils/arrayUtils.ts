/**
 * ⚡ Bolt: Pad an array to a target length without intermediate array allocations
 * Replaces new Array(pad).fill(val).concat(values) to reduce GC overhead
 */
export function padArray(values: number[], targetLength: number, padValue: number = NaN): number[] {
    const result = new Array(targetLength).fill(padValue);
    const offset = targetLength - values.length;
    for (let i = 0; i < values.length; i++) {
        result[i + offset] = values[i];
    }
    return result;
}

/**
 * ⚡ Bolt: Map and pad an array in a single pass to eliminate intermediate allocations
 */
export function padMappedArray<T>(values: T[], targetLength: number, padValue: number, mapFn: (v: T) => number): number[] {
    const result = new Array(targetLength).fill(padValue);
    const offset = targetLength - values.length;
    for (let i = 0; i < values.length; i++) {
        result[i + offset] = mapFn(values[i]);
    }
    return result;
}
