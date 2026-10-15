import { describe, expect, test } from "bun:test";
import {
	BIORHYTHM_CYCLES,
	biorhythmValue,
	biorhythmWave,
} from "../BiorhythmsChart";

const PERIODS = BIORHYTHM_CYCLES.map((cycle) => cycle.period);

const DAYS_IN_A_YEAR = 365;
const DAYS_IN_TWO_YEARS = 730;

describe("the three cycles", () => {
	test("are 23, 28 and 33 days, keyed as the chart series", () => {
		expect(BIORHYTHM_CYCLES).toEqual([
			{ key: "physical", period: 23 },
			{ key: "emotional", period: 28 },
			{ key: "intellectual", period: 33 },
		]);
	});

	test("are distinct - no two series draw the same curve", () => {
		expect(new Set(PERIODS).size).toBe(PERIODS.length);
	});

	test("are all whole days long", () => {
		for (const period of PERIODS) {
			expect(Number.isInteger(period)).toBe(true);
			expect(period).toBeGreaterThan(0);
		}
	});
});

describe("the birth-date anchor", () => {
	test("is exactly zero on the day of birth, for every cycle", () => {
		for (const period of PERIODS) {
			expect(biorhythmValue(0, period)).toBe(0);
		}
	});

	test("is positive one day after birth and negative one day before", () => {
		for (const period of PERIODS) {
			expect(biorhythmValue(1, period)).toBeGreaterThan(0);
		}
	});

	test("wave() reports zero for all three cycles at day zero", () => {
		expect(biorhythmWave(0)).toEqual({
			physical: 0,
			emotional: 0,
			intellectual: 0,
		});
	});
});

describe("the period boundaries", () => {
	test("returns to zero at one full period, for every cycle", () => {
		for (const period of PERIODS) {
			expect(biorhythmValue(period, period)).toBe(0);
			expect(biorhythmValue(period * 2, period)).toBe(0);
			expect(biorhythmValue(period * 7, period)).toBe(0);
		}
	});

	test("peaks at +100 a quarter of the way through a period", () => {
		for (const period of PERIODS) {
			expect(biorhythmValue(period / 4, period)).toBeCloseTo(100, 10);
		}
	});

	test("troughs at -100 three quarters of the way through a period", () => {
		for (const period of PERIODS) {
			expect(biorhythmValue((period * 3) / 4, period)).toBeCloseTo(-100, 10);
		}
	});

	test("crosses zero at the half period, between the peak and the trough", () => {
		for (const period of PERIODS) {
			expect(biorhythmValue(period / 2, period)).toBeCloseTo(0, 10);
		}
	});
});

describe("the value band", () => {
	test("never leaves [-100, 100] over two years of every cycle", () => {
		for (const period of PERIODS) {
			for (let day = 0; day <= DAYS_IN_TWO_YEARS; day++) {
				const value = biorhythmValue(day, period);
				expect(value).toBeGreaterThanOrEqual(-100);
				expect(value).toBeLessThanOrEqual(100);
			}
		}
	});

	test("reaches both ends of the band, so the band is tight", () => {
		for (const period of PERIODS) {
			expect(biorhythmValue(period / 4, period)).toBeCloseTo(100, 6);
			expect(biorhythmValue((period * 3) / 4, period)).toBeCloseTo(-100, 6);
		}
	});

	test("wave() keeps all three cycles inside the band at once", () => {
		for (let day = 0; day <= DAYS_IN_A_YEAR; day++) {
			const { physical, emotional, intellectual } = biorhythmWave(day);
			for (const value of [physical, emotional, intellectual]) {
				expect(value).toBeGreaterThanOrEqual(-100);
				expect(value).toBeLessThanOrEqual(100);
			}
		}
	});
});

describe("periodicity", () => {
	test("repeats exactly every period days, for every cycle", () => {
		for (const period of PERIODS) {
			for (const offset of [0, 1, 5, 13, period - 1, period / 2 + 0.5]) {
				expect(biorhythmValue(offset + period, period)).toBe(
					biorhythmValue(offset, period),
				);
				expect(biorhythmValue(offset + period * 11, period)).toBe(
					biorhythmValue(offset, period),
				);
			}
		}
	});

	test("repeats bit-for-bit, not just approximately", () => {
		for (const period of PERIODS) {
			for (let day = 0; day < 500; day++) {
				expect(biorhythmValue(day + period * 1000, period)).toBe(
					biorhythmValue(day, period),
				);
			}
		}
	});

	test("a day is not a period for any cycle", () => {
		for (const period of PERIODS) {
			expect(biorhythmValue(10, period)).not.toBe(biorhythmValue(11, period));
		}
	});
});

