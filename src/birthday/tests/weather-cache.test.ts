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

const NOW = 1_700_000_000_000;
const FRESH_FOR = 10 * 60 * 1000;

const value = (v: string) => ({ value: v });

const numbersFor = (schema: z.ZodObject<z.ZodRawShape>) => {
	const out: Record<string, number> = {};
	for (const key of Object.keys(schema.shape)) out[key] = 1;
	return out;
};

const hourlyShape =
	WttrResponseSchema.shape.weather.element.shape.hourly.element;
const currentShape = WttrResponseSchema.shape.current_condition.element;

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

const manyEntries = (count: number, ageStepMs = 1000): WeatherCache => {
	const cache: WeatherCache = {};
	for (let i = 0; i < count; i++) {
		const location = `City${String(i).padStart(3, "0")}`;
		cache[location] = entry(NOW - (count - i) * ageStepMs);
	}
	return cache;
};

describe("weather cache / LRU bound", () => {
	test("a cache far past the cap is cut down to the cap", () => {
		const pruned = pruneWeatherCache(manyEntries(40), NOW);
		expect(Object.keys(pruned)).toHaveLength(WEATHER_CACHE_MAX_ENTRIES);
	});

	test("the survivors are the most recently used, not an arbitrary subset", () => {
		const pruned = pruneWeatherCache(manyEntries(40), NOW);
		const keys = Object.keys(pruned);
		expect(keys).toContain("City039");
		expect(keys).toContain("City032");
		expect(keys).not.toContain("City031");
		expect(keys).not.toContain("City000");
	});

	test("eviction is driven by lastUsed, so a read protects an entry", () => {
		const cache: WeatherCache = {};
		for (let i = 0; i < 9; i++) {
			cache[`City${i}`] = { ...entry(NOW - 60_000), lastUsed: NOW - (9 - i) };
		}
		expect(Object.keys(pruneWeatherCache(cache, NOW))).not.toContain("City0");

		const oldest = cache.City0;
		if (oldest === undefined) throw new Error("City0 was never written");
		cache.City0 = { ...oldest, lastUsed: NOW };
		const afterTouch = pruneWeatherCache(cache, NOW);
		expect(Object.keys(afterTouch)).toContain("City0");
		expect(Object.keys(afterTouch)).not.toContain("City1");
	});

	test("the cap is a real bound: writing 200 locations never exceeds it", () => {
		let cache: WeatherCache = {};
		for (let i = 0; i < 200; i++) {
			cache = writeCachedWeather(cache, `City${i}`, response(), NOW + i);
		}
		expect(Object.keys(cache)).toHaveLength(WEATHER_CACHE_MAX_ENTRIES);
		expect(Object.keys(cache)).toContain("City199");
		expect(Object.keys(cache)).not.toContain("City100");
	});

	test("the bound keeps the persisted payload a small fraction of the quota", () => {
		const bytesPerLocation = 39_611;
		const worstCase = WEATHER_CACHE_MAX_ENTRIES * bytesPerLocation;
		expect(worstCase).toBeLessThan(5_000_000 / 10);
	});
});

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
		expect(WEATHER_CACHE_TTL).toBeGreaterThan(FRESH_FOR);
	});

	test("a timestamp beyond the clock-skew tolerance is not treated as fresh", () => {
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
		const storage = createStorage();
		storage.setItem(
			"store",
			JSON.stringify({
				weatherCache: writeCachedWeather({}, "Edinburgh", response(11), NOW),
			}),
		);
		const stored = storage.getItem("store");
		expect(stored).not.toBeNull();
		const payload = JSON.parse(stored ?? "{}") as { weatherCache?: unknown };
		const revived = sanitizeWeatherCache(payload.weatherCache);
		const hit = readCachedWeather(revived, "Edinburgh", NOW, FRESH_FOR);
		expect(hit?.current_condition[0]?.temp_C).toBe(11);
	});
});

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

type StoreModule = typeof import("../store");

interface StubStorage {
	readonly map: Map<string, string>;
	readonly setItem: (key: string, value: string) => void;
	readonly getItem: (key: string) => string | null;
	quotaExceeded: boolean;
	writes: number;
}

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

const loadStore = async (storage: StubStorage): Promise<StoreModule> => {
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

const settle = () => new Promise<void>((r) => setTimeout(r, 50));

describe("store / persistence survives a full quota", () => {
	let storage: StubStorage;
	let mod: StoreModule;
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

		mod.store.darkMode = false;
		mod.store.search = "quota";
		await settle();

		expect(storage.writes).toBeGreaterThan(before);
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
		const oversized: Record<string, unknown> = {};
		for (let i = 0; i < 200; i++) {
			oversized[`City${i}`] = entry(Date.now() - i);
		}
		const seed = JSON.stringify({ darkMode: false, weatherCache: oversized });
		const reloaded = await loadStore(createStorage(seed));

		expect(Object.keys(reloaded.store.weatherCache)).toHaveLength(
			WEATHER_CACHE_MAX_ENTRIES,
		);
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
		const mod2 = await loadStoreThrowingStorage();
		mod2.store.darkMode = false;
		await settle();
		expect(mod2.store.darkMode).toBe(false);
		expect(mod2.getPersistenceError()).toBe("unavailable");
	});
});

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
