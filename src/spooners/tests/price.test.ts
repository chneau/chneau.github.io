import { describe, expect, test } from "bun:test";
import { buildHistogram } from "../components/Distribution";
import { makeScale, median, money, normalize } from "../price";

describe("money", () => {
	test("formats a known currency with its symbol", () => {
		expect(money(5.5, "GBP")).toContain("5.50");
		expect(money(5.5, "GBP")).toContain("£");
	});

	test("an unknown currency is not mislabelled as pounds", () => {
		const formatted = money(3, "XX");
		expect(formatted).toBe("XX 3.00");
		expect(formatted).not.toContain("£");
	});
});

describe("histogram", () => {
	test("no prices gives no bins", () => {
		expect(buildHistogram([])).toEqual([]);
	});

	test("a single repeated price still renders one bin", () => {
		const bins = buildHistogram([5.5, 5.5, 5.5]);
		expect(bins.length).toBeGreaterThan(0);
		expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3);
	});

	test("spread prices map into bins", () => {
		const bins = buildHistogram([3, 4.5, 6]);
		expect(bins.length).toBeGreaterThan(0);
		expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3);
	});
});

describe("scale helpers", () => {
	test("normalize handles a flat scale", () => {
		expect(normalize(5, { min: 5, max: 5 })).toBe(0.5);
	});

	test("median returns the middle value", () => {
		expect(median([1, 2, 3])).toBe(2);
		expect(median([1, 2, 3, 4])).toBe(2.5);
		expect(median([])).toBe(0);
	});

	test("makeScale falls back to 0..1 when empty", () => {
		expect(makeScale([])).toEqual({ min: 0, max: 1 });
	});
});
