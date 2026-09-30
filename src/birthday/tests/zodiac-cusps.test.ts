/**
 * Regression tests for the zodiac cusp table and the birthday date schema.
 *
 * Both bugs shipped: the cusp table reported 1-19 January as Capricorn, and
 * the schema accepted dates that do not exist. Each assertion below fails
 * against the pre-fix code.
 */
import { describe, expect, test } from "bun:test";
import { birthdaySchema, getSign } from "../birthdays";

/** Month is 0-based here, matching `Date.getMonth()`, which is what the
 *  implementation uses to build its lookup point. */
const DIM = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Ground truth sign ranges, inclusive of both ends. */
const RANGES: readonly (readonly [
	readonly [number, number],
	readonly [number, number],
	string,
])[] = [
	[[0, 1], [0, 19], "sagittarius"],
	[[0, 20], [1, 18], "aquarius"],
	[[1, 19], [2, 20], "pisces"],
	[[2, 21], [3, 19], "aries"],
	[[3, 20], [4, 20], "taurus"],
	[[4, 21], [5, 20], "gemini"],
	[[5, 21], [6, 22], "cancer"],
	[[6, 23], [7, 22], "leo"],
	[[7, 23], [8, 22], "virgo"],
	[[8, 23], [9, 22], "libra"],
	[[9, 23], [10, 21], "scorpio"],
	[[10, 22], [11, 21], "sagittarius"],
	[[11, 22], [11, 31], "capricorn"],
];

/** Every (month, day) in a leap year mapped to its true sign. */
const buildTruth = (): Map<string, string> => {
	const map = new Map<string, string>();
	for (const [from, to, name] of RANGES) {
		if (from[0] === to[0]) {
			for (let d = from[1]; d <= to[1]; d += 1) {
				map.set(`${from[0]}-${d}`, name);
			}
			continue;
		}
		const months = DIM[from[0]];
		if (months === undefined) throw new Error("bad range");
		for (let d = from[1]; d <= months; d += 1) map.set(`${from[0]}-${d}`, name);
		for (let m = from[0] + 1; m < to[0]; m += 1) {
			const dim = DIM[m];
			if (dim === undefined) throw new Error("bad range");
			for (let d = 1; d <= dim; d += 1) map.set(`${m}-${d}`, name);
		}
		for (let d = 1; d <= to[1]; d += 1) map.set(`${to[0]}-${d}`, name);
	}
	return map;
};

describe("zodiac cusps", () => {
	const truth = buildTruth();

	test("every day of the year maps to the correct sign", () => {
		const wrong: string[] = [];
		for (let m = 0; m < 12; m += 1) {
			const dim = DIM[m];
			if (dim === undefined) continue;
			for (let d = 1; d <= dim; d += 1) {
				const expected = truth.get(`${m}-${d}`);
				if (expected === undefined) continue;
				const actual = getSign(new Date(2024, m, d)).name;
				if (actual !== expected) {
					wrong.push(`${m + 1}/${d}: ${actual} != ${expected}`);
				}
			}
		}
		expect(wrong).toEqual([]);
	});

	test("1-19 January is Sagittarius, not Capricorn", () => {
		// The specific regression: the wrap-around entry named Capricorn, so
		// the first 19 days of January were reported as the wrong sign - and
		// therefore the wrong element, which feeds getCompatibilityScore.
		for (let d = 1; d <= 19; d += 1) {
			expect(getSign(new Date(2024, 0, d)).name).toBe("sagittarius");
		}
	});

	test("22 December onwards is Capricorn", () => {
		for (let d = 22; d <= 31; d += 1) {
			expect(getSign(new Date(2024, 11, d)).name).toBe("capricorn");
		}
	});

	test("21 June is Cancer (the cusp was off by one day)", () => {
		expect(getSign(new Date(2024, 5, 21)).name).toBe("cancer");
		expect(getSign(new Date(2024, 5, 22)).name).toBe("cancer");
		expect(getSign(new Date(2024, 5, 20)).name).toBe("gemini");
	});

	test("January sign carries the fire element, as Sagittarius must", () => {
		expect(getSign(new Date(2024, 0, 10)).element).toBe("fire");
	});
});

describe("birthdaySchema date validation", () => {
	const kind = "♂️" as const;

	test("accepts a real date", () => {
		expect(
			birthdaySchema.safeParse({ name: "Alex", date: "1990-06-15", kind })
				.success,
		).toBe(true);
	});

	test("rejects a date that does not exist", () => {
		// dayjs rolls this forward to 2 March and calls it valid, so a plain
		// isValid() check accepted it.
		expect(
			birthdaySchema.safeParse({ name: "A", date: "1990-02-30", kind }).success,
		).toBe(false);
	});

	test("rejects an impossible month and day", () => {
		expect(
			birthdaySchema.safeParse({ name: "A", date: "2001-13-01", kind }).success,
		).toBe(false);
		expect(
			birthdaySchema.safeParse({ name: "A", date: "2001-00-10", kind }).success,
		).toBe(false);
		expect(
			birthdaySchema.safeParse({ name: "A", date: "2001-04-31", kind }).success,
		).toBe(false);
	});

	test("rejects a non-padded date", () => {
		expect(
			birthdaySchema.safeParse({ name: "A", date: "1990-1-1", kind }).success,
		).toBe(false);
	});

	test("rejects 29 February in a non-leap year but accepts it in a leap year", () => {
		expect(
			birthdaySchema.safeParse({ name: "A", date: "1990-02-29", kind }).success,
		).toBe(false);
		expect(
			birthdaySchema.safeParse({ name: "A", date: "1992-02-29", kind }).success,
		).toBe(true);
	});

	test("rejects a future date", () => {
		const future = new Date();
		future.setFullYear(future.getFullYear() + 1);
		const iso = future.toISOString().slice(0, 10);
		expect(
			birthdaySchema.safeParse({ name: "A", date: iso, kind }).success,
		).toBe(false);
	});

	test("accepts today - that is a newborn's actual birth date", () => {
		// Boundary, not a corner case. An `isBefore(today)` check rather than
		// `!isAfter(today)` rejects every newborn, because a birth date of today
		// is not strictly before today.
		const today = new Date();
		const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
			2,
			"0",
		)}-${String(today.getDate()).padStart(2, "0")}`;
		expect(
			birthdaySchema.safeParse({ name: "Newborn", date: iso, kind }).success,
		).toBe(true);
	});

	test("rejects tomorrow", () => {
		const t = new Date();
		t.setDate(t.getDate() + 1);
		const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(
			2,
			"0",
		)}-${String(t.getDate()).padStart(2, "0")}`;
		expect(
			birthdaySchema.safeParse({ name: "A", date: iso, kind }).success,
		).toBe(false);
	});

	test("still rejects an empty name", () => {
		expect(
			birthdaySchema.safeParse({ name: "", date: "1990-06-15", kind }).success,
		).toBe(false);
	});
});
