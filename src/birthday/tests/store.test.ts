import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	setSystemTime,
	test,
} from "bun:test";
import dayjs from "dayjs";
import Fuse from "fuse.js";
import {
	type Birthday,
	birthdays,
	monthNames,
	recomputeBirthdays,
	subscribeBirthdays,
} from "../birthdays";
import { WEATHER_CACHE_TTL } from "../wttr";

/**
 * Tests for the search + persistence layer in `store.ts`.
 *
 * `store.ts` is nothing but module-level side effects: a Valtio proxy seeded
 * from `localStorage`, a Fuse.js index over the derived `Birthday[]`, a
 * debounced `compute()`, and a `visibilitychange` / `setInterval` date-roll.
 * Nothing is exported as a callable unit, so:
 *
 *   - every test that cares about `localStorage` re-imports the module with a
 *     fresh `?instance=N` query, which gives it its own copy of that side
 *     effect and its own `store` / `dataStore` / Fuse index;
 *   - `window`, `document`, `localStorage` and `setInterval` are stubbed here
 *     because this runs in bun, which defines none of them;
 *   - the stubs are uninstalled in `afterAll` so the rest of the suite is fine.
 */

type StoreModule = typeof import("../store");

const BOY = "\u2642\uFE0F";
const GIRL = "\u2640\uFE0F";
const WEDDING = "\u{1F492}";

/** The exact key list `store.ts` hands to Fuse, used one key at a time. */
const FUSE_KEYS = [
	"name",
	"sign",
	"signSymbol",
	"birthgem",
	"birthdayString",
	"age",
	"chineseZodiac",
	"kind",
	"generation",
	"decade",
	"ageGroup",
	"element",
	"monthName",
] as const;

const fuseOptions = {
	threshold: 0.4,
	ignoreLocation: true,
	useExtendedSearch: true,
} as const;

const singleKeyFuse = (
	key: (typeof FUSE_KEYS)[number],
	collection: Birthday[],
) => new Fuse(collection, { ...fuseOptions, keys: [key] });

const names = (list: Birthday[]) => list.map((x) => x.name);
const sorted = (list: Birthday[]) => names(list).sort();
const isWedding = (x: Birthday) => x.kind === WEDDING;
const visible = (list: Birthday[]) => list.filter((x) => !isWedding(x));

// --- global stubs -------------------------------------------------------

const globals = globalThis as unknown as Record<string, unknown>;

const createStorage = (seed?: string) => {
	const map = new Map<string, string>();
	if (seed !== undefined) map.set("store", seed);
	return {
		map,
		storage: {
			getItem: (k: string) => map.get(k) ?? null,
			setItem: (k: string, v: string) => {
				map.set(k, v);
			},
			removeItem: (k: string) => {
				map.delete(k);
			},
			clear: () => map.clear(),
			key: (i: number) => [...map.keys()][i] ?? null,
			get length() {
				return map.size;
			},
		},
	};
};

const documentListeners: Record<string, (() => void)[]> = {};
const intervalCallbacks: (() => void)[] = [];

const createDocument = () => ({
	hidden: false,
	addEventListener: (type: string, cb: () => void) => {
		const existing = documentListeners[type] ?? [];
		existing.push(cb);
		documentListeners[type] = existing;
	},
	removeEventListener: (type: string, cb: () => void) => {
		documentListeners[type] = (documentListeners[type] ?? []).filter(
			(x) => x !== cb,
		);
	},
});

let sharedDocument: ReturnType<typeof createDocument> | null = null;

/**
 * Two fixed dates, both at midday UTC, one per test that moves the clock.
 *
 * Three separate things had to be pinned down, and each produced a real failure
 * before it was understood.
 *
 * 1. `setSystemTime` cannot be undone. Bun shares one clock across every file in a
 *    run, so `new Date()` inside a test returns whatever the last test left behind.
 *    Hence two epochs rather than "now".
 *
 * 2. The store's roll guard is module state inside `store.ts` — it remembers the
 *    last calendar day it saw, and there is no reset for it — so the two tests
 *    could not both start from "now". Two different epochs give each a forward jump
 *    from whatever the guard last recorded, so a roll always fires.
 *
 * 3. **Midday UTC, specifically.** These tests assert that "one hour later is
 *    still the same day", which is only true away from midnight — and that is
 *    exactly what broke overnight. The captured baseline was `23:42Z`, so `+1h`
 *    was `00:42Z`: a different calendar day to `dayjs`, and the guard correctly
 *    recomputed where the test asserted it should not. Nothing in the production
 *    code was wrong; the fixture assumed a time of day it was never guaranteed. Noon
 *    leaves 23 hours of margin either side.
 */
