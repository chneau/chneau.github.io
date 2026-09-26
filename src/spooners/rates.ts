import { useCallback, useEffect, useState } from "react";
import { currencySymbol } from "./price";

/**
 * Daily ECB reference rates (via frankfurter.dev - free, no API key, CORS *).
 * Cached in localStorage for 12h so we are not calling it on every visit.
 */

type RateTable = {
	base: string;
	date: string;
	rates: Record<string, number>;
	fetchedAt: number;
};

const STORAGE_KEY = "spooners.rates.v1";
const ENDPOINT = "https://api.frankfurter.dev/v1/latest?from=GBP";
const TTL = 12 * 60 * 60 * 1000;

const readCache = (): RateTable | null => {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as RateTable) : null;
	} catch {
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
			const json = (await response.json()) as {
				base: string;
				date: string;
				rates: Record<string, number>;
			};
			const next: RateTable = {
				base: json.base,
				date: json.date,
				rates: json.rates,
				fetchedAt: Date.now(),
			};
			setTable(next);
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
			} catch {
				/* storage full / disabled - rates still work for this session */
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

/** Convert `amount` from one currency to another using a GBP-based table. */
export const convert = (
	amount: number,
	from: string,
	to: string,
	table: RateTable | null,
): number => {
	if (!table || from === to) {
		return amount;
	}
	const rates: Record<string, number> = { ...table.rates, [table.base]: 1 };
	const rateFrom = rates[from];
	const rateTo = rates[to];
	if (rateFrom == null || rateTo == null) {
		return amount;
	}
	return (amount / rateFrom) * rateTo;
};

/** True when `code` can be converted to with this table. */
export const canConvertTo = (code: string, table: RateTable | null): boolean =>
	Boolean(table && (code === table.base || table.rates[code] != null));

/** Currency codes offered in settings (GBP/EUR/USD always, plus everything ECB publishes). */
export const currencyChoices = (table: RateTable | null): string[] => {
	const codes = new Set<string>(["GBP", "EUR", "USD"]);
	if (table) {
		for (const code of Object.keys(table.rates)) {
			codes.add(code);
		}
		codes.add(table.base);
	}
	return [...codes].sort();
};

/** Options for the settings currency picker: "£ GBP · British Pound". */
export const currencySelectOptions = (
	codes: string[],
): { value: string; label: string }[] => {
	let names: Intl.DisplayNames | null = null;
	try {
		names = new Intl.DisplayNames(["en-GB"], { type: "currency" });
	} catch {
		names = null;
	}
	return codes.map((code) => {
		const name = names?.of(code);
		const label = `${currencySymbol(code)} ${code}${name ? ` · ${name}` : ""}`;
		return { value: code, label };
	});
};
