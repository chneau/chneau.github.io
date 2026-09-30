import { describe, expect, test } from "bun:test";
import type { Birthday } from "../birthdays";
import en from "../locales/en.json";

/**
 * Zodiac, birthgem, moon-phase and life-path arithmetic.
 *
 * `getSign`, `getBirthgem`, `getMoonPhase` and `getLifePath` are all private to
 * `birthdays.ts`, but every one of them is a pure function of the *birth date
 * only*, and `recomputeBirthdays()` copies their results verbatim onto each
 * `Birthday` (`sign`, `signSymbol`, `element`, `birthgem`, `birthgemEmoji`,
 * `moonPhase`, `moonPhaseIcon`, `lifePathNumber`, `lifePathMeaning`). So the only
 * date-dependent noise in a row - age, countdown, next birthday - is irrelevant
 * here, and the whole thing is driven through the existing public entry points.
 *
 * The month index is the load-bearing detail in all of it. `Date#getMonth()` is
 * 0-based, so the zodiac table's `month * 100 + day` cusps all sit one month
 * lower than a human reading of "March 21" would suggest: the table's `221` is
 * really 21 February, not 21 March. Every assertion below pins an exact day on
 * each side of all 12 cusps, because an off-by-one in that encoding is silent -
 * it still returns *a* sign, just the neighbouring one.
 */

// Widened to `string[]` on purpose: the app narrows these to literal unions,
// which makes `expect(keys).toContain(value)` and template-built expectations
// fight the compiler instead of the runtime.
const ZODIAC_KEYS: string[] = Object.keys(en.data.zodiac);
const BIRTHGEM_KEYS: string[] = Object.keys(en.data.birthgems);
const ELEMENT_KEYS: string[] = Object.keys(en.data.elements);
const MOON_PHASE_KEYS: string[] = Object.keys(en.data.moon_phases);
const LIFE_PATH_KEYS: string[] = Object.keys(en.data.life_path);

/**
 * `birthdays.ts` reads its raw list from `localStorage` and falls back to the
 * bundled `birthdays.json` when there is no `localStorage` at all, which is the
 * case under `bun test`. Installing a stub before the module is imported is what
 * lets a test feed in its own dates through the existing store.
 */
const STORAGE_KEY = "custom_birthdays_data";
const store = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => {
		store.set(key, String(value));
	},
	removeItem: (key: string) => {
		store.delete(key);
	},
	clear: () => store.clear(),
	key: () => null,
	length: 0,
} as unknown as Storage;

const { recomputeBirthdays } = await import("../birthdays");

/** Both sides of all 12 cusps, in calendar order. */
const CUSPS: { date: string; name: string; symbol: string; element: string }[] =
	[
		// 1-19 January belongs to Sagittarius, which the table reaches from
		// 22 November and must wrap back around into. The wrap entry used to
		// name Capricorn, reporting 19 days a year with the wrong sign AND the
		// wrong element.
		{ date: "2000-01-19", name: "sagittarius", symbol: "♐", element: "fire" },
		{ date: "2000-01-20", name: "aquarius", symbol: "♒", element: "air" },
		{ date: "2000-02-18", name: "aquarius", symbol: "♒", element: "air" },
		{ date: "2000-02-19", name: "pisces", symbol: "♓", element: "water" },
		{ date: "2000-03-20", name: "pisces", symbol: "♓", element: "water" },
		{ date: "2000-03-21", name: "aries", symbol: "♈", element: "fire" },
		{ date: "2000-04-19", name: "aries", symbol: "♈", element: "fire" },
		{ date: "2000-04-20", name: "taurus", symbol: "♉", element: "earth" },
		{ date: "2000-05-20", name: "taurus", symbol: "♉", element: "earth" },
		{ date: "2000-05-21", name: "gemini", symbol: "♊", element: "air" },
		{ date: "2000-06-21", name: "cancer", symbol: "♋", element: "water" },
		{ date: "2000-06-22", name: "cancer", symbol: "♋", element: "water" },
		{ date: "2000-07-22", name: "cancer", symbol: "♋", element: "water" },
		{ date: "2000-07-23", name: "leo", symbol: "♌", element: "fire" },
		{ date: "2000-08-22", name: "leo", symbol: "♌", element: "fire" },
		{ date: "2000-08-23", name: "virgo", symbol: "♍", element: "earth" },
		{ date: "2000-09-22", name: "virgo", symbol: "♍", element: "earth" },
		{ date: "2000-09-23", name: "libra", symbol: "♎", element: "air" },
		{ date: "2000-10-22", name: "libra", symbol: "♎", element: "air" },
		{ date: "2000-10-23", name: "scorpio", symbol: "♏", element: "water" },
		{ date: "2000-11-21", name: "scorpio", symbol: "♏", element: "water" },
		{ date: "2000-11-22", name: "sagittarius", symbol: "♐", element: "fire" },
		{ date: "2000-12-21", name: "sagittarius", symbol: "♐", element: "fire" },
		{ date: "2000-12-22", name: "capricorn", symbol: "♑", element: "earth" },
	];

