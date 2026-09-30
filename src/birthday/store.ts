import dayjs from "dayjs";
import { debounce } from "es-toolkit";
import Fuse from "fuse.js";
import { proxy, subscribe } from "valtio";
import { z } from "zod";
import {
	type Birthday,
	birthdays,
	recomputeBirthdays,
	subscribeBirthdays,
} from "./birthdays";
import type en from "./locales/en.json";
import { createWikiEventsCache, type WikiEvent } from "./wikiCache";
import {
	pruneWeatherCache,
	sanitizeWeatherCache,
	type WeatherCache,
} from "./wttr";

/** The generation values the dataset actually carries (`data.generations`). */
type FacetGeneration = keyof typeof en.data.generations;

/** The only two age groups the quick chips offer. */
type FacetAgeGroup = Extract<
	keyof typeof en.data.age_groups,
	"teens" | "seniors"
>;

const GENERATION_KEYS = [
	"gen_alpha",
	"gen_z",
	"millennials",
	"gen_x",
	"boomers",
	"silent",
	"greatest",
] as const satisfies readonly [FacetGeneration, ...FacetGeneration[]];

const AGE_GROUP_KEYS = ["teens", "seniors"] as const satisfies readonly [
	FacetAgeGroup,
	...FacetAgeGroup[],
];

/**
 * Exact-match facets, kept strictly separate from `search`.
 *
 * The quick-filter chips used to write their query into `search` and let Fuse
 * match it, but Fuse at `threshold: 0.4` allows `ceil(0.4 * patternLength)`
 * bitap errors, so a 3-character month abbreviation like "apr" was within reach
 * of "Martin", "capricorn", "garnet" and "earth": 24 of the 27 visible people
 * "matched" April. These are exact predicates instead, applied before Fuse.
 *
 * Every field is nullable and defaults to `null`, so a store persisted before
 * facets existed still parses.
 */
const FacetsSchema = z.object({
	/** Birth month, 1-12, or `null` for "no month facet". */
	month: z.number().int().min(1).max(12).nullable().default(null),
	/**
	 * The calendar day ("YYYY-MM-DD") the month facet was picked on, so a "This
	 * month" chip cannot keep filtering by last month's number after midnight.
	 * Always travels together with `month`.
	 */
	monthDay: z.string().nullable().default(null),
	generation: z.enum(GENERATION_KEYS).nullable().default(null),
	ageGroup: z.enum(AGE_GROUP_KEYS).nullable().default(null),
});

/**
 * The persisted weather cache, validated one entry at a time and then bounded.
 *
 * Deliberately not `z.record(z.string(), WeatherCacheEntrySchema)`: that would
 * let a single malformed entry fail the *whole* store parse, and the catch in
 * `getInitialState` would then discard the theme, the filters and the saved
 * locations over a value that is only a convenience. `sanitizeWeatherCache`
 * drops the bad entries and keeps the good ones; `pruneWeatherCache`
 * additionally ages them out and enforces the LRU cap, so a store persisted
 * before those bounds existed — or hand-edited into an oversized one — is
 * repaired the moment it is read.
 */
const WeatherCacheFieldSchema = z
	.unknown()
	.transform(
		(value): WeatherCache =>
			pruneWeatherCache(sanitizeWeatherCache(value), Date.now()),
	);

const StoreSchema = z.object({
	search: z.string(),
	showBoys: z.boolean(),
	showGirls: z.boolean(),
	showWeddings: z.boolean(),
	darkMode: z.boolean(),
	weatherLocations: z.array(z.string()),
	weatherCache: WeatherCacheFieldSchema,
	facets: FacetsSchema,
});

type Store = z.infer<typeof StoreSchema>;
type Facets = z.infer<typeof FacetsSchema>;

const NO_FACETS: Facets = {
	month: null,
	monthDay: null,
	generation: null,
	ageGroup: null,
};

const getInitialState = (): Store => {
	const defaults: Store = {
		search: "",
		showBoys: true,
		showGirls: true,
		showWeddings: false,
		darkMode: true,
		weatherLocations: ["Edinburgh", "Issoire", "Madrid", "Verdun", "Oberageri"],
		weatherCache: {},
		facets: { ...NO_FACETS },
	};
	// Both the property access and the read can throw when storage is disabled
	// or blocked (a sandboxed iframe, a strict cookie policy), so neither is
	// assumed to work. Defaults are a valid state, not a failure.
	let saved: string | null = null;
	try {
		saved =
			typeof localStorage === "undefined"
				? null
				: localStorage.getItem("store");
	} catch (e) {
		console.error("store: could not read from localStorage", e);
		return defaults;
	}
	if (!saved) return defaults;

	try {
		const parsed = JSON.parse(saved);
		return StoreSchema.parse({ ...defaults, ...parsed });
	} catch (e) {
		console.error("Failed to parse store from localStorage", e);
		return defaults;
	}
};

