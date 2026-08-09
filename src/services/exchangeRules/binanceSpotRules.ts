/**
 * Binance Spot exchange-rule parser and MARKET-order normalizer.
 *
 * Design goals:
 * - Keep raw decimal filter values as strings so exchange precision is not lost.
 * - Treat MARKET_LOT_SIZE separately from LOT_SIZE.
 * - Support both legacy MIN_NOTIONAL and modern NOTIONAL filters.
 * - Produce a backward-compatible numeric view for the existing RealTradingEngine.
 * - Fail closed on malformed / non-trading symbols.
 */

export type BinanceSpotFilter = Record<string, unknown> & { filterType?: unknown };

export interface BinanceSpotExchangeSymbol {
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
    filters: BinanceSpotFilter[];
    orderTypes?: string[];
    isSpotTradingAllowed?: boolean;
}

export interface DecimalQuantityRule {
    minQty: string;
    maxQty: string;
    stepSize: string;
}

export interface DecimalPriceRule {
    minPrice: string;
    maxPrice: string;
    tickSize: string;
}

export interface SpotMarketNotionalRule {
    minNotional?: string;
    maxNotional?: string;
    minAvgPriceMins?: number;
    maxAvgPriceMins?: number;
    sourceFilters: Array<'MIN_NOTIONAL' | 'NOTIONAL'>;
}

export interface BinanceSpotSymbolRules {
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
    price: DecimalPriceRule;
    lotSize: DecimalQuantityRule;
    marketLotSize?: DecimalQuantityRule;
    /** Intersection of LOT_SIZE and MARKET_LOT_SIZE constraints that apply to MARKET quantity. */
    effectiveMarketQuantity: DecimalQuantityRule;
    marketNotional: SpotMarketNotionalRule;
    rawFilterTypes: string[];
}

/**
 * Backward-compatible shape used by the current RealTradingEngine.
 * minQty/maxQty/stepSize intentionally refer to MARKET-order effective rules.
 */
export interface LegacySpotMarketTradeRules {
    minQty: number;
    maxQty: number;
    stepSize: number;
    minNotional: number;
    maxNotional?: number;
    tickSize: number;
    status: string;
    baseAsset: string;
    quoteAsset: string;
    quantityRuleSource: 'LOT_SIZE' | 'LOT_SIZE+MARKET_LOT_SIZE';
    notionalRuleSources: Array<'MIN_NOTIONAL' | 'NOTIONAL'>;
}

export type SpotMarketOrderValidationCode =
    | 'SYMBOL_NOT_TRADING'
    | 'INVALID_QUANTITY'
    | 'QUANTITY_BELOW_MIN'
    | 'QUANTITY_ABOVE_MAX'
    | 'QUANTITY_STEP_MISMATCH'
    | 'INVALID_REFERENCE_PRICE'
    | 'NOTIONAL_BELOW_MIN'
    | 'NOTIONAL_ABOVE_MAX';

export interface SpotMarketOrderValidationIssue {
    code: SpotMarketOrderValidationCode;
    message: string;
}

function filterType(filter: BinanceSpotFilter): string {
    return typeof filter.filterType === 'string' ? filter.filterType : '';
}

function getFilter(filters: BinanceSpotFilter[], type: string): BinanceSpotFilter | undefined {
    return filters.find((filter) => filterType(filter) === type);
}

function requiredDecimal(filter: BinanceSpotFilter, field: string, filterName: string): string {
    const value = filter[field];
    if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error(`Malformed ${filterName}: missing ${field}.`);
    }
    const normalized = toPlainDecimal(String(value));
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
        throw new Error(`Malformed ${filterName}.${field}: ${String(value)}.`);
    }
    return normalized;
}

function optionalDecimal(filter: BinanceSpotFilter | undefined, field: string): string | undefined {
    if (!filter) return undefined;
    const value = filter[field];
    if (typeof value !== 'string' && typeof value !== 'number') return undefined;
    const normalized = toPlainDecimal(String(value));
    return /^\d+(?:\.\d+)?$/.test(normalized) ? normalized : undefined;
}

