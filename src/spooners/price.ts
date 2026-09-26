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

/** 0 = cheapest (green), 1 = dearest (red). */
export const normalize = (price: number, scale: PriceScale): number => {
	if (scale.max === scale.min) {
		return 0.5;
	}
	return (price - scale.min) / (scale.max - scale.min);
};

/** Green -> amber -> red, matching the map markers. */
export const priceColor = (price: number, scale: PriceScale): string => {
	const t = normalize(price, scale);
	const hue = 135 - 135 * t;
	const light = 44 + 6 * Math.sin(Math.PI * t);
	return `hsl(${hue.toFixed(0)} 68% ${light.toFixed(0)}%)`;
};

export const money = (value: number, currency = "GBP"): string => {
	try {
		return new Intl.NumberFormat("en-GB", {
			style: "currency",
			currency,
		}).format(value);
	} catch {
		return `£${value.toFixed(2)}`;
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

/** The currency's symbol ("£", "€", "US$"), falling back to the code. */
export const currencySymbol = (currency: string): string => {
	try {
		return (
			new Intl.NumberFormat("en-GB", { style: "currency", currency })
				.formatToParts(0)
				.find((part) => part.type === "currency")?.value ?? currency
		);
	} catch {
		return currency;
	}
};

/** "3.10" — the amount alone, for when the symbol is displayed separately.
 *  Uses the currency's own number of decimals (JPY has none, GBP/EUR have 2). */
export const amount = (value: number, currency?: string): string => {
	let digits = 2;
	try {
		if (currency) {
			digits =
				new Intl.NumberFormat("en-GB", {
					style: "currency",
					currency,
				}).resolvedOptions().maximumFractionDigits ?? 2;
		}
	} catch {
		digits = 2;
	}
	return new Intl.NumberFormat("en-GB", {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	}).format(value);
};

/** "0.4 mi" / "12 mi" */
export const miles = (value: number): string =>
	value < 10 ? `${value.toFixed(1)} mi` : `${Math.round(value)} mi`;
