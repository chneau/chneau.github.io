import { debounce } from "es-toolkit";
import Fuse from "fuse.js";
import { proxy, subscribe } from "valtio";
import { type Birthday, birthdays } from "./birthdays";

type Store = {
	search: string;
	showBoys: boolean;
	showGirls: boolean;
	showWeddings: boolean;
	darkMode: boolean;
};

const getInitialState = (): Store => {
	const defaults = {
		search: "",
		showBoys: true,
		showGirls: true,
		showWeddings: false,
		darkMode: true,
	};
	if (typeof localStorage === "undefined") {
		return defaults;
	}
	const saved = localStorage.getItem("store");
	return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
};

export const store = proxy(getInitialState());

subscribe(store, () => {
	if (typeof localStorage !== "undefined") {
		localStorage.setItem("store", JSON.stringify(store));
	}
});

export const dataStore = proxy<{ filtered: Birthday[] }>({
	filtered: birthdays.filter((x) => {
		const state = getInitialState();
		if (x.kind === "♂️" && !state.showBoys) return false;
		if (x.kind === "♀️" && !state.showGirls) return false;
		if (x.kind === "💒" && !state.showWeddings) return false;
		return true;
	}),
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
		"kind",
		"generation",
		"decade",
		"ageGroup",
		"element",
		"monthName",
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

subscribe(store, debounce(compute, 200));
compute();