/** Birthgems, in `Date#getMonth()` order (index 0 = January). */
const BIRTHGEMS: { month: number; key: string; emoji: string }[] = [
	{ month: 1, key: "garnet", emoji: "🔴" },
	{ month: 2, key: "amethyst", emoji: "🟣" },
	{ month: 3, key: "aquamarine", emoji: "🔵" },
	{ month: 4, key: "diamond", emoji: "💎" },
	{ month: 5, key: "emerald", emoji: "🟢" },
	{ month: 6, key: "alexandrite", emoji: "🟣" },
	{ month: 7, key: "ruby", emoji: "🔴" },
	{ month: 8, key: "peridot", emoji: "🟢" },
	{ month: 9, key: "sapphire", emoji: "🔵" },
	{ month: 10, key: "opal", emoji: "⚪" },
	{ month: 11, key: "citrine", emoji: "🟡" },
	{ month: 12, key: "tanzanite", emoji: "🔵" },
];

/**
 * Exact moon phases for 31 consecutive days from 2001-01-01. One lunation is
 * 29.53 days, so this window brackets a full cycle and must touch all eight
 * phases. Hard-coded on purpose: a snapshot is what catches a change in the
 * Julian-day offset, which a "returns something" assertion never would.
 */
const MOON_CYCLE: [string, string, string][] = [
	["2001-01-01", "waxing_crescent", "🌒"],
	["2001-01-02", "first_quarter", "🌓"],
	["2001-01-03", "first_quarter", "🌓"],
	["2001-01-04", "first_quarter", "🌓"],
	["2001-01-05", "waxing_gibbous", "🌔"],
	["2001-01-06", "waxing_gibbous", "🌔"],
	["2001-01-07", "waxing_gibbous", "🌔"],
	["2001-01-08", "waxing_gibbous", "🌔"],
	["2001-01-09", "full_moon", "🌕"],
	["2001-01-10", "full_moon", "🌕"],
	["2001-01-11", "full_moon", "🌕"],
	["2001-01-12", "full_moon", "🌕"],
	["2001-01-13", "waning_gibbous", "🌖"],
	["2001-01-14", "waning_gibbous", "🌖"],
	["2001-01-15", "waning_gibbous", "🌖"],
	["2001-01-16", "last_quarter", "🌗"],
	["2001-01-17", "last_quarter", "🌗"],
	["2001-01-18", "last_quarter", "🌗"],
	["2001-01-19", "last_quarter", "🌗"],
	["2001-01-20", "waning_crescent", "🌘"],
	["2001-01-21", "waning_crescent", "🌘"],
	["2001-01-22", "waning_crescent", "🌘"],
	["2001-01-23", "waning_crescent", "🌘"],
	["2001-01-24", "new_moon", "🌑"],
	["2001-01-25", "new_moon", "🌑"],
	["2001-01-26", "new_moon", "🌑"],
	["2001-01-27", "waxing_crescent", "🌒"],
	["2001-01-28", "waxing_crescent", "🌒"],
	["2001-01-29", "waxing_crescent", "🌒"],
	["2001-01-30", "waxing_crescent", "🌒"],
	["2001-01-31", "first_quarter", "🌓"],
];

