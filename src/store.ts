import { debounce } from "es-toolkit";
import Fuse from "fuse.js";
import { proxy, subscribe } from "valtio";
import { z } from "zod";
import { type Birthday, birthdays } from "./birthdays";
import { WttrResponseSchema } from "./wttr";

const WeatherCacheEntrySchema = z.object({
	data: WttrResponseSchema,
	timestamp: z.number(),
});

const StoreSchema = z.object({
	search: z.string(),
	showBoys: z.boolean(),
	showGirls: z.boolean(),
	showWeddings: z.boolean(),
	darkMode: z.boolean(),
	weatherLocations: z.array(z.string()),
	weatherCache: z.record(z.string(), WeatherCacheEntrySchema),
});

type Store = z.infer<typeof StoreSchema>;

const getInitialState = (): Store => {
	const defaults: Store = {
		search: "",
		showBoys: true,
		showGirls: true,
		showWeddings: false,
		darkMode: true,
		weatherLocations: ["Edinburgh", "Issoire", "Madrid", "Verdun", "Oberageri"],
		weatherCache: {},
	};
	if (typeof localStorage === "undefined") {
		return defaults;
	}
	const saved = localStorage.getItem("store");
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

subscribe(store, () => {
	if (typeof localStorage !== "undefined") {
		localStorage.setItem("store", JSON.stringify(store));
	}
});

export type WikiEvent = {
	year: number;
	text: string;
};

export const dataStore = proxy<{
	filtered: Birthday[];
	wikiCache: Record<string, WikiEvent[]>;
}>({
	filtered: [],
	wikiCache: {},
});

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

const compute = () => {
	const { search, showBoys, showGirls, showWeddings } = store;
	const trimmedSearch = search.trim();

	let filtered = birthdays;

	if (trimmedSearch) {
		filtered = fuse.search(trimmedSearch).map((result) => result.item);
	}

	dataStore.filtered = filtered.filter((x) => {
		if (x.kind === "♂️" && !showBoys) return false;
		if (x.kind === "♀️" && !showGirls) return false;
		if (x.kind === "💒" && !showWeddings) return false;
		return true;
	});
};

subscribe(store, debounce(compute, 200));
compute();
