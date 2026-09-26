import { useLocalStorage } from "@mantine/hooks";

export type SpoonersSettings = {
	/** "native" keeps each pub's own currency; otherwise an ISO code to convert into. */
	currency: string;
	/** Start with the "open now" filter on. */
	openNow: boolean;
	/** How many venues each ranking list shows. */
	rankingRows: number;
};

const DEFAULT_SETTINGS: SpoonersSettings = {
	currency: "GBP",
	openNow: false,
	rankingRows: 5,
};

/** Persisted in localStorage. */
export const useSettings = () =>
	useLocalStorage<SpoonersSettings>({
		key: "spooners.settings.v2",
		defaultValue: DEFAULT_SETTINGS,
	});