/**
 * Replace the stored list with exactly `dates`, recompute, and return the
 * derived rows keyed by `birthdayString`.
 */
const derive = (dates: string[]): Map<string, Birthday> => {
	store.set(
		STORAGE_KEY,
		JSON.stringify(dates.map((date) => ({ name: date, date, kind: "♀️" }))),
	);
	const byDate = new Map<string, Birthday>();
	for (const row of recomputeBirthdays()) {
		byDate.set(row.birthdayString, row);
	}
	for (const date of dates) {
		if (!byDate.has(date)) throw new Error(`No row produced for ${date}`);
	}
	return byDate;
};

/** Derive a single date and hand back its row, failing loudly if absent. */
const rowFor = (date: string): Birthday => {
	const row = derive([date]).get(date);
	if (!row) throw new Error(`No row produced for ${date}`);
	return row;
};

const isoDaysFrom = (start: string, count: number): string[] => {
	const base = new Date(`${start}T00:00:00Z`).getTime();
	return Array.from({ length: count }, (_, i) =>
		new Date(base + i * 86_400_000).toISOString().slice(0, 10),
	);
};

describe("getSign zodiac cusps", () => {
	test("both sides of all 12 cusps resolve to the documented sign", () => {
		const rows = derive(CUSPS.map((x) => x.date));
		for (const expected of CUSPS) {
			const row = rows.get(expected.date);
			if (!row) throw new Error(`missing ${expected.date}`);
			expect([expected.date, row.sign, row.signSymbol, row.element]).toEqual([
				expected.date,
				expected.name,
				expected.symbol,
				expected.element,
			]);
		}
	});

	test("every sign name, symbol and element is a real i18n key", () => {
		const rows = derive(CUSPS.map((x) => x.date));
		const seen = new Set<string>();
		for (const row of rows.values()) {
			expect(ZODIAC_KEYS).toContain(row.sign);
			expect(ELEMENT_KEYS).toContain(row.element);
			expect(en.data.zodiac[row.sign]).toBeDefined();
			expect(row.signSymbol).not.toBe("");
			seen.add(row.sign);
		}
		// 24 dates spread over the year reach every one of the 12 signs.
		expect(seen.size).toBe(12);
	});

	test("each cusp is a hard cut between two different signs", () => {
		const rows = derive(CUSPS.map((x) => x.date));
		for (let i = 0; i + 1 < CUSPS.length; i += 2) {
			const before = CUSPS[i];
			const after = CUSPS[i + 1];
			if (!before || !after) continue;
			expect([before.date, rows.get(before.date)?.sign]).not.toEqual([
				after.date,
				rows.get(after.date)?.sign,
			]);
		}
	});
});

