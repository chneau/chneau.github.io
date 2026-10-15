import { afterAll, describe, expect, setSystemTime, test } from "bun:test";
import type { Birthday } from "../birthdays";
import { birthdaySchema, birthdays, recomputeBirthdays } from "../birthdays";

const realNow = new Date();

const at = (y: number, m: number, d: number) =>
	new Date(y, m - 1, d, 12, 0, 0, 0);

const startOfToday = () => {
	const n = new Date();
	return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};

const daysBetween = (a: Date, b: Date) =>
	Math.round((b.getTime() - a.getTime()) / 86_400_000);

const expectedDailyInsight = (
	name: string,
	ref: Date,
): Birthday["dailyInsight"] => {
	const today = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(
		2,
		"0",
	)}-${String(ref.getDate()).padStart(2, "0")}`;
	const str = name + today;
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}
	return `insight_${Math.abs(hash) % 15}` as Birthday["dailyInsight"];
};

type DerivedRecord = Birthday & { date: string };

const records = birthdays as DerivedRecord[];

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

const snapshotTimeInvariant = (list: readonly Birthday[]) =>
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
			expect(b.ageInDays).toBeGreaterThanOrEqual(b.age * 365);
			expect(b.ageInDays).toBeLessThanOrEqual((b.age + 1) * 366);
			expect(b.ageInMonths).toBeGreaterThanOrEqual(b.age * 12);
			expect(b.ageInMonths).toBeLessThan(b.age * 12 + 12);
			expect(b.ageInWeeks).toBe(Math.floor(b.ageInDays / 7));
		});

		test(`${id}: progress is a percentage`, () => {
			expect(b.progress).toBeGreaterThanOrEqual(0);
			expect(b.progress).toBeLessThanOrEqual(100);
			expect(Number.isFinite(b.progress)).toBe(true);
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

describe("determinism", () => {
	test("computeBirthdays has no Math.random()/Date.now() leaking in", () => {
		const a = recomputeBirthdays();
		const b = recomputeBirthdays();
		expect(structuredClone(b)).toEqual(structuredClone(a));
		expect(b).toHaveLength(a.length);
	});

	test("dailyInsight is stable within the same day", () => {
		const a = recomputeBirthdays().map((b) => `${b.name}:${b.dailyInsight}`);
		const b = recomputeBirthdays().map((x) => `${x.name}:${x.dailyInsight}`);
		expect(b).toEqual(a);
	});

	test("dailyInsight is the documented per-day hash of name+date", () => {
		const today = startOfToday();
		for (const b of records) {
			expect(b.dailyInsight).toBe(expectedDailyInsight(b.name, today));
		}
	});

	test("the same people get different insights on a different day", () => {
		const today = startOfToday();
		const onToday = new Set(records.map((b) => `${b.name}:${b.dailyInsight}`));
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

describe("the date-roll contract", () => {
	test("recomputeBirthdays() moves the countdown as the reference date moves", () => {
		const ref = at(2026, 3, 10);
		setSystemTime(ref);
		const before = recomputeBirthdays();
		const b0 = before[0] as Birthday;

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
			const delta = (next?.daysBeforeBirthday ?? 0) - b.daysBeforeBirthday;
			expect(delta).toBeGreaterThanOrEqual(0);
			expect(delta).toBeLessThanOrEqual(1);
			expect(next?.progress).toBeCloseTo(b.progress, 1);
		}
	});

	test("on the exact day the countdowns are 0 and the sort puts them first", () => {
		setSystemTime(at(2026, 8, 13));
		const list = recomputeBirthdays();
		const today = list.filter((b) => b.daysBeforeBirthday === 0);
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
		const violations: string[] = [];
		for (let d = 0; d < 730; d += 1) {
			const ref = new Date(2026, 0, 1 + d, 12);
			setSystemTime(ref);
			const midnight = new Date(2026, 0, 1 + d);
			for (const b of recomputeBirthdays()) {
				const where = `${ref.toDateString()} ${b.name}`;
				if (b.age < 0) violations.push(`${where}: age ${b.age}`);
				if (b.daysBeforeBirthday < 0) {
					violations.push(
						`${where}: daysBeforeBirthday ${b.daysBeforeBirthday}`,
					);
				}
				if (b.nextBirthday.getTime() < midnight.getTime()) {
					violations.push(`${where}: nextBirthday in the past`);
				}
				if (
					b.nextBirthday.getMonth() + 1 !== b.month ||
					b.nextBirthday.getDate() !== b.day
				) {
					violations.push(
						`${where}: nextBirthday ${
							b.nextBirthday.getMonth() + 1
						}/${b.nextBirthday.getDate()} != ${b.month}/${b.day}`,
					);
				}
				if (b.progress < 0 || b.progress > 100) {
					violations.push(`${where}: progress ${b.progress}`);
				}
				if (b.ageInDays < b.age * 365) {
					violations.push(
						`${where}: ageInDays ${b.ageInDays} < ${b.age * 365}`,
					);
				}
				if (b.ageInMonths < b.age * 12 || b.ageInMonths >= b.age * 12 + 12) {
					violations.push(`${where}: ageInMonths ${b.ageInMonths}`);
				}
				if (
					b.ageGroup === undefined ||
					b.season === undefined ||
					b.sign === undefined
				) {
					violations.push(`${where}: missing classification field`);
				}
			}
		}
		setSystemTime(realNow);
		recomputeBirthdays();
		expect(violations).toEqual([]);
	});

	test("fields that must not change when only the day changes", () => {
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
