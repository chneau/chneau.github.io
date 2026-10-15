import { z } from "zod";

const WikiPageSchema = z.object({
	title: z.string(),
	url: z.string(),
});

export const WikiEventSchema = z.object({
	pages: z.array(WikiPageSchema).optional(),
	text: z.string(),
	year: z.number(),
});

export type WikiEvent = z.infer<typeof WikiEventSchema>;

export const WikiEventsSchema = z.array(WikiEventSchema).max(50);

export type WikiEvents = z.infer<typeof WikiEventsSchema>;

const MAX_KEY_LENGTH = 32;

export const WIKI_CACHE_MAX_ENTRIES = 64;

export const WIKI_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CLOCK_SKEW_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export const WIKI_CACHE_STORAGE_KEY = "wikiCache";

const STORAGE_VERSION = 1;

const StoredEntrySchema = z.object({
	key: z.string().min(1).max(MAX_KEY_LENGTH),
	storedAt: z.number().finite(),
	value: z.unknown(),
});

const StoredCacheSchema = z.object({
	v: z.literal(STORAGE_VERSION),
	entries: z.array(StoredEntrySchema).max(WIKI_CACHE_MAX_ENTRIES * 2),
});

type StoredEntry = z.infer<typeof StoredEntrySchema>;

type CacheEntry<T> = {
	fingerprint: string;
	storedAt: number;
	value: T;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type WikiCacheOptions<T> = {
	schema: z.ZodType<T>;
	maxEntries?: number;
	ttlMs?: number;
	storageKey?: string;
	now?: () => number;
	storage?: () => StorageLike | undefined;
};

const defaultStorage = (): StorageLike | undefined =>
	typeof localStorage === "undefined" ? undefined : localStorage;

const fingerprintOf = (value: unknown): string => {
	try {
		return JSON.stringify(value) ?? "undefined";
	} catch {
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

class WikiCache<T> {
	readonly #entries = new Map<string, CacheEntry<T>>();
	readonly #inFlight = new Map<string, Promise<T>>();
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
		this.#now = options.now ?? (() => Date.now());
		this.#storage = options.storage ?? defaultStorage;
		this.#hydrate();
	}

	get size(): number {
		return this.#entries.size;
	}

	keys(): string[] {
		return [...this.#entries.keys()];
	}

	snapshot(): Record<string, T> {
		const out: Record<string, T> = {};
		for (const [key, entry] of this.#entries) out[key] = entry.value;
		return out;
	}

	get(key: string): T | undefined {
		const entry = this.#entries.get(key);
		if (entry === undefined || !this.#isFresh(entry)) return undefined;
		return entry.value;
	}

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

	#admit(key: string, raw: unknown): void {
		const existing = this.#entries.get(key);
		if (existing !== undefined && existing.fingerprint === fingerprintOf(raw)) {
			if (this.#isFresh(existing)) {
				this.#promote(key, existing);
				return;
			}
			this.#entries.delete(key);
			return;
		}
		if (this.set(key, raw) === undefined) {
			this.#rejected.add(key);
		}
	}

	load(key: string, fetcher: () => Promise<T>): Promise<T> {
		const hit = this.get(key);
		if (hit !== undefined) {
			this.#promote(key, this.#entries.get(key));
			return Promise.resolve(hit);
		}
		const pending = this.#inFlight.get(key);
		if (pending !== undefined) return pending;

		const request = (async () => {
			const raw: unknown = await fetcher();
			const stored = this.set(key, raw);
			if (stored === undefined) {
				throw new Error(
					`onthisday: rejected the payload for "${key}"; it was not cached`,
				);
			}
			this.#promote(key, this.#entries.get(key));
			return stored;
		})();

		this.#inFlight.set(key, request);
		const settle = () => {
			if (this.#inFlight.get(key) === request) this.#inFlight.delete(key);
		};
		request.then(settle, settle);
		return request;
	}

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

	sync(mirror: Record<string, unknown>): Record<string, T | undefined> {
		for (const key of Object.keys(mirror)) this.#admit(key, mirror[key]);
		this.sweep();

		const live = new Set(this.#entries.keys());
		const corrections: Record<string, T | undefined> = {};
		for (const key of Object.keys(mirror)) {
			if (this.#rejected.has(key)) {
				corrections[key] = live.has(key)
					? this.#entries.get(key)?.value
					: undefined;
				continue;
			}
			if (!live.has(key)) corrections[key] = undefined;
		}
		this.#rejected.clear();
		return corrections;
	}

	clear(): void {
		this.#entries.clear();
		this.#persist();
	}

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

		const ordered = [...stored].sort((a, b) => a.storedAt - b.storedAt);
		let dropped = 0;
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

export const createWikiEventsCache = (options?: {
	maxEntries?: number;
	ttlMs?: number;
	storageKey?: string;
	now?: () => number;
	storage?: () => StorageLike | undefined;
}): WikiCache<WikiEvents> =>
	new WikiCache<WikiEvents>({ schema: WikiEventsSchema, ...options });