const GUARD_EPOCH = Date.parse("2030-03-15T12:00:00Z");
const ROLL_EPOCH = Date.parse("2031-06-20T12:00:00Z");

/**
 * Move the shared clock to `epoch` and make both the guard and the data agree.
 *
 * All three steps are needed, and the order matters:
 *
 * - `setSystemTime` moves the clock the store reads;
 * - the dispatch drives the roll guard, which only recomputes when the calendar day
 *   it recorded differs from the current one — so on its own it can do nothing at
 *   all, leaving `birthdays` describing an earlier instant;
 * - `recomputeBirthdays` then forces the data to match the clock regardless.
 *
 * Dispatch alone left the data stale, visible only as `ageInDays` coming out one
 * out. Recompute alone left the guard convinced it was days ahead, so the forward
 * jump never fired a roll.
 */
const reanchor = (epoch: number): void => {
	setSystemTime(new Date(epoch));
	dispatchVisibilityChange();
	recomputeBirthdays();
};

const dispatchVisibilityChange = () => {
	for (const cb of documentListeners.visibilitychange ?? []) cb();
};

const disposers: (() => void)[] = [];
let instanceCounter = 0;

/** `console.error` is silenced while the deliberately-broken payloads load. */
const quietly = async <T>(fn: () => Promise<T>): Promise<T> => {
	const original = console.error;
	console.error = () => {};
	try {
		return await fn();
	} finally {
		console.error = original;
	}
};

type LoadedStore = { mod: StoreModule };

/**
 * Import a fresh copy of `store.ts`.
 *
 * `raw === undefined` means "nothing saved under localStorage['store']";
 * `raw === ""` means "saved, but empty". Only the long-lived instance (the one
 * with `withDom`) gets `window` / `document` / `setInterval` stubs, so exactly
 * one module ever registers the date-roll wiring.
 */
const loadStore = async (
	raw?: string,
	{ withDom = false } = {},
): Promise<LoadedStore> => {
	const { storage } = createStorage(raw);
	const previous = {
		localStorage: globals.localStorage,
		window: globals.window,
		document: globals.document,
		setInterval: globals.setInterval,
	};

	globals.localStorage = storage;
	if (withDom) {
		globals.window = {};
		sharedDocument = createDocument();
		globals.document = sharedDocument;
		globals.setInterval = (cb: () => void) => {
			intervalCallbacks.push(cb);
			return intervalCallbacks.length;
		};
	} else {
		// no DOM: `store.ts` must take its server-side path, which is also what
		// keeps exactly one instance wiring up the date roll
		globals.window = undefined;
		globals.document = undefined;
		globals.setInterval = undefined;
	}

	let mod: StoreModule;
	try {
		mod = (await import(
			`../store?instance=${instanceCounter++}`
		)) as StoreModule;
	} finally {
		const restore = () => {
			globals.localStorage = previous.localStorage;
			globals.window = previous.window;
			globals.document = previous.document;
			globals.setInterval = previous.setInterval;
		};
		if (withDom) disposers.push(restore);
		else restore();
	}

	return { mod };
};

// --- the instance under test --------------------------------------------

let store: StoreModule["store"];
let dataStore: StoreModule["dataStore"];

/** `compute()` is debounced by 200ms in `store.ts`. */
const settle = () => new Promise<void>((r) => setTimeout(r, 260));

const search = async (query: string): Promise<Birthday[]> => {
	store.search = query;
	await settle();
	return [...dataStore.filtered];
};

const setKinds = async (kinds: {
	showBoys?: boolean;
	showGirls?: boolean;
	showWeddings?: boolean;
}) => {
	if (kinds.showBoys !== undefined) store.showBoys = kinds.showBoys;
	if (kinds.showGirls !== undefined) store.showGirls = kinds.showGirls;
	if (kinds.showWeddings !== undefined) store.showWeddings = kinds.showWeddings;
	await settle();
};

beforeAll(async () => {
	const { mod } = await loadStore(undefined, { withDom: true });
	store = mod.store;
	dataStore = mod.dataStore;
	// `birthdays` is a mutable module-level binding: another test file in the
	// same bun process may have left it repopulated from its own localStorage
	// stub. Rebuild it from the bundled JSON with our (empty) stub installed,
	// which also re-indexes this instance's Fuse collection.
	recomputeBirthdays();
	await settle();
	expect(birthdays.length).toBeGreaterThan(0);
});

