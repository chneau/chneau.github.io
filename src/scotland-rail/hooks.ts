import { useCallback, useState, useSyncExternalStore } from "react";
import { type Snapshot, snapshot, subscribe } from "valtio";

const DEFAULT_INTERVAL_MS = 66;

/**
 * Snapshot every store into a fresh bundle. Module-level so neither the initial
 * build nor a later publish has to close over a function defined in render —
 * that closure would otherwise be an invisible dependency of the memoised
 * subscription.
 */
const buildBundle = <S extends readonly object[]>(stores: S) =>
	stores.map((store) => snapshot(store)) as unknown as {
		[K in keyof S]: Snapshot<S[K]>;
	};

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
 * The published bundle is a cached `snapshot()` held in a mutable cell created by
 * a `useState` lazy initializer, so `getSnapshot` is referentially stable between
 * publishes. That matters: handing React a fresh object on every store mutation
 * would re-introduce the 60 Hz render cascade via `useSyncExternalStore`'s tearing
 * check.
 *
 * Publish cadence: the first change paints immediately (so a play/pause click
 * never waits), then updates are capped to one per interval with a trailing
 * update for the final state.
 */
export const useThrottledSnapshots = <S extends readonly object[]>(
	stores: S,
	intervalMs = DEFAULT_INTERVAL_MS,
): { [K in keyof S]: Snapshot<S[K]> } => {
	// The first bundle must exist *before* the first `getSnapshot` call — React
	// calls it during the initial render, so an effect would be too late and
	// `getSnapshot` would return nothing to compare against. A `useState` lazy
	// initializer gives us that eagerly-computed value from a render-safe place
	// (no ref written during render), while the holder stays mutable so a
	// publish can swap the bundle without re-rendering the hook itself.
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
		// `cache` is declared because the subscriber writes through it, and the
		// invariant that makes this subscription survivable is exactly that it
		// never changes identity: it is the object returned by a `useState`
		// lazy initialiser and nothing ever calls the setter, so listing it
		// here cannot re-subscribe. `getSnapshot` already depended on it for the
		// same reason; declaring it here says the same thing about the write
		// side rather than leaving it implied.
		[cache, stores, intervalMs],
	);

	return useSyncExternalStore(subscribeThrottled, getSnapshot, getSnapshot);
};
