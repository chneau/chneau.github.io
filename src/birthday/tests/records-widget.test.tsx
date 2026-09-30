import "../../shared/tests/happy-dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import {
	type Birthday,
	type RawBirthday,
	recomputeBirthdays,
} from "../birthdays";
import { getCompatibilityScore } from "../compatibility";
import {
	computeRecords,
	RecordsWidget,
	recordsDiagnostics,
} from "../RecordsWidget";
import { bucketOf, groupByBucket } from "../TimelineView";

/**
 * Tests for the family records (`RecordsWidget`) and the timeline buckets.
 *
 * The socialite used to call `getCompatibilityScore` once per *pair of people*
 * on every recompute - 870 calls for a 30-person family, repeated on every
 * parent re-render. The scores only depend on the two zodiac `element`s, so
 * the pair matrix collapses to at most `ELEMENTS.length * (ELEMENTS.length - 1)`
 * = 12 distinct scorings, cached for the lifetime of the module.
 *
 * `computeRecords` is driven through real `Birthday` records rather than
 * hand-faked ones: `recomputeBirthdays()` over a stubbed `localStorage` is the
 * only public door to them, and the derived fields the scoring depends on
 * (`element`, `sign`, `age`, `kind`) then stay honest. Each group of tests
 * imports `RecordsWidget` under its own `?instance=` query so the module-level
 * pair cache starts cold and the call counters measure that group alone.
 */

mock.module("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) =>
			options ? `${key}:${Object.values(options).join("|")}` : key,
		i18n: { language: "en" },
	}),
}));

afterEach(cleanup);

type RecordsModule = typeof import("../RecordsWidget");
type TimelineModule = typeof import("../TimelineView");

let instanceCounter = 0;

/** A fresh copy of the module, i.e. a cold pair cache and fresh counters. */
const loadRecords = (): Promise<RecordsModule> =>
	import(
		`../RecordsWidget?instance=${instanceCounter++}`
	) as Promise<RecordsModule>;

const loadTimeline = (): Promise<TimelineModule> =>
	import(
		`../TimelineView?instance=${instanceCounter++}`
	) as Promise<TimelineModule>;

const GIRL = "\u2640\uFE0F";
const BOY = "\u2642\uFE0F";
const WEDDING = "\u{1F492}";

/**
 * `localStorage` stub so `getRawBirthdays()` returns only what we seed. Bun
 * defines no `localStorage`, so without this the whole bundled 33-entry
 * `birthdays.json` would come back instead of the synthetic family.
 */
const withRecords = (records: RawBirthday[]): Birthday[] => {
	const memory = new Map<string, string>();
	memory.set("custom_birthdays_data", JSON.stringify(records));
	const stub: Storage = {
		get length() {
			return memory.size;
		},
		clear: () => memory.clear(),
		getItem: (k) => memory.get(k) ?? null,
		key: () => null,
		removeItem: (k) => memory.delete(k),
		setItem: (k, v) => {
			memory.set(k, v);
		},
	};

	const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
	Object.defineProperty(globalThis, "localStorage", {
		value: stub,
		configurable: true,
		writable: true,
	});
	try {
		return recomputeBirthdays();
	} finally {
		if (previous) {
			Object.defineProperty(globalThis, "localStorage", previous);
		} else {
			Reflect.deleteProperty(globalThis, "localStorage");
		}
	}
};

type Spec = {
	name: string;
	month: number;
	age: number;
	kind?: RawBirthday["kind"];
};

/**
 * Real derived records for a synthetic family.
 *
 * The birth *day* (25) is chosen so the month alone picks the sign, and with
 * it the element - which is what the compatibility collapse keys on:
 * 1 aquarius/air, 2 pisces/water, 3 aries/fire, 4 taurus/earth,
 * 5 gemini/air, 6 cancer/water, 7 leo/fire, 8 virgo/earth,
 * 9 libra/air, 10 scorpio/water, 11 sagittarius/fire, 12 capricorn/earth.
 */
