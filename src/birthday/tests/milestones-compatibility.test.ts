import { afterAll, describe, expect, test } from "bun:test";
import dayjs from "dayjs";
import {
	type Birthday,
	type Element,
	type RawBirthday,
	recomputeBirthdays,
} from "../birthdays";
import {
	getCompatibilityScore,
	getCompatibleElements,
	getDuplicateRecords,
	getSameNamedRecords,
	getScoreColor,
	isSameRecord,
} from "../compatibility";

/**
 * These tests exercise the milestone tables and the compatibility matrix.
 *
 * `getMilestoneInfo` and the `BIG_BIRTHDAYS` / `WEDDING_MILESTONES` tables are
 * module-private, so they are driven through the only public door that reaches
 * them: `recomputeBirthdays()`. That means stubbing `localStorage` (which
 * `getRawBirthdays` consults before falling back to the bundled JSON) and
 * deriving birth dates relative to `dayjs()` so that `age` is exactly the
 * value under test.
 *
 * A birthday that is *today* is the milestone day itself (`isToday === true`,
 * `nextAge === age`). A birthday one day short of the anniversary is always in
 * the past, which pushes `nextBirthday` into next year and makes
 * `nextAge === age + 1`. That gives direct control over both `isToday` and
 * the `age` / `nextAge` pair.
 */

type Kind = "♂️" | "♀️" | "💒";

const BIRTHDAY_KIND: Kind = "♀️";

/** Birthday landing exactly on `dayjs()` -> `isToday === true`. */
const onToday = (age: number): string =>
	dayjs().subtract(age, "year").format("YYYY-MM-DD");

/** Birthday one day short of the anniversary -> `isToday === false`, `nextAge === age + 1`. */
const justBefore = (age: number): string =>
	dayjs().subtract(age, "year").subtract(1, "day").format("YYYY-MM-DD");

/**
 * `localStorage` stub so `getRawBirthdays()` returns only what we seed.
 * Bun has no `localStorage` by default, so `getRawBirthdays` would otherwise
 * fall back to the bundled 33-entry `birthdays.json`.
 */
const withRecords = <T>(
	records: RawBirthday[],
	fn: (list: Birthday[]) => T,
): T => {
	const store = new Map<string, string>();
	store.set("custom_birthdays_data", JSON.stringify(records));
	const stub: Storage = {
		get length() {
			return store.size;
		},
		clear: () => store.clear(),
		getItem: (k) => store.get(k) ?? null,
		key: () => null,
		removeItem: (k) => store.delete(k),
		setItem: (k, v) => {
			store.set(k, v);
		},
	};

	const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
	Object.defineProperty(globalThis, "localStorage", {
		value: stub,
		configurable: true,
		writable: true,
	});
	try {
		return fn(recomputeBirthdays());
	} finally {
		if (previous) Object.defineProperty(globalThis, "localStorage", previous);
		else Reflect.deleteProperty(globalThis, "localStorage");
	}
};

// The module-level `birthdays` binding is shared; put it back to the bundled
// data once this file is done so other test files are not affected.
afterAll(() => {
	recomputeBirthdays();
});

const only = (records: RawBirthday[]): Birthday => {
	const list = withRecords(records, (l) => l);
	expect(list).toHaveLength(1);
	const first = list[0];
	if (!first) throw new Error("expected exactly one birthday");
	return first;
};

/** Re-declared here exactly as the source declares them, so drift is visible. */
const BIG_BIRTHDAYS = [
	1, 5, 10, 13, 15, 16, 18, 20, 21, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95,
	100,
];
const WEDDING_YEARS = [1, 5, 10, 15, 20, 25, 30, 40, 50, 60];
const WEDDING_MATERIALS: Record<number, string> = {
	1: "paper",
	5: "wood",
	10: "tin",
	15: "crystal",
	20: "china",
	25: "silver",
	30: "pearl",
	40: "ruby",
	50: "gold",
	60: "diamond",
};