afterAll(() => {
	for (const dispose of disposers) dispose();
	disposers.length = 0;
	// leave the wall clock and the derived dataset as we found them
	setSystemTime(new Date());
	recomputeBirthdays();
});

beforeEach(() => {
	store.search = "";
	store.showBoys = true;
	store.showGirls = true;
	store.showWeddings = false;
});

// --- Fuse index ----------------------------------------------------------

describe("store / Fuse index: which fields are searchable", () => {
	test("a name query matches, best match first", async () => {
		const results = await search("Christian");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.name).toBe("Christian");
	});

	test("every configured key is indexed", () => {
		// A one-record collection indexed under a single key: a hit proves the
		// key is in the index, a miss would prove it is not.
		for (const key of FUSE_KEYS) {
			const sample = birthdays.find((x) => !isWedding(x)) as Birthday;
			const raw = sample[key];
			const query = typeof raw === "number" ? String(raw) : raw;
			expect(typeof query).toBe("string");
			expect(
				`${key}:${singleKeyFuse(key, [sample]).search(query).length}`,
			).toBe(`${key}:1`);
		}
	});

	test("fields present on Birthday but absent from the key list are unsearchable", async () => {
		// `season`, `moonPhase`, `lifePathMeaning` and `dailyInsight` are shown in
		// the details panel and are real values on every record, yet none of them
		// is in the Fuse key list, so no query can reach them.
		expect(
			birthdays.filter((x) => x.season === "spring").length,
		).toBeGreaterThan(0);
		expect(await search("spring")).toEqual([]);
		expect(await search("full_moon")).toEqual([]);
		expect(await search("insight_3")).toEqual([]);
		expect(await search("life_path_5")).toEqual([]);
	});

	test("numbers match `age`, and they also match the date string", async () => {
		const sample = birthdays.find((x) => !isWedding(x)) as Birthday;
		expect(names(await search(String(sample.age)))).toContain(sample.name);

		// `day` is *not* indexed, but `birthdayString` is and contains it, so "30"
		// behaves as a substring query and can return people who are not 30.
		const byDay = await search("30");
		for (const hit of byDay) {
			const explainable = hit.age === 30 || hit.birthdayString.endsWith("30");
			expect(`${hit.name}:${explainable}`).toBe(`${hit.name}:true`);
		}
		// and every actual 30-year-old is in there, because `age` is indexed
		for (const thirty of birthdays.filter((x) => x.age === 30)) {
			expect(names(byDay)).toContain(thirty.name);
		}
	});

	test("a single digit is not a usable query", async () => {
		// Every date string in this dataset contains a "0", so the query returns
		// most of the list. Documents why the search box wants a word, not a digit.
		expect((await search("0")).length).toBeGreaterThan(birthdays.length / 2);
	});

	test("a full date finds its record first, and is fuzzy around it", async () => {
		const subject = birthdays.find((x) => !isWedding(x)) as Birthday;
		const results = await search(subject.birthdayString);
		expect(names(results)[0]).toBe(subject.name);
		// ... but it is not an exact filter: the date leaks into other records
		expect(results.length).toBeGreaterThan(1);
	});

	test("translated (non-English) values are not searchable", async () => {
		// The index stores raw i18n keys ("aries", "gen_z", "sep") while the UI
		// renders translations, so the wording a non-English user actually sees
		// is not the wording that is indexed.
		// Positive controls first: the English key finds its records.
		const signs = [...new Set(birthdays.map((x) => x.sign))];
		expect(signs.length).toBeGreaterThan(1);
		const counts = new Map<string, number>();
		for (const x of birthdays) {
			counts.set(x.sign, (counts.get(x.sign) ?? 0) + 1);
		}
		for (const sign of signs) {
			const expected = visible(birthdays.filter((x) => x.sign === sign)).length;
			expect(expected).toBeGreaterThan(0);
			expect((await search(sign)).length).toBeGreaterThanOrEqual(expected);
		}

		for (const [translated, english, field, nonLatin] of [
			["Bélier", "aries", "sign", false], // fr  data.zodiac.aries
			["Génération Z", "gen_z", "generation", false], // fr
			["Ados", "teens", "ageGroup", false], // fr  data.age_groups.teens
			["Septembre", "sep", "monthName", false], // fr  data.months.sep
			["Widder", "aries", "sign", false], // de  data.zodiac.aries
			["Teenager", "teens", "ageGroup", false], // de
			["Mayores", "seniors", "ageGroup", false], // es  data.age_groups.seniors
			["Adolescentes", "teens", "ageGroup", false], // es
			["白羊座", "aries", "sign", true], // zh  data.zodiac.aries
			["青少年", "teens", "ageGroup", true], // zh
			["长者", "seniors", "ageGroup", true], // zh
			["Z世代", "gen_z", "generation", true], // zh
			// even the English labels do not match: they carry an emoji and a range
			["Teens \u{1F9D2} (<20)", "teens", "ageGroup", false],
			["Seniors \u{1F9D3} (60+)", "seniors", "ageGroup", false],
		] as const) {
			const viaKey = await search(english);
			const viaTranslation = await search(translated);
			expect(`${english}/${field}=${viaKey.length}`).not.toBe(
				`${english}/${field}=0`,
			);
			// the translation can never reproduce the filter the key performs
			expect(sorted(viaTranslation)).not.toEqual(sorted(viaKey));
			if (nonLatin) {
				// no character overlap at all, so nothing can be found
				expect(`${translated}=${viaTranslation.length}`).toBe(
					`${translated}=0`,
				);
			}
		}
	}, 20000);

	test("fuzzy noise: a translated word can land on the wrong English record", async () => {
		// "Senioren" (de) is close enough to `ageGroup: "seniors"` to score a hit,
		// so "the translation returns nothing" is only ever approximately true -
		// and when it does return something it is people chosen by edit distance.
		for (const hit of await search("Senioren")) {
			expect(hit.ageGroup).toBe("seniors");
		}
	});
});

