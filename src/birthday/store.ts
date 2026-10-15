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

type FacetGeneration = keyof typeof en.data.generations;

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

const FacetsSchema = z.object({
	month: z.number().int().min(1).max(12).nullable().default(null),
	monthDay: z.string().nullable().default(null),
	generation: z.enum(GENERATION_KEYS).nullable().default(null),
	ageGroup: z.enum(AGE_GROUP_KEYS).nullable().default(null),
});

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

type PersistenceError = "quota" | "unavailable";

let persistenceError: PersistenceError | null = null;
const persistenceListeners = new Set<(error: PersistenceError) => void>();

export const onPersistenceError = (
	listener: (error: PersistenceError) => void,
): (() => void) => {
	persistenceListeners.add(listener);
	return () => {
		persistenceListeners.delete(listener);
	};
};

export const getPersistenceError = (): PersistenceError | null =>
	persistenceError;

const reportPersistenceError = (error: PersistenceError) => {
	persistenceError = error;
	for (const listener of persistenceListeners) listener(error);
};

const persist = () => {
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
		const name = e instanceof Error ? e.name : "";
		const quota =
			name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
		console.error("store: could not persist to localStorage", e);
		reportPersistenceError(quota ? "quota" : "unavailable");
	}
};

subscribe(store, persist);

export type { WikiEvent } from "./wikiCache";

const wikiEvents = createWikiEventsCache();

export const dataStore = proxy<{
	filtered: Birthday[];
	selectedBirthday: Birthday | null;
	wikiCache: Record<string, WikiEvent[]>;
}>({
	filtered: [],
	selectedBirthday: null,
	wikiCache: wikiEvents.snapshot(),
});

let syncingWikiCache = false;
const syncWikiCache = () => {
	if (syncingWikiCache) return;
	syncingWikiCache = true;
	try {
		const mirror = dataStore.wikiCache;
		for (const [key, value] of Object.entries(wikiEvents.sync(mirror))) {
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

const currentDayKey = (): string => dayjs().format("YYYY-MM-DD");

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

const clearFacets = () => {
	store.facets.month = null;
	store.facets.monthDay = null;
	store.facets.generation = null;
	store.facets.ageGroup = null;
};

export const resetFilters = () => {
	store.search = "";
	store.showBoys = true;
	store.showGirls = true;
	store.showWeddings = false;
	clearFacets();
};

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
