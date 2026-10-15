import { useCallback, useState, useSyncExternalStore } from "react";

const UNINITIALIZED = Symbol("uninitialized");

export type PersistOptions<T> = {
	serialize?: (value: T) => string;
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

export const storage = (): Storage | undefined => {
	try {
		return typeof window === "undefined" ? undefined : window.localStorage;
	} catch {
		return undefined;
	}
};

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
			} catch {}
		}
		store.value = value;
	}
	return store.value as T;
};

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
	} catch {}
	notify(store);
};

export const removePersisted = (key: string): void => {
	const store = getStore(key);
	store.value = UNINITIALIZED;
	try {
		storage()?.removeItem(key);
	} catch {}
	notify(store);
};

export const subscribePersisted = (
	key: string,
	listener: () => void,
): (() => void) => {
	const store = getStore(key);
	store.listeners.add(listener);
	return () => store.listeners.delete(listener);
};

if (typeof window !== "undefined") {
	window.addEventListener("storage", (event) => {
		if (event.key == null) {
			if (event.key !== null) return;
			for (const store of stores.values()) {
				store.value = UNINITIALIZED;
				for (const listener of store.listeners) listener();
			}
			return;
		}
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

export const usePersistentState = <T>(
	key: string,
	fallback: T,
	options?: PersistOptions<T>,
): [T, (value: T | ((previous: T) => T)) => void] => {
	const [stableFallback] = useState(fallback);

	const subscribe = useCallback(
		(listener: () => void) => subscribePersisted(key, listener),
		[key],
	);

	const getSnapshot = useCallback(
		() => readPersisted(key, stableFallback, options),
		[key, stableFallback, options],
	);

	const getServerSnapshot = useCallback(() => stableFallback, [stableFallback]);

	const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

	const setValue = useCallback(
		(next: T | ((previous: T) => T)) => {
			const previous = readPersisted(key, stableFallback, options);
			const resolved =
				typeof next === "function" ? (next as (p: T) => T)(previous) : next;
			writePersisted(key, resolved, options);
		},
		[key, stableFallback, options],
	);

	return [value, setValue];
};