// --- Filter.tsx shortcut chips -------------------------------------------

describe("store / Filter.tsx shortcut chips", () => {
	const chipQueries = () => {
		const month = dayjs().month();
		return {
			thisMonth: monthNames[month] as string,
			nextMonth: monthNames[(month + 1) % 12] as string,
			genZ: "gen_z",
			teens: "teens",
			seniors: "seniors",
		};
	};

	test("no chip query returns an empty list", async () => {
		// The question: does any chip match nothing at all? Answer: no, all five
		// produce results against the bundled dataset.
		const chips = chipQueries();
		for (const [label, query] of Object.entries(chips)) {
			const n = (await search(query)).length;
			expect(`${label}(${query})=${n}`).not.toBe(`${label}(${query})=0`);
		}
	}, 20000);

	test("teens and seniors chips are exact", async () => {
		for (const [label, query] of [
			["teens", "teens"],
			["seniors", "seniors"],
		] as const) {
			const got = await search(query);
			const expected = visible(birthdays.filter((x) => x.ageGroup === label));
			expect(got.length).toBeGreaterThan(0);
			expect(sorted(got)).toEqual(sorted(expected));
		}
	});

	test("BUG: the gen_z chip matches far more than the gen_z generation", async () => {
		// `generation` holds "gen_z" | "gen_x" | "gen_alpha" | ... and Fuse scores
		// the whole token at threshold 0.4, so "gen_z" is one substitution away
		// from both "gen_x" and "gen_alpha". The chip shows a list dominated by
		// people who are not Gen Z.
		const got = await search("gen_z");
		const expected = visible(birthdays.filter((x) => x.generation === "gen_z"));

		// every real Gen Z record is present ...
		for (const x of expected) expect(names(got)).toContain(x.name);
		// ... together with everyone who is not Gen Z at all.
		const wrong = got.filter((x) => x.generation !== "gen_z");
		expect(wrong.length).toBeGreaterThan(0);
		expect(got.length).toBeGreaterThan(expected.length);

		// The English label the UI actually displays is exact, which is the proof
		// that it is the raw key - not the dataset - that is wrong.
		expect(sorted(await search("Gen Z"))).toEqual(sorted(expected));
	});

	test("a month chip matches exactly that month and nothing else", async () => {
		// This replaces a test that asserted the OPPOSITE, documenting a real
		// bug: the chips used to write a 3-letter month abbreviation into the
		// free-text search, where Fuse's `threshold: 0.4` permits two bitap
		// substitutions on a 3-character query. "apr" therefore matched
		// "Martin", "capricorn" and "garnet", and April showed 24 of the 27
		// visible people.
		//
		// Chips are exact facets now, so the contract is exactness: for every
		// month, the facet must return that month's records and no others.
		for (let month = 0; month < 12; month += 1) {
			const { mod } = await loadStore();
			mod.store.facets.month = month + 1;
			mod.store.facets.monthDay = dayjs().format("YYYY-MM-DD");
			await settle();

			const expected = visible(
				birthdays.filter((x) => x.monthName === monthNames[month]),
			);
			expect(expected.length).toBeGreaterThan(0);
			expect(names([...mod.dataStore.filtered])).toEqual(names(expected));
		}
	});

	test("a month facet is not stale after midnight", async () => {
		// `monthDay` is what stops "This month" silently pinning last month's
		// number once the day rolls over.
		const { mod } = await loadStore();
		mod.store.facets.month = 8;
		mod.store.facets.monthDay = dayjs().format("YYYY-MM-DD");
		await settle();
		expect(mod.dataStore.filtered.length).toBeGreaterThan(0);

		mod.store.facets.monthDay = dayjs().subtract(1, "day").format("YYYY-MM-DD");
		await settle();
		// The facet was picked yesterday, so it is released and the full
		// visible set comes back. No watcher is involved: `isMonthFacetActive`
		// compares `monthDay` against the current day on every read, so simply
		// mutating the field releases it.
		expect(mod.isMonthFacetActive()).toBe(false);
		expect(mod.dataStore.filtered.length).toBe(visible(birthdays).length);
	});
});

