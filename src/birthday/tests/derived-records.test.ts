import { afterAll, describe, expect, setSystemTime, test } from "bun:test";
import type { Birthday } from "../birthdays";
import { birthdaySchema, birthdays, recomputeBirthdays } from "../birthdays";

/**
 * Characterisation tests over the FULL derived `Birthday` records built from
 * the real `birthdays.json` (33 records).
 *
 * The UI silently depends on a pile of invariants that nothing enforces:
 * `nextBirthday` really is in the future, `daysBeforeBirthday` really is
 * non-negative, the list really is sorted (it *is* the countdown), and every
 * string field really is present (it is fed straight into `t()`). A single bad
 * record would not throw - it would render `undefined` or count down to a date
 * in the past.
 *
 * These tests deliberately use the real dataset, because that is where the
 * inconsistencies live: synthetic records never trip a decade boundary, a
 * leap-year progress calculation or a combined "A & B" name.
 *
 * NOTE: the reference date ("now") is NOT injectable - `computeBirthdays` is
 * not exported and reads `dayjs()` directly. The only reachable way to move the
 * clock is `bun:test`'s `setSystemTime`, which is what the date-roll tests
 * below use together with the exported `recomputeBirthdays()`.
 */

/** Real system time at import, so we can put the clock back. */
const realNow = new Date();

/** Midday on a local date: TZ-independent, and unambiguous for `startOf("day")`. */
const at = (y: number, m: number, d: number) =>
	new Date(y, m - 1, d, 12, 0, 0, 0);

const startOfToday = () => {
	const n = new Date();
	return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};

const daysBetween = (a: Date, b: Date) =>
	Math.round((b.getTime() - a.getTime()) / 86_400_000);