describe("milestones - birthday table", () => {
	test("every age in BIG_BIRTHDAYS yields a milestone on the day itself", () => {
		for (const age of BIG_BIRTHDAYS) {
			const b = only([{ name: "P", date: onToday(age), kind: BIRTHDAY_KIND }]);
			expect(b.age).toBe(age);
			expect(b.milestone).toEqual({
				key: "data.milestone.birthday",
				params: { age },
			});
			expect(b.milestoneStatus).toEqual({
				key: "data.milestone.status.today",
			});
		}
	});

	test("spot-checked ages", () => {
		// 0, 1, 18, 21, 50, 100
		for (const age of [0, 1, 18, 21, 50, 100]) {
			const b = only([{ name: "P", date: onToday(age), kind: BIRTHDAY_KIND }]);
			expect(b.age).toBe(age);
			if (BIG_BIRTHDAYS.includes(age)) {
				expect(b.milestone?.params).toEqual({ age });
			} else {
				// 0 is not in the table.
				expect(b.milestone).toBeUndefined();
			}
		}
	});

	test("age 0 is not a milestone, but the upcoming 1st birthday is", () => {
		const b = only([{ name: "B", date: justBefore(0), kind: BIRTHDAY_KIND }]);
		expect(b.age).toBe(0);
		expect(b.milestone).toEqual({
			key: "data.milestone.birthday",
			params: { age: 1 },
		});
		expect(b.milestoneStatus).toEqual({
			key: "data.milestone.status.until",
			params: { diff: 1, count: 1, target: 1 },
		});
	});

	test("just below a milestone reports the right remaining count", () => {
		// age 17 -> next birthday is 18, which is itself a milestone
		const b17 = only([
			{ name: "A", date: justBefore(17), kind: BIRTHDAY_KIND },
		]);
		expect(b17.age).toBe(17);
		expect(b17.milestone).toEqual({
			key: "data.milestone.birthday",
			params: { age: 18 },
		});
		expect(b17.milestoneStatus).toEqual({
			key: "data.milestone.status.until",
			params: { diff: 1, count: 1, target: 18 },
		});

		// age 19 -> next birthday is 20, itself a milestone
		const b19 = only([
			{ name: "A", date: justBefore(19), kind: BIRTHDAY_KIND },
		]);
		expect(b19.age).toBe(19);
		expect(b19.milestone).toEqual({
			key: "data.milestone.birthday",
			params: { age: 20 },
		});
		expect(b19.milestoneStatus).toEqual({
			key: "data.milestone.status.until",
			params: { diff: 1, count: 1, target: 20 },
		});

		// age 30 -> the *current* age is a milestone and wins over nextAge 31
		const b30 = only([
			{ name: "A", date: justBefore(30), kind: BIRTHDAY_KIND },
		]);
		expect(b30.age).toBe(30);
		expect(b30.milestone).toEqual({
			key: "data.milestone.birthday",
			params: { age: 30 },
		});
		// 31 is not a milestone, so the status looks ahead to 40.
		expect(b30.milestoneStatus).toEqual({
			key: "data.milestone.status.until",
			params: { diff: 10, count: 10, target: 40 },
		});

		// age 31 -> neither 31 nor 32 is a milestone
		const b31 = only([
			{ name: "A", date: justBefore(31), kind: BIRTHDAY_KIND },
		]);
		expect(b31.age).toBe(31);
		expect(b31.milestone).toBeUndefined();
		expect(b31.milestoneStatus).toEqual({
			key: "data.milestone.status.until",
			params: { diff: 9, count: 9, target: 40 },
		});

		// age 99 -> 100 is the next milestone
		const b99 = only([
			{ name: "A", date: justBefore(99), kind: BIRTHDAY_KIND },
		]);
		expect(b99.milestone).toEqual({
			key: "data.milestone.birthday",
			params: { age: 100 },
		});
		expect(b99.milestoneStatus).toEqual({
			key: "data.milestone.status.until",
			params: { diff: 1, count: 1, target: 100 },
		});
	});

	test("the milestone day itself short-circuits to the 'today' status", () => {
		const b = only([{ name: "M", date: onToday(21), kind: BIRTHDAY_KIND }]);
		expect(b.milestone).toEqual({
			key: "data.milestone.birthday",
			params: { age: 21 },
		});
		expect(b.milestoneStatus).toEqual({
			key: "data.milestone.status.today",
		});
	});

	test("a non-milestone birthday today still reports the run-up", () => {
		const b = only([{ name: "N", date: onToday(22), kind: BIRTHDAY_KIND }]);
		expect(b.milestone).toBeUndefined();
		// 25 is the next table entry above 22.
		expect(b.milestoneStatus).toEqual({
			key: "data.milestone.status.until",
			params: { diff: 3, count: 3, target: 25 },
		});
	});

	test("beyond the largest milestone both fields are absent, never negative", () => {
		// 101 is past BIG_BIRTHDAYS' 100; nextAge 102 is not in the table either.
		const b = only([{ name: "O", date: justBefore(101), kind: BIRTHDAY_KIND }]);
		expect(b.age).toBe(101);
		expect(b.milestone).toBeUndefined();
		expect(b.milestoneStatus).toBeUndefined();

		// 150, deep past the end of the table.
		const far = only([
			{ name: "O", date: justBefore(150), kind: BIRTHDAY_KIND },
		]);
		expect(far.age).toBe(150);
		expect(far.milestone).toBeUndefined();
		expect(far.milestoneStatus).toBeUndefined();
	});

	test("`diff` in a status is never negative for any age 0..120", () => {
		for (let age = 0; age <= 120; age++) {
			for (const date of [onToday(age), justBefore(age)]) {
				const b = only([{ name: "S", date, kind: BIRTHDAY_KIND }]);
				const diff = b.milestoneStatus?.params?.diff;
				if (diff !== undefined) expect(diff).toBeGreaterThan(0);
			}
		}
	});

	test("the 100th birthday is the last one the table knows about", () => {
		const b = only([{ name: "C", date: onToday(100), kind: BIRTHDAY_KIND }]);
		expect(b.milestone).toEqual({
			key: "data.milestone.birthday",
			params: { age: 100 },
		});
		expect(b.milestoneStatus).toEqual({ key: "data.milestone.status.today" });
	});
});