// --- kind toggles --------------------------------------------------------

describe("store / kind toggles", () => {
	// counted inside each test: `birthdays` is a live binding, so module-scope
	// counts would be taken before this file's `beforeAll` rebuilds it
	const weddingCount = () => birthdays.filter(isWedding).length;
	const boyCount = () => birthdays.filter((x) => x.kind === BOY).length;
	const girlCount = () => birthdays.filter((x) => x.kind === GIRL).length;

	test("the default hides weddings and shows everybody else", async () => {
		const got = await search("");
		expect(got.length).toBe(birthdays.length - weddingCount());
		expect(got.filter(isWedding).length).toBe(0);
		expect(got.length).toBe(boyCount() + girlCount());
	});

	test("showWeddings adds the wedding records back", async () => {
		await setKinds({ showWeddings: true });
		const got = await search("");
		expect(got.length).toBe(birthdays.length);
		expect(got.filter(isWedding).length).toBe(weddingCount());
	});

	test("showBoys and showGirls drop exactly one kind each", async () => {
		await setKinds({ showBoys: false });
		let got = await search("");
		expect(got.filter((x) => x.kind === BOY).length).toBe(0);
		expect(got.length).toBe(girlCount());

		await setKinds({ showBoys: true, showGirls: false });
		got = await search("");
		expect(got.filter((x) => x.kind === GIRL).length).toBe(0);
		expect(got.length).toBe(boyCount());
	});

	test("the three toggles compose additively", async () => {
		await setKinds({ showBoys: false, showWeddings: true });
		const expected = birthdays.filter((x) => x.kind === GIRL || isWedding(x));
		expect(sorted(await search(""))).toEqual(sorted(expected));

		await setKinds({ showBoys: false, showGirls: false });
		expect(sorted(await search(""))).toEqual(
			sorted(birthdays.filter(isWedding)),
		);
	}, 20000);

	test("search results go through the kind filter too", async () => {
		// "weddings" is the `ageGroup` value, so it is a valid query whose hits
		// are exactly the wedding records - which the default filter then hides.
		expect(await search("weddings")).toEqual([]);
		await setKinds({ showWeddings: true });
		expect(sorted(await search("weddings"))).toEqual(
			sorted(birthdays.filter(isWedding)),
		);
		// the emoji is indexed too, so it selects the same records
		expect(sorted(await search(WEDDING))).toEqual(
			sorted(birthdays.filter(isWedding)),
		);
	});

	test("an unmatched query empties the list, blank whitespace does not", async () => {
		expect(await search("zzzzqqqq")).toEqual([]);
		expect((await search("   ")).length).toBe(
			birthdays.length - weddingCount(),
		);
	});

	test("state is persisted to localStorage and restores on reload", async () => {
		store.search = "persisted?";
		store.darkMode = false;
		await settle();

		const raw = (
			globals.localStorage as { getItem: (k: string) => string | null }
		).getItem("store");
		expect(raw).not.toBeNull();
		const written = JSON.parse(raw ?? "{}") as Record<string, unknown>;
		expect(written.search).toBe("persisted?");
		expect(written.darkMode).toBe(false);
		expect(written.showWeddings).toBe(false);

		// a reload from exactly those bytes gives the same state back
		const { mod } = await loadStore(raw ?? undefined);
		expect(mod.store.search).toBe("persisted?");
		expect(mod.store.darkMode).toBe(false);
	});
});

