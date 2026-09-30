import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	createWikiEventsCache,
	type StorageLike,
	WIKI_CACHE_MAX_ENTRIES,
	WIKI_CACHE_STORAGE_KEY,
	WIKI_CACHE_TTL_MS,
	type WikiEvents,
} from "../wikiCache";

/**
 * Tests for the "on this day" cache in `wikiCache.ts`.
 *
 * The cache is a pure class with two test seams — an injected clock and an
 * injected `Storage` — so everything here runs without a DOM, without a real
 * `localStorage` and without touching the network. `store.ts` only wires it
 * up; the wiring itself is covered in `store-wiki-cache.test.ts`.
 */

const DAY = 24 * 60 * 60 * 1000;

/** A clock the test owns. */
const clock = (start: number) => {
	let now = start;
	return {
		now: () => now,
		advance: (ms: number) => {
			now += ms;
		},
	};
};

/**
 * A `Storage` stub that records writes and can be made to fail, which is the
 * only way to prove the boot path survives a hostile storage.
 */
const memoryStorage = (seed?: Record<string, string>) => {
	const map = new Map<string, string>(Object.entries(seed ?? {}));
	const writes: string[] = [];
	let failOnWrite = false;
	let failOnRead = false;
	const storage: StorageLike = {
		getItem: (k: string) => {
			if (failOnRead) throw new Error("storage read blocked");
			return map.get(k) ?? null;
		},
		setItem: (k: string, v: string) => {
			if (failOnWrite) throw new Error("QuotaExceededError");
			map.set(k, v);
			writes.push(k);
		},
		removeItem: (k: string) => {
			map.delete(k);
		},
	};
	return {
		map,
		writes,
		storage,
		breakWrites: (v: boolean) => {
			failOnWrite = v;
		},
		breakReads: (v: boolean) => {
			failOnRead = v;
		},
		/** The persisted envelope, parsed. */
		read: (): unknown => JSON.parse(map.get(WIKI_CACHE_STORAGE_KEY) ?? "null"),
		/** The persisted envelope, as raw text (may be corrupt). */
		raw: () => map.get(WIKI_CACHE_STORAGE_KEY) ?? null,
	};
};

/** A distinct array every call, so reference equality never accidentally holds. */
const events = (year: number, text = `event ${year}`): WikiEvents => [
	{ text, year },
];

const cache = (
	options: {
		maxEntries?: number;
		ttlMs?: number;
		storage?: StorageLike | undefined;
		now?: () => number;
	} = {},
) =>
	createWikiEventsCache({
		maxEntries: options.maxEntries ?? 4,
		ttlMs: options.ttlMs ?? 1000,
		storage: () => options.storage,
		...(options.now ? { now: options.now } : {}),
	});

let consoleError: typeof console.error;
beforeEach(() => {
	consoleError = console.error;
	console.error = () => {};
});
afterEach(() => {
	console.error = consoleError;
});

// --- bounds and LRU ------------------------------------------------------