function optionalInteger(filter: BinanceSpotFilter | undefined, field: string): number | undefined {
    if (!filter) return undefined;
    const value = Number(filter[field]);
    return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined;
}

function optionalBoolean(filter: BinanceSpotFilter | undefined, field: string): boolean | undefined {
    if (!filter) return undefined;
    const value = filter[field];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
    }
    return undefined;
}

function parseQuantityRule(filter: BinanceSpotFilter, filterName: string): DecimalQuantityRule {
    return {
        minQty: requiredDecimal(filter, 'minQty', filterName),
        maxQty: requiredDecimal(filter, 'maxQty', filterName),
        stepSize: requiredDecimal(filter, 'stepSize', filterName),
    };
}

function parsePriceRule(filter: BinanceSpotFilter): DecimalPriceRule {
    return {
        minPrice: requiredDecimal(filter, 'minPrice', 'PRICE_FILTER'),
        maxPrice: requiredDecimal(filter, 'maxPrice', 'PRICE_FILTER'),
        tickSize: requiredDecimal(filter, 'tickSize', 'PRICE_FILTER'),
    };
}

function isPositiveDecimal(value: string | undefined): value is string {
    return value !== undefined && compareDecimals(value, '0') > 0;
}

function maxPositive(values: Array<string | undefined>): string {
    const active = values.filter(isPositiveDecimal);
    if (active.length === 0) return '0';
    return active.reduce((max, value) => compareDecimals(value, max) > 0 ? value : max);
}

function minPositive(values: Array<string | undefined>): string {
    const active = values.filter(isPositiveDecimal);
    if (active.length === 0) return '0';
    return active.reduce((min, value) => compareDecimals(value, min) < 0 ? value : min);
}

function effectiveMarketQuantity(
    lotSize: DecimalQuantityRule,
    marketLotSize?: DecimalQuantityRule,
): DecimalQuantityRule {
    const minQty = maxPositive([lotSize.minQty, marketLotSize?.minQty]);
    const maxQty = minPositive([lotSize.maxQty, marketLotSize?.maxQty]);
    const stepSize = lcmDecimalSteps([lotSize.stepSize, marketLotSize?.stepSize]);

    if (isPositiveDecimal(maxQty) && compareDecimals(minQty, maxQty) > 0) {
        throw new Error(`Invalid Spot quantity-rule intersection: minQty=${minQty} > maxQty=${maxQty}.`);
    }

    return { minQty, maxQty, stepSize };
}

function parseMarketNotional(filters: BinanceSpotFilter[]): SpotMarketNotionalRule {
    const legacy = getFilter(filters, 'MIN_NOTIONAL');
    const modern = getFilter(filters, 'NOTIONAL');

    const mins: Array<{ value: string; avg?: number; source: 'MIN_NOTIONAL' | 'NOTIONAL' }> = [];
    const maxs: Array<{ value: string; avg?: number; source: 'NOTIONAL' }> = [];

    if (legacy && optionalBoolean(legacy, 'applyToMarket') === true) {
        const min = optionalDecimal(legacy, 'minNotional');
        if (isPositiveDecimal(min)) {
            mins.push({
                value: min,
                avg: optionalInteger(legacy, 'avgPriceMins'),
                source: 'MIN_NOTIONAL',
            });
        }
    }

    if (modern) {
        if (optionalBoolean(modern, 'applyMinToMarket') === true) {
            const min = optionalDecimal(modern, 'minNotional');
            if (isPositiveDecimal(min)) {
                mins.push({
                    value: min,
                    avg: optionalInteger(modern, 'avgPriceMins'),
                    source: 'NOTIONAL',
                });
            }
        }

        if (optionalBoolean(modern, 'applyMaxToMarket') === true) {
            const max = optionalDecimal(modern, 'maxNotional');
            if (isPositiveDecimal(max)) {
                maxs.push({
                    value: max,
                    avg: optionalInteger(modern, 'avgPriceMins'),
                    source: 'NOTIONAL',
                });
            }
        }
    }

    const effectiveMin = mins.length > 0
        ? mins.reduce((best, item) => compareDecimals(item.value, best.value) > 0 ? item : best)
        : undefined;
    const effectiveMax = maxs.length > 0
        ? maxs.reduce((best, item) => compareDecimals(item.value, best.value) < 0 ? item : best)
        : undefined;

    const sourceFilters = Array.from(new Set([
        ...mins.map((item) => item.source),
        ...maxs.map((item) => item.source),
    ])) as Array<'MIN_NOTIONAL' | 'NOTIONAL'>;

    return {
        minNotional: effectiveMin?.value,
        maxNotional: effectiveMax?.value,
        minAvgPriceMins: effectiveMin?.avg,
        maxAvgPriceMins: effectiveMax?.avg,
        sourceFilters,
    };
}