// --- getInitialState -----------------------------------------------------

describe("store / getInitialState from localStorage", () => {
	const defaultLocations = [
		"Edinburgh",
		"Issoire",
		"Madrid",
		"Verdun",
		"Oberageri",
	];
	const expectDefaults = (mod: StoreModule, label: string) => {
		expect(`${label} search=${mod.store.search}`).toBe(`${label} search=`);
		expect(`${label} boys=${mod.store.showBoys}`).toBe(`${label} boys=true`);
		expect(`${label} girls=${mod.store.showGirls}`).toBe(`${label} girls=true`);
		expect(`${label} weddings=${mod.store.showWeddings}`).toBe(
			`${label} weddings=false`,
		);
		expect(`${label} dark=${mod.store.darkMode}`).toBe(`${label} dark=true`);
		expect(`${label} locs=${mod.store.weatherLocations.length}`).toBe(
			`${label} locs=5`,
		);
		expect(`${label} cache=${JSON.stringify(mod.store.weatherCache)}`).toBe(
			`${label} cache={}`,
		);
	};

	test("nothing saved yields the documented defaults", async () => {
		const { mod } = await loadStore(undefined);
		expectDefaults(mod, "empty");
		expect(mod.store.weatherLocations).toEqual(defaultLocations);
		// and the initial filter run already applied the weddings default
		expect(mod.dataStore.filtered.length).toBe(visible(birthdays).length);
	});

	test("an empty string counts as nothing saved", async () => {
		expectDefaults((await loadStore("")).mod, "blank");
	});

	test("a valid partial value is merged over the defaults", async () => {
		const { mod } = await loadStore(
			JSON.stringify({ darkMode: false, search: "hello", showWeddings: true }),
		);
		expect(mod.store.darkMode).toBe(false);
		expect(mod.store.search).toBe("hello");
		expect(mod.store.showWeddings).toBe(true);
		// untouched keys keep their default
		expect(mod.store.showBoys).toBe(true);
		expect(mod.store.weatherLocations).toEqual(defaultLocations);
		expect(mod.store.weatherCache).toEqual({});
	});

	test("corrupt JSON falls back to the defaults instead of throwing", async () => {
		expectDefaults(
			(await quietly(() => loadStore("{{{not json"))).mod,
			"corrupt",
		);
	});

	test("a wrong-typed value falls back to the defaults", async () => {
		// zod throws inside the try, and the catch swallows it into `defaults`.
		for (const bad of [
			JSON.stringify({ search: 42 }),
			JSON.stringify({ darkMode: "yes" }),
			JSON.stringify({ weatherLocations: "Edinburgh" }),
			JSON.stringify({
				weatherCache: { Edinburgh: { data: {}, timestamp: 1 } },
			}),
			JSON.stringify([1, 2, 3]),
			JSON.stringify("a bare string"),
			JSON.stringify({ unknownKey: 1 }),
		]) {
			expectDefaults((await quietly(() => loadStore(bad))).mod, bad);
		}
	});

	test("JSON scalars spread to nothing and keep the defaults", async () => {
		for (const raw of ["null", "0", "true"]) {
			const { mod } = await loadStore(raw);
			expect(`${raw}->${mod.store.showWeddings}`).toBe(`${raw}->false`);
			expect(`${raw}->${mod.store.weatherLocations.length}`).toBe(`${raw}->5`);
		}
	});

	test("a saved search is applied to the very first filtered list", async () => {
		// compute() runs during module evaluation, before any debounce, and the
		// weddings default hides the only records that `ageGroup: "weddings"` has.
		const { mod } = await loadStore(JSON.stringify({ search: "weddings" }));
		expect(mod.dataStore.filtered.length).toBe(0);
		await settle();
		expect(mod.dataStore.filtered.length).toBe(0);

		const sign = birthdays[0]?.sign as Birthday["sign"];
		const { mod: shown } = await loadStore(
			JSON.stringify({ search: sign, showWeddings: true }),
		);
		expect(shown.dataStore.filtered.length).toBeGreaterThan(0);
		for (const x of shown.dataStore.filtered) expect(x.sign).toBe(sign);
	});

	test("a valid weatherCache entry round-trips", async () => {
		// A fresh timestamp: the cache is TTL-bounded on read, so the old
		// `timestamp: 1` fixture (1970) is now correctly aged out at load.
		const entry = wttrEntry(Date.now());
		const { mod } = await loadStore(
			JSON.stringify({ weatherCache: { Edinburgh: entry } }),
		);
		expect(Object.keys(mod.store.weatherCache)).toEqual(["Edinburgh"]);
		expect(mod.store.weatherCache.Edinburgh?.timestamp).toBe(entry.timestamp);
		expect(
			mod.store.weatherCache.Edinburgh?.data.current_condition[0]?.temp_C,
		).toBe(7);
	});

	test("an expired weatherCache entry is dropped on load, not on the whole store", async () => {
		// The defect: one bad entry must not cost the theme, the filters and the
		// saved locations. Only the cache entry goes.
		const stale = wttrEntry(Date.now() - WEATHER_CACHE_TTL - 1000);
		const { mod } = await loadStore(
			JSON.stringify({
				darkMode: false,
				search: "kept",
				weatherCache: { Edinburgh: stale, Madrid: wttrEntry(Date.now()) },
			}),
		);
		expect(Object.keys(mod.store.weatherCache)).toEqual(["Madrid"]);
		// the rest of the store survived
		expect(mod.store.search).toBe("kept");
		expect(mod.store.darkMode).toBe(false);
		expect(mod.store.weatherLocations).toEqual(defaultLocations);
	});
});