describe("getSign year wrap", () => {
	test("the year wraps from Capricorn back to Sagittarius", () => {
		const rows = derive([
			"2000-01-01",
			"2000-12-31",
			"2000-12-22",
			"2000-01-19",
		]);
		expect([
			rows.get("2000-01-01")?.sign,
			rows.get("2000-12-31")?.sign,
			rows.get("2000-12-22")?.sign,
			rows.get("2000-01-19")?.sign,
		]).toEqual(["sagittarius", "capricorn", "capricorn", "sagittarius"]);
	});

	test("the wrap entry carries Sagittarius' symbol and element, not Capricorn's", () => {
		const rows = derive(["2000-01-19", "2000-12-22"]);
		const january = rows.get("2000-01-19");
		const december = rows.get("2000-12-22");
		expect([january?.signSymbol, december?.signSymbol]).toEqual(["♐", "♑"]);
		expect([january?.element, december?.element]).toEqual(["fire", "earth"]);
	});

	test("19/20 December is interior to Sagittarius, not the wrap", () => {
		const rows = derive(["2000-12-18", "2000-12-19", "2000-12-20"]);
		expect([
			rows.get("2000-12-18")?.sign,
			rows.get("2000-12-19")?.sign,
			rows.get("2000-12-20")?.sign,
		]).toEqual(["sagittarius", "sagittarius", "sagittarius"]);
	});

	test("December 22 is the real Capricorn cusp, and it holds to the 31st", () => {
		const rows = derive(isoDaysFrom("2000-12-20", 12));
		expect(rows.get("2000-12-21")?.sign).toBe("sagittarius");
		expect(rows.get("2000-12-22")?.sign).toBe("capricorn");
		expect(rows.get("2000-12-25")?.sign).toBe("capricorn");
		expect(rows.get("2000-12-31")?.sign).toBe("capricorn");
	});

	test("the whole of 1-19 January is Sagittarius, never Capricorn", () => {
		const rows = derive([
			"2000-01-01",
			"2000-01-05",
			"2000-01-15",
			"2000-01-19",
			"2000-01-20",
		]);
		expect([
			rows.get("2000-01-01")?.sign,
			rows.get("2000-01-05")?.sign,
			rows.get("2000-01-15")?.sign,
			rows.get("2000-01-19")?.sign,
		]).toEqual(["sagittarius", "sagittarius", "sagittarius", "sagittarius"]);
		expect(rows.get("2000-01-20")?.sign).toBe("aquarius");
	});

	test("no date in a sampled year throws", () => {
		const dates = CUSPS.map((x) => x.date).concat([
			"2000-06-15",
			"2000-12-25",
			"2000-12-31",
		]);
		const rows = derive(dates);
		expect(rows.size).toBe(dates.length);
	});
});

describe("month index is 0-based January", () => {
	test("January is month 1 and December is month 12", () => {
		const rows = derive(["2000-01-05", "2000-12-05"]);
		expect(rows.get("2000-01-05")?.month).toBe(1);
		expect(rows.get("2000-01-05")?.monthName).toBe("jan");
		expect(rows.get("2000-12-05")?.month).toBe(12);
		expect(rows.get("2000-12-05")?.monthName).toBe("dec");
	});

	test("1 January gets January's gem and 31 December gets December's", () => {
		expect(rowFor("2000-01-01").birthgem).toBe("garnet");
		expect(rowFor("2000-12-31").birthgem).toBe("tanzanite");
		expect(rowFor("2000-01-01").birthgem).not.toBe(
			rowFor("2000-12-31").birthgem,
		);
	});

	test("the day component is not shifted either", () => {
		const rows = derive(["2000-01-01", "2000-01-31"]);
		expect(rows.get("2000-01-01")?.day).toBe(1);
		expect(rows.get("2000-01-31")?.day).toBe(31);
	});
});

describe("getBirthgem", () => {
	test("all 12 months map to their gem, emoji included", () => {
		const dates = BIRTHGEMS.map(
			(x) => `2000-${String(x.month).padStart(2, "0")}-15`,
		);
		const rows = derive(dates);
		for (const expected of BIRTHGEMS) {
			const date = `2000-${String(expected.month).padStart(2, "0")}-15`;
			const row = rows.get(date);
			if (!row) throw new Error(`missing ${date}`);
			expect([expected.month, row.birthgem, row.birthgemEmoji]).toEqual([
				expected.month,
				expected.key,
				expected.emoji,
			]);
			expect(BIRTHGEM_KEYS).toContain(row.birthgem);
		}
	});

	test("the gem depends on the month only, never the day", () => {
		const rows = derive(["2000-04-01", "2000-04-15", "2000-04-30"]);
		expect([
			rows.get("2000-04-01")?.birthgem,
			rows.get("2000-04-15")?.birthgem,
			rows.get("2000-04-30")?.birthgem,
		]).toEqual(["diamond", "diamond", "diamond"]);
	});

	test("January and February return different gems (off-by-one guard)", () => {
		const rows = derive(["2000-01-10", "2000-02-10"]);
		const january = rows.get("2000-01-10");
		const february = rows.get("2000-02-10");
		expect(january?.birthgem).toBe("garnet");
		expect(february?.birthgem).toBe("amethyst");
		expect(january?.birthgemEmoji).not.toBe(february?.birthgemEmoji);
	});

	test("the last month does not run off the end of the table", () => {
		expect(() => derive(["2000-12-01", "2000-12-31"])).not.toThrow();
		expect(rowFor("2000-12-01").birthgem).toBe("tanzanite");
		expect(rowFor("2000-12-31").birthgem).toBe("tanzanite");
	});
});

