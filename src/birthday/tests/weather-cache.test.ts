import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { z } from "zod";
import {
	pruneWeatherCache,
	readCachedWeather,
	sanitizeWeatherCache,
	WEATHER_CACHE_MAX_ENTRIES,
	WEATHER_CACHE_TTL,
	type WeatherCache,
	type WttrResponse,
	WttrResponseSchema,
	writeCachedWeather,
} from "../wttr";

/**
 * Tests for the persisted weather cache in `wttr.ts` and for the persistence
 * write in `store.ts`.
 *
 * The defect these cover: `WeatherTab` stored the whole `WttrResponse` — hourly,
 * current_condition, nearest_area, astronomy for every day — in `store`, and the
 * whole store is `JSON.stringify`-ed into `localStorage["store"]` on *every*
 * mutation with no eviction anywhere. A `?format=j1` response measured 39,611
 * bytes for Edinburgh, so the 5 default locations were already ~198 kB of the
 * 5 MB origin quota and ~126 locations exhausted it. Worse, `setItem` was not
 * wrapped in try/catch, so the `QuotaExceededError` escaped into the Valtio
 * subscription and killed the entire persistence path: theme, filters and all.
 *
 * These are pure-function tests plus a fresh-instance `store.ts` import, which
 * is the same technique `store.test.ts` uses (see the note at the top of that
 * file): `store.ts` is module-level side effects, so each scenario that needs
 * its own `subscribe` wiring re-imports it under a `?instance=N` query with
 * `localStorage` stubbed.
 */

const NOW = 1_700_000_000_000;
const FRESH_FOR = 10 * 60 * 1000; // WeatherTab's CACHE_DURATION

const value = (v: string) => ({ value: v });

/**
 * Build a payload from the schema's own key lists, so this fixture cannot drift
 * out of sync with `wttr.ts`. A hand-written key list is what produced the first
 * version of this file, and it silently omitted `winddirDegree`, which
 * `z.coerce.number()` turned into NaN and then rejected.
 */
const numbersFor = (schema: z.ZodObject<z.ZodRawShape>) => {
	const out: Record<string, number> = {};
	for (const key of Object.keys(schema.shape)) out[key] = 1;
	return out;
};

const hourlyShape =
	WttrResponseSchema.shape.weather.element.shape.hourly.element;
const currentShape = WttrResponseSchema.shape.current_condition.element;

/** A minimal payload satisfying `WttrResponseSchema`. */
const response = (temp = 7): WttrResponse => {
	const hourly = {
		...numbersFor(hourlyShape),
		weatherDesc: [value("Cloudy")],
		weatherIconUrl: [value("")],
		winddir16Point: "N",
	};
	return WttrResponseSchema.parse({
		current_condition: [
			{
				...numbersFor(currentShape),
				temp_C: temp,
				temp_F: temp,
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
				hourly: [hourly],
				maxtempC: 0,
				maxtempF: 0,
				mintempC: 0,
				mintempF: 0,
				sunHour: 0,
				totalSnow_cm: 0,
				uvIndex: 0,
			},
		],
	});
};

const entry = (timestamp: number, lastUsed?: number) => ({
	data: response(),
	timestamp,
	...(lastUsed === undefined ? {} : { lastUsed }),
});

/** Build a cache of `count` locations, oldest first. */
const manyEntries = (count: number, ageStepMs = 1000): WeatherCache => {
	const cache: WeatherCache = {};
	for (let i = 0; i < count; i++) {
		const location = `City${String(i).padStart(3, "0")}`;
		cache[location] = entry(NOW - (count - i) * ageStepMs);
	}
	return cache;
};

// --- bound: the LRU cap ---------------------------------------------------