export const store = proxy<Store>(getInitialState());

/** Why the last persistence attempt failed, if it did. */
type PersistenceError = "quota" | "unavailable";

let persistenceError: PersistenceError | null = null;
const persistenceListeners = new Set<(error: PersistenceError) => void>();

/**
 * Subscribe to persistence failures so the UI can surface a quiet notice
 * instead of the user silently losing their settings. Returns an unsubscribe.
 */
export const onPersistenceError = (
	listener: (error: PersistenceError) => void,
): (() => void) => {
	persistenceListeners.add(listener);
	return () => {
		persistenceListeners.delete(listener);
	};
};

/** The current failure, for a component that mounts after the first one hit. */
export const getPersistenceError = (): PersistenceError | null =>
	persistenceError;

const reportPersistenceError = (error: PersistenceError) => {
	persistenceError = error;
	for (const listener of persistenceListeners) listener(error);
};

/**
 * `setItem` throws once the 5 MB origin quota is exhausted, and in Safari
 * private browsing it throws on *every* write. `spooners/rates.ts` already
 * guards its own `setItem`; this one did not, and that asymmetry was the bug:
 * the throw escaped into the Valtio subscription and took the whole persistence
 * path down with it, so the theme, the filters and everything else stopped being
 * saved too.
 *
 * Bounding the weather cache is what keeps the quota reachable; this is what
 * keeps missing it from being fatal. The write is lost, the failure is reported,
 * and the next mutation tries again.
 */
const persist = () => {
	// Even *reaching* for `localStorage` can throw, in a sandboxed iframe or
	// under a strict cookie policy, so the lookup is guarded too.
	let storage: Storage;
	try {
		if (typeof localStorage === "undefined") return;
		storage = localStorage;
	} catch (e) {
		console.error("store: localStorage is unavailable", e);
		reportPersistenceError("unavailable");
		return;
	}

	try {
		storage.setItem("store", JSON.stringify(store));
		persistenceError = null;
	} catch (e) {
		// `DOMException` is not reliably the same constructor across realms, so
		// the quota case is detected by name rather than by `instanceof`.
		const name = e instanceof Error ? e.name : "";
		const quota =
			name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
		console.error("store: could not persist to localStorage", e);
		reportPersistenceError(quota ? "quota" : "unavailable");
	}
};

subscribe(store, persist);

export type { WikiEvent } from "./wikiCache";

/**
 * The Wikimedia "on this day" cache: LRU-bounded, 30-day TTL, persisted, with
 * in-flight de-duplication. See `wikiCache.ts` for the numbers and why.
 */
const wikiEvents = createWikiEventsCache();

export const dataStore = proxy<{
	filtered: Birthday[];
	selectedBirthday: Birthday | null;
	wikiCache: Record<string, WikiEvent[]>;
}>({
	filtered: [],
	selectedBirthday: null,
	// Hydrated from `localStorage` at boot, minus anything expired or over the
	// cap, so a returning visitor does not re-fetch a payload that never changes.
	wikiCache: wikiEvents.snapshot(),
});

/**
 * `dataStore.wikiCache` is the read/write path `OnThisDay.tsx` uses, and this
 * bridge keeps it honest: every write is admitted to the real cache — which is
 * what validates it, bounds it, ages it out and persists it — and the mirror is
 * then reconciled against the cache's live keys, so nothing the cache evicted,
 * expired or rejected stays readable here.
 *
 * The guard keeps our own mirror writes from re-entering this callback. The
 * second, naturally-queued notification is a no-op: re-admitting unchanged
 * content leaves each entry's timestamp alone, so a replay can never extend an
 * entry's life past its TTL.
 */
