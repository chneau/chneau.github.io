import Fuse from "fuse.js";
import { proxy, subscribe } from "valtio";
import { type Birthday, birthdays } from "./birthdays";

interface Store {
	search: string;
	showBoys: boolean;
	showGirls: boolean;
	showWeddings: boolean;
	darkMode: boolean;
	installPrompt: BeforeInstallPromptEvent | null;
}

export interface BeforeInstallPromptEvent extends Event {
	readonly platforms: string[];
	readonly userChoice: Promise<{
		outcome: "accepted" | "dismissed";
		platform: string;
	}>;
	prompt(): Promise<void>;
}

const getInitialState = (): Store => {
	const defaults = {
		search: "",
		showBoys: true,
		showGirls: true,
		showWeddings: false,
		darkMode: true,
		installPrompt: null,
	};
	if (typeof localStorage === "undefined") {
		return defaults;
	}
	const saved = localStorage.getItem("store");
	return saved
		? { ...defaults, ...JSON.parse(saved), installPrompt: null }
		: defaults;
};

export const store = proxy(getInitialState());

subscribe(store, () => {
	if (typeof localStorage !== "undefined") {
		const { installPrompt, ...rest } = store;
		localStorage.setItem("store", JSON.stringify(rest));
	}
});

export const dataStore = proxy<{ filtered: Birthday[] }>({
	filtered: [],
});

const fuse = new Fuse(birthdays, {
	keys: [
		"name",
		"sign",
		"signSymbol",
		"birthgem",
		"birthdayString",
		"age",
		"chineseZodiac",
		"monthString",
		"kind",
		"generation",
		"decade",
		"ageGroup",
		"element",
		"traits",
		"compatible",
	],
	threshold: 0.4,
	ignoreLocation: true,
	useExtendedSearch: true,
});

const compute = () => {
	const { search, showBoys, showGirls, showWeddings } = store;
	const trimmedSearch = search.trim();

	let filtered = birthdays;

	if (trimmedSearch) {
		filtered = fuse.search(trimmedSearch).map((result) => result.item);
	}

	dataStore.filtered = filtered.filter((x) => {
		if (x.kind === "♂️" && !showBoys) return false;
		if (x.kind === "♀️" && !showGirls) return false;
		if (x.kind === "💒" && !showWeddings) return false;
		return true;
	});
};

subscribe(store, compute);
compute();
