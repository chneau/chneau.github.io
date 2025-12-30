import Fuse from "fuse.js";
import { proxy, subscribe } from "valtio";
import { type Birthday, birthdays } from "./birthdays";

const getInitialState = () => {
	if (typeof localStorage === "undefined") {
		return {
			search: "",
			showBoys: true,
			showGirls: true,
			showWeddings: false,
			darkMode: true,
		};
	}
	const saved = localStorage.getItem("store");
	return saved
		? JSON.parse(saved)
		: {
				search: "",
				showBoys: true,
				showGirls: true,
				showWeddings: false,
				darkMode: true,
			};
};

export const store = proxy(getInitialState());

subscribe(store, () => {
	if (typeof localStorage !== "undefined") {
		localStorage.setItem("store", JSON.stringify(store));
	}
});

export const dataStore = proxy<{ filtered: Birthday[] }>({
	filtered: [],
});

const fuse = new Fuse(birthdays, {
	keys: [
		"name",
		"sign",
		"birthgem",
		"birthdayString",
		"age",
		"chineseZodiac",
		"monthString",
		"kind",
		"generation",
		"decade",
	],
	threshold: 0.3,
});

const compute = () => {
	const { search, showBoys, showGirls, showWeddings } = store;
	const lowerSearch = search.toLowerCase().trim();

	let filtered = birthdays;

	if (lowerSearch) {
		filtered = fuse.search(lowerSearch).map((result) => result.item);
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
