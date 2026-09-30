import { useCallback, useRef, useSyncExternalStore } from "react";
import { type Snapshot, snapshot, subscribe } from "valtio";

const DEFAULT_INTERVAL_MS = 66;

/**
 * A throttled, UI-facing replacement for Valtio's `useSnapshot`.
 *
 * The replay clock mutates `railStore.timeOffset` / `derivedStore.activeTrains`
 * on every animation frame (~60 Hz). Reading those with `useSnapshot` forces the
 * whole React tree to re-render at that cadence even though nothing the eye can
 * resolve changes that fast. This hook keeps the *canvas* driving at 60 fps
 * (it still uses raw `useSnapshot`) while every HUD surface re-renders at most
 * once per `intervalMs`.
 *
 * Several stores can be passed at once so a component that reads both the rail
 * store and the derived store still gets a single publish per interval rather
 * than two independent ones. Pass a module-level array (stable identity) as the
 * argument so the subscription is not torn down on every render.
 *
 * The published bundle is a cached `snapshot()` held in a ref, so `getSnapshot`
 * is referentially stable between publishes. That matters: handing React a fresh
 * object on every store mutation would re-introduce the 60 Hz render cascade via
 * `useSyncExternalStore`'s tearing check.
 *
 * Publish cadence: the first change paints immediately (so a play/pause click
 * never waits), then updates are capped to one per interval with a trailing
 * update for the final state.
 */
export const useThrottledSnapshots = <S extends readonly object[]>(
	stores: S,
	intervalMs = DEFAULT_INTERVAL_MS,
): { [K in keyof S]: Snapshot<S[K]> } => {
	type Bundle = { [K in keyof S]: Snapshot<S[K]> };

	const cacheRef = useRef<Bundle | null>(null);
	if (cacheRef.current === null) {
		cacheRef.current = stores.map((store) =>
			snapshot(store),
		) as unknown as Bundle;
	}

	const getSnapshot = useCallback(() => cacheRef.current as Bundle, []);

	const subscribeThrottled = useCallback(
		(onStoreChange: () => void) => {
			let timeout: ReturnType<typeof setTimeout> | null = null;
			let nextAllowedAt = 0;

			const publish = () => {
				cacheRef.current = stores.map((store) =>
					snapshot(store),
				) as unknown as Bundle;
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
		[stores, intervalMs],
	);

	return useSyncExternalStore(subscribeThrottled, getSnapshot, getSnapshot);
};