describe("weather cache / LRU bound", () => {
	test("a cache far past the cap is cut down to the cap", () => {
		// 40 locations is the "user keeps adding cities" case. 8 survive.
		const pruned = pruneWeatherCache(manyEntries(40), NOW);
		expect(Object.keys(pruned)).toHaveLength(WEATHER_CACHE_MAX_ENTRIES);
	});

	test("the survivors are the most recently used, not an arbitrary subset", () => {
		const pruned = pruneWeatherCache(manyEntries(40), NOW);
		const keys = Object.keys(pruned);
		// `manyEntries` numbers oldest-first, so City039 is the newest fetch and
		// the 8 newest are exactly City032..City039.
		expect(keys).toContain("City039");
		expect(keys).toContain("City032");
		expect(keys).not.toContain("City031");
		expect(keys).not.toContain("City000");
	});

	test("eviction is driven by lastUsed, so a read protects an entry", () => {
		// 9 locations fetched at the same time, so `timestamp` cannot break the
		// tie: only `lastUsed` decides which one the cap drops.
		const cache: WeatherCache = {};
		for (let i = 0; i < 9; i++) {
			cache[`City${i}`] = { ...entry(NOW - 60_000), lastUsed: NOW - (9 - i) };
		}
		// City0 has the lowest lastUsed, so it is the one evicted
		expect(Object.keys(pruneWeatherCache(cache, NOW))).not.toContain("City0");

		// reading it promotes it above the rest, and City1 is evicted instead
		const oldest = cache.City0;
		if (oldest === undefined) throw new Error("City0 was never written");
		cache.City0 = { ...oldest, lastUsed: NOW };
		const afterTouch = pruneWeatherCache(cache, NOW);
		expect(Object.keys(afterTouch)).toContain("City0");
		expect(Object.keys(afterTouch)).not.toContain("City1");
	});

	test("the cap is a real bound: writing 200 locations never exceeds it", () => {
		// The unbounded-growth scenario, driven through the real write path.
		let cache: WeatherCache = {};
		for (let i = 0; i < 200; i++) {
			cache = writeCachedWeather(cache, `City${i}`, response(), NOW + i);
		}
		expect(Object.keys(cache)).toHaveLength(WEATHER_CACHE_MAX_ENTRIES);
		// the 8 most recent are the ones kept
		expect(Object.keys(cache)).toContain("City199");
		expect(Object.keys(cache)).not.toContain("City100");
	});

	test("the bound keeps the persisted payload a small fraction of the quota", () => {
		// ~40 kB per location measured from a real wttr.in response. 8 of them
		// is ~320 kB against the 5 MB origin quota.
		const bytesPerLocation = 39_611;
		const worstCase = WEATHER_CACHE_MAX_ENTRIES * bytesPerLocation;
		expect(worstCase).toBeLessThan(5_000_000 / 10);
	});
});

// --- bound: the TTL -------------------------------------------------------

describe("weather cache / TTL", () => {
	test("an entry older than the TTL is dropped", () => {
		const cache: WeatherCache = {
			Edinburgh: entry(NOW - WEATHER_CACHE_TTL - 1),
		};
		expect(Object.keys(pruneWeatherCache(cache, NOW))).toEqual([]);
	});

	test("an entry inside the TTL is kept", () => {
		const cache: WeatherCache = {
			Edinburgh: entry(NOW - WEATHER_CACHE_TTL + 1),
		};
		expect(Object.keys(pruneWeatherCache(cache, NOW))).toEqual(["Edinburgh"]);
	});

	test("the TTL is far longer than the read freshness window", () => {
		// Rationale for the number: anything past FRESH_FOR could only ever be
		// refetched, so the TTL bounds dead weight without cutting a reload
		// inside the same browsing session.
		expect(WEATHER_CACHE_TTL).toBeGreaterThan(FRESH_FOR);
	});

	test("a timestamp beyond the clock-skew tolerance is not treated as fresh", () => {
		// A clock that jumped backwards, or a hand-edited payload. There is a
		// deliberate one-day tolerance so ordinary NTP drift does not throw the
		// cache away, so this has to clear *that*, not just the TTL.
		const withinTolerance: WeatherCache = {
			Edinburgh: entry(NOW + 12 * 60 * 60 * 1000),
		};
		expect(Object.keys(pruneWeatherCache(withinTolerance, NOW))).toEqual([
			"Edinburgh",
		]);

		const beyondTolerance: WeatherCache = {
			Edinburgh: entry(NOW + 48 * 60 * 60 * 1000),
		};
		expect(Object.keys(pruneWeatherCache(beyondTolerance, NOW))).toEqual([]);
	});

	test("a non-finite timestamp is dropped rather than sorted", () => {
		for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
			const cache = {
				Edinburgh: { data: response(), timestamp: bad },
			} as unknown as WeatherCache;
			expect(Object.keys(pruneWeatherCache(cache, NOW))).toEqual([]);
		}
	});
});

// --- read path ------------------------------------------------------------

