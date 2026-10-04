import { describe, expect, test } from "bun:test";
import { basketVenues } from "../basket";
import { buildHistogram } from "../components/Distribution";
import data from "../data/data.json";
import type { SpoonersCache } from "../types";

const cache = data as unknown as SpoonersCache;

const pricesOf = (name: string): number[] =>
	basketVenues(cache, [{ name, qty: 1 }]).map((venue) => venue.price);

describe("buildHistogram", () => {
	test("no prices means no bins", () => {
		expect(buildHistogram([])).toEqual([]);
	});

	test("every price lands in exactly one bin", () => {
		const prices = [3, 3.5, 4, 4.25, 5, 6.5, 7];
		const bins = buildHistogram(prices);
		expect(bins.length).toBeGreaterThan(0);
		const total = bins.reduce((sum, bin) => sum + bin.count, 0);
		expect(total).toBe(prices.length);
	});

	test("an identical price still produces one bin", () => {
		// min === max whenever the price is an exact multiple of 0.5, so the
		// bin-building loop used to produce nothing and the panel fell through
		// to "No prices to plot" while the StatsBar above printed the price.
		const bins = buildHistogram([2.5, 2.5, 2.5]);
		expect(bins).toHaveLength(1);
		expect(bins[0]?.count).toBe(3);
		expect(bins[0]?.end).toBeGreaterThan(bins[0]?.start ?? 0);
	});

	test("a single price always produces one bin", () => {
		const bins = buildHistogram([3]);
		expect(bins).toHaveLength(1);
		expect(bins[0]?.count).toBe(1);
		expect(bins[0]?.start).toBe(3);
	});

	test("a spread of prices still spans the range", () => {
		const bins = buildHistogram([1, 10]);
		expect(bins[0]?.start).toBe(1);
		expect(bins[bins.length - 1]?.end ?? 0).toBeGreaterThanOrEqual(10);
	});
});

/**
 * The real-data budget.
 *
 * `cache` is the whole 24 MB dataset and the test walks every item in it,
 * building a histogram for each price series. It completes in ~3.9s on its own,
 * which leaves almost nothing under Bun's 5s default once twelve `--parallel`
 * workers are competing for the same cores — it failed at 5126ms. Same class as
 * the `cheat-gear` timeouts: real work, real budget, stated rather than implied.
 */
const REAL_DATA_TIMEOUT = 30_000;

describe("buildHistogram on real pub prices", () => {
	test(
		"no real item collapses to zero bins",
		() => {
			const names = Object.keys(cache.items);
			let checked = 0;
			for (const name of names) {
				const prices = pricesOf(name);
				if (!prices.length) {
					continue;
				}
				checked += 1;
				const bins = buildHistogram(prices);
				expect(bins.length).toBeGreaterThan(0);
				expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(
					prices.length,
				);
			}
			expect(checked).toBeGreaterThan(100);
		},
		REAL_DATA_TIMEOUT,
	);

	// The three items the defect report named: all-£3/£3.50 prices, i.e.
	// min === max after rounding to half pounds.
	test.each([
		["SOURZ Cherry", 2.5],
		["Greene King Abbot Reserve", 3.5],
		["Sheep Dog Peanut Butter whiskey liqueur", 3],
	])("%s (£%s) plots a bin", (name, price) => {
		const prices = pricesOf(name);
		expect(prices.length).toBeGreaterThan(0);
		expect(prices).toContain(price);
		const bins = buildHistogram(prices);
		expect(bins.length).toBeGreaterThan(0);
		expect(Math.max(0, ...bins.map((bin) => bin.count))).toBe(prices.length);
	});
});