export function parseBinanceSpotSymbolRules(info: BinanceSpotExchangeSymbol): BinanceSpotSymbolRules {
    const symbol = String(info?.symbol || '').trim().toUpperCase();
    const status = String(info?.status || '').trim().toUpperCase();
    const baseAsset = String(info?.baseAsset || '').trim().toUpperCase();
    const quoteAsset = String(info?.quoteAsset || '').trim().toUpperCase();
    const filters = Array.isArray(info?.filters) ? info.filters : [];

    if (!symbol || !status || !baseAsset || !quoteAsset) {
        throw new Error('Malformed Binance Spot exchangeInfo symbol metadata.');
    }

    const priceFilter = getFilter(filters, 'PRICE_FILTER');
    const lotFilter = getFilter(filters, 'LOT_SIZE');
    const marketLotFilter = getFilter(filters, 'MARKET_LOT_SIZE');

    if (!priceFilter) throw new Error(`Missing PRICE_FILTER for ${symbol}.`);
    if (!lotFilter) throw new Error(`Missing LOT_SIZE for ${symbol}.`);

    const lotSize = parseQuantityRule(lotFilter, 'LOT_SIZE');
    const marketLotSize = marketLotFilter
        ? parseQuantityRule(marketLotFilter, 'MARKET_LOT_SIZE')
        : undefined;

    return {
        symbol,
        status,
        baseAsset,
        quoteAsset,
        price: parsePriceRule(priceFilter),
        lotSize,
        marketLotSize,
        effectiveMarketQuantity: effectiveMarketQuantity(lotSize, marketLotSize),
        marketNotional: parseMarketNotional(filters),
        rawFilterTypes: filters.map(filterType).filter(Boolean),
    };
}

export function toLegacySpotMarketTradeRules(rules: BinanceSpotSymbolRules): LegacySpotMarketTradeRules {
    if (rules.status !== 'TRADING') {
        throw new Error(`Binance Spot symbol ${rules.symbol} is not TRADING (status=${rules.status}).`);
    }

    const { effectiveMarketQuantity } = rules;
    return {
        minQty: Number(effectiveMarketQuantity.minQty),
        maxQty: isPositiveDecimal(effectiveMarketQuantity.maxQty)
            ? Number(effectiveMarketQuantity.maxQty)
            : Number.POSITIVE_INFINITY,
        stepSize: Number(effectiveMarketQuantity.stepSize),
        minNotional: rules.marketNotional.minNotional
            ? Number(rules.marketNotional.minNotional)
            : 0,
        maxNotional: rules.marketNotional.maxNotional
            ? Number(rules.marketNotional.maxNotional)
            : undefined,
        tickSize: Number(rules.price.tickSize),
        status: rules.status,
        baseAsset: rules.baseAsset,
        quoteAsset: rules.quoteAsset,
        quantityRuleSource: rules.marketLotSize ? 'LOT_SIZE+MARKET_LOT_SIZE' : 'LOT_SIZE',
        notionalRuleSources: [...rules.marketNotional.sourceFilters],
    };
}