describe("milestones - wedding table", () => {
	test("exactly {1,5,10,15,20,25,30,40,50,60} are wedding years", () => {
		for (const year of WEDDING_YEARS) {
			const b = only([{ name: "W", date: onToday(year), kind: "💒" }]);
			expect(b.milestone).toEqual({
				key: "data.milestone.wedding",
				params: { year, material: WEDDING_MATERIALS[year] ?? "" },
			});
			expect(b.milestoneStatus).toEqual({
				key: "data.milestone.status.today",
			});
		}
	});

	test("wedding 30 uses the wedding table, not the birthday table", () => {
		const b = only([{ name: "W", date: onToday(30), kind: "💒" }]);
		// 30 is in both tables, so only the *material* proves which one ran.
		expect(b.milestone).toEqual({
			key: "data.milestone.wedding",
			params: { year: 30, material: "pearl" },
		});
	});

	test("wedding 35 is NOT a milestone", () => {
		const b = only([{ name: "W", date: onToday(35), kind: "💒" }]);
		expect(b.age).toBe(35);
		expect(b.milestone).toBeUndefined();
		// 40 is the next wedding year.
		expect(b.milestoneStatus).toEqual({
			key: "data.milestone.status.until",
			params: { diff: 5, count: 5, target: 40 },
		});
	});

	test("birthday-only ages 13/16/18 are not wedding years", () => {
		for (const age of [13, 16, 18]) {
			expect(BIG_BIRTHDAYS).toContain(age);
			expect(WEDDING_YEARS).not.toContain(age);

			const w = only([{ name: "W", date: onToday(age), kind: "💒" }]);
			expect(w.milestone).toBeUndefined();

			const b = only([{ name: "B", date: onToday(age), kind: BIRTHDAY_KIND }]);
			expect(b.milestone).toEqual({
				key: "data.milestone.birthday",
				params: { age },
			});
		}
	});

	test("the kind selects the table, not the shared ages", () => {
		// 50 is in both tables. Same day, different kind.
		const w = only([{ name: "W", date: onToday(50), kind: "💒" }]);
		expect(w.milestone?.key).toBe("data.milestone.wedding");
		expect(w.milestone?.params?.material).toBe("gold");

		const g = only([{ name: "G", date: onToday(50), kind: "♂️" }]);
		expect(g.milestone?.key).toBe("data.milestone.birthday");
		expect(g.milestone?.params).toEqual({ age: 50 });
	});

	test("wedding 0 is not an anniversary; the upcoming 1st one is", () => {
		const b = only([{ name: "W", date: justBefore(0), kind: "💒" }]);
		expect(b.age).toBe(0);
		expect(b.milestone).toEqual({
			key: "data.milestone.wedding",
			params: { year: 1, material: "paper" },
		});
		expect(b.milestoneStatus).toEqual({
			key: "data.milestone.status.until",
			params: { diff: 1, count: 1, target: 1 },
		});
	});

	test("wedding 61 has no milestone and no status (past the last anniversary)", () => {
		const b = only([{ name: "W", date: justBefore(61), kind: "💒" }]);
		expect(b.age).toBe(61);
		expect(b.milestone).toBeUndefined();
		expect(b.milestoneStatus).toBeUndefined();
	});

	test("wedding statuses are never negative across 0..80", () => {
		for (let year = 0; year <= 80; year++) {
			for (const date of [onToday(year), justBefore(year)]) {
				const b = only([{ name: "W", date, kind: "💒" }]);
				const diff = b.milestoneStatus?.params?.diff;
				if (diff !== undefined) expect(diff).toBeGreaterThan(0);
			}
		}
	});
});

