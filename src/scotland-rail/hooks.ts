import { useCallback, useState, useSyncExternalStore } from "react";
import { type Snapshot, snapshot, subscribe } from "valtio";

const DEFAULT_INTERVAL_MS = 66;

const buildBundle = <S extends readonly object[]>(stores: S) =>
	stores.map((store) => snapshot(store)) as unknown as {
		[K in keyof S]: Snapshot<S[K]>;
	};

export const useThrottledSnapshots = <S extends readonly object[]>(
	stores: S,
	intervalMs = DEFAULT_INTERVAL_MS,
): { [K in keyof S]: Snapshot<S[K]> } => {
	const [cache] = useState(() => ({ current: buildBundle(stores) }));

	const getSnapshot = useCallback(() => cache.current, [cache]);

	const subscribeThrottled = useCallback(
		(onStoreChange: () => void) => {
			let timeout: ReturnType<typeof setTimeout> | null = null;
			let nextAllowedAt = 0;

			const publish = () => {
				cache.current = buildBundle(stores);
				onStoreChange();
			};

			const onStoreMutation = () => {
				if (timeout !== null) return;
				const now = performance.now();
				const wait = Math.max(0, nextAllowedAt - now);
				if (wait === 0) {
					nextAllowedAt = now + intervalMs;
					publish();
					return;
				}
				timeout = setTimeout(() => {
					timeout = null;
					nextAllowedAt = performance.now() + intervalMs;
					publish();
				}, wait);
			};

			const unsubscribes = stores.map((store) =>
				subscribe(store, onStoreMutation),
			);
			return () => {
				if (timeout !== null) clearTimeout(timeout);
				for (const unsubscribe of unsubscribes) unsubscribe();
			};
		},
		[cache, stores, intervalMs],
	);

	return useSyncExternalStore(subscribeThrottled, getSnapshot, getSnapshot);
};