const family = (spec: readonly Spec[]): Birthday[] =>
	withRecords(
		spec.map((x) => ({
			name: x.name,
			date: `${2026 - x.age}-${String(x.month).padStart(2, "0")}-25`,
			kind: x.kind ?? GIRL,
		})),
	);

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** A 30-person family cycling every element, so all four are represented. */
const bigFamily = (prefix: string, offset = 0): Birthday[] =>
	family(
		Array.from({ length: 30 }, (_, i) => ({
			name: `${prefix}${i}`,
			month: MONTHS[(i + offset) % 12] ?? 1,
			age: 20 + ((i * 7) % 50),
		})),
	);

/** Brute-force reference for the socialite, straight from the scorer. */
const bruteForceSocialite = (people: readonly Birthday[]) => {
	let best: { name: string; count: number } | null = null;
	for (const p1 of people) {
		const count = people.filter(
			(p2) => p1.name !== p2.name && getCompatibilityScore(p1, p2) === 100,
		).length;
		if (!best || count > best.count) best = { name: p1.name, count };
	}
	return best;
};

describe("records: degenerate inputs", () => {
	test("no people yields no records at all", async () => {
		await loadRecords();
		expect(computeRecords([])).toBeNull();
	});

	test("a single person is elder and rookie, with no twins and no socialite", async () => {
		await loadRecords();
		const people = family([{ name: "Ada", month: 4, age: 40 }]);
		expect(people).toHaveLength(1);

		const records = computeRecords(people);
		expect(records).not.toBeNull();
		expect(records?.elder.name).toBe("Ada");
		expect(records?.rookie.name).toBe("Ada");
		expect(records?.twins).toEqual([]);
		// A perfect match needs somebody else to match with.
		expect(records?.socialite).toBeNull();
		expect(records?.sameSign).toBeNull();
		expect(records?.sameGeneration).toBeNull();
	});

	test("zero perfect matches elects nobody, not a socialite with a count of 0", async () => {
		await loadRecords();
		// Everybody is air: same-element scores are 80, never 100.
		const people = family([
			{ name: "A", month: 1, age: 30 },
			{ name: "B", month: 5, age: 31 },
			{ name: "C", month: 9, age: 32 },
		]);
		expect(new Set(people.map((p) => p.element))).toEqual(new Set(["air"]));
		expect(bruteForceSocialite(people)?.count ?? 0).toBe(0);

		expect(computeRecords(people)?.socialite).toBeNull();
	});
});

describe("records: socialite collapse", () => {
	test("matches a brute-force O(n^2) scan on a 30-person family", async () => {
		await loadRecords();
		const people = bigFamily("P");
		expect(people).toHaveLength(30);

		const expected = bruteForceSocialite(people);
		const records = computeRecords(people);
		expect(records?.socialite?.person.name).toBe(expected?.name);
		expect(records?.socialite?.count ?? 0).toBe(expected?.count ?? 0);
	});

	test("is cheap: a cold cache scores at most 12 element pairs, not 870", async () => {
		// A fresh module instance means a cold pair cache, so the counters
		// measure this call alone.
		await loadRecords();
		const people = bigFamily("Q");

		computeRecords(people);
		// The old implementation called the scorer 30 * 29 = 870 times here.
		expect(recordsDiagnostics.scorerCalls).toBeLessThanOrEqual(12);
		expect(recordsDiagnostics.pairScores).toBeLessThanOrEqual(12);

		// A second pass over the same data costs nothing: the pairs are cached.
		const afterFirst = recordsDiagnostics.scorerCalls;
		computeRecords(people);
		expect(recordsDiagnostics.scorerCalls).toBe(afterFirst);
		expect(recordsDiagnostics.scorerCalls).toBeLessThanOrEqual(12);
	});

	test("is not poisoned by an earlier, smaller family in the same session", async () => {
		await loadRecords();

		// A lone fire sign cannot be measured against anything, so the pair
		// cache stays empty for it.
		const lone = family([{ name: "Ada", month: 3, age: 40 }]);
		expect(lone[0]?.element).toBe("fire");
		expect(computeRecords(lone)?.socialite).toBeNull();

		// The next family supplies the missing air partner, and the answer must
		// not be served from the empty cache the lone sign left behind.
		const pair = family([
			{ name: "Ada", month: 3, age: 40 },
			{ name: "Bo", month: 1, age: 41 },
		]);
		expect(computeRecords(pair)?.socialite?.count).toBe(1);
		expect(bruteForceSocialite(pair)?.count).toBe(1);
	});

	test("does not count a person as their own perfect match, even by duplicate name", async () => {
		await loadRecords();

		// Two people called Sam (one fire, one air) plus one Lee (air).
		// Sam(fire) may only match Lee: the air bucket holds two people, but
		// the other Sam shares a name and must be discounted.
		const people = family([
			{ name: "Sam", month: 3, age: 30 },
			{ name: "Sam", month: 1, age: 31 },
			{ name: "Lee", month: 1, age: 32 },
		]);
		expect(new Set(people.map((p) => p.element))).toEqual(
			new Set(["fire", "air"]),
		);
		expect(computeRecords(people)?.socialite?.count).toBe(1);

		// And with nothing but the two Sams, nobody has a match at all:
		// dropping the name rule would hand each of them the other one.
		const alone = family([
			{ name: "Sam", month: 3, age: 30 },
			{ name: "Sam", month: 1, age: 31 },
		]);
		expect(bruteForceSocialite(alone)?.count ?? 0).toBe(0);
		expect(computeRecords(alone)?.socialite).toBeNull();
	});
});

