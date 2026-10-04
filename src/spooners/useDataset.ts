import { useCallback, useEffect, useState } from "react";
import { parseSpoonersCache, type SpoonersCache } from "./types";

type CacheState = {
	data: SpoonersCache | null;
	error: string | null;
	loading: boolean;
};

/** `useDataset` state plus a way to retry a failed load. */
type DatasetState = CacheState & { reload: () => void };

/**
 * Loads the deduplicated cache, which sits next to the page at
 * `/spooners/data.json` (copied there by the rsbuild `output.copy` config), so
 * a relative fetch works both in dev and on Pages.
 */
export const useDataset = (): DatasetState => {
	const [state, setState] = useState<CacheState>({
		data: null,
		error: null,
		loading: true,
	});
	const [attempt, setAttempt] = useState(0);

	useEffect(() => {
		let cancelled = false;
		setState((current) => ({ ...current, loading: true, error: null }));

		const load = async () => {
			try {
				const response = await fetch("data.json");
				if (!response.ok) {
					throw new Error(`Could not load the data (HTTP ${response.status})`);
				}
				// Validated at the boundary rather than cast, mirroring
				// `parseRateTable` in this same app: a shape change upstream must
				// surface here, with a message a visitor can act on, rather than as
				// a render error deep inside a component. There is no cached copy to
				// delete on this edge, so the failure is loud by design — `catch`
				// routes it to `setError`, and the app renders its retry screen.
				const cache = parseSpoonersCache(await response.json());
				if (cache === null) {
					throw new Error(
						"The price data is not in the expected format. It may have been regenerated.",
					);
				}
				if (!cancelled) {
					setState({ data: cache, error: null, loading: false });
				}
			} catch (error) {
				if (!cancelled) {
					setState({ data: null, error: String(error), loading: false });
				}
			}
		};

		void load();
		return () => {
			cancelled = true;
		};
		// `attempt` is the retry counter `reload` bumps, so it has to be here or
		// "Try again" re-renders without refetching. The leading underscore this
		// used to carry kept `noUnusedLocals` quiet about a value the effect never
		// read, which is how an inert retry button passed the gate.
	}, [attempt]);

	const reload = useCallback(() => setAttempt((value) => value + 1), []);

	return { ...state, reload };
};