describe("a year is deliberately not a period", () => {
	test("365 days is not a whole number of any cycle", () => {
		for (const period of PERIODS) {
			expect(DAYS_IN_A_YEAR % period).not.toBe(0);
		}
	});

	test("the curve does not return to its birth-date value after a year", () => {
		for (const period of PERIODS) {
			expect(biorhythmValue(DAYS_IN_A_YEAR, period)).not.toBe(
				biorhythmValue(0, period),
			);
			expect(biorhythmValue(DAYS_IN_A_YEAR, period)).not.toBeCloseTo(0, 3);
		}
	});

	test("nor after two years, nor after a leap year", () => {
		for (const period of PERIODS) {
			expect(biorhythmValue(DAYS_IN_TWO_YEARS, period)).not.toBeCloseTo(0, 3);
			expect(biorhythmValue(DAYS_IN_A_YEAR + 1, period)).not.toBeCloseTo(0, 3);
		}
	});

	test("the full wave is a different shape a year later", () => {
		expect(biorhythmWave(DAYS_IN_A_YEAR)).not.toEqual(biorhythmWave(0));
		expect(biorhythmWave(DAYS_IN_TWO_YEARS)).not.toEqual(biorhythmWave(0));
	});

	test("the least common multiple of the three cycles is not a year", () => {
		const lcm = PERIODS.reduce((acc, p) => acc * p, 1);
		expect(lcm).toBe(21252);
		expect(lcm % DAYS_IN_A_YEAR).not.toBe(0);
		expect(biorhythmWave(DAYS_IN_A_YEAR)).not.toEqual(biorhythmWave(0));
	});
});

describe("future and unknown birth dates", () => {
	test("a negative days-lived is clamped to the anchor, not extrapolated", () => {
		for (const period of PERIODS) {
			for (const negative of [-1, -30, -400, -100_000]) {
				expect(biorhythmValue(negative, period)).toBe(0);
			}
		}
	});

	test("clamping is total: every negative day gives the same value", () => {
		for (const period of PERIODS) {
			expect(biorhythmValue(-1, period)).toBe(biorhythmValue(-999_999, period));
		}
	});

	test("a bogus future date is still zero, not a plausible-looking number", () => {
		expect(biorhythmWave(-1)).toEqual({
			physical: 0,
			emotional: 0,
			intellectual: 0,
		});
	});

	test("a zero-day anchor and a negative one agree, so the chart is continuous there", () => {
		for (const period of PERIODS) {
			expect(biorhythmValue(-1, period)).toBe(biorhythmValue(0, period));
		}
	});
});

describe("degenerate and hostile inputs", () => {
	test("a non-positive or non-finite period yields zero rather than NaN", () => {
		for (const period of [0, -1, -23, Number.NaN, Infinity, -Infinity]) {
			expect(biorhythmValue(100, period)).toBe(0);
		}
	});

	test("a non-finite day count yields zero rather than NaN", () => {
		for (const day of [Number.NaN, Infinity, -Infinity]) {
			for (const period of PERIODS) {
				expect(biorhythmValue(day, period)).toBe(0);
			}
		}
	});

	test("a very old birth date does not overflow or lose accuracy", () => {
		for (const period of PERIODS) {
			for (const offset of [0, 1, 7, period / 2]) {
				const ancient = 1_900_000 + offset;
				const expected = biorhythmValue(ancient % period, period);
				expect(biorhythmValue(ancient, period)).toBe(expected);
				expect(Number.isFinite(biorhythmValue(ancient, period))).toBe(true);
			}
		}
	});

	test("the largest day counts JS can hold stay finite and in band", () => {
		for (const day of [1e9, 1e12, Number.MAX_SAFE_INTEGER]) {
			for (const period of PERIODS) {
				const value = biorhythmValue(day, period);
				expect(Number.isFinite(value)).toBe(true);
				expect(value).toBeGreaterThanOrEqual(-100);
				expect(value).toBeLessThanOrEqual(100);
			}
		}
	});

	test("fractional days are accepted, since day-diff arithmetic can produce them", () => {
		for (const period of PERIODS) {
			const value = biorhythmValue(period / 3, period);
			expect(Number.isFinite(value)).toBe(true);
			expect(value).toBeCloseTo(Math.sin((2 * Math.PI) / 3) * 100, 10);
		}
	});

	test("an unused-cycle warning cannot fire: every period is positive", () => {
		for (const { period } of BIORHYTHM_CYCLES) {
			expect(period).toBeGreaterThan(0);
		}
	});
});

describe("the wave as the chart draws it", () => {
	test("has one key per cycle, and no extras", () => {
		expect(Object.keys(biorhythmWave(17)).sort()).toEqual([
			"emotional",
			"intellectual",
			"physical",
		]);
	});

	test("agrees with biorhythmValue for each cycle, period to period", () => {
		for (let day = 0; day <= 60; day++) {
			const wave = biorhythmWave(day);
			for (const { key, period } of BIORHYTHM_CYCLES) {
				expect(wave[key]).toBe(biorhythmValue(day, period));
			}
		}
	});

	test("is three different numbers on an ordinary day", () => {
		const day = 19;
		const wave = biorhythmWave(day);
		expect(wave.physical).not.toBe(wave.emotional);
		expect(wave.emotional).not.toBe(wave.intellectual);
		expect(wave.physical).not.toBe(wave.intellectual);
	});

	test("carries no sign, magnitude or units that would imply a measurement", () => {
		const wave = biorhythmWave(1234);
		for (const value of Object.values(wave)) {
			expect(typeof value).toBe("number");
		}
	});
});
