import { useEffect, useState } from "react";
import type { SpoonersCache } from "./types";

type CacheState = {
	data: SpoonersCache | null;
	error: string | null;
	loading: boolean;
};

/**
 * Loads the deduplicated cache, which sits next to the page at
 * `/spooners/data.json` (copied there by the rsbuild `output.copy` config), so
 * a relative fetch works both in dev and on Pages.
 */
export const useDataset = (): CacheState => {
	const [state, setState] = useState<CacheState>({
		data: null,
		error: null,
		loading: true,
	});

	useEffect(() => {
		let cancelled = false;

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
	}, []);

	return state;
};