/** Floors a decimal quantity to the nearest allowed step without binary-float modulo arithmetic. */
export function floorToStepSize(quantity: number | string, stepSize: number | string): number {
    const quantityText = toPlainDecimal(String(quantity));
    const stepText = toPlainDecimal(String(stepSize));

    if (compareDecimals(stepText, '0') <= 0) {
        throw new Error('stepSize must be greater than 0');
    }
    if (compareDecimals(quantityText, '0') < 0) {
        throw new Error('quantity must be non-negative');
    }

    const scale = Math.max(decimalPlaces(quantityText), decimalPlaces(stepText));
    const quantityInt = toScaledInteger(quantityText, scale);
    const stepInt = toScaledInteger(stepText, scale);
    const floored = (quantityInt / stepInt) * stepInt;
    return Number(fromScaledInteger(floored, scale));
}

export function validateSpotMarketOrder(
    rules: BinanceSpotSymbolRules,
    quantity: number,
    referencePrice: number,
): SpotMarketOrderValidationIssue[] {
    const issues: SpotMarketOrderValidationIssue[] = [];

    if (rules.status !== 'TRADING') {
        issues.push({
            code: 'SYMBOL_NOT_TRADING',
            message: `${rules.symbol} status is ${rules.status}, not TRADING.`,
        });
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
        issues.push({ code: 'INVALID_QUANTITY', message: `Invalid quantity ${quantity}.` });
        return issues;
    }

    const qText = toPlainDecimal(String(quantity));
    const market = rules.effectiveMarketQuantity;

    if (isPositiveDecimal(market.minQty) && compareDecimals(qText, market.minQty) < 0) {
        issues.push({
            code: 'QUANTITY_BELOW_MIN',
            message: `quantity=${qText} < minQty=${market.minQty}.`,
        });
    }

    if (isPositiveDecimal(market.maxQty) && compareDecimals(qText, market.maxQty) > 0) {
        issues.push({
            code: 'QUANTITY_ABOVE_MAX',
            message: `quantity=${qText} > maxQty=${market.maxQty}.`,
        });
    }

    if (isPositiveDecimal(market.stepSize) && !isMultipleOfStep(qText, market.stepSize)) {
        issues.push({
            code: 'QUANTITY_STEP_MISMATCH',
            message: `quantity=${qText} is not a multiple of stepSize=${market.stepSize}.`,
        });
    }

    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
        issues.push({
            code: 'INVALID_REFERENCE_PRICE',
            message: `Invalid market reference price ${referencePrice}.`,
        });
        return issues;
    }

    // This is a local pre-flight estimate. Binance evaluates MARKET notional using
    // its own reference/average price, so exchange-side validation remains authoritative.
    const notional = quantity * referencePrice;
    const minNotional = rules.marketNotional.minNotional
        ? Number(rules.marketNotional.minNotional)
        : undefined;
    const maxNotional = rules.marketNotional.maxNotional
        ? Number(rules.marketNotional.maxNotional)
        : undefined;

    const tolerance = Math.max(1e-12, Math.abs(notional) * 1e-12);
    if (minNotional !== undefined && notional + tolerance < minNotional) {
        issues.push({
            code: 'NOTIONAL_BELOW_MIN',
            message: `estimated notional=${notional} < minNotional=${minNotional}.`,
        });
    }
    if (maxNotional !== undefined && notional - tolerance > maxNotional) {
        issues.push({
            code: 'NOTIONAL_ABOVE_MAX',
            message: `estimated notional=${notional} > maxNotional=${maxNotional}.`,
        });
    }

    return issues;
}

function lcmDecimalSteps(values: Array<string | undefined>): string {
    const active = values.filter(isPositiveDecimal);
    if (active.length === 0) return '0';
    if (active.length === 1) return trimDecimal(active[0]);

    const scale = Math.max(...active.map(decimalPlaces));
    const ints = active.map((value) => toScaledInteger(value, scale));
    const lcm = ints.reduce((acc, value) => lcmBigInt(acc, value));
    return trimDecimal(fromScaledInteger(lcm, scale));
}