describe("getMoonPhase", () => {
	test("day 0 of the cycle (2001-01-01) maps to a defined phase", () => {
		const row = rowFor("2001-01-01");
		expect(MOON_PHASE_KEYS).toContain(row.moonPhase);
		expect(en.data.moon_phases[row.moonPhase]).toBeDefined();
		expect(row.moonPhase).toBe("waxing_crescent");
		expect(row.moonPhaseIcon).toBe("🌒");
	});

	test("31 consecutive days reproduce the expected lunation", () => {
		const rows = derive(MOON_CYCLE.map(([date]) => date));
		for (const [date, phase, icon] of MOON_CYCLE) {
			const row = rows.get(date);
			expect([date, row?.moonPhase, row?.moonPhaseIcon]).toEqual([
				date,
				phase,
				icon,
			]);
		}
	});

	test("one full cycle visits all eight phases", () => {
		const rows = derive(MOON_CYCLE.map(([date]) => date));
		const seen = new Set([...rows.values()].map((r) => r.moonPhase));
		expect(seen.size).toBe(8);
		expect([...seen].sort() as string[]).toEqual(
			[...MOON_PHASE_KEYS].sort() as string[],
		);
	});

	test("is deterministic: recomputing the same date gives the same phase", () => {
		const date = "2001-01-09";
		const first = rowFor(date);
		const second = rowFor(date);
		const third = derive([date, "1997-06-06", "2001-01-09"]).get(date);
		expect(first.moonPhase).toBe("full_moon");
		expect([second.moonPhase, third?.moonPhase]).toEqual([
			"full_moon",
			"full_moon",
		]);
		expect([second.moonPhaseIcon, third?.moonPhaseIcon]).toEqual(["🌕", "🌕"]);
	});

	test("the phase depends on the date alone, not on the other rows", () => {
		const alone = rowFor("2001-01-16");
		const batch = derive(["1960-03-03", "2001-01-16", "2015-11-11"]).get(
			"2001-01-16",
		);
		expect(alone.moonPhase).toBe("last_quarter");
		expect(batch?.moonPhase).toBe("last_quarter");
	});

	test("the year is folded into the Julian day, so a leap day is defined", () => {
		const row = rowFor("2000-02-29");
		expect(MOON_PHASE_KEYS).toContain(row.moonPhase);
		expect(row.moonPhaseIcon).not.toBe("");
	});

	test("phases advance by at most one step per day and wrap around the cycle", () => {
		const dates = isoDaysFrom("2001-01-01", 31);
		const rows = derive(dates);
		const indices = dates.map((d) => {
			const phase = rows.get(d)?.moonPhase;
			return MOON_PHASE_KEYS.indexOf(phase ?? "");
		});
		expect(indices.every((i) => i >= 0)).toBe(true);
		// 0 new_moon .. 7 waning_crescent. A lunation is 29.53 days over 8
		// phases, so a day never advances the phase by more than one step and
		// never backwards; 7 -> 0 (waning_crescent -> new_moon) is the wrap.
		for (let i = 1; i < indices.length; i++) {
			const previous = indices[i - 1] as number;
			const current = indices[i] as number;
			const step = (current - previous + 8) % 8;
			expect([dates[i], step === 0 || step === 1]).toEqual([dates[i], true]);
		}
		// The window wraps exactly once, on 24 January.
		const wraps = indices.filter((n, i) => i > 0 && n < (indices[i - 1] ?? 0));
		expect(wraps).toEqual([0]);
		expect(dates[indices.indexOf(0)]).toBe("2001-01-24");
	});
});

