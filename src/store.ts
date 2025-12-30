import { proxy } from "valtio";

export const store = proxy({
	search: "",
	showBoys: true,
	showGirls: true,
	showWeddings: false,
});