describe("weather cache / read path", () => {
	test("a fresh valid entry is served", () => {
		const cache: WeatherCache = { Edinburgh: entry(NOW) };
		const hit = readCachedWeather(cache, "Edinburgh", NOW, FRESH_FOR);
		expect(hit?.current_condition[0]?.temp_C).toBe(7);
	});

	test("an absent location is a miss, not a crash", () => {
		expect(readCachedWeather({}, "Nowhere", NOW, FRESH_FOR)).toBeNull();
	});

	test("a malformed entry is a miss rather than a render crash", () => {
		// The renderer indexes `current_condition[0]` and `weather[]` with no
		// further checks, so anything unvalidated must never reach it.
		const bad: unknown[] = [
			undefined,
			null,
			"a string",
			42,
			{},
			{ data: {} },
			{ data: { current_condition: [] } },
			{ data: response(), timestamp: "not a number" },
			{ timestamp: NOW },
			{ data: response() },
		];
		for (const value of bad) {
			const cache = { Edinburgh: value } as unknown as WeatherCache;
			expect(readCachedWeather(cache, "Edinburgh", NOW, FRESH_FOR)).toBeNull();
		}
	});

	test("an entry from an older persisted shape is a miss", () => {
		// The pre-`lastUsed` shape must still be *readable*; recency just falls
		// back to `timestamp`. Here the payload is from an older schema, so it
		// is a miss.
		const olderShape = { data: { current_condition: "nope" }, timestamp: NOW };
		const cache = { Edinburgh: olderShape } as unknown as WeatherCache;
		expect(readCachedWeather(cache, "Edinburgh", NOW, FRESH_FOR)).toBeNull();
	});

	test("a stale entry is a miss", () => {
		const cache: WeatherCache = { Edinburgh: entry(NOW - FRESH_FOR - 1) };
		expect(readCachedWeather(cache, "Edinburgh", NOW, FRESH_FOR)).toBeNull();
	});

	test("a read advances the LRU clock", () => {
		const cache: WeatherCache = { Edinburgh: entry(NOW - 1000) };
		expect(cache.Edinburgh?.lastUsed).toBeUndefined();
		readCachedWeather(cache, "Edinburgh", NOW, FRESH_FOR);
		expect(cache.Edinburgh?.lastUsed).toBe(NOW);
	});

	test("the cache survives a JSON round-trip through localStorage", () => {
		// The real path, taken for real: `store.ts` puts the whole store into
		// `localStorage["store"]` with `JSON.stringify` and reads it back with
		// `JSON.parse`, so `date` comes back as a string and every number as a
		// JSON scalar. `WttrResponseSchema` coerces, so the round-trip holds.
		//
		// This goes through the storage stub rather than through `structuredClone`
		// because that is the claim: the entry has to survive serialisation, and a
		// structured clone keeps `date` a `Date` — it would pass while proving
		// nothing about what `localStorage` hands back.
		const storage = createStorage();
		storage.setItem(
			"store",
			JSON.stringify({
				weatherCache: writeCachedWeather({}, "Edinburgh", response(11), NOW),
			}),
		);
		const stored = storage.getItem("store");
		expect(stored).not.toBeNull();
		// One narrow cast, and it is the library's: `JSON.parse` answers `any`
		// because it cannot know the shape, and what is asserted here is only
		// that the wrapper is an object whose `weatherCache` the sanitiser then
		// validates entry by entry.
		const payload = JSON.parse(stored ?? "{}") as { weatherCache?: unknown };
		const revived = sanitizeWeatherCache(payload.weatherCache);
		const hit = readCachedWeather(revived, "Edinburgh", NOW, FRESH_FOR);
		expect(hit?.current_condition[0]?.temp_C).toBe(11);
	});
});

// --- write path -----------------------------------------------------------

