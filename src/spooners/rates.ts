import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { currencySymbol } from "./price";

/**
 * Daily ECB reference rates (via frankfurter.dev - free, no API key, CORS *).
 * Cached in localStorage for 12h so we are not calling it on every visit.
 *
 * This is the one place in the app where data arrives unchecked, from two
 * untrusted sources (localStorage, which any script or a user can edit, and the
 * network). Both are parsed through `RateTableSchema` and anything that does
 * not match is discarded rather than trusted: a truncated table used to throw
 * `table.rates[code]` during render, and a half-parsed one left prices
 * unconverted but still labelled with the target currency's symbol.
 */

const RatesSchema = z.record(z.string(), z.number().finite());

const RateTableSchema = z.object({
	/** Units of the currency per one unit of `base`. */
	base: z.string().min(1),
	date: z.string().min(1),
	rates: RatesSchema,
	fetchedAt: z.number().finite(),
});

export type RateTable = z.infer<typeof RateTableSchema>;

/** Shape check for a value that crossed a trust boundary. */
export const parseRateTable = (value: unknown): RateTable | null => {
	const result = RateTableSchema.safeParse(value);
	return result.success ? result.data : null;
};

const STORAGE_KEY = "spooners.rates.v1";
const ENDPOINT = "https://api.frankfurter.dev/v1/latest?from=GBP";
const TTL = 12 * 60 * 60 * 1000;

/**
 * The cached table, or null if it is absent, unparseable or the wrong shape.
 * A rejected entry is deleted so the bad value cannot be re-read on every
 * visit while the app keeps quietly failing to fetch.
 */
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
			const parsed = parseRateTable(await response.json());
			if (!parsed) {
				// Loud: the caller shows this, so a shape change upstream is
				// visible instead of silently disabling every conversion.
				throw new Error("unexpected rate table from frankfurter.dev");
			}
			const next: RateTable = { ...parsed, fetchedAt: Date.now() };
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

/**
 * The rates object, or null when there is no usable table. `table` is
 * validated on the way in, but a table written by an older build can still be
 * sitting in localStorage at runtime, so nothing here assumes a shape.
 */
const ratesOf = (table: RateTable | null): Record<string, number> | null => {
	const rates = table?.rates;
	return rates && typeof rates === "object" ? rates : null;
};

/** How many `to` one `from` is worth, or null when the table cannot say. */
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

// convert() cannot change its signature (callers treat the result as a number),
// so a failed conversion is reported rather than passed off as a real one.
const warned = new Set<string>();

/**
 * Convert `amount` from one currency to another using a GBP-based table.
 *
 * A table that cannot express the pair is a bug in the caller, not a reason to
 * relabel a foreign price in pounds, so it is logged once per pair. Callers
 * that care should gate on `canConvertTo` first.
 */
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
			console.error(`Spooners: no exchange rate for ${pair}, price left as-is`);
		}
		return amount;
	}
	return amount * rate;
};

/** True when `code` can be converted to with this table. */
export const canConvertTo = (code: string, table: RateTable | null): boolean =>
	Boolean(code) && unitRate(code, table?.base ?? "", table) != null;

/** Currency codes offered in settings (GBP/EUR/USD always, plus everything ECB publishes). */
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

// Constructing an `Intl` formatter builds a whole locale data structure and the
// object is designed to be reused, so it is built once when the module loads
// rather than once per label — the picker re-renders this list on every
// keystroke. The constructor is absent on runtimes without `Intl.DisplayNames`,
// where the bare currency code still reads correctly.
const CURRENCY_NAMES: Intl.DisplayNames | null =
	typeof Intl.DisplayNames === "function"
		? new Intl.DisplayNames(["en-GB"], { type: "currency" })
		: null;

/** Options for the settings currency picker: "£ GBP · British Pound". */
export const currencySelectOptions = (
	codes: string[],
): { value: string; label: string }[] => {
	return codes.map((code) => {
		const name = CURRENCY_NAMES?.of(code);
		const label = `${currencySymbol(code)} ${code}${name ? ` · ${name}` : ""}`;
		return { value: code, label };
	});
};