/** Re-implementation of the module-private per-day hash, for characterisation. */
const expectedDailyInsight = (
	name: string,
	ref: Date,
): Birthday["dailyInsight"] => {
	const today = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}-${String(
		ref.getDate(),
	).padStart(2, "0")}`;
	const str = name + today;
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}
	return `insight_${Math.abs(hash) % 15}` as Birthday["dailyInsight"];
};

/**
 * `Birthday` is built as `{ ...raw, ...derived }`, so `date` IS present at
 * runtime but was never added to the exported type. The storage layer and the
 * React keys in `Countdown.tsx` / `ManageBirthdaysModal.tsx` all read it.
 */
type DerivedRecord = Birthday & { date: string };

const records = birthdays as DerivedRecord[];

/** Everything that must survive a day roll unchanged, i.e. is NOT day-dependent. */
const TIME_INVARIANT_FIELDS = [
	"date" as const,
	"kind",
	"year",
	"month",
	"day",
	"monthName",
	"birthdayString",
	"sign",
	"signSymbol",
	"element",
	"birthgem",
	"birthgemEmoji",
	"chineseZodiac",
	"generation",
	"decade",
	"season",
	"halfBirthday",
	"halfBirthdayMonth",
	"halfBirthdayDay",
	"lifePathNumber",
	"lifePathMeaning",
	"moonPhase",
	"moonPhaseIcon",
] as const satisfies readonly (keyof DerivedRecord)[];

/** Fields the UI derives from the birth date alone and expects to never move. */
const snapshotTimeInvariant = (list: readonly Birthday[]) =>
	// sorted by name: the countdown order legitimately changes with the date,
	// only the *content* is supposed to be stable.
	[...list]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((b) => ({
			name: b.name,
			...Object.fromEntries(
				TIME_INVARIANT_FIELDS.map((f) => [f, (b as DerivedRecord)[f]]),
			),
		}));

afterAll(() => {
	setSystemTime(realNow);
	recomputeBirthdays();
});

// --- 1. Per-record internal consistency ------------------------------------

describe("every derived record is internally consistent", () => {
	test("the real dataset is the expected size", () => {
		expect(records).toHaveLength(33);
	});

	for (const b of records) {
		const id = `${b.name} (${b.birthdayString})`;

		test(`${id}: age and countdown are non-negative`, () => {
			expect(b.age).toBeGreaterThanOrEqual(0);
			expect(b.daysBeforeBirthday).toBeGreaterThanOrEqual(0);
			expect(Number.isInteger(b.age)).toBe(true);
			expect(Number.isInteger(b.daysBeforeBirthday)).toBe(true);
		});

		test(`${id}: nextBirthday is today-or-later, in the birth month/day`, () => {
			const today = startOfToday();
			expect(b.nextBirthday.getTime()).toBeGreaterThanOrEqual(today.getTime());
			expect(b.nextBirthday.getMonth() + 1).toBe(b.month);
			expect(b.nextBirthday.getDate()).toBe(b.day);
			expect(b.nextBirthday.getFullYear()).toBeGreaterThanOrEqual(b.year);
			expect(b.daysBeforeBirthday).toBe(daysBetween(today, b.nextBirthday));
		});

		test(`${id}: age units agree with each other`, () => {
			// 365 is the shortest possible year, so this must hold.
			expect(b.ageInDays).toBeGreaterThanOrEqual(b.age * 365);
			expect(b.ageInDays).toBeLessThanOrEqual((b.age + 1) * 366);
			// month diffs land in [12*age, 12*age+12)
			expect(b.ageInMonths).toBeGreaterThanOrEqual(b.age * 12);
			expect(b.ageInMonths).toBeLessThan(b.age * 12 + 12);
			expect(b.ageInWeeks).toBe(Math.floor(b.ageInDays / 7));
		});

		test(`${id}: progress is a percentage`, () => {
			expect(b.progress).toBeGreaterThanOrEqual(0);
			expect(b.progress).toBeLessThanOrEqual(100);
			expect(Number.isFinite(b.progress)).toBe(true);
			// progress counts up to the birthday, so 100 <=> today.
			if (b.daysBeforeBirthday === 0) expect(b.progress).toBe(100);
			if (b.progress === 100) expect(b.daysBeforeBirthday).toBe(0);
		});

		test(`${id}: every string field the UI renders is defined`, () => {
			for (const field of [
				"name",
				"sign",
				"signSymbol",
				"birthgem",
				"birthgemEmoji",
				"monthName",
				"chineseZodiac",
				"generation",
				"season",
				"ageGroup",
				"element",
				"decade",
				"lifePathMeaning",
				"dailyInsight",
				"moonPhase",
				"moonPhaseIcon",
				"halfBirthday",
				"halfBirthdayMonth",
				"birthdayString",
			] as const) {
				const value = b[field];
				expect(value, `${id}.${field}`).toBeDefined();
				expect(typeof value).toBe("string");
				expect((value as string).length).toBeGreaterThan(0);
			}
			expect(b.planetAges).toHaveLength(5);
			for (const p of b.planetAges) {
				expect(Number.isFinite(p.age)).toBe(true);
				expect(p.icon.length).toBeGreaterThan(0);
			}
			expect(Number.isFinite(b.heartbeats)).toBe(true);
			expect(Number.isFinite(b.breaths)).toBe(true);
			expect(Number.isFinite(b.sleepYears)).toBe(true);
			expect(Number.isFinite(b.distanceTraveled)).toBe(true);
			expect(b.lifePathNumber).toBeGreaterThan(0);
			expect(b.lifePathNumber).toBeLessThanOrEqual(33);
		});

		test(`${id}: the birth date round-trips`, () => {
			expect(b.birthdayString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(b.birthday.getFullYear()).toBe(b.year);
			expect(b.birthday.getMonth() + 1).toBe(b.month);
			expect(b.birthday.getDate()).toBe(b.day);
			// `birthdayString` is what is handed back to the storage layer, so it
			// must parse back to the very same local date.
			expect(new Date(`${b.birthdayString}T00:00:00`).getTime()).toBe(
				new Date(
					b.birthday.getFullYear(),
					b.birthday.getMonth(),
					b.birthday.getDate(),
				).getTime(),
			);
		});
	}
});

// --- 2. Ordering ------------------------------------------------------------

describe("ordering", () => {
	test("birthdays is sorted by daysBeforeBirthday ascending", () => {
		for (let i = 1; i < records.length; i++) {
			const current = records[i] as DerivedRecord;
			const previous = records[i - 1] as DerivedRecord;
			expect(current.daysBeforeBirthday).toBeGreaterThanOrEqual(
				previous.daysBeforeBirthday,
			);
		}
	});

	test("a sort this way puts the next birthday first", () => {
		const first = records[0] as DerivedRecord;
		expect(Math.min(...records.map((b) => b.daysBeforeBirthday))).toBe(
			first.daysBeforeBirthday,
		);
		expect(first.daysBeforeBirthday).toBeLessThanOrEqual(366);
	});

	test("order is stable across a recompute", () => {
		const names = recomputeBirthdays().map((b) => b.name);
		expect(names).toEqual(records.map((b) => b.name));
	});
});

// --- 3. Uniqueness ---------------------------------------------------------

describe("uniqueness", () => {
	test("no duplicate name+date pairs", () => {
		const keys = records.map((b) => `${b.name}-${b.birthdayString}`);
		expect(new Set(keys).size).toBe(keys.length);
	});

	test("no duplicate names", () => {
		const names = records.map((b) => b.name);
		expect(new Set(names).size).toBe(names.length);
	});

	test("the derived keys actually used as React keys are unique", () => {
		// Countdown.tsx uses `${name}-${birthdayString}`; ManageBirthdaysModal
		// uses `${name}-${date}`; CompatibilityMatrix keys rows by `name` alone.
		for (const keyFn of [
			(b: DerivedRecord) => `${b.name}-${b.birthdayString}`,
			(b: DerivedRecord) => `${b.name}-${b.date}`,
			(b: DerivedRecord) => `${b.name}`,
		]) {
			const keys = records.map(keyFn);
			const first = keyFn(records[0] as DerivedRecord);
			expect(new Set(keys).size, `colliding key derived from ${first}`).toBe(
				keys.length,
			);
		}
	});

	test("combined names do not collide with their individual entries", () => {
		const weddings = records.filter((b) => b.kind === "💒");
		expect(weddings.length).toBeGreaterThan(0);
		for (const w of weddings) {
			const [a, b] = w.name.split(" & ");
			expect(a?.length).toBeGreaterThan(0);
			expect(b?.length).toBeGreaterThan(0);
			// the ampersand form must not be a person too
			expect(records.some((x) => x.name === w.name && x.kind !== "💒")).toBe(
				false,
			);
		}
	});

	test("combined entries use the wedding kind and wedding age group", () => {
		for (const w of records.filter((b) => b.name.includes(" & "))) {
			expect(w.kind).toBe("💒");
			expect(w.ageGroup).toBe("weddings");
		}
	});
});

// --- 4. Determinism --------------------------------------------------------

describe("determinism", () => {
	test("computeBirthdays has no Math.random()/Date.now() leaking in", () => {
		const a = recomputeBirthdays();
		const b = recomputeBirthdays();
		// Dates do not survive a structural compare, so serialise first.
		expect(JSON.parse(JSON.stringify(b))).toEqual(
			JSON.parse(JSON.stringify(a)),
		);
		expect(b).toHaveLength(a.length);
	});

	test("dailyInsight is stable within the same day", () => {
		const a = recomputeBirthdays().map((b) => `${b.name}:${b.dailyInsight}`);
		const b = recomputeBirthdays().map((x) => `${x.name}:${x.dailyInsight}`);
		expect(b).toEqual(a);
	});

	test("dailyInsight is the documented per-day hash of name+date", () => {
		// It is `name + YYYY-MM-DD` reduced to 15 buckets - a per-day
		// reshuffle, not a property of the person.
		const today = startOfToday();
		for (const b of records) {
			expect(b.dailyInsight).toBe(expectedDailyInsight(b.name, today));
		}
	});

	test("the same people get different insights on a different day", () => {
		const today = startOfToday();
		const onToday = new Set(records.map((b) => `${b.name}:${b.dailyInsight}`));
		// 15 buckets over 33 people: a handful of days is enough to move some.
		const overDays = new Set<string>();
		for (const offset of [1, 2, 3, 4, 5, 6, 7]) {
			setSystemTime(new Date(today.getTime() + offset * 86_400_000));
			for (const b of recomputeBirthdays()) {
				overDays.add(`${b.name}:${b.dailyInsight}`);
			}
		}
		setSystemTime(today);
		recomputeBirthdays();
		expect(overDays.size).toBeGreaterThan(onToday.size);
	});
});

// --- 5. The date-roll contract --------------------------------------------

describe("the date-roll contract", () => {
	test("recomputeBirthdays() moves the countdown as the reference date moves", () => {
		const ref = at(2026, 3, 10);
		setSystemTime(ref);
		const before = recomputeBirthdays();
		const b0 = before[0] as Birthday;

		// one day later, the next birthday is one day closer
		setSystemTime(new Date(ref.getTime() + 86_400_000));
		const after = recomputeBirthdays();
		const a0 = after.find(
			(x) => x.name === b0.name && x.birthdayString === b0.birthdayString,
		);
		expect(a0).toBeDefined();
		expect(a0?.daysBeforeBirthday).toBe(b0.daysBeforeBirthday - 1);
		expect(a0?.ageInDays).toBe(b0.ageInDays + 1);
	});

	test("rolling over a birthday flips age, progress and the milestone", () => {
		// Charles, 1992-08-13: 33 on 12 Aug 2026, 34 on the 13th.
		setSystemTime(at(2026, 8, 12));
		const eve = recomputeBirthdays().find((b) => b.name === "Charles");
		expect(eve).toBeDefined();
		expect(eve?.age).toBe(33);
		expect(eve?.daysBeforeBirthday).toBe(1);
		expect(eve?.progress).toBeLessThan(100);
		expect(eve?.milestone).toBeUndefined();
		expect(eve?.milestoneStatus?.key).toBe("data.milestone.status.until");
		expect(eve?.milestoneStatus?.params?.target).toBe(40);
		expect(eve?.milestoneStatus?.params?.diff).toBe(7);

		setSystemTime(at(2026, 8, 13));
		const on = recomputeBirthdays().find((b) => b.name === "Charles");
		expect(on?.age).toBe(34);
		expect(on?.daysBeforeBirthday).toBe(0);
		expect(on?.progress).toBe(100);
		// 34 is not a milestone age, so the "6 years to 40" countdown remains.
		expect(on?.milestone).toBeUndefined();
		expect(on?.milestoneStatus?.params?.diff).toBe(6);

		setSystemTime(at(2026, 8, 14));
		const aged = recomputeBirthdays().find((b) => b.name === "Charles");
		expect(aged?.age).toBe(34);
		expect(aged?.daysBeforeBirthday).toBe(364);
		expect(aged?.ageInDays).toBe((on?.ageInDays ?? 0) + 1);
		expect(aged?.progress).toBeLessThan(1);
		expect(aged?.milestoneStatus?.params?.diff).toBe(6);
	});

	test("a milestone birthday reports `status.today` instead of a countdown", () => {
		// Martin, 1973-01-04 -> 50 in 2023, and 50 is in BIG_BIRTHDAYS.
		setSystemTime(at(2023, 1, 4));
		const on = recomputeBirthdays().find((b) => b.name === "Martin");
		expect(on?.age).toBe(50);
		expect(on?.daysBeforeBirthday).toBe(0);
		expect(on?.milestone?.key).toBe("data.milestone.birthday");
		expect(on?.milestone?.params?.age).toBe(50);
		expect(on?.milestoneStatus?.key).toBe("data.milestone.status.today");
		expect(on?.milestoneStatus?.params).toBeUndefined();
	});

	test("a full year later every record has aged exactly one year", () => {
		const ref = at(2026, 5, 7);
		setSystemTime(ref);
		const before = recomputeBirthdays();
		setSystemTime(at(2027, 5, 7));
		const after = recomputeBirthdays();
		expect(after).toHaveLength(before.length);
		for (const b of before) {
			const next = after.find(
				(x) => x.name === b.name && x.birthdayString === b.birthdayString,
			);
			expect(next?.age).toBe(b.age + 1);
			// The same distance to the next birthday - except that a year
			// containing 29 Feb (2028 here) is one day longer, so the countdown
			// is one day further away, never closer.
			const delta = (next?.daysBeforeBirthday ?? 0) - b.daysBeforeBirthday;
			expect(delta).toBeGreaterThanOrEqual(0);
			expect(delta).toBeLessThanOrEqual(1);
			// `progress` divides by the length of the next birthday's year, so
			// it drifts by a fraction of a percent when a leap day is involved.
			expect(next?.progress).toBeCloseTo(b.progress, 1);
		}
	});

	test("on the exact day the countdowns are 0 and the sort puts them first", () => {
		setSystemTime(at(2026, 8, 13));
		const list = recomputeBirthdays();
		const today = list.filter((b) => b.daysBeforeBirthday === 0);
		// Derived from the data rather than hard-coded: whoever was born on
		// 13 August must be at the top of the list.
		const expected = records
			.filter((b) => b.month === 8 && b.day === 13)
			.map((b) => b.name)
			.sort();
		expect(expected).toEqual(["Charles"]);
		expect(today.map((b) => b.name).sort()).toEqual(expected);
		expect(
			list.slice(0, today.length).every((b) => b.daysBeforeBirthday === 0),
		).toBe(true);
	});

	test("all invariants still hold on every day of two sampled years", () => {
		// Two whole years, so the sweep crosses 29 Feb 2028 and every
		// "is the next birthday in a leap year or not" branch is taken.
		const violations: string[] = [];
		for (let d = 0; d < 730; d += 1) {
			const ref = new Date(2026, 0, 1 + d, 12);
			setSystemTime(ref);
			const midnight = new Date(2026, 0, 1 + d);
			for (const b of recomputeBirthdays()) {
				const where = `${ref.toDateString()} ${b.name}`;
				if (b.age < 0) violations.push(`${where}: age ${b.age}`);
				if (b.daysBeforeBirthday < 0)
					violations.push(
						`${where}: daysBeforeBirthday ${b.daysBeforeBirthday}`,
					);
				if (b.nextBirthday.getTime() < midnight.getTime())
					violations.push(`${where}: nextBirthday in the past`);
				if (
					b.nextBirthday.getMonth() + 1 !== b.month ||
					b.nextBirthday.getDate() !== b.day
				)
					violations.push(
						`${where}: nextBirthday ${b.nextBirthday.getMonth() + 1}/${b.nextBirthday.getDate()} != ${b.month}/${b.day}`,
					);
				if (b.progress < 0 || b.progress > 100)
					violations.push(`${where}: progress ${b.progress}`);
				if (b.ageInDays < b.age * 365)
					violations.push(
						`${where}: ageInDays ${b.ageInDays} < ${b.age * 365}`,
					);
				if (b.ageInMonths < b.age * 12 || b.ageInMonths >= b.age * 12 + 12)
					violations.push(`${where}: ageInMonths ${b.ageInMonths}`);
				if (
					b.ageGroup === undefined ||
					b.season === undefined ||
					b.sign === undefined
				)
					violations.push(`${where}: missing classification field`);
			}
		}
		setSystemTime(realNow);
		recomputeBirthdays();
		expect(violations).toEqual([]);
	});

	test("fields that must not change when only the day changes", () => {
		// Everything below is a property of the birth date alone. If any of it
		// moved with "now", a table cell would flicker for no reason.
		const ref = at(2026, 3, 10);
		setSystemTime(ref);
		const before = snapshotTimeInvariant(recomputeBirthdays());
		setSystemTime(at(2026, 8, 21));
		const after = snapshotTimeInvariant(recomputeBirthdays());
		setSystemTime(ref);
		recomputeBirthdays();
		expect(after).toEqual(before);
	});
});

// --- 6. Schema round-trip ---------------------------------------------------

describe("every record survives birthdaySchema", () => {
	for (const b of records) {
		test(`${b.name} (${b.date})`, () => {
			const result = birthdaySchema.safeParse({
				name: b.name,
				date: b.birthdayString,
				kind: b.kind,
			});
			if (!result.success) {
				throw new Error(`${b.name}: ${result.error.message}`);
			}
			expect(result.data).toEqual({
				name: b.name,
				date: b.birthdayString,
				kind: b.kind,
			});
		});
	}

	test("birthdayString equals the raw date for every record", () => {
		for (const b of records) {
			expect(b.birthdayString).toBe(b.date);
		}
	});
});
