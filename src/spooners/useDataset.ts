import { useCallback, useEffect, useState } from "react";
import { parseSpoonersCache, type SpoonersCache } from "./types";

type CacheState = {
	data: SpoonersCache | null;
	error: string | null;
	loading: boolean;
};

type DatasetState = CacheState & { reload: () => void };

const describeLoadError = (error: unknown): string => {
	if (error instanceof TypeError) {
		return "Could not reach the data file. Check your connection and try again.";
	}
	if (error instanceof Error) return error.message;
	return "Something went wrong while loading the data. Please try again.";
};

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
					setState({
						data: null,
						error: describeLoadError(error),
						loading: false,
					});
				}
			}
		};

		void load();
		return () => {
			cancelled = true;
		};
	}, [attempt]);

	const reload = useCallback(() => setAttempt((value) => value + 1), []);

	return { ...state, reload };
};
