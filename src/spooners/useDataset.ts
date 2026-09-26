import { useEffect, useState } from "react";
import type { SpoonersDataset } from "./types";

type DatasetState = {
	data: SpoonersDataset | null;
	error: string | null;
	loading: boolean;
};

/**
 * Loads the generated dataset. It lives next to the page at
 * `/spooners/map-data.json`, so a relative fetch works in dev and on Pages.
 */
export const useDataset = (): DatasetState => {
	const [state, setState] = useState<DatasetState>({
		data: null,
		error: null,
		loading: true,
	});

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			try {
				const response = await fetch("map-data.json");
				if (!response.ok) {
					throw new Error(
						`Could not load the dataset (HTTP ${response.status})`,
					);
				}
				const data = (await response.json()) as SpoonersDataset;
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
