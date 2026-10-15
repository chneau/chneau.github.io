import { useLocalStorage } from "@mantine/hooks";

export type SpoonersSettings = {
	currency: string;
	openNow: boolean;
	hideSpecial: boolean;
	hideClosed: boolean;
	onlyComplete: boolean;
	rankingRows: number;
};

const DEFAULT_SETTINGS: SpoonersSettings = {
	currency: "GBP",
	openNow: false,
	hideSpecial: true,
	hideClosed: true,
	onlyComplete: true,
	rankingRows: 5,
};

export const useSettings = () =>
	useLocalStorage<SpoonersSettings>({
		key: "spooners.settings.v4",
		defaultValue: DEFAULT_SETTINGS,
	});