describe("wikiCache / LRU bound", () => {
	test("never holds more than the cap, evicting the least recently used", () => {
		const c = cache({ maxEntries: 3 });
		c.set("a", events(1));
		c.set("b", events(2));
		c.set("c", events(3));
		expect(c.keys()).toEqual(["a", "b", "c"]);

		// A re-write is the only thing that counts as a use, so re-writing
		// "a" makes "b" the eviction victim.
		c.set("a", events(1));
		expect(c.keys()).toEqual(["b", "c", "a"]);

		c.set("d", events(4));
		expect(c.size).toBe(3);
		expect(c.keys()).toEqual(["c", "a", "d"]);
		expect(c.get("b")).toBeUndefined();
		expect(c.get("a")).toEqual(events(1));
	});

	test("a load promotes its key, on a cold fetch and on a warm hit alike", async () => {
		const c = cache({ maxEntries: 3 });
		await c.load("a", async () => events(1));
		await c.load("b", async () => events(2));
		expect(c.keys()).toEqual(["a", "b"]);

		// warm: no fetch, but a real read, so "a" is now the most recent
		let calls = 0;
		await c.load("a", async () => {
			calls++;
			return events(1);
		});
		expect(calls).toBe(0);
		expect(c.keys()).toEqual(["b", "a"]);

		await c.load("c", async () => events(3));
		expect(c.keys()).toEqual(["b", "a", "c"]);
	});

	test("a read does not reorder the cache", () => {
		// A mirror re-sync that reads every key must not make the LRU order
		// depend on read order, or the eviction victim becomes arbitrary.
		const c = cache({ maxEntries: 3 });
		c.set("a", events(1));
		c.set("b", events(2));
		c.set("c", events(3));
		expect(c.get("a")).toEqual(events(1));
		expect(c.get("b")).toEqual(events(2));
		expect(c.keys()).toEqual(["a", "b", "c"]);
	});

	test("a plain insert overflow evicts in insertion order", () => {
		const c = cache({ maxEntries: 2 });
		c.set("a", events(1));
		c.set("b", events(2));
		c.set("c", events(3));
		expect(c.keys()).toEqual(["b", "c"]);
	});

	test("an authoritative re-write of equal content still restarts the TTL", () => {
		// `set` is what `load` uses after a real fetch. Even if the upstream
		// answer is unchanged, the entry was just re-obtained, so the window
		// restarts. The mirror-replay guard lives in `sync`, not here.
		const time = clock(0);
		const c = cache({ ttlMs: 100, now: time.now });
		c.set("a", events(1));
		time.advance(90);
		c.set("a", events(1));
		time.advance(20);
		expect(c.get("a")).toEqual(events(1));
	});

	test("two objects with equal content are the same entry, not a re-fetch", () => {
		// A Valtio proxy hands out a fresh wrapper on every read, so identity
		// comparison would call every mirror replay a new write.
		const c = cache();
		c.set("a", events(1));
		expect(c.set("a", events(1))).toEqual(events(1));
		expect(c.size).toBe(1);
	});

	test("the real key space cannot outgrow the documented cap", () => {
		// 5 supported languages x 366 days.
		const keySpace = 5 * 366;
		expect(keySpace).toBeGreaterThan(WIKI_CACHE_MAX_ENTRIES);
		const c = createWikiEventsCache({ storage: () => undefined });
		for (let i = 0; i < keySpace; i++) c.set(`en-01-${i}`, events(1969 + i));
		expect(c.size).toBe(WIKI_CACHE_MAX_ENTRIES);
		expect(c.size).toBe(64);
	});
});

// --- TTL -----------------------------------------------------------------

