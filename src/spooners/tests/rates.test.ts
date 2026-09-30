import "./happy-dom";
import { beforeEach, describe, expect, test } from "bun:test";
import {
	canConvertTo,
	convert,
	currencyChoices,
	parseRateTable,
	type RateTable,
} from "../rates";

const STORAGE_KEY = "spooners.rates.v1";

const VALID = {
	base: "GBP",
	date: "2026-09-29",
	rates: { EUR: 1.17, USD: 1.35, JPY: 199.2 },
	fetchedAt: Date.now(),
};

/**
 * A table shaped the way an older build (or an edited localStorage entry)
 * could leave it: right keys, wrong value types, or `rates` missing entirely.
 */
const malformed: unknown[] = [
	undefined,
	null,
	"nonsense",
	42,
	[],
	{},
	{ base: "GBP", date: "2026-09-29", fetchedAt: Date.now() },
	{ base: "GBP", date: "2026-09-29", rates: null, fetchedAt: Date.now() },
	{ base: "GBP", date: "2026-09-29", rates: [], fetchedAt: Date.now() },
	{ base: "GBP", date: "2026-09-29", rates: { EUR: "1.17" }, fetchedAt: 0 },
	{ base: "GBP", date: "2026-09-29", rates: { EUR: null }, fetchedAt: 0 },
	{ base: "GBP", date: "2026-09-29", rates: { EUR: 1.17 } },
	{ base: "", date: "2026-09-29", rates: { EUR: 1.17 }, fetchedAt: 0 },
	{ base: "GBP", date: "", rates: { EUR: 1.17 }, fetchedAt: 0 },
	{ base: "GBP", date: "2026-09-29", rates: { EUR: 1.17 }, fetchedAt: "soon" },
	{ base: "GBP", date: "2026-09-29", rates: { EUR: Number.NaN }, fetchedAt: 0 },
];

beforeEach(() => {
	window.localStorage.removeItem(STORAGE_KEY);
});

describe("parseRateTable", () => {
	test("accepts a well-formed table", () => {
		expect(parseRateTable(VALID)).toEqual(VALID);
	});

	test.each(malformed.map((value, index) => [index, value] as const))(
		"rejects malformed input #%i",
		(_index, value) => {
			expect(parseRateTable(value)).toBeNull();
		},
	);
});

describe("malformed tables never reach the render path", () => {
	// The defect: `canConvertTo`/`currencyChoices` dereferenced `table.rates`
	// unconditionally, so a corrupt cached table crashed the app during render
	// with "TypeError: undefined is not an object".
	test.each(malformed.map((value, index) => [index, value] as const))(
		"input #%i does not throw and degrades to no conversion",
		(_index, value) => {
			const table = parseRateTable(value);
			expect(() => canConvertTo("EUR", table)).not.toThrow();
			expect(() => currencyChoices(table)).not.toThrow();
			expect(canConvertTo("EUR", table)).toBe(false);
			expect(currencyChoices(table)).toEqual(["EUR", "GBP", "USD"]);
			expect(() => convert(10, "EUR", "GBP", table)).not.toThrow();
		},
	);

	test("a table that parses still converts", () => {
		const table = parseRateTable(VALID);
		expect(table).not.toBeNull();
		expect(canConvertTo("EUR", table)).toBe(true);
		expect(canConvertTo("XYZ", table)).toBe(false);
		expect(currencyChoices(table)).toEqual(["EUR", "GBP", "JPY", "USD"]);
		expect(convert(10, "EUR", "GBP", table)).toBeCloseTo(10 / 1.17, 6);
	});

	test("the base currency is always convertible", () => {
		const table = parseRateTable(VALID);
		expect(canConvertTo("GBP", table)).toBe(true);
		expect(convert(10, "GBP", "GBP", table)).toBe(10);
	});
});

describe("a hostile rate table cannot produce a wrong number", () => {
	// Rates of 0, negatives and infinities divide by zero or invert the price;
	// they must be treated as "cannot convert" rather than trusted.
	test.each([
		["a zero source rate", 0, "EUR"],
		["a negative source rate", -1.17, "EUR"],
		["a non-finite source rate", Number.POSITIVE_INFINITY, "EUR"],
		["a zero target rate", 0, "USD"],
		["a negative target rate", -1.35, "USD"],
	])("%s blocks conversion involving %s", (_label, badRate, broken) => {
		const table = parseRateTable({
			base: "GBP",
			date: "2026-09-29",
			rates: { ...VALID.rates, [broken]: badRate },
			fetchedAt: Date.now(),
		});
		expect(canConvertTo(broken, table)).toBe(false);
		// The amount comes back untouched, so no price is ever divided by zero
		// or inverted by a negative rate.
		expect(convert(10, "EUR", broken, table)).toBe(10);
		expect(convert(10, broken, "GBP", table)).toBe(10);
	});

	test("an empty currency code is never convertible", () => {
		const table = parseRateTable(VALID);
		expect(canConvertTo("", table)).toBe(false);
		expect(canConvertTo("", null)).toBe(false);
	});
});

describe("convert refuses to mislabel a price", () => {
	test("an unknown source currency leaves the amount unconverted", () => {
		// Loud rather than silently wrong: converting() in useSpoonersView
		// gates on canConvertTo, so this is the last line of defence.
		const table = parseRateTable(VALID);
		expect(canConvertTo("XYZ", table)).toBe(false);
		expect(convert(10, "XYZ", "GBP", table)).toBe(10);
	});

	test("a null table never claims to convert", () => {
		expect(canConvertTo("EUR", null)).toBe(false);
		expect(convert(10, "EUR", "GBP", null)).toBe(10);
	});
});

describe("currencyChoices", () => {
	test("always offers the three defaults with no table", () => {
		expect(currencyChoices(null)).toEqual(["EUR", "GBP", "USD"]);
	});

	test("a table with no rates is inert but still valid", () => {
		// Well-shaped, so it is kept - but nothing can be converted with it,
		// which is what stops a price being relabelled.
		const table = parseRateTable({
			base: "GBP",
			date: "2026-09-29",
			rates: {},
			fetchedAt: Date.now(),
		});
		expect(table).not.toBeNull();
		expect(canConvertTo("EUR", table)).toBe(false);
		expect(canConvertTo("GBP", table)).toBe(true);
	});

	test("a table adds its own codes without duplicating the defaults", () => {
		const table: RateTable = {
			base: "GBP",
			date: "2026-09-29",
			rates: { EUR: 1.17, CHF: 1.1 },
			fetchedAt: Date.now(),
		};
		expect(currencyChoices(table)).toEqual(["CHF", "EUR", "GBP", "USD"]);
	});
});
