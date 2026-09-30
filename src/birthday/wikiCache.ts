import { z } from "zod";

/**
 * A bounded, TTL'd, de-duplicating cache for the Wikimedia "on this day"
 * feed.
 *
 * Why this is not just a `Record<string, WikiEvent[]>` hanging off a Valtio
 * proxy:
 *
 *   - `dataStore` has no `subscribe`, so the old cache died with the page:
 *     every reload re-fetched a payload that never changes;
 *   - the key space is 5 supported languages x 366 days = 1,830 keys, and
 *     nothing was ever evicted, so the cache only ever grew;
 *   - there was no TTL, so a stale entry was served forever;
 *   - there was no in-flight de-duplication, so N components mounting at once
 *     fired N identical requests at a free, keyless public API.
 *
 * Wikimedia's terms ask for reasonable request etiquette, so the invariants
 * that matter are: one request per key per TTL window, never more than
 * `WIKI_CACHE_MAX_ENTRIES` keys held, and a failed response is never stored as
 * if it were data.
 */

/** The wikipedia article an event was extracted from (attribution target). */
const WikiPageSchema = z.object({
	title: z.string(),
	url: z.string(),
});

/**
 * One "on this day" event.
 *
 * `pages` is optional because the API omits it for the rare event with no
 * source article; it is kept in the cached value so the attribution link
 * survives a reload instead of degrading to plain text.
 */
export const WikiEventSchema = z.object({
	pages: z.array(WikiPageSchema).optional(),
	text: z.string(),
	year: z.number(),
});

export type WikiEvent = z.infer<typeof WikiEventSchema>;

/**
 * A cached response is a list of events.
 *
 * The cap is a safety net against an unbounded blob in `localStorage`, not a
 * product decision: `OnThisDay.tsx` truncates to 5 events before caching, and
 * this bound is set well above that so raising `MAX_EVENTS` there does not
 * silently start rejecting writes.
 */
export const WikiEventsSchema = z.array(WikiEventSchema).max(50);

export type WikiEvents = z.infer<typeof WikiEventsSchema>;

/** The cache key is `${lang}-${MM}-${dd}`, so a few characters plus slack. */
const MAX_KEY_LENGTH = 32;

/**
 * How many keys to keep.
 *
 * A visitor realistically reads the panel for a handful of days, in one
 * language at a time; 64 covers e.g. every day of a two-month window in the
 * current language, or ~13 days across all five supported languages, with
 * room to spare. It is also comfortably inside the ~5 MB `localStorage` budget
 * even in the pathological case: 64 keys x 50 events x ~1 KB of summary text
 * is ~3 MB, and the realistic 5-events-per-key payload is three orders of
 * magnitude smaller (~50 KB total).
 *
 * Anything evicted here is simply re-fetched on demand, so a wrong guess costs
 * a request, never correctness.
 */
export const WIKI_CACHE_MAX_ENTRIES = 64;

/**
 * How long an entry stays fresh: 30 days.
 *
 * The payload is settled history — a list of things that happened on a past
 * calendar day — so it does not go stale the way weather or birthdays do, and
 * the only realistic upstream change is an editorial fix. A month is long
 * enough that a returning visitor's cached day is still there (so a reload
 * costs zero requests, which is the whole point of persisting), yet short
 * enough that a visitor who browses months apart eventually picks up upstream
 * corrections, and that a long-idle browser never serves an entry from the
 * previous year.
 */
export const WIKI_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How far into the future a `storedAt` may sit and still be trusted. A clock
 * that jumped backwards, or a hand-edited payload, would otherwise make an
 * entry look infinitely fresh; one day of slack absorbs ordinary NTP drift.
 */
const CLOCK_SKEW_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/** `localStorage` key. Deliberately not `store`: the wiki cache is a cache,
 * not UI state, and the main store's schema should not have to carry it. */
export const WIKI_CACHE_STORAGE_KEY = "wikiCache";