describe("weather cache / write path", () => {
	test("a write stores the payload and is immediately servable", () => {
		const cache = writeCachedWeather({}, "Edinburgh", response(3), NOW);
		expect(
			readCachedWeather(cache, "Edinburgh", NOW, FRESH_FOR),
		).not.toBeNull();
	});

	test("a write re-validates, so an unvalidated payload is never cached", () => {
		const junk = { current_condition: "nope" } as unknown as WttrResponse;
		const cache = writeCachedWeather({}, "Edinburgh", junk, NOW);
		expect(cache.Edinburgh).toBeUndefined();
	});

	test("a write prunes as it writes, so a huge existing cache is repaired", () => {
		// A store persisted by a build with no bound at all: 200 locations, all
		// fresh. The very next write must bring it back to the cap.
		const oversized = manyEntries(200);
		expect(Object.keys(oversized)).toHaveLength(200);
		const repaired = writeCachedWeather(oversized, "Fresh", response(), NOW);
		expect(Object.keys(repaired)).toHaveLength(WEATHER_CACHE_MAX_ENTRIES);
	});

	test("a write does not mutate the cache it was given", () => {
		const original = manyEntries(3);
		const before = Object.keys(original);
		writeCachedWeather(original, "Extra", response(), NOW);
		expect(Object.keys(original)).toEqual(before);
	});
});

// --- sanitising a persisted payload ---------------------------------------

describe("weather cache / sanitizeWeatherCache", () => {
	test("good entries survive, bad ones are dropped individually", () => {
		const cleaned = sanitizeWeatherCache({
			Good: entry(NOW),
			Bad: { data: {}, timestamp: NOW },
			Worse: null,
		});
		expect(Object.keys(cleaned)).toEqual(["Good"]);
	});

	test("a non-object payload yields an empty cache rather than throwing", () => {
		for (const bad of [null, undefined, 42, "text", [1, 2, 3], true]) {
			expect(sanitizeWeatherCache(bad)).toEqual({});
		}
	});
});

// --- the persistence write ------------------------------------------------

type StoreModule = typeof import("../store");

interface StubStorage {
	readonly map: Map<string, string>;
	readonly setItem: (key: string, value: string) => void;
	readonly getItem: (key: string) => string | null;
	/** Set to make `setItem` throw, as a full quota does. */
	quotaExceeded: boolean;
	writes: number;
}

/**
 * A `localStorage` whose `setItem` can be made to throw a `QuotaExceededError`
 * on demand, which is the exact failure the missing try/catch used to let escape
 * into the Valtio subscription.
 */
const createStorage = (seed?: string): StubStorage => {
	const map = new Map<string, string>();
	if (seed !== undefined) map.set("store", seed);
	const stub: StubStorage = {
		map,
		quotaExceeded: false,
		writes: 0,
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => {
			stub.writes++;
			if (stub.quotaExceeded) {
				const error = new Error("quota exceeded");
				error.name = "QuotaExceededError";
				throw error;
			}
			map.set(key, value);
		},
	};
	return stub;
};

let instanceCounter = 0;

const disposers: (() => void)[] = [];

/**
 * Import a fresh `store.ts` bound to `storage`.
 *
 * The stub stays installed for the life of the returned module, because
 * `store.ts` reads `localStorage` lazily: the `subscribe` callback looks it up
 * on every notification, long after this import has resolved. Restoring it here
 * would leave the subscription reading whatever happens to be installed later.
 */
const loadStore = async (storage: StubStorage): Promise<StoreModule> => {
	// Installed with `defineProperty` rather than assigned, because a plain
	// assignment throws whenever an earlier file in this shared process left
	// `localStorage` as an accessor with no setter — `celebration.test.ts` does
	// exactly that to simulate blocked site data, and the two files then collide
	// in whichever order bun happens to run them. That made
	// `bun test src/birthday/` fail with "Attempted to assign to readonly
	// property" while the full suite passed, which is the worst shape for a
	// developer narrowing something down.
	const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
	const install = (value: unknown) => {
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			writable: true,
			value,
		});
	};
	install(storage);
	disposers.push(() => {
		if (previous) Object.defineProperty(globalThis, "localStorage", previous);
		else Reflect.deleteProperty(globalThis, "localStorage");
	});
	return (await import(
		`../store?weathercache=${instanceCounter++}`
	)) as StoreModule;
};

/** Let the debounced `compute()` and the async Valtio notification run. */
const settle = () => new Promise<void>((r) => setTimeout(r, 50));