/** A minimal payload that satisfies `WttrResponseSchema`. */
const wttrEntry = (timestamp: number) => {
	const value = (v: string) => ({ value: v });
	const numeric = <T extends Record<string, unknown>>(base: T) =>
		Object.fromEntries(Object.keys(base).map((k) => [k, k === "time" ? 0 : 1]));
	const hourly = numeric({
		DewPointC: 0,
		DewPointF: 0,
		FeelsLikeC: 0,
		FeelsLikeF: 0,
		HeatIndexC: 0,
		HeatIndexF: 0,
		WindChillC: 0,
		WindChillF: 0,
		WindGustKmph: 0,
		WindGustMiles: 0,
		chanceoffog: 0,
		chanceoffrost: 0,
		chanceofhightemp: 0,
		chanceofovercast: 0,
		chanceofrain: 0,
		chanceofremdry: 0,
		chanceofsnow: 0,
		chanceofsunshine: 0,
		chanceofthunder: 0,
		chanceofwindy: 0,
		cloudcover: 0,
		diffRad: 0,
		humidity: 0,
		precipInches: 0,
		precipMM: 0,
		pressure: 0,
		pressureInches: 0,
		shortRad: 0,
		tempC: 0,
		tempF: 0,
		time: 0,
		uvIndex: 0,
		visibility: 0,
		visibilityMiles: 0,
		weatherCode: 0,
		weatherDesc: 0,
		weatherIconUrl: 0,
		winddir16Point: 0,
		winddirDegree: 0,
		windspeedKmph: 0,
		windspeedMiles: 0,
	});
	const current = numeric({
		FeelsLikeC: 0,
		FeelsLikeF: 0,
		cloudcover: 0,
		humidity: 0,
		precipInches: 0,
		precipMM: 0,
		pressure: 0,
		pressureInches: 0,
		temp_C: 0,
		temp_F: 0,
		uvIndex: 0,
		visibility: 0,
		visibilityMiles: 0,
		weatherCode: 0,
		winddirDegree: 0,
		windspeedKmph: 0,
		windspeedMiles: 0,
		observation_time: 0,
		weatherDesc: 0,
		weatherIconUrl: 0,
		winddir16Point: 0,
	});
	return {
		timestamp,
		data: {
			current_condition: [
				{
					...current,
					temp_C: 7,
					observation_time: "12:00 AM",
					weatherDesc: [value("Cloudy")],
					weatherIconUrl: [value("")],
					winddir16Point: "N",
				},
			],
			nearest_area: [
				{
					areaName: [value("Edinburgh")],
					country: [value("United Kingdom")],
					latitude: 0,
					longitude: 0,
					population: 0,
					region: [value("Scotland")],
					weatherUrl: [value("")],
				},
			],
			request: [{ query: "Edinburgh", type: "City" }],
			weather: [
				{
					astronomy: [
						{
							moon_illumination: 0,
							moon_phase: "New Moon",
							moonrise: "00:00 AM",
							moonset: "00:00 AM",
							sunrise: "00:00 AM",
							sunset: "00:00 AM",
						},
					],
					avgtempC: 0,
					avgtempF: 0,
					date: new Date(0),
					hourly: [
						{
							...hourly,
							weatherDesc: [value("Cloudy")],
							weatherIconUrl: [value("")],
							winddir16Point: "N",
						},
					],
					maxtempC: 0,
					maxtempF: 0,
					mintempC: 0,
					mintempF: 0,
					sunHour: 0,
					totalSnow_cm: 0,
					uvIndex: 0,
				},
			],
		},
	};
};