describe("wikiCache / TTL", () => {
	test("an entry is served until the TTL elapses, then drops out", () => {
		const time = clock(1_000_000);
		const c = cache({ ttlMs: WIKI_CACHE_TTL_MS, now: time.now });
		c.set("en-01-01", events(1969));

		time.advance(WIKI_CACHE_TTL_MS - 1);
		expect(c.get("en-01-01")).toEqual(events(1969));

		time.advance(2);
		expect(c.get("en-01-01")).toBeUndefined();
		// `get` is a pure read; the entry is reaped by `sweep`/`sync`
		expect(c.sweep()).toEqual(["en-01-01"]);
		expect(c.size).toBe(0);
	});

	test("a re-fetch after expiry starts a new TTL window", () => {
		const time = clock(0);
		const c = cache({ ttlMs: 100, now: time.now });
		c.set("k", events(1));
		time.advance(150);
		expect(c.get("k")).toBeUndefined();
		c.set("k", events(2));
		time.advance(99);
		expect(c.get("k")).toEqual(events(2));
		time.advance(2);
		expect(c.get("k")).toBeUndefined();
	});

	test("a mirror replay does not extend the TTL window", () => {
		// The store bridge replays its mirror on every notification. If that
		// replay could refresh `storedAt`, one live proxy would pin every key
		// in it past its TTL forever and the TTL would be decorative.
		const time = clock(0);
		const c = cache({ ttlMs: 100, now: time.now });
		const mirror: Record<string, WikiEvents> = { k: events(1) };
		expect(c.sync(mirror)).toEqual({});

		// replay at 90ms: still fresh, admitted, window not restarted
		time.advance(90);
		expect(c.sync({ ...mirror })).toEqual({});

		// 5ms later it is still the entry written at t=0, not a new one
		time.advance(5);
		expect(c.get("k")).toEqual(events(1));

		// and it expires on the original schedule, not 10ms after the replay.
		// `undefined` is the instruction to drop the key from the mirror.
		time.advance(20);
		expect(c.get("k")).toBeUndefined();
		expect(c.sync(mirror)).toEqual({ k: undefined });
		expect(c.size).toBe(0);
	});

	test("a mirror replay cannot resurrect an expired entry", () => {
		const time = clock(0);
		const c = cache({ ttlMs: 100, now: time.now });
		const mirror: Record<string, WikiEvents> = { k: events(1) };
		c.sync(mirror);

		time.advance(150);
		expect(c.sync(mirror)).toEqual({ k: undefined });
		expect(c.size).toBe(0);
		expect(c.get("k")).toBeUndefined();
	});

	test("a mirror entry with genuinely new content is admitted and refreshes the TTL", () => {
		const time = clock(0);
		const c = cache({ ttlMs: 100, now: time.now });
		expect(c.sync({ k: events(1) })).toEqual({});
		time.advance(90);
		expect(c.sync({ k: events(2) })).toEqual({});
		time.advance(90);
		expect(c.get("k")).toEqual(events(2));
	});

	test("a mirror write that fails validation restores the good cached value", () => {
		const c = cache();
		c.sync({ k: events(1) });
		// A rejected payload is not data, but the entry already cached under
		// this key is. The mirror is told to put it back, not to drop the key.
		const corrections = c.sync({ k: "not an array" });
		expect(corrections).toEqual({ k: events(1) });
		expect(c.get("k")).toEqual(events(1));
	});

	test("a mirror write that fails validation with no cached fallback drops the key", () => {
		const c = cache();
		expect(c.sync({ k: { nope: true } })).toEqual({ k: undefined });
		expect(c.size).toBe(0);
	});

	test("sweep drops expired entries and reports the keys", () => {
		const time = clock(0);
		const c = cache({ maxEntries: 8, ttlMs: 100, now: time.now });
		c.set("old", events(1));
		time.advance(50);
		c.set("new", events(2));
		time.advance(60);

		expect(c.sweep()).toEqual(["old"]);
		expect(c.keys()).toEqual(["new"]);
	});

	test("an entry stamped in the future is not trusted", () => {
		// a clock that jumped backwards, or a hand-edited payload, must not
		// produce an entry that looks infinitely fresh
		const now = Date.now();
		const store = memoryStorage({
			[WIKI_CACHE_STORAGE_KEY]: JSON.stringify({
				v: 1,
				entries: [
					{ key: "skewed", storedAt: now + 30 * DAY, value: events(1969) },
					{ key: "sane", storedAt: now, value: events(1970) },
				],
			}),
		});
		const c = cache({ storage: store.storage, now: () => now });
		expect(c.keys()).toEqual(["sane"]);
		expect(c.get("skewed")).toBeUndefined();
	});

	test("a mild forward skew (NTP drift) is tolerated", () => {
		const now = Date.now();
		const store = memoryStorage({
			[WIKI_CACHE_STORAGE_KEY]: JSON.stringify({
				v: 1,
				entries: [{ key: "k", storedAt: now + 60_000, value: events(1969) }],
			}),
		});
		const c = cache({ storage: store.storage, now: () => now });
		expect(c.get("k")).toEqual(events(1969));
	});
});

// --- in-flight de-duplication -------------------------------------------