let syncingWikiCache = false;
const syncWikiCache = () => {
	if (syncingWikiCache) return;
	syncingWikiCache = true;
	try {
		const mirror = dataStore.wikiCache;
		for (const [key, value] of Object.entries(wikiEvents.sync(mirror))) {
			// `undefined` means the cache no longer holds this key; anything else
			// is a good cached value being restored over a rejected write.
			if (value === undefined) delete mirror[key];
			else mirror[key] = value;
		}
	} finally {
		syncingWikiCache = false;
	}
};
subscribe(dataStore.wikiCache, syncWikiCache);

const fuse = new Fuse(birthdays, {
	keys: [
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
	],
	threshold: 0.4,
	ignoreLocation: true,
	useExtendedSearch: true,
});

/** The "YYYY-MM-DD" key a month facet is scoped to. */
const currentDayKey = (): string => dayjs().format("YYYY-MM-DD");

/**
 * A month facet only lives on the calendar day it was picked on, so "This
 * month" rolls over at midnight instead of pinning last month's number.
 */
export const isMonthFacetActive = (): boolean => {
	const { month, monthDay } = store.facets;
	return month !== null && monthDay !== null && monthDay === currentDayKey();
};

const matchesFacets = (x: Birthday, facetMonth: number | null): boolean => {
	const { generation, ageGroup } = store.facets;
	if (facetMonth !== null && x.month !== facetMonth) return false;
	if (generation !== null && x.generation !== generation) return false;
	if (ageGroup !== null && x.ageGroup !== ageGroup) return false;
	return true;
};

export const clearFacets = () => {
	store.facets.month = null;
	store.facets.monthDay = null;
	store.facets.generation = null;
	store.facets.ageGroup = null;
};

/**
 * Chips are mutually exclusive within a family and composable across families:
 * a month and an age range can never both be on, while a generation combines
 * with either. Clicking the chip that is already on turns that facet off.
 */
export const toggleMonthFacet = (month: number) => {
	if (isMonthFacetActive() && store.facets.month === month) {
		store.facets.month = null;
		store.facets.monthDay = null;
		return;
	}
	store.facets.month = month;
	store.facets.monthDay = currentDayKey();
	store.facets.ageGroup = null;
};

export const toggleGenerationFacet = (generation: FacetGeneration) => {
	store.facets.generation =
		store.facets.generation === generation ? null : generation;
};

export const toggleAgeGroupFacet = (ageGroup: FacetAgeGroup) => {
	if (store.facets.ageGroup === ageGroup) {
		store.facets.ageGroup = null;
		return;
	}
	store.facets.ageGroup = ageGroup;
	store.facets.month = null;
	store.facets.monthDay = null;
};

const compute = () => {
	const { search, showBoys, showGirls, showWeddings } = store;
	const { generation, ageGroup } = store.facets;
	const trimmedSearch = search.trim();

	// Facets first, as an exact predicate; the free-text query only ever sees
	// what survived them. A month facet picked before midnight is already dead,
	// so it filters nothing.
	const facetMonth = isMonthFacetActive() ? store.facets.month : null;
	const hasFacets =
		facetMonth !== null || generation !== null || ageGroup !== null;
	let filtered = hasFacets
		? birthdays.filter((x) => matchesFacets(x, facetMonth))
		: birthdays;

	if (trimmedSearch) {
		if (!hasFacets) {
			filtered = fuse.search(trimmedSearch).map((result) => result.item);
		} else {
			// Ranking the survivors with a throwaway index would give the same
			// records in the same order, without rebuilding one per keystroke.
			const allowed = new Set(filtered);
			filtered = fuse
				.search(trimmedSearch)
				.map((result) => result.item)
				.filter((x) => allowed.has(x));
		}
	}

	dataStore.filtered = filtered.filter((x) => {
		if (x.kind === "♂️" && !showBoys) return false;
		if (x.kind === "♀️" && !showGirls) return false;
		if (x.kind === "💒" && !showWeddings) return false;
		return true;
	});
};

subscribe(store, debounce(compute, 200));
subscribeBirthdays(() => {
	fuse.setCollection(birthdays);
	compute();
});
compute();

if (typeof window !== "undefined") {
	let lastDate = dayjs().format("YYYY-MM-DD");
	const checkDateRoll = () => {
		const currentDate = dayjs().format("YYYY-MM-DD");
		if (currentDate !== lastDate) {
			lastDate = currentDate;
			const updated = recomputeBirthdays();
			fuse.setCollection(updated);
			compute();
		}
	};
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) {
			checkDateRoll();
		}
	});
	setInterval(checkDateRoll, 60000);
}
