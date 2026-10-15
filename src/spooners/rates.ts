import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { currencySymbol } from "./price";

const RatesSchema = z.record(z.string(), z.number().finite());

const RateTableSchema = z.object({
	base: z.string().min(1),
	date: z.string().min(1),
	rates: RatesSchema,
	fetchedAt: z.number().finite(),
});

export type RateTable = z.infer<typeof RateTableSchema>;

export const parseRateTable = (value: unknown): RateTable | null => {
	const result = RateTableSchema.safeParse(value);
	return result.success ? result.data : null;
};

const STORAGE_KEY = "spooners.rates.v1";
const ENDPOINT = "https://api.frankfurter.dev/v1/latest?from=GBP";
const TTL = 12 * 60 * 60 * 1000;

const readCache = (): RateTable | null => {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return null;
		}
		const table = parseRateTable(JSON.parse(raw));
		if (!table) {
			window.localStorage.removeItem(STORAGE_KEY);
			console.error("Spooners: discarded a malformed cached rate table");
			return null;
		}
		return table;
	} catch (err) {
		console.error("Spooners: could not read the cached rate table", err);
		return null;
	}
};

export const useRates = () => {
	const [table, setTable] = useState<RateTable | null>(() => readCache());
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await fetch(ENDPOINT);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const parsed = parseRateTable(await response.json());
			if (!parsed) {
				throw new Error("unexpected rate table from frankfurter.dev");
			}
			const next: RateTable = { ...parsed, fetchedAt: Date.now() };
			setTable(next);
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
			} catch (err) {
				console.warn(
					"Spooners: could not cache the rate table; rates work for this session only",
					err,
				);
			}
		} catch (err) {
			setError(String(err));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!table || Date.now() - table.fetchedAt > TTL) {
			void load();
		}
	}, [table, load]);

	return { table, loading, error, refresh: load };
};

const ratesOf = (table: RateTable | null): Record<string, number> | null => {
	const rates = table?.rates;
	return rates && typeof rates === "object" ? rates : null;
};

const unitRate = (
	from: string,
	to: string,
	table: RateTable | null,
): number | null => {
	if (from === to) {
		return 1;
	}
	const rates = ratesOf(table);
	if (!rates || !table) {
		return null;
	}
	const rateFrom = from === table.base ? 1 : rates[from];
	const rateTo = to === table.base ? 1 : rates[to];
	if (
		rateFrom == null ||
		rateTo == null ||
		!(rateFrom > 0) ||
		!(rateTo > 0) ||
		!Number.isFinite(rateFrom) ||
		!Number.isFinite(rateTo)
	) {
		return null;
	}
	return rateTo / rateFrom;
};

const warned = new Set<string>();

export const convert = (
	amount: number,
	from: string,
	to: string,
	table: RateTable | null,
): number => {
	const rate = unitRate(from, to, table);
	if (rate == null) {
		const pair = `${from}->${to}`;
		if (!warned.has(pair)) {
			warned.add(pair);
			console.warn(
				`Spooners: no exchange rate for ${pair}, price left as-is; ` +
					"call canConvertTo before converting",
			);
		}
		return amount;
	}
	return amount * rate;
};

export const canConvertTo = (code: string, table: RateTable | null): boolean =>
	Boolean(code) && unitRate(code, table?.base ?? "", table) != null;

export const currencyChoices = (table: RateTable | null): string[] => {
	const codes = new Set<string>(["GBP", "EUR", "USD"]);
	const rates = ratesOf(table);
	if (rates) {
		for (const code of Object.keys(rates)) {
			codes.add(code);
		}
		if (typeof table?.base === "string" && table.base) {
			codes.add(table.base);
		}
	}
	return [...codes].sort();
};

const CURRENCY_NAMES: Intl.DisplayNames | null =
	typeof Intl.DisplayNames === "function"
		? new Intl.DisplayNames(["en-GB"], { type: "currency" })
		: null;

export const currencySelectOptions = (
	codes: string[],
): { value: string; label: string }[] => {
	return codes.map((code) => {
		const name = CURRENCY_NAMES?.of(code);
		const label = `${currencySymbol(code)} ${code}${name ? ` · ${name}` : ""}`;
		return { value: code, label };
	});
};