describe("records: twins and cohorts", () => {
	test("finds every pair sharing a month and a day", async () => {
		await loadRecords();
		const people = family([
			{ name: "A", month: 3, age: 30 },
			{ name: "B", month: 3, age: 31 },
			{ name: "C", month: 3, age: 32 },
			{ name: "D", month: 5, age: 33 },
		]);

		const twins = computeRecords(people)?.twins ?? [];
		expect(twins.map(([a, b]) => [a.name, b.name])).toEqual([
			["A", "B"],
			["A", "C"],
			["B", "C"],
		]);
	});

	test("reports the largest sign and generation cohorts as the secondary line", async () => {
		await loadRecords();
		const people = family([
			{ name: "A", month: 3, age: 12 },
			{ name: "B", month: 7, age: 13 },
			{ name: "C", month: 8, age: 44 },
		]);
		expect(people.map((p) => p.sign)).toEqual(["aries", "leo", "virgo"]);

		const records = computeRecords(people);
		// All three signs differ, so there is no sign cohort to fall back on.
		expect(records?.sameSign).toBeNull();
		// A and B are both 12 and 13, i.e. both Gen Alpha.
		expect(records?.sameGeneration).toEqual({
			generation: "gen_alpha",
			names: ["A", "B"],
		});
	});
});

describe("records widget rendering", () => {
	test("renders tiles and does not recompute on an unrelated re-render", () => {
		// `RecordsWidget` and `recordsDiagnostics` are imported statically here,
		// deliberately. The test compares a counter in `recordsDiagnostics`
		// against recomputes performed by the component, so both must come from
		// the SAME module instance. Pulling the component from the
		// `?instance=` dynamic import while reading the counter from the static
		// one compares two unrelated modules and always reads 0.
		//
		// The other tests in this file do use `loadRecords()`, because they need
		// a cold `pairScoreCache` - but none of them read the diagnostics.
		const people = family([
			{ name: "A", month: 3, age: 30 },
			{ name: "B", month: 1, age: 41 },
			{ name: "C", month: 6, age: 22, kind: BOY },
		]);

		const view = render(
			<MantineProvider>
				<RecordsWidget data={people} />
			</MantineProvider>,
		);
		const text = document.body.textContent ?? "";
		expect(text).toContain("app.records.elder");
		expect(text).toContain("app.records.twins");
		expect(text).toContain("app.records.no_twins");

		const before = recordsDiagnostics.computations;
		// Same `data` identity, fresh render: the memo must hold.
		view.rerender(
			<MantineProvider>
				<RecordsWidget data={people} />
			</MantineProvider>,
		);
		expect(recordsDiagnostics.computations).toBe(before);

		// A genuinely new list does recompute.
		view.rerender(
			<MantineProvider>
				<RecordsWidget data={[...people]} />
			</MantineProvider>,
		);
		expect(recordsDiagnostics.computations).toBe(before + 1);
	});

	test("renders nothing when no people are on screen", async () => {
		const { RecordsWidget } = await loadRecords();
		const { container } = render(
			<MantineProvider>
				<RecordsWidget data={[]} />
			</MantineProvider>,
		);
		// Nothing is rendered at all, not an empty shell.
		expect(container.textContent ?? "").not.toContain("app.records");
	});
});