describe("wikiCache / in-flight de-duplication", () => {
	test("N simultaneous consumers of one key cause exactly one fetch", async () => {
		const c = cache();
		let calls = 0;
		let release = (): void => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const fetcher = async () => {
			calls++;
			await gate;
			return events(1969);
		};

		const all = Promise.all([
			c.load("en-09-01", fetcher),
			c.load("en-09-01", fetcher),
			c.load("en-09-01", fetcher),
			c.load("en-09-01", fetcher),
		]);
		release();
		const results = await all;

		expect(calls).toBe(1);
		for (const r of results) expect(r).toEqual(events(1969));
		expect(c.get("en-09-01")).toEqual(events(1969));
	});

	test("different keys are fetched independently", async () => {
		const c = cache();
		const seen: string[] = [];
		const fetcher = (year: number) => async () => {
			seen.push(String(year));
			return events(year);
		};
		await Promise.all([
			c.load("en-09-01", fetcher(1)),
			c.load("en-09-02", fetcher(2)),
		]);
		expect(seen.sort()).toEqual(["1", "2"]);
	});

	test("a warm cache serves without fetching at all", async () => {
		const c = cache();
		c.set("en-09-01", events(1969));
		let calls = 0;
		const value = await c.load("en-09-01", async () => {
			calls++;
			return events(1970);
		});
		expect(calls).toBe(0);
		expect(value).toEqual(events(1969));
	});

	test("a rejected fetch is not cached and does not poison the next attempt", async () => {
		const c = cache();
		let calls = 0;
		const flaky = async () => {
			calls++;
			throw new Error("503 from Wikimedia");
		};

		await expect(c.load("en-09-01", flaky)).rejects.toThrow("503");
		expect(c.get("en-09-01")).toBeUndefined();
		expect(c.size).toBe(0);

		// the in-flight slot was released, so a retry really refetches
		const recovered = await c.load("en-09-01", async () => events(1969));
		expect(calls).toBe(1);
		expect(recovered).toEqual(events(1969));
		expect(c.get("en-09-01")).toEqual(events(1969));
	});

	test("concurrent consumers all see the failure, and all can retry", async () => {
		const c = cache();
		let calls = 0;
		const flaky = async () => {
			calls++;
			await Promise.resolve();
			throw new Error("boom");
		};
		const both = await Promise.allSettled([
			c.load("k", flaky),
			c.load("k", flaky),
		]);
		expect(both.every((r) => r.status === "rejected")).toBe(true);
		expect(calls).toBe(1);
		expect(c.size).toBe(0);
	});

	test("a payload that fails validation is not cached", async () => {
		const c = cache();
		await expect(
			c.load("k", async () => [{ text: "no year" }] as unknown as WikiEvents),
		).rejects.toThrow(/not cached/);
		expect(c.size).toBe(0);
	});
});

// --- validation ----------------------------------------------------------

describe("wikiCache / mirror reconciliation", () => {
	test("a mirror larger than the cap is trimmed to the most recent keys", () => {
		const c = cache({ maxEntries: 4 });
		const mirror: Record<string, WikiEvents> = {};
		for (let i = 0; i < 20; i++) mirror[`k${i}`] = events(1900 + i);

		const corrections = c.sync(mirror);
		// 16 keys are gone; the 4 newest stay
		expect(Object.keys(corrections)).toHaveLength(16);
		expect(corrections.k19).toBeUndefined();
		expect(corrections.k0).toBeUndefined();
		expect(corrections.k15).toBeUndefined();
		expect(c.size).toBe(4);
		expect(c.keys()).toEqual(["k16", "k17", "k18", "k19"]);
	});

	test("evictions are reported even though they happen inside the admit loop", () => {
		// Eviction is a side effect of a *later* insert, so a caller that only
		// checked each write's own return value would miss it entirely.
		const c = cache({ maxEntries: 2 });
		const corrections = c.sync({ a: events(1), b: events(2), c: events(3) });
		expect(Object.keys(corrections).sort()).toEqual(["a"]);
		expect(c.keys()).toEqual(["b", "c"]);
	});

	test("a key the cache holds but the mirror does not is left alone", () => {
		const c = cache({ maxEntries: 4 });
		c.set("kept", events(1));
		// the mirror does not know about it; sync must not invent a removal
		expect(c.sync({ other: events(2) })).toEqual({});
		expect(c.get("kept")).toEqual(events(1));
	});

	test("the whole key space reconciles down to the cap", () => {
		const c = createWikiEventsCache({ storage: () => undefined });
		const mirror: Record<string, WikiEvents> = {};
		for (const lang of ["en", "fr", "es", "de", "zh"]) {
			for (let day = 1; day <= 366; day++) {
				const mm = String(Math.ceil(day / 31)).padStart(2, "0");
				const dd = String(((day - 1) % 31) + 1).padStart(2, "0");
				mirror[`${lang}-${mm}-${dd}`] = events(1900 + day);
			}
		}
		const corrections = c.sync(mirror);
		expect(Object.keys(corrections)).toHaveLength(
			1830 - WIKI_CACHE_MAX_ENTRIES,
		);
		expect(c.size).toBe(WIKI_CACHE_MAX_ENTRIES);
	});
});