describe("zodiac Element assignment", () => {
	const cases: { date: string; sign: string; element: Element }[] = [
		// `getSign` uses a 0-based month, so the declared points land on the
		// conventional boundaries: aries 221 -> 21 March, capricorn 1122 -> 22 Dec.
		//
		// The table's trailing catch-all entry is `{ point: 0, name:
		// "sagittarius" }`, not Capricorn: 1-19 January belongs to Sagittarius,
		// which the table already covers from 22 November and must wrap back
		// into January. Naming it Capricorn reported 19 days a year with the
		// wrong sign AND the wrong element (earth instead of fire), and that
		// element feeds straight into getCompatibilityScore.
		{ date: "1990-01-01", sign: "sagittarius", element: "fire" },
		{ date: "1990-01-19", sign: "sagittarius", element: "fire" },
		{ date: "1990-01-20", sign: "aquarius", element: "air" },
		{ date: "1990-02-19", sign: "pisces", element: "water" },
		{ date: "1990-03-20", sign: "pisces", element: "water" },
		{ date: "1990-03-21", sign: "aries", element: "fire" },
		{ date: "1990-04-20", sign: "taurus", element: "earth" },
		{ date: "1990-05-21", sign: "gemini", element: "air" },
		{ date: "1990-06-22", sign: "cancer", element: "water" },
		{ date: "1990-07-23", sign: "leo", element: "fire" },
		{ date: "1990-08-23", sign: "virgo", element: "earth" },
		{ date: "1990-09-23", sign: "libra", element: "air" },
		{ date: "1990-10-23", sign: "scorpio", element: "water" },
		{ date: "1990-11-22", sign: "sagittarius", element: "fire" },
		{ date: "1990-12-21", sign: "sagittarius", element: "fire" },
		{ date: "1990-12-22", sign: "capricorn", element: "earth" },
	];

	for (const c of cases) {
		test(`${c.date} -> ${c.sign} / ${c.element}`, () => {
			const b = only([{ name: "Z", date: c.date, kind: BIRTHDAY_KIND }]);
			expect(`${b.sign}`).toBe(c.sign);
			expect(b.element).toBe(c.element);
		});
	}

	test("1-19 January is reported as sagittarius, not capricorn", () => {
		// Regression guard. The `signs` table's last entry used to be a
		// duplicate `{ point: 0, name: "capricorn" }`. Because `getSign` returns
		// the first entry with `point <= point`, every January date before
		// Aquarius' 20 (points 1..19) fell through to that duplicate and was
		// reported as Capricorn - the wrong sign and the wrong element, which
		// then feeds getCompatibilityScore.
		for (const day of [1, 5, 10, 19]) {
			const date = `1990-01-${String(day).padStart(2, "0")}`;
			const b = only([{ name: "J", date, kind: BIRTHDAY_KIND }]);
			expect(`${date}:${b.sign}/${b.element}`).toBe(`${date}:sagittarius/fire`);
		}
	});

	test("every sign is reachable and all four elements occur", () => {
		const seen = new Set<string>();
		const elements = new Set<Element>();
		for (let month = 1; month <= 12; month++) {
			for (const day of [1, 10, 19, 20, 21, 22, 23, 24, 28]) {
				const date = `1990-${String(month).padStart(2, "0")}-${String(
					day,
				).padStart(2, "0")}`;
				const b = only([{ name: "Z", date, kind: BIRTHDAY_KIND }]);
				seen.add(b.sign);
				elements.add(b.element);
			}
		}
		expect(seen.size).toBe(12);
		expect([...elements].sort()).toEqual(["air", "earth", "fire", "water"]);
	});
});

