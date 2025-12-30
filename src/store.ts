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
	dataStore.filtered = birthdays.filter((x) => {
		const matchesSearch =
			x.name.toLowerCase().includes(search) ||
			x.sign.toLowerCase().includes(search) ||
			x.birthgem.toLowerCase().includes(search);

		if (!matchesSearch) return false;

		if (x.kind === "♂️" && !showBoys) return false;
		if (x.kind === "♀️" && !showGirls) return false;
		if (x.kind === "💒" && !showWeddings) return false;

		return true;
	});
};

subscribe(store, compute);
compute();