function isMultipleOfStep(value: string, step: string): boolean {
    const scale = Math.max(decimalPlaces(value), decimalPlaces(step));
    const valueInt = toScaledInteger(value, scale);
    const stepInt = toScaledInteger(step, scale);
    return stepInt > 0n && valueInt % stepInt === 0n;
}

function gcdBigInt(a: bigint, b: bigint): bigint {
    let x = a < 0n ? -a : a;
    let y = b < 0n ? -b : b;
    while (y !== 0n) {
        const remainder = x % y;
        x = y;
        y = remainder;
    }
    return x;
}

function lcmBigInt(a: bigint, b: bigint): bigint {
    if (a === 0n || b === 0n) return 0n;
    return (a / gcdBigInt(a, b)) * b;
}

function compareDecimals(a: string, b: string): number {
    const left = toPlainDecimal(a);
    const right = toPlainDecimal(b);
    const scale = Math.max(decimalPlaces(left), decimalPlaces(right));
    const ai = toScaledInteger(left, scale);
    const bi = toScaledInteger(right, scale);
    return ai < bi ? -1 : ai > bi ? 1 : 0;
}

function decimalPlaces(value: string): number {
    const plain = toPlainDecimal(value);
    const dot = plain.indexOf('.');
    return dot === -1 ? 0 : plain.length - dot - 1;
}

function toScaledInteger(value: string, scale: number): bigint {
    const plain = toPlainDecimal(value);
    const [whole, fraction = ''] = plain.split('.');
    const padded = `${fraction}${'0'.repeat(scale)}`.slice(0, scale);
    return BigInt(`${whole}${padded}` || '0');
}

function fromScaledInteger(value: bigint, scale: number): string {
    if (scale === 0) return value.toString();
    const negative = value < 0n;
    const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
    const whole = digits.slice(0, -scale) || '0';
    const fraction = digits.slice(-scale);
    return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function trimDecimal(value: string): string {
    const plain = toPlainDecimal(value);
    if (!plain.includes('.')) return plain;
    const trimmed = plain.replace(/0+$/, '').replace(/\.$/, '');
    return trimmed || '0';
}

/** Convert ordinary/scientific non-negative decimal text to plain decimal notation. */
function toPlainDecimal(input: string): string {
    const raw = input.trim().toLowerCase();
    if (!raw) throw new Error('Empty decimal value.');
    if (raw.startsWith('-')) {
        const positive = toPlainDecimal(raw.slice(1));
        return positive === '0' ? '0' : `-${positive}`;
    }
    const unsigned = raw.startsWith('+') ? raw.slice(1) : raw;
    if (!/^\d*\.?\d+(?:e[+-]?\d+)?$/.test(unsigned)) {
        throw new Error(`Invalid decimal value: ${input}.`);
    }

    const [coefficient, exponentText] = unsigned.split('e');
    if (exponentText === undefined) {
        const [wholeRaw = '0', fractionRaw = ''] = coefficient.split('.');
        const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
        return fractionRaw.length > 0 ? `${whole}.${fractionRaw}` : whole;
    }

    const exponent = Number(exponentText);
    const [wholeRaw = '0', fractionRaw = ''] = coefficient.split('.');
    const digitsRaw = `${wholeRaw}${fractionRaw}`;
    const digits = digitsRaw.replace(/^0+(?=\d)/, '') || '0';
    const decimalIndex = wholeRaw.length + exponent - (digitsRaw.length - digits.length);

    if (digits === '0') return '0';
    if (decimalIndex <= 0) {
        return `0.${'0'.repeat(-decimalIndex)}${digits}`;
    }
    if (decimalIndex >= digits.length) {
        return `${digits}${'0'.repeat(decimalIndex - digits.length)}`;
    }
    return `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}
