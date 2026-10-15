export type PriceScale = {
	min: number;
	max: number;
};

export const makeScale = (prices: number[]): PriceScale => {
	if (!prices.length) {
		return { min: 0, max: 1 };
	}
	return { min: Math.min(...prices), max: Math.max(...prices) };
};

export const normalize = (price: number, scale: PriceScale): number => {
	if (scale.max === scale.min) {
		return 0.5;
	}
	return (price - scale.min) / (scale.max - scale.min);
};

const CHEAP_HUE = 135;
const DEAR_HUE = 0;

export const priceHue = (price: number, scale: PriceScale): number =>
	CHEAP_HUE - (CHEAP_HUE - DEAR_HUE) * normalize(price, scale);

export const priceColor = (price: number, scale: PriceScale): string => {
	const light = 44 + 6 * Math.sin(Math.PI * normalize(price, scale));
	return `hsl(${priceHue(price, scale).toFixed(0)} 68% ${light.toFixed(0)}%)`;
};

const moneyFormatters = new Map<string, Intl.NumberFormat>();

const moneyFormat = (currency: string): Intl.NumberFormat => {
	let formatter = moneyFormatters.get(currency);
	if (!formatter) {
		formatter = new Intl.NumberFormat("en-GB", {
			style: "currency",
			currency,
		});
		moneyFormatters.set(currency, formatter);
	}
	return formatter;
};

export const money = (value: number, currency = "GBP"): string => {
	try {
		return moneyFormat(currency).format(value);
	} catch {
		return `${currency} ${value.toFixed(2)}`;
	}
};

export const median = (values: number[]): number => {
	if (!values.length) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	const upper = sorted[middle] ?? 0;
	const lower = sorted[middle - 1] ?? upper;
	return sorted.length % 2 ? upper : (upper + lower) / 2;
};

const symbolCache = new Map<string, string>();

export const currencySymbol = (currency: string): string => {
	const cached = symbolCache.get(currency);
	if (cached != null) {
		return cached;
	}
	try {
		const symbol =
			moneyFormat(currency)
				.formatToParts(0)
				.find((part) => part.type === "currency")?.value ?? currency;
		symbolCache.set(currency, symbol);
		return symbol;
	} catch {
		return currency;
	}
};

const digitsCache = new Map<string, number>();

const digitsFor = (currency?: string): number => {
	if (!currency) {
		return 2;
	}
	const cached = digitsCache.get(currency);
	if (cached != null) {
		return cached;
	}
	let digits = 2;
	try {
		digits = moneyFormat(currency).resolvedOptions().maximumFractionDigits ?? 2;
	} catch {
		digits = 2;
	}
	digitsCache.set(currency, digits);
	return digits;
};

const amountFormatters = new Map<number, Intl.NumberFormat>();

export const amount = (value: number, currency?: string): string => {
	const digits = digitsFor(currency);
	let formatter = amountFormatters.get(digits);
	if (!formatter) {
		formatter = new Intl.NumberFormat("en-GB", {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
		});
		amountFormatters.set(digits, formatter);
	}
	return formatter.format(value);
};

export const miles = (value: number): string =>
	value < 10 ? `${value.toFixed(1)} mi` : `${Math.round(value)} mi`;
