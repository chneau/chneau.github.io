import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	WIKI_CACHE_MAX_ENTRIES,
	WIKI_CACHE_STORAGE_KEY,
	type WikiEvents,
} from "../wikiCache";

/**
 * Tests for the `store.ts` <-> `wikiCache` wiring.
 *
 * `store.ts` is nothing but module-level side effects — a Valtio proxy seeded
 * from `localStorage`, a Fuse index, a debounced `compute()` — so each
 * scenario re-imports it with a fresh `?wiki=N` query, exactly as
 * `store.test.ts` does. No DOM is installed, so `store.ts` takes its
 * server-side path and registers no date-roll wiring.
 *
 * The `localStorage` stub is installed for the whole file and only its
 * contents are swapped per scenario: the cache resolves storage lazily, and
 * the Valtio subscription fires a microtask after the import, so the stub has
 * to still be in place when the mirror is written.
 *
 * The cache module itself is covered by `wiki-cache.test.ts`; this file covers
 * the two things the wiring must get right — the mirror never exceeds the cap,
 * and a mirror replay is not mistaken for a re-fetch.
 *
 * Ageing is done by rewriting the `storedAt` in the persisted payload rather
 * than by moving the clock. `setSystemTime` is process-global in bun, so
 * freezing it here leaks into every other test file in the same run — which
 * silently breaks the date-derived assertions in `store.test.ts`. The cache
 * takes an injectable clock, so `wiki-cache.test.ts` covers the TTL arithmetic
 * properly; this file only needs entries that are old *as data*.
 */

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

/** Valtio batches its notifications into a microtask. */
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

/**
 * The previous DESCRIPTORS, not the previous values.
 *
 * `bun test` runs every file in ONE process, and several others install a DOM
 * via `src/shared/tests/happy-dom.ts`, whose `GlobalRegistrator` defines
 * `localStorage`, `window` and `document` as ACCESSOR properties on
 * `globalThis`. Two things follow, and this file got both wrong:
 *
 *  1. Plain assignment (`globals.localStorage = storage`) throws
 *     "Attempted to assign to readonly property" against such a property.
 *  2. Restoring the VALUE rather than the descriptor reads the getter and then
 *     leaves a permanent writable data property behind, so every file that runs
 *     afterwards sees a `localStorage` that no longer behaves like a DOM one.
 *
 * Between them these produced failures in this file and in unrelated ones, none
 * of which reproduced in isolation - which is why the wiki-cache wiring test
 * below passed alone and failed in the full suite.
 */
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

/** Install a global as a writable, configurable data property. */
const setGlobal = (key: string, value: unknown): void => {
	Object.defineProperty(globalThis, key, {
		value,
		configurable: true,
		writable: true,
		enumerable: true,
	});
};

beforeAll(() => {
	// the deliberately-broken payloads below log; keep the suite quiet
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
		// a hydrated mirror is not written back: the payload was already clean
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

		// The whole key space: 5 supported languages x 366 days = 1,830.
		// Before this wiring the mirror would have accepted every one of them.
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
		// the most recently written keys are the ones kept, oldest evicted
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

		// The proxy notifies again, which replays the whole mirror. A replay
		// must be a no-op for an unchanged key: if it rewrote `storedAt`, this
		// live proxy would pin every key past its TTL forever and the TTL would
		// be decorative.
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
		// The mirror-replay guard is about *unchanged* content; genuinely new
		// content must still land, or a re-fetch could never take effect.
		const mod = await loadStore();
		const mirror = mod.dataStore.wikiCache;
		mirror["en-09-01"] = events(1969);
		await settle();
		// Look the entry up BY KEY. Indexing `entries[0]` asserts about whatever
		// happens to be first, which in a full-file run is a leftover entry from
		// an earlier test - so the timestamp comparison could pass without ever
		// touching the entry under test.
		const entry = () => persisted()?.entries.find((e) => e.key === "en-09-01");
		const first = entry()?.storedAt;

		// `storedAt` has millisecond resolution, so guarantee the clock has moved
		// before the second write, or the two writes can legitimately share a
		// timestamp and the assertion below would be measuring the clock.
		await Bun.sleep(5);

		mirror["en-09-01"] = events(1969, "revised");
		await Bun.sleep(20);

		expect(mirror["en-09-01"]?.[0]?.text).toBe("revised");
		expect(entry()?.storedAt).toBeGreaterThan(first ?? 0);
		expect(entry()?.value).toEqual(events(1969, "revised"));
	});

	test("hydration keeps a 29-day-old entry and drops a 31-day-old one", async () => {
		// Both windows are checked in one pass, with the clock left alone: the
		// age is data in the payload, not a change to the system time.
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
