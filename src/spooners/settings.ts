import { useLocalStorage } from "@mantine/hooks";

export type SpoonersSettings = {
	/** "native" keeps each pub's own currency; otherwise an ISO code to convert into. */
	currency: string;
	/** Start with the "open now" filter on. */
	openNow: boolean;
	/** Hide airports, havens, hotels and other special venues. */
	hideSpecial: boolean;
	/** Hide pubs that are temporarily closed or not open yet. */
	hideClosed: boolean;
	/** How many venues each ranking list shows. */
	rankingRows: number;
};

const DEFAULT_SETTINGS: SpoonersSettings = {
	currency: "GBP",
	openNow: false,
	hideSpecial: false,
	hideClosed: false,
	rankingRows: 5,
};

/** Persisted in localStorage. */
export const useSettings = () =>
	useLocalStorage<SpoonersSettings>({
		key: "spooners.settings.v2",
		defaultValue: DEFAULT_SETTINGS,
	});
