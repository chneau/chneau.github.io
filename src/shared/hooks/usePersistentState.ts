import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * A tiny persistent-state layer shared by every app.
 *
 * Values live in `localStorage`, are cached in a module-level store so
 * components reading the same key share one snapshot, and stay in sync across
 * tabs through the `storage` event. Reads are safe during SSR and when storage
 * is blocked (private mode, sandboxed iframes): we fall back to memory.
 */

/** Marks a store that has never been read from disk yet. */
const UNINITIALIZED = Symbol("uninitialized");

export type PersistOptions<T> = {
	/** Encode a value for storage. Defaults to `JSON.stringify`. */
	serialize?: (value: T) => string;
	/** Decode a stored value. Defaults to `JSON.parse`. */
	deserialize?: (raw: string) => T;
};

type Store = {
	value: unknown;
	options?: PersistOptions<unknown>;
	listeners: Set<() => void>;
};

const stores = new Map<string, Store>();

const getStore = (key: string): Store => {
	let store = stores.get(key);
	if (!store) {
		store = { value: UNINITIALIZED, listeners: new Set() };
		stores.set(key, store);
	}
	return store;
};

/**
 * The raw storage handle, or `undefined` when there is no DOM or the browser
 * refuses to hand one over (sandboxed iframes, blocked third-party storage).
 * Touching the property itself can throw, hence the try.
 */
const storage = (): Storage | undefined => {
	try {
		return typeof window === "undefined" ? undefined : window.localStorage;
	} catch {
		return undefined;
	}
};

/**
 * `getItem` is itself allowed to throw — a browser that exposes
 * `window.localStorage` can still reject reads when storage is disabled or the
 * origin is opaque. Treat any failure as "nothing stored" and fall back to
 * memory rather than letting it reach a render.
 */
const readItem = (key: string): string | null => {
	try {
		return storage()?.getItem(key) ?? null;
	} catch {
		return null;
	}
};

const serialize = <T>(value: T, options?: PersistOptions<T>): string =>
	options?.serialize ? options.serialize(value) : JSON.stringify(value);

const deserialize = <T>(value: string, options?: PersistOptions<T>): T =>
	options?.deserialize ? options.deserialize(value) : (JSON.parse(value) as T);

const notify = (store: Store) => {
	for (const listener of store.listeners) listener();
};

/** Read a persisted value, initialising the shared cache on first access. */
export const readPersisted = <T>(
	key: string,
	fallback: T,
	options?: PersistOptions<T>,
): T => {
	const store = getStore(key);
	if (store.value === UNINITIALIZED) {
		if (options) store.options = options as PersistOptions<unknown>;
		const raw = readItem(key);
		let value: T = fallback;
		if (raw !== null) {
			try {
				value = deserialize(raw, options);
			} catch {
				// Corrupt entry: keep the fallback rather than throwing.
			}
		}
		store.value = value;
	}
	return store.value as T;
};

/** Persist a value and notify every subscriber (same tab and other tabs). */
export const writePersisted = <T>(
	key: string,
	value: T,
	options?: PersistOptions<T>,
): void => {
	const store = getStore(key);
	if (options) store.options = options as PersistOptions<unknown>;
	store.value = value;
	try {
		storage()?.setItem(key, serialize(value, options));
	} catch {
		// Quota or blocked storage: keep the in-memory value only.
	}
	notify(store);
};

/** Remove a persisted value, resetting readers to their fallback. */
export const removePersisted = (key: string): void => {
	const store = getStore(key);
	store.value = UNINITIALIZED;
	try {
		storage()?.removeItem(key);
	} catch {
		// Ignore.
	}
	notify(store);
};

/** Subscribe to changes of one persisted key. Returns an unsubscribe fn. */
export const subscribePersisted = (
	key: string,
	listener: () => void,
): (() => void) => {
	const store = getStore(key);
	store.listeners.add(listener);
	return () => store.listeners.delete(listener);
};

// Cross-tab sync: another tab writing our key refreshes the shared cache.
if (typeof window !== "undefined") {
	window.addEventListener("storage", (event) => {
		if (event.key == null) return;
		const store = stores.get(event.key);
		if (!store) return;
		let value: unknown =
			event.newValue == null ? UNINITIALIZED : event.newValue;
		if (event.newValue != null) {
			try {
				value = deserialize(
					event.newValue,
					store.options as PersistOptions<unknown> | undefined,
				);
			} catch {
				value = UNINITIALIZED;
			}
		}
		store.value = value;
		notify(store);
	});
}

/**
 * React binding for {@link readPersisted}. Returns the current value and a
 * setter that accepts either a value or an updater function.
 */
export const usePersistentState = <T>(
	key: string,
	fallback: T,
	options?: PersistOptions<T>,
): [T, (value: T | ((previous: T) => T)) => void] => {
	const fallbackRef = useRef(fallback);
	fallbackRef.current = fallback;

	const subscribe = useCallback(
		(listener: () => void) => subscribePersisted(key, listener),
		[key],
	);

	// `options` is expected to be module-stable (a literal or module const).
	const getSnapshot = useCallback(
		() => readPersisted(key, fallbackRef.current, options),
		[key, options],
	);

	const getServerSnapshot = useCallback(() => fallbackRef.current, []);

	const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

	const setValue = useCallback(
		(next: T | ((previous: T) => T)) => {
			const previous = readPersisted(key, fallbackRef.current, options);
			const resolved =
				typeof next === "function" ? (next as (p: T) => T)(previous) : next;
			writePersisted(key, resolved, options);
		},
		[key, options],
	);

	return [value, setValue];
};
