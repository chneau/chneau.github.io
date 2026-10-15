import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	WIKI_CACHE_MAX_ENTRIES,
	WIKI_CACHE_STORAGE_KEY,
	type WikiEvents,
} from "../wikiCache";

type StoreModule = typeof import("../store");

const map = new Map<string, string>();
const storage = {
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
};

let instanceCounter = 0;

const loadStore = async (seed?: Record<string, string>) => {
	map.clear();
	for (const [k, v] of Object.entries(seed ?? {})) map.set(k, v);
	return (await import(`../store?wiki=${instanceCounter++}`)) as StoreModule;
};

const settle = () => new Promise<void>((r) => setTimeout(r, 0));

const events = (year: number, text = `event ${year}`): WikiEvents => [
	{ text, year },
];

const persisted = () => {
	const raw = map.get(WIKI_CACHE_STORAGE_KEY);
	if (raw === undefined) return null;
	return JSON.parse(raw) as {
		entries: { key: string; storedAt: number; value: unknown }[];
	};
};

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => Date.now() - n * DAY;

let consoleError: typeof console.error;

const GLOBAL_KEYS = [
	"localStorage",
	"window",
	"document",
	"setInterval",
] as const;

const previousGlobals = new Map<string, PropertyDescriptor | undefined>(
	GLOBAL_KEYS.map((key) => [
		key,
		Object.getOwnPropertyDescriptor(globalThis, key),
	]),
);

const setGlobal = (key: string, value: unknown): void => {
	Object.defineProperty(globalThis, key, {
		value,
		configurable: true,
		writable: true,
		enumerable: true,
	});
};

beforeAll(() => {
	consoleError = console.error;
	console.error = () => {};
	setGlobal("localStorage", storage);
	setGlobal("window", undefined);
	setGlobal("document", undefined);
	setGlobal("setInterval", undefined);
});

afterAll(() => {
	console.error = consoleError;
	for (const [key, descriptor] of previousGlobals) {
		if (descriptor) {
			Object.defineProperty(globalThis, key, descriptor);
		} else {
			Reflect.deleteProperty(globalThis, key);
		}
	}
	previousGlobals.clear();
	map.clear();
});

describe("store / wikiCache wiring", () => {
	test("an empty cache is mirrored as an empty record", async () => {
		const mod = await loadStore();
		expect(mod.dataStore.wikiCache).toEqual({});
	});

	test("a write to the mirror is admitted, persisted and read back", async () => {
		const mod = await loadStore();
		mod.dataStore.wikiCache["en-09-01"] = events(1969);
		await settle();

		const payload = persisted();
		expect(payload?.entries).toHaveLength(1);
		expect(payload?.entries[0]?.key).toBe("en-09-01");
		expect(typeof payload?.entries[0]?.storedAt).toBe("number");
		expect(mod.dataStore.wikiCache["en-09-01"]?.[0]?.year).toBe(1969);
	});

	test("the mirror is hydrated from localStorage, so a reload re-fetches nothing", async () => {
		const first = await loadStore();
		first.dataStore.wikiCache["fr-07-14"] = events(1789);
		await settle();
		const seed = {
			[WIKI_CACHE_STORAGE_KEY]: map.get(WIKI_CACHE_STORAGE_KEY) ?? "",
		};

		const reloaded = await loadStore(seed);
		expect(reloaded.dataStore.wikiCache["fr-07-14"]?.[0]?.year).toBe(1789);
		expect(persisted()?.entries).toHaveLength(1);
	});

	test("a corrupt persisted payload boots to an empty mirror", async () => {
		const mod = await loadStore({ [WIKI_CACHE_STORAGE_KEY]: "{oops" });
		expect(mod.dataStore.wikiCache).toEqual({});
	});

	test("a mirror write that does not validate is dropped, not served", async () => {
		const mod = await loadStore();
		mod.dataStore.wikiCache["en-09-01"] = [
			{ text: "no year here" },
		] as unknown as WikiEvents;
		await settle();

		expect(mod.dataStore.wikiCache["en-09-01"]).toBeUndefined();
		expect(map.get(WIKI_CACHE_STORAGE_KEY) ?? "").not.toContain("no year here");
	});

	test("a bad write does not evict a good entry for the same key", async () => {
		const mod = await loadStore();
		mod.dataStore.wikiCache["en-09-01"] = events(1969);
		await settle();

		mod.dataStore.wikiCache["en-09-01"] = [
			{ text: "still no year" },
		] as unknown as WikiEvents;
		await settle();

		expect(mod.dataStore.wikiCache["en-09-01"]?.[0]?.year).toBe(1969);
	});

	test("the mirror cannot grow past the cap, and evictions leave it", async () => {
		const mod = await loadStore();
		const mirror = mod.dataStore.wikiCache;

		for (let day = 1; day <= 366; day++) {
			for (const lang of ["en", "fr", "es", "de", "zh"]) {
				const mm = String(Math.ceil(day / 31)).padStart(2, "0");
				const dd = String(((day - 1) % 31) + 1).padStart(2, "0");
				mirror[`${lang}-${mm}-${dd}`] = events(1900 + day);
			}
		}
		await settle();

		const remaining = Object.keys(mirror);
		expect(remaining.length).toBe(WIKI_CACHE_MAX_ENTRIES);
		expect(remaining).not.toContain("en-01-01");
		expect(remaining).toContain("zh-12-25");
		expect(persisted()?.entries.length).toBe(WIKI_CACHE_MAX_ENTRIES);
	});

	test("a mirror replay does not re-persist an unchanged entry", async () => {
		const mod = await loadStore();
		const mirror = mod.dataStore.wikiCache;
		mirror["en-09-01"] = events(1969);
		await settle();
		const writtenAt = persisted()?.entries[0]?.storedAt;
		expect(typeof writtenAt).toBe("number");

		for (let i = 0; i < 3; i++) {
			mirror["en-09-03"] = events(1971);
			await settle();
		}
		expect(
			persisted()?.entries.find((e) => e.key === "en-09-01")?.storedAt,
		).toBe(writtenAt);
		expect(mirror["en-09-01"]?.[0]?.year).toBe(1969);
	});

	test("a mirror write of changed content replaces the entry", async () => {
		const mod = await loadStore();
		const mirror = mod.dataStore.wikiCache;
		mirror["en-09-01"] = events(1969);
		await settle();
		const entry = () => persisted()?.entries.find((e) => e.key === "en-09-01");

		expect(entry()?.value).toEqual(events(1969));

		mirror["en-09-01"] = events(1969, "revised");
		await settle();

		expect(mirror["en-09-01"]?.[0]?.text).toBe("revised");
		expect(entry()?.value).toEqual(events(1969, "revised"));
	});

	test("hydration keeps a 29-day-old entry and drops a 31-day-old one", async () => {
		const seed = (storedAt: number) => ({
			[WIKI_CACHE_STORAGE_KEY]: JSON.stringify({
				v: 1,
				entries: [{ key: "en-09-01", storedAt, value: events(1969) }],
			}),
		});

		const recent = await loadStore(seed(daysAgo(29)));
		expect(recent.dataStore.wikiCache["en-09-01"]?.[0]?.year).toBe(1969);

		const stale = await loadStore(seed(daysAgo(31)));
		expect(stale.dataStore.wikiCache).toEqual({});
	});

	test("the rest of dataStore is untouched by the cache wiring", async () => {
		const mod = await loadStore();
		expect(Array.isArray(mod.dataStore.filtered)).toBe(true);
		expect(mod.dataStore.selectedBirthday).toBeNull();
	});
});