// --- date roll -----------------------------------------------------------

describe("store / date roll", () => {
	let recomputes = 0;

	beforeAll(() => {
		// one subscription for the whole file; `recomputes` counts calls to
		// `recomputeBirthdays()`, however many store instances are listening
		subscribeBirthdays(() => {
			recomputes++;
		});
	});

	test("the roll is wired to exactly one visibilitychange listener and one interval", () => {
		expect(documentListeners.visibilitychange?.length).toBe(1);
		expect(intervalCallbacks.length).toBe(1);
	});

	test("checkDateRoll recomputes exactly once per calendar day", () => {
		// Re-anchored, and `day` read from the constant rather than the ambient
		// clock: whatever a previous test left the shared clock at, "same day" and
		// "next day" here have to mean the same thing every run.
		reanchor(GUARD_EPOCH);
		const day = new Date(GUARD_EPOCH);
		const start = recomputes;

		// same day, tab shown repeatedly: no recompute
		setSystemTime(new Date(day.getTime() + 60 * 60 * 1000));
		dispatchVisibilityChange();
		dispatchVisibilityChange();
		expect(recomputes - start).toBe(0);

		// next day, tab shown repeatedly: exactly one recompute
		setSystemTime(new Date(day.getTime() + 26 * 60 * 60 * 1000));
		dispatchVisibilityChange();
		expect(recomputes - start).toBe(1);
		dispatchVisibilityChange();
		expect(recomputes - start).toBe(1);

		// the 60s interval runs the same guarded function: still a no-op
		for (const cb of intervalCallbacks) cb();
		expect(recomputes - start).toBe(1);
	});

	test("a hidden document never triggers the roll", () => {
		const doc = sharedDocument;
		if (!doc) throw new Error("no stubbed document");
		const before = recomputes;
		doc.hidden = true;
		dispatchVisibilityChange();
		expect(recomputes).toBe(before);
		doc.hidden = false;
	});

	test("a day later the derived data is re-computed against the new date", async () => {
		// Deliberately NOT `birthdays.find((x) => !isWedding(x))`. That picks the
		// first non-wedding record, which is Maximin — born 1978-10-04. On the
		// 4th of October his `daysBeforeBirthday` is 0 rather than 364, so
		// advancing the clock by a day leaves it at 364-1 and the assertion below
		// fails on that one date a year, for no reason connected to this hook.
		//
		// The point of the test is the roll, so it needs a subject whose countdown
		// is not at a boundary: one at least two days out, which no single date
		// can make ambiguous.
		// Before reading any data: the subject's countdown and the assertions below
		// must both be measured against the same instant, and this file's other date
		// test leaves the shared clock — and the store's guard — up to a day ahead.
		reanchor(ROLL_EPOCH);
		const subject = birthdays.find(
			(x) => !isWedding(x) && x.daysBeforeBirthday >= 2,
		) as Birthday;
		const before = {
			ageInDays: subject.ageInDays,
			daysBeforeBirthday: subject.daysBeforeBirthday,
		};

		const start = recomputes;
		// From `ROLL_EPOCH`, which `reanchor` has just made current. `Date.now()`
		// would be measured from whatever the preceding test left behind.
		setSystemTime(new Date(ROLL_EPOCH + 24 * 60 * 60 * 1000 + 60 * 60 * 1000));
		dispatchVisibilityChange();
		expect(recomputes - start).toBe(1);

		const after = birthdays.find((x) => x.name === subject.name) as Birthday;
		expect(after.ageInDays).toBe(before.ageInDays + 1);
		expect(after.daysBeforeBirthday).toBe(before.daysBeforeBirthday - 1);

		// and the Fuse index was rebuilt from the new collection, not the old one
		store.search = subject.name;
		await settle();
		expect(names(dataStore.filtered)).toContain(subject.name);
	});
});