describe("wikiCache / validation", () => {
	test("a value that does not match the schema is refused", () => {
		const c = cache();
		expect(c.set("k", { not: "an array" })).toBeUndefined();
		expect(c.set("k", [{ year: "1969" }])).toBeUndefined();
		expect(c.size).toBe(0);
	});

	test("a refused write leaves an existing good entry alone", () => {
		const c = cache();
		c.set("k", events(1969));
		expect(c.set("k", "nope")).toBeUndefined();
		expect(c.get("k")).toEqual(events(1969));
	});

	test("an over-long list is refused", () => {
		const c = cache();
		const huge: WikiEvents = Array.from({ length: 51 }, (_, i) => ({
			text: `e${i}`,
			year: 1900 + i,
		}));
		expect(c.set("k", huge)).toBeUndefined();
		expect(c.size).toBe(0);
	});

	test("the source article survives a round trip", () => {
		const c = cache();
		const withSource: WikiEvents = [
			{
				pages: [{ title: "Moon landing", url: "https://en.wikipedia.org/…" }],
				text: "x",
				year: 1969,
			},
		];
		c.set("k", withSource);
		expect(c.get("k")).toEqual(withSource);
	});
});

// --- persistence ---------------------------------------------------------

describe("wikiCache / persistence", () => {
	test("entries survive a reload, and a fresh instance serves them without fetching", async () => {
		const time = clock(0);
		const store = memoryStorage();
		const first = cache({
			storage: store.storage,
			now: time.now,
			ttlMs: 1_000_000,
		});
		first.set("en-09-01", events(1969));
		time.advance(1000);
		first.set("en-09-02", events(1970));
		expect(store.writes.length).toBe(2);
		expect(store.read()).toMatchObject({ v: 1 });

		// "reload"
		const second = cache({
			storage: store.storage,
			now: time.now,
			ttlMs: 1_000_000,
		});
		expect(second.size).toBe(2);
		expect(second.get("en-09-01")).toEqual(events(1969));
		// LRU order is preserved across the round trip, oldest first
		expect(second.keys()).toEqual(["en-09-01", "en-09-02"]);

		// and no request is made for a warm key
		let calls = 0;
		const served = await second.load("en-09-01", async () => {
			calls++;
			return events(1900);
		});
		expect(calls).toBe(0);
		expect(served).toEqual(events(1969));
	});

	test("hydration keeps the newest entries when the payload is over the cap", () => {
		const time = clock(0);
		const store = memoryStorage();
		const big = cache({
			maxEntries: 64,
			ttlMs: 1_000_000,
			storage: store.storage,
			now: time.now,
		});
		for (let i = 0; i < 64; i++) {
			big.set(`k${i}`, events(1900 + i));
			time.advance(10);
		}

		// a small cache re-reads the same payload
		const small = cache({
			maxEntries: 10,
			ttlMs: 1_000_000,
			storage: store.storage,
			now: time.now,
		});
		expect(small.size).toBe(10);
		// the ten most recently stored survive, i.e. the last ten written
		expect(small.get("k63")).toEqual(events(1963));
		expect(small.get("k0")).toBeUndefined();
		// and LRU order still runs oldest-first, so the next write evicts k54
		expect(small.keys()).toEqual([
			"k54",
			"k55",
			"k56",
			"k57",
			"k58",
			"k59",
			"k60",
			"k61",
			"k62",
			"k63",
		]);
		small.set("k64", events(1964));
		expect(small.get("k54")).toBeUndefined();
	});

	test("hydration drops expired entries and rewrites a sanitized payload", () => {
		const time = clock(0);
		const store = memoryStorage();
		const first = cache({ ttlMs: 100, storage: store.storage, now: time.now });
		first.set("old", events(1));
		const before = store.raw();
		time.advance(150);
		first.set("kept", events(2));

		time.advance(200); // "old" is now 350ms old, "kept" is 200ms old
		const second = cache({ ttlMs: 300, storage: store.storage, now: time.now });
		expect(second.keys()).toEqual(["kept"]);
		expect(store.raw()).not.toBe(before);
		const written = store.read() as { entries: { key: string }[] };
		expect(written.entries.map((e) => e.key)).toEqual(["kept"]);
	});

	test("hydration salvages the good entries out of a partly-bad payload", () => {
		// One bad entry must not cost the visitor the other 63 keys.
		const now = Date.now();
		const entries: {
			key: string;
			storedAt: number;
			value: unknown;
		}[] = Array.from({ length: 4 }, (_, i) => ({
			key: `k${i}`,
			storedAt: now + i,
			value: events(1900 + i),
		}));
		entries[2] = { key: "bad", storedAt: now, value: { nope: true } };
		const store = memoryStorage({
			[WIKI_CACHE_STORAGE_KEY]: JSON.stringify({ v: 1, entries }),
		});
		const c = cache({ storage: store.storage, now: () => now + 10 });
		expect(c.size).toBe(3);
		expect(c.get("bad")).toBeUndefined();
		// the sanitized copy was written back
		const written = store.read() as { entries: { key: string }[] };
		expect(written.entries.map((e) => e.key).sort()).toEqual([
			"k0",
			"k1",
			"k3",
		]);
	});

	test("an absent payload boots clean", () => {
		const store = memoryStorage();
		const c = cache({ storage: store.storage });
		expect(c.size).toBe(0);
		expect(c.snapshot()).toEqual({});
	});

	test("a missing storage (SSR) boots clean and still caches in memory", () => {
		const c = cache({ storage: undefined });
		expect(c.size).toBe(0);
		c.set("k", events(1969));
		expect(c.get("k")).toEqual(events(1969));
	});

	test.each([
		["a non-JSON string", "{not json"],
		["a JSON string of the wrong shape", '"hello"'],
		["a payload from an older version", JSON.stringify({ v: 0, entries: [] })],
		[
			"an entry whose value does not match the schema",
			JSON.stringify({
				v: 1,
				entries: [{ key: "bad", storedAt: Date.now(), value: { nope: true } }],
			}),
		],
		[
			"an entry with a non-finite timestamp",
			JSON.stringify({
				v: 1,
				entries: [{ key: "bad", storedAt: "soon", value: [] }],
			}),
		],
		[
			"an entry with an over-long key",
			JSON.stringify({
				v: 1,
				entries: [{ key: "k".repeat(500), storedAt: Date.now(), value: [] }],
			}),
		],
		[
			"an entry with an empty key",
			JSON.stringify({
				v: 1,
				entries: [{ key: "", storedAt: Date.now(), value: [] }],
			}),
		],
		["a null payload", "null"],
		["a bare number", "42"],
		[
			"an absurdly large payload",
			JSON.stringify({
				v: 1,
				entries: Array.from({ length: WIKI_CACHE_MAX_ENTRIES * 4 }, (_, i) => ({
					key: `k${i}`,
					storedAt: Date.now(),
					value: [],
				})),
			}),
		],
	])("tolerates %s", (_label, raw) => {
		const store = memoryStorage({ [WIKI_CACHE_STORAGE_KEY]: raw });
		const c = cache({ storage: store.storage });
		expect(c.size).toBe(0);
		// and it is usable afterwards
		c.set("k", events(1969));
		expect(c.get("k")).toEqual(events(1969));
	});

	test("a payload that is not an object at all", () => {
		const store = memoryStorage({ [WIKI_CACHE_STORAGE_KEY]: "[]" });
		expect(cache({ storage: store.storage }).size).toBe(0);
	});
});

// --- hostile storage -----------------------------------------------------

describe("wikiCache / hostile storage never breaks the page", () => {
	test("a storage whose getItem throws boots to an empty cache", () => {
		const store = memoryStorage();
		store.breakReads(true);
		const c = cache({ storage: store.storage });
		expect(c.size).toBe(0);
		store.breakReads(false);
		c.set("k", events(1969));
		expect(c.get("k")).toEqual(events(1969));
	});

	test("a storage whose setItem throws (quota, private mode) is non-fatal", () => {
		const store = memoryStorage();
		const c = cache({ storage: store.storage });
		store.breakWrites(true);
		expect(() => c.set("k", events(1969))).not.toThrow();
		expect(c.get("k")).toEqual(events(1969));
		expect(c.size).toBe(1);
		store.breakWrites(false);
		// and the next write lands normally
		c.set("k2", events(1970));
		expect(store.read()).toMatchObject({ v: 1 });
	});

	test("a storage getter that throws is survivable", () => {
		const c = createWikiEventsCache({
			storage: () => {
				throw new Error("blocked by policy");
			},
		});
		expect(c.size).toBe(0);
		expect(() => c.set("k", events(1969))).not.toThrow();
		expect(c.get("k")).toEqual(events(1969));
	});
});