describe("store / persistence survives a full quota", () => {
	let storage: StubStorage;
	let mod: StoreModule;
	// Every scenario here makes the write fail on purpose, and both the store
	// and the wiki cache log it. Keep the output readable; the assertions, not
	// the log, are what these tests are about.
	const realError = console.error;

	beforeAll(async () => {
		console.error = () => {};
		storage = createStorage();
		mod = await loadStore(storage);
	});

	afterAll(() => {
		storage.quotaExceeded = false;
		for (const dispose of disposers) dispose();
		disposers.length = 0;
		console.error = realError;
	});

	test("a throwing setItem does not escape the subscription", async () => {
		storage.quotaExceeded = true;
		const before = storage.writes;

		// The whole point: the mutation and the notification must both complete.
		// Before the fix this threw out of the Valtio subscription, which is an
		// async callback, so the rejection was unhandled and the persistence
		// path stopped working for good.
		mod.store.darkMode = false;
		mod.store.search = "quota";
		await settle();

		expect(storage.writes).toBeGreaterThan(before);
		// the in-memory store is unaffected
		expect(mod.store.darkMode).toBe(false);
		expect(mod.store.search).toBe("quota");
	});

	test("the failure is reported to subscribers rather than swallowed", async () => {
		const seen: string[] = [];
		const unsubscribe = mod.onPersistenceError((error) => seen.push(error));
		storage.quotaExceeded = true;
		mod.store.showBoys = false;
		await settle();
		unsubscribe();

		expect(seen).toContain("quota");
		expect(mod.getPersistenceError()).toBe("quota");
	});

	test("unsubscribing stops the notifications", async () => {
		const seen: string[] = [];
		const unsubscribe = mod.onPersistenceError((error) => seen.push(error));
		unsubscribe();
		storage.quotaExceeded = true;
		mod.store.showGirls = false;
		await settle();
		expect(seen).toEqual([]);
		storage.quotaExceeded = false;
	});

	test("the app keeps working and persistence recovers once there is room", async () => {
		// Not a degraded mode: the next successful write clears the error and
		// the store is saved again, theme and filters included. This is what
		// the old unguarded `setItem` took away.
		storage.quotaExceeded = false;
		mod.store.showWeddings = true;
		await settle();

		expect(mod.getPersistenceError()).toBeNull();
		const raw = storage.getItem("store");
		expect(raw).not.toBeNull();
		const written = JSON.parse(raw ?? "{}") as Record<string, unknown>;
		expect(written.darkMode).toBe(false);
		expect(written.search).toBe("quota");
		expect(written.showWeddings).toBe(true);
	});

	test("an oversized cache is truncated on load, so the quota stays reachable", async () => {
		// A store left behind by the unbounded version: 200 fresh locations.
		// Loading it must not resurrect 200 x 40 kB.
		const oversized: Record<string, unknown> = {};
		for (let i = 0; i < 200; i++) {
			oversized[`City${i}`] = entry(Date.now() - i);
		}
		const seed = JSON.stringify({ darkMode: false, weatherCache: oversized });
		const reloaded = await loadStore(createStorage(seed));

		expect(Object.keys(reloaded.store.weatherCache)).toHaveLength(
			WEATHER_CACHE_MAX_ENTRIES,
		);
		// and the rest of the store was not collateral damage
		expect(reloaded.store.darkMode).toBe(false);
	});
});

describe("store / localStorage is optional", () => {
	const realError = console.error;

	beforeAll(() => {
		console.error = () => {};
	});

	afterAll(() => {
		for (const dispose of disposers) dispose();
		disposers.length = 0;
		console.error = realError;
	});

	test("a store that cannot reach localStorage still boots and mutates", async () => {
		// Private browsing / storage disabled: merely *reaching* for
		// `localStorage` can throw, so both the lookup in `getInitialState` and
		// the one in the write path are guarded.
		const mod2 = await loadStoreThrowingStorage();
		mod2.store.darkMode = false;
		await settle();
		expect(mod2.store.darkMode).toBe(false);
		expect(mod2.getPersistenceError()).toBe("unavailable");
	});
});

/**
 * Install a `localStorage` whose property access itself throws, as a sandboxed
 * iframe or a strict cookie policy can make it, and import a fresh `store.ts`
 * against it. The stub stays installed for the same reason `loadStore` keeps
 * its own: the write path looks `localStorage` up on every notification.
 */
const loadStoreThrowingStorage = async (): Promise<StoreModule> => {
	const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		get() {
			throw new Error("access denied");
		},
	});
	disposers.push(() => {
		if (previous) Object.defineProperty(globalThis, "localStorage", previous);
		else Reflect.deleteProperty(globalThis, "localStorage");
	});
	return (await import(
		`../store?weathercache-throwing=${instanceCounter++}`
	)) as StoreModule;
};