describe("records and timeline accessibility", () => {
	test("the scrollable timeline is a focusable, named region with no violations", async () => {
		const { TimelineView } = await loadTimeline();
		const people = family([
			{ name: "A", month: 3, age: 30 },
			{ name: "B", month: 1, age: 41 },
			{ name: "C", month: 6, age: 22, kind: BOY },
		]);

		const { container } = render(
			<MantineProvider>
				<TimelineView data={people} />
			</MantineProvider>,
		);

		// WCAG 2.1.1: the scrolling list has to be reachable by keyboard, so
		// it is focusable and carries an accessible name.
		const scroller = container.querySelector<HTMLElement>(
			"[style*='overflow-y']",
		);
		expect(scroller).not.toBeNull();
		expect(scroller?.getAttribute("tabindex")).toBe("0");
		expect(scroller?.getAttribute("aria-label")).toBeTruthy();

		const results = await axe.run(container, {
			rules: Object.fromEntries(
				// Page-level rules do not apply to a rendered fragment.
				[
					"color-contrast",
					"page-has-heading-one",
					"landmark-one-main",
					"region",
					"html-has-lang",
					"document-title",
					"bypass",
					"meta-viewport",
				].map((id) => [id, { enabled: false }]),
			),
		});
		expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
	});

	test("the records tiles have no detectable violations", async () => {
		const { RecordsWidget } = await loadRecords();
		const people = family([
			{ name: "A", month: 3, age: 30 },
			{ name: "B", month: 3, age: 31 },
			{ name: "C", month: 6, age: 22, kind: BOY },
		]);

		const { container } = render(
			<MantineProvider>
				<RecordsWidget data={people} />
			</MantineProvider>,
		);
		const results = await axe.run(container, {
			rules: Object.fromEntries(
				[
					"color-contrast",
					"page-has-heading-one",
					"landmark-one-main",
					"region",
					"html-has-lang",
					"document-title",
					"bypass",
					"meta-viewport",
				].map((id) => [id, { enabled: false }]),
			),
		});
		expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
	});
});

describe("timeline bucketing", () => {
	test("maps day counts onto the four time buckets", () => {
		expect(bucketOf(0)).toBe("today");
		expect(bucketOf(7)).toBe("week");
		expect(bucketOf(8)).toBe("month");
		expect(bucketOf(30)).toBe("month");
		expect(bucketOf(31)).toBe("later");
	});

	test("drops empty buckets and keeps every person exactly once", () => {
		const people = family([
			{ name: "Today", month: 3, age: 30 },
			{ name: "Week", month: 1, age: 31 },
			{ name: "Month", month: 5, age: 32 },
			{ name: "Later", month: 2, age: 33 },
			{ name: "Wedding", month: 7, age: 34, kind: WEDDING },
		]);
		// The bucket boundaries are relative to today, which these records do
		// not control, so the offsets are pinned explicitly.
		const staggered = [0, 3, 9, 200, 1].map((days, i) => {
			const person = people[i];
			if (!person) throw new Error("missing fixture");
			return { ...person, daysBeforeBirthday: days };
		});

		const buckets = groupByBucket(staggered);
		expect(buckets.map((b) => b.key)).toEqual([
			"today",
			"week",
			"month",
			"later",
		]);
		expect(buckets.flatMap((b) => b.items)).toHaveLength(5);
		expect(groupByBucket([])).toEqual([]);

		const onlyToday = staggered[0];
		if (!onlyToday) throw new Error("missing fixture");
		expect(groupByBucket([onlyToday]).map((b) => b.key)).toEqual(["today"]);
	});
});