describe("getCompatibilityScore", () => {
	// Two real records per element, so the matrix diagonal compares two
	// *different* people rather than tripping the name short-circuit.
	const DATES: Record<Element, [string, string]> = {
		fire: ["1990-03-21", "1990-07-23"], // aries, leo
		air: ["1990-05-21", "1990-09-23"], // gemini, libra
		earth: ["1990-04-20", "1990-08-23"], // taurus, virgo
		water: ["1990-02-19", "1990-10-23"], // pisces, scorpio
	};

	const seeds = (): Record<Element, [Birthday, Birthday]> => {
		const raw: RawBirthday[] = [];
		for (const element of ["fire", "air", "earth", "water"] as const) {
			const [d0, d1] = DATES[element];
			raw.push({ name: `${element}-0`, date: d0, kind: BIRTHDAY_KIND });
			raw.push({ name: `${element}-1`, date: d1, kind: BIRTHDAY_KIND });
		}
		const out = {} as Record<Element, [Birthday, Birthday]>;
		for (const b of withRecords(raw, (l) => l)) {
			const slot = out[b.element];
			if (slot) slot[1] = b;
			else out[b.element] = [b, b];
		}
		return out;
	};

	const four = (): Record<Element, Birthday> => {
		const s = seeds();
		const out = {} as Record<Element, Birthday>;
		for (const element of ["fire", "air", "earth", "water"] as const) {
			out[element] = s[element][0];
		}
		return out;
	};

	test("the seed records really carry the four elements", () => {
		const r = four();
		expect(r.fire?.name).toBe("fire-0");
		expect(r.fire?.element).toBe("fire");
		expect(r.air?.element).toBe("air");
		expect(r.earth?.element).toBe("earth");
		expect(r.water?.element).toBe("water");
	});

	const EXPECTED: Record<Element, Record<Element, number>> = {
		fire: { fire: 80, air: 100, earth: 50, water: 40 },
		air: { fire: 100, air: 80, earth: 40, water: 50 },
		earth: { fire: 50, air: 40, earth: 80, water: 100 },
		water: { fire: 40, air: 50, earth: 100, water: 80 },
	};
	const ELEMENTS: Element[] = ["fire", "air", "earth", "water"];

	test("the full 4x4 matrix has the expected values", () => {
		const s = seeds();
		for (const a of ELEMENTS) {
			for (const b of ELEMENTS) {
				// Off-diagonal uses [0]/[0]; the diagonal uses [0]/[1] so the two
				// records really are different people.
				const ra = s[a][0];
				const rb = s[b][a === b ? 1 : 0];
				const score = getCompatibilityScore(ra, rb);
				expect(`${a}/${b}=${score}`).toBe(`${a}/${b}=${EXPECTED[a][b]}`);
			}
		}
	});

	test("the matrix is symmetric", () => {
		const s = seeds();
		for (const a of ELEMENTS) {
			for (const b of ELEMENTS) {
				expect(getCompatibilityScore(s[a][0], s[b][a === b ? 1 : 0])).toBe(
					getCompatibilityScore(s[b][0], s[a][b === a ? 1 : 0]),
				);
			}
		}
	});

	test("the same element scores 80 between two distinct people", () => {
		const s = seeds();
		expect(getCompatibilityScore(s.fire[0], s.fire[1])).toBe(80);
		expect(getCompatibilityScore(s.water[0], s.water[1])).toBe(80);
	});

	test("opposing elements are the worst pairing (40)", () => {
		const r = four();
		expect(getCompatibilityScore(r.fire, r.water)).toBe(40);
		expect(getCompatibilityScore(r.earth, r.air)).toBe(40);
	});

	test("a record compared with itself returns 100", () => {
		const r = four();
		// Not 80: identity wins before the element check.
		expect(getCompatibilityScore(r.fire, r.fire)).toBe(100);
	});

	test("two distinct people sharing a name are scored on their elements", () => {
		// DEFECT (fixed): the identity check used to be `a.name === b.name`, so
		// two different people called "Alex" scored 100 — a fabricated perfect
		// match — even though fire vs water is the worst pairing (40).
		const list = withRecords(
			[
				{ name: "Alex", date: "1990-03-21", kind: BIRTHDAY_KIND },
				{ name: "Alex", date: "1990-10-23", kind: BIRTHDAY_KIND },
			],
			(l) => l,
		);
		expect(list.map((b) => b.element).sort()).toEqual(["fire", "water"]);
		const [a, b] = list;
		if (!a || !b) throw new Error("missing");
		expect(isSameRecord(a, b)).toBe(false);
		expect(getCompatibilityScore(a, b)).toBe(40);
		expect(getCompatibilityScore(b, a)).toBe(40);
	});

	test("name comparison is case-sensitive", () => {
		const list = withRecords(
			[
				{ name: "Alex", date: "1990-03-21", kind: BIRTHDAY_KIND },
				{ name: "alex", date: "1990-10-23", kind: BIRTHDAY_KIND },
			],
			(l) => l,
		);
		const [a, b] = list;
		if (!a || !b) throw new Error("missing");
		expect(isSameRecord(a, b)).toBe(false);
		expect(getCompatibilityScore(a, b)).toBe(40);
	});
});

