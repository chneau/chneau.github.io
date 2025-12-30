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

const compute = () => {
	const { search, showBoys, showGirls, showWeddings } = store;
	const lowerSearch = search.toLowerCase();
	dataStore.filtered = birthdays.filter((x) => {
		const matchesSearch =
			x.name.toLowerCase().includes(lowerSearch) ||
			x.sign.toLowerCase().includes(lowerSearch) ||
			x.birthgem.toLowerCase().includes(lowerSearch) ||
			x.birthdayString.includes(lowerSearch) ||
			x.age.toString().includes(lowerSearch) ||
			x.chineseZodiac.toLowerCase().includes(lowerSearch) ||
			x.monthString.toLowerCase().includes(lowerSearch) ||
			x.kind.includes(lowerSearch);

		if (!matchesSearch) return false;

		if (x.kind === "♂️" && !showBoys) return false;
		if (x.kind === "♀️" && !showGirls) return false;
		if (x.kind === "💒" && !showWeddings) return false;

		return true;
	});
};

subscribe(store, compute);
compute();
