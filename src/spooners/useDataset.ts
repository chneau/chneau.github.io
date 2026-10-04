import { useCallback, useEffect, useState } from "react";
import type { SpoonersCache } from "./types";

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
				const data = (await response.json()) as SpoonersCache;
				if (!cancelled) {
					setState({ data, error: null, loading: false });
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