describe("getLifePath", () => {
	test("digit reduction of a known date", () => {
		// 1990-05-15 -> 6 + 5 + (1+9+9+0 = 19 -> 10 -> 1) = 12 -> 3
		expect(rowFor("1990-05-15").lifePathNumber).toBe(3);
		expect(rowFor("1990-05-15").lifePathMeaning).toBe("life_path_3");
	});

	test("all nine single-digit results", () => {
		const cases: [string, number][] = [
			["1920-01-06", 1],
			["1920-06-11", 2],
			["1920-01-08", 3],
			["1920-01-09", 4],
			["1920-01-01", 5],
			["1920-01-02", 6],
			["1920-01-03", 7],
			["1920-01-04", 8],
			["1920-01-05", 9],
		];
		for (const [date, expected] of cases) {
			expect([date, rowFor(date).lifePathNumber]).toEqual([date, expected]);
		}
	});

	test("master numbers 11, 22 and 33 are not reduced further", () => {
		const cases: [string, number][] = [
			["1920-01-07", 11],
			["1920-08-11", 22],
			["1920-08-22", 33],
			["2000-03-24", 11],
			["2000-11-18", 22],
			["2000-09-22", 33],
		];
		for (const [date, expected] of cases) {
			const row = rowFor(date);
			expect([date, row.lifePathNumber]).toEqual([date, expected]);
			expect(String(row.lifePathMeaning)).toBe(`life_path_${expected}`);
			expect(LIFE_PATH_KEYS).toContain(row.lifePathMeaning);
		}
	});

	test("the meaning is always a real i18n key", () => {
		const rows = derive(isoDaysFrom("1990-01-01", 56));
		for (const row of rows.values()) {
			expect(String(row.lifePathMeaning)).toBe(
				`life_path_${row.lifePathNumber}`,
			);
			expect(LIFE_PATH_KEYS).toContain(row.lifePathMeaning);
			expect(en.data.life_path[row.lifePathMeaning]).toBeDefined();
		}
	});

	test("reduce never yields 0, 10, or a non-master value above 9", () => {
		// Two years, every single day, in one batch: 731 dates.
		const dates = isoDaysFrom("1999-01-01", 731);
		const rows = derive(dates);
		expect(rows.size).toBe(731);
		for (const row of rows.values()) {
			const n = row.lifePathNumber;
			expect(Number.isInteger(n)).toBe(true);
			const isSingleDigit = n >= 1 && n <= 9;
			const isMaster = n === 11 || n === 22 || n === 33;
			expect([row.birthdayString, isSingleDigit || isMaster]).toEqual([
				row.birthdayString,
				true,
			]);
			expect([0, 10, 12, 20, 21, 23, 30, 31, 32]).not.toContain(n);
		}
	});

	test("a 730-day stretch reaches all twelve documented outcomes", () => {
		const rows = derive(isoDaysFrom("1900-01-01", 730));
		const seen = new Set([...rows.values()].map((r) => r.lifePathNumber));
		expect([...seen].sort((a, b) => a - b)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33,
		]);
		for (const n of seen) {
			expect(LIFE_PATH_KEYS).toContain(`life_path_${n}`);
		}
	});

	test("depends only on day, month and year", () => {
		const rows = derive(["1990-05-15", "1950-05-15", "2010-05-15"]);
		for (const date of ["1990-05-15", "1950-05-15", "2010-05-15"]) {
			expect([
				date,
				rows.get(date)?.month,
				rows.get(date)?.monthName,
				rows.get(date)?.day,
			]).toEqual([date, 5, "may", 15]);
		}
	});
});