/** Bumped whenever the persisted shape changes; older payloads are dropped. */
const STORAGE_VERSION = 1;

const StoredEntrySchema = z.object({
	key: z.string().min(1).max(MAX_KEY_LENGTH),
	storedAt: z.number().finite(),
	value: z.unknown(),
});

/**
 * The persisted envelope.
 *
 * The array length is bounded at twice the in-memory cap so an oversized or
 * hostile payload is rejected before its contents are validated, and the
 * caller re-persists a sanitized copy afterwards.
 */
const StoredCacheSchema = z.object({
	v: z.literal(STORAGE_VERSION),
	entries: z.array(StoredEntrySchema).max(WIKI_CACHE_MAX_ENTRIES * 2),
});

type StoredEntry = z.infer<typeof StoredEntrySchema>;

type CacheEntry<T> = {
	/**
	 * A content fingerprint of the value.
	 *
	 * Reference equality is not usable for the "is this the same data?"
	 * question the store bridge has to answer: a Valtio proxy hands out a
	 * fresh wrapper on every read, so the *same* logical value arrives as a
	 * different object each time. Comparing the serialized form instead makes
	 * a re-sync idempotent, which is what stops a replayed mirror from
	 * resetting `storedAt` on every notification.
	 */
	fingerprint: string;
	storedAt: number;
	value: T;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type WikiCacheOptions<T> = {
	/** Every value entering the cache — from a fetch or from storage — is
	 * validated with this, so a malformed payload can never be served. */
	schema: z.ZodType<T>;
	maxEntries?: number;
	ttlMs?: number;
	storageKey?: string;
	/** Test seam for the wall clock. */
	now?: () => number;
	/** Test seam for storage; defaults to `localStorage` when it exists. */
	storage?: () => StorageLike | undefined;
};

const defaultStorage = (): StorageLike | undefined =>
	typeof localStorage === "undefined" ? undefined : localStorage;

/**
 * Resolve the storage or give up.
 *
 * Even *reaching* for `localStorage` can throw — a sandboxed iframe or a
 * strict cookie policy can make the property access itself explode — so the
 * lookup is guarded as well as the calls it returns.
 */
/**
 * A stable-enough content fingerprint. Key order is irrelevant here because
 * every value is produced by the same zod schema, so the key order is fixed.
 */
const fingerprintOf = (value: unknown): string => {
	try {
		return JSON.stringify(value) ?? "undefined";
	} catch {
		// circular or otherwise unserializable: fall back to a marker that
		// never compares equal, so it is treated as a genuine re-fetch
		return `unserializable:${Math.random()}`;
	}
};

const resolveStorage = (
	lookup: () => StorageLike | undefined,
): StorageLike | undefined => {
	try {
		return lookup();
	} catch (e) {
		console.error("onthisday: localStorage is unavailable", e);
		return undefined;
	}
};

/**
 * An LRU + TTL cache.
 *
 * Recency is plain `Map` insertion order: a hit re-inserts its key at the end,
 * so the first key is always the least recently used one and eviction is
 * `entries.keys().next()`. Writes go through `set`, which validates first, and
 * reads through `get`, which enforces the TTL.
 */
class WikiCache<T> {
	readonly #entries = new Map<string, CacheEntry<T>>();
	readonly #inFlight = new Map<string, Promise<T>>();
	/** Mirror keys whose value failed validation on the last `sync`. */
	readonly #rejected = new Set<string>();
	readonly #schema: z.ZodType<T>;
	readonly #maxEntries: number;
	readonly #ttlMs: number;
	readonly #storageKey: string;
	readonly #now: () => number;
	readonly #storage: () => StorageLike | undefined;

	constructor(options: WikiCacheOptions<T>) {
		this.#schema = options.schema;
		this.#maxEntries = options.maxEntries ?? WIKI_CACHE_MAX_ENTRIES;
		this.#ttlMs = options.ttlMs ?? WIKI_CACHE_TTL_MS;
		this.#storageKey = options.storageKey ?? WIKI_CACHE_STORAGE_KEY;
		// Resolved per call rather than captured, so a test that swaps the
		// clock (`setSystemTime`) is honoured.
		this.#now = options.now ?? (() => Date.now());
		this.#storage = options.storage ?? defaultStorage;
		this.#hydrate();
	}

	/** Number of live (non-expired) entries. */
	get size(): number {
		return this.#entries.size;
	}

	/** Live keys, most recently used first. */
	keys(): string[] {
		return [...this.#entries.keys()];
	}

	/** A plain object copy, most recently used first — what a Valtio mirror
	 * should be seeded with. Expired entries are never included. */
	snapshot(): Record<string, T> {
		const out: Record<string, T> = {};
		for (const [key, entry] of this.#entries) out[key] = entry.value;
		return out;
	}

	/**
	 * Read a key, or `undefined` if it is missing, expired or was stamped too
	 * far in the future.
	 *
	 * A read is *not* a use for LRU purposes, and it does not mutate: recency
	 * here means "recently obtained", and this cache is read through `load()`,
	 * which promotes. Making `get` reorder would make `keys()` depend on who
	 * happened to look at what; making it evict would make a plain read
	 * destructive, so expiry is left to `sweep()`/`sync()`.
	 */
	get(key: string): T | undefined {
		const entry = this.#entries.get(key);
		if (entry === undefined || !this.#isFresh(entry)) return undefined;
		return entry.value;
	}

	/**
	 * Store a value.
	 *
	 * Returns the stored value, or `undefined` when the value did not validate
	 * — an unvalidated payload is not data, so it is dropped on the floor
	 * rather than cached.
	 *
	 * An authoritative write: this is data that was just obtained, so it
	 * replaces whatever was there and restarts the TTL window.
	 *
	 * Returns the stored value, or `undefined` when the value did not validate
	 * — an unvalidated payload is not data, so it is dropped on the floor
	 * rather than cached. An existing good entry is left untouched when this
	 * write is rejected.
	 */
	set(key: string, raw: unknown): T | undefined {
		const parsed = this.#schema.safeParse(raw);
		if (!parsed.success) return undefined;
		this.#entries.delete(key);
		this.#entries.set(key, {
			fingerprint: fingerprintOf(parsed.data),
			storedAt: this.#now(),
			value: parsed.data,
		});
		this.#enforceBound();
		this.#persist();
		return parsed.data;
	}

	/**
	 * A non-authoritative write, for replaying a mirror this cache does not
	 * own (`sync` below).
	 *
	 * The distinction is not academic. A mirror notifies on every change and is
	 * replayed in full, so if admitting a mirror could refresh an entry, a
	 * single live proxy would pin every key in it past its TTL forever and the
	 * TTL would be decorative. So:
	 *
	 *   - a key the cache does not hold is admitted (it is new to us);
	 *   - a key it holds with the same content is a replay: promoted for LRU,
	 *     `storedAt` untouched, and **dropped if it has already expired**;
	 *   - a key it holds with different content is genuine new data, so it
	 *     replaces the entry and restarts the window.
	 *
	 * The one case this cannot distinguish is a real re-fetch of expired data
	 * that comes back byte-identical. It is treated as a replay and not
	 * retained. That is the safe direction to be wrong in: the cost is one
	 * request on a later visit, whereas the alternative is a cache that never
	 * expires.
	 */
	#admit(key: string, raw: unknown): void {
		const existing = this.#entries.get(key);
		if (existing !== undefined && existing.fingerprint === fingerprintOf(raw)) {
			if (this.#isFresh(existing)) {
				this.#promote(key, existing);
				return;
			}
			// Expired: drop it. A replay must not resurrect a stale entry.
			this.#entries.delete(key);
			return;
		}
		if (this.set(key, raw) === undefined) {
			// The write was rejected. Any previously cached value is untouched
			// and still good data, so the caller is told to restore it over the
			// mirror's bad value rather than dropping the key.
			this.#rejected.add(key);
		}
	}

	/**
	 * Read-through with in-flight de-duplication.
	 *
	 * Concurrent callers for the same key share one promise, so a page that
	 * mounts several `OnThisDay` panels at once still makes exactly one
	 * request. A rejection is *not* cached: the in-flight entry is dropped so
	 * the next caller retries, and nothing is written to storage.
	 */
	load(key: string, fetcher: () => Promise<T>): Promise<T> {
		const hit = this.get(key);
		if (hit !== undefined) {
			// A warm hit is a real consumer reading, not a mirror re-sync, so it
			// does count as a use.
			this.#promote(key, this.#entries.get(key));
			return Promise.resolve(hit);
		}
		const pending = this.#inFlight.get(key);
		if (pending !== undefined) return pending;

		const request = (async () => {
			const raw: unknown = await fetcher();
			const stored = this.set(key, raw);
			if (stored === undefined) {
				// A failed response must never be cached as if it were data, so
				// this rejects rather than storing `undefined`/`[]`.
				throw new Error(
					`onthisday: rejected the payload for "${key}"; it was not cached`,
				);
			}
			// A successful fetch is the definition of "most recently used".
			this.#promote(key, this.#entries.get(key));
			return stored;
		})();

		this.#inFlight.set(key, request);
		// both outcomes clear the slot; the second handler also keeps the
		// rejection from being reported as unhandled
		const settle = () => {
			if (this.#inFlight.get(key) === request) this.#inFlight.delete(key);
		};
		request.then(settle, settle);
		return request;
	}

	/** Drop every expired entry; returns the keys that were dropped, so a
	 * mirror of this cache knows what to remove. */
	sweep(): string[] {
		const dropped: string[] = [];
		for (const [key, entry] of this.#entries) {
			if (!this.#isFresh(entry)) {
				this.#entries.delete(key);
				dropped.push(key);
			}
		}
		return dropped;
	}

	/**
	/**
	 * Admit a whole record — a reactive mirror owned by another module — and
	 * return the corrections its owner must apply.
	 *
	 * Reconciling the mirror against the cache's live key set (rather than
	 * merely reporting each write's outcome) is what makes the bound
	 * enforceable. Evictions happen *inside* `set`, as a side effect of a later
	 * insert, so by the time the admit loop finishes the cache may already have
	 * dropped keys the caller happily still holds. Computing the diff
	 * afterwards catches all three cases in one place:
	 *
	 *   - a key the cache evicted as over-cap, or dropped as expired;
	 *   - a key whose value failed validation and has no cached fallback;
	 *   - a key whose mirror value was rejected but for which a good entry is
	 *     still cached, which is restored rather than deleted.
	 *
	 * A value of `undefined` means "delete this key"; anything else means
	 * "overwrite it with this". Mirror writes are admitted, not authoritative —
	 * see `#admit`.
	 */
	sync(mirror: Record<string, unknown>): Record<string, T | undefined> {
		for (const key of Object.keys(mirror)) this.#admit(key, mirror[key]);
		this.sweep();

		const live = new Set(this.#entries.keys());
		const corrections: Record<string, T | undefined> = {};
		for (const key of Object.keys(mirror)) {
			if (this.#rejected.has(key)) {
				// The mirror holds something the cache refused. Put the good
				// cached value back if there is one, otherwise drop the key —
				// a rejected payload is not data and must not stay readable.
				corrections[key] = live.has(key)
					? this.#entries.get(key)?.value
					: undefined;
				continue;
			}
			// Evicted as over-cap, or dropped as expired: the cache no longer
			// holds it, so the mirror must not either.
			if (!live.has(key)) corrections[key] = undefined;
		}
		this.#rejected.clear();
		return corrections;
	}

	clear(): void {
		this.#entries.clear();
		this.#persist();
	}

	// --- internals --------------------------------------------------------

	#promote(key: string, entry: CacheEntry<T> | undefined): void {
		if (entry === undefined) return;
		this.#entries.delete(key);
		this.#entries.set(key, entry);
	}

	#isFresh(entry: CacheEntry<T>): boolean {
		const age = this.#now() - entry.storedAt;
		return age < this.#ttlMs && age > -CLOCK_SKEW_TOLERANCE_MS;
	}

	#enforceBound(): string[] {
		const evicted: string[] = [];
		while (this.#entries.size > this.#maxEntries) {
			const oldest = this.#entries.keys().next();
			if (oldest.done === true) break;
			this.#entries.delete(oldest.value);
			evicted.push(oldest.value);
		}
		return evicted;
	}

	/**
	 * Read the persisted cache at boot.
	 *
	 * Every failure mode here — no storage, storage that throws, a missing
	 * key, a non-JSON string, a payload from an older version, an entry with
	 * a bad value — degrades to "start empty" and is swallowed, because a
	 * cache must never be the reason a page fails to boot. Whatever survives
	 * is capped, expired entries are dropped, and the sanitized copy is
	 * written back so the junk does not linger.
	 */
	#hydrate(): void {
		const storage = resolveStorage(this.#storage);
		if (storage === undefined) return;

		let raw: string | null = null;
		try {
			raw = storage.getItem(this.#storageKey);
		} catch (e) {
			console.error("onthisday: could not read the cache", e);
			return;
		}
		if (raw === null) return;

		let parsedJson: unknown;
		try {
			parsedJson = JSON.parse(raw);
		} catch (e) {
			console.error("onthisday: discarding a corrupt cache payload", e);
			return;
		}

		const envelope = StoredCacheSchema.safeParse(parsedJson);
		if (!envelope.success) return;
		const stored: StoredEntry[] = envelope.data.entries;

		// Oldest first, so `#entries` is seeded in LRU order: the head of the
		// map is the eviction candidate. Sorting descending would seed it
		// newest-first and make the next write evict the entry we just kept.
		const ordered = [...stored].sort((a, b) => a.storedAt - b.storedAt);
		let dropped = 0;
		// The cap keeps the *newest* `maxEntries`, so walk from the back and
		// stop once the budget is spent.
		const keepFrom = Math.max(0, ordered.length - this.#maxEntries);
		for (const [index, entry] of ordered.entries()) {
			if (index < keepFrom) {
				dropped++;
				continue;
			}
			const value = this.#schema.safeParse(entry.value);
			if (!value.success) {
				dropped++;
				continue;
			}
			const candidate: CacheEntry<T> = {
				fingerprint: fingerprintOf(value.data),
				storedAt: entry.storedAt,
				value: value.data,
			};
			if (!this.#isFresh(candidate)) {
				dropped++;
				continue;
			}
			this.#entries.set(entry.key, candidate);
		}

		if (dropped > 0) this.#persist();
	}

	/**
	 * Write the live entries back. Quota errors and blocked storage (Safari
	 * private browsing throws on `setItem`) are logged and ignored: the cache
	 * is an optimisation, and losing persistence must not lose the session.
	 */
	#persist(): void {
		const storage = resolveStorage(this.#storage);
		if (storage === undefined) return;
		const entries: StoredEntry[] = [...this.#entries].map(([key, entry]) => ({
			key,
			storedAt: entry.storedAt,
			value: entry.value,
		}));
		const payload = JSON.stringify({ v: STORAGE_VERSION, entries });
		try {
			storage.setItem(this.#storageKey, payload);
		} catch (e) {
			console.error("onthisday: could not persist the cache", e);
		}
	}
}

/** Convenience factory, so callers do not repeat the schema. */
export const createWikiEventsCache = (options?: {
	maxEntries?: number;
	ttlMs?: number;
	storageKey?: string;
	now?: () => number;
	storage?: () => StorageLike | undefined;
}): WikiCache<WikiEvents> =>
	new WikiCache<WikiEvents>({ schema: WikiEventsSchema, ...options });