describe("record identity", () => {
	/**
	 * Two same-named people on different dates, plus a same-name/same-date
	 * duplicate. `recomputeBirthdays` re-sorts by upcoming birthday, so the
	 * tests below select by (name, date) rather than by index.
	 */
	const twoAlexesAndADuplicate = (): Birthday[] =>
		withRecords(
			[
				{ name: "Alex", date: "1990-03-21", kind: BIRTHDAY_KIND },
				{ name: "Alex", date: "1990-10-23", kind: BIRTHDAY_KIND },
				{ name: "Alex", date: "1990-03-21", kind: BIRTHDAY_KIND },
				{ name: "Bo", date: "1990-05-21", kind: BIRTHDAY_KIND },
			],
			(l) => l,
		);

	const pick = (list: Birthday[], name: string, date: string): Birthday => {
		const hit = list.find((b) => b.name === name && b.birthdayString === date);
		if (!hit) throw new Error(`no record for ${name} ${date}`);
		return hit;
	};

	const dates = (list: Birthday[]): string[] =>
		list.map((b) => b.birthdayString).sort();

	test("identity is the exact (name, birthdayString) pair", () => {
		const list = twoAlexesAndADuplicate();
		const aries = pick(list, "Alex", "1990-03-21");
		// Same name, different date -> two people.
		expect(isSameRecord(aries, pick(list, "Alex", "1990-10-23"))).toBe(false);
		// Same name, same date -> the data model cannot tell them apart.
		expect(isSameRecord(aries, pick(list, "Alex", "1990-03-21"))).toBe(true);
		// Different name -> different people.
		expect(isSameRecord(aries, pick(list, "Bo", "1990-05-21"))).toBe(false);
		// Reflexive.
		expect(isSameRecord(aries, aries)).toBe(true);
	});

	test("isSameRecord ignores kind", () => {
		// A person's kind is a user-editable classification, not part of who
		// they are: re-filing an entry must not fork their identity.
		const [a, b] = withRecords(
			[
				{ name: "Alex", date: "1990-03-21", kind: "♀️" },
				{ name: "Alex", date: "1990-03-21", kind: "💒" },
			],
			(l) => l,
		);
		if (!a || !b) throw new Error("missing");
		expect(a.kind).not.toBe(b.kind);
		expect(isSameRecord(a, b)).toBe(true);
	});

	test("a true duplicate row is not reported as a perfect match", () => {
		// Two distinct rows sharing name AND date. The data model has no id,
		// so this pair is ambiguous: one person entered twice, or two people
		// the data does not distinguish. Neither 100 ("same person") nor 40
		// ("incompatible") is supportable, so the pair falls through to the
		// element matrix, which claims only what the rows literally share.
		const list = withRecords(
			[
				{ name: "Alex", date: "1990-03-21", kind: BIRTHDAY_KIND },
				{ name: "Alex", date: "1990-03-21", kind: BIRTHDAY_KIND },
			],
			(l) => l,
		);
		const [a, b] = list;
		if (!a || !b) throw new Error("missing");
		expect(a).not.toBe(b);
		expect(isSameRecord(a, b)).toBe(true);
		expect(getCompatibilityScore(a, b)).not.toBe(100);
		expect(getCompatibilityScore(a, b)).toBe(80);
		// Symmetric: the ambiguity does not depend on argument order.
		expect(getCompatibilityScore(b, a)).toBe(getCompatibilityScore(a, b));
	});

	test("getSameNamedRecords finds the other people, not the record or its duplicates", () => {
		const list = twoAlexesAndADuplicate();
		const aries = pick(list, "Alex", "1990-03-21");
		// The Scorpio "Alex" only: the record itself and the exact duplicate
		// are excluded, otherwise the UI would call a row its own namesake.
		expect(dates(getSameNamedRecords(list, aries))).toEqual(["1990-10-23"]);
		// A uniquely-named record has no namesakes.
		expect(getSameNamedRecords(list, pick(list, "Bo", "1990-05-21"))).toEqual(
			[],
		);
	});

	test("getDuplicateRecords finds rows indistinguishable from the record", () => {
		const list = twoAlexesAndADuplicate();
		const aries = pick(list, "Alex", "1990-03-21");
		expect(dates(getDuplicateRecords(list, aries))).toEqual(["1990-03-21"]);
		// The Scorpio "Alex" is a namesake, not a duplicate of anything.
		expect(getDuplicateRecords(list, pick(list, "Alex", "1990-10-23"))).toEqual(
			[],
		);
		expect(getDuplicateRecords(list, pick(list, "Bo", "1990-05-21"))).toEqual(
			[],
		);
	});

	test("getDuplicateRecords never reports the record as its own duplicate", () => {
		for (const record of twoAlexesAndADuplicate()) {
			expect(
				getDuplicateRecords(twoAlexesAndADuplicate(), record),
			).not.toContain(record);
		}
	});
});

describe("compatibility helpers", () => {
	test("getCompatibleElements groups fire/air and earth/water", () => {
		expect(getCompatibleElements("fire")).toEqual(["fire", "air"]);
		expect(getCompatibleElements("air")).toEqual(["fire", "air"]);
		expect(getCompatibleElements("earth")).toEqual(["earth", "water"]);
		expect(getCompatibleElements("water")).toEqual(["earth", "water"]);
	});

	test("getScoreColor buckets the matrix values", () => {
		expect(getScoreColor(100)).toBe("#52c41a");
		expect(getScoreColor(80)).toBe("#a0d911");
		expect(getScoreColor(50)).toBe("#faad14");
		expect(getScoreColor(40)).toBe("#f5222d");
	});
});
